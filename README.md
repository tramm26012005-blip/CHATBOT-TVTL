# Tư vấn tâm lý — Đồng hành cùng cảm xúc sinh viên

Next.js + TypeScript + Tailwind CSS / Python FastAPI + SQLAlchemy / PostgreSQL / OpenAI API.

Đây là bản phát triển chạy cục bộ, chưa phải dịch vụ y tế hoặc sản phẩm đã được chứng nhận an toàn, tuân thủ pháp luật. Không dùng dữ liệu sinh viên thật trước khi hoàn tất rà soát chuyên môn và vận hành.

## Cấu trúc thư mục theo vai trò

Code chia theo 3 vai trò: **khách hàng (sinh viên)**, **chuyên gia**, **admin**, cộng phần **dùng chung**. Trong code, khách hàng được gọi là `student` (đúng tên vai trò trong database).

```
backend/
  admin/api_quan_tri.py         Quản trị viên (/api/admin): dashboard, khách hàng, nhân sự, nội dung, lịch hẹn
  expert/api_chuyen_gia.py      Chuyên gia (/api/expert): hồ sơ, lịch hẹn của mình, ghi chú chuyên môn
  student/api_khach_hang.py     Khách hàng: cài đặt, chat AI, lịch sử, test tâm lý, giọng nói, nội dung, đặt lịch
  student/goi_thanh_vien.py     Khách hàng: gói VIP/thường, hạn mức (/api/membership)
  app/                          Dùng chung cho cả 3 vai trò
    main.py                     Khởi tạo app, middleware bảo vệ, ghép API của từng vai trò
    tai_khoan.py                Đăng ký/OTP, đăng nhập, đổi/quên mật khẩu, xóa tài khoản, health
    dung_chung.py               Hàm dùng chung (xem lịch hẹn, xóa dữ liệu người dùng, hạn mức AI…)
    db.py, schemas.py, security.py, migrations.py, ai.py, registration.py, recovery.py, config.py   Hạ tầng

frontend/
  admin/                        Quản trị viên
    khung-quan-tri.tsx            Sidebar + trang Tổng quan (cổng /admin)
    quan-ly-nguoi-dung.tsx        Quản lý người dùng
    quan-ly-chuyen-gia.tsx        Quản lý chuyên gia
    tai-khoan-nhan-su.tsx         Tài khoản nhân sự
    quan-ly-lich-hen.tsx          Quản lý lịch hẹn
    nhac-thu-gian.tsx             Nhạc thư giãn
    thong-tin-ho-tro.tsx          Thông tin hỗ trợ
  expert/
    khung-chuyen-gia.tsx          Toàn bộ cổng chuyên gia (/expert)
  student/                      Khách hàng
    trang-khach-hang.tsx          Mọi trang sinh viên + chọn cổng theo vai trò sau đăng nhập
    goi-thanh-vien.tsx            Gói VIP/thường
    bai-tho.tsx                   Bài tập thở
  shared/                       Dùng chung
    dang-nhap.tsx                 Đăng nhập / đăng ký / quên mật khẩu
    ho-tro-khan-cap.tsx           Hộp thoại "Bạn không phải đối mặt một mình"
    khung-giao-dien.tsx           Sidebar + thanh trên của cổng Admin và Chuyên gia
    thanh-phan-chung.tsx          Bảng, banner, phân trang, cửa sổ dùng chung
    banner-chung.css, lich-hen-chung.css
  src/app, src/lib              Next.js (bắt buộc ở đây): định tuyến, CSS chung, gọi API
```

Mỗi file `.tsx` có file `.css` cùng tên (nếu có) đi kèm ngay bên cạnh.

Thêm chức năng cho vai trò nào thì sửa trong thư mục của vai trò đó. Chỉ những thứ nhiều vai trò cùng dùng mới đặt ở `frontend/shared/` hoặc `backend/app/`. Trong frontend có thể import bằng `@admin/…`, `@expert/…`, `@student/…`, `@shared/…`.

## Thanh toán gói VIP

Luồng thanh toán thật MB Bank (payOS) và MoMo, cấu hình khóa backend, webhook HTTPS và kiểm tra trước khi nhận tiền được mô tả tại [THANH_TOAN.md](THANH_TOAN.md). Mặc định chưa bật nhận tiền thật; không dùng mã QR mô phỏng để chuyển tiền. Thanh toán đặt lịch chuyên gia vẫn là mô phỏng.

## Chạy cục bộ

Cần Python 3.12+, Node.js 22+ và pnpm. Thực hiện từ thư mục dự án:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
Copy-Item backend/.env.example backend/.env
```

Sửa `backend/.env`:

- Để dùng PostgreSQL: cấu hình `DATABASE_URL` với database của bạn.
- Chỉ để thử cục bộ khi chưa có PostgreSQL: `DATABASE_URL=sqlite:///./tuvantamly.db`. SQLite không phải cấu hình triển khai chính.
- Tạo khóa mã hóa bằng lệnh dưới, tự sao chép giá trị vào `DATA_ENCRYPTION_KEY`; giữ khóa an toàn và sao lưu riêng. Không thay khóa khi còn dữ liệu cũ nếu chưa có quy trình chuyển khóa.

```powershell
.venv/Scripts/python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Chạy backend từ thư mục `backend`:

```powershell
../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8100 --no-access-log
```

Mở terminal khác, vào `frontend`:

```powershell
pnpm install
pnpm dev
```

Mở **http://localhost:3000**. `APP_ORIGIN` phải khớp chính xác URL giao diện, bao gồm giao thức và cổng. Frontend chuyển tiếp `/api` đến backend; không đưa OpenAI API key vào frontend.

## Gemini API

1. Tạo API key tại https://aistudio.google.com/apikey.
2. Điền key trong `backend/.env` (không đặt vào frontend):

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=
GEMINI_CHAT_MODEL=gemini-3.6-flash
GEMINI_TRANSCRIBE_MODEL=gemini-3.6-flash
GEMINI_TTS_MODEL=gemini-3.8-flash-lite-tts
```

3. Khởi động lại backend sau khi nhập key. Model phải được tài khoản Gemini của bạn hỗ trợ; có thể đổi `GEMINI_CHAT_MODEL` khi cần.
4. Chat, phân luồng hỗ trợ, kiểm tra nội dung và nhận diện cảm xúc đều dùng Gemini. Không cần tín dụng OpenAI. Kiểm tra nội dung dùng structured output của Gemini, không phải dịch vụ moderation OpenAI; cần đánh giá lại chất lượng trước khi triển khai công khai.
5. Giọng nói dùng Gemini: thu âm → chép lời → chat → phát giọng tiếng Việt. Audio được xử lý trong bộ nhớ, không lưu file. Các lựa chọn giọng cũ được ánh xạ sang giọng Gemini; tốc độ và phong cách được hướng dẫn bằng lời nên có thể không chính xác tuyệt đối. Cần quyền truy cập model TTS và hạn mức riêng. Có thể quay về cấu hình cũ bằng `AI_PROVIDER=openai` và các biến `OPENAI_*`.

Nội dung được kiểm tra trước khi trả dần qua SSE. Nhận diện cảm xúc cần người dùng xác nhận. Các hạn mức lượt gọi của ứng dụng vẫn áp dụng; hạn mức và chi phí Gemini phụ thuộc tài khoản của bạn.

Tài liệu tích hợp: https://ai.google.dev/gemini-api/docs/openai.

## Tài khoản và Admin

Đăng nhập giới hạn **3 lần sai mật khẩu liên tiếp cho mỗi tài khoản**. Giao diện chỉ cảnh báo sau khi nhập sai, kèm số lượt còn lại sau lần sai thứ nhất/thứ hai. Lần sai thứ ba khóa tài khoản, thu hồi phiên đăng nhập và chặn đăng nhập cả khi nhập đúng mật khẩu. Bộ đếm lưu trong database, không mất khi tải lại trang hoặc đổi trình duyệt. Đăng nhập thành công trước khi bị khóa đặt bộ đếm về 0.

Mở khóa bằng **Quên mật khẩu → xác thực OTP email → đặt mật khẩu mới**, hoặc Admin mở lại tài khoản ở khu vực quản lý người dùng/nhân sự. Tài khoản bị Admin chủ động vô hiệu hóa không được tự mở bằng OTP. Khởi động lại backend hoặc chạy `python manage.py upgrade-db` để bổ sung các cột mới cho database hiện có; dữ liệu và mật khẩu cũ được giữ nguyên.

Đăng ký tài khoản từ giao diện, sau đó vận hành viên cấp quyền bằng terminal trong `backend`:

```powershell
../.venv/Scripts/python.exe manage.py make-admin --email your-email@example.com
```

Không có mật khẩu admin mặc định hoặc API tự cấp quyền. Admin đầu tiên được cấp bằng lệnh trên; sau đó Admin tạo thêm tài khoản Admin/Chuyên gia tại `/admin` → **Tài khoản nhân sự** (họ tên, email, mật khẩu tối thiểu 8 ký tự), đặt lại mật khẩu và khóa/mở tài khoản. Mật khẩu chỉ lưu dạng băm Argon2, không xem lại được. Admin không tự khóa hay đặt lại mật khẩu của chính mình tại đây.

Trang `/admin` còn thêm/sửa/xóa chuyên gia, nhạc và hỗ trợ, quản lý yêu cầu đặt lịch, xem danh sách và khóa/mở tài khoản sinh viên. Admin không được đọc tâm sự hoặc kết quả người khác.

Nhạc ở "Góc bình yên" và mục **Nhạc thư giãn** của Admin dùng chung bảng `content`. Thư viện 60 bài có sẵn (`data/music/healing-library.json`, 6 chủ đề) được nạp vào database đúng một lần khi backend khởi động lần đầu; sau đó Admin thêm/sửa/ẩn/xóa và thay đổi hiển thị ngay cho sinh viên. Bài đã xóa không tự nạp lại.

Tài khoản Chuyên gia phải gắn với đúng một hồ sơ ở tab Chuyên gia. Sau khi đăng nhập, chuyên gia vào **Lịch hẹn chuyên gia** (`/expert`) để xem yêu cầu gửi cho hồ sơ của mình cùng thông tin liên hệ sinh viên đã đồng ý cung cấp, rồi xác nhận, từ chối hoặc đánh dấu hoàn thành. Chuyên gia tự xác nhận được coi là xác nhận thực tế. Chuyên gia không xem được lịch hẹn của chuyên gia khác, tâm sự hay kết quả test. Hồ sơ đã gắn tài khoản chỉ bị ẩn chứ không bị xóa.

Chuyên gia phải có nguồn và ngày xác minh; nội dung chưa công khai không hiển thị. Không có hồ sơ hoặc nhạc giả. Xác nhận booking yêu cầu Admin ghi nhận đã nhận xác nhận thực tế; hệ thống chưa tích hợp lịch của cơ sở.

Quên mật khẩu cần SMTP có STARTTLS và các biến `SMTP_*`. Khôi phục theo luồng email → OTP 6 chữ số (5 phút) → mật khẩu mới. Sau khi OTP đúng, API cấp quyền đổi mật khẩu một lần trong 10 phút, chỉ giữ trong bộ nhớ giao diện; không ghi log hoặc đặt token trên URL. Đăng ký mới chỉ nhận @gmail.com và bắt buộc OTP email; MFA Admin chưa có.

## Bộ câu hỏi 21 câu

Giữ nguyên nội dung người dùng cung cấp trong `data/assessments/beck-user-supplied.draft.json`. Không tự thay bằng DASS-21. Quy tắc cộng và bảng điểm là **bản do người dùng gửi**, chưa xác minh là bản Beck chuẩn.

Mặc định khóa nội dung. Để trình diễn **nội bộ**, đặt `ALLOW_DRAFT_ASSESSMENT=true`; UI yêu cầu xác nhận bản nháp và không cung cấp diễn giải AI lâm sàng. Chưa được dùng để đánh giá thật. Chỉ đặt `ASSESSMENT_RIGHTS_VERIFIED=true` và `ASSESSMENT_CLINICAL_REVIEWED=true` sau khi có căn cứ và rà soát thực tế; cần cập nhật phiên bản/nội dung đã duyệt trước khi bật. Người dùng đồng ý triển khai không thay thế quyền sử dụng của chủ sở hữu.

## Kiểm thử

Từ thư mục dự án:

```powershell
.venv/Scripts/python.exe -m pytest backend/tests -q
cd frontend
pnpm typecheck
pnpm build
```

Bộ test dùng database tạm, kiểm tra phân quyền, đồng ý lưu, mã hóa, chấm điểm nháp ở điểm biên, xác nhận lịch, xóa dữ liệu và hạn mức. AI được mock trong test và không gọi API thật. Không coi test mock là kiểm chứng chất lượng AI hoặc giọng Việt.

## Docker + PostgreSQL

Copy `.env.example` thành `.env`, đặt mật khẩu database ngẫu nhiên, hoàn thiện `backend/.env`, rồi chạy:

```powershell
docker compose up --build
```

Docker chỉ mở frontend trên loopback. Trước khi công khai cần reverse proxy HTTPS và `COOKIE_SECURE=true`, origin chính xác, sao lưu/khôi phục và các kiểm tra bên dưới. Next.js rewrite phải dùng `BACKEND_URL` tương ứng môi trường (kiểm tra đường dẫn khi build/triển khai).

## Cần hoàn tất trước khi mở cho sinh viên thật

- Xác minh quyền, phiên bản, bản dịch, ngưỡng và chuyên gia rà soát thang đo.
- Danh mục hỗ trợ và chuyên gia thật, nguồn, khu vực, giờ hoạt động, lịch kiểm tra lại.
- Rà soát tâm lý học đường và bộ tình huống an toàn tiếng Việt. Cơ chế hiện tại không bảo đảm nhận diện mọi nguy cơ; từ khóa có thể cảnh báo nhầm.
- Rà soát pháp lý dữ liệu cá nhân, đơn vị chịu trách nhiệm, xử lý xuyên biên giới, thời hạn lưu và bản sao lưu.
- Hạn mức toàn hệ thống, Redis rate limit cho nhiều worker, giám sát sự cố đã loại dữ liệu riêng tư, chống lạm dụng đăng ký.
- MFA quản trị, xác minh email, chống dò tài khoản nâng cao, rà soát độc lập phân quyền và CSRF.
- Migration database có phiên bản (bản đầu đang dùng `create_all`, chưa có Alembic migration); chính sách xoay khóa và kiểm tra khôi phục backup.
- Kiểm thử PostgreSQL, HTTPS, SMTP thật, micro trên mobile, và OpenAI thật với ngân sách được thống nhất.
- Realtime, phát hiện khoảng dừng giọng nói và streaming trực tiếp có kiểm soát là các bước tiếp theo, chưa được triển khai.

Tên Tư vấn tâm lý và dấu hiệu chiếc lá hiện là nhận diện tạm, không thay thế logo người dùng cung cấp.



## Đăng ký Gmail và OTP

Trong `backend/.env`, điền `SMTP_USERNAME` bằng Gmail dùng để gửi thư và `SMTP_PASSWORD` bằng Mật khẩu ứng dụng Google (16 ký tự). Không dùng mật khẩu đăng nhập Gmail, không gửi bí mật vào chat hoặc commit Git. Giữ `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`; `SMTP_FROM` có thể để trống để dùng cùng địa chỉ gửi. `OTP_SECRET_KEY` phải là khóa ngẫu nhiên ít nhất 32 ký tự; bản cài đặt hiện tại đã tạo sẵn khóa cục bộ. Khởi động lại backend sau khi sửa cấu hình.

Đăng ký: nhập họ tên, Gmail, mật khẩu tối thiểu 8 ký tự và đồng ý chính sách → Gửi mã xác thực → nhập OTP 6 chữ số → Xác nhận đăng ký. Chỉ lúc xác thực thành công mới tạo dòng `users` trong PostgreSQL, ghi thời gian xác thực và đăng nhập. Tài khoản cũ không bị xóa hay tự đánh dấu đã xác thực.

`POST /api/auth/register` trả 202 và mã phiên xác thực (không trả OTP); `/api/auth/register/verify` nhận `challenge`, `otp`; `/api/auth/register/cancel` hủy phiên khi sửa thông tin. OTP hết hạn sau 5 phút, dùng một lần, tối đa 5 lần nhập sai. Gửi lại cách nhau 60 giây, tối đa 5 thư/email/giờ và 100 thư toàn dịch vụ/giờ. Hệ thống còn giới hạn tốc độ theo IP. Khi gửi lại hoặc đổi email bằng phiên cũ, mã cũ mất hiệu lực. OTP được bảo vệ bằng HMAC, mật khẩu chờ đăng ký được băm Argon2; không ghi OTP hoặc mật khẩu vào log. Dữ liệu chờ hết hạn không thể xác thực và được dọn trong lần yêu cầu đăng ký kế tiếp.

Chạy `python manage.py upgrade-db` trong thư mục backend để thêm bảng `pending_registrations`, `otp_rates` và cột `email_verified_at` nếu máy chạy database chưa cập nhật. Kiểm thử tự động dùng SMTP giả lập; cần thử gửi thư thực tế sau khi bạn điền thông tin Gmail. Gmail SMTP không bảo đảm thư đến ngay, hãy kiểm tra Thư rác khi thử.


Quên mật khẩu: `POST /api/auth/forgot-password` gửi OTP (phản hồi chung cho email chưa đăng ký); `/api/auth/forgot-password/verify` xác thực OTP và cấp token dùng một lần; `/api/auth/reset-password` chỉ nhận token đã được xác thực OTP. SMTP dùng chung cấu hình Gmail của đăng ký. OTP đăng ký không dùng để khôi phục và ngược lại. Giới hạn gửi mã dùng chung để chống lạm dụng. Link khôi phục theo cơ chế cũ không còn đổi được mật khẩu. Đổi mật khẩu thành công thu hồi tất cả phiên đăng nhập và mã khôi phục của tài khoản. Các kiểm thử gửi thư dùng transport giả lập.

## Thư viện sách tham khảo

Lạc Lạc đã có tra cứu tài liệu cục bộ từ `book/`, trả lời tiếng Việt và ghi trang PDF khi dùng nguồn. Chạy `.venv/Scripts/python.exe -X utf8 backend/scripts/index_books.py` sau khi cập nhật sách. Xem `docs/thu-vien-sach.md` để biết cách chạy, giới hạn và kiểm thử.

## Quy tắc cấp tài khoản và tách cổng

Khách hàng tự đăng ký/OTP; tài khoản admin do chủ hệ thống cấp bằng `manage.py make-admin`; chuyên gia chỉ do admin tạo kèm hồ sơ. `/bookings` là lịch của khách hàng, `/expert` là cổng làm việc chuyên gia. Xem `docs/phan-quyen-tai-khoan.md` để biết ma trận quyền và cách kiểm thử.

### Hội thoại giọng nói tự động

Bật micro một lần, nói rồi ngừng khoảng 1,1 giây để tự gửi bản thu; không cần bấm gửi. Sau khi Lạc Lạc phát xong, micro tự mở cho lượt tiếp theo. Không nghe thấy lời nói trong 12 giây sẽ dừng, không gửi bản thu im lặng. Nút điện thoại kết thúc toàn bộ phiên. Mỗi lượt vẫn giới hạn 45 giây. Nhận biết khoảng lặng chạy cục bộ bằng Web Audio; môi trường nhiều tiếng ồn có thể ảnh hưởng. Phản hồi giọng nói được yêu cầu ngắn và giữ các kiểm tra an toàn; thời gian chờ vẫn phụ thuộc API chép lời, chat và phát âm thanh.

## Triển khai VPS với HTTPS

Cấu hình production gồm frontend, backend, PostgreSQL và Caddy nằm trong [deploy/README.md](deploy/README.md). Cần thông tin server, tên miền và cách truy cập để triển khai thực tế. Database và API key không tự được chuyển hoặc công khai.
