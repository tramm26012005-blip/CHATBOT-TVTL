import json
import os
import sys
import tempfile
from pathlib import Path
from datetime import datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from cryptography.fernet import Fernet

test_directory = tempfile.TemporaryDirectory(prefix='tuvantamly-tests-')
os.environ['DATABASE_URL'] = 'sqlite:///' + str(Path(test_directory.name) / 'test.db').replace('\\', '/')
os.environ['DATA_ENCRYPTION_KEY'] = Fernet.generate_key().decode()
os.environ['APP_ORIGIN'] = 'http://localhost:3000'
os.environ['ALLOW_DRAFT_ASSESSMENT'] = 'false'
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient
from sqlalchemy import select
from app.main import app, windows, score_answers
from app.db import Base, engine, SessionLocal, User, PrivateRecord, Booking, Content, now
from app.config import settings
from app.security import encrypt, decrypt
from app import ai, registration, recovery

send_otp_email_real = registration.send_otp_email
otp_deliveries = {}

HEADERS = {'Origin': 'http://localhost:3000', 'X-Tuvantamly-Client': 'web'}


@pytest.fixture(scope='session', autouse=True)
def release_test_database():
    yield
    engine.dispose()
    test_directory.cleanup()


@pytest.fixture(autouse=True)
def clean_database(monkeypatch):
    otp_deliveries.clear()
    monkeypatch.setattr(recovery, "send_reset_email", lambda email, code: otp_deliveries.__setitem__("reset:" + email, code))
    monkeypatch.setattr(registration, "send_otp_email", lambda email, code: otp_deliveries.__setitem__(email, code))
    cfg = settings()
    cfg.smtp_host = "smtp.gmail.com"
    cfg.smtp_username = "sender@gmail.com"
    cfg.smtp_password = "test-only-not-real"
    cfg.otp_secret_key = "test-only-secret-key-at-least-32-characters"
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    windows.clear()
    cfg = settings()
    cfg.membership_demo_enabled = False
    cfg.allow_draft_assessment = False
    cfg.assessment_rights_verified = False
    cfg.assessment_clinical_reviewed = False
    cfg.daily_ai_request_limit = 60
    cfg.daily_service_request_limit = 1000
    cfg.openai_api_key = ''
    cfg.openai_chat_model = ''
    yield


@pytest.fixture
def client():
    with TestClient(app, headers=HEADERS) as c:
        yield c


def register(client, email='student@gmail.com', **extra):
    email = email.replace('@example.com', '@gmail.com')
    r = client.post('/api/auth/register', json={'name': 'Sinh viên kiểm thử', 'email': email, 'password': 'strong-test-password', 'privacy_accepted': True, **extra})
    assert r.status_code == 202, r.text
    r = client.post('/api/auth/register/verify', json={'challenge':r.json()['challenge'], 'otp':otp_deliveries[email]})
    assert r.status_code == 200, r.text
    return r.json()


def set_admin(user_id):
    with SessionLocal() as db:
        db.get(User, user_id).role = 'admin'
        db.commit()


def grant_vip(client):
    user_id = client.get('/api/auth/me').json()['id']
    with SessionLocal() as db:
        db.get(User, user_id).membership_tier = 'vip'
        db.commit()


def grant_save(client):
    grant_vip(client)
    return client.put('/api/me/preferences', json={'name': 'Sinh viên', 'save_history': True, 'save_assessments': True}).json()


def test_auth_cookie_and_default_consent(client):
    user = register(client)
    assert not user['settings']['save_history']
    assert 'HttpOnly' in client.cookies.__repr__() or client.get('/api/auth/me').status_code == 200
    assert client.get('/api/admin/overview').status_code == 403
    assert client.get('/api/history').status_code == 403


def test_csrf_rejects_foreign_origin(client):
    r = client.post('/api/auth/login', headers={'Origin': 'https://attacker.invalid'}, json={'email': 'a@example.com', 'password': 'pw'})
    assert r.status_code == 403


@pytest.mark.parametrize('origin', ['http://localhost:3000', 'http://127.0.0.1:3000'])
def test_local_origin_alias_same_port(client, origin):
    r = client.post('/api/auth/login', headers={'Origin': origin}, json={'email': 'test@example.com', 'password': 'not-a-real-password'})
    assert r.status_code == 401


@pytest.mark.parametrize('origin', ['http://127.0.0.1:3001', 'http://localhost.attacker.invalid:3000', 'null', 'https://localhost:3000'])
def test_origin_alias_does_not_expand_trust(client, origin):
    r = client.post('/api/auth/login', headers={'Origin': origin}, json={'email': 'test@example.com', 'password': 'not-a-real-password'})
    assert r.status_code == 403


def test_old_client_header_gets_reload_instruction(client):
    r = client.post('/api/auth/login', headers={'X-Tuvantamly-Client': 'outdated'}, json={'email': 'test@example.com', 'password': 'not-a-real-password'})
    assert r.status_code == 403
    assert 'Ctrl + F5' in r.json()['detail']


def test_production_origin_remains_exact():
    from app.security import allowed_web_origins
    cfg = settings()
    old_origin, old_secure = cfg.app_origin, cfg.cookie_secure
    try:
        cfg.app_origin = 'https://example.com'
        cfg.cookie_secure = True
        assert allowed_web_origins() == {'https://example.com'}
    finally:
        cfg.app_origin, cfg.cookie_secure = old_origin, old_secure


def test_register_still_requires_privacy_consent(client):
    r = client.post('/api/auth/register', json={'name': 'A', 'email': 'a@example.com', 'password': 'strong-test-password', 'privacy_accepted': False})
    assert r.status_code == 422


def test_registration_does_not_require_or_assert_age(client):
    user = register(client)
    assert 'adult' not in user['settings']


def test_cross_account_private_record_protected(client):
    owner = register(client)
    with SessionLocal() as db:
        row = PrivateRecord(user_id=owner['id'], kind='conversation', encrypted_payload=encrypt({'title': 'Riêng tư', 'messages': []}))
        db.add(row); db.commit(); record_id = row.id
    register(client, 'other@example.com')
    grant_vip(client)
    for method in ('get', 'delete'):
        assert getattr(client, method)(f'/api/history/{record_id}').status_code == 404
    assert client.patch(f'/api/history/{record_id}', json={'title': 'x'}).status_code == 404


def test_admin_cannot_read_student_history(client):
    owner = register(client)
    with SessionLocal() as db:
        row = PrivateRecord(user_id=owner['id'], kind='assessment', encrypted_payload=encrypt({'result': {'score': 10}}))
        db.add(row); db.commit(); record_id = row.id
    admin = register(client, 'admin@example.com'); set_admin(admin['id'])
    assert client.get('/api/admin/overview').status_code == 200
    assert client.get(f'/api/history/{record_id}').status_code == 403
    assert client.get('/api/history').status_code == 403


def test_assessment_locked_by_default(client):
    register(client)
    assert client.get('/api/assessment').status_code == 503


@pytest.mark.parametrize('total,expected', [(0, 'Không đáng kể / Rất nhẹ'), (13, 'Không đáng kể / Rất nhẹ'), (14, 'Nhẹ'), (19, 'Nhẹ'), (20, 'Vừa'), (28, 'Vừa'), (29, 'Nặng'), (63, 'Nặng')])
def test_user_supplied_draft_boundaries(total, expected):
    definition = json.loads((Path(__file__).resolve().parents[2] / 'data/assessments/beck-user-supplied.draft.json').read_text(encoding='utf-8-sig'))
    answers = [0] * 21
    for i in range(21):
        answers[i] = min(total, 3); total -= answers[i]
    assert score_answers(answers, definition)['level'] == expected


def test_draft_requires_ack_and_saving_requires_consent(client):
    register(client); settings().allow_draft_assessment = True
    body = {'answers': [0] * 21}
    assert client.post('/api/assessment/submit', json=body).status_code == 422
    body['draft_acknowledged'] = True; body['save'] = True
    assert client.post('/api/assessment/submit', json=body).status_code == 403
    grant_save(client)
    result = client.post('/api/assessment/submit', json=body)
    assert result.status_code == 200
    assert result.json()['draft'] is True
    assert len(client.get('/api/history').json()) == 1


def test_assessment_invalid_answer_and_risk(client):
    register(client); settings().allow_draft_assessment = True
    body = {'answers': [0] * 21, 'draft_acknowledged': True}
    body['answers'][8] = 1
    assert client.post('/api/assessment/submit', json=body).json()['support_prompt'] is True
    body['answers'][2] = 7
    assert client.post('/api/assessment/submit', json=body).status_code == 422


def test_chat_missing_key_is_explicit(client):
    register(client)
    r = client.post('/api/chat', json={'messages': [{'role': 'user', 'content': 'Xin chào'}]})
    assert r.status_code == 503
    assert 'API key' in r.json()['detail']


def test_chat_encrypted_and_budget_enforced(client, monkeypatch):
    register(client); grant_save(client)
    settings().openai_api_key = 'test-not-a-real-key'; settings().openai_chat_model = 'test-model'
    settings().daily_ai_request_limit = 1
    monkeypatch.setattr(ai, 'safe_reply', AsyncMock(return_value=('Nội dung kiểm thử', False)))
    body = {'messages': [{'role': 'user', 'content': 'Nội dung tâm sự kiểm thử'}], 'save': True}
    r = client.post('/api/chat', json=body)
    assert r.status_code == 200
    assert 'Nội dung kiểm thử' in r.text
    with SessionLocal() as db:
        row = db.scalar(select(PrivateRecord))
        assert 'tâm sự' not in row.encrypted_payload
        assert decrypt(row.encrypted_payload)['messages'][0]['content'] == body['messages'][0]['content']
    assert client.post('/api/chat', json=body).status_code == 429


def test_no_consent_prevents_chat_save(client):
    register(client)
    r = client.post('/api/chat', json={'messages': [{'role': 'user', 'content': 'Xin chào'}], 'save': True})
    assert r.status_code == 403


def test_unpublished_content_hidden(client):
    user = register(client); set_admin(user['id'])
    body = {'kind': 'music', 'published': False, 'data': {'title': 'Nhạc kiểm thử', 'url': 'https://example.com/audio.mp3', 'category': 'Thử nghiệm', 'source_type': 'audio', 'rights_note': 'Chỉ dùng kiểm thử'}}
    r = client.post('/api/admin/content', json=body)
    assert r.status_code == 200, r.text
    viewer = register(client, 'viewer@gmail.com'); grant_vip(client)
    titles = lambda: [t['title'] for t in client.get('/api/content/music').json()]
    assert 'Nhạc kiểm thử' not in titles()
    client.post('/api/auth/login', json={'email': user['email'], 'password': 'strong-test-password'})
    body['published'] = True
    assert client.put('/api/admin/content/' + r.json()['id'], json=body).status_code == 200
    client.post('/api/auth/login', json={'email': viewer['email'], 'password': 'strong-test-password'})
    assert titles().count('Nhạc kiểm thử') == 1


def test_booking_confirmation_requires_real_confirmation(client):
    user = register(client); set_admin(user['id'])
    data = {'name': 'Hồ sơ chỉ dùng kiểm thử', 'degree': 'Kiểm thử', 'specialty': 'Kiểm thử', 'workplace': 'Môi trường kiểm thử', 'phone': '0900000000', 'verification_source': 'Dữ liệu kiểm thử tự động', 'verified_at': '2026-10-27'}
    r = client.post('/api/admin/content', json={'kind': 'experts', 'published': True, 'data': data})
    expert_id = r.json()['id']
    open_test_schedule(expert_id)
    student = register(client, 'booking-student@gmail.com'); grant_vip(client)
    body = {'expert_id': expert_id, 'starts_at': (now() + timedelta(days=2)).isoformat(), 'contact': '0901 234 567', 'consent_contact': True}
    r = client.post('/api/bookings', json=body)
    assert r.status_code == 200, r.text
    assert r.json()['status'] == 'pending'
    booking_id = r.json()['id']
    client.post('/api/auth/login', json={'email': user['email'], 'password': 'strong-test-password'})
    assert client.patch('/api/admin/bookings/' + booking_id, json={'status': 'confirmed'}).status_code == 422
    assert client.patch('/api/admin/bookings/' + booking_id, json={'status': 'confirmed', 'confirmation_received': True}).status_code == 200
    client.post('/api/auth/login', json={'email': student['email'], 'password': 'strong-test-password'})
    assert client.delete('/api/bookings/' + booking_id).status_code == 200


def test_student_edits_only_pending_booking(client):
    admin = register(client); set_admin(admin['id'])
    data = {'name': 'Hồ sơ chỉ dùng kiểm thử', 'degree': 'Kiểm thử', 'specialty': 'Kiểm thử', 'workplace': 'Môi trường kiểm thử', 'phone': '0900000000', 'verification_source': 'Dữ liệu kiểm thử tự động', 'verified_at': '2026-10-27'}
    expert_id = client.post('/api/admin/content', json={'kind': 'experts', 'published': True, 'data': data}).json()['id']
    open_test_schedule(expert_id)
    student = register(client, 'edit-student@gmail.com'); grant_vip(client)
    body = {'expert_id': expert_id, 'starts_at': (now() + timedelta(days=2)).isoformat(), 'contact': '0901 234 567', 'consent_contact': True}
    booking_id = client.post('/api/bookings', json=body).json()['id']
    new_time = (now() + timedelta(days=3)).replace(microsecond=0)
    r = client.patch('/api/bookings/' + booking_id, json={'starts_at': new_time.isoformat(), 'contact': '0912 000 111'})
    assert r.status_code == 200, r.text
    assert r.json()['status'] == 'pending' and datetime.fromisoformat(r.json()['starts_at']) == new_time
    with SessionLocal() as db:
        assert decrypt(db.get(Booking, booking_id).encrypted_contact)['value'] == '0912 000 111'
    # Leaving the phone out keeps the current number.
    assert client.patch('/api/bookings/' + booking_id, json={'starts_at': new_time.isoformat()}).status_code == 200
    with SessionLocal() as db:
        assert decrypt(db.get(Booking, booking_id).encrypted_contact)['value'] == '0912 000 111'
    assert client.patch('/api/bookings/' + booking_id, json={'starts_at': (now() - timedelta(days=1)).isoformat(), 'contact': '0912 000 111'}).status_code == 422
    assert client.patch('/api/bookings/' + booking_id, json={'starts_at': new_time.isoformat(), 'contact': 'not-a-phone'}).status_code == 422
    register(client, 'other-student@gmail.com'); grant_vip(client)
    assert client.patch('/api/bookings/' + booking_id, json={'starts_at': new_time.isoformat(), 'contact': '0912 000 111'}).status_code == 404
    client.post('/api/auth/login', json={'email': admin['email'], 'password': 'strong-test-password'})
    assert client.patch('/api/admin/bookings/' + booking_id, json={'status': 'confirmed', 'confirmation_received': True}).status_code == 200
    client.post('/api/auth/login', json={'email': student['email'], 'password': 'strong-test-password'})
    assert client.patch('/api/bookings/' + booking_id, json={'starts_at': new_time.isoformat(), 'contact': '0912 000 111'}).status_code == 409


def test_delete_account_revokes_session_and_data(client):
    register(client); grant_save(client); settings().allow_draft_assessment = True
    client.post('/api/assessment/submit', json={'answers': [0] * 21, 'draft_acknowledged': True, 'save': True})
    assert client.delete('/api/me').status_code == 200
    assert client.get('/api/auth/me').status_code == 401
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(PrivateRecord)) == 0


def test_admin_can_suspend_student_without_private_data_access(client):
    student = register(client)
    admin = register(client, 'admin@example.com'); set_admin(admin['id'])
    assert client.patch('/api/admin/users/' + student['id'], json={'is_active': False}).status_code == 200
    assert client.post('/api/auth/login', json={'email': student['email'], 'password': 'strong-test-password'}).status_code == 401
    assert client.patch('/api/admin/users/' + admin['id'], json={'is_active': False}).status_code == 409


def test_service_budget_limits_multiple_users(client, monkeypatch):
    settings().openai_api_key = 'test-not-a-real-key'; settings().openai_chat_model = 'test-model'
    settings().daily_service_request_limit = 1
    monkeypatch.setattr(ai, 'safe_reply', AsyncMock(return_value=('Nội dung kiểm thử', False)))
    register(client)
    body = {'messages': [{'role': 'user', 'content': 'Xin chào'}]}
    assert client.post('/api/chat', json=body).status_code == 200
    register(client, 'other@example.com')
    assert client.post('/api/chat', json=body).status_code == 429


from sqlalchemy import func


def test_new_customer_defaults_and_masked_admin_listing(client):
    student = register(client)
    assert student['membership_tier'] == 'normal'
    assert student['created_at']
    assert 'password_hash' not in student
    admin = register(client, 'manager@example.com'); set_admin(admin['id'])
    result = client.get('/api/admin/users')
    assert result.status_code == 200
    rows = result.json()
    assert len(rows) == 1 and rows[0]['id'] == student['id']
    assert rows[0]['email'] == student['email'] and rows[0]['stt'] == 1
    assert rows[0]['password_hash_masked'] == '•••••••• (Argon2)'
    assert 'password_hash' not in rows[0]
    assert '$argon2' not in result.text


def test_vip_is_admin_managed_and_does_not_grant_admin(client):
    student = register(client)
    assert client.patch('/api/admin/users/' + student['id'], json={'membership_tier': 'vip'}).status_code == 403
    admin = register(client, 'manager@example.com'); set_admin(admin['id'])
    result = client.patch('/api/admin/users/' + student['id'], json={'membership_tier': 'vip'})
    assert result.status_code == 200
    assert client.patch('/api/admin/users/' + student['id'], json={'membership_tier': 'admin'}).status_code == 422
    with SessionLocal() as db:
        customer = db.get(User, student['id'])
        assert customer.membership_tier == 'vip' and customer.role == 'student'
    client.post('/api/auth/login', json={'email':student['email'], 'password':'strong-test-password'})
    assert client.get('/api/auth/me').json()['membership_tier'] == 'vip'
    assert client.get('/api/admin/users').status_code == 403


def test_signup_cannot_self_assign_vip(client):
    payload={'email':'customer@gmail.com','password':'strong-test-password','name':'Sinh viên','privacy_accepted':True}
    for extra in ({'role':'admin'},{'role':'expert'},{'expert_id':'fake'},{'membership_tier':'vip'}):
        assert client.post('/api/auth/register',json={**payload,**extra}).status_code==422
    user=register(client,'customer@gmail.com')
    assert user['membership_tier']=='normal' and user['role']=='student' and user['expert_id'] is None


def test_customer_view_reflects_database_without_copying_accounts(client):
    student = register(client)
    from sqlalchemy import text
    with SessionLocal() as db:
        row = db.execute(text('SELECT stt, ten, email, mat_khau_bam, ngay_khoi_tao, phan_quyen FROM tai_khoan_khach_hang WHERE id=:id'), {'id':student['id']}).one()
        assert row.ten == student['name'] and row.email == student['email']
        assert row.mat_khau_bam.startswith('$argon2') and row.ngay_khoi_tao
        assert row.phan_quyen == 'Thường'


def test_existing_database_upgrade_preserves_records_and_unknown_dates():
    from sqlalchemy import create_engine, text
    from app.migrations import initialize_database
    target = create_engine('sqlite:///:memory:')
    with target.begin() as connection:
        connection.execute(text('CREATE TABLE users (id VARCHAR(36) PRIMARY KEY, email VARCHAR(254) UNIQUE NOT NULL, name VARCHAR(80) NOT NULL, password_hash TEXT NOT NULL, role VARCHAR(16) NOT NULL, is_active BOOLEAN NOT NULL, settings_json TEXT NOT NULL)'))
        for user_id, settings_json in [('known', '{"consented_at":"2025-01-02T03:04:05+00:00"}'), ('unknown','{}')]:
            connection.execute(text("INSERT INTO users VALUES (:id,:email,'Existing user','existing-hash','student',1,:settings)"), {'id':user_id,'email':user_id+'@example.com','settings':settings_json})
    initialize_database(target)
    initialize_database(target)
    with target.connect() as connection:
        rows = {row.id:row for row in connection.execute(text('SELECT id,password_hash,membership_tier,created_at,created_at_source FROM users'))}
        assert len(rows) == 2 and rows['known'].password_hash == 'existing-hash'
        assert rows['known'].membership_tier == 'normal'
        assert str(rows['known'].created_at).startswith('2025-01-02')
        assert rows['known'].created_at_source == 'consent_record'
        assert rows['unknown'].created_at is None
    target.dispose()


# OTP delivery is mocked: these tests never contact a real mailbox.
def begin_signup(client, **extra):
    return client.post('/api/auth/register', json={'name':'OTP student', 'email':'otp@gmail.com', 'password':'abcdefgh', 'privacy_accepted':True, **extra})


def test_otp_creates_account_only_after_verified_and_cannot_replay(client):
    from app.db import PendingRegistration
    start = begin_signup(client)
    assert start.status_code == 202
    token = start.json()['challenge']
    code = otp_deliveries['otp@gmail.com']
    assert code not in start.text
    assert client.get('/api/auth/me').status_code == 401
    with SessionLocal() as db:
        assert db.scalar(select(User)) is None
        pending = db.scalar(select(PendingRegistration))
        assert pending.password_hash != 'abcdefgh' and pending.password_hash.startswith('$argon2')
        assert pending.otp_hash != code and pending.challenge_hash != token
    result = client.post('/api/auth/register/verify', json={'challenge':token, 'otp':code})
    assert result.status_code == 200 and result.json()['email_verified'] is True
    assert client.post('/api/auth/register/verify', json={'challenge':token,'otp':code}).status_code == 400
    with SessionLocal() as db:
        assert db.scalar(select(PendingRegistration)) is None
        assert db.scalar(select(User)).email_verified_at is not None


def test_otp_wrong_attempts_lock_pending_request(client):
    token = begin_signup(client).json()['challenge']
    code = otp_deliveries['otp@gmail.com']
    wrong = '000000' if code != '000000' else '111111'
    for _ in range(5):
        assert client.post('/api/auth/register/verify', json={'challenge':token,'otp':wrong}).status_code == 400
    assert client.post('/api/auth/register/verify', json={'challenge':token,'otp':code}).status_code == 400
    with SessionLocal() as db:
        assert db.scalar(select(User)) is None


def test_otp_expires(client):
    from app.db import PendingRegistration
    token = begin_signup(client).json()['challenge']
    with SessionLocal() as db:
        db.scalar(select(PendingRegistration)).expires = now() - timedelta(seconds=1)
        db.commit()
    assert client.post('/api/auth/register/verify', json={'challenge':token,'otp':otp_deliveries['otp@gmail.com']}).status_code == 400
    with SessionLocal() as db:
        assert db.scalar(select(User)) is None


def test_otp_resend_cooldown_and_old_code_invalidated(client):
    from app.db import OtpRate
    old = begin_signup(client).json()['challenge']
    assert begin_signup(client).status_code == 429
    with SessionLocal() as db:
        for row in db.scalars(select(OtpRate)):
            row.last_sent = now() - timedelta(seconds=61)
        db.commit()
    new = begin_signup(client, previous_challenge=old)
    assert new.status_code == 202 and new.json()['challenge'] != old
    code = otp_deliveries['otp@gmail.com']
    assert client.post('/api/auth/register/verify', json={'challenge':old,'otp':code}).status_code == 400
    assert client.post('/api/auth/register/verify', json={'challenge':new.json()['challenge'],'otp':code}).status_code == 200


def test_otp_cancel_and_changed_email_invalidate_previous(client):
    old = begin_signup(client).json()['challenge']
    new = begin_signup(client, email='changed@gmail.com', previous_challenge=old).json()['challenge']
    assert client.post('/api/auth/register/verify', json={'challenge':old,'otp':otp_deliveries['otp@gmail.com']}).status_code == 400
    assert client.post('/api/auth/register/cancel', json={'challenge':new}).status_code == 200
    assert client.post('/api/auth/register/verify', json={'challenge':new,'otp':otp_deliveries['changed@gmail.com']}).status_code == 400


@pytest.mark.parametrize('email', ['student@school.edu.vn','student@yahoo.com','student@gmail.com.evil.com'])
def test_otp_rejects_non_gmail(client, email):
    assert begin_signup(client, email=email).status_code == 422
    assert not otp_deliveries


def test_otp_password_minimum_and_consent(client):
    assert begin_signup(client, password='1234567').status_code == 422
    assert begin_signup(client, privacy_accepted=False).status_code == 422
    assert begin_signup(client, password='12345678').status_code == 202


def test_otp_smtp_failure_creates_no_account_or_valid_pending(client, monkeypatch):
    from app.db import PendingRegistration
    def fail(*args):
        raise RuntimeError('Secret SMTP diagnostic must not escape')
    monkeypatch.setattr(registration, 'send_otp_email', fail)
    result = begin_signup(client)
    assert result.status_code == 503 and 'Secret SMTP' not in result.text
    with SessionLocal() as db:
        assert db.scalar(select(User)) is None
        assert db.scalar(select(PendingRegistration)) is None


def test_otp_missing_configuration_fails_closed(client):
    settings().smtp_password = ''
    assert begin_signup(client).status_code == 503
    assert not otp_deliveries


def test_otp_hourly_limit(client):
    from app.db import OtpRate
    begin_signup(client)
    with SessionLocal() as db:
        for row in db.scalars(select(OtpRate)):
            row.count = 5 if row.key.startswith('email:') else 100
            row.last_sent = now() - timedelta(seconds=61)
        db.commit()
    assert begin_signup(client).status_code == 429


def test_gmail_smtp_requires_tls_and_uses_app_password(client, monkeypatch):
    from unittest.mock import MagicMock
    smtp = MagicMock()
    monkeypatch.setattr(registration.smtplib, 'SMTP', smtp)
    settings().smtp_password = 'abcd efgh ijkl mnop'
    send_otp_email_real('receiver@gmail.com', '123456')
    transport = smtp.return_value.__enter__.return_value
    transport.starttls.assert_called_once()
    transport.login.assert_called_once_with('sender@gmail.com', 'abcdefghijklmnop')
    message = transport.send_message.call_args.args[0]
    assert message['To'] == 'receiver@gmail.com' and '123456' in message.get_content()



def begin_recovery(client):
    from app.db import OtpRate
    user = register(client)
    with SessionLocal() as db:
        for rate in db.scalars(select(OtpRate)):
            rate.last_sent = now() - timedelta(seconds=61)
        db.commit()
    result = client.post('/api/auth/forgot-password', json={'email':user['email']})
    assert result.status_code == 202, result.text
    return user, result.json()['challenge'], otp_deliveries['reset:' + user['email']]


def test_password_recovery_requires_otp_and_invalidates_sessions(client):
    from app.db import PendingPasswordReset, ResetToken
    user, challenge, code = begin_recovery(client)
    assert client.post('/api/auth/reset-password', json={'token':challenge,'password':'new-password-123'}).status_code == 400
    with SessionLocal() as db:
        assert db.scalar(select(ResetToken)) is None
        assert db.scalar(select(PendingPasswordReset)).otp_hash != code
    verified = client.post('/api/auth/forgot-password/verify', json={'challenge':challenge,'otp':code})
    assert verified.status_code == 200
    token = verified.json()['token']
    assert client.post('/api/auth/forgot-password/verify', json={'challenge':challenge,'otp':code}).status_code == 400
    assert client.post('/api/auth/reset-password', json={'token':token,'password':'short'}).status_code == 422
    assert client.post('/api/auth/reset-password', json={'token':token,'password':'new-password-123'}).status_code == 200
    assert client.get('/api/auth/me').status_code == 401
    assert client.post('/api/auth/reset-password', json={'token':token,'password':'other-password-123'}).status_code == 400
    assert client.post('/api/auth/login', json={'email':user['email'],'password':'strong-test-password'}).status_code == 401
    assert client.post('/api/auth/login', json={'email':user['email'],'password':'new-password-123'}).status_code == 200


def test_password_recovery_wrong_codes_lock_after_five(client):
    user, challenge, code = begin_recovery(client)
    wrong = '000000' if code != '000000' else '111111'
    for _ in range(5):
        assert client.post('/api/auth/forgot-password/verify', json={'challenge':challenge,'otp':wrong}).status_code == 400
    assert client.post('/api/auth/forgot-password/verify', json={'challenge':challenge,'otp':code}).status_code == 400


def test_password_recovery_expired_otp_and_old_link_rejected(client):
    from app.db import PendingPasswordReset, ResetToken
    from app.security import digest
    user, challenge, code = begin_recovery(client)
    with SessionLocal() as db:
        db.scalar(select(PendingPasswordReset)).expires = now() - timedelta(seconds=1)
        db.add(ResetToken(token_hash=digest('legacy-reset-token-123456789'), user_id=user['id'], expires=now()+timedelta(minutes=20)))
        db.commit()
    assert client.post('/api/auth/forgot-password/verify', json={'challenge':challenge,'otp':code}).status_code == 400
    assert client.post('/api/auth/reset-password', json={'token':'legacy-reset-token-123456789','password':'new-password-123'}).status_code == 400


def test_password_recovery_unknown_email_has_same_response_shape(client):
    response = client.post('/api/auth/forgot-password', json={'email':'unknown@gmail.com'})
    assert response.status_code == 202 and 'challenge' in response.json()
    assert not otp_deliveries
    assert client.post('/api/auth/forgot-password/verify', json={'challenge':response.json()['challenge'],'otp':'123456'}).status_code == 400


def test_password_recovery_resend_and_cancel(client):
    from app.db import OtpRate
    user, old, code = begin_recovery(client)
    assert client.post('/api/auth/forgot-password', json={'email':user['email']}).status_code == 429
    with SessionLocal() as db:
        for rate in db.scalars(select(OtpRate)): rate.last_sent = now() - timedelta(seconds=61)
        db.commit()
    new = client.post('/api/auth/forgot-password', json={'email':user['email'],'previous_challenge':old}).json()['challenge']
    assert client.post('/api/auth/forgot-password/verify', json={'challenge':old,'otp':code}).status_code == 400
    assert client.post('/api/auth/forgot-password/cancel', json={'challenge':new}).status_code == 200
    assert client.post('/api/auth/forgot-password/verify', json={'challenge':new,'otp':otp_deliveries['reset:'+user['email']]}).status_code == 400


def test_password_recovery_smtp_failure_invalidates_pending(client, monkeypatch):
    from app.db import PendingPasswordReset, OtpRate
    user = register(client)
    with SessionLocal() as db:
        for rate in db.scalars(select(OtpRate)): rate.last_sent = now() - timedelta(seconds=61)
        db.commit()
    def fail(*args): raise RuntimeError('private SMTP error')
    monkeypatch.setattr(recovery, 'send_reset_email', fail)
    result = client.post('/api/auth/forgot-password', json={'email':user['email']})
    assert result.status_code == 503 and 'private SMTP' not in result.text
    with SessionLocal() as db: assert db.scalar(select(PendingPasswordReset)) is None


def test_password_reset_grant_expires(client):
    from app.db import ResetToken
    user, challenge, code = begin_recovery(client)
    token = client.post('/api/auth/forgot-password/verify', json={'challenge':challenge,'otp':code}).json()['token']
    with SessionLocal() as db:
        db.scalar(select(ResetToken)).expires = now() - timedelta(seconds=1)
        db.commit()
    assert client.post('/api/auth/reset-password', json={'token':token,'password':'new-password-123'}).status_code == 400

@pytest.mark.parametrize('model,expected', [
    ('gpt-transcribe', {'extra_body': {'languages': ['vi']}}),
    ('gpt-transcribe-2026-10-01', {'extra_body': {'languages': ['vi']}}),
    ('gpt-4o-mini-transcribe', {'language': 'vi'}),
])
def test_voice_language_parameters_match_model(monkeypatch, model, expected):
    import asyncio
    import io
    from types import SimpleNamespace
    from starlette.datastructures import UploadFile, Headers
    from student import api_khach_hang as main
    create = AsyncMock(return_value=SimpleNamespace(text='Xin chào'))
    monkeypatch.setattr(main.ai, 'client', lambda: SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create))))
    monkeypatch.setattr(main, 'use_budget', lambda *args: None)
    monkeypatch.setattr(main, 'ensure_allowance', lambda *args, **kwargs: None)
    monkeypatch.setattr(main, 'consume_reply', lambda *args, **kwargs: None)
    monkeypatch.setattr(main, 'ensure_allowance', lambda *args, **kwargs: None)
    monkeypatch.setattr(main, 'consume_reply', lambda *args, **kwargs: None)
    monkeypatch.setattr(settings(), 'openai_transcribe_model', model)
    audio = UploadFile(io.BytesIO(b'test-audio'), filename='recording.webm', headers=Headers({'content-type': 'audio/webm'}))
    result = asyncio.run(main.transcribe(audio, user=object(), db=object()))
    assert result == {'text': 'Xin chào'}
    options = create.await_args.kwargs
    assert {key: value for key, value in options.items() if key not in ('model', 'file')} == expected


def test_empty_voice_does_not_call_provider(monkeypatch):
    import asyncio
    import io
    from fastapi import HTTPException
    from starlette.datastructures import UploadFile, Headers
    from student import api_khach_hang as main
    def unexpected_client():
        raise AssertionError('Empty audio must not call provider')
    monkeypatch.setattr(main.ai, 'client', unexpected_client)
    audio = UploadFile(io.BytesIO(b''), filename='recording.webm', headers=Headers({'content-type': 'audio/webm'}))
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.transcribe(audio, user=object(), db=object()))
    assert error.value.status_code == 422

@pytest.mark.parametrize('code,expected', [('credit_balance_exhausted', 'hết tín dụng'), ('rate_limit_exceeded', 'giới hạn số yêu cầu')])
def test_voice_provider_limit_message(monkeypatch, code, expected):
    import asyncio
    import io
    from types import SimpleNamespace
    from fastapi import HTTPException
    from starlette.datastructures import UploadFile, Headers
    from student import api_khach_hang as main
    error = RuntimeError('provider failure')
    error.status_code = 429
    error.code = code
    create = AsyncMock(side_effect=error)
    monkeypatch.setattr(main.ai, 'client', lambda: SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create))))
    monkeypatch.setattr(main, 'use_budget', lambda *args: None)
    monkeypatch.setattr(main, 'ensure_allowance', lambda *args, **kwargs: None)
    monkeypatch.setattr(main, 'consume_reply', lambda *args, **kwargs: None)
    monkeypatch.setattr(settings(), 'openai_transcribe_model', 'gpt-transcribe')
    audio = UploadFile(io.BytesIO(b'test-audio'), filename='recording.webm', headers=Headers({'content-type': 'audio/webm'}))
    with pytest.raises(HTTPException) as caught:
        asyncio.run(main.transcribe(audio, user=object(), db=object()))
    assert caught.value.status_code == 503
    assert expected in caught.value.detail


def test_voice_accepts_browser_codec_mime(monkeypatch):
    import asyncio
    import io
    from types import SimpleNamespace
    from starlette.datastructures import UploadFile, Headers
    from student import api_khach_hang as main
    create = AsyncMock(return_value=SimpleNamespace(text='Xin chào'))
    monkeypatch.setattr(main.ai, 'client', lambda: SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=create))))
    monkeypatch.setattr(main, 'use_budget', lambda *args: None)
    monkeypatch.setattr(main, 'ensure_allowance', lambda *args, **kwargs: None)
    monkeypatch.setattr(main, 'consume_reply', lambda *args, **kwargs: None)
    monkeypatch.setattr(settings(), 'openai_transcribe_model', 'gpt-transcribe')
    audio = UploadFile(io.BytesIO(b'audio'), filename='recording.webm', headers=Headers({'content-type': 'audio/webm;codecs=opus'}))
    assert asyncio.run(main.transcribe(audio, user=object(), db=object())) == {'text': 'Xin chào'}
    assert create.await_args.kwargs['file'][2] == 'audio/webm'


def test_voice_speech_returns_playable_audio_with_preferences(monkeypatch):
    import asyncio
    from types import SimpleNamespace
    from student import api_khach_hang as main
    create = AsyncMock(return_value=SimpleNamespace(content=b'mocked-mp3-audio'))
    monkeypatch.setattr(main.ai, 'client', lambda: SimpleNamespace(audio=SimpleNamespace(speech=SimpleNamespace(create=create))))
    monkeypatch.setattr(main.ai, 'moderate', AsyncMock(return_value=SimpleNamespace(flagged=False)))
    monkeypatch.setattr(main, 'use_budget', lambda *args: None)
    monkeypatch.setattr(main, 'ensure_allowance', lambda *args, **kwargs: None)
    monkeypatch.setattr(main, 'consume_reply', lambda *args, **kwargs: None)
    monkeypatch.setattr(settings(), 'openai_tts_model', 'gpt-4o-mini-tts')
    monkeypatch.setattr(settings(), 'openai_tts_instructions_supported', True)
    result = asyncio.run(main.speak(main.Speak(text='Mình đang lắng nghe.', voice='sage', speed=0.9, voice_style='calm'), user=object(), db=object()))
    assert result.media_type == 'audio/mpeg'
    assert result.body == b'mocked-mp3-audio'
    options = create.await_args.kwargs
    assert options['voice'] == 'sage' and options['speed'] == 0.9
    assert options['response_format'] == 'mp3' and 'calmly' in options['instructions']


def test_result_guidance_prioritizes_risk_even_with_low_score():
    from app.assessment_guidance import result_guidance
    result = result_guidance({'level': 'Không đáng kể / Rất nhẹ', 'support_prompt': True})
    assert 'an toàn' in result['safety_message']
    assert len(result['suggestions']) == 3


@pytest.mark.parametrize('level', ['Vừa', 'Nặng'])
def test_result_guidance_encourages_professional_support(level):
    from app.assessment_guidance import result_guidance
    result = result_guidance({'level': level, 'support_prompt': False})
    assert any('chuyên gia' in suggestion or 'chuyên viên' in suggestion for suggestion in result['suggestions'])
    assert result['safety_message'] is None


def test_draft_guidance_does_not_present_clinical_interpretation():
    from app.assessment_guidance import result_guidance
    result = result_guidance({'level': 'Nặng', 'support_prompt': False}, draft=True)
    assert 'chưa được xác minh' in result['explanation']
    assert 'không phải là chẩn đoán' in result['explanation']


def test_assessment_ai_failure_keeps_guidance_and_risk(client, monkeypatch):
    register(client)
    settings().allow_draft_assessment = True
    monkeypatch.setattr(ai, 'client', lambda: (_ for _ in ()).throw(RuntimeError('offline')))
    answers = [0] * 21
    answers[8] = 1
    result = client.post('/api/assessment/submit', json={'answers': answers, 'draft_acknowledged': True}).json()
    assert result['support_prompt'] and result['safety_message']
    reply = client.post('/api/assessment/explain', json={'answers': answers})
    assert reply.status_code == 200 and reply.json()['fallback']
    assert reply.json()['encouragement']


def test_assessment_ai_receives_no_identity_and_no_draft_severity(client, monkeypatch):
    from types import SimpleNamespace
    register(client)
    settings().allow_draft_assessment = True
    settings().openai_chat_model = 'mock'
    create = AsyncMock(return_value=SimpleNamespace(output_text='Cảm ơn bạn đã lắng nghe bản thân.'))
    monkeypatch.setattr(ai, 'client', lambda: SimpleNamespace(responses=SimpleNamespace(create=create)))
    monkeypatch.setattr(ai, 'moderate', AsyncMock(return_value=SimpleNamespace(flagged=False)))
    response = client.post('/api/assessment/explain', json={'answers': [0] * 21})
    assert response.status_code == 200 and not response.json()['fallback']
    payload = json.loads(create.await_args.kwargs['input'])
    assert set(payload) == {'risk_flags', 'unverified_preview'}
    assert create.await_args.kwargs['store'] is False


def test_config_flags_alone_do_not_verify_draft_version():
    from student.api_khach_hang import assessment_verified
    settings().assessment_rights_verified = True
    settings().assessment_clinical_reviewed = True
    assert not assessment_verified({'instrument': 'unverified', 'published': False})


def test_explicit_risk_flag_outside_ninth_item_is_respected():
    definition = json.loads((Path(__file__).resolve().parents[2] / 'data/assessments/beck-user-supplied.draft.json').read_text(encoding='utf-8-sig'))
    definition['items'][0]['options'][1]['risk_flag'] = 'self_harm'
    answers = [0] * 21
    answers[0] = 1
    assert score_answers(answers, definition)['support_prompt']



def test_session_checks_do_not_exhaust_login_budget(client):
    register(client)
    for _ in range(24):
        assert client.get('/api/auth/me').status_code == 200
    response = client.post('/api/auth/login', json={'email': 'nobody@gmail.com', 'password': 'Wrong-password-123'})
    assert response.status_code == 401


def test_login_rate_limit_still_blocks_abuse(client):
    responses = [client.post('/api/auth/login', json={'email': 'nobody@gmail.com', 'password': 'Wrong-password-123'}) for _ in range(16)]
    assert responses[-1].status_code == 429
    assert int(responses[-1].headers['Retry-After']) > 0

@pytest.mark.parametrize('url', ['/api/history', '/api/content/experts', '/api/content/music'])
def test_normal_plan_cannot_access_vip_endpoints(client, url):
    register(client)
    assert client.get(url).status_code == 403
    assert client.get('/api/content/support').status_code == 200


def test_normal_plan_can_assess_but_cannot_save_preferences(client):
    register(client)
    settings().allow_draft_assessment = True
    assert client.get('/api/assessment').status_code == 200
    assert client.put('/api/me/preferences', json={'name':'Student'}).status_code == 403
    assert client.get('/api/membership/status').json()['remaining_questions'] == 20


def test_twenty_question_limit_is_shared_and_persistent(client, monkeypatch):
    register(client)
    settings().openai_chat_model = 'mock'
    monkeypatch.setattr(ai, 'client', lambda: object())
    monkeypatch.setattr(ai, 'safe_reply', AsyncMock(return_value=('Phản hồi thử.', False)))
    for _ in range(20):
        response = client.post('/api/chat', json={'messages':[{'role':'user','content':'Xin chào'}]})
        assert response.status_code == 200
    assert client.post('/api/chat', json={'messages':[{'role':'user','content':'Tiếp tục'}]}).status_code == 403
    assert client.get('/api/membership/status').json()['remaining_questions'] == 0
    assert client.post('/api/voice/transcribe', files={'file':('a.webm',b'audio','audio/webm')}).status_code == 403


def test_vip_has_two_hundred_daily_questions(client, monkeypatch):
    from app.db import PlanUsage
    register(client)
    grant_vip(client)
    settings().openai_chat_model = 'mock'
    monkeypatch.setattr(ai, 'client', lambda: object())
    monkeypatch.setattr(ai, 'safe_reply', AsyncMock(return_value=('Phản hồi thử.', False)))
    status = client.get('/api/membership/status').json()
    assert status['daily_question_limit'] == 200 and status['remaining_questions'] == 200
    assert client.post('/api/chat', json={'messages':[{'role':'user','content':'Xin chào'}]}).status_code == 200
    assert client.get('/api/membership/status').json()['remaining_questions'] == 199
    with SessionLocal() as db:
        db.scalar(select(PlanUsage)).questions = 200
        db.commit()
    assert client.post('/api/chat', json={'messages':[{'role':'user','content':'Tiếp tục'}]}).status_code == 403
    status = client.get('/api/membership/status').json()
    assert status['remaining_questions'] == 0 and status['exhausted'] is True


def test_active_time_pauses_and_does_not_double_count_tabs(client, monkeypatch):
    from student import goi_thanh_vien as membership
    from datetime import datetime, timezone
    register(client)
    clock = [datetime(2026,10,28,5,0,tzinfo=timezone.utc)]
    monkeypatch.setattr(membership, 'now', lambda: clock[0])
    def beat(active=True, tab='a'):
        return client.post('/api/membership/heartbeat', json={'active':active, 'client_id':tab}).json()
    assert beat()['remaining_seconds'] == 600
    clock[0] += timedelta(seconds=10)
    assert beat(tab='b')['remaining_seconds'] == 590
    assert beat(False, 'a')['remaining_seconds'] == 590  # hidden old tab cannot stop b
    clock[0] += timedelta(seconds=10)
    assert beat(False, 'b')['remaining_seconds'] == 580
    clock[0] += timedelta(minutes=5)
    assert beat()['remaining_seconds'] == 580


def test_time_limit_and_vietnam_midnight_reset(client, monkeypatch):
    from student import goi_thanh_vien as membership
    from app.db import PlanUsage
    from datetime import datetime, timezone
    user = register(client)
    clock = [datetime(2026,10,28,16,59,50,tzinfo=timezone.utc)]
    monkeypatch.setattr(membership, 'now', lambda: clock[0])
    client.post('/api/membership/heartbeat', json={'active':True})
    with SessionLocal() as db:
        row = db.scalar(select(PlanUsage).where(PlanUsage.user_id == user['id']))
        row.active_seconds = 595
        db.commit()
    clock[0] += timedelta(seconds=6)
    status = client.post('/api/membership/heartbeat', json={'active':True}).json()
    assert status['exhausted'] and status['remaining_seconds'] == 0
    clock[0] += timedelta(seconds=5)  # midnight in Vietnam, still same UTC day
    status = client.get('/api/membership/status').json()
    assert not status['exhausted'] and status['remaining_seconds'] == 600 and status['day'] == '2026-10-29'


def test_demo_upgrade_requires_enabled_mode_and_explicit_ack(client):
    register(client)
    body = {'method':'momo','acknowledge_demo':True}
    assert client.post('/api/membership/demo-upgrade', json=body).status_code == 403
    settings().membership_demo_enabled = True
    assert client.post('/api/membership/demo-upgrade', json={**body,'acknowledge_demo':False}).status_code == 422
    response = client.post('/api/membership/demo-upgrade', json=body)
    assert response.status_code == 200
    status = response.json()
    assert status['tier'] == 'vip' and status['demo'] and status['expires_at']
    assert client.post('/api/membership/demo-upgrade', json=body).json()['expires_at'] == status['expires_at']
    assert client.get('/api/history').status_code == 200


def test_vip_expiry_revokes_permissions_without_deleting_data(client):
    user = register(client)
    with SessionLocal() as db:
        record = db.get(User, user['id'])
        record.membership_tier = 'vip'
        record.vip_expires_at = now() - timedelta(seconds=1)
        db.commit()
    assert client.get('/api/auth/me').json()['membership_tier'] == 'normal'
    assert client.get('/api/history').status_code == 403
    assert client.get('/api/membership/status').json()['tier'] == 'normal'


def test_free_voice_output_only_for_completed_chat_reply_and_once(client, monkeypatch):
    from types import SimpleNamespace
    register(client)
    settings().openai_chat_model = 'mock'
    monkeypatch.setattr(ai, 'client', lambda: object())
    monkeypatch.setattr(ai, 'safe_reply', AsyncMock(return_value=('Phản hồi mẫu.', False)))
    assert client.post('/api/voice/speak', json={'text':'Không có lượt hỏi'}).status_code == 403
    assert client.post('/api/chat', json={'messages':[{'role':'user','content':'Xin chào'}]}).status_code == 200
    create = AsyncMock(return_value=SimpleNamespace(content=b'audio'))
    monkeypatch.setattr(ai, 'client', lambda: SimpleNamespace(audio=SimpleNamespace(speech=SimpleNamespace(create=create))))
    monkeypatch.setattr(ai, 'moderate', AsyncMock(return_value=SimpleNamespace(flagged=False)))
    settings().openai_tts_model = 'mock'
    assert client.post('/api/voice/speak', json={'text':'Phản hồi mẫu.'}).status_code == 200
    assert client.post('/api/voice/speak', json={'text':'Phản hồi mẫu.'}).status_code == 403
    assert client.get('/api/membership/status').json()['remaining_questions'] == 19


def open_test_schedule(expert_id):
    from app.db import ExpertAvailability
    with SessionLocal() as db:
        db.merge(ExpertAvailability(expert_id=expert_id, weekly_json=json.dumps([{'weekday':day,'start':'00:00','end':'24:00'} for day in range(7)])))
        db.commit()


def create_expert_profile(client):
    data = {'name': 'Hồ sơ chỉ dùng kiểm thử', 'degree': 'Kiểm thử', 'specialty': 'Kiểm thử', 'workplace': 'Môi trường kiểm thử', 'phone': '0900000000', 'verification_source': 'Dữ liệu kiểm thử tự động', 'verified_at': '2026-10-27'}
    expert_id = client.post('/api/admin/content', json={'kind': 'experts', 'published': True, 'data': data}).json()['id']
    open_test_schedule(expert_id)
    return expert_id


def test_admin_creates_staff_accounts_with_passwords(client):
    admin = register(client, 'manager@example.com'); set_admin(admin['id'])
    expert_id = create_expert_profile(client)
    staff = {'name': 'Quản trị kiểm thử', 'email': 'ops@school.edu.vn', 'password': 'admin-test-password', 'role': 'admin'}
    assert client.post('/api/admin/staff', json={**staff, 'password': 'short'}).status_code == 422
    assert client.post('/api/admin/staff', json=staff).status_code == 422
    expert = {'name': 'Chuyên gia kiểm thử', 'email': 'expert@school.edu.vn', 'password': 'expert-test-password', 'role': 'expert'}
    assert client.post('/api/admin/staff', json=expert).status_code == 422
    r = client.post('/api/admin/staff', json={**expert, 'expert_id': expert_id})
    assert r.status_code == 201, r.text
    expert_account = r.json()
    assert expert_account['expert_name'] == 'Hồ sơ chỉ dùng kiểm thử'
    assert client.post('/api/admin/staff', json={**expert, 'email': 'other@school.edu.vn', 'expert_id': expert_id}).status_code == 409
    profile = next(c for c in client.get('/api/admin/content/experts').json() if c['id'] == expert_id)
    assert profile['account_email'] == 'expert@school.edu.vn' and profile['created']
    assert {a['email'] for a in client.get('/api/admin/staff').json()} == {'manager@gmail.com', 'expert@school.edu.vn'}
    assert client.get('/api/admin/users').json() == []
    assert client.patch('/api/admin/users/' + expert_account['id'], json={'is_active': False}).status_code == 409
    assert client.patch('/api/admin/staff/' + admin['id'], json={'is_active': False}).status_code == 409
    # A linked profile is hidden instead of deleted so the account keeps its link.
    assert client.delete('/api/admin/content/' + expert_id).status_code == 200
    with SessionLocal() as db:
        assert db.get(Content, expert_id) is not None
    assert client.patch('/api/admin/staff/' + expert_account['id'], json={'password': 'expert-new-password'}).status_code == 200
    assert client.post('/api/auth/login', json={'email': 'expert@school.edu.vn', 'password': 'expert-test-password'}).status_code == 401
    me = client.post('/api/auth/login', json={'email': 'expert@school.edu.vn', 'password': 'expert-new-password'})
    assert me.status_code == 200 and me.json()['role'] == 'expert' and me.json()['expert_id'] == expert_id
    assert client.get('/api/admin/staff').status_code == 403
    assert client.post('/api/admin/staff', json={**staff, 'email': 'x@school.edu.vn'}).status_code == 403


def test_expert_manages_only_own_bookings(client):
    admin = register(client, 'manager@example.com'); set_admin(admin['id'])
    own, other = create_expert_profile(client), create_expert_profile(client)
    client.post('/api/admin/staff', json={'name': 'Chuyên gia kiểm thử', 'email': 'expert@school.edu.vn', 'password': 'expert-test-password', 'role': 'expert', 'expert_id': own})
    register(client); grant_vip(client)
    starts = (now() + timedelta(days=2)).isoformat()
    mine = client.post('/api/bookings', json={'expert_id': own, 'starts_at': starts, 'contact': '0901 111 222', 'consent_contact': True}).json()['id']
    theirs = client.post('/api/bookings', json={'expert_id': other, 'starts_at': starts, 'contact': '0901 333 444', 'consent_contact': True}).json()['id']
    assert client.get('/api/expert/bookings').status_code == 403
    client.post('/api/auth/login', json={'email': 'expert@school.edu.vn', 'password': 'expert-test-password'})
    rows = client.get('/api/expert/bookings').json()
    assert [r['id'] for r in rows] == [mine] and rows[0]['contact']['value'] == '0901 111 222'
    assert client.patch('/api/expert/bookings/' + theirs, json={'status': 'confirmed'}).status_code == 404
    assert client.patch('/api/expert/bookings/' + mine, json={'status': 'completed'}).status_code == 409
    assert client.patch('/api/expert/bookings/' + mine, json={'status': 'confirmed'}).status_code == 200
    # Completing a future appointment without attendance/start is forbidden.
    assert client.patch('/api/expert/bookings/' + mine, json={'status': 'completed'}).status_code == 409
    assert client.get('/api/admin/bookings').status_code == 403
    assert client.get('/api/history').status_code == 403


def test_staff_database_views(client):
    from sqlalchemy import text
    admin = register(client, 'manager@example.com'); set_admin(admin['id'])
    expert_id = create_expert_profile(client)
    client.post('/api/admin/staff', json={'name': 'Chuyên gia kiểm thử', 'email': 'expert@school.edu.vn', 'password': 'expert-test-password', 'role': 'expert', 'expert_id': expert_id})
    register(client)
    with engine.connect() as connection:
        admins = connection.execute(text('SELECT email, trang_thai FROM tai_khoan_admin')).all()
        experts = connection.execute(text('SELECT email, ho_so_chuyen_gia, chuyen_mon, so_lich_hen FROM tai_khoan_chuyen_gia')).all()
        customers = connection.execute(text('SELECT email FROM tai_khoan_khach_hang')).all()
    assert admins == [('manager@gmail.com', 'Đang hoạt động')]
    assert experts == [('expert@school.edu.vn', 'Hồ sơ chỉ dùng kiểm thử', 'Kiểm thử', 0)]
    assert customers == [('student@gmail.com',)]


def test_admin_dashboard_aggregates_without_private_data(client, monkeypatch):
    settings().openai_api_key = 'test-not-a-real-key'; settings().openai_chat_model = 'test-model'
    monkeypatch.setattr(ai, 'safe_reply', AsyncMock(return_value=('Nội dung riêng tư kiểm thử', False)))
    register(client)
    assert client.post('/api/chat', json={'messages': [{'role': 'user', 'content': 'Tâm sự bí mật'}]}).status_code == 200
    assert client.get('/api/admin/dashboard').status_code == 403
    admin = register(client, 'manager@example.com'); set_admin(admin['id'])
    expert_id = create_expert_profile(client)
    register(client, 'vip@example.com'); grant_vip(client)
    starts = (now() + timedelta(days=1)).isoformat()
    assert client.post('/api/bookings', json={'expert_id': expert_id, 'starts_at': starts, 'contact': '0901 555 666', 'consent_contact': True}).status_code == 200
    client.post('/api/auth/login', json={'email': 'manager@gmail.com', 'password': 'strong-test-password'})
    r = client.get('/api/admin/dashboard')
    assert r.status_code == 200, r.text
    data = r.json()
    assert data['stats']['students']['total'] == 2
    assert data['stats']['experts'] == {'published': 1, 'accounts': 0}
    assert data['stats']['ai_requests']['total'] == 1
    assert data['accounts'] == {'normal': 1, 'vip': 1, 'expert': 0, 'admin': 1}
    assert len(data['series']) == 7 and data['series'][-1]['new_users'] == 2
    assert data['pending_bookings'] == 1 and data['upcoming_bookings'][0]['expert_name'] == 'Hồ sơ chỉ dùng kiểm thử'
    assert 'bí mật' not in r.text and 'riêng tư' not in r.text and '0901 555 666' not in r.text


def test_music_library_seeded_once_and_admin_managed(client):
    from app.migrations import initialize_database
    user = register(client); set_admin(user['id'])
    rows = client.get('/api/admin/content/music').json()
    assert len(rows) == 60 and all(r['published'] for r in rows)
    first = rows[0]
    assert first['data']['library_id'] == 'builtin-rain' and first['data']['cover_atlas'].startswith('/images/music-covers/')
    assert {r['data']['category'] for r in rows} == {'Thư giãn', 'Giảm căng thẳng', 'Tập trung', 'Dễ ngủ', 'Chữa lành', 'Tích cực'}
    hidden = client.put('/api/admin/content/' + first['id'], json={'kind': 'music', 'published': False, 'data': {**first['data'], 'title': 'Mưa đã sửa'}})
    assert hidden.status_code == 200, hidden.text
    assert client.delete('/api/admin/content/' + rows[1]['id']).status_code == 200
    initialize_database()
    after = client.get('/api/admin/content/music').json()
    assert len(after) == 59
    edited = next(r for r in after if r['id'] == first['id'])
    assert edited['data']['title'] == 'Mưa đã sửa' and edited['data']['cover_atlas'] == first['data']['cover_atlas']
    register(client, 'music-viewer@gmail.com'); grant_vip(client)
    public = client.get('/api/content/music').json()
    assert len(public) == 58 and first['id'] not in {t['id'] for t in public}
    assert 'rights_note' not in public[0]


def test_admin_manages_registered_students_but_cannot_create_them(client):
    student=register(client);grant_save(client)
    body={'name':'Sinh viên mới','email':'new@school.edu.vn','password':'student-pass-123','membership_tier':'vip'}
    assert client.post('/api/admin/users',json=body).status_code==403
    admin=register(client,'manager@example.com');set_admin(admin['id'])
    assert client.post('/api/admin/users',json=body).status_code==405
    assert client.patch('/api/admin/users/'+student['id'],json={'name':'Tên đã sửa','membership_tier':'vip'}).status_code==200
    assert client.patch('/api/admin/users/'+student['id'],json={'name':' '}).status_code==422
    rows={u['id']:u for u in client.get('/api/admin/users').json()}
    assert rows[student['id']]['name']=='Tên đã sửa' and rows[student['id']]['vip_expires_at']
    assert 'new@school.edu.vn' not in {u['email'] for u in rows.values()}
    assert client.delete('/api/admin/users/'+admin['id']).status_code==404
    assert client.delete('/api/admin/users/'+student['id']).status_code==200
    with SessionLocal() as db:
        assert db.get(User,student['id']) is None
        assert db.scalar(select(func.count()).select_from(PrivateRecord).where(PrivateRecord.user_id==student['id']))==0


def test_admin_renames_and_deletes_staff(client):
    admin = register(client, 'manager@example.com'); set_admin(admin['id'])
    expert_id = create_expert_profile(client)
    staff = client.post('/api/admin/staff', json={'name': 'Chuyên gia kiểm thử', 'email': 'expert@school.edu.vn', 'password': 'expert-test-password', 'role': 'expert', 'expert_id': expert_id}).json()
    assert client.patch('/api/admin/staff/' + staff['id'], json={'name': '  Tên mới  '}).json()['name'] == 'Tên mới'
    assert client.patch('/api/admin/staff/' + staff['id'], json={'name': ' '}).status_code == 422
    assert client.delete('/api/admin/staff/' + admin['id']).status_code == 409
    assert client.delete('/api/admin/staff/' + staff['id']).status_code == 200
    assert client.delete('/api/admin/staff/' + staff['id']).status_code == 404
    assert [a['email'] for a in client.get('/api/admin/staff').json()] == ['manager@gmail.com']
    assert client.post('/api/auth/login', json={'email': 'expert@school.edu.vn', 'password': 'expert-test-password'}).status_code == 401
    # The profile is free to link to a new account again.
    assert client.post('/api/admin/staff', json={'name': 'Tài khoản mới', 'email': 'new-expert@school.edu.vn', 'password': 'expert-test-password', 'role': 'expert', 'expert_id': expert_id}).status_code == 201


def test_admin_creates_edits_and_deletes_booking(client):
    student = register(client)
    admin = register(client, 'manager@example.com'); set_admin(admin['id'])
    expert_id = create_expert_profile(client)
    starts = (now() + timedelta(days=3)).replace(microsecond=0)
    body = {'user_id': student['id'], 'expert_id': expert_id, 'starts_at': starts.isoformat(), 'mode': 'online', 'topic': 'Căng thẳng học tập', 'contact': '0901 777 888'}
    assert client.post('/api/admin/bookings', json={**body, 'user_id': admin['id']}).status_code == 404
    assert client.post('/api/admin/bookings', json={**body, 'duration_minutes': 5}).status_code == 422
    r = client.post('/api/admin/bookings', json=body)
    assert r.status_code == 201, r.text
    booking_id = r.json()['id']
    row = next(b for b in client.get('/api/admin/bookings').json() if b['id'] == booking_id)
    assert row['student_name'] == 'Sinh viên kiểm thử' and row['mode'] == 'online' and row['duration_minutes'] == 30
    assert row['topic'] == 'Căng thẳng học tập' and row['status'] == 'pending'
    with SessionLocal() as db:
        assert 'Căng thẳng' not in db.get(Booking, booking_id).encrypted_details
    later = (starts + timedelta(hours=2)).isoformat()
    assert client.patch('/api/admin/bookings/' + booking_id, json={'starts_at': later, 'duration_minutes': 20, 'mode': 'offline', 'topic': ''}).status_code == 200
    row = next(b for b in client.get('/api/admin/bookings').json() if b['id'] == booking_id)
    assert row['starts_at'] == later and row['duration_minutes'] == 20 and row['mode'] == 'offline' and row['topic'] == ''
    assert client.patch('/api/admin/bookings/' + booking_id, json={'status': 'confirmed'}).status_code == 422
    assert client.patch('/api/admin/bookings/' + booking_id, json={'status': 'confirmed', 'confirmation_received': True}).status_code == 200
    assert client.patch('/api/admin/bookings/' + booking_id, json={'starts_at': starts.isoformat()}).status_code == 409
    assert client.patch('/api/admin/bookings/' + booking_id, json={}).status_code == 422
    # Students see their booking without the encrypted topic or contact.
    client.post('/api/auth/login', json={'email': student['email'], 'password': 'strong-test-password'})
    grant_vip(client)
    mine = client.get('/api/bookings').json()
    assert mine[0]['id'] == booking_id and 'topic' not in mine[0] and 'contact' not in mine[0]
    client.post('/api/auth/login', json={'email': 'manager@gmail.com', 'password': 'strong-test-password'})
    assert client.delete('/api/admin/bookings/' + booking_id).status_code == 200
    assert client.get('/api/admin/bookings').json() == []


def test_support_types_and_website_only_resources(client):
    admin = register(client, 'manager@example.com'); set_admin(admin['id'])
    base = {'title': 'Đơn vị kiểm thử', 'description': 'Chỉ dùng kiểm thử', 'region': 'Toàn quốc', 'hours': '24/7', 'verification_source': 'https://example.com/source', 'verified_at': '2026-10-31'}
    assert client.post('/api/admin/content', json={'kind': 'support', 'published': True, 'data': base}).status_code == 422
    assert client.post('/api/admin/content', json={'kind': 'support', 'published': True, 'data': {**base, 'website': 'http://example.com'}}).status_code == 422
    r = client.post('/api/admin/content', json={'kind': 'support', 'published': True, 'data': {**base, 'support_type': 'resource', 'website': 'https://example.com/help'}})
    assert r.status_code == 200, r.text
    hotline = client.post('/api/admin/content', json={'kind': 'support', 'published': False, 'data': {**base, 'title': 'Đường dây kiểm thử', 'support_type': 'hotline', 'phone': '1900 6190'}})
    assert hotline.status_code == 200
    public = client.get('/api/content/support').json()
    assert [s['support_type'] for s in public] == ['resource'] and public[0]['website'] == 'https://example.com/help' and public[0]['phone'] is None
    assert 'verification_source' not in public[0]


def test_expert_portal_profile_students_and_private_notes(client):
    from app.db import ExpertNote
    admin = register(client, 'manager@example.com'); set_admin(admin['id'])
    own, other = create_expert_profile(client), create_expert_profile(client)
    for email, profile in [('expert@school.edu.vn', own), ('other@school.edu.vn', other)]:
        client.post('/api/admin/staff', json={'name': 'Chuyên gia', 'email': email, 'password': 'expert-test-password', 'role': 'expert', 'expert_id': profile})
    student = register(client); grant_vip(client)
    starts = (now() + timedelta(days=1)).isoformat()
    booking_id = client.post('/api/bookings', json={'expert_id': own, 'starts_at': starts, 'contact': '0901 999 000', 'consent_contact': True}).json()['id']
    client.post('/api/auth/login', json={'email': 'expert@school.edu.vn', 'password': 'expert-test-password'})
    assert client.get('/api/expert/profile').json()['name'] == 'Hồ sơ chỉ dùng kiểm thử'
    rows = client.get('/api/expert/bookings').json()
    assert rows[0]['student_name'] == 'Sinh viên kiểm thử' and rows[0]['has_note'] is False
    assert client.put(f'/api/expert/bookings/{booking_id}/note', json={'body': ''}).status_code == 422
    assert client.put(f'/api/expert/bookings/{booking_id}/note', json={'body': 'Ghi chú riêng tư'}).status_code == 200
    assert client.get(f'/api/expert/bookings/{booking_id}/note').json()['body'] == 'Ghi chú riêng tư'
    assert client.get('/api/expert/bookings').json()[0]['has_note'] is True
    assert [n['body'] for n in client.get('/api/expert/notes').json()] == ['Ghi chú riêng tư']
    with SessionLocal() as db:
        assert 'riêng tư' not in db.scalar(select(ExpertNote)).encrypted_body
    # Another expert cannot reach the booking or its note.
    client.post('/api/auth/login', json={'email': 'other@school.edu.vn', 'password': 'expert-test-password'})
    assert client.get(f'/api/expert/bookings/{booking_id}/note').status_code == 404
    assert client.get('/api/expert/notes').json() == []
    # Admin has no note endpoint and deleting the student also removes the note.
    client.post('/api/auth/login', json={'email': 'manager@gmail.com', 'password': 'strong-test-password'})
    assert 'Ghi chú riêng tư' not in client.get('/api/admin/bookings').text
    assert client.delete('/api/admin/users/' + student['id']).status_code == 200
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(ExpertNote)) == 0


def test_booking_contact_must_be_a_phone_number(client):
    admin = register(client, 'manager@example.com'); set_admin(admin['id'])
    expert_id = create_expert_profile(client)
    register(client); grant_vip(client)
    starts = (now() + timedelta(days=1)).isoformat()
    for contact in ['student@gmail.com', 'goi cho minh', '123']:
        assert client.post('/api/bookings', json={'expert_id': expert_id, 'starts_at': starts, 'contact': contact, 'consent_contact': True}).status_code == 422
    assert client.post('/api/bookings', json={'expert_id': expert_id, 'starts_at': starts, 'contact': '+84 901 234 567', 'consent_contact': True}).status_code == 200


def test_health_reports_configuration(client):
    r = client.get('/api/health')
    assert r.status_code == 200, r.text
    assert r.json()['status'] == 'ok' and r.json()['assessment_enabled'] is False


def test_expert_and_admin_cannot_use_student_apis(client):
    admin=register(client,'manager@example.com');set_admin(admin['id'])
    profile=create_expert_profile(client)
    assert client.post('/api/admin/staff',json={'name':'Chuyên gia','email':'role-expert@school.edu.vn','password':'expert-test-password','role':'expert','expert_id':profile}).status_code==201
    for email,password in [(admin['email'],'strong-test-password'),('role-expert@school.edu.vn','expert-test-password')]:
        assert client.post('/api/auth/login',json={'email':email,'password':password}).status_code==200
        for url in ['/api/history','/api/bookings','/api/assessment','/api/membership/status','/api/content/experts','/api/content/music']:
            assert client.get(url).status_code==403,url
        assert client.post('/api/chat',json={'messages':[{'role':'user','content':'Xin chào'}]}).status_code==403
        assert client.post('/api/membership/demo-upgrade',json={'method':'bank','acknowledge_demo':True}).status_code==403
    student=register(client,'customer-role@gmail.com');grant_vip(client)
    for url in ['/api/expert/profile','/api/expert/bookings','/api/expert/notes','/api/admin/users','/api/admin/staff']:
        assert client.get(url).status_code==403,url
    assert client.get('/api/bookings').status_code==200
    assert client.get('/api/content/experts').status_code==200
    assert client.post('/api/admin/staff',json={'name':'Tự cấp quyền','email':'fake@school.edu.vn','password':'expert-test-password','role':'expert','expert_id':profile}).status_code==403


def test_registration_account_cannot_become_expert_without_admin_provisioning(client):
    admin=register(client,'manager@example.com');set_admin(admin['id']);profile=create_expert_profile(client)
    customer=register(client,'customer-role@gmail.com')
    with SessionLocal() as db:
        row=db.get(User,customer['id']);row.role='expert';row.expert_id=profile;db.commit()
    # Even a malformed legacy row cannot unlock the expert API or a login session.
    assert client.get('/api/expert/bookings').status_code==403
    assert client.post('/api/auth/login',json={'email':customer['email'],'password':'strong-test-password'}).status_code==403


def test_role_cannot_be_changed_through_account_edit_endpoints(client):
    customer=register(client)
    admin=register(client,'manager@example.com');set_admin(admin['id']);profile=create_expert_profile(client)
    staff=client.post('/api/admin/staff',json={'name':'Chuyên gia','email':'role-expert@school.edu.vn','password':'expert-test-password','role':'expert','expert_id':profile}).json()
    assert client.patch('/api/admin/users/'+customer['id'],json={'name':'Hợp lệ','role':'expert'}).status_code==422
    assert client.patch('/api/admin/staff/'+staff['id'],json={'name':'Hợp lệ','role':'admin'}).status_code==422
    with SessionLocal() as db:
        assert db.get(User,customer['id']).role=='student'
        assert db.get(User,staff['id']).role=='expert'

def add_review_booking(user_id, expert_id, status='completed'):
    with SessionLocal() as db:
        row = Booking(user_id=user_id, expert_id=expert_id, status=status, starts_at=(now() + timedelta(days=1)).isoformat(), encrypted_contact=encrypt({'value': '0901234567'}))
        db.add(row); db.commit(); return row.id


def test_expert_reviews_saved_averaged_and_private(client):
    from app.db import ExpertReview
    first = register(client)
    grant_vip(client)
    with SessionLocal() as db:
        expert = Content(kind='experts', published=True, payload=json.dumps({'name': 'Chuyên gia kiểm thử'}))
        db.add(expert); db.commit(); expert_id = expert.id
    url = f'/api/experts/{expert_id}/reviews'
    assert client.get(url).json() == {'average': 0, 'count': 0, 'reviews': [], 'can_review': False}
    assert client.put(url, json={'stars': 6}).status_code == 422
    assert client.put(url, json={'stars': 2.5}).status_code == 422
    assert client.put(url, json={'stars': 4, 'comment': 'x' * 1001}).status_code == 422
    assert client.put(url, json={'stars': 5}).status_code == 403
    add_review_booking(first['id'], expert_id)
    response = client.put(url, json={'stars': 5, 'comment': ' Rất tận tâm '})
    assert response.status_code == 200, response.text
    assert response.json()['reviews'][0]['comment'] == 'Rất tận tâm'
    assert response.json()['reviews'][0]['mine'] is True
    assert client.put(url, json={'stars': 4, 'comment': 'Đã cập nhật'}).json()['count'] == 1
    client.post('/api/auth/logout')
    second = register(client, email='second-review@gmail.com'); grant_vip(client)
    add_review_booking(second['id'], expert_id)
    result = client.put(url, json={'stars': 2, 'comment': 'Góp ý'}).json()
    assert result['average'] == 3 and result['count'] == 2
    assert all('user_id' not in row and 'email' not in row for row in result['reviews'])
    assert {row['author'] for row in result['reviews']} == {'Bạn', 'Sinh viên'}
    profile = next(row for row in client.get('/api/content/experts').json() if row['id'] == expert_id)
    assert profile['rating_average'] == 3 and profile['rating_count'] == 2
    with SessionLocal() as db:
        assert len(db.scalars(select(ExpertReview)).all()) == 2
        db.get(Content, expert_id).published = False; db.commit()
    assert client.get(url).status_code == 404
    assert client.put(url, json={'stars': 5}).status_code == 404


def test_expert_reviews_enforce_access_and_account_cleanup(client):
    from app.db import ExpertReview
    from app.dung_chung import purge_user_data
    user = register(client)
    with SessionLocal() as db:
        expert = Content(kind='experts', published=True, payload='{}'); db.add(expert); db.commit(); expert_id = expert.id
    url = f'/api/experts/{expert_id}/reviews'
    assert client.get(url).status_code == 200
    assert client.put(url, json={'stars': 5}).status_code == 403
    grant_vip(client)
    add_review_booking(user['id'], expert_id)
    assert client.put(url, json={'stars': 5}).status_code == 200
    with SessionLocal() as db:
        purge_user_data(db, user['id']); db.commit()
        assert not db.scalars(select(ExpertReview)).all()
    assert client.get(url).status_code == 401


@pytest.mark.parametrize('status,allowed', [('pending', False), ('confirmed', False), ('completed', True), ('cancelled', False), ('rejected', False)])
def test_expert_review_requires_own_booking_with_same_expert(client, status, allowed):
    customer = register(client); grant_vip(client)
    with SessionLocal() as db:
        first = Content(kind='experts', published=True, payload='{}')
        second = Content(kind='experts', published=True, payload='{}')
        db.add_all([first, second]); db.commit(); expert_id, other_id = first.id, second.id
    url = f'/api/experts/{expert_id}/reviews'
    add_review_booking(customer['id'], other_id)
    assert client.get(url).json()['can_review'] is False
    assert client.put(url, json={'stars': 5}).status_code == 403
    other = register(client, email='other-booker@gmail.com'); grant_vip(client)
    add_review_booking(other['id'], expert_id)
    client.post('/api/auth/login', json={'email': customer['email'], 'password': 'strong-test-password'})
    assert client.get(url).json()['can_review'] is False
    assert client.put(url, json={'stars': 5}).status_code == 403
    booking_id = add_review_booking(customer['id'], expert_id, status)
    assert client.get(url).json()['can_review'] is allowed
    assert client.put(url, json={'stars': 5}).status_code == (200 if allowed else 403)
    if allowed:
        with SessionLocal() as db:
            db.get(Booking, booking_id).status = 'cancelled'; db.commit()
        assert client.put(url, json={'stars': 1}).status_code == 403

def test_student_booking_checkout_encrypts_details_and_returns_contact(client):
    admin = register(client, 'checkout-admin@gmail.com'); set_admin(admin['id'])
    expert_id = create_expert_profile(client)
    with SessionLocal() as db:
        profile = db.get(Content, expert_id); payload = json.loads(profile.payload)
        payload['fee'] = 300000; profile.payload = json.dumps(payload); db.commit()
    student = register(client, 'checkout-student@gmail.com'); grant_vip(client)
    body = {'expert_id': expert_id, 'starts_at': (now()+timedelta(days=2)).isoformat(), 'contact': '0901234567', 'consent_contact': True, 'student_name': 'Sinh viên đăng ký', 'student_email': 'booking-student@gmail.com', 'school': 'Khoa kiểm thử', 'description': 'Gần đây em rất căng thẳng vì kỳ thi.', 'consent_details': True, 'expected_fee': 300000, 'payment_method': 'bank', 'demo_payment_confirmed': True}
    response = client.post('/api/bookings', json=body)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['status'] == 'pending'
    assert result['payment'] == {'amount': 300000, 'method': 'bank', 'status': 'demo_confirmed', 'demo': True}
    assert result['topic'] == body['description']
    assert result['student_name'] == body['student_name']
    assert result['expert_contact']['phone']
    with SessionLocal() as db:
        row = db.get(Booking,result['id'])
        assert body['description'] not in row.encrypted_details
        assert body['student_email'] not in row.encrypted_details
        assert decrypt(row.encrypted_details)['school'] == body['school']
    saved = client.get('/api/bookings').json()[0]
    assert saved['topic'] == body['description']
    assert saved['expert_contact'] == result['expert_contact']
    other = register(client,'checkout-other@gmail.com'); grant_vip(client)
    assert client.get('/api/bookings').json() == []
    assert client.patch('/api/bookings/'+result['id'],json={'starts_at':body['starts_at']}).status_code == 404


@pytest.mark.parametrize('change,status', [({'expected_fee':1},409), ({'demo_payment_confirmed':False},422), ({'payment_method':None},422), ({'consent_details':False},422), ({'student_name':'  '},422), ({'description':''},422)])
def test_student_checkout_rejects_incorrect_price_or_missing_consent(client, change, status):
    student = register(client); grant_vip(client)
    with SessionLocal() as db:
        row = Content(kind='experts',published=True,payload=json.dumps({'name':'Chuyên gia thử', 'fee':300000,'phone':'0901234567'})); db.add(row); db.commit(); expert_id=row.id
    body = {'expert_id':expert_id,'starts_at':(now()+timedelta(days=2)).isoformat(),'contact':'0901234567','consent_contact':True,'student_name':'Sinh viên','student_email':'checkout@gmail.com','description':'Cảm xúc hiện tại','consent_details':True,'expected_fee':300000,'payment_method':'momo','demo_payment_confirmed':True,**change}
    assert client.post('/api/bookings',json=body).status_code == status
    with SessionLocal() as db:
        assert not db.scalars(select(Booking)).all()

def create_test_hospital(client):
    payload = {'name':'Cơ sở y tế kiểm thử','address':'Địa chỉ chỉ dùng kiểm thử','phone':'0901234567','verification_source':'Xác minh trong kiểm thử tự động','departments':[{'name':'Tâm lý','doctors':['BS. Kiểm thử']},{'name':'Nội khoa','doctors':[]}]}
    response = client.post('/api/admin/content',json={'kind':'hospitals','published':True,'data':payload})
    assert response.status_code == 200, response.text
    return response.json()['id']


def hospital_visit_body(hospital_id):
    return {'hospital_id':hospital_id,'department':'Tâm lý','doctor':'BS. Kiểm thử','starts_at':(now()+timedelta(days=3)).isoformat(),'student_name':'Sinh viên đăng ký khám','email':'hospital-student@gmail.com','phone':'0901112223','school':'Khoa kiểm thử','description':'Gần đây cảm thấy căng thẳng vì học tập.','consent':True}


def test_hospital_visit_is_separate_private_and_requires_real_confirmation(client):
    from app.db import HospitalVisit
    admin=register(client,'hospital-admin@gmail.com');set_admin(admin['id']);hospital_id=create_test_hospital(client)
    customer=register(client,'hospital-customer@gmail.com');grant_vip(client)
    catalog=client.get('/api/hospitals').json()
    assert len(catalog)==1 and 'verification_source' not in catalog[0]
    body=hospital_visit_body(hospital_id)
    created=client.post('/api/hospital-visits',json=body)
    assert created.status_code==201,created.text
    row=created.json();visit_id=row['id']
    assert row['status']=='pending' and row['hospital_name']=='Cơ sở y tế kiểm thử'
    assert client.get('/api/bookings').json()==[]
    assert client.get('/api/hospital-visits').json()[0]['description']==body['description']
    assert client.get('/api/admin/hospital-visits').status_code==403
    with SessionLocal() as db:
        stored=db.get(HospitalVisit,visit_id)
        assert body['description'] not in stored.encrypted_payload
        assert body['email'] not in stored.encrypted_payload
        assert decrypt(stored.encrypted_payload)['department']=='Tâm lý'
    register(client,'hospital-other@gmail.com');grant_vip(client)
    assert client.get('/api/hospital-visits').json()==[]
    assert client.delete('/api/hospital-visits/'+visit_id).status_code==404
    client.post('/api/auth/login',json={'email':admin['email'],'password':'strong-test-password'})
    assert len(client.get('/api/admin/hospital-visits').json())==1
    url='/api/admin/hospital-visits/'+visit_id
    assert client.patch(url,json={'status':'confirmed'}).status_code==422
    assert client.patch(url,json={'status':'confirmed','confirmation_received':True,'response_note':'Đã được cơ sở xác nhận.'}).status_code==200
    # Removing a hospital with requests retains the referenced record and hides new registration.
    assert client.delete('/api/admin/content/'+hospital_id).status_code==200
    client.post('/api/auth/login',json={'email':customer['email'],'password':'strong-test-password'})
    assert client.get('/api/hospitals').json()==[]
    assert client.get('/api/hospital-visits').json()[0]['response_note']=='Đã được cơ sở xác nhận.'
    assert client.post('/api/hospital-visits',json=body).status_code==404
    assert client.delete('/api/hospital-visits/'+visit_id).status_code==200
    assert client.delete('/api/hospital-visits/'+visit_id).status_code==409


@pytest.mark.parametrize('change', [{'department':'Không tồn tại'}, {'doctor':'Bác sĩ bệnh viện khác'}, {'consent':False}, {'description':'   '}, {'student_name':'  '}, {'starts_at':'2020-01-01T08:00:00+07:00'}, {'starts_at':'2099-01-01T08:00:00+07:00'}, {'starts_at':'2026-11-10T08:00:00'}])
def test_hospital_visit_validates_catalog_time_and_consent(client,change):
    from app.db import HospitalVisit
    admin=register(client);set_admin(admin['id']);hospital_id=create_test_hospital(client)
    register(client,'visit-customer@gmail.com');grant_vip(client)
    assert client.post('/api/hospital-visits',json={**hospital_visit_body(hospital_id),**change}).status_code==422
    with SessionLocal() as db:
        assert not db.scalars(select(HospitalVisit)).all()


def test_hospital_visit_access_and_account_deletion(client):
    from app.db import HospitalVisit
    admin=register(client);set_admin(admin['id']);hospital_id=create_test_hospital(client)
    assert client.get('/api/hospitals').status_code==403
    student=register(client,'visit-delete@gmail.com')
    assert client.get('/api/hospitals').status_code==403
    assert client.post('/api/hospital-visits',json=hospital_visit_body(hospital_id)).status_code==403
    grant_vip(client)
    assert client.post('/api/hospital-visits',json=hospital_visit_body(hospital_id)).status_code==201
    assert client.delete('/api/me').status_code==200
    with SessionLocal() as db:
        assert not db.scalars(select(HospitalVisit)).all()

def test_admin_center_payments_refunds_and_privacy(client):
    from app.db import Audit
    admin=register(client,'center-admin@gmail.com');set_admin(admin['id'])
    customer=register(client,'center-customer@gmail.com')
    with SessionLocal() as db:
        audit=Audit(actor=customer['id'],action='membership:demo:bank:30days');db.add(audit)
        record=PrivateRecord(user_id=customer['id'],kind='conversation',encrypted_payload=encrypt({'title':'TOP-SECRET-TITLE','messages':[{'content':'TOP-SECRET-MESSAGE'}]}));db.add(record);db.commit();payment_id='vip:'+audit.id
    for url in ['/api/admin/payments','/api/admin/reports','/api/admin/conversations','/api/admin/assessments','/api/admin/system','/api/admin/packages','/api/admin/search?q=center']:
        assert client.get(url).status_code==403,url
    client.post('/api/auth/login',json={'email':admin['email'],'password':'strong-test-password'})
    conv=client.get('/api/admin/conversations');assert conv.status_code==200
    assert len(conv.json())==1 and 'TOP-SECRET' not in conv.text and 'encrypted_payload' not in conv.text
    dashboard=client.get('/api/admin/dashboard').json()
    assert dashboard['management']['conversations']['total']==1
    assert dashboard['management']['finance']['real_total'] is None
    assert dashboard['management']['finance']['total']==300000
    assert dashboard['management']['topic_distribution']==[]
    url='/api/admin/payments/'+payment_id
    assert client.patch(url,json={'status':'refunded'}).status_code==409
    assert client.patch(url,json={'status':'refund_requested','note':'Kiểm thử'}).status_code==200
    assert client.get('/api/admin/reports').json()['finance']['refund_requests']==1
    assert client.patch(url,json={'status':'refunded'}).status_code==200
    finance=client.get('/api/admin/reports').json()['finance']
    assert finance['total']==0 and finance['refunded']==300000
    assert sum(row['vip'] for row in finance['months'])==0
    assert client.patch(url,json={'status':'refunded'}).status_code==409
    assert client.patch('/api/admin/payments/vip:missing',json={'status':'refund_requested'}).status_code==404
    assert 'TOP-SECRET' not in client.get('/api/admin/search?q=TOP-SECRET').text
    assert client.get('/api/admin/search?q=center-customer').json()[0]['section']=='users'


def test_admin_center_operating_settings_are_saved_and_used(client,monkeypatch):
    admin=register(client,'operating-admin@gmail.com');set_admin(admin['id'])
    body={'membership_demo_enabled':True,'daily_ai_request_limit':1,'daily_service_request_limit':100}
    assert client.put('/api/admin/system',json={**body,'daily_ai_request_limit':0}).status_code==422
    assert client.put('/api/admin/system',json=body).status_code==200
    result=client.get('/api/admin/system').json()
    assert result['operating']==body
    assert not any(key in result for key in ('openai_api_key','data_encryption_key','smtp_password','database_url'))
    customer=register(client,'operating-customer@gmail.com')
    assert client.get('/api/membership/status').json()['demo_enabled'] is True
    monkeypatch.setattr(ai,'safe_reply',AsyncMock(return_value=('Xin chào',False)))
    settings().openai_api_key='fake';settings().openai_chat_model='fake'
    payload={'messages':[{'role':'user','content':'Tôi muốn tâm sự'}]}
    assert client.post('/api/chat',json=payload).status_code==200
    assert client.post('/api/chat',json=payload).status_code==429
    assert client.put('/api/admin/system',json=body).status_code==403


def test_admin_center_edits_draft_wording_without_changing_scoring(client):
    admin=register(client);set_admin(admin['id'])
    response=client.get('/api/admin/assessments');assert response.status_code==200,response.text
    definition=response.json()['definition'];item=definition['items'][0]
    options=[row['text']+' (kiểm thử)' for row in item['options']]
    assert client.put('/api/admin/assessments',json={'question_id':9,'options':options}).status_code==422
    assert client.put('/api/admin/assessments',json={'question_id':1,'options':options}).status_code==200
    updated=client.get('/api/admin/assessments').json()
    assert updated['verified'] is False
    assert updated['definition']['scoring']==definition['scoring']
    assert [row['value'] for row in updated['definition']['items'][0]['options']]==[0,1,2,3]
    assert updated['definition']['items'][8]==definition['items'][8]
    assert updated['definition']['published'] is False
    settings().allow_draft_assessment=True
    register(client,'edited-test-customer@gmail.com')
    assert client.get('/api/assessment').json()['items'][0]['options'][0]['text']==options[0]


@pytest.fixture
def consultation_case():
    from app.consultations import ensure_ledger
    with SessionLocal() as db:
        expert = Content(kind='experts', published=True, payload=json.dumps({'name': 'Expert', 'fee': 300001}))
        db.add(expert); db.flush()
        student = User(name='Student', email='escrow@gmail.com', role='student', password_hash='unused')
        specialist = User(name='Expert', email='expert@school.test', role='expert', expert_id=expert.id, password_hash='unused')
        admin = User(name='Admin', email='admin@school.test', role='admin', password_hash='unused')
        db.add_all([student, specialist, admin]); db.flush()
        start = now() + timedelta(days=1)
        booking = Booking(user_id=student.id, expert_id=expert.id, status='confirmed', starts_at=start.isoformat(), duration_minutes=30,
                          encrypted_contact=encrypt({'value': '0901234567'}), encrypted_details=encrypt({'payment': {'demo': True, 'amount': 300001, 'status': 'demo_confirmed'}}))
        db.add(booking); db.flush(); ensure_ledger(db, booking); db.commit()
        yield db, booking, student, specialist, admin, start


def consultation_action(case, action, role='expert', minutes=0, reason='Test evidence'):
    from app.consultations import locked, act
    db, booking, student, expert, admin, start = case
    current = start + timedelta(minutes=minutes)
    row, ledger, data = locked(db, booking.id, current)
    act(db, row, ledger, data, action, {'student': student, 'expert': expert, 'admin': admin}[role], reason, current)
    db.commit()
    return data


def begin_consultation(case):
    consultation_action(case, 'present', 'expert')
    consultation_action(case, 'present', 'student')
    return consultation_action(case, 'start')


def test_consultation_split_once_and_immutable_fee(consultation_case):
    from fastapi import HTTPException
    from app.consultations import wallet
    db, booking, student, expert, admin, start = consultation_case
    begin_consultation(consultation_case)
    with pytest.raises(HTTPException):
        consultation_action(consultation_case, 'complete', minutes=4.99)
    data = consultation_action(consultation_case, 'complete', minutes=5)
    assert data['settlement'] == 'allocated'
    assert wallet(db, expert.expert_id)['balance'] == 240000
    db.get(Content, expert.expert_id).payload = json.dumps({'fee': 900000}); db.commit()
    with pytest.raises(HTTPException):
        consultation_action(consultation_case, 'complete', minutes=6)
    assert wallet(db, expert.expert_id)['balance'] == 240000
    consultation_action(consultation_case, 'student_confirm', 'student', 6)
    assert wallet(db, expert.expert_id)['balance'] == 240000


@pytest.mark.parametrize('expert_present,student_present,minutes,settlement,phase', [
    (False, False, 5, 'held', 'waiting'),
    (False, False, 5.01, 'refunded', 'refunded'),
    (True, False, 15, 'held', 'waiting'),
    (True, False, 15.01, 'allocated', 'student_absent'),
    (True, True, 15.01, 'held', 'waiting'),
])
def test_consultation_attendance_deadlines(consultation_case, expert_present, student_present, minutes, settlement, phase):
    from app.consultations import locked, wallet
    db, booking, _, expert, _, start = consultation_case
    if expert_present: consultation_action(consultation_case, 'present')
    if student_present: consultation_action(consultation_case, 'present', 'student')
    for _ in range(2):
        _, _, data = locked(db, booking.id, start + timedelta(minutes=minutes)); db.commit()
        assert data['settlement'] == settlement and data['phase'] == phase
    assert wallet(db, expert.expert_id)['balance'] == (240000 if settlement == 'allocated' else 0)


def test_consultation_pending_unaccepted_refunds_at_appointment(consultation_case):
    from app.consultations import locked
    db, booking, _, _, _, start = consultation_case
    booking.status = 'pending'; db.commit()
    row, _, data = locked(db, booking.id, start)
    assert data['settlement'] == 'refunded' and row.status == 'cancelled'


def test_consultation_timeout_requires_admin_and_keeps_refund_deadline(consultation_case):
    from app.consultations import locked, wallet
    from fastapi import HTTPException
    db, booking, _, expert, _, start = consultation_case
    begin_consultation(consultation_case)
    row, ledger, data = locked(db, booking.id, start + timedelta(minutes=30)); db.commit()
    assert data['phase'] == 'timed_out' and data['settlement'] == 'held'
    assert wallet(db, expert.expert_id)['balance'] == 0
    with pytest.raises(HTTPException): consultation_action(consultation_case, 'complete', minutes=30)
    consultation_action(consultation_case, 'completion_request', minutes=31)
    data = consultation_action(consultation_case, 'approve_completion', 'admin', minutes=40)
    assert data['ended_at'] == (start + timedelta(minutes=30)).isoformat()
    assert wallet(db, expert.expert_id)['balance'] == 240000
    with pytest.raises(HTTPException): consultation_action(consultation_case, 'approve_completion', 'admin', minutes=41)


def test_consultation_refund_reverses_both_shares_and_cannot_repeat(consultation_case):
    from app.consultations import wallet
    from fastapi import HTTPException
    db, _, _, expert, _, _ = consultation_case
    begin_consultation(consultation_case)
    consultation_action(consultation_case, 'complete', minutes=5)
    with pytest.raises(HTTPException): consultation_action(consultation_case, 'refund_request', 'student', 6, reason='  ')
    consultation_action(consultation_case, 'refund_request', 'student', 6)
    data = consultation_action(consultation_case, 'approve_refund', 'admin', 7)
    assert data['amount'] == 300001 and data['settlement'] == 'refunded'
    assert wallet(db, expert.expert_id)['balance'] == 0
    with pytest.raises(HTTPException): consultation_action(consultation_case, 'approve_refund', 'admin', 8)


@pytest.mark.parametrize('minutes,allowed', [(5 + 7*1440, True), (5 + 7*1440 + .01, False)])
def test_consultation_refund_seven_day_boundary(consultation_case, minutes, allowed):
    from fastapi import HTTPException
    begin_consultation(consultation_case)
    consultation_action(consultation_case, 'complete', minutes=5)
    if allowed:
        assert consultation_action(consultation_case, 'refund_request', 'student', minutes)['refund_request']['status'] == 'pending'
    else:
        with pytest.raises(HTTPException): consultation_action(consultation_case, 'refund_request', 'student', minutes)


def test_consultation_no_show_cannot_claim_refund_or_review(consultation_case):
    from fastapi import HTTPException
    from student.api_khach_hang import can_review_expert
    consultation_action(consultation_case, 'present')
    with pytest.raises(HTTPException): consultation_action(consultation_case, 'refund_request', 'student', 16)
    db, booking, student, expert, _, _ = consultation_case
    db.commit()
    assert not can_review_expert(expert.expert_id, student.id, db)


def test_consultation_monthly_payout_refund_negative_balance(consultation_case, monkeypatch):
    from app.consultations import wallet, locked
    from app.consultation_api import payout, PayoutInput
    from app.db import ExpertPayout
    from fastapi import HTTPException
    from datetime import timezone
    db, booking, student, expert, admin, _ = consultation_case
    start = datetime(2026, 10, 31, 8, tzinfo=timezone.utc)
    booking.starts_at = start.isoformat(); db.commit()
    case = (db, booking, student, expert, admin, start)
    begin_consultation(case); consultation_action(case, 'complete', minutes=5)
    monkeypatch.setattr('app.consultation_api.now', lambda: datetime(2026, 11, 1, tzinfo=timezone.utc))
    body = PayoutInput(expert_id=expert.expert_id, month='2026-10')
    assert payout(body, admin, db)['balance'] == 0
    with pytest.raises(HTTPException): payout(body, admin, db)
    db.rollback()
    consultation_action(case, 'refund_request', 'student', 1440)
    consultation_action(case, 'approve_refund', 'admin', 1441)
    assert wallet(db, expert.expert_id)['balance'] == -240000
    assert len(db.scalars(select(ExpertPayout)).all()) == 1


def test_consultation_role_scope_and_late_attendance(consultation_case):
    from fastapi import HTTPException
    from app.consultation_api import perform, StudentAction
    from app.consultations import act, locked
    db, booking, student, expert, admin, start = consultation_case
    stranger = User(id='outsider', role='student')
    with pytest.raises(HTTPException) as denied: perform(db, booking.id, StudentAction(action='present'), stranger)
    assert denied.value.status_code == 404
    row, ledger, data = locked(db, booking.id, start)
    with pytest.raises(HTTPException): act(db, row, ledger, data, 'start', student, current=start)
    with pytest.raises(HTTPException): act(db, row, ledger, data, 'present', expert, current=start - timedelta(minutes=16))
    with pytest.raises(HTTPException): act(db, row, ledger, data, 'present', expert, current=start + timedelta(minutes=5, seconds=1))


def test_consultation_conflicting_requests_refund_takes_priority(consultation_case):
    from fastapi import HTTPException
    from app.consultations import wallet
    db, booking, _, expert, _, _ = consultation_case
    begin_consultation(consultation_case)
    consultation_action(consultation_case, 'completion_request', minutes=31)
    consultation_action(consultation_case, 'refund_request', 'student', 32)
    with pytest.raises(HTTPException): consultation_action(consultation_case, 'approve_completion', 'admin', 33)
    data = consultation_action(consultation_case, 'approve_refund', 'admin', 34)
    assert data['completion_request']['status'] == 'rejected'
    assert wallet(db, expert.expert_id)['balance'] == 0


def test_consultation_api_full_paid_flow_and_expired_vip(client, monkeypatch):
    admin = register(client, 'escrow-admin@gmail.com'); set_admin(admin['id'])
    expert_id = create_expert_profile(client)
    with SessionLocal() as db:
        profile = db.get(Content, expert_id); data = json.loads(profile.payload); data['fee'] = 300000; profile.payload = json.dumps(data); db.commit()
    assert client.post('/api/admin/staff', json={'name':'Expert', 'email':'escrow-expert@school.edu.vn', 'password':'expert-test-password', 'role':'expert', 'expert_id':expert_id}).status_code == 201
    student = register(client, 'escrow-student@gmail.com'); grant_vip(client)
    start = now() + timedelta(days=1)
    body = {'expert_id':expert_id, 'starts_at':start.isoformat(), 'contact':'0901234567', 'consent_contact':True,
            'student_name':'Student', 'student_email':student['email'], 'description':'Exam stress', 'consent_details':True,
            'expected_fee':300000, 'payment_method':'bank', 'demo_payment_confirmed':True}
    created = client.post('/api/bookings', json=body)
    assert created.status_code == 200, created.text
    booking_id = created.json()['id']
    assert created.json()['consultation']['settlement'] == 'held'
    assert client.get('/api/expert/wallet').status_code == 403
    assert client.post(f'/api/expert/bookings/{booking_id}/consultation', json={'action':'start'}).status_code == 403
    def login(email, password='strong-test-password'):
        result = client.post('/api/auth/login', json={'email':email,'password':password})
        assert result.status_code == 200, result.text
    login('escrow-expert@school.edu.vn', 'expert-test-password')
    assert client.patch('/api/expert/bookings/'+booking_id,json={'status':'confirmed'}).status_code == 200
    clock = [start]
    monkeypatch.setattr('app.consultations.now', lambda: clock[0])
    endpoint = f'/api/expert/bookings/{booking_id}/consultation'
    assert client.post(endpoint,json={'action':'present'}).status_code == 200
    assert client.post(endpoint,json={'action':'start'}).status_code == 409
    login(student['email'])
    # Expiring VIP must never hide an already-paid appointment or its refund rights.
    with SessionLocal() as db:
        db.get(User,student['id']).membership_tier='normal'; db.commit()
    assert client.get('/api/bookings').status_code == 200
    student_endpoint = f'/api/bookings/{booking_id}/consultation'
    assert client.post(student_endpoint,json={'action':'present'}).status_code == 200
    login('escrow-expert@school.edu.vn', 'expert-test-password')
    assert client.post(endpoint,json={'action':'start'}).status_code == 200
    assert client.post(endpoint,json={'action':'complete'}).status_code == 409
    clock[0] = start + timedelta(minutes=5)
    assert client.post(endpoint,json={'action':'complete'}).status_code == 200
    assert client.get('/api/expert/wallet').json()['balance'] == 240000
    assert client.post(endpoint,json={'action':'complete'}).status_code == 409
    login(student['email'])
    assert client.post(student_endpoint,json={'action':'student_confirm'}).status_code == 200
    assert client.put(f'/api/experts/{expert_id}/reviews',json={'stars':5,'comment':'Helpful session'}).status_code == 200
    assert client.post(student_endpoint,json={'action':'refund_request','reason':'Please review this session'}).status_code == 200
    login(admin['email'])
    page = client.get('/api/admin/consultations').json()
    assert page['bookings'][0]['consultation']['refund_request']['reason'] == 'Please review this session'
    finance = client.get('/api/admin/reports').json()['finance']
    assert finance['consultation'] == 240000 and finance['admin_commission'] == 60000
    response = client.post(f'/api/admin/bookings/{booking_id}/consultation',json={'action':'approve_refund','reason':'Approved after review'})
    assert response.status_code == 200, response.text
    page = client.get('/api/admin/consultations').json()
    assert page['wallets'][0]['balance'] == 0
    finance = client.get('/api/admin/reports').json()['finance']
    assert finance['consultation'] == 0 and finance['admin_commission'] == 0 and finance['refunded'] == 300000


def test_weekly_schedule_repeats_in_vietnam_and_blocks_outside_hours(consultation_case):
    from app.availability import WeeklyWrite, set_availability, availability_day, VN
    db, _, _, expert, _, _ = consultation_case
    today = now().astimezone(VN).date()
    monday = today + timedelta(days=(7-today.weekday()) % 7 + 7)
    body = WeeklyWrite(windows=[{'weekday':0,'start':'08:00','end':'10:00'}, {'weekday':0,'start':'14:00','end':'15:00'}])
    set_availability(body, expert, db)
    for day in (monday, monday + timedelta(days=7)):
        result = availability_day(db, expert.expert_id, day)
        assert result['timezone'] == 'Asia/Ho_Chi_Minh'
        free = [s['time'] for s in result['slots'] if s['available']]
        assert free == ['08:00','08:30','09:00','09:30','14:00','14:30']
        assert not any('user' in s or 'student' in s for s in result['slots'])
    assert not any(s['available'] for s in availability_day(db, expert.expert_id, monday + timedelta(days=1))['slots'])


@pytest.mark.parametrize('windows', [
    [{'weekday':7,'start':'08:00','end':'09:00'}],
    [{'weekday':0,'start':'08:15','end':'09:00'}],
    [{'weekday':0,'start':'24:00','end':'24:00'}],
    [{'weekday':0,'start':'23:30','end':'00:30'}],
    [{'weekday':0,'start':'08:00','end':'10:00'},{'weekday':0,'start':'09:30','end':'11:00'}],
])
def test_weekly_schedule_rejects_invalid_and_overlapping_windows(windows):
    from app.availability import WeeklyWrite
    from pydantic import ValidationError
    with pytest.raises(ValidationError): WeeklyWrite(windows=windows)


def test_weekly_schedule_pending_reserves_overlap_and_cancel_releases(consultation_case):
    from app.availability import WeeklyWrite, set_availability, require_available, availability_day, VN
    from fastapi import HTTPException
    db, booking, _, expert, _, _ = consultation_case
    target = (now().astimezone(VN)+timedelta(days=7)).replace(hour=8,minute=0,second=0,microsecond=0)
    set_availability(WeeklyWrite(windows=[{'weekday':target.weekday(),'start':'08:00','end':'10:00'}]), expert, db)
    booking.starts_at=target.isoformat(); booking.status='pending'; db.commit()
    for at in (target, target + timedelta(minutes=15)):
        with pytest.raises(HTTPException): require_available(db,expert.expert_id,at)
    require_available(db,expert.expert_id,target+timedelta(minutes=30))
    assert not next(s for s in availability_day(db,expert.expert_id,target.date())['slots'] if s['time']=='08:00')['available']
    booking.status='cancelled'; db.commit()
    require_available(db,expert.expert_id,target)
    assert next(s for s in availability_day(db,expert.expert_id,target.date())['slots'] if s['time']=='08:00')['available']


def test_weekly_schedule_default_closed_and_changes_preserve_existing_booking(consultation_case):
    from app.availability import WeeklyWrite, set_availability, availability_day, require_available, VN
    from fastapi import HTTPException
    db, booking, _, expert, _, start = consultation_case
    result = availability_day(db,expert.expert_id,start.astimezone(VN).date())
    assert result['configured'] is False and not any(s['available'] for s in result['slots'])
    with pytest.raises(HTTPException): require_available(db,expert.expert_id,start+timedelta(hours=1))
    set_availability(WeeklyWrite(windows=[]),expert,db)
    db.refresh(booking)
    assert booking.status == 'confirmed' and booking.starts_at == start.isoformat()


def test_weekly_schedule_api_ownership_directory_and_double_booking(client):
    from app.db import ExpertAvailability
    from app.availability import VN
    admin=register(client,'schedule-admin@gmail.com');set_admin(admin['id'])
    first, second=create_expert_profile(client),create_expert_profile(client)
    for eid,email in ((first,'first-schedule@school.edu.vn'),(second,'second-schedule@school.edu.vn')):
        assert client.post('/api/admin/staff',json={'name':'Expert','email':email,'password':'expert-test-password','role':'expert','expert_id':eid}).status_code==201
    with SessionLocal() as db:
        db.delete(db.get(ExpertAvailability,first));db.delete(db.get(ExpertAvailability,second));db.commit()
    assert client.get('/api/expert/availability').status_code==403
    assert client.post('/api/auth/login',json={'email':'first-schedule@school.edu.vn','password':'expert-test-password'}).status_code==200
    assert client.get('/api/expert/availability').json()['windows']==[]
    target=(now().astimezone(VN)+timedelta(days=7)).replace(hour=8,minute=0,second=0,microsecond=0)
    body={'windows':[{'weekday':target.weekday(),'start':'08:00','end':'10:00'}], 'expert_id':second}
    assert client.put('/api/expert/availability',json=body).status_code==200
    with SessionLocal() as db:
        assert db.get(ExpertAvailability,first) is not None and db.get(ExpertAvailability,second) is None
    student=register(client,'schedule-student@gmail.com');grant_vip(client)
    assert client.put('/api/expert/availability',json=body).status_code==403
    query=f'?date={target.date().isoformat()}&time=08:00'
    cards=client.get('/api/content/experts'+query).json()
    assert next(c for c in cards if c['id']==first)['available'] is True
    assert next(c for c in cards if c['id']==second)['available'] is False
    url=f'/api/experts/{first}/availability?date={target.date().isoformat()}'
    assert next(s for s in client.get(url).json()['slots'] if s['time']=='08:00')['available']
    booking_body={'expert_id':first,'starts_at':target.isoformat(),'contact':'0901234567','consent_contact':True}
    created=client.post('/api/bookings',json=booking_body)
    assert created.status_code==200,created.text
    bid=created.json()['id']
    assert client.post('/api/bookings',json=booking_body).status_code==409
    assert client.post('/api/bookings',json={**booking_body,'starts_at':(target+timedelta(minutes=15)).isoformat()}).status_code==409
    assert next(s for s in client.get(url).json()['slots'] if s['time']=='08:00')['available'] is False
    assert next(s for s in client.get(url+f'&booking_id={bid}').json()['slots'] if s['time']=='08:00')['available'] is True
    cards=client.get('/api/content/experts'+query).json()
    assert next(c for c in cards if c['id']==first)['available'] is False
    register(client,'schedule-outsider@gmail.com');grant_vip(client)
    assert client.get(url+f'&booking_id={bid}').status_code==404
    assert client.post('/api/auth/login',json={'email':student['email'],'password':'strong-test-password'}).status_code==200
    assert client.delete('/api/bookings/'+bid).status_code==200
    assert next(s for s in client.get(url).json()['slots'] if s['time']=='08:00')['available'] is True
