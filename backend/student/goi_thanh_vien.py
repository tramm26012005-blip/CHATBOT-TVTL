"""Plan entitlements and shared chat/voice allowance (Vietnam calendar days)."""
from datetime import timedelta, timezone
import hashlib
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Literal
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import User, PlanUsage, Audit, db_session, now
from app.security import current_user, student_user
from app.config import settings
from app.admin_settings import operating_settings

router = APIRouter(prefix='/api/membership')
VN = timezone(timedelta(hours=7))
NORMAL_DAILY_QUESTIONS = 20
VIP_DAILY_QUESTIONS = 200
DAILY_SECONDS = 600  # Normal plan only; VIP has no time cap.


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def is_vip(user):
    return user.role == 'admin' or (user.membership_tier == 'vip' and (user.vip_expires_at is None or utc(user.vip_expires_at) > now()))


def require_vip(user: User = Depends(student_user)):
    student_user(user)  # Also enforce the role when called directly for published content.
    if not is_vip(user):
        raise HTTPException(403, 'Chức năng này dành cho gói VIP. Bạn có thể xem mục Nâng cấp gói.')
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


def status_view(user, row, db=None):
    vip = is_vip(user)
    limit = question_limit(user)
    seconds = max(0, int(DAILY_SECONDS - row.active_seconds))
    questions = max(0, limit - row.questions)
    return {'tier': 'vip' if vip else 'normal', 'expires_at': utc(user.vip_expires_at) if user.vip_expires_at else None,
            'demo': user.membership_demo, 'demo_enabled': operating_settings(db)['membership_demo_enabled'] if db is not None else settings().membership_demo_enabled,
            'price_vnd': 300000, 'duration_days': 30, 'remaining_questions': questions,
            'remaining_seconds': seconds, 'daily_question_limit': limit, 'daily_seconds_limit': DAILY_SECONDS,
            'exhausted': questions == 0 or (not vip and seconds == 0), 'day': row.day,
            'reset_at': (now().astimezone(VN).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).isoformat()}


def ensure_allowance(db, user, count_question=False):
    row = usage_row(db, user)
    if is_vip(user):
        if row.questions >= VIP_DAILY_QUESTIONS:
            db.commit()
            raise HTTPException(403, f'Bạn đã dùng hết {VIP_DAILY_QUESTIONS} lượt hỏi hôm nay. Hạn mức làm mới lúc 00:00 giờ Việt Nam; bạn vẫn dùng được Test tâm lý và hỗ trợ khẩn cấp.')
        if count_question:
            row.questions += 1
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
    if not operating_settings(db)['membership_demo_enabled']:
        raise HTTPException(403, 'Thanh toán mô phỏng chưa được bật.')
    if not body.acknowledge_demo:
        raise HTTPException(422, 'Vui lòng xác nhận đây là bản thử, không có thanh toán thật.')
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    if not is_vip(user):
        user.membership_tier = 'vip'
        user.membership_demo = True
        user.vip_expires_at = now() + timedelta(days=30)
        db.add(Audit(actor=user.id, action=f'membership:demo:{body.method}:30days'))
    row = usage_row(db, user)
    view = status_view(user, row, db)
    db.commit()
    return view
