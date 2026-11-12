# Triển khai toàn bộ Lạc Lạc trên VPS Linux

Cấu hình này chạy frontend Next.js, backend FastAPI, PostgreSQL và Caddy HTTPS. Cần Docker Engine + Compose plugin đã cài trên server. Cổng 80/443 phải trống và được mở; bản ghi DNS của tên miền phải trỏ đúng server. Nếu server đang có Nginx/Caddy hoặc website khác, điều chỉnh reverse proxy hiện có trước khi chạy stack này.

## Chuẩn bị

Đưa mã nguồn lên server bằng SSH/SFTP hoặc repository riêng. Không đưa `.env`, `.env.transfer*`, database, khóa SSH hay bản sao lưu vào repository hoặc thư mục web công khai. Cần cả thư mục `data/` cho dữ liệu nội dung; chỉ chuyển chỉ mục sách nếu có quyền sử dụng.

Từ thư mục gốc dự án trên server:

```sh
cp deploy/.env.example deploy/.env
```

Điền `DOMAIN` (ví dụ `chat.example.com`), `ACME_EMAIL` và `POSTGRES_PASSWORD` (chuỗi hex ngẫu nhiên dài) vào `deploy/.env`. Nếu đã có database volume, giữ nguyên mật khẩu cũ.

Tạo `backend/.env` từ mẫu cho cài mới hoặc chuyển riêng file hiện có qua SSH để giữ nguyên khóa. Giữ nguyên `DATA_ENCRYPTION_KEY` nếu di chuyển dữ liệu đã mã hóa. Cấu hình `OTP_SECRET_KEY`, `SMTP_*`, `GEMINI_API_KEY` và các model. Không ghi đè file đã có. SMTP phải hoạt động để người dùng đăng ký và khôi phục tài khoản. Compose tự đặt origin HTTPS, cookie Secure và URL PostgreSQL đúng cho môi trường server.

```sh
chmod 600 deploy/.env backend/.env
docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
```

Mở `https://TEN_MIEN/api/health` và `https://TEN_MIEN/`. Kiểm tra đăng nhập, ảnh mascot, email OTP, micro, chat và âm thanh trên HTTPS. Health endpoint chỉ báo đã cấu hình, không chứng minh còn quota Gemini.

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
docker compose --env-file deploy/.env -f deploy/compose.yaml logs --tail=100 backend frontend proxy
```

Không đăng công khai log chứa thông tin cá nhân hoặc biến môi trường. Không chạy `docker compose config` không có `--quiet` khi chia sẻ màn hình vì có thể in khóa.

## Dữ liệu và cập nhật

Đây là PostgreSQL mới khi chưa có volume; cấu hình không tự nhập database SQLite trên máy cá nhân. Nếu cần giữ tài khoản/dữ liệu cũ, phải lên kế hoạch chuyển dữ liệu trước khi mở cho người dùng. Không xóa volume `postgres_data`. Khi chuyển database cũ, phải chuyển đúng khóa mã hóa tương ứng.

Trước mỗi lần cập nhật, sao lưu PostgreSQL và lưu riêng các khóa cùng file cấu hình. Ví dụ sao lưu bằng định dạng custom của pg_dump, không redirect dữ liệu nhị phân qua PowerShell:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml exec -T database pg_dump -U tuvantamly -d tuvantamly -Fc -f /tmp/laclac-backup.dump
docker compose --env-file deploy/.env -f deploy/compose.yaml cp database:/tmp/laclac-backup.dump ./laclac-backup.dump
chmod 600 laclac-backup.dump
```

Lưu backup ở nơi riêng, không commit. Cập nhật mã rồi chạy lại `up -d --build`. Không chạy `down -v` vì sẽ xóa database và dữ liệu chứng chỉ.

Triển khai server không làm mới quota Gemini. Nếu model hết quota, cần chờ quota hoặc cấu hình tài khoản có hạn mức phù hợp. Không tự bật thanh toán, thanh toán gói thành viên, hay các cờ đánh giá lâm sàng khi triển khai.
