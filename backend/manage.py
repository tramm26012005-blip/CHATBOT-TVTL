"""Local operator command; never exposes an HTTP endpoint for granting admin."""
import argparse
from sqlalchemy import select, delete
from app.db import Base, engine, SessionLocal, User, LoginSession, Audit
from app.migrations import initialize_database

parser = argparse.ArgumentParser()
parser.add_argument('command', choices=['init-db', 'upgrade-db', 'make-admin'])
parser.add_argument('--email')
args = parser.parse_args()
initialize_database()
if args.command == 'make-admin':
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
