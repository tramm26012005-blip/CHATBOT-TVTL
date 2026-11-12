"""Plan entitlements and shared chat/voice allowance (Vietnam calendar days)."""
from datetime import timedelta, timezone
import hashlib
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Literal
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import User, PlanUsage, Audit, Content, PaymentOrder, db_session, now
from app.security import current_user, student_user
from app.config import settings
from app.admin_settings import operating_settings

router = APIRouter(prefix='/api/membership')
VN = timezone(timedelta(hours=7))
NORMAL_DAILY_QUESTIONS = 20
VIP_DAILY_QUESTIONS = 200
DAILY_SECONDS = 600  # Normal plan only; VIP has no time cap.
VIP_PRICE = 300000
VIP_DAYS = 30
# Clock skew allowed between a payment timestamp and the VIP expiry it produced.
PERIOD_TOLERANCE = timedelta(minutes=5)


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def is_vip(user):
    return user.role == 'admin' or (not (settings().payments_enabled and user.membership_demo)
        and user.membership_tier == 'vip' and (user.vip_expires_at is None or utc(user.vip_expires_at) > now()))


def require_vip(user: User = Depends(student_user)):
    student_user(user)  # Also enforce the role when called directly for published content.
    if not is_vip(user):
        raise HTTPException(403, 'Chức năng này dành cho gói VIP. Bạn có thể xem mục Nâng cấp gói.')
    return user


def mark_vip_used(user):
    """Record that the current VIP time has been used, so cancelling it is no longer refundable."""
    if is_vip(user) and user.role == 'student':
        user.vip_used_at = now()


def vip_action(user: User = Depends(require_vip)):
    """require_vip for actions that consume the plan (bookings). Saved by the endpoint's own commit."""
    mark_vip_used(user)
    return user


def question_limit(user):
    return VIP_DAILY_QUESTIONS if is_vip(user) else NORMAL_DAILY_QUESTIONS


def usage_row(db, user):
    # Serialize requests from all tabs/devices for the same account in PostgreSQL.
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    day = now().astimezone(VN).date().isoformat()
    row = db.scalar(select(PlanUsage).where(PlanUsage.user_id == user.id, PlanUsage.day == day))
    if row is None:
        row = PlanUsage(user_id=user.id, day=day, questions=0, active_seconds=0)
        db.add(row)
        db.flush()
    return row


def accrue(row, current):
    if row.last_seen:
        elapsed = max(0, (current - utc(row.last_seen)).total_seconds())
        # Heartbeats arrive every 10 seconds. Long gaps mean closed/hidden tabs.
        if elapsed <= 25:
            row.active_seconds = min(DAILY_SECONDS, row.active_seconds + elapsed)
    row.last_seen = current


def demo_payment_key(payment_id):
    """Content id that stores the admin decision for a demo payment row (see admin payments)."""
    return 'pay-' + hashlib.sha256(payment_id.encode()).hexdigest()[:32]


def demo_decision(db, audit):
    row = db.get(Content, demo_payment_key('vip:' + audit.id))
    return json.loads(row.payload) if row else {}


def current_period(db, user):
    """The payments that bought the VIP time the user holds now, and when that time began.

    Real orders stack (each adds its days after the previous expiry), so walk back from
    the expiry. Returns ([], None, None) when the VIP was not bought, e.g. granted by an admin."""
    if not is_vip(user) or user.role != 'student' or user.vip_expires_at is None:
        return [], None, None
    end = utc(user.vip_expires_at)
    if user.membership_demo:
        audit = db.scalar(select(Audit).where(Audit.actor == user.id, Audit.action.like('membership:demo:%'))
                          .order_by(Audit.created.desc()))
        if (audit and abs(utc(audit.created) + timedelta(days=VIP_DAYS) - end) <= PERIOD_TOLERANCE
                and demo_decision(db, audit).get('status', 'success') == 'success'):
            return [], audit, utc(audit.created)
        return [], None, None
    orders = db.scalars(select(PaymentOrder).where(PaymentOrder.user_id == user.id, PaymentOrder.status == 'paid',
        PaymentOrder.refund_status.is_(None), PaymentOrder.paid_at.is_not(None)).order_by(PaymentOrder.paid_at.desc())).all()
    chain = []
    for order in orders:
        start = end - timedelta(days=order.duration_days)
        paid = utc(order.paid_at)
        if paid > start + PERIOD_TOLERANCE:
            break
        chain.append(order)
        if paid >= start - PERIOD_TOLERANCE:
            return chain, None, paid  # This order started the period fresh.
        end = start
    return [], None, None


def cancel_terms(db, user):
    """What cancelling now would do: 'refund' (bought, unused), 'no_refund' (already used), 'none' (not bought)."""
    orders, audit, started = current_period(db, user)
    if started is None:
        return {'policy': 'none', 'amount': 0, 'demo': False}, orders, audit
    used = user.vip_used_at is not None and utc(user.vip_used_at) >= started
    amount = sum(order.amount for order in orders) if orders else VIP_PRICE
    return {'policy': 'no_refund' if used else 'refund', 'amount': amount, 'demo': audit is not None}, orders, audit


def latest_refund(db, user):
    """Most recent VIP refund for this student, real or demo, for the plan page notice."""
    found = []
    order = db.scalar(select(PaymentOrder).where(PaymentOrder.user_id == user.id, PaymentOrder.refund_status.is_not(None))
                      .order_by(PaymentOrder.refund_requested_at.desc()))
    if order:
        found.append({'status': order.refund_status, 'amount': order.amount, 'demo': False,
                      'requested_at': utc(order.refund_requested_at or order.paid_at or order.created).isoformat(),
                      'refunded_at': utc(order.refunded_at).isoformat() if order.refunded_at else None})
    for audit in db.scalars(select(Audit).where(Audit.actor == user.id, Audit.action.like('membership:demo:%'))).all():
        decision = demo_decision(db, audit)
        if decision.get('status') in ('refund_requested', 'refunded'):
            found.append({'status': 'requested' if decision['status'] == 'refund_requested' else 'refunded',
                          'amount': VIP_PRICE, 'demo': True,
                          'requested_at': decision.get('requested_at') or utc(audit.created).isoformat(),
                          'refunded_at': decision.get('refunded_at')})
    return max(found, key=lambda item: item['requested_at'], default=None)


def status_view(user, row, db=None):
    from app.payment_gateways import available_methods
    vip = is_vip(user)
    limit = question_limit(user)
    seconds = max(0, int(DAILY_SECONDS - row.active_seconds))
    questions = max(0, limit - row.questions)
    return {'tier': 'vip' if vip else 'normal', 'expires_at': utc(user.vip_expires_at) if user.vip_expires_at else None,
            'demo': user.membership_demo, 'demo_enabled': not settings().payments_enabled and (operating_settings(db)['membership_demo_enabled'] if db is not None else settings().membership_demo_enabled),
            'payments_enabled': settings().payments_enabled, 'payment_methods': available_methods(),
            'price_vnd': VIP_PRICE, 'duration_days': VIP_DAYS, 'remaining_questions': questions,
            'remaining_seconds': seconds, 'daily_question_limit': limit, 'daily_seconds_limit': DAILY_SECONDS,
            'exhausted': questions == 0 or (not vip and seconds == 0), 'day': row.day,
            'reset_at': (now().astimezone(VN).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).isoformat(),
            'cancel': cancel_terms(db, user)[0] if db is not None and vip else None,
            'refund': latest_refund(db, user) if db is not None else None}


def ensure_allowance(db, user, count_question=False):
    row = usage_row(db, user)
    if is_vip(user):
        if row.questions >= VIP_DAILY_QUESTIONS:
            db.commit()
            raise HTTPException(403, f'Bạn đã dùng hết {VIP_DAILY_QUESTIONS} lượt hỏi hôm nay. Hạn mức làm mới lúc 00:00 giờ Việt Nam; bạn vẫn dùng được Test tâm lý và hỗ trợ khẩn cấp.')
        if count_question:
            row.questions += 1
        mark_vip_used(user)
        db.commit()
        return
    accrue(row, now())
    if row.questions >= NORMAL_DAILY_QUESTIONS or row.active_seconds >= DAILY_SECONDS:
        db.commit()
        raise HTTPException(403, 'Bạn đã dùng hết 10 phút hoặc 20 lượt hỏi hôm nay. Hạn mức làm mới lúc 00:00 giờ Việt Nam; bạn vẫn dùng được Test tâm lý và hỗ trợ khẩn cấp.')
    if count_question:
        row.questions += 1
    db.commit()


def authorize_reply(db, user, reply):
    if not is_vip(user):
        row = usage_row(db, user)
        row.pending_reply_hash = hashlib.sha256(reply.encode()).hexdigest()
        db.commit()


def consume_reply(db, user, reply):
    if not is_vip(user):
        row = usage_row(db, user)
        if not row.pending_reply_hash or row.pending_reply_hash != hashlib.sha256(reply.encode()).hexdigest():
            raise HTTPException(403, 'Hãy gửi một lượt tâm sự trước khi phát giọng nói.')
        row.pending_reply_hash = None
        db.commit()


@router.get('/status')
def status(user: User = Depends(student_user), db: Session = Depends(db_session)):
    row = usage_row(db, user)
    view = status_view(user, row, db)
    db.commit()
    return view


class Heartbeat(BaseModel):
    active: bool = True
    client_id: str = Field(default='default', min_length=1, max_length=64)


@router.post('/heartbeat')
def heartbeat(body: Heartbeat, user: User = Depends(student_user), db: Session = Depends(db_session)):
    row = usage_row(db, user)
    if not is_vip(user):
        if body.active:
            accrue(row, now())
            row.active_client = body.client_id
        elif row.active_client == body.client_id:
            accrue(row, now())
            row.last_seen = None
            row.active_client = None
    view = status_view(user, row, db)
    db.commit()
    return view


class DemoUpgrade(BaseModel):
    method: Literal['bank', 'momo']
    acknowledge_demo: bool


@router.post('/demo-upgrade')
def demo_upgrade(body: DemoUpgrade, user: User = Depends(student_user), db: Session = Depends(db_session)):
    if settings().payments_enabled:
        raise HTTPException(403, 'Nâng cấp mô phỏng đã tắt khi bật thanh toán thật.')
    if not operating_settings(db)['membership_demo_enabled']:
        raise HTTPException(403, 'Thanh toán mô phỏng chưa được bật.')
    if not body.acknowledge_demo:
        raise HTTPException(422, 'Vui lòng xác nhận đây là bản thử, không có thanh toán thật.')
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    if not is_vip(user):
        user.membership_tier = 'vip'
        user.membership_demo = True
        user.vip_expires_at = now() + timedelta(days=VIP_DAYS)
        db.add(Audit(actor=user.id, action=f'membership:demo:{body.method}:{VIP_DAYS}days'))
    row = usage_row(db, user)
    view = status_view(user, row, db)
    db.commit()
    return view


REFUND_NOTE = 'Sinh viên hủy gói khi chưa sử dụng'


class CancelMembership(BaseModel):
    confirm: bool


@router.post('/cancel')
def cancel_membership(body: CancelMembership, user: User = Depends(student_user), db: Session = Depends(db_session)):
    """End VIP now. Unused bought time becomes a refund request for an admin; used time is not refunded."""
    if not body.confirm:
        raise HTTPException(422, 'Vui lòng xác nhận hủy đăng ký gói VIP.')
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    if not is_vip(user):
        raise HTTPException(409, 'Bạn đang dùng gói thường, không có gói VIP để hủy.')
    terms, orders, audit = cancel_terms(db, user)
    if terms['policy'] == 'refund':
        current = now()
        for order in orders:
            order.refund_status = 'requested'
            order.refund_requested_at = current
            order.refund_note = REFUND_NOTE
        if audit is not None:
            payment_id = 'vip:' + audit.id
            decision = db.get(Content, demo_payment_key(payment_id))
            if decision is None:
                decision = Content(id=demo_payment_key(payment_id), kind='internal_payment', published=False)
                db.add(decision)
            decision.payload = json.dumps({'payment_id': payment_id, 'status': 'refund_requested',
                                           'requested_at': current.isoformat(), 'note': REFUND_NOTE}, ensure_ascii=False)
    user.membership_tier = 'normal'
    user.membership_demo = False
    user.vip_expires_at = None
    db.add(Audit(actor=user.id, action=f"membership:cancel:{terms['policy']}"))
    row = usage_row(db, user)
    view = status_view(user, row, db)
    db.commit()
    return view
