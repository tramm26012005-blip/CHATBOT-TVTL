"""Additive, idempotent account upgrade. Does not recreate customer records."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from sqlalchemy import inspect, text
from .db import Base, engine, Content, Audit, uid

MUSIC_LIBRARY = Path(__file__).resolve().parents[2] / 'data/music/healing-library.json'
MUSIC_SEED_MARKER = 'seed:music-library:v1'


def seed_music_library(connection):
    """Copy the curated library into content once; admins manage it from then on."""
    from .schemas import MusicContent
    done = connection.execute(Audit.__table__.select().where(Audit.action == MUSIC_SEED_MARKER)).first()
    if done or not MUSIC_LIBRARY.exists():
        return
    start = datetime.now(timezone.utc)
    rows = []
    for i, item in enumerate(json.loads(MUSIC_LIBRARY.read_text(encoding='utf-8'))):
        data = MusicContent.model_validate({**item, 'library_id': item['id']}).model_dump(mode='json', exclude_none=True)
        # Distinct timestamps keep the library's curated order.
        rows.append({'id': uid(), 'kind': 'music', 'payload': json.dumps(data, ensure_ascii=False), 'published': True, 'created': start + timedelta(microseconds=i)})
    connection.execute(Content.__table__.insert(), rows)
    connection.execute(Audit.__table__.insert(), {'id': uid(), 'actor': 'system', 'action': MUSIC_SEED_MARKER, 'created': start})


CUSTOMER_VIEW = '''SELECT
    ROW_NUMBER() OVER (ORDER BY CASE WHEN created_at IS NULL THEN 1 ELSE 0 END, created_at, id) AS stt,
    id,
    name AS ten,
    email,
    password_hash AS mat_khau_bam,
    created_at AS ngay_khoi_tao,
    CASE WHEN membership_tier = 'vip' AND (vip_expires_at IS NULL OR vip_expires_at > CURRENT_TIMESTAMP) THEN 'VIP' ELSE 'Thường' END AS phan_quyen
FROM users WHERE role = 'student' '''

ADMIN_VIEW = '''SELECT
    ROW_NUMBER() OVER (ORDER BY CASE WHEN created_at IS NULL THEN 1 ELSE 0 END, created_at, id) AS stt,
    id,
    name AS ten,
    email,
    password_hash AS mat_khau_bam,
    created_at AS ngay_khoi_tao,
    CASE WHEN is_active THEN 'Đang hoạt động' ELSE 'Đã khóa' END AS trang_thai
FROM users WHERE role = 'admin' '''


def expert_view(postgres):
    # Profile fields live in the JSON payload of the linked content row.
    field = (lambda key: f"(c.payload::json ->> '{key}')") if postgres else (lambda key: f"json_extract(c.payload, '$.{key}')")
    return f'''SELECT
    ROW_NUMBER() OVER (ORDER BY CASE WHEN u.created_at IS NULL THEN 1 ELSE 0 END, u.created_at, u.id) AS stt,
    u.id,
    u.name AS ten,
    u.email,
    u.password_hash AS mat_khau_bam,
    u.created_at AS ngay_khoi_tao,
    CASE WHEN u.is_active THEN 'Đang hoạt động' ELSE 'Đã khóa' END AS trang_thai,
    u.expert_id AS ma_ho_so,
    {field('name')} AS ho_so_chuyen_gia,
    {field('specialty')} AS chuyen_mon,
    {field('workplace')} AS noi_cong_tac,
    (SELECT COUNT(*) FROM bookings b WHERE b.expert_id = u.expert_id) AS so_lich_hen
FROM users u LEFT JOIN content c ON c.id = u.expert_id
WHERE u.role = 'expert' '''


def initialize_database(target=engine):
    Base.metadata.create_all(target)
    with target.begin() as connection:
        postgres = connection.dialect.name == 'postgresql'
        if postgres:
            # Serialize concurrent workers applying this upgrade.
            connection.execute(text('SELECT pg_advisory_xact_lock(78241603)'))
        reset_columns = {column['name'] for column in inspect(connection).get_columns('reset_tokens')}
        if 'otp_verified' not in reset_columns:
            default = 'FALSE' if postgres else '0'
            connection.execute(text(f'ALTER TABLE reset_tokens ADD COLUMN otp_verified BOOLEAN NOT NULL DEFAULT {default}'))
        if 'created' not in {column['name'] for column in inspect(connection).get_columns('content')}:
            date_type = 'TIMESTAMP WITH TIME ZONE' if postgres else 'DATETIME'
            connection.execute(text(f'ALTER TABLE content ADD COLUMN created {date_type} NULL'))
        seed_music_library(connection)
        booking_columns = {column['name'] for column in inspect(connection).get_columns('bookings')}
        for name, sql_type in [('duration_minutes', 'INTEGER NOT NULL DEFAULT 60'), ('mode', 'VARCHAR(16) NULL'), ('encrypted_details', 'TEXT NULL')]:
            if name not in booking_columns:
                connection.execute(text(f'ALTER TABLE bookings ADD COLUMN {name} {sql_type}'))
        columns = {column['name'] for column in inspect(connection).get_columns('users')}
        plan_columns = {column['name'] for column in inspect(connection).get_columns('plan_usage')}
        for name, sql_type in [('active_client', 'VARCHAR(64)'), ('pending_reply_hash', 'VARCHAR(64)')]:
            if name not in plan_columns:
                connection.execute(text(f'ALTER TABLE plan_usage ADD COLUMN {name} {sql_type} NULL'))
        if 'vip_expires_at' not in columns:
            date_type = 'TIMESTAMP WITH TIME ZONE' if postgres else 'DATETIME'
            connection.execute(text(f'ALTER TABLE users ADD COLUMN vip_expires_at {date_type} NULL'))
        if 'membership_demo' not in columns:
            default = 'FALSE' if postgres else '0'
            connection.execute(text(f'ALTER TABLE users ADD COLUMN membership_demo BOOLEAN NOT NULL DEFAULT {default}'))
        if 'expert_id' not in columns:
            connection.execute(text('ALTER TABLE users ADD COLUMN expert_id VARCHAR(36) NULL REFERENCES content(id)'))
        if 'email_verified_at' not in columns:
            date_type = 'TIMESTAMP WITH TIME ZONE' if postgres else 'DATETIME'
            connection.execute(text(f'ALTER TABLE users ADD COLUMN email_verified_at {date_type} NULL'))
        if 'membership_tier' not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN membership_tier VARCHAR(16) NOT NULL DEFAULT 'normal' CHECK (membership_tier IN ('normal', 'vip'))"))
        if 'created_at' not in columns:
            timestamp_type = 'TIMESTAMP WITH TIME ZONE' if postgres else 'DATETIME'
            connection.execute(text(f'ALTER TABLE users ADD COLUMN created_at {timestamp_type} NULL'))
        if 'created_at_source' not in columns:
            connection.execute(text('ALTER TABLE users ADD COLUMN created_at_source VARCHAR(24) NULL'))
        # Old registrations recorded consent time, not a dedicated creation time.
        # Recover only that existing timestamp, never invent today's date.
        rows = connection.execute(text('SELECT id, settings_json FROM users WHERE created_at IS NULL')).all()
        for user_id, settings_json in rows:
            try:
                value = json.loads(settings_json).get('consented_at')
                date = datetime.fromisoformat(value.replace('Z', '+00:00'))
                if date.tzinfo is None:
                    date = date.replace(tzinfo=timezone.utc)
            except (ValueError, TypeError, AttributeError):
                continue
            connection.execute(text("UPDATE users SET created_at=:created, created_at_source='consent_record' WHERE id=:id AND created_at IS NULL"), {'created': date if postgres else date.isoformat(), 'id': user_id})
        if postgres:
            connection.execute(text('ALTER TABLE users ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP'))
            connection.execute(text("ALTER TABLE users ALTER COLUMN created_at_source SET DEFAULT 'registration'"))
        views = {'tai_khoan_khach_hang': CUSTOMER_VIEW, 'tai_khoan_admin': ADMIN_VIEW, 'tai_khoan_chuyen_gia': expert_view(postgres)}
        for name, query in views.items():
            create = 'CREATE OR REPLACE VIEW' if postgres else 'CREATE VIEW IF NOT EXISTS'
            connection.execute(text(f'{create} {name} AS {query}'))
