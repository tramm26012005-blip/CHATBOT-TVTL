"""Helpers shared by the student, expert and admin routes."""
import json

from fastapi import HTTPException
from sqlalchemy import select, delete, update
from sqlalchemy.exc import IntegrityError

from .config import settings
from .admin_settings import operating_settings
from .db import LoginSession, ResetToken, PendingPasswordReset, PrivateRecord, Content, Booking, HospitalVisit, ExpertNote, ExpertReview, Usage, Audit, ServiceBudget, PlanUsage, now
from .security import decrypt
from student.goi_thanh_vien import is_vip


def public_user(user):
    return {'id': user.id, 'name': user.name, 'email': user.email, 'role': user.role, 'expert_id': user.expert_id, 'membership_tier': 'vip' if is_vip(user) else 'normal', 'vip_expires_at': user.vip_expires_at.isoformat() if user.vip_expires_at else None, 'membership_demo': user.membership_demo, 'created_at': user.created_at.isoformat() if user.created_at else None, 'email_verified': user.email_verified_at is not None, 'settings': json.loads(user.settings_json)}


def preferences(user):
    return json.loads(user.settings_json)


def use_budget(db, user):
    operating = operating_settings(db)
    day = now().date().isoformat()
    row = db.scalar(select(Usage).where(Usage.user_id == user.id, Usage.day == day))
    if row is None:
        row = Usage(user_id=user.id, day=day, requests=0)
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
        row = db.scalar(select(Usage).where(Usage.user_id == user.id, Usage.day == day))
    changed = db.execute(update(Usage).where(Usage.id == row.id, Usage.requests < operating['daily_ai_request_limit']).values(requests=Usage.requests + 1))
    if not changed.rowcount:
        db.rollback()
        raise HTTPException(429, 'Bạn đã dùng hết hạn mức AI hôm nay.')
    service = db.get(ServiceBudget, day)
    if service is None:
        try:
            with db.begin_nested():
                db.add(ServiceBudget(day=day, requests=0))
                db.flush()
        except IntegrityError:
            pass
    reserved = db.execute(update(ServiceBudget).where(ServiceBudget.day == day, ServiceBudget.requests < operating['daily_service_request_limit']).values(requests=ServiceBudget.requests + 1))
    if not reserved.rowcount:
        db.rollback()
        raise HTTPException(429, 'Hệ thống đã đạt hạn mức AI trong ngày. Bạn có thể sử dụng lại sau.')
    db.commit()


def owned_record(db, user, record_id, kind=None):
    row = db.get(PrivateRecord, record_id)
    if not row or row.user_id != user.id or (kind and row.kind != kind):
        raise HTTPException(404, 'Không tìm thấy dữ liệu.')
    return row


def item_view(row):
    data = json.loads(row.payload)
    # Internal verification evidence is not public profile content.
    data.pop('verification_source', None)
    data.pop('rights_note', None)
    return {'id': row.id, 'kind': row.kind, 'published': row.published, **data}


def purge_user_data(db, user_id):
    from .consultations import locked
    for booking_id in db.scalars(select(Booking.id).where(Booking.user_id == user_id)).all():
        _, _, data = locked(db, booking_id)
        if data['paid'] and (data['settlement'] == 'held' or data.get('refund_request', {}).get('status') == 'pending'):
            raise HTTPException(409, 'Cần hủy lịch hoặc xử lý xong giao dịch tư vấn đang giữ / chờ hoàn trước khi xóa tài khoản.')
    # Notes reference bookings, so they go first: notes on this user's bookings and notes they wrote.
    db.execute(delete(ExpertNote).where(ExpertNote.booking_id.in_(select(Booking.id).where(Booking.user_id == user_id))))
    db.execute(delete(ExpertNote).where(ExpertNote.author_id == user_id))
    for model in (HospitalVisit, ExpertReview, PrivateRecord, Booking, Usage, PlanUsage, LoginSession, ResetToken, PendingPasswordReset):
        db.execute(delete(model).where(model.user_id == user_id))


def booking_view(row, db, include_contact=False):
    from .consultations import view
    expert = db.get(Content, row.expert_id)
    result = {'id': row.id, 'expert_id': row.expert_id, 'expert_name': json.loads(expert.payload).get('name', '') if expert else 'Chuyên gia', 'starts_at': row.starts_at, 'status': row.status, 'duration_minutes': row.duration_minutes, 'mode': row.mode}
    if include_contact:
        result['contact'] = decrypt(row.encrypted_contact)
        details = decrypt(row.encrypted_details) if row.encrypted_details else {}
        result['topic'] = details.get('topic', '')
        for key in ('student_name', 'student_email', 'school', 'payment', 'expert_contact', 'fee'):
            if key in details:
                result[key] = details[key]
    result['consultation'] = view(db, row)
    return result


def change_booking_status(db, row, status, actor, verified):
    from .consultations import locked, act, refund, save
    row, ledger, data = locked(db, row.id)
    if status == 'completed':
        if actor.role != 'expert':
            raise HTTPException(409, 'Admin xác nhận buổi qua yêu cầu chờ duyệt tại Quản lý thanh toán.')
        act(db, row, ledger, data, 'complete', actor)
        db.commit()
        return {'ok': True}
    transitions = {'pending': ['confirmed', 'rejected'], 'confirmed': ['completed', 'rejected']}
    if status not in transitions.get(row.status, []):
        raise HTTPException(409, 'Chuyển trạng thái không hợp lệ.')
    if status == 'confirmed':
        if not verified:
            raise HTTPException(422, 'Phải nhận xác nhận thực tế từ chuyên gia trước.')
        db.scalar(select(Content).where(Content.id == row.expert_id).with_for_update())
        conflict = db.scalar(select(Booking).where(Booking.id != row.id, Booking.expert_id == row.expert_id, Booking.starts_at == row.starts_at, Booking.status == 'confirmed'))
        if conflict:
            raise HTTPException(409, 'Khung giờ này đã có lịch được xác nhận.')
    if status == 'rejected' and data.get('started_at'):
        raise HTTPException(409, 'Buổi đã bắt đầu; cần xử lý qua yêu cầu hoàn tiền.')
    row.status = status
    if status == 'rejected':
        refund(db, row, data, now(), 'Chuyên gia từ chối lịch.')
        save(ledger, data)
    db.add(Audit(actor=actor.id, action=f'booking:{row.id}:{status}:verified={verified}'))
    db.commit()
    return {'ok': True}
