import hashlib
import json
import secrets
from urllib.parse import urlsplit
from datetime import timedelta, timezone
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session
from .config import settings
from .db import LoginSession, User, db_session, now

passwords = PasswordHasher()


def allowed_web_origins():
    """Keep production exact; permit same-port loopback aliases for local HTTP."""
    cfg = settings()
    configured = cfg.app_origin.rstrip('/')
    allowed = {configured}
    parsed = urlsplit(configured)
    if not cfg.cookie_secure and parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1') and not parsed.username and not parsed.path:
        port = f':{parsed.port}' if parsed.port else ''
        allowed.update({f'http://localhost{port}', f'http://127.0.0.1{port}'})
    return allowed


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def verify(password, hashed):
    try:
        return passwords.verify(hashed, password)
    except (VerificationError, InvalidHashError):
        return False


def encrypt(payload):
    key = settings().data_encryption_key
    if not key:
        raise HTTPException(503, 'Chưa cấu hình khóa mã hóa dữ liệu tại backend.')
    return Fernet(key.encode()).encrypt(json.dumps(payload, ensure_ascii=False).encode()).decode()


def decrypt(value):
    return json.loads(Fernet(settings().data_encryption_key.encode()).decrypt(value.encode()))


def validate_account_role(user):
    if user.role not in ('student', 'admin', 'expert'):
        raise HTTPException(403, 'Tài khoản chưa có vai trò hợp lệ. Vui lòng liên hệ quản trị viên.')
    if user.role == 'expert' and (not user.expert_id or user.created_at_source != 'admin'):
        raise HTTPException(403, 'Tài khoản chuyên gia phải do quản trị viên tạo và gắn hồ sơ chuyên gia.')
    return user


def current_user(request: Request, db: Session = Depends(db_session)):
    token = request.cookies.get('tuvantamly_session', '')
    session = db.get(LoginSession, digest(token))
    if not session or session.expires.replace(tzinfo=timezone.utc) < now():
        raise HTTPException(401, 'Bạn cần đăng nhập để tiếp tục.')
    user = db.get(User, session.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, 'Phiên đăng nhập không hợp lệ.')
    return validate_account_role(user)


def student_user(user: User = Depends(current_user)):
    if user.role != 'student':
        raise HTTPException(403, 'Chức năng này chỉ dành cho tài khoản khách hàng. Vui lòng sử dụng cổng đúng vai trò.')
    return user


def admin_user(user: User = Depends(current_user)):
    if user.role != 'admin':
        raise HTTPException(403, 'Chỉ quản trị viên được sử dụng chức năng này.')
    return user


def expert_user(user: User = Depends(current_user)):
    if user.role != 'expert' or not user.expert_id:
        raise HTTPException(403, 'Chỉ tài khoản chuyên gia được sử dụng chức năng này.')
    return user


def create_session(user, db, response):
    token = secrets.token_urlsafe(40)
    db.add(LoginSession(token_hash=digest(token), user_id=user.id, expires=now() + timedelta(days=7)))
    db.commit()
    response.set_cookie('tuvantamly_session', token, httponly=True, secure=settings().cookie_secure, samesite='lax', max_age=604800, path='/')
