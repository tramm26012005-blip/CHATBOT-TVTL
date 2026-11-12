"""Student (khách hàng) routes: preferences, AI chat, history, assessment, voice, content, bookings."""
import json
from datetime import datetime, timedelta, date as calendar_date
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, delete, func
from sqlalchemy.orm import Session

from app import ai
from app.config import settings
from app.db import db_session, User, PrivateRecord, Content, Booking, ExpertReview, Audit, now
from app.schemas import Preferences, Chat, AssessmentSubmit, BookingCreate, BookingUpdate
from app.security import current_user, student_user, encrypt, decrypt
from app.assessment_guidance import RESULT_PROMPT, result_guidance
from .goi_thanh_vien import require_vip, vip_action, is_vip, ensure_allowance, authorize_reply, consume_reply
from app.dung_chung import public_user, preferences, use_budget, owned_record, item_view, booking_view

router = APIRouter()


@router.put('/api/me/preferences')
def save_preferences(body: Preferences, user: User = Depends(require_vip), db: Session = Depends(db_session)):
    user = db.get_one(User, user.id)
    previous = preferences(user)
    changes = body.model_dump(exclude={'name'})
    user.name = body.name.strip()
    user.settings_json = json.dumps({**previous, **changes, 'updated_at': now().isoformat()})
    for key in ('save_history', 'save_assessments'):
        if previous.get(key, False) != changes[key]:
            db.add(Audit(actor=user.id, action=f'consent:{key}:{changes[key]}:v2026-10-27'))
    db.commit()
    return public_user(user)


@router.post('/api/chat')
async def chat(body: Chat, user: User = Depends(student_user), db: Session = Depends(db_session)):
    if body.save and not is_vip(user):
        raise HTTPException(403, 'Lưu lịch sử dành cho gói VIP.')
    if body.save and not preferences(user).get('save_history'):
        raise HTTPException(403, 'Hãy bật quyền lưu lịch sử trong cài đặt trước.')
    existing = owned_record(db, user, body.conversation_id, 'conversation') if body.conversation_id else None
    if body.save:
        encrypt({})  # Reject missing encryption key before making a billable call.
    ai.client()
    ai.chat_model()
    ensure_allowance(db, user, count_question=True)
    use_budget(db, user)
    try:
        text, risk = await ai.safe_reply(body.messages, voice_mode=True) if body.voice_mode else await ai.safe_reply(body.messages)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(502, 'Chưa kết nối được dịch vụ AI. Bạn hãy thử lại sau; tin nhắn chưa được lưu.')
    authorize_reply(db, user, text)
    record_id = None
    if body.save:
        payload = {'title': body.messages[0].content[:64], 'messages': [m.model_dump() for m in body.messages] + [{'role': 'assistant', 'content': text}]}
        if existing:
            previous = decrypt(existing.encrypted_payload)
            payload['title'] = previous.get('title', payload['title'])
            # Keep complete stored history, even though model context is bounded.
            payload['messages'] = previous['messages'] + [body.messages[-1].model_dump(), {'role': 'assistant', 'content': text}]
            existing.encrypted_payload = encrypt(payload)
            row = existing
        else:
            row = PrivateRecord(user_id=user.id, kind='conversation', encrypted_payload=encrypt(payload))
            db.add(row)
        db.commit()
        record_id = row.id

    async def events():
        yield 'data: ' + json.dumps({'conversation_id': record_id, 'risk': risk}) + '\n\n'
        if body.voice_mode:
            yield 'data: ' + json.dumps({'delta': text}, ensure_ascii=False) + '\n\n'
        else:
            async for event in ai.stream_reply(text):
                yield event
        yield 'data: {"done":true}\n\n'
    return StreamingResponse(events(), media_type='text/event-stream', headers={'X-Accel-Buffering': 'no'})


class TextInput(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


@router.post('/api/emotions')
async def emotions(body: TextInput, user: User = Depends(student_user), db: Session = Depends(db_session)):
    ai.client()
    ai.chat_model()
    use_budget(db, user)
    try:
        return await ai.estimate_emotion(body.text)
    except Exception:
        raise HTTPException(502, 'Chưa thể ước lượng cảm xúc. Bạn vẫn có thể tự chọn cảm xúc.')


@router.get('/api/history')
def history(q: str = '', user: User = Depends(require_vip), db: Session = Depends(db_session)):
    rows = db.scalars(select(PrivateRecord).where(PrivateRecord.user_id == user.id).order_by(PrivateRecord.created.desc())).all()
    results = []
    for row in rows:
        payload = decrypt(row.encrypted_payload)
        if q.lower() in json.dumps(payload, ensure_ascii=False).lower():
            results.append({'id': row.id, 'kind': row.kind, 'created': row.created.isoformat(), 'title': payload.get('title', 'Đánh giá tâm lý')})
    return results


@router.get('/api/history/{record_id}')
def history_detail(record_id: str, user: User = Depends(require_vip), db: Session = Depends(db_session)):
    row = owned_record(db, user, record_id)
    return {'id': row.id, 'kind': row.kind, **decrypt(row.encrypted_payload)}


class Rename(BaseModel):
    title: str = Field(min_length=1, max_length=100)


@router.patch('/api/history/{record_id}')
def rename_record(record_id: str, body: Rename, user: User = Depends(require_vip), db: Session = Depends(db_session)):
    row = owned_record(db, user, record_id)
    payload = decrypt(row.encrypted_payload)
    payload['title'] = body.title
    row.encrypted_payload = encrypt(payload)
    db.commit()
    return {'ok': True}


@router.delete('/api/history/{record_id}')
def remove_record(record_id: str, user: User = Depends(require_vip), db: Session = Depends(db_session)):
    db.delete(owned_record(db, user, record_id))
    db.commit()
    return {'ok': True}


@router.delete('/api/history')
def remove_history(user: User = Depends(require_vip), db: Session = Depends(db_session)):
    db.execute(delete(PrivateRecord).where(PrivateRecord.user_id == user.id))
    db.commit()
    return {'ok': True}


def assessment_enabled():
    cfg = settings()
    return cfg.allow_draft_assessment or (cfg.assessment_rights_verified and cfg.assessment_clinical_reviewed)


def assessment_definition():
    if not assessment_enabled():
        raise HTTPException(503, 'Bộ câu hỏi đang chờ xác minh nguồn, quyền sử dụng và rà soát chuyên môn. Chưa mở để đánh giá thật.')
    from app.db import SessionLocal
    with SessionLocal() as db:
        stored = db.get(Content, 'admin-assessment-draft')
        if stored:
            return json.loads(stored.payload)
    return json.loads((Path(__file__).resolve().parents[2] / 'data/assessments/beck-user-supplied.draft.json').read_text(encoding='utf-8-sig'))


def assessment_verified(definition):
    return bool(settings().assessment_rights_verified and settings().assessment_clinical_reviewed
                and definition.get('instrument') == 'BDI-II' and definition.get('rights_verified')
                and definition.get('clinical_reviewed') and definition.get('published'))


@router.get('/api/assessment')
def assessment(user: User = Depends(student_user)):
    definition = assessment_definition()
    return {'id': definition['id'], 'version': definition['version'], 'draft': not assessment_verified(definition), 'instructions': definition['instructions'], 'items': definition['items']}


def score_answers(answers, definition):
    if len(answers) != 21 or any(type(a) is not int or a not in (0, 1, 2, 3) for a in answers):
        raise HTTPException(422, 'Cần đúng 21 đáp án, mỗi đáp án từ 0 đến 3.')
    total = sum(answers)
    band = next(b['label'] for b in definition['scoring']['bands'] if b['min'] <= total <= b['max'])
    risk = answers[8] > 0 or any(
        option.get('risk_flag') in ('self_harm', 'suicide')
        for item, selected in zip(definition['items'], answers)
        for option in item['options'] if option['value'] == selected
    )
    return {'score': total, 'max_score': 63, 'level': band, 'support_prompt': risk, 'version': definition['version']}


@router.post('/api/assessment/submit')
def submit_assessment(body: AssessmentSubmit, user: User = Depends(student_user), db: Session = Depends(db_session)):
    definition = assessment_definition()
    draft = not assessment_verified(definition)
    if draft and not body.draft_acknowledged:
        raise HTTPException(422, 'Cần xác nhận đây là bản nháp trình diễn chưa được kiểm định.')
    result = {**score_answers(body.answers, definition), 'draft': draft, 'explanation': 'Kết quả mô tả mức điểm theo bộ câu hỏi đã chọn, không phải chẩn đoán. Nếu khó khăn kéo dài hoặc ảnh hưởng sinh hoạt, bạn nên trao đổi với chuyên gia. Với bản nháp, không dùng mức điểm này để quyết định chăm sóc sức khỏe.'}
    result.update(result_guidance(result, draft))
    if body.save:
        if not preferences(user).get('save_assessments'):
            raise HTTPException(403, 'Bạn chưa bật quyền lưu kết quả.')
        row = PrivateRecord(user_id=user.id, kind='assessment', encrypted_payload=encrypt({'title': 'Đánh giá tâm lý ban đầu', 'answers': body.answers, 'result': result}))
        db.add(row)
        db.commit()
        result['id'] = row.id
    return result


class ExplainResult(BaseModel):
    answers: list[int] = Field(min_length=21, max_length=21)


@router.post('/api/assessment/explain')
async def explain_result(body: ExplainResult, user: User = Depends(student_user), db: Session = Depends(db_session)):
    definition = assessment_definition()
    draft = not assessment_verified(definition)
    result = score_answers(body.answers, definition)
    try:
        api = ai.client()
        model = ai.chat_model()
        use_budget(db, user)
        payload = {'risk_flags': {'self_harm': result['support_prompt']}, 'unverified_preview': draft}
        if not draft:
            payload.update(total_score=result['score'], severity_level=result['level'])
        response = await api.responses.create(model=model, instructions=RESULT_PROMPT + '\nChỉ trả về lời động viên 2 đoạn ngắn, không nêu điểm, mức độ hoặc chẩn đoán; không thay thế gợi ý và quy trình an toàn cố định của giao diện. Nếu unverified_preview=true, chỉ cảm ơn và động viên chung, không suy diễn sức khỏe từ bài dùng thử.', input=json.dumps(payload, ensure_ascii=False), max_output_tokens=400, store=False)
        check = await ai.moderate(response.output_text)
        if check.flagged:
            raise ValueError('Unsafe output')
        if not response.output_text.strip():
            raise ValueError('Empty encouragement')
        return {'encouragement': response.output_text, 'fallback': False}
    except Exception:
        return {'encouragement': result_guidance(result, draft)['encouragement'], 'fallback': True, 'message': 'Chưa kết nối được Lạc Lạc. Mình giữ lời nhắn có sẵn để bạn tham khảo.'}


@router.post('/api/voice/transcribe')
async def transcribe(file: UploadFile, user: User = Depends(student_user), db: Session = Depends(db_session)):
    content_type = (file.content_type or '').split(';', 1)[0].strip().lower()
    if content_type not in ('audio/webm', 'audio/mp4', 'audio/wav', 'audio/mpeg', 'audio/ogg'):
        raise HTTPException(415, 'Định dạng âm thanh chưa được hỗ trợ.')
    audio = await file.read(settings().max_voice_bytes + 1)
    if len(audio) > settings().max_voice_bytes:
        raise HTTPException(413, 'Đoạn thu âm quá lớn. Hãy thu đoạn ngắn hơn.')
    if not audio:
        raise HTTPException(422, 'Đoạn thu âm trống. Hãy bật micro và nói trước khi gửi.')
    ensure_allowance(db, user)
    api = ai.client()
    if settings().ai_provider == 'gemini':
        if not settings().gemini_transcribe_model:
            raise HTTPException(503, 'Chưa cấu hình GEMINI_TRANSCRIBE_MODEL.')
        use_budget(db, user)
        try:
            return {'text': await api.transcribe(audio, content_type, settings().gemini_transcribe_model)}
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(502, 'Chưa chuyển được âm thanh thành văn bản. Bạn hãy thử lại.') from None
    if not settings().openai_transcribe_model:
        raise HTTPException(503, 'Chưa cấu hình model chuyển giọng nói thành văn bản.')
    use_budget(db, user)
    extension = {'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg'}[content_type]
    try:
        model = settings().openai_transcribe_model
        language_options = {'extra_body': {'languages': ['vi']}} if model == 'gpt-transcribe' or model.startswith('gpt-transcribe-') else {'language': 'vi'}
        result = await api.audio.transcriptions.create(model=model, file=(f'recording.{extension}', audio, content_type), **language_options)
        return {'text': result.text}
    except Exception as exc:
        provider_status = getattr(exc, 'status_code', None)
        if provider_status in (401, 403, 404):
            raise HTTPException(503, 'Dịch vụ chuyển giọng nói chưa có quyền truy cập. Cần kiểm tra cấu hình API và model.') from None
        if provider_status == 429:
            provider_code = getattr(exc, 'code', None)
            if provider_code in ('insufficient_quota', 'credit_balance_exhausted', 'billing_hard_limit_reached', 'billing_not_active'):
                raise HTTPException(503, 'Tài khoản API của ứng dụng đã hết tín dụng hoặc chạm giới hạn chi tiêu. Cần kiểm tra thanh toán API để tiếp tục dùng giọng nói.') from None
            raise HTTPException(503, 'Dịch vụ giọng nói đang bị giới hạn số yêu cầu. Bạn hãy đợi một lát rồi thử lại.') from None
        if provider_status == 400:
            raise HTTPException(422, 'Dịch vụ chưa nhận được định dạng hoặc tham số âm thanh phù hợp. Hãy thu lại và thử gửi.') from None
        raise HTTPException(502, 'Chưa kết nối được dịch vụ chuyển âm thanh. Bạn có thể thử lại hoặc nhập văn bản.') from None


class Speak(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    voice: Literal['alloy', 'coral', 'sage', 'ash', 'nova', 'onyx'] = 'coral'
    voice_style: Literal['warm', 'calm', 'clear'] = 'warm'
    speed: float = Field(default=1, ge=0.75, le=1.25)


@router.post('/api/voice/speak')
async def speak(body: Speak, user: User = Depends(student_user), db: Session = Depends(db_session)):
    consume_reply(db, user, body.text)
    api = ai.client()
    if settings().ai_provider == 'gemini':
        if not settings().gemini_tts_model:
            raise HTTPException(503, 'Chưa cấu hình GEMINI_TTS_MODEL.')
        use_budget(db, user)
        try:
            safety = await ai.moderate(body.text)
            if safety.flagged:
                raise HTTPException(422, 'Nội dung này chưa phù hợp để phát giọng AI.')
            audio, mime = await api.speak(body.text, settings().gemini_tts_model, body.voice, body.voice_style, body.speed)
            return Response(content=audio, media_type=mime)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(502, 'Chưa tạo được giọng nói. Nội dung văn bản vẫn khả dụng.') from None
    if not settings().openai_tts_model:
        raise HTTPException(503, 'Chưa cấu hình model giọng nói.')
    use_budget(db, user)
    try:
        safety = await ai.moderate(body.text)
        if safety.flagged:
            raise HTTPException(422, 'Nội dung này chưa phù hợp để phát giọng AI.')
        speech_options = {}
        if settings().openai_tts_instructions_supported:
            speech_options['instructions'] = {'warm': 'Speak Vietnamese warmly and naturally, without exaggerated intimacy.', 'calm': 'Speak Vietnamese calmly, gently, at a comfortable pace.', 'clear': 'Speak Vietnamese clearly, naturally and evenly.'}[body.voice_style]
        audio = await api.audio.speech.create(model=settings().openai_tts_model, voice=body.voice, input=body.text, speed=body.speed, response_format='mp3', **speech_options)
        return Response(content=audio.content, media_type='audio/mpeg')
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(502, 'Chưa tạo được giọng nói. Nội dung văn bản vẫn khả dụng.')


@router.get('/api/content/{kind}')
def content_list(kind: Literal['experts', 'music', 'support'], request: Request, db: Session = Depends(db_session), on_date: calendar_date | None = Query(None, alias='date'), time: str | None = None):
    if kind != 'support':
        require_vip(current_user(request, db))
    items = [item_view(row) for row in db.scalars(select(Content).where(Content.kind == kind, Content.published == True).order_by(Content.created.asc().nulls_first(), Content.id)).all()]
    if kind == 'experts':
        from app.availability import availability_day
        from app.consultations import sync_all
        sync_all(db)
        scores = {expert_id: (float(average), count) for expert_id, average, count in db.execute(select(ExpertReview.expert_id, func.avg(ExpertReview.stars), func.count()).group_by(ExpertReview.expert_id))}
        for item in items:
            average, count = scores.get(item['id'], (0, 0))
            item.update(rating_average=round(average, 1), rating_count=count)
            if on_date is not None:
                day = availability_day(db, item['id'], on_date)
                candidates = [s for s in day['slots'] if time is None or s['time'] == time]
                item['available'] = any(s['available'] for s in candidates)
                item['availability_note'] = 'Có lịch rảnh' if item['available'] else ('Chưa mở lịch tuần' if not day['configured'] else 'Bận / không có giờ rảnh phù hợp')
    return items


class ReviewInput(BaseModel):
    stars: int = Field(ge=1, le=5, strict=True)
    comment: str = Field(default='', max_length=1000)


def published_expert(expert_id, db):
    expert = db.get(Content, expert_id)
    if not expert or expert.kind != 'experts' or not expert.published:
        raise HTTPException(404, 'Chuyên gia chưa được công khai.')
    return expert


def can_review_expert(expert_id, user_id, db):
    from app.consultations import ensure_ledger
    rows = db.scalars(select(Booking).where(
        Booking.expert_id == expert_id, Booking.user_id == user_id,
        Booking.status == 'completed',
    )).all()
    for row in rows:
        _, data = ensure_ledger(db, row)
        if data['phase'] in ('completed', 'timed_out') and data['settlement'] != 'refunded':
            return True
    return False


def review_summary(expert_id, user_id, db):
    rows = db.scalars(select(ExpertReview).where(ExpertReview.expert_id == expert_id).order_by(ExpertReview.created.desc())).all()
    return {
        'can_review': can_review_expert(expert_id, user_id, db),
        'average': round(sum(row.stars for row in rows) / len(rows), 1) if rows else 0,
        'count': len(rows),
        'reviews': [{'id': row.id, 'stars': row.stars, 'comment': row.comment, 'created': row.created.isoformat(), 'mine': row.user_id == user_id, 'author': 'Bạn' if row.user_id == user_id else 'Sinh viên'} for row in rows],
    }


@router.get('/api/experts/{expert_id}/reviews')
def expert_reviews(expert_id: str, user: User = Depends(student_user), db: Session = Depends(db_session)):
    published_expert(expert_id, db)
    return review_summary(expert_id, user.id, db)


@router.put('/api/experts/{expert_id}/reviews')
def save_expert_review(expert_id: str, body: ReviewInput, user: User = Depends(student_user), db: Session = Depends(db_session)):
    # Serialize writes per profile; each student has one editable review.
    db.scalar(select(Content).where(Content.id == expert_id).with_for_update())
    published_expert(expert_id, db)
    if not can_review_expert(expert_id, user.id, db):
        raise HTTPException(403, 'Chỉ đánh giá sau khi buổi tư vấn đã hoàn thành. Lịch hủy, hoàn tiền hoặc vắng mặt không đủ điều kiện.')
    row = db.scalar(select(ExpertReview).where(ExpertReview.expert_id == expert_id, ExpertReview.user_id == user.id))
    if row is None:
        row = ExpertReview(expert_id=expert_id, user_id=user.id)
        db.add(row)
    row.stars = body.stars
    row.comment = body.comment.strip()
    db.commit()
    return review_summary(expert_id, user.id, db)


def valid_booking_time(starts):
    if starts.tzinfo is None or starts < now() or starts > now() + timedelta(days=90):
        raise HTTPException(422, 'Chọn thời điểm có múi giờ trong 90 ngày tới.')
    return starts


@router.post('/api/bookings')
def create_booking(body: BookingCreate, user: User = Depends(vip_action), db: Session = Depends(db_session)):
    expert = db.scalar(select(Content).where(Content.id == body.expert_id).with_for_update())
    if not expert or not expert.published or expert.kind != 'experts':
        raise HTTPException(404, 'Chuyên gia chưa được công khai hoặc xác minh.')
    if not body.consent_contact:
        raise HTTPException(422, 'Cần đồng ý dùng thông tin liên hệ để xử lý yêu cầu.')
    if body.description.strip() and not body.consent_details:
        raise HTTPException(422, 'Cần đồng ý chia sẻ mô tả với chuyên gia được chọn.')
    profile = json.loads(expert.payload)
    fee = profile.get('fee')
    if fee is not None:
        if not isinstance(fee, int) or fee < 0:
            raise HTTPException(422, 'Phí tư vấn chưa hợp lệ. Vui lòng liên hệ đơn vị vận hành.')
        if body.expected_fee != fee:
            raise HTTPException(409, 'Phí tư vấn đã thay đổi. Hãy mở lại hồ sơ và kiểm tra giá trước khi đăng ký.')
        if not body.demo_payment_confirmed or not body.payment_method:
            raise HTTPException(422, 'Cần xác nhận bước thanh toán mô phỏng trước khi hoàn tất đăng ký.')
        if not body.student_name or len(body.student_name.strip()) < 2 or not body.student_email or not body.description.strip() or not body.consent_details:
            raise HTTPException(422, 'Cần điền thông tin sinh viên, mô tả và đồng ý chia sẻ với chuyên gia.')
    starts = valid_booking_time(body.starts_at)
    from app.availability import require_available
    require_available(db, expert.id, starts)
    details = {'student_name': body.student_name.strip() if body.student_name else user.name, 'student_email': str(body.student_email or user.email), 'school': body.school.strip(), 'topic': body.description.strip(), 'consented_at': now().isoformat() if body.consent_details else None,
               'payment': {'amount': fee, 'method': body.payment_method, 'status': 'demo_confirmed' if body.demo_payment_confirmed else 'not_required', 'demo': True},
               'expert_contact': {'name': profile.get('name', ''), 'phone': profile.get('phone', ''), 'zalo': profile.get('zalo')}, 'fee': fee}
    row = Booking(user_id=user.id, expert_id=expert.id, starts_at=starts.isoformat(), duration_minutes=30, encrypted_contact=encrypt({'value': body.contact, 'consented_at': now().isoformat()}), encrypted_details=encrypt(details))
    db.add(row)
    db.flush()
    from app.consultations import ensure_ledger
    ensure_ledger(db, row)
    db.commit()
    return booking_view(row, db, True)


@router.get('/api/bookings')
def booking_list(user: User = Depends(student_user), db: Session = Depends(db_session)):
    from app.consultations import sync_all
    sync_all(db)
    return [student_booking_view(row, db) for row in db.scalars(select(Booking).where(Booking.user_id == user.id).order_by(Booking.created.desc())).all()]


def student_booking_view(row, db):
    # Show the student's own checkout, never private consultation details added by staff.
    details = decrypt(row.encrypted_details) if row.encrypted_details else {}
    return booking_view(row, db, 'expert_contact' in details and 'student_name' in details)


@router.patch('/api/bookings/{booking_id}')
def update_booking(booking_id: str, body: BookingUpdate, user: User = Depends(student_user), db: Session = Depends(db_session)):
    row = db.get(Booking, booking_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, 'Không tìm thấy yêu cầu.')
    from app.consultations import locked
    row, _, _ = locked(db, row.id)
    # Once the expert has confirmed, the slot is agreed; the student can only cancel it.
    if row.status != 'pending' or datetime.fromisoformat(row.starts_at) <= now():
        raise HTTPException(409, 'Chỉ chỉnh sửa được yêu cầu đang chờ chuyên gia xác nhận.')
    starts = valid_booking_time(body.starts_at)
    from app.availability import require_available
    if starts != datetime.fromisoformat(row.starts_at):
        require_available(db, row.expert_id, starts, exclude=row.id)
    row.starts_at = starts.isoformat()
    if body.contact:
        row.encrypted_contact = encrypt({'value': body.contact, 'consented_at': decrypt(row.encrypted_contact).get('consented_at') or now().isoformat()})
    db.commit()
    return student_booking_view(row, db)


@router.delete('/api/bookings/{booking_id}')
def cancel_booking(booking_id: str, user: User = Depends(student_user), db: Session = Depends(db_session)):
    row = db.get(Booking, booking_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, 'Không tìm thấy yêu cầu.')
    from app.consultations import locked, refund, save
    row, ledger, data = locked(db, row.id)
    if row.status not in ('pending', 'confirmed') or datetime.fromisoformat(row.starts_at) <= now():
        raise HTTPException(409, 'Không thể hủy yêu cầu ở trạng thái này.')
    row.status = 'cancelled'
    refund(db, row, data, now(), 'Sinh viên hủy trước giờ hẹn.')
    save(ledger, data)
    db.commit()
    return {'ok': True}
