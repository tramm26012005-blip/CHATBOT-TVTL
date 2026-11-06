from datetime import datetime, timezone
from sqlalchemy import create_engine, String, Text, Boolean, ForeignKey, DateTime, UniqueConstraint, CheckConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from .config import settings
import uuid


def uid():
    return str(uuid.uuid4())


def now():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = 'users'
    __table_args__ = (CheckConstraint("membership_tier IN ('normal', 'vip')", name='ck_users_membership_tier'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(16), default='student')
    # Expert accounts are linked to exactly one published expert profile.
    expert_id: Mapped[str | None] = mapped_column(ForeignKey('content.id'), nullable=True)
    membership_tier: Mapped[str] = mapped_column(String(16), default='normal', server_default='normal')
    vip_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    membership_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default='0')
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=now, server_default=func.now())
    created_at_source: Mapped[str | None] = mapped_column(String(24), nullable=True, default='registration', server_default='registration')
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    settings_json: Mapped[str] = mapped_column(Text, default='{}')


class LoginSession(Base):
    __tablename__ = 'login_sessions'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    expires: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class PendingRegistration(Base):
    __tablename__ = 'pending_registrations'
    challenge_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(Text)
    otp_hash: Mapped[str] = mapped_column(String(64))
    expires: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(default=0)
    consented_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class OtpRate(Base):
    __tablename__ = 'otp_rates'
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_sent: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    count: Mapped[int] = mapped_column(default=0)


class PendingPasswordReset(Base):
    __tablename__ = 'pending_password_resets'
    challenge_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), unique=True)
    otp_hash: Mapped[str] = mapped_column(String(64))
    expires: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(default=0)


class ResetToken(Base):
    __tablename__ = 'reset_tokens'
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    expires: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    otp_verified: Mapped[bool] = mapped_column(Boolean, default=False)


class PrivateRecord(Base):
    __tablename__ = 'private_records'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    kind: Mapped[str] = mapped_column(String(24))
    encrypted_payload: Mapped[str] = mapped_column(Text)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Content(Base):
    __tablename__ = 'content'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    kind: Mapped[str] = mapped_column(String(24), index=True)
    payload: Mapped[str] = mapped_column(Text)
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    created: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=now)


class HospitalVisit(Base):
    __tablename__ = 'hospital_visits'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    hospital_id: Mapped[str] = mapped_column(ForeignKey('content.id'), index=True)
    starts_at: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(24), default='pending')
    encrypted_payload: Mapped[str] = mapped_column(Text)
    response_note: Mapped[str] = mapped_column(Text, default='')
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ExpertReview(Base):
    __tablename__ = 'expert_reviews'
    __table_args__ = (UniqueConstraint('user_id', 'expert_id'), CheckConstraint('stars BETWEEN 1 AND 5', name='ck_expert_review_stars'))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    expert_id: Mapped[str] = mapped_column(ForeignKey('content.id', ondelete='CASCADE'), index=True)
    stars: Mapped[int] = mapped_column()
    comment: Mapped[str] = mapped_column(Text, default='')
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Booking(Base):
    __tablename__ = 'bookings'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    expert_id: Mapped[str] = mapped_column(ForeignKey('content.id'))
    starts_at: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(24), default='pending')
    encrypted_contact: Mapped[str] = mapped_column(Text)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    duration_minutes: Mapped[int] = mapped_column(default=30, server_default='30')
    mode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Consultation topic can be health-related, so it is encrypted like the contact.
    encrypted_details: Mapped[str | None] = mapped_column(Text, nullable=True)


class ExpertAvailability(Base):
    __tablename__ = 'expert_availability'
    expert_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    weekly_json: Mapped[str] = mapped_column(Text, default='[]')


class ConsultationLedger(Base):
    """Durable simulated settlement; snapshots survive booking/account deletion."""
    __tablename__ = 'consultation_ledger'
    booking_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    expert_id: Mapped[str] = mapped_column(String(36), index=True)
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    encrypted_payload: Mapped[str] = mapped_column(Text)


class ExpertPayout(Base):
    __tablename__ = 'expert_payouts'
    __table_args__ = (UniqueConstraint('expert_id', 'month'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    expert_id: Mapped[str] = mapped_column(String(36), index=True)
    month: Mapped[str] = mapped_column(String(7))
    amount: Mapped[int] = mapped_column()
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Usage(Base):
    __tablename__ = 'usage'
    __table_args__ = (UniqueConstraint('user_id', 'day'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    day: Mapped[str] = mapped_column(String(10))
    requests: Mapped[int] = mapped_column(default=0)


class ExpertNote(Base):
    """Private professional note on one booking; readable only by its author."""
    __tablename__ = 'expert_notes'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    booking_id: Mapped[str] = mapped_column(ForeignKey('bookings.id'), unique=True)
    author_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    encrypted_body: Mapped[str] = mapped_column(Text)
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Audit(Base):
    __tablename__ = 'audit'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    actor: Mapped[str] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(100))
    created: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ServiceBudget(Base):
    __tablename__ = 'service_budget'
    day: Mapped[str] = mapped_column(String(10), primary_key=True)
    requests: Mapped[int] = mapped_column(default=0)


class PlanUsage(Base):
    __tablename__ = 'plan_usage'
    __table_args__ = (UniqueConstraint('user_id', 'day'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    day: Mapped[str] = mapped_column(String(10))
    questions: Mapped[int] = mapped_column(default=0)
    active_seconds: Mapped[float] = mapped_column(default=0)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active_client: Mapped[str | None] = mapped_column(String(64), nullable=True)
    pending_reply_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)


engine = create_engine(settings().database_url, connect_args={'check_same_thread': False} if settings().database_url.startswith('sqlite') else {}, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)


def db_session():
    with SessionLocal() as db:
        yield db
