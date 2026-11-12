"""Hospital visit requests, separate from expert consultation bookings."""
import json
from datetime import datetime, timedelta
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import Content, HospitalVisit, User, Audit, db_session, now
from app.security import admin_user, encrypt, decrypt
from .goi_thanh_vien import require_vip, vip_action

router = APIRouter()


class VisitInput(BaseModel):
    hospital_id: str
    department: str = Field(min_length=2, max_length=150)
    doctor: str | None = Field(default=None, max_length=150)
    starts_at: datetime
    student_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    phone: str = Field(pattern=r'^\+?[0-9 ().-]{8,20}$')
    school: str = Field(default='', max_length=200)
    description: str = Field(min_length=1, max_length=3000)
    consent: bool


def visit_view(row, db):
    hospital = db.get(Content, row.hospital_id)
    return {'id': row.id, 'hospital_id': row.hospital_id,
            'hospital_name': json.loads(hospital.payload).get('name', '') if hospital else '',
            'starts_at': row.starts_at, 'status': row.status, 'response_note': row.response_note,
            'created': row.created.isoformat(), **decrypt(row.encrypted_payload)}


@router.get('/api/hospitals')
def hospitals(user: User = Depends(require_vip), db: Session = Depends(db_session)):
    result = []
    for row in db.scalars(select(Content).where(Content.kind == 'hospitals', Content.published == True).order_by(Content.created)).all():
        payload = json.loads(row.payload)
        payload.pop('verification_source', None)
        result.append({'id': row.id, **payload})
    return result


@router.post('/api/hospital-visits', status_code=201)
def create_visit(body: VisitInput, user: User = Depends(vip_action), db: Session = Depends(db_session)):
    hospital = db.get(Content, body.hospital_id)
    if not hospital or hospital.kind != 'hospitals' or not hospital.published:
        raise HTTPException(404, 'Bệnh viện chưa được công khai hoặc xác minh.')
    payload = json.loads(hospital.payload)
    department = next((row for row in payload['departments'] if row['name'] == body.department), None)
    if not department or (body.doctor and body.doctor not in department['doctors']):
        raise HTTPException(422, 'Chuyên khoa hoặc bác sĩ không thuộc bệnh viện được chọn.')
    if not body.consent or not body.description.strip() or len(body.student_name.strip()) < 2:
        raise HTTPException(422, 'Cần điền thông tin và đồng ý xử lý đăng ký thăm khám.')
    if body.starts_at.tzinfo is None or not now() < body.starts_at <= now() + timedelta(days=90):
        raise HTTPException(422, 'Chọn ngày giờ có múi giờ, trong 90 ngày tới.')
    private = {'student_name': body.student_name.strip(), 'email': str(body.email), 'phone': body.phone,
               'school': body.school.strip(), 'description': body.description.strip(), 'department': body.department,
               'doctor': body.doctor, 'consented_at': now().isoformat(), 'hospital_address': payload['address'],
               'hospital_phone': payload['phone']}
    row = HospitalVisit(user_id=user.id, hospital_id=hospital.id, starts_at=body.starts_at.isoformat(), encrypted_payload=encrypt(private))
    db.add(row)
    db.commit()
    return visit_view(row, db)


@router.get('/api/hospital-visits')
def my_visits(user: User = Depends(require_vip), db: Session = Depends(db_session)):
    return [visit_view(row, db) for row in db.scalars(select(HospitalVisit).where(HospitalVisit.user_id == user.id).order_by(HospitalVisit.created.desc())).all()]


@router.delete('/api/hospital-visits/{visit_id}')
def cancel_visit(visit_id: str, user: User = Depends(require_vip), db: Session = Depends(db_session)):
    row = db.get(HospitalVisit, visit_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, 'Không tìm thấy yêu cầu thăm khám.')
    if row.status not in ('pending', 'confirmed') or datetime.fromisoformat(row.starts_at) <= now():
        raise HTTPException(409, 'Không thể hủy yêu cầu ở trạng thái này.')
    row.status = 'cancelled'
    db.commit()
    return {'ok': True}


@router.get('/api/admin/hospital-visits')
def all_visits(user: User = Depends(admin_user), db: Session = Depends(db_session)):
    return [visit_view(row, db) for row in db.scalars(select(HospitalVisit).order_by(HospitalVisit.created.desc())).all()]


class VisitUpdate(BaseModel):
    status: Literal['confirmed', 'rejected', 'completed']
    confirmation_received: bool = False
    response_note: str = Field(default='', max_length=1000)


@router.patch('/api/admin/hospital-visits/{visit_id}')
def update_visit(visit_id: str, body: VisitUpdate, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    row = db.scalar(select(HospitalVisit).where(HospitalVisit.id == visit_id).with_for_update())
    if not row:
        raise HTTPException(404, 'Không tìm thấy yêu cầu thăm khám.')
    allowed = {'pending': ('confirmed', 'rejected'), 'confirmed': ('completed', 'rejected')}
    if body.status not in allowed.get(row.status, ()):
        raise HTTPException(409, 'Chuyển trạng thái không hợp lệ.')
    if body.status == 'confirmed' and not body.confirmation_received:
        raise HTTPException(422, 'Chỉ xác nhận sau khi đã nhận xác nhận thực tế từ bệnh viện.')
    row.status = body.status
    row.response_note = body.response_note.strip()
    db.add(Audit(actor=user.id, action=f'hospital_visit:{row.id}:{body.status}:verified={body.confirmation_received}'))
    db.commit()
    return visit_view(row, db)
