"""VIP checkout: redirects are informational; only verified server results grant VIP."""
import hmac
import secrets
from datetime import timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.config import settings
from app.db import PaymentOrder, User, Audit, db_session, now, uid
from app.security import student_user
from app import payment_gateways as gateway

router = APIRouter(prefix='/api/payments')
CALLBACK_PATHS = frozenset(('/api/payments/payos/webhook', '/api/payments/momo/ipn'))
PRICE = 300000
DAYS = 30


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def view(order):
    return {'id': order.id, 'method': order.method, 'amount': order.amount, 'duration_days': order.duration_days,
            'status': order.status, 'checkout_url': order.checkout_url if order.status == 'pending' else '',
            'expires_at': utc(order.expires).isoformat(), 'paid_at': utc(order.paid_at).isoformat() if order.paid_at else None}


def owned(db, user, order_id):
    order = db.get(PaymentOrder, order_id)
    if order is None or order.user_id != user.id:
        raise HTTPException(404, 'Không tìm thấy đơn thanh toán.')
    return order


def settle(db, order, transaction):
    """Atomic claim and entitlement update in the same transaction, across workers."""
    if not transaction or len(transaction) > 150:
        raise HTTPException(400, 'Thiếu mã giao dịch thanh toán.')
    key = order.method + ':' + transaction
    if order.status == 'paid':
        return
    claimed = db.execute(update(PaymentOrder).where(PaymentOrder.id == order.id,
                         PaymentOrder.status != 'paid').values(status='paid', transaction_key=key, paid_at=now()))
    if not claimed.rowcount:
        db.rollback()
        db.refresh(order)
        return
    user = db.scalar(select(User).where(User.id == order.user_id).with_for_update().execution_options(populate_existing=True))
    if user is None or user.role != 'student' or not user.is_active:
        order.status = 'review'
    else:
        start = now()
        if not user.membership_demo and user.membership_tier == 'vip' and user.vip_expires_at:
            start = max(start, utc(user.vip_expires_at))
        user.membership_tier = 'vip'
        user.membership_demo = False
        user.vip_expires_at = start + timedelta(days=order.duration_days)
        db.add(Audit(actor=user.id, action=f'membership:paid:{order.method}:{order.id}'))
    db.commit()
    db.refresh(order)


def reconcile(db, order):
    if order.status in ('paid', 'review'):
        return
    # Across tabs/workers, at most one provider query per order per 15 seconds.
    claimed = db.execute(update(PaymentOrder).where(PaymentOrder.id == order.id,
        (PaymentOrder.checked_at.is_(None)) | (PaymentOrder.checked_at < now() - timedelta(seconds=15))
    ).values(checked_at=now()))
    db.commit()
    if not claimed.rowcount:
        db.refresh(order)
        return
    data = gateway.query_order(order)
    db.refresh(order)
    if order.status in ('paid', 'review'):
        return
    if order.method == 'bank':
        if (not isinstance(data.get('id'), str) or not data['id']
                or data.get('orderCode') != order.order_code or data.get('amount') != order.amount
                or (order.provider_id and data.get('id') != order.provider_id)):
            raise HTTPException(502, 'Kết quả đối soát ngân hàng không khớp đơn hàng.')
        if data.get('status') == 'PAID':
            if data.get('amountPaid') != order.amount or data.get('amountRemaining') != 0:
                order.status = 'review'
                db.commit()
                return
            # Link ID identifies a single settled order, even if a webhook arrives later.
            settle(db, order, str(data['id']))
            return
        status = {'CANCELLED': 'cancelled', 'EXPIRED': 'expired'}.get(data.get('status'))
    else:
        if (data.get('partnerCode') != settings().momo_partner_code or data.get('orderId') != order.id
                or data.get('amount') != order.amount):
            raise HTTPException(502, 'Kết quả đối soát MoMo không khớp đơn hàng.')
        if type(data.get('resultCode')) is int and data['resultCode'] == 0:
            settle(db, order, str(data.get('transId') or ''))
            return
        # Unknown/processing responses must never become a success or a false failure.
        status = 'cancelled' if data.get('resultCode') == 1003 else None
    if status:
        db.execute(update(PaymentOrder).where(PaymentOrder.id == order.id,
                   PaymentOrder.status.not_in(('paid', 'review'))).values(status=status))
        db.commit()
        db.refresh(order)


@router.get('/methods')
def methods(user: User = Depends(student_user)):
    return {'methods': gateway.available_methods(), 'amount': PRICE, 'duration_days': DAYS}


class Checkout(BaseModel):
    model_config = ConfigDict(extra='forbid')
    method: Literal['bank', 'momo']
    consent: bool


@router.post('/orders')
def create_order(body: Checkout, user: User = Depends(student_user), db: Session = Depends(db_session)):
    gateway.require_method(body.method)
    if not body.consent:
        raise HTTPException(422, 'Vui lòng xác nhận mua gói VIP trước khi tạo đơn.')
    db.scalar(select(User).where(User.id == user.id).with_for_update())
    order = db.scalar(select(PaymentOrder).where(PaymentOrder.user_id == user.id,
        PaymentOrder.method == body.method, PaymentOrder.status.in_(('creating', 'pending'))
    ).order_by(PaymentOrder.created.desc()))
    if order and utc(order.expires) <= now():
        # Query first: do not discard a paid order when the callback was delayed.
        db.commit()
        reconcile(db, order)
        if order.status in ('paid', 'review'):
            return view(order)
        db.execute(update(PaymentOrder).where(PaymentOrder.id == order.id,
            PaymentOrder.status.not_in(('paid', 'review'))).values(status='expired'))
        db.commit()
        db.refresh(order)
        if order.status in ('paid', 'review'):
            return view(order)
        order = None
    if order is None:
        order = PaymentOrder(id=uid(), user_id=user.id, method=body.method,
            order_code=secrets.randbelow(8_000_000_000_000) + 1_000_000_000_000,
            amount=PRICE, duration_days=DAYS, expires=now() + timedelta(minutes=15))
        db.add(order)
        db.commit()
    else:
        db.commit()
    if order.status == 'pending' and order.checkout_url:
        return view(order)
    try:
        provider_id, url = gateway.create_checkout(order)
    except HTTPException as creation_error:
        if creation_error.status_code != 502:
            raise
        # A timeout/duplicate response may hide an order already accepted by payOS.
        # Recover only from a signed, channel-authenticated status for this exact order.
        if order.method != 'bank':
            raise
        try:
            data = gateway.query_order(order)
            if (data.get('orderCode') != order.order_code or data.get('amount') != order.amount
                    or not isinstance(data.get('id'), str) or not data['id'].isalnum()
                    or (order.provider_id and data['id'] != order.provider_id)):
                raise creation_error
            if data.get('status') == 'PAID':
                if data.get('amountPaid') != order.amount or data.get('amountRemaining') != 0:
                    raise creation_error
                settle(db, order, data['id'])
                return view(order)
            if data.get('status') != 'PENDING':
                raise creation_error
            provider_id = data['id']
            url = gateway.checkout_url('https://pay.payos.vn/web/' + provider_id, 'bank')
        except HTTPException:
            raise creation_error from None
    # A callback can race with creation. Never overwrite a paid/review status.
    db.execute(update(PaymentOrder).where(PaymentOrder.id == order.id, PaymentOrder.status == 'creating')
               .values(status='pending', provider_id=provider_id, checkout_url=url))
    db.commit()
    db.refresh(order)
    return view(order)


@router.get('/orders/{order_id}')
def order_status(order_id: str, user: User = Depends(student_user), db: Session = Depends(db_session)):
    return view(owned(db, user, order_id))


@router.post('/orders/{order_id}/refresh')
def refresh_order(order_id: str, user: User = Depends(student_user), db: Session = Depends(db_session)):
    order = owned(db, user, order_id)
    reconcile(db, order)
    return view(order)


async def callback_body(request):
    # Bound the actual streamed body, not only an untrusted Content-Length.
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 32768:
            raise HTTPException(413, 'Thông báo thanh toán quá lớn.')
    import json
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError()
        return data
    except (ValueError, UnicodeError):
        raise HTTPException(400, 'Thông báo thanh toán không hợp lệ.') from None


@router.post('/payos/webhook')
async def payos_webhook(request: Request, db: Session = Depends(db_session)):
    gateway.require_method('bank')
    body = await callback_body(request)
    data = body.get('data')
    if not isinstance(data, dict):
        raise HTTPException(400, 'Thiếu thông tin giao dịch.')
    gateway.verify_signature(data, body.get('signature'), settings().payos_checksum_key)
    if body.get('success') is not True or body.get('code') != '00' or data.get('code') != '00':
        return {'ok': True}
    if type(data.get('orderCode')) is not int or not 0 < data['orderCode'] < 2**53:
        raise HTTPException(400, 'Mã đơn ngân hàng không hợp lệ.')
    order = db.scalar(select(PaymentOrder).where(PaymentOrder.method == 'bank', PaymentOrder.order_code == data.get('orderCode')))
    if order is None:
        # payOS sends a signed sample when registering the webhook URL.
        return {'ok': True, 'matched': False}
    if (type(data.get('amount')) is not int or data['amount'] != order.amount
            or data.get('currency') != 'VND' or data.get('accountNumber') != settings().mb_account_number
            or not data.get('paymentLinkId') or (order.provider_id and data['paymentLinkId'] != order.provider_id)
            or not data.get('reference')):
        raise HTTPException(400, 'Giao dịch không khớp số tiền, tài khoản hoặc mã đơn.')
    try:
        settle(db, order, str(data['paymentLinkId']))
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Mã giao dịch đã được ghi nhận cho đơn khác.') from None
    return {'ok': True}


@router.post('/momo/ipn', status_code=204)
async def momo_ipn(request: Request, db: Session = Depends(db_session)):
    gateway.require_method('momo')
    data = await callback_body(request)
    expected = gateway.momo_ipn_signature(data)
    if not isinstance(data.get('signature'), str) or not hmac.compare_digest(expected.encode(), data['signature'].encode()):
        raise HTTPException(400, 'Chữ ký MoMo không hợp lệ.')
    if not isinstance(data.get('orderId'), str) or len(data['orderId']) > 36:
        raise HTTPException(400, 'Mã đơn MoMo không hợp lệ.')
    order = db.scalar(select(PaymentOrder).where(PaymentOrder.id == data.get('orderId'), PaymentOrder.method == 'momo'))
    if order is None:
        raise HTTPException(404, 'Không tìm thấy đơn MoMo.')
    if (data.get('partnerCode') != settings().momo_partner_code or data.get('requestId') != order.id
            or type(data.get('amount')) is not int or data['amount'] != order.amount):
        raise HTTPException(400, 'Thông báo MoMo không khớp đơn hàng.')
    if type(data.get('resultCode')) is int and data['resultCode'] == 0:
        try:
            settle(db, order, str(data.get('transId') or ''))
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, 'Mã giao dịch đã được ghi nhận cho đơn khác.') from None
    return Response(status_code=204)
