"""Role-scoped attendance, settlement, requests and monthly simulated payouts."""
import json
from typing import Literal
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import db_session, User, Booking, Content, ConsultationLedger, ExpertPayout, Audit, now
from .security import student_user, expert_user, admin_user, decrypt
from .consultations import locked, act, sync_all, view, wallet, instant, fail

router = APIRouter(prefix='/api')


class StudentAction(BaseModel):
    action: Literal['present', 'student_confirm', 'refund_request']
    reason: str = Field(default='', max_length=2000)


class ExpertAction(BaseModel):
    action: Literal['present', 'start', 'complete', 'completion_request']
    reason: str = Field(default='', max_length=2000)


class AdminAction(BaseModel):
    action: Literal['approve_completion', 'reject_completion', 'approve_refund', 'reject_refund']
    reason: str = Field(min_length=1, max_length=2000)


def perform(db, booking_id, body, user):
    # Authorize before taking any state-changing reconciliation path.
    row = db.get(Booking, booking_id)
    if not row or (user.role == 'student' and row.user_id != user.id) or (user.role == 'expert' and row.expert_id != user.expert_id):
        raise HTTPException(404, 'Không tìm thấy lịch hẹn.')
    row, ledger, data = locked(db, booking_id)
    act(db, row, ledger, data, body.action, user, body.reason)
    db.commit()
    return view(db, row)


@router.post('/bookings/{booking_id}/consultation')
def student_action(booking_id: str, body: StudentAction, user: User = Depends(student_user), db: Session = Depends(db_session)):
    return perform(db, booking_id, body, user)


@router.post('/expert/bookings/{booking_id}/consultation')
def expert_action(booking_id: str, body: ExpertAction, user: User = Depends(expert_user), db: Session = Depends(db_session)):
    return perform(db, booking_id, body, user)


@router.post('/admin/bookings/{booking_id}/consultation')
def admin_action(booking_id: str, body: AdminAction, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    return perform(db, booking_id, body, user)


@router.get('/expert/wallet')
def expert_wallet(user: User = Depends(expert_user), db: Session = Depends(db_session)):
    sync_all(db)
    return wallet(db, user.expert_id)


@router.get('/admin/consultations')
def admin_consultations(user: User = Depends(admin_user), db: Session = Depends(db_session)):
    sync_all(db)
    users = {u.id: u.name for u in db.scalars(select(User)).all()}
    experts = {c.id: json.loads(c.payload).get('name', '') for c in db.scalars(select(Content).where(Content.kind == 'experts')).all()}
    from .dung_chung import booking_view
    bookings = [{**booking_view(b, db), 'student_name': users.get(b.user_id, 'Tài khoản đã xóa')} for b in db.scalars(select(Booking).order_by(Booking.created.desc())).all()]
    ids = set(db.scalars(select(ConsultationLedger.expert_id)).all())
    return {'bookings': bookings, 'wallets': [{'expert_id': eid, 'expert_name': experts.get(eid, 'Chuyên gia'), **wallet(db, eid)} for eid in sorted(ids)]}


class PayoutInput(BaseModel):
    expert_id: str
    month: str = Field(pattern=r'^\d{4}-(0[1-9]|1[0-2])$')


@router.post('/admin/expert-payouts')
def payout(body: PayoutInput, user: User = Depends(admin_user), db: Session = Depends(db_session)):
    sync_all(db)
    vn = ZoneInfo('Asia/Ho_Chi_Minh')
    if body.month >= now().astimezone(vn).strftime('%Y-%m') or body.month[:4] == '0000':
        fail('Chỉ đối soát tháng đã kết thúc.')
    expert = db.scalar(select(Content).where(Content.id == body.expert_id, Content.kind == 'experts').with_for_update())
    if not expert:
        raise HTTPException(404, 'Không tìm thấy chuyên gia.')
    if db.scalar(select(ExpertPayout).where(ExpertPayout.expert_id == body.expert_id, ExpertPayout.month == body.month)):
        fail('Tháng này đã được chi trả mô phỏng.')
    state = wallet(db, body.expert_id)
    eligible = 0
    for entry in db.scalars(select(ConsultationLedger).where(ConsultationLedger.expert_id == body.expert_id)).all():
        data = decrypt(entry.encrypted_payload)
        if data['settlement'] == 'allocated' and instant(data['allocated_at']).astimezone(vn).strftime('%Y-%m') <= body.month:
            eligible += data['amount'] * 80 // 100
    amount = min(state['balance'], eligible - state['paid'])
    if amount <= 0:
        fail('Không có số dư đủ điều kiện chi trả. Khoản hoàn sẽ được trừ vào thu nhập tiếp theo.')
    payout = ExpertPayout(expert_id=body.expert_id, month=body.month, amount=amount)
    db.add(payout)
    db.add(Audit(actor=user.id, action=f'expert_payout:{body.expert_id}:{body.month}'))
    db.commit()
    return wallet(db, body.expert_id)
