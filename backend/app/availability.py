"""Recurring weekly availability in Vietnam time; booking writes lock the profile."""
import json
import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db import ExpertAvailability, Booking, Content, User, Audit, db_session, now
from .security import expert_user, student_user

VN = ZoneInfo('Asia/Ho_Chi_Minh')
router = APIRouter(prefix='/api')


def minutes(value):
    if not re.fullmatch(r'(?:[01]\d|2[0-3]):(?:00|30)|24:00', value):
        raise ValueError('Chọn giờ theo mốc 30 phút, từ 00:00 đến 24:00.')
    h, m = map(int, value.split(':'))
    return h * 60 + m


class Window(BaseModel):
    weekday: int = Field(ge=0, le=6, strict=True)
    start: str
    end: str

    @model_validator(mode='after')
    def valid_window(self):
        if minutes(self.end) - minutes(self.start) < 30:
            raise ValueError('Giờ kết thúc phải sau giờ bắt đầu ít nhất 30 phút; không qua ngày.')
        return self


class WeeklyWrite(BaseModel):
    windows: list[Window] = Field(max_length=100)

    @model_validator(mode='after')
    def no_overlap(self):
        for day in range(7):
            windows = sorted((minutes(w.start), minutes(w.end)) for w in self.windows if w.weekday == day)
            if any(right[0] < left[1] for left, right in zip(windows, windows[1:])):
                raise ValueError('Các khoảng rảnh cùng ngày không được chồng nhau.')
        return self


def weekly(db, expert_id):
    row = db.get(ExpertAvailability, expert_id, populate_existing=True)
    return json.loads(row.weekly_json) if row else []


def occupied(db, expert_id, exclude=None):
    return [(datetime.fromisoformat(b.starts_at).astimezone(VN), datetime.fromisoformat(b.starts_at).astimezone(VN) + timedelta(minutes=30))
            for b in db.scalars(select(Booking).where(Booking.expert_id == expert_id, Booking.status.in_(['pending', 'confirmed', 'completed']))).all() if b.id != exclude]


def slot_reason(windows, bookings, start, current):
    start = start.astimezone(VN)
    end = start + timedelta(minutes=30)
    if start <= current:
        return 'Đã qua giờ'
    if start > current + timedelta(days=90):
        return 'Chưa mở đặt lịch'
    start_minute = start.hour * 60 + start.minute + start.second / 60 + start.microsecond / 60000000
    if not any(w['weekday'] == start.weekday() and minutes(w['start']) <= start_minute and start_minute + 30 <= minutes(w['end']) for w in windows):
        return 'Ngoài lịch rảnh'
    if any(start < b_end and end > b_start for b_start, b_end in bookings):
        return 'Đã có người đặt'
    return ''


def availability_day(db, expert_id, day, exclude=None):
    windows, bookings, current = weekly(db, expert_id), occupied(db, expert_id, exclude), now().astimezone(VN)
    start = datetime.combine(day, datetime.min.time(), VN)
    slots = []
    for offset in range(0, 1440, 30):
        at = start + timedelta(minutes=offset)
        reason = slot_reason(windows, bookings, at, current)
        slots.append({'time': at.strftime('%H:%M'), 'starts_at': at.isoformat(), 'available': not reason, 'reason': reason})
    return {'date': day.isoformat(), 'timezone': 'Asia/Ho_Chi_Minh', 'configured': bool(windows), 'slots': slots}


def require_available(db, expert_id, start, exclude=None):
    # Serialize creation, rescheduling and schedule edits for this profile.
    db.scalar(select(Content).where(Content.id == expert_id).with_for_update())
    reason = slot_reason(weekly(db, expert_id), occupied(db, expert_id, exclude), start, now().astimezone(VN))
    if reason:
        raise HTTPException(409, f'Không thể đặt khung giờ này: {reason}. Hãy chọn giờ rảnh khác.')


@router.get('/expert/availability')
def own_availability(user: User = Depends(expert_user), db: Session = Depends(db_session)):
    return {'timezone': 'Asia/Ho_Chi_Minh', 'windows': weekly(db, user.expert_id)}


@router.put('/expert/availability')
def set_availability(body: WeeklyWrite, user: User = Depends(expert_user), db: Session = Depends(db_session)):
    db.scalar(select(Content).where(Content.id == user.expert_id).with_for_update())
    row = db.get(ExpertAvailability, user.expert_id, populate_existing=True)
    if row is None:
        row = ExpertAvailability(expert_id=user.expert_id)
        db.add(row)
    row.weekly_json = json.dumps([w.model_dump() for w in sorted(body.windows, key=lambda w: (w.weekday, w.start))])
    db.add(Audit(actor=user.id, action='availability:update:' + user.expert_id))
    db.commit()
    return own_availability(user, db)


@router.get('/experts/{expert_id}/availability')
def public_availability(expert_id: str, date: date, booking_id: str | None = None, user: User = Depends(student_user), db: Session = Depends(db_session)):
    expert = db.get(Content, expert_id)
    if not expert or expert.kind != 'experts' or not expert.published:
        raise HTTPException(404, 'Không tìm thấy chuyên gia.')
    from .consultations import sync_all
    sync_all(db)
    own = db.get(Booking, booking_id) if booking_id else None
    if booking_id and (not own or own.user_id != user.id or own.expert_id != expert_id or own.status != 'pending'):
        raise HTTPException(404, 'Không tìm thấy lịch có thể chỉnh sửa.')
    result = availability_day(db, expert_id, date, exclude=booking_id)
    if own:
        for slot in result['slots']:
            if datetime.fromisoformat(slot['starts_at']) == datetime.fromisoformat(own.starts_at) and datetime.fromisoformat(own.starts_at) > now():
                slot.update(available=True, reason='Lịch đang giữ của bạn')
    return result
