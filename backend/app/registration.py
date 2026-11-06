"""Gmail signup: pending data only until a single-use OTP is verified."""
import hashlib
import hmac
import json
import secrets
import smtplib
import ssl
from datetime import timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr
from fastapi import HTTPException
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError
from .config import settings
from .db import User, PendingRegistration, OtpRate, now
from .security import digest, passwords

OTP_SECONDS = 300
RESEND_SECONDS = 60
MAX_ATTEMPTS = 5


def utc(date):
    return date.replace(tzinfo=timezone.utc) if date.tzinfo is None else date


def otp_digest(challenge, code):
    key = settings().otp_secret_key
    if len(key) < 32:
        raise HTTPException(503, 'Backend chưa cấu hình khóa bảo vệ OTP.')
    return hmac.new(key.encode(), f'{challenge}:{code}'.encode(), hashlib.sha256).hexdigest()


def mail_ready():
    cfg = settings()
    if not cfg.smtp_host or not cfg.smtp_username or not cfg.smtp_password:
        raise HTTPException(503, 'Chưa cấu hình Gmail gửi OTP. Vui lòng hoàn tất SMTP ở backend.')
    otp_digest('configuration-check', '000000')


def send_otp_email(email, code, purpose='đăng ký'):
    cfg = settings()
    message = EmailMessage()
    message['Subject'] = f'Mã xác thực {purpose} Tư vấn tâm lý'
    message['From'] = formataddr(('Lạc Lạc – Tư vấn tâm lý', cfg.smtp_from or cfg.smtp_username))
    message['To'] = email
    message.set_content(f'Mã xác thực {purpose} của bạn: {code}\n\nMã có hiệu lực trong 5 phút, chỉ dùng một lần. Không chia sẻ mã với người khác. Nếu bạn không yêu cầu đăng ký, hãy bỏ qua email này.\n\nLạc Lạc – Tư vấn tâm lý')
    with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=20) as mail:
        mail.ehlo()
        mail.starttls(context=ssl.create_default_context())
        mail.ehlo()
        mail.login(cfg.smtp_username, cfg.smtp_password.replace(' ', ''))
        mail.send_message(message)


def reserve_delivery(db, email):
    timestamp = now()
    # A fixed lock order avoids cross-worker deadlocks. Count failed deliveries
    # too, so SMTP outages cannot be used to bypass the sending limit.
    for key, limit in [('global', 100), ('email:' + digest(email), 5)]:
        row = db.scalar(select(OtpRate).where(OtpRate.key == key).with_for_update())
        if row is None:
            try:
                with db.begin_nested():
                    db.add(OtpRate(key=key, window_start=timestamp, last_sent=timestamp-timedelta(hours=1), count=0))
                    db.flush()
            except IntegrityError:
                pass
            row = db.scalar(select(OtpRate).where(OtpRate.key == key).with_for_update())
        if timestamp - utc(row.window_start) >= timedelta(hours=1):
            row.window_start, row.count = timestamp, 0
        if key != 'global' and timestamp - utc(row.last_sent) < timedelta(seconds=RESEND_SECONDS):
            db.rollback()
            raise HTTPException(429, 'Vui lòng chờ 60 giây trước khi yêu cầu gửi lại mã.')
        if row.count >= limit:
            db.rollback()
            raise HTTPException(429, 'Đã đạt giới hạn gửi OTP. Vui lòng thử lại sau.')
        row.count += 1
        row.last_sent = timestamp
    db.commit()


def start_registration(body, db):
    if not body.privacy_accepted:
        raise HTTPException(422, 'Bạn cần đồng ý chính sách dữ liệu để đăng ký tài khoản.')
    mail_ready()
    email = str(body.email).lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, 'Email này đã có tài khoản. Bạn có thể đăng nhập hoặc khôi phục mật khẩu.')
    reserve_delivery(db, email)
    db.execute(delete(PendingRegistration).where(PendingRegistration.expires <= now()))
    db.execute(delete(PendingRegistration).where(PendingRegistration.email == email))
    if body.previous_challenge:
        db.execute(delete(PendingRegistration).where(PendingRegistration.challenge_hash == digest(body.previous_challenge)))
    challenge = secrets.token_urlsafe(32)
    code = f'{secrets.randbelow(1_000_000):06d}'
    db.add(PendingRegistration(challenge_hash=digest(challenge), email=email, name=body.name, password_hash=passwords.hash(body.password), otp_hash=otp_digest(challenge, code), expires=now()+timedelta(seconds=OTP_SECONDS), attempts=0, consented_at=now()))
    db.commit()
    try:
        send_otp_email(email, code)
    except Exception:
        db.execute(delete(PendingRegistration).where(PendingRegistration.challenge_hash == digest(challenge)))
        db.commit()
        raise HTTPException(503, 'Chưa gửi được OTP. Hãy kiểm tra cấu hình Gmail SMTP và thử lại sau.')
    return {'challenge':challenge, 'expires_in':OTP_SECONDS, 'resend_after':RESEND_SECONDS, 'message':'Đã gửi mã xác thực đến Gmail của bạn. Hãy kiểm tra cả mục Thư rác.'}


def verify_registration(body, db):
    pending = db.scalar(select(PendingRegistration).where(PendingRegistration.challenge_hash == digest(body.challenge)).with_for_update())
    if pending is None:
        raise HTTPException(400, 'Yêu cầu xác thực không hợp lệ. Hãy gửi mã mới.')
    if utc(pending.expires) <= now() or pending.attempts >= MAX_ATTEMPTS:
        db.delete(pending); db.commit()
        raise HTTPException(400, 'Mã đã hết hạn hoặc vượt số lần thử. Hãy gửi mã mới.')
    if not hmac.compare_digest(pending.otp_hash, otp_digest(body.challenge, body.otp)):
        pending.attempts += 1
        if pending.attempts >= MAX_ATTEMPTS:
            db.delete(pending)
        db.commit()
        raise HTTPException(400, 'Mã OTP không đúng. Sau 5 lần nhập sai, bạn cần yêu cầu mã mới.')
    user = User(role='student', membership_tier='normal', created_at_source='registration', expert_id=None, email=pending.email, name=pending.name, password_hash=pending.password_hash, email_verified_at=now(), settings_json=json.dumps({'save_history':False,'save_assessments':False,'consent_version':'2026-10-27','consented_at':utc(pending.consented_at).isoformat()}))
    db.add(user)
    db.delete(pending)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, 'Không thể tạo tài khoản với email này. Vui lòng đăng nhập hoặc gửi lại yêu cầu.')
    return user


def cancel_registration(body, db):
    db.execute(delete(PendingRegistration).where(PendingRegistration.challenge_hash == digest(body.challenge)))
    db.commit()
    return {'ok':True}
