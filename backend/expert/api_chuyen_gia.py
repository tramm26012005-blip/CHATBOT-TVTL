"""Expert routes under /api/expert: own profile, bookings and private notes."""
import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from app.db import db_session, User, Content, Booking, ExpertNote, now
from app.security import expert_user, encrypt, decrypt
from app.dung_chung import booking_view, change_booking_status

router = APIRouter()


@router.get('/api/expert/profile')
def expert_profile(user: User = Depends(expert_user), db: Session = Depends(db_session)):
    expert = db.get(Content, user.expert_id)
    data = json.loads(expert.payload) if expert else {}
    return {key: data.get(key, '') for key in ('name', 'degree', 'specialty', 'workplace', 'experience')} | {'published': bool(expert and expert.published)}


@router.get('/api/expert/bookings')
def expert_bookings(user: User = Depends(expert_user), db: Session = Depends(db_session)):
    from app.consultations import sync_all
    sync_all(db)
    rows = db.scalars(select(Booking).where(Booking.expert_id == user.expert_id).order_by(Booking.created.desc())).all()
    names = {u.id: u.name for u in db.scalars(select(User).where(User.id.in_({b.user_id for b in rows}))).all()}
    noted = set(db.scalars(select(ExpertNote.booking_id).where(ExpertNote.author_id == user.id)).all())
    return [{'student_name': names.get(b.user_id, ''), **booking_view(b, db, True), 'student_id': b.user_id, 'created': b.created.isoformat() if b.created else None, 'has_note': b.id in noted} for b in rows]


def own_booking(db, user, booking_id):
    row = db.get(Booking, booking_id)
    if not row or row.expert_id != user.expert_id:
        raise HTTPException(404, 'Không tìm thấy lịch hẹn.')
    return row


class NoteWrite(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


@router.get('/api/expert/notes')
def expert_notes(user: User = Depends(expert_user), db: Session = Depends(db_session)):
    rows = db.scalars(select(ExpertNote).where(ExpertNote.author_id == user.id).order_by(ExpertNote.updated.desc())).all()
    bookings = {b.id: b for b in db.scalars(select(Booking).where(Booking.id.in_({n.booking_id for n in rows}))).all()}
    names = {u.id: u.name for u in db.scalars(select(User).where(User.id.in_({b.user_id for b in bookings.values()}))).all()}
    return [{'booking_id': n.booking_id, 'body': decrypt(n.encrypted_body)['body'], 'updated': n.updated.isoformat(), 'starts_at': bookings[n.booking_id].starts_at, 'student_name': names.get(bookings[n.booking_id].user_id, '')} for n in rows if n.booking_id in bookings]


@router.get('/api/expert/bookings/{booking_id}/note')
def expert_note(booking_id: str, user: User = Depends(expert_user), db: Session = Depends(db_session)):
    own_booking(db, user, booking_id)
    note = db.scalar(select(ExpertNote).where(ExpertNote.booking_id == booking_id, ExpertNote.author_id == user.id))
    return {'body': decrypt(note.encrypted_body)['body'] if note else '', 'updated': note.updated.isoformat() if note else None}


@router.put('/api/expert/bookings/{booking_id}/note')
def save_expert_note(booking_id: str, body: NoteWrite, user: User = Depends(expert_user), db: Session = Depends(db_session)):
    own_booking(db, user, booking_id)
    note = db.scalar(select(ExpertNote).where(ExpertNote.booking_id == booking_id))
    if note and note.author_id != user.id:
        raise HTTPException(409, 'Lịch hẹn này đã có ghi chú của chuyên gia khác.')
    if not note:
        note = ExpertNote(booking_id=booking_id, author_id=user.id, encrypted_body='')
        db.add(note)
    note.encrypted_body = encrypt({'body': body.body.strip()})
    note.updated = now()
    db.commit()
    return {'ok': True, 'updated': note.updated.isoformat()}


@router.delete('/api/expert/bookings/{booking_id}/note')
def delete_expert_note(booking_id: str, user: User = Depends(expert_user), db: Session = Depends(db_session)):
    own_booking(db, user, booking_id)
    db.execute(delete(ExpertNote).where(ExpertNote.booking_id == booking_id, ExpertNote.author_id == user.id))
    db.commit()
    return {'ok': True}


class ExpertBookingUpdate(BaseModel):
    status: Literal['confirmed', 'rejected', 'completed']


@router.patch('/api/expert/bookings/{booking_id}')
def expert_update_booking(booking_id: str, body: ExpertBookingUpdate, user: User = Depends(expert_user), db: Session = Depends(db_session)):
    row = own_booking(db, user, booking_id)
    # The linked expert confirming their own slot is the real-world confirmation.
    return change_booking_status(db, row, body.status, user, True)
