"""Local operator command; never exposes an HTTP endpoint for granting admin."""
import argparse
import os
from sqlalchemy import select, delete
from app.db import Base, engine, SessionLocal, User, LoginSession, Audit
from app.migrations import initialize_database

parser = argparse.ArgumentParser()
parser.add_argument('command', choices=['init-db', 'upgrade-db', 'make-admin', 'create-demo', 'demo-serve'])
parser.add_argument('--email')
args = parser.parse_args()
initialize_database()
if args.command in ('create-demo', 'demo-serve'):
    from app.security import passwords
    email = os.environ.get('DEMO_EMAIL', '').strip().lower()
    password = os.environ.get('DEMO_PASSWORD', '')
    if not email or '@' not in email or len(password) < 12:
        raise SystemExit('Set DEMO_EMAIL and DEMO_PASSWORD (at least 12 characters).')
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user:
            print('Account already exists; no changes applied.')
        else:
            db.add(User(email=email, name='Khách demo', password_hash=passwords.hash(password),
                        role='student', created_at_source='operator-demo',
                        settings_json='{"save_history":false,"save_assessments":false}'))
            db.add(Audit(actor='operator', action='account:create-demo'))
            db.commit()
            print('Demo account created.')
    if args.command == 'demo-serve':
        import uvicorn
        uvicorn.run('app.main:app', host='0.0.0.0', port=int(os.environ.get('PORT', '8000')), access_log=False)
elif args.command == 'make-admin':
    if not args.email:
        parser.error('--email required')
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == args.email.lower()))
        if not user:
            raise SystemExit('Register the account in the app first.')
        user.role = 'admin'
        user.expert_id = None
        db.execute(delete(LoginSession).where(LoginSession.user_id == user.id))
        db.add(Audit(actor='operator', action=f'role:grant-admin:{user.id}'))
        db.commit()
        print('Admin role granted to the existing account.')
else:
    print('Database initialized.')
