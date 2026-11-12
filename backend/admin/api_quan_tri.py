"""Admin routes under /api/admin: dashboard, students, staff, content, bookings."""
import json
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, delete, func
from sqlalchemy.orm import Session

from app import registration
from .trung_tam import metrics
from app.db import db_session, User, LoginSession, ResetToken, PendingPasswordReset, Content, Booking, HospitalVisit, ExpertNote, ExpertReview, Usage, Audit, now
from app.schemas import ContentWrite, StaffCreate, StaffUpdate, StudentCreate, AdminBookingCreate
from app.security import passwords, admin_user, encrypt, decrypt
from student.goi_thanh_vien import is_vip, VN
from app.dung_chung import purge_user_data, booking_view, change_booking_status

router = APIRouter()


@router.get('/api/admin/overview')
def admin_overview(user: User = Depends(admin_user), db: Session = Depends(db_session)):
    users = db.scalar(select(func.count()).select_from(User))
    bookings = db.scalar(select(func.count()).select_from(Booking))
    return {'users': users, 'bookings': bookings, 'private_data_access': False, 'notice': 'Không thống kê cảm xúc hoặc kết quả đánh giá theo nhóm nhỏ.'}


def percent_change(current, previous):
    return round((current - previous) * 100 / previous) if previous else None


@router.get('/api/admin/dashboard')
def admin_dashboard(user: User = Depends(admin_user), db: Session = Depends(db_session)):
    # Aggregate counts only: no conversation content, emotions or assessment results.
    current = now()
    today = current.astimezone(VN).date()
    week = [today - timedelta(days=i) for i in range(6, -1, -1)]
    week_start = week[0]
    users = db.scalars(select(User)).all()
    students = [u for u in users if u.role == 'student']
    joined = lambda u: registration.utc(u.created_at).astimezone(VN).date() if u.created_at else None
    new_by_day: defaultdict[date | None, int] = defaultdict(int)
    for u in students:
        new_by_day[joined(u)] += 1
    students_before = sum(1 for u in students if joined(u) and joined(u) < week_start)
    requests_by_day: dict[str, int] = {day: int(total) for day, total in db.execute(select(Usage.day, func.sum(Usage.requests)).group_by(Usage.day)).all()}
    requests_week = sum(requests_by_day.get(d.isoformat(), 0) for d in week)
    requests_prev = sum(requests_by_day.get((d - timedelta(days=7)).isoformat(), 0) for d in week)
    bookings = db.scalars(select(Booking)).all()
    active = [b for b in bookings if b.status in ('pending', 'confirmed')]
    starts = lambda b: datetime.fromisoformat(b.starts_at)
    on_day = lambda day: sum(1 for b in active if starts(b).astimezone(VN).date() == day)
    upcoming = sorted((b for b in active if starts(b) >= current), key=starts)[:5]
    names = {u.id: u.name for u in users}
    experts = {c.id: json.loads(c.payload).get('name', '') for c in db.scalars(select(Content).where(Content.kind == 'experts')).all()}
    return {
        'management': metrics(db, current),
        'stats': {
            'students': {'total': len(students), 'change': percent_change(len(students), students_before)},
            'experts': {'published': db.scalar(select(func.count()).select_from(Content).where(Content.kind == 'experts', Content.published == True)), 'accounts': sum(1 for u in users if u.role == 'expert')},
            'ai_requests': {'total': sum(requests_by_day.values()), 'week': requests_week, 'change': percent_change(requests_week, requests_prev)},
            'bookings_today': {'total': on_day(today), 'change': percent_change(on_day(today), on_day(today - timedelta(days=1)))},
        },
        'series': [{'day': d.isoformat(), 'new_users': new_by_day[d], 'ai_requests': requests_by_day.get(d.isoformat(), 0)} for d in week],
        'accounts': {'normal': sum(1 for u in students if not is_vip(u)), 'vip': sum(1 for u in students if is_vip(u)), 'expert': sum(1 for u in users if u.role == 'expert'), 'admin': sum(1 for u in users if u.role == 'admin')},
        'recent_users': [{'id': u.id, 'name': u.name, 'email': u.email, 'created_at': u.created_at.isoformat() if u.created_at else None, 'is_active': u.is_active} for u in sorted(students, key=lambda u: registration.utc(u.created_at) if u.created_at else datetime.min.replace(tzinfo=timezone.utc), reverse=True)[:5]],
        'upcoming_bookings': [{'id': b.id, 'starts_at': b.starts_at, 'student_name': names.get(b.user_id, ''), 'expert_name': experts.get(b.expert_id, 'Chuyên gia'), 'status': b.status} for b in upcoming],
        'pending_bookings': sum(1 for b in bookings if b.status == 'pending'),
    }


@router.get('/api/admin/users')
def admin_users(user: User = Depends(admin_user), db: Session = Depends(db_session)):
    customers = db.scalars(select(User).where(User.role == 'student').order_by(User.created_at.asc().nulls_last(), User.id)).all()
    return [{'stt': i, 'id': u.id, 'name': u.name, 'email': u.email, 'password_hash_masked': '•••••••• (Argon2)', 'created_at': u.created_at.isoformat() if u.created_at else None, 'created_at_source': u.created_at_source, 'membership_tier': 'vip' if is_vip(u) else 'normal', 'vip_expires_at': u.vip_expires_at.isoformat() if u.vip_expires_at else None, 'email_verified': u.email_verified_at is not None, 'role': u.role, 'is_active': u.is_active} for i, u in enumerate(customers, 1)]


@router.post('/api/admin/users', status_code=201)
def create_student(body: StudentCreate, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    raise HTTPException(405, 'Tài khoản khách hàng phải được tự đăng ký và xác thực email. Admin không tạo tài khoản khách hàng.')


@router.delete('/api/admin/users/{user_id}')
def delete_student(user_id: str, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    target = db.get(User, user_id)
    if not target or target.role != 'student':
        raise HTTPException(404, 'Không tìm thấy tài khoản sinh viên.')
    # Same cleanup as a student deleting their own account.
    purge_user_data(db, target.id)
    db.execute(delete(Audit).where(Audit.actor == target.id))
    db.delete(target)
    db.add(Audit(actor=user.id, action=f'account:{user_id}:deleted'))
    db.commit()
    return {'ok': True}


class AccountStatus(BaseModel):
    model_config = {'extra': 'forbid'}
    is_active: bool | None = None
    membership_tier: Literal['normal', 'vip'] | None = None
    name: str | None = Field(default=None, min_length=2, max_length=80)


@router.patch('/api/admin/users/{user_id}')
def update_account_status(user_id: str, body: AccountStatus, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, 'Không tìm thấy tài khoản.')
    if target.role != 'student':
        raise HTTPException(409, 'Quản lý tài khoản Admin/Chuyên gia tại mục Tài khoản nhân sự.')
    if body.is_active is None and body.membership_tier is None and body.name is None:
        raise HTTPException(422, 'Chọn trạng thái hoặc hạng tài khoản cần cập nhật.')
    if body.name is not None:
        if len(body.name.strip()) < 2:
            raise HTTPException(422, 'Vui lòng nhập họ tên.')
        target.name = body.name.strip()
        db.add(Audit(actor=user.id, action=f'account:{target.id}:renamed'))
    if body.is_active is not None:
        target.failed_login_attempts = 0
        target.login_locked = False
        target.is_active = body.is_active
        if not body.is_active:
            db.execute(delete(LoginSession).where(LoginSession.user_id == target.id))
            db.execute(delete(ResetToken).where(ResetToken.user_id == target.id))
        db.add(Audit(actor=user.id, action=f'account:{target.id}:active={body.is_active}'))
    if body.membership_tier is not None:
        from datetime import timedelta
        target.membership_tier = body.membership_tier
        target.vip_expires_at = now() + timedelta(days=30) if body.membership_tier == 'vip' else None
        target.membership_demo = False
        db.add(Audit(actor=user.id, action=f'account:{target.id}:tier={body.membership_tier}'))
    db.commit()
    return {'ok': True}


def staff_view(u, db):
    expert = db.get(Content, u.expert_id) if u.expert_id else None
    return {'id': u.id, 'name': u.name, 'email': u.email, 'role': u.role, 'expert_id': u.expert_id, 'expert_name': json.loads(expert.payload).get('name', '') if expert else None, 'is_active': u.is_active, 'created_at': u.created_at.isoformat() if u.created_at else None}


def linkable_expert(db, expert_id, account_id=None):
    if not expert_id:
        raise HTTPException(422, 'Chọn hồ sơ chuyên gia cho tài khoản này.')
    expert = db.get(Content, expert_id)
    if not expert or expert.kind != 'experts':
        raise HTTPException(404, 'Không tìm thấy hồ sơ chuyên gia.')
    owner = db.scalar(select(User).where(User.expert_id == expert_id, User.id != account_id))
    if owner:
        raise HTTPException(409, 'Hồ sơ chuyên gia này đã gắn với tài khoản khác.')
    return expert.id


@router.get('/api/admin/staff')
def admin_staff(user: User = Depends(admin_user), db: Session = Depends(db_session)):
    rows = db.scalars(select(User).where(User.role.in_(('admin', 'expert'))).order_by(User.role, User.created_at.asc().nulls_last(), User.id)).all()
    return [staff_view(u, db) for u in rows]


@router.post('/api/admin/staff', status_code=201)
def create_staff(body: StaffCreate, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    email = str(body.email).lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, 'Email này đã có tài khoản.')
    expert_id = linkable_expert(db, body.expert_id)
    row = User(name=body.name, email=email, password_hash=passwords.hash(body.password), role='expert', expert_id=expert_id, created_at_source='admin', settings_json='{}')
    db.add(row)
    db.flush()
    db.add(Audit(actor=user.id, action=f'staff:create:{row.role}:{row.id}'))
    db.commit()
    return staff_view(row, db)


@router.patch('/api/admin/staff/{user_id}')
def update_staff(user_id: str, body: StaffUpdate, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    target = db.get(User, user_id)
    if not target or target.role not in ('admin', 'expert'):
        raise HTTPException(404, 'Không tìm thấy tài khoản nhân sự.')
    fields = body.model_fields_set
    if not fields:
        raise HTTPException(422, 'Chọn thông tin cần cập nhật.')
    if target.id == user.id and (body.is_active is False or body.password):
        raise HTTPException(409, 'Không tự khóa tài khoản đang dùng. Đổi mật khẩu của bạn tại Cài đặt.')
    if body.name is not None:
        target.name = body.name
        db.add(Audit(actor=user.id, action=f'staff:{target.id}:renamed'))
    if 'expert_id' in fields:
        if target.role != 'expert':
            raise HTTPException(422, 'Chỉ tài khoản chuyên gia mới gắn hồ sơ chuyên gia.')
        target.expert_id = linkable_expert(db, body.expert_id, target.id)
        db.add(Audit(actor=user.id, action=f'staff:{target.id}:expert={target.expert_id}'))
    if body.password:
        target.password_hash = passwords.hash(body.password)
        db.add(Audit(actor=user.id, action=f'staff:{target.id}:password_reset'))
    if body.is_active is not None:
        target.failed_login_attempts = 0
        target.login_locked = False
        target.is_active = body.is_active
        db.add(Audit(actor=user.id, action=f'staff:{target.id}:active={body.is_active}'))
    if body.password or body.is_active is False:
        for model in (LoginSession, ResetToken, PendingPasswordReset):
            db.execute(delete(model).where(model.user_id == target.id))
    db.commit()
    return staff_view(target, db)


@router.delete('/api/admin/staff/{user_id}')
def delete_staff(user_id: str, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    target = db.get(User, user_id)
    if not target or target.role not in ('admin', 'expert'):
        raise HTTPException(404, 'Không tìm thấy tài khoản nhân sự.')
    if target.id == user.id:
        raise HTTPException(409, 'Không thể xóa tài khoản đang dùng.')
    # Audit rows are kept: they record what this staff member did.
    purge_user_data(db, target.id)
    db.delete(target)
    db.add(Audit(actor=user.id, action=f'staff:{user_id}:deleted'))
    db.commit()
    return {'ok': True}


@router.get('/api/admin/content/{kind}')
def admin_content(kind: Literal['experts', 'music', 'support', 'hospitals'], user: User = Depends(admin_user), db: Session = Depends(db_session)):
    # Expert profiles have no email of their own; show the linked login account's.
    accounts = {u.expert_id: u.email for u in db.scalars(select(User).where(User.expert_id.is_not(None))).all()} if kind == 'experts' else {}
    return [{'id': c.id, 'kind': c.kind, 'published': c.published, 'created': c.created.isoformat() if c.created else None, 'account_email': accounts.get(c.id), 'data': json.loads(c.payload)} for c in db.scalars(select(Content).where(Content.kind == kind).order_by(Content.created.asc().nulls_first(), Content.id)).all()]


@router.post('/api/admin/content')
def add_content(body: ContentWrite, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    row = Content(kind=body.kind, payload=json.dumps(body.data, ensure_ascii=False), published=body.published)
    db.add(row)
    db.flush()
    db.add(Audit(actor=user.id, action=f'content:create:{body.kind}:{row.id}'))
    db.commit()
    return {'id': row.id}


@router.put('/api/admin/content/{content_id}')
def edit_content(content_id: str, body: ContentWrite, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    row = db.get(Content, content_id)
    if not row or row.kind != body.kind:
        raise HTTPException(404, 'Không tìm thấy nội dung.')
    row.payload, row.published = json.dumps(body.data, ensure_ascii=False), body.published
    db.add(Audit(actor=user.id, action=f'content:update:{row.kind}:{row.id}'))
    db.commit()
    return {'ok': True}


@router.delete('/api/admin/content/{content_id}')
def delete_content(content_id: str, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    row = db.get(Content, content_id)
    if not row:
        raise HTTPException(404, 'Không tìm thấy nội dung.')
    has_bookings = db.scalar(select(func.count()).select_from(Booking).where(Booking.expert_id == row.id))
    has_account = db.scalar(select(func.count()).select_from(User).where(User.expert_id == row.id))
    has_visits = db.scalar(select(func.count()).select_from(HospitalVisit).where(HospitalVisit.hospital_id == row.id))
    if has_bookings or has_account or has_visits:
        row.published = False
    else:
        db.execute(delete(ExpertReview).where(ExpertReview.expert_id == row.id))
        db.delete(row)
    db.add(Audit(actor=user.id, action=f'content:remove:{content_id}'))
    db.commit()
    return {'ok': True}


@router.get('/api/admin/bookings')
def admin_bookings(user: User = Depends(admin_user), db: Session = Depends(db_session)):
    from app.consultations import sync_all
    sync_all(db)
    names = {u.id: u.name for u in db.scalars(select(User)).all()}
    return [{**booking_view(b, db, True), 'student_name': names.get(b.user_id, 'Tài khoản đã xóa'), 'created': b.created.isoformat() if b.created else None} for b in db.scalars(select(Booking).order_by(Booking.created.desc())).all()]


def aware_start(value):
    if value.tzinfo is None:
        raise HTTPException(422, 'Thời điểm cần kèm múi giờ.')
    return value.isoformat()


@router.post('/api/admin/bookings', status_code=201)
def admin_create_booking(body: AdminBookingCreate, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    student = db.get(User, body.user_id)
    if not student or student.role != 'student':
        raise HTTPException(404, 'Không tìm thấy sinh viên.')
    expert = db.get(Content, body.expert_id)
    if not expert or expert.kind != 'experts':
        raise HTTPException(404, 'Không tìm thấy hồ sơ chuyên gia.')
    from app.availability import require_available
    require_available(db, expert.id, datetime.fromisoformat(aware_start(body.starts_at)))
    row = Booking(user_id=student.id, expert_id=expert.id, starts_at=aware_start(body.starts_at), duration_minutes=body.duration_minutes, mode=body.mode,
                  encrypted_contact=encrypt({'value': body.contact, 'added_by_admin': user.id, 'consented_at': now().isoformat()}),
                  encrypted_details=encrypt({'topic': body.topic}) if body.topic else None)
    db.add(row)
    db.flush()
    db.add(Audit(actor=user.id, action=f'booking:create:{row.id}'))
    db.commit()
    return {'id': row.id}


@router.delete('/api/admin/bookings/{booking_id}')
def admin_delete_booking(booking_id: str, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    row = db.get(Booking, booking_id)
    if not row:
        raise HTTPException(404, 'Không tìm thấy lịch hẹn.')
    from app.consultations import locked
    row, _, data = locked(db, row.id)
    if data['paid']:
        raise HTTPException(409, 'Lịch có giao dịch phải được giữ để đối soát. Hãy từ chối hoặc xử lý hoàn tiền.')
    db.execute(delete(ExpertNote).where(ExpertNote.booking_id == row.id))
    db.delete(row)
    db.add(Audit(actor=user.id, action=f'booking:{booking_id}:deleted'))
    db.commit()
    return {'ok': True}


class BookingUpdate(BaseModel):
    status: Literal['confirmed', 'rejected', 'completed'] | None = None
    confirmation_received: bool = False
    starts_at: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=15, le=30)
    mode: Literal['online', 'offline'] | None = None
    topic: str | None = Field(default=None, max_length=200)


@router.patch('/api/admin/bookings/{booking_id}')
def update_booking(booking_id: str, body: BookingUpdate, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    row = db.get(Booking, booking_id)
    if not row:
        raise HTTPException(404, 'Không tìm thấy lịch hẹn.')
    from app.consultations import locked
    row, _, settlement = locked(db, row.id)
    if body.starts_at is not None and (settlement.get('started_at') or settlement['settlement'] != 'held'):
        raise HTTPException(409, 'Không đổi giờ của lịch đã bắt đầu hoặc đã xử lý tiền.')
    details = body.model_fields_set - {'status', 'confirmation_received'}
    if body.status is None and not details:
        raise HTTPException(422, 'Chọn thông tin cần cập nhật.')
    if body.starts_at is not None:
        if row.status == 'confirmed' and aware_start(body.starts_at) != row.starts_at:
            raise HTTPException(409, 'Lịch đã xác nhận: hãy từ chối và tạo lịch mới nếu cần đổi giờ.')
        if datetime.fromisoformat(row.starts_at) != body.starts_at:
            from app.availability import require_available
            require_available(db, row.expert_id, body.starts_at, exclude=row.id)
        row.starts_at = aware_start(body.starts_at)
    if body.duration_minutes is not None:
        row.duration_minutes = body.duration_minutes
    if 'mode' in details:
        row.mode = body.mode
    if body.topic is not None:
        existing = decrypt(row.encrypted_details) if row.encrypted_details else {}
        existing['topic'] = body.topic.strip()
        row.encrypted_details = encrypt(existing)
    if details:
        db.add(Audit(actor=user.id, action=f'booking:{row.id}:edited'))
    if body.status is not None:
        return change_booking_status(db, row, body.status, user, body.confirmation_received)
    db.commit()
    return {'ok': True}
