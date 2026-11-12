"""Password recovery: only a verified email OTP grants a one-time reset token."""
import hmac
import secrets
from datetime import timedelta
from fastapi import HTTPException
from sqlalchemy import select, delete
from . import registration
from .db import User, PendingPasswordReset, ResetToken, now
from .security import digest


def send_reset_email(email, code):
    registration.send_otp_email(email, code, purpose='đặt lại mật khẩu')


def start(body, db):
    registration.mail_ready()
    email = str(body.email).lower()
    registration.reserve_delivery(db, email)
    challenge = secrets.token_urlsafe(32)
    code = f'{secrets.randbelow(1_000_000):06d}'
    db.execute(delete(PendingPasswordReset).where(PendingPasswordReset.expires <= now()))
    if body.previous_challenge:
        db.execute(delete(PendingPasswordReset).where(PendingPasswordReset.challenge_hash == digest(body.previous_challenge)))
    user = db.scalar(select(User).where(User.email == email, (User.is_active == True) | (User.login_locked == True)))
    if user:
        db.execute(delete(ResetToken).where(ResetToken.user_id == user.id))
        db.execute(delete(PendingPasswordReset).where(PendingPasswordReset.user_id == user.id))
        db.add(PendingPasswordReset(challenge_hash=digest(challenge), user_id=user.id, otp_hash=registration.otp_digest('reset:' + challenge, code), expires=now()+timedelta(seconds=300), attempts=0))
    db.commit()
    if user:
        try:
            send_reset_email(email, code)
        except Exception:
            db.execute(delete(PendingPasswordReset).where(PendingPasswordReset.challenge_hash == digest(challenge)))
            db.commit()
            raise HTTPException(503, 'Chưa gửi được mã khôi phục. Vui lòng thử lại sau.')
    return {'challenge':challenge, 'expires_in':300, 'resend_after':60, 'message':'Nếu email đã được đăng ký, mã OTP sẽ được gửi đến hộp thư. Hãy kiểm tra cả Thư rác.'}


def verify(body, db):
    pending = db.scalar(select(PendingPasswordReset).where(PendingPasswordReset.challenge_hash == digest(body.challenge)).with_for_update())
    if pending is None:
        raise HTTPException(400, 'Mã OTP hoặc yêu cầu xác thực không hợp lệ. Hãy kiểm tra email hoặc gửi mã mới.')
    if registration.utc(pending.expires) <= now() or pending.attempts >= 5:
        db.delete(pending); db.commit()
        raise HTTPException(400, 'Mã OTP đã hết hạn hoặc vượt số lần thử. Hãy gửi mã mới.')
    if not hmac.compare_digest(pending.otp_hash, registration.otp_digest('reset:' + body.challenge, body.otp)):
        pending.attempts += 1
        if pending.attempts >= 5: db.delete(pending)
        db.commit()
        raise HTTPException(400, 'Mã OTP không đúng. Sau 5 lần nhập sai, hãy yêu cầu mã mới.')
    user = db.get(User, pending.user_id)
    if not user or (not user.is_active and not user.login_locked):
        db.delete(pending); db.commit()
        raise HTTPException(400, 'Yêu cầu khôi phục không còn hợp lệ.')
    token = secrets.token_urlsafe(40)
    db.execute(delete(ResetToken).where(ResetToken.user_id == pending.user_id))
    db.add(ResetToken(token_hash=digest(token), user_id=pending.user_id, expires=now()+timedelta(minutes=10), otp_verified=True))
    db.delete(pending)
    db.commit()
    return {'token':token, 'expires_in':600}


def cancel(body, db):
    db.execute(delete(PendingPasswordReset).where(PendingPasswordReset.challenge_hash == digest(body.challenge)))
    db.commit()
    return {'ok':True}
