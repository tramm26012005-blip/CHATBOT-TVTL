"""App entry point: middleware plus the routers of each role (admin/, expert/, student/ next to app/)."""
import time
import asyncio
import logging
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import settings
from . import ai
from .security import allowed_web_origins
from .migrations import initialize_database
from .consultation_api import router as consultation_router
from .availability import router as availability_router
from .db import SessionLocal
from .consultations import sync_all
from . import tai_khoan as auth
from admin import api_quan_tri as admin
from admin.trung_tam import router as admin_center_router
from expert import api_chuyen_gia as expert
from student import api_khach_hang as student
from student.goi_thanh_vien import router as membership_router
from student.thanh_toan import router as payment_router, CALLBACK_PATHS
from student.dat_kham import router as hospital_router
# Re-exported for tests that score answers directly.
from student.api_khach_hang import score_answers  # noqa: F401


@asynccontextmanager
async def lifespan(app):
    initialize_database()
    async def clock():
        while True:
            try:
                def tick():
                    with SessionLocal() as db:
                        sync_all(db)
                await asyncio.to_thread(tick)
            except Exception:
                logging.getLogger(__name__).exception('Consultation clock failed; retrying next tick')
            await asyncio.sleep(10)
    task = asyncio.create_task(clock())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        await ai.close_client()


app = FastAPI(title='Tư vấn tâm lý API', version='0.1.0', lifespan=lifespan)
app.include_router(auth.router)
app.include_router(student.router)
app.include_router(membership_router)
app.include_router(payment_router)
app.include_router(hospital_router)
app.include_router(expert.router)
app.include_router(admin.router)
app.include_router(admin_center_router)
app.include_router(consultation_router)
app.include_router(availability_router)
windows: defaultdict[tuple, deque[float]] = defaultdict(deque)


@app.middleware('http')
async def protections(request: Request, call_next):
    if request.url.path == '/api/voice/transcribe':
        length = request.headers.get('content-length')
        if length and (not length.isdigit() or int(length) > settings().max_voice_bytes + 65536):
            return JSONResponse({'detail': 'Đoạn thu âm quá lớn.'}, status_code=413)
    payment_callback = request.method == 'POST' and request.url.path in CALLBACK_PATHS
    if request.method not in ('GET', 'HEAD', 'OPTIONS') and not payment_callback:
        origin = request.headers.get('origin')
        if origin not in allowed_web_origins():
            return JSONResponse({'detail': f'Địa chỉ truy cập chưa được cho phép. Hãy mở {settings().app_origin} hoặc kiểm tra APP_ORIGIN ở backend.'}, status_code=403)
        if request.headers.get('x-tuvantamly-client') != 'web':
            return JSONResponse({'detail': 'Phiên bản giao diện chưa đồng bộ với backend. Hãy tải lại trang bằng Ctrl + F5 rồi thử lại.'}, status_code=403)
    # Read-only session checks must not consume the login/OTP abuse budget.
    sensitive_auth = request.url.path.startswith('/api/auth') and request.method not in ('GET', 'HEAD', 'OPTIONS')
    key = (request.client.host if request.client else 'unknown', 'payment_callback' if payment_callback else sensitive_auth)
    queue = windows[key]
    timestamp = time.monotonic()
    while queue and queue[0] < timestamp - 60:
        queue.popleft()
    limit = 300 if payment_callback else 15 if sensitive_auth else 120
    if len(queue) >= limit:
        return JSONResponse({'detail': 'Bạn thao tác hơi nhanh. Hãy thử lại sau một phút.'}, status_code=429, headers={'Retry-After': str(max(1, int(60 - (timestamp - queue[0])) + 1))})
    queue.append(timestamp)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response
