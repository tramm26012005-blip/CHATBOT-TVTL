"""Shared account routes for every role: health, sign-up, login, password, account deletion."""
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from . import registration, recovery
from .config import settings
from .db import db_session, User, LoginSession, ResetToken, PendingPasswordReset, Audit, now
from .schemas import Register, RegisterVerify, RegisterCancel, Login, PasswordChange, PasswordReset
from .security import passwords, verify, digest, current_user, create_session, validate_account_role
from student.api_khach_hang import assessment_enabled
from .dung_chung import public_user, purge_user_data

router = APIRouter()


@router.get('/api/health')
def health():
    return {'status': 'ok', 'ai_configured': bool(settings().openai_api_key and settings().openai_chat_model), 'assessment_enabled': assessment_enabled(), 'voice_style_supported': settings().openai_tts_instructions_supported, 'voice_configured': bool(settings().openai_api_key and settings().openai_chat_model and settings().openai_transcribe_model and settings().openai_tts_model)}


@router.post('/api/auth/register', status_code=202)
def register(body: Register, db: Session = Depends(db_session)):
    return registration.start_registration(body, db)


@router.post('/api/auth/register/verify')
def register_verify(body: RegisterVerify, response: Response, db: Session = Depends(db_session)):
    user = registration.verify_registration(body, db)
    validate_account_role(user)
    create_session(user, db, response)
    return public_user(user)


@router.post('/api/auth/register/cancel')
def register_cancel(body: RegisterCancel, db: Session = Depends(db_session)):
    return registration.cancel_registration(body, db)


@router.post('/api/auth/login')
def login(body: Login, response: Response, db: Session = Depends(db_session)):
    user = db.scalar(select(User).where(User.email == str(body.email).lower()))
    if not user or not user.is_active or not verify(body.password, user.password_hash):
        raise HTTPException(401, 'Email hoặc mật khẩu không đúng.')
    validate_account_role(user)
    create_session(user, db, response)
    return public_user(user)


@router.get('/api/auth/me')
def me(user: User = Depends(current_user)):
    return public_user(user)


@router.post('/api/auth/logout')
def logout(request: Request, response: Response, db: Session = Depends(db_session)):
    db.execute(delete(LoginSession).where(LoginSession.token_hash == digest(request.cookies.get('tuvantamly_session', ''))))
    db.commit()
    response.delete_cookie('tuvantamly_session', path='/')
    return {'ok': True}


@router.put('/api/me/password')
def change_password(body: PasswordChange, response: Response, user: User = Depends(current_user), db: Session = Depends(db_session)):
    user = db.get(User, user.id)
    if not verify(body.current_password, user.password_hash):
        raise HTTPException(401, 'Mật khẩu hiện tại không đúng.')
    user.password_hash = passwords.hash(body.new_password)
    db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    db.execute(delete(ResetToken).where(ResetToken.user_id == user.id))
    db.execute(delete(PendingPasswordReset).where(PendingPasswordReset.user_id == user.id))
    validate_account_role(user)
    create_session(user, db, response)
    return {'ok': True}


class Forgot(BaseModel):
    email: EmailStr
    previous_challenge: str | None = Field(default=None, min_length=20, max_length=200)


@router.post('/api/auth/forgot-password', status_code=202)
def forgot_password(body: Forgot, db: Session = Depends(db_session)):
    return recovery.start(body, db)


@router.post('/api/auth/forgot-password/verify')
def verify_forgot_password(body: RegisterVerify, db: Session = Depends(db_session)):
    return recovery.verify(body, db)


@router.post('/api/auth/forgot-password/cancel')
def cancel_forgot_password(body: RegisterCancel, db: Session = Depends(db_session)):
    return recovery.cancel(body, db)


@router.post('/api/auth/reset-password')
def reset_password(body: PasswordReset, response: Response, db: Session = Depends(db_session)):
    token = db.scalar(select(ResetToken).where(ResetToken.token_hash == digest(body.token)).with_for_update())
    if not token or not token.otp_verified or registration.utc(token.expires) <= now():
        raise HTTPException(400, 'Phiên đổi mật khẩu không hợp lệ hoặc đã hết hạn. Hãy xác thực OTP lại.')
    user = db.get(User, token.user_id)
    if not user or not user.is_active:
        raise HTTPException(400, 'Yêu cầu khôi phục không còn hợp lệ.')
    user.password_hash = passwords.hash(body.password)
    db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
    db.execute(delete(PendingPasswordReset).where(PendingPasswordReset.user_id == user.id))
    db.execute(delete(ResetToken).where(ResetToken.user_id == user.id))
    db.commit()
    response.delete_cookie('tuvantamly_session', path='/')
    return {'ok': True}


@router.delete('/api/me')
def delete_account(response: Response, user: User = Depends(current_user), db: Session = Depends(db_session)):
    purge_user_data(db, user.id)
    db.execute(delete(Audit).where(Audit.actor == user.id))
    db.delete(db.get(User, user.id))
    db.commit()
    response.delete_cookie('tuvantamly_session', path='/')
    return {'ok': True}
