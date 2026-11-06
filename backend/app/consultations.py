"""Simulated escrow and consultation clock. All mutations serialize on the booking.

Money is integer VND. Settlement is derived from durable snapshots, never from
mutable profile fees. Refunds reverse both shares, even after a monthly payout.
"""
from datetime import datetime, timedelta, timezone
import hashlib
import json
from fastapi import HTTPException
from sqlalchemy import select
from .db import Booking, ConsultationLedger, ExpertPayout, Content, Audit, now
from .security import encrypt, decrypt


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def instant(value):
    return utc(datetime.fromisoformat(value))


def fail(message):
    raise HTTPException(409, message)


def save(ledger, data):
    ledger.encrypted_payload = encrypt(data)


def ensure_ledger(db, booking):
    ledger = db.get(ConsultationLedger, booking.id, populate_existing=True)
    if ledger:
        return ledger, decrypt(ledger.encrypted_payload)
    details = decrypt(booking.encrypted_details) if booking.encrypted_details else {}
    payment = details.get('payment', {})
    amount = payment.get('amount')
    paid = payment.get('demo') is True and payment.get('status') == 'demo_confirmed' and type(amount) is int and amount >= 0
    data = {'amount': amount if paid else 0, 'paid': paid, 'settlement': 'held', 'phase': 'waiting', 'commission_percent': 20}
    # Historical completed bookings retain their earned balance, without inventing attendance.
    if booking.status == 'completed':
        data.update(phase='completed', settlement='allocated', ended_at=utc(booking.created).isoformat(), allocated_at=utc(booking.created).isoformat(), legacy=True)
    elif booking.status in ('rejected', 'cancelled'):
        data.update(phase='refunded', settlement='refunded', refund_reason='Lịch đã hủy hoặc bị từ chối.')
    # Preserve refunds already processed through the previous payment screen.
    old = db.get(Content, 'pay-' + hashlib.sha256(('booking:' + booking.id).encode()).hexdigest()[:32])
    if old:
        decision = json.loads(old.payload)
        if decision.get('status') == 'refunded':
            data.update(settlement='refunded', refund_reason=decision.get('note', 'Hoàn tiền theo dữ liệu trước đây.'))
        elif decision.get('status') == 'refund_requested':
            data['refund_request'] = {'status': 'pending', 'reason': decision.get('note', 'Yêu cầu từ dữ liệu trước đây.')}
    ledger = ConsultationLedger(booking_id=booking.id, expert_id=booking.expert_id, user_id=booking.user_id, encrypted_payload=encrypt(data))
    db.add(ledger)
    db.flush()
    return ledger, data


def allocate(db, booking, data, current, phase):
    if data['settlement'] != 'held':
        fail('Khoản tiền đã được xử lý.')
    # Same lock as monthly payout, so its snapshot cannot race an allocation.
    db.scalar(select(Content).where(Content.id == booking.expert_id).with_for_update())
    data.update(settlement='allocated', phase=phase, allocated_at=current.isoformat())
    data.setdefault('ended_at', current.isoformat())
    booking.status = 'completed'


def refund(db, booking, data, current, reason):
    db.scalar(select(Content).where(Content.id == booking.expert_id).with_for_update())
    data.update(settlement='refunded', refund_at=current.isoformat(), refund_reason=reason)
    if data.get('refund_request'):
        data['refund_request']['status'] = 'approved'
    if booking.status != 'completed':
        data['phase'] = 'refunded'
        booking.status = 'cancelled' if booking.status != 'rejected' else 'rejected'


def reconcile(db, booking, ledger, data, current):
    start = instant(booking.starts_at)
    if data['settlement'] != 'held' or data['phase'] in ('timed_out', 'completed'):
        return
    if booking.status in ('cancelled', 'rejected'):
        refund(db, booking, data, current, 'Lịch đã hủy hoặc bị từ chối.')
    elif data.get('started_at'):
        end = instant(data['started_at']) + timedelta(minutes=30)
        if current >= end:
            data.update(phase='timed_out', ended_at=end.isoformat())
            booking.status = 'completed'
    elif booking.status == 'pending' and current >= start:
        refund(db, booking, data, current, 'Chuyên gia chưa nhận lịch trước giờ hẹn.')
    elif booking.status == 'confirmed':
        if not data.get('expert_present_at') and current > start + timedelta(minutes=5):
            refund(db, booking, data, current, 'Chuyên gia vắng quá 5 phút.')
        elif current > start + timedelta(minutes=15):
            if not data.get('student_present_at'):
                allocate(db, booking, data, current, 'student_absent')
    save(ledger, data)


def locked(db, booking_id, current=None):
    booking = db.scalar(select(Booking).where(Booking.id == booking_id).with_for_update().execution_options(populate_existing=True))
    if not booking:
        raise HTTPException(404, 'Không tìm thấy lịch hẹn.')
    ledger, data = ensure_ledger(db, booking)
    reconcile(db, booking, ledger, data, utc(current or now()))
    return booking, ledger, data


def sync_all(db):
    for booking_id in db.scalars(select(Booking.id).order_by(Booking.id)).all():
        locked(db, booking_id)
        db.commit()


def view(db, booking):
    ledger, data = ensure_ledger(db, booking)
    result = dict(data)
    result['expert_share'] = data['amount'] * 80 // 100
    result['admin_share'] = data['amount'] - result['expert_share']
    result['server_now'] = now().isoformat()
    result['min_complete_at'] = (instant(data['started_at']) + timedelta(minutes=5)).isoformat() if data.get('started_at') else None
    result['auto_end_at'] = (instant(data['started_at']) + timedelta(minutes=30)).isoformat() if data.get('started_at') else None
    result['refund_deadline'] = (instant(data['ended_at']) + timedelta(days=7)).isoformat() if data.get('ended_at') else None
    return result


def act(db, booking, ledger, data, action, actor, reason='', current=None):
    current = utc(current or now())
    start = instant(booking.starts_at)
    role = actor.role
    if action in ('present', 'start', 'complete'):
        if data['settlement'] != 'held' or data['phase'] not in ('waiting', 'in_progress'):
            fail('Buổi tư vấn đã kết thúc hoặc tiền đã được xử lý.')
    if action == 'present':
        if role not in ('student', 'expert') or booking.status != 'confirmed' or data.get('started_at'):
            fail('Chỉ điểm danh cho lịch đã xác nhận, chưa bắt đầu.')
        deadline = 5 if role == 'expert' else 15
        if not start - timedelta(minutes=15) <= current <= start + timedelta(minutes=deadline):
            fail(f'Điểm danh từ 15 phút trước giờ hẹn đến {deadline} phút sau giờ hẹn.')
        data.setdefault(role + '_present_at', current.isoformat())
    elif action == 'start':
        if role != 'expert' or booking.status != 'confirmed' or data.get('started_at'):
            fail('Không thể bắt đầu buổi tư vấn này.')
        if current < start or not data.get('expert_present_at') or not data.get('student_present_at'):
            fail('Cần đến giờ hẹn và cả hai bên đã xác nhận có mặt.')
        data.update(started_at=current.isoformat(), phase='in_progress')
    elif action == 'complete':
        if role != 'expert' or not data.get('started_at'):
            fail('Chuyên gia cần bắt đầu tư vấn trước.')
        if current < instant(data['started_at']) + timedelta(minutes=5):
            fail('Chỉ được xác nhận đã tư vấn sau ít nhất 5 phút.')
        if current >= instant(data['started_at']) + timedelta(minutes=30):
            fail('Đã hết 30 phút. Hãy gửi yêu cầu Admin xác nhận.')
        allocate(db, booking, data, current, 'completed')
    elif action == 'completion_request':
        if role != 'expert' or data['phase'] != 'timed_out' or data['settlement'] != 'held':
            fail('Chỉ gửi yêu cầu khi buổi tự kết thúc sau 30 phút và tiền còn được giữ.')
        if data.get('completion_request', {}).get('status') in ('pending', 'approved'):
            fail('Yêu cầu đã được gửi.')
        if not reason.strip():
            fail('Vui lòng ghi lý do và thông tin buổi tư vấn.')
        if data.get('completion_request'):
            data.setdefault('request_history', []).append({'type': 'completion', **data['completion_request']})
        data['completion_request'] = {'status': 'pending', 'reason': reason.strip(), 'created': current.isoformat()}
    elif action == 'student_confirm':
        if role != 'student' or data['phase'] not in ('completed', 'timed_out') or data['settlement'] == 'refunded':
            fail('Buổi tư vấn chưa hoàn thành.')
        data.setdefault('student_confirmed_at', current.isoformat())
    elif action == 'refund_request':
        if role != 'student' or data['settlement'] == 'refunded' or data['phase'] == 'student_absent':
            fail('Lịch này không đủ điều kiện yêu cầu hoàn tiền.')
        if current < start:
            fail('Trước giờ hẹn, hãy dùng Hủy lịch để được hoàn tự động.')
        end = instant(data.get('ended_at') or booking.starts_at)
        if current > end + timedelta(days=7):
            fail('Đã hết hạn yêu cầu hoàn tiền 7 ngày.')
        if data.get('refund_request', {}).get('status') in ('pending', 'approved'):
            fail('Yêu cầu hoàn tiền đã được gửi.')
        if not reason.strip():
            fail('Bắt buộc ghi lý do yêu cầu hoàn tiền.')
        if data.get('refund_request'):
            data.setdefault('request_history', []).append({'type': 'refund', **data['refund_request']})
        data['refund_request'] = {'status': 'pending', 'reason': reason.strip(), 'created': current.isoformat()}
    elif action in ('approve_completion', 'reject_completion', 'approve_refund', 'reject_refund'):
        if role != 'admin':
            raise HTTPException(403, 'Chỉ Admin được xét duyệt.')
        key = 'completion_request' if action.endswith('completion') else 'refund_request'
        request = data.get(key, {})
        if request.get('status') != 'pending':
            fail('Không có yêu cầu đang chờ duyệt.')
        if not reason.strip():
            fail('Admin cần ghi lý do quyết định.')
        if action == 'approve_completion':
            if data.get('refund_request', {}).get('status') == 'pending':
                fail('Cần xử lý yêu cầu hoàn tiền trước khi ghi nhận thu nhập.')
            allocate(db, booking, data, current, 'completed')
        elif action == 'approve_refund':
            refund(db, booking, data, current, reason.strip())
            if data.get('completion_request', {}).get('status') == 'pending':
                data['completion_request']['status'] = 'rejected'
        request.update(status='approved' if action.startswith('approve') else 'rejected', decision_reason=reason.strip(), decided_at=current.isoformat())
    else:
        fail('Thao tác không hợp lệ.')
    save(ledger, data)
    db.add(Audit(actor=actor.id, action=f'consultation:{booking.id}:{action}'))


def wallet(db, expert_id):
    entries = [decrypt(row.encrypted_payload) for row in db.scalars(select(ConsultationLedger).where(ConsultationLedger.expert_id == expert_id)).all()]
    payouts = db.scalars(select(ExpertPayout).where(ExpertPayout.expert_id == expert_id).order_by(ExpertPayout.month.desc())).all()
    earned = sum(d['amount'] * 80 // 100 for d in entries if d['settlement'] == 'allocated')
    paid = sum(p.amount for p in payouts)
    return {'demo': True, 'earned': earned, 'paid': paid, 'balance': earned - paid,
            'held': sum(d['amount'] for d in entries if d['settlement'] == 'held'),
            'payouts': [{'id': p.id, 'month': p.month, 'amount': p.amount, 'created': utc(p.created).isoformat()} for p in payouts]}
