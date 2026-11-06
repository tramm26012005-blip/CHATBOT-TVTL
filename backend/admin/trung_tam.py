"""Operational admin pages. Financial records currently represent demo payments only."""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.config import settings
from app.db import Audit, Booking, Content, PrivateRecord, User, PlanUsage, ConsultationLedger, db_session, now
from app.security import admin_user, decrypt
from app.admin_settings import KEY, operating_settings
from student.goi_thanh_vien import VN

router = APIRouter(prefix='/api/admin')


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def payment_rows(db):
    from app.consultations import sync_all
    sync_all(db)
    names = {user.id: user.name for user in db.scalars(select(User)).all()}
    rows = []
    for row in db.scalars(select(Audit).where(Audit.action.like('membership:demo:%'))).all():
        rows.append({'id': 'vip:' + row.id, 'user': names.get(row.actor, 'Tài khoản đã xóa'), 'service': 'VIP', 'amount': 300000, 'created': utc(row.created).isoformat(), 'demo': True, 'status': 'success'})
    for entry in db.scalars(select(ConsultationLedger)).all():
        data = decrypt(entry.encrypted_payload)
        if not data['paid']:
            continue
        row = db.get(Booking, entry.booking_id)
        status = 'refunded' if data['settlement'] == 'refunded' else 'refund_requested' if data.get('refund_request', {}).get('status') == 'pending' else 'held' if data['settlement'] == 'held' else 'success'
        rows.append({'id': 'booking:' + entry.booking_id, 'user': names.get(entry.user_id, 'Tài khoản đã xóa'), 'service': 'Tư vấn', 'amount': data['amount'], 'created': utc(row.created).isoformat() if row else data.get('allocated_at', now().isoformat()), 'demo': True, 'status': status, 'settlement': data['settlement'], 'expert_share': data['amount'] * 80 // 100, 'admin_share': data['amount'] - data['amount'] * 80 // 100})
    decisions = {data['payment_id']: data for row in db.scalars(select(Content).where(Content.kind == 'internal_payment')).all() if (data := json.loads(row.payload)).get('payment_id')}
    for row in rows:
        if row['service'] == 'Tư vấn':
            continue
        decision = decisions.get(row['id'], {})
        row['status'] = decision.get('status', 'success')
        row['note'] = decision.get('note', '')
    return sorted(rows, key=lambda row: row['created'], reverse=True)


def metrics(db, current):
    today = current.astimezone(VN).date()
    rows = payment_rows(db)
    retained = [row for row in rows if row['status'] != 'refunded' and row.get('settlement', 'allocated') == 'allocated']
    months = []
    for offset in range(5, -1, -1):
        index = today.year * 12 + today.month - 1 - offset
        year, month = divmod(index, 12)
        key = f'{year:04d}-{month+1:02d}'
        matches = [row for row in retained if datetime.fromisoformat(row['created']).astimezone(VN).strftime('%Y-%m') == key]
        months.append({'month': key, 'vip': sum(row['amount'] for row in matches if row['service'] == 'VIP'), 'consultation': sum(row['admin_share'] for row in matches if row['service'] == 'Tư vấn')})
    conversations = db.scalars(select(PrivateRecord).where(PrivateRecord.kind == 'conversation')).all()
    assessments = db.scalars(select(PrivateRecord).where(PrivateRecord.kind == 'assessment')).all()
    def current_week(items):
        return sum(today - timedelta(days=6) <= utc(row.created).astimezone(VN).date() <= today for row in items)
    series = []
    for offset in range(6, -1, -1):
        day = today - timedelta(days=offset)
        series.append({'day': day.isoformat(), 'conversations': sum(utc(row.created).astimezone(VN).date() == day for row in conversations)})
    return {'conversations': {'total': len(conversations), 'week': current_week(conversations)}, 'assessments': {'total': len(assessments), 'week': current_week(assessments)},
            'conversation_series': series, 'topic_distribution': [], 'topic_note': 'Chưa thu thập chủ đề có sự đồng ý để thống kê. Không đọc nội dung trò chuyện để tạo thống kê.',
            'finance': {'demo': True, 'real_total': None, 'total': sum(row['amount'] if row['service'] == 'VIP' else row['admin_share'] for row in retained), 'vip': sum(row['amount'] for row in retained if row['service'] == 'VIP'), 'consultation': sum(row['expert_share'] for row in retained if row['service'] == 'Tư vấn'), 'admin_commission': sum(row['admin_share'] for row in retained if row['service'] == 'Tư vấn'), 'held': sum(row['amount'] for row in rows if row.get('settlement') == 'held'), 'pending': sum(row.get('settlement') == 'held' for row in rows), 'refund_requests': sum(row['status'] == 'refund_requested' for row in rows), 'refunded': sum(row['amount'] for row in rows if row['status'] == 'refunded'), 'months': months, 'recent': rows[:5]},
            'measurement_note': 'Chỉ thống kê cuộc trò chuyện và bài test được sinh viên đồng ý lưu. Không phải tổng số phiên đã sử dụng.'}


@router.get('/payments')
def payments(user: User = Depends(admin_user), db: Session = Depends(db_session)):
    return payment_rows(db)


class PaymentUpdate(BaseModel):
    status: Literal['refund_requested', 'refunded']
    note: str = Field(default='', max_length=500)


@router.patch('/payments/{payment_id:path}')
def payment_action(payment_id: str, body: PaymentUpdate, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    if payment_id.startswith('booking:'):
        raise HTTPException(409, 'Xử lý yêu cầu tư vấn trong mục Giữ tiền và xét duyệt; không đổi trạng thái trực tiếp.')
    key = 'pay-' + hashlib.sha256(payment_id.encode()).hexdigest()[:32]
    # Lock existing source records too, to serialize the first disposition.
    source_type, _, source_id = payment_id.partition(':')
    if source_type not in ('vip', 'booking'):
        raise HTTPException(404, 'Không tìm thấy giao dịch.')
    model = Audit if source_type == 'vip' else Booking
    db.scalar(select(model).where(model.id == source_id).with_for_update())
    payment = next((row for row in payment_rows(db) if row['id'] == payment_id), None)
    if not payment:
        raise HTTPException(404, 'Không tìm thấy giao dịch.')
    if body.status not in {'success': ['refund_requested'], 'refund_requested': ['refunded']}.get(payment['status'], []):
        raise HTTPException(409, 'Chuyển trạng thái hoàn tiền không hợp lệ.')
    row = db.get(Content, key)
    if not row:
        row = Content(id=key, kind='internal_payment', published=False)
        db.add(row)
    row.payload = json.dumps({'payment_id': payment_id, 'status': body.status, 'note': body.note.strip()}, ensure_ascii=False)
    db.add(Audit(actor=user.id, action=f'payment_demo:{source_id}:{body.status}'))
    db.commit()
    return {'ok': True, 'demo': True}


@router.get('/conversations')
def conversations(user: User = Depends(admin_user), db: Session = Depends(db_session)):
    # Deliberately do not decrypt chat messages or titles.
    return [{'id': row.id, 'created': row.created.isoformat(), 'status': 'Đã lưu theo sự đồng ý'} for row in db.scalars(select(PrivateRecord).where(PrivateRecord.kind == 'conversation').order_by(PrivateRecord.created.desc())).all()]


@router.get('/assessments')
def assessment_info(user: User = Depends(admin_user), db: Session = Depends(db_session)):
    from student.api_khach_hang import assessment_verified
    stored = db.get(Content, 'admin-assessment-draft')
    definition = json.loads(stored.payload) if stored else json.loads((Path(__file__).resolve().parents[2] / 'data/assessments/beck-user-supplied.draft.json').read_text(encoding='utf-8-sig'))
    return {'definition': definition, 'verified': assessment_verified(definition), 'records': [{'id': row.id, 'created': row.created.isoformat()} for row in db.scalars(select(PrivateRecord).where(PrivateRecord.kind == 'assessment').order_by(PrivateRecord.created.desc())).all()]}


class AssessmentEdit(BaseModel):
    question_id: int = Field(ge=1, le=21)
    options: list[str] = Field(min_length=4, max_length=4)


@router.put('/assessments')
def edit_assessment(body: AssessmentEdit, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    if body.question_id == 9:
        raise HTTPException(422, 'Câu kiểm tra an toàn được giữ nguyên, không sửa tại đây.')
    if any(not text.strip() or len(text) > 2000 for text in body.options):
        raise HTTPException(422, 'Mỗi đáp án cần từ 1 đến 2000 ký tự.')
    # Only wording is editable. Point values, scoring bands and safety routing remain fixed.
    definition = assessment_info(user, db)['definition']
    item = next((row for row in definition['items'] if row['id'] == body.question_id), None)
    if not item:
        raise HTTPException(404, 'Không tìm thấy câu hỏi.')
    for option, text in zip(item['options'], body.options):
        option['text'] = text.strip()
    definition.update(rights_verified=False, clinical_reviewed=False, published=False, status='draft_not_for_clinical_use')
    row = db.get(Content, 'admin-assessment-draft')
    if not row:
        row = Content(id='admin-assessment-draft', kind='internal_assessment', published=False)
        db.add(row)
    row.payload = json.dumps(definition, ensure_ascii=False)
    db.add(Audit(actor=user.id, action=f'assessment:wording:{body.question_id}:draft'))
    db.commit()
    return {'ok': True}


@router.get('/search')
def admin_search(q: str = Query(min_length=1, max_length=100), user: User = Depends(admin_user), db: Session = Depends(db_session)):
    query = q.strip().casefold()
    if not query:
        return []
    results = []
    for row in db.scalars(select(User).where(User.role == 'student')).all():
        if query in f'{row.name} {row.email}'.casefold():
            results.append({'id': row.id, 'section': 'users', 'title': row.name, 'subtitle': row.email})
    for row in db.scalars(select(Content).where(Content.kind == 'experts')).all():
        profile = json.loads(row.payload)
        if query in f"{profile.get('name', '')} {profile.get('specialty', '')}".casefold():
            results.append({'id': row.id, 'section': 'experts', 'title': profile.get('name', ''), 'subtitle': profile.get('specialty', '')})
    names = {row.id: row.name for row in db.scalars(select(User)).all()}
    for row in db.scalars(select(Booking)).all():
        if query in f"{row.id} {names.get(row.user_id, '')} {row.starts_at}".casefold():
            results.append({'id': row.id, 'section': 'bookings', 'title': names.get(row.user_id, 'Lịch hẹn'), 'subtitle': row.starts_at})
    for row in payment_rows(db):
        if query in f"{row['id']} {row['user']} {row['service']}".casefold():
            results.append({'id': row['id'], 'section': 'payments', 'title': row['user'], 'subtitle': f"{row['service']} · {row['amount']}đ · Mô phỏng"})
    return results[:30]


class OperatingUpdate(BaseModel):
    membership_demo_enabled: bool
    daily_ai_request_limit: int = Field(ge=1, le=10000)
    daily_service_request_limit: int = Field(ge=1, le=1000000)


@router.get('/system')
def system_info(user: User = Depends(admin_user), db: Session = Depends(db_session)):
    cfg = settings()
    return {'operating': operating_settings(db), 'chat_configured': bool(cfg.openai_api_key and cfg.openai_chat_model), 'voice_configured': bool(cfg.openai_api_key and cfg.openai_transcribe_model and cfg.openai_tts_model), 'database': 'connected', 'book_knowledge_enabled': cfg.book_knowledge_enabled, 'note': 'Chỉ kiểm tra cấu hình; không gọi API trả phí, không xác nhận số dư hay tình trạng của nhà cung cấp.'}


@router.put('/system')
def system_update(body: OperatingUpdate, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    row = db.get(Content, KEY)
    if not row:
        row = Content(id=KEY, kind='internal_settings', published=False)
        db.add(row)
    row.payload = body.model_dump_json()
    db.add(Audit(actor=user.id, action='settings:operating:updated'))
    db.commit()
    return {'ok': True}


@router.get('/packages')
def packages(user: User = Depends(admin_user), db: Session = Depends(db_session)):
    return [{'name': 'Gói thường', 'price': 0, 'duration': 'Mỗi ngày', 'questions': 20, 'seconds': 600}, {'name': 'VIP', 'price': 300000, 'duration': '30 ngày', 'questions': 200, 'seconds': None}]


@router.get('/reports')
def reports(user: User = Depends(admin_user), db: Session = Depends(db_session)):
    return metrics(db, now())
