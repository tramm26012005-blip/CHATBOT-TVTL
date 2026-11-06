"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bell,
  CalendarCheck,
  CalendarDays,
  CheckCheck,
  ClipboardCheck,
  Clock,
  Eye,
  FileText,
  Heart,
  Home,
  Hourglass,
  NotebookPen,
  Phone,
  Search,
  Settings,
  UserRound,
  Users,
  Zap,
} from "lucide-react";
import { api, type User } from "@/lib/api";
import PortalShell from "../shared/khung-giao-dien";
import WeeklyAvailability from "./lich-ranh";
import {ConsultationPanel, ExpertWallet, type Consultation} from "../shared/phien-tu-van";
import { AdminBanner, Avatar, Modal, Notice, Pager, VN, numberFormat } from "../shared/thanh-phan-chung";
// Status and mode pills are shared with the admin bookings page.
import "../shared/lich-hen-chung.css";
import "./khung-chuyen-gia.css";

type Section = "overview" | "bookings" | "students" | "sessions" | "confirm" | "notes" | "account" | "income" | "availability";
type Status = "pending" | "confirmed" | "completed" | "rejected" | "cancelled";
type Booking = {
  consultation?: Consultation;
  id: string;
  student_id: string;
  student_name: string;
  student_email?: string;
  school?: string;
  starts_at: string;
  duration_minutes: number;
  mode: "online" | "offline" | null;
  topic: string;
  status: Status;
  contact: { value: string };
  created: string | null;
  has_note: boolean;
};
type Profile = { name: string; degree: string; specialty: string; workplace: string; experience: string; published: boolean };
type Note = { booking_id: string; body: string; updated: string; starts_at: string; student_name: string };

const sections: { key: Section; label: string; icon: typeof Home }[] = [
  { key: "overview", label: "Tổng quan công việc", icon: Home },
  { key: "availability", label: "Lịch rảnh hằng tuần", icon: CalendarDays },
  { key: "income", label: "Số dư và thu nhập", icon: CalendarCheck },
  { key: "bookings", label: "Lịch hẹn của tôi", icon: CalendarDays },
  { key: "students", label: "Hồ sơ tư vấn được phân công", icon: Users },
  { key: "sessions", label: "Phiên tư vấn", icon: Phone },
  { key: "confirm", label: "Xác nhận lịch hẹn", icon: ClipboardCheck },
  { key: "notes", label: "Ghi chú chuyên môn", icon: FileText },
  { key: "account", label: "Cài đặt tài khoản", icon: Settings },
];
const statusNames: Record<Status, string> = {
  pending: "Đang chờ xác nhận",
  confirmed: "Đã xác nhận",
  completed: "Đã hoàn thành",
  rejected: "Đã từ chối",
  cancelled: "Đã hủy",
};
const avatarTints = ["#c98476", "#d9705f", "#d6a396", "#9a7b6b", "#8a6fb0"];
const tintFor = (name: string) => avatarTints[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % avatarTints.length];

const vnDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: VN });
const vnTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: VN, hour: "2-digit", minute: "2-digit", hour12: false });
function displayDate(iso: string) {
  const [y, m, d] = vnDate(iso).split("-");
  return `${d}/${m}/${y}`;
}
function timeRange(b: Booking) {
  return `${vnTime(b.starts_at)} - ${vnTime(new Date(new Date(b.starts_at).getTime() + b.duration_minutes * 60000).toISOString())}`;
}
function ago(iso: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} phút trước`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} giờ trước`;
  return `${Math.round(minutes / 1440)} ngày trước`;
}

// Sessions are held by phone, so the student's contact doubles as a dial link.
function phoneHref(value?: string) {
  const digits = (value || "").replace(/[^\d+]/g, "");
  return /^\+?\d{8,15}$/.test(digits) ? `tel:${digits}` : null;
}
function CallButton({ booking }: { booking: Booking }) {
  const href = phoneHref(booking.contact?.value);
  if (!href) return null;
  return (
    <a className="button primary ex-call" href={href} title={`Gọi ${booking.student_name}`}>
      <Phone size={16} />
      {booking.contact.value}
    </a>
  );
}
function PhoneLink({ value }: { value?: string }) {
  const href = phoneHref(value);
  return href ? <a className="ex-phone" href={href}><Phone size={14} />{value}</a> : <>{value || "—"}</>;
}

function ModePill({ mode }: { mode: Booking["mode"] }) {
  if (!mode) return <span className="ab-dash">—</span>;
  return mode === "online" ? (
    <span className="au-pill ab-online"><Phone size={14} />Gọi điện</span>
  ) : (
    <span className="au-pill ab-offline"><UserRound size={14} />Trực tiếp</span>
  );
}
function StatusPill({ status }: { status: Status }) {
  return <span className={`au-pill ab-${status}`}><i />{statusNames[status]}</span>;
}

/** Booking details with status actions and the expert's private, encrypted note. */
function BookingModal({ booking, close, changed }: { booking: Booking; close: () => void; changed: (message: string) => void }) {
  const [note, setNote] = useState(""),
    [savedNote, setSavedNote] = useState(""),
    [noteLoaded, setNoteLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api<{ body: string }>(`/expert/bookings/${booking.id}/note`)
      .then((n) => {
        setNote(n.body);
        setSavedNote(n.body);
      })
      .catch((e) => setError(e.message))
      .finally(() => setNoteLoaded(true));
  }, [booking.id]);
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      changed(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const setStatus = (status: Status, message: string) => run(() => api(`/expert/bookings/${booking.id}`, { method: "PATCH", body: JSON.stringify({ status }) }), message);
  const rows: [string, ReactNode][] = [
    ["Ngày", displayDate(booking.starts_at)],
    ["Thời gian", `${timeRange(booking)} (${booking.duration_minutes} phút)`],
    ["Hình thức", <ModePill key="m" mode={booking.mode} />],
    ["Nội dung tư vấn", booking.topic || "—"],
    ["Email sinh viên", booking.student_email || "—"],
    ["Trường / khoa", booking.school || "—"],
    ["Số điện thoại sinh viên", <PhoneLink key="p" value={booking.contact?.value} />],
    ["Trạng thái", <StatusPill key="s" status={booking.status} />],
  ];
  return (
    <Modal title="Chi tiết lịch hẹn" close={close} wide>
      <div className="au-view-head">
        <Avatar name={booking.student_name} tint={tintFor(booking.student_name)} />
        <div>
          <strong>{booking.student_name}</strong>
          <span>Sinh viên</span>
        </div>
      </div>
      <dl className="au-details">
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {(booking.status === "pending" || booking.status === "confirmed") && (
        <div className="button-row ex-status-actions">
          {booking.status === "pending" && <button className="button primary" disabled={busy} onClick={() => setStatus("confirmed", `Đã xác nhận lịch của ${booking.student_name}.`)}>Xác nhận lịch</button>}
          {!booking.consultation?.started_at && <button className="button outline au-danger" disabled={busy} onClick={() => setStatus("rejected", `Đã từ chối lịch của ${booking.student_name}.`)}>Từ chối</button>}
        </div>
      )}
      <ConsultationPanel booking={booking} role="expert" changed={() => changed("Đã cập nhật buổi tư vấn.")} />
      <form
        className="ex-note"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => api(`/expert/bookings/${booking.id}/note`, { method: "PUT", body: JSON.stringify({ body: note }) }), "Đã lưu ghi chú chuyên môn.");
        }}
      >
        <label>
          <span><NotebookPen size={16} />Ghi chú chuyên môn</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000} rows={5} disabled={!noteLoaded} placeholder={noteLoaded ? "Ghi chú sau buổi tư vấn (chỉ bạn đọc được)…" : "Đang tải ghi chú…"} />
        </label>
        <p className="au-hint">Ghi chú được mã hóa và chỉ bạn đọc được. Admin và sinh viên không xem được.</p>
        <div className="button-row">
          <button className="button primary" disabled={busy || !note.trim() || note === savedNote}>Lưu ghi chú</button>
          {savedNote && (
            <button type="button" className="button outline" disabled={busy} onClick={() => run(() => api(`/expert/bookings/${booking.id}/note`, { method: "DELETE" }), "Đã xóa ghi chú.")}>
              Xóa ghi chú
            </button>
          )}
        </div>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
    </Modal>
  );
}

function Overview({ user, profile, bookings, open, go }: { user: User; profile: Profile | null; bookings: Booking[]; open: (b: Booking) => void; go: (s: Section) => void }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: VN });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: VN });
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: VN });
  const live = bookings.filter((b) => b.status === "pending" || b.status === "confirmed");
  const on = (day: string) => live.filter((b) => vnDate(b.starts_at) === day);
  const todayList = [...bookings.filter((b) => vnDate(b.starts_at) === today && b.status !== "rejected" && b.status !== "cancelled")].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const diff = on(today).length - bookings.filter((b) => vnDate(b.starts_at) === yesterday && b.status !== "rejected" && b.status !== "cancelled").length;
  const students = new Set(live.map((b) => b.student_id)).size;
  const completed = bookings.filter((b) => b.status === "completed");
  const weekAgo = Date.now() - 7 * 86400000;
  const completedWeek = completed.filter((b) => new Date(b.starts_at).getTime() >= weekAgo).length;
  const pending = bookings.filter((b) => b.status === "pending");
  const recent = bookings.filter((b) => b.created && new Date(b.created).getTime() >= weekAgo).sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  const notices: { icon: ReactNode; tone: string; text: string; when: string; to: Section }[] = [];
  if (recent.length) notices.push({ icon: <CalendarDays size={18} />, tone: "coral", text: `Có ${recent.length} lịch hẹn mới`, when: ago(recent[0].created!), to: "bookings" });
  if (pending.length) notices.push({ icon: <CheckCheck size={18} />, tone: "green", text: `${pending.length} lịch hẹn chờ xác nhận`, when: "Cần phản hồi sinh viên", to: "confirm" });
  if (on(tomorrow).length) notices.push({ icon: <CalendarCheck size={18} />, tone: "violet", text: `${on(tomorrow).length} lịch hẹn vào ngày mai`, when: "Chuẩn bị trước buổi tư vấn", to: "sessions" });
  return (
    <>
      <AdminBanner
        eyebrow="CHÀO MỪNG TRỞ LẠI,"
        title={profile?.name || user.name}
        subtitle={profile?.specialty ? `Chuyên gia tư vấn tâm lý sinh viên · ${profile.specialty}` : "Chuyên gia tư vấn tâm lý sinh viên"}
        motto={["“Lắng nghe", "Thấu hiểu", "Đồng hành cùng sinh viên”"]}
        icon={<Heart size={36} strokeWidth={1.4} aria-hidden="true" />}
      />
      <div className="ex-grid">
        <div className="ex-main">
          <section className="au-stats" aria-label="Số liệu công việc">
            <article>
              <span className="au-stat-icon green"><CalendarDays size={28} strokeWidth={1.7} /></span>
              <div>
                <h3>Lịch hẹn hôm nay</h3>
                <div>
                  <strong>{numberFormat.format(todayList.length)}</strong>
                  {diff ? (
                    <small className="au-change"><b className={diff > 0 ? "up" : "down"}>{diff > 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}{Math.abs(diff)}</b>so với hôm qua</small>
                  ) : (
                    <small>bằng hôm qua</small>
                  )}
                </div>
              </div>
            </article>
            <article>
              <span className="au-stat-icon coral"><Users size={28} strokeWidth={1.7} /></span>
              <div>
                <h3>Sinh viên phụ trách</h3>
                <div><strong>{numberFormat.format(students)}</strong><small>có lịch chờ hoặc đã xác nhận</small></div>
              </div>
            </article>
            <article>
              <span className="au-stat-icon green"><CheckCheck size={28} strokeWidth={1.7} /></span>
              <div>
                <h3>Phiên hoàn thành</h3>
                <div>
                  <strong>{numberFormat.format(completed.length)}</strong>
                  {completedWeek ? <small className="au-change"><b className="up"><ArrowUp size={14} />{completedWeek}</b>trong 7 ngày qua</small> : <small>chưa có trong 7 ngày qua</small>}
                </div>
              </div>
            </article>
            <article>
              <span className="au-stat-icon peach"><Hourglass size={28} strokeWidth={1.7} /></span>
              <div>
                <h3>Chờ xác nhận</h3>
                <div><strong>{numberFormat.format(pending.length)}</strong><small>cần phản hồi sinh viên</small></div>
              </div>
            </article>
          </section>
          <section className="au-card ex-today">
            <header>
              <h2><CalendarDays size={24} strokeWidth={1.7} />Lịch hẹn hôm nay</h2>
              <button className="ex-link" onClick={() => go("bookings")}>Xem tất cả <ArrowRight size={16} /></button>
            </header>
            {todayList.length ? (
              <ul>
                {todayList.map((b) => (
                  <li key={b.id}>
                    <span className="ex-time">{timeRange(b)}</span>
                    <span className="ex-who">
                      <Avatar name={b.student_name} tint={tintFor(b.student_name)} />
                      <span>
                        <strong>{b.student_name}</strong>
                        <small>{b.topic || "Chưa có nội dung tư vấn"}</small>
                      </span>
                    </span>
                    <ModePill mode={b.mode} />
                    <span className="ex-confirm-actions">
                      <CallButton booking={b} />
                      <button className="button outline ex-detail" onClick={() => open(b)}>Xem chi tiết</button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ex-empty">Hôm nay bạn chưa có lịch hẹn nào.</p>
            )}
          </section>
        </div>
        <aside className="ex-side">
          <section className="au-card ex-quick">
            <h2><Zap size={22} strokeWidth={1.8} />Tác vụ nhanh</h2>
            <div>
              <button className="green" onClick={() => go("students")}><Users size={24} />Xem hồ sơ được phân công</button>
              <button className="coral" onClick={() => go("confirm")}>
                <CalendarCheck size={24} />Xác nhận lịch hẹn
                {pending.length > 0 && <i>{pending.length}</i>}
              </button>
              <button className="peach" onClick={() => go("notes")}><NotebookPen size={24} />Ghi chú chuyên môn</button>
              <button className="mint" onClick={() => go("sessions")}><Phone size={24} />Phiên tư vấn</button>
            </div>
          </section>
          <section className="au-card ex-notices">
            <header>
              <h2><Bell size={22} strokeWidth={1.8} />Thông báo</h2>
              <button className="ex-link" onClick={() => go("bookings")}>Xem tất cả <ArrowRight size={16} /></button>
            </header>
            {notices.length ? (
              <ul>
                {notices.map((n) => (
                  <li key={n.text}>
                    <button onClick={() => go(n.to)}>
                      <span className={`ex-notice-icon ${n.tone}`}>{n.icon}</span>
                      <span><strong>{n.text}</strong><small>{n.when}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ex-empty">Không có thông báo mới.</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function BookingsSection({ bookings, open, initialSearch }: { bookings: Booking[]; open: (b: Booking) => void; initialSearch: string }) {
  const [search, setSearch] = useState(initialSearch),
    [status, setStatus] = useState("all"),
    [day, setDay] = useState(""),
    [pageSize, setPageSize] = useState(10),
    [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search, status, day, pageSize]);
  const needle = search.trim().toLowerCase();
  const filtered = [...bookings]
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    .filter((b) => (status === "all" || b.status === status) && (!day || vnDate(b.starts_at) === day) && (!needle || `${b.student_name} ${b.topic}`.toLowerCase().includes(needle)));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);
  return (
    <div className="au">
      <AdminBanner eyebrow="CHUYÊN GIA" title="Lịch hẹn của tôi" subtitle="Tất cả yêu cầu tư vấn sinh viên gửi cho hồ sơ của bạn." motto={["Đúng giờ", "Chu đáo", "Tận tâm"]} icon={<CalendarDays size={38} strokeWidth={1.5} aria-hidden="true" />} />
      <section className="au-card">
        <div className="au-tools ex-tools">
          <label className="au-search">
            <Search size={17} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên sinh viên, nội dung…" aria-label="Tìm lịch hẹn" />
          </label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
            <option value="all">Tất cả trạng thái</option>
            {Object.entries(statusNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="ab-day">
            <CalendarDays size={17} />
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Chọn ngày" />
            {day && <button type="button" onClick={() => setDay("")} aria-label="Bỏ lọc ngày">×</button>}
          </label>
        </div>
        <div className="au-table-scroll">
          <table className="au-table ex-table">
            <thead>
              <tr><th>STT</th><th>Ngày giờ</th><th>Sinh viên</th><th>Hình thức</th><th>Nội dung tư vấn</th><th>Trạng thái</th><th>Ghi chú</th><th>Thao tác</th></tr>
            </thead>
            <tbody>
              {visible.map((b, i) => (
                <tr key={b.id}>
                  <td>{(current - 1) * pageSize + i + 1}</td>
                  <td className="ab-when">{displayDate(b.starts_at)}<small>{timeRange(b)}</small></td>
                  <td><span className="au-person"><Avatar name={b.student_name} tint={tintFor(b.student_name)} />{b.student_name}</span></td>
                  <td><ModePill mode={b.mode} /></td>
                  <td className="ab-topic" title={b.topic}>{b.topic || <span className="ab-dash">—</span>}</td>
                  <td><StatusPill status={b.status} /></td>
                  <td>{b.has_note ? <span className="ex-has-note"><NotebookPen size={15} />Đã ghi</span> : <span className="ab-dash">—</span>}</td>
                  <td><div className="au-actions"><button className="view" onClick={() => open(b)} aria-label={`Xem lịch của ${b.student_name}`} title="Xem chi tiết"><Eye size={17} /></button></div></td>
                </tr>
              ))}
              {!visible.length && <tr><td colSpan={8} className="au-empty">{bookings.length ? "Không có lịch hẹn phù hợp bộ lọc." : "Chưa có sinh viên nào đặt lịch với bạn."}</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={current} pages={pages} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={filtered.length} unit="lịch hẹn" />
      </section>
    </div>
  );
}

function StudentsSection({ bookings, showBookings }: { bookings: Booking[]; showBookings: (name: string) => void }) {
  const now = Date.now();
  const byStudent = new Map<string, Booking[]>();
  for (const b of bookings) byStudent.set(b.student_id, [...(byStudent.get(b.student_id) || []), b]);
  const students = [...byStudent.values()]
    .map((list) => {
      const sorted = [...list].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      const upcoming = sorted.find((b) => new Date(b.starts_at).getTime() >= now && (b.status === "pending" || b.status === "confirmed"));
      const latest = sorted[sorted.length - 1];
      return { id: latest.student_id, name: latest.student_name, total: list.length, done: list.filter((b) => b.status === "completed").length, upcoming, latest };
    })
    .sort((a, b) => (a.upcoming?.starts_at || "9").localeCompare(b.upcoming?.starts_at || "9"));
  return (
    <div className="au">
      <AdminBanner eyebrow="CHUYÊN GIA" title="Hồ sơ tư vấn được phân công" subtitle="Sinh viên đã đặt lịch với bạn. Chỉ gồm thông tin sinh viên đồng ý chia sẻ khi đặt lịch." motto={["Mỗi sinh viên", "một câu chuyện", "riêng"]} icon={<Users size={38} strokeWidth={1.5} aria-hidden="true" />} />
      <section className="au-card">
        <div className="au-table-scroll">
          <table className="au-table ex-table">
            <thead>
              <tr><th>STT</th><th>Sinh viên</th><th>Số buổi</th><th>Đã hoàn thành</th><th>Lịch sắp tới</th><th>Số điện thoại</th><th>Thao tác</th></tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr key={s.id}>
                  <td>{i + 1}</td>
                  <td><span className="au-person"><Avatar name={s.name} tint={tintFor(s.name)} /><strong>{s.name}</strong></span></td>
                  <td>{s.total}</td>
                  <td>{s.done}</td>
                  <td>{s.upcoming ? <span className="ab-when">{displayDate(s.upcoming.starts_at)}<small>{timeRange(s.upcoming)}</small></span> : <span className="ab-dash">Chưa có</span>}</td>
                  <td><PhoneLink value={s.latest.contact?.value} /></td>
                  <td><button className="button outline ex-detail" onClick={() => showBookings(s.name)}>Xem lịch hẹn</button></td>
                </tr>
              ))}
              {!students.length && <tr><td colSpan={7} className="au-empty">Chưa có sinh viên nào được phân công cho bạn.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="au-hint ex-privacy">Bạn không xem được nội dung trò chuyện với AI hay kết quả test của sinh viên.</p>
      </section>
    </div>
  );
}

function SessionList({ title, empty, items, open, action }: { title: string; empty: string; items: Booking[]; open: (b: Booking) => void; action?: (b: Booking) => ReactNode }) {
  return (
    <section className="au-card ex-today">
      <header><h2>{title}<small>{items.length}</small></h2></header>
      {items.length ? (
        <ul>
          {items.map((b) => (
            <li key={b.id}>
              <span className="ex-time">{displayDate(b.starts_at)}<small>{timeRange(b)}</small></span>
              <span className="ex-who">
                <Avatar name={b.student_name} tint={tintFor(b.student_name)} />
                <span><strong>{b.student_name}</strong><small>{b.topic || "Chưa có nội dung tư vấn"}</small></span>
              </span>
              <ModePill mode={b.mode} />
              {action ? action(b) : (
                <span className="ex-confirm-actions">
                  <CallButton booking={b} />
                  <button className="button outline ex-detail" onClick={() => open(b)}>Xem chi tiết</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="ex-empty">{empty}</p>
      )}
    </section>
  );
}

function SessionsSection({ bookings, open }: { bookings: Booking[]; open: (b: Booking) => void }) {
  const upcoming = bookings.filter((b) => b.status === "confirmed").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const done = bookings.filter((b) => b.status === "completed").sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return (
    <div className="au">
      <AdminBanner eyebrow="CHUYÊN GIA" title="Phiên tư vấn" subtitle="Buổi tư vấn diễn ra qua điện thoại: bấm số để gọi sinh viên đúng giờ hẹn. Sau buổi, đánh dấu hoàn thành và viết ghi chú." motto={["Lắng nghe", "Thấu hiểu", "Đồng hành"]} icon={<Phone size={38} strokeWidth={1.5} aria-hidden="true" />} />
      <SessionList title="Phiên đã xác nhận" empty="Chưa có phiên nào đã xác nhận." items={upcoming} open={open} />
      <SessionList
        title="Phiên đã hoàn thành"
        empty="Chưa có phiên nào hoàn thành."
        items={done}
        open={open}
        action={(b) => (
          <button className="button outline ex-detail" onClick={() => open(b)}>
            <NotebookPen size={16} />
            {b.has_note ? "Xem ghi chú" : "Viết ghi chú"}
          </button>
        )}
      />
    </div>
  );
}

function ConfirmSection({ bookings, open, changed }: { bookings: Booking[]; open: (b: Booking) => void; changed: (message: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null),
    [rejecting, setRejecting] = useState<Booking | null>(null),
    [error, setError] = useState("");
  const pending = bookings.filter((b) => b.status === "pending").sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  async function update(b: Booking, status: Status, message: string) {
    setBusy(b.id);
    setError("");
    try {
      await api(`/expert/bookings/${b.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setRejecting(null);
      changed(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="au">
      <AdminBanner eyebrow="CHUYÊN GIA" title="Xác nhận lịch hẹn" subtitle="Xác nhận hoặc từ chối khung giờ sinh viên đề xuất. Bạn tự xác nhận được coi là xác nhận thực tế." motto={["Phản hồi kịp thời", "để sinh viên", "yên tâm hơn"]} icon={<ClipboardCheck size={38} strokeWidth={1.5} aria-hidden="true" />} />
      {error && <Notice tone="error">{error}</Notice>}
      <SessionList
        title="Đang chờ xác nhận"
        empty="Không có yêu cầu nào đang chờ. Bạn đã phản hồi hết."
        items={pending}
        open={open}
        action={(b) => (
          <span className="ex-confirm-actions">
            <CallButton booking={b} />
            <button className="button outline ex-detail" onClick={() => open(b)}>Chi tiết</button>
            <button className="button outline au-danger" disabled={busy === b.id} onClick={() => setRejecting(b)}>Từ chối</button>
            <button className="button primary" disabled={busy === b.id} onClick={() => update(b, "confirmed", `Đã xác nhận lịch của ${b.student_name}.`)}>Xác nhận</button>
          </span>
        )}
      />
      {rejecting && (
        <Modal title="Từ chối yêu cầu này?" close={() => setRejecting(null)}>
          <p>Sinh viên {rejecting.student_name} sẽ thấy yêu cầu ngày {displayDate(rejecting.starts_at)} chuyển sang “Đã từ chối”.</p>
          <div className="button-row">
            <button className="button outline" onClick={() => setRejecting(null)}>Quay lại</button>
            <button className="button primary au-danger-solid" disabled={busy === rejecting.id} onClick={() => update(rejecting, "rejected", `Đã từ chối lịch của ${rejecting.student_name}.`)}>Từ chối yêu cầu</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NotesSection({ notes, bookings, open }: { notes: Note[]; bookings: Booking[]; open: (b: Booking) => void }) {
  const [search, setSearch] = useState(""),
    [picking, setPicking] = useState(false);
  const needle = search.trim().toLowerCase();
  const visible = notes.filter((n) => !needle || `${n.student_name} ${n.body}`.toLowerCase().includes(needle));
  // Any live or finished session can carry a note; rejected/cancelled ones never took place.
  const writable = bookings.filter((b) => !b.has_note && b.status !== "rejected" && b.status !== "cancelled").sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const byId = new Map(bookings.map((b) => [b.id, b]));
  return (
    <div className="au">
      <AdminBanner eyebrow="CHUYÊN GIA" title="Ghi chú chuyên môn" subtitle="Ghi chú riêng sau mỗi buổi tư vấn. Được mã hóa và chỉ bạn đọc được." motto={["Ghi lại", "để đồng hành", "tốt hơn"]} icon={<NotebookPen size={38} strokeWidth={1.5} aria-hidden="true" />} />
      <section className="au-card">
        <div className="au-tools ex-tools">
          <label className="au-search">
            <Search size={17} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm trong ghi chú…" aria-label="Tìm ghi chú" />
          </label>
          <button className="button primary au-add" onClick={() => setPicking(true)}>
            <NotebookPen size={17} />
            Viết ghi chú
          </button>
        </div>
        {visible.length ? (
          <ul className="ex-notes">
            {visible.map((n) => (
              <li key={n.booking_id}>
                <button onClick={() => { const b = byId.get(n.booking_id); if (b) open(b); }}>
                  <span className="ex-notes-head">
                    <strong>{n.student_name}</strong>
                    <small>Buổi {displayDate(n.starts_at)} · cập nhật {ago(n.updated)}</small>
                  </span>
                  <span className="ex-notes-body">{n.body}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ex-empty">{notes.length ? "Không có ghi chú phù hợp." : "Chưa có ghi chú nào. Bấm “Viết ghi chú” để chọn buổi tư vấn."}</p>
        )}
      </section>
      {picking && (
        <Modal title="Chọn buổi để viết ghi chú" close={() => setPicking(false)}>
          {writable.length ? (
            <ul className="ex-pick">
              {writable.map((b) => (
                <li key={b.id}>
                  <button onClick={() => { setPicking(false); open(b); }}>
                    <Avatar name={b.student_name} tint={tintFor(b.student_name)} />
                    <span>
                      <strong>{b.student_name}</strong>
                      <small>{displayDate(b.starts_at)} · {timeRange(b)}{b.topic ? ` · ${b.topic}` : ""}</small>
                    </span>
                    <StatusPill status={b.status} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ex-empty">
              {bookings.length
                ? "Mọi buổi tư vấn của bạn đều đã có ghi chú. Mở ghi chú trong danh sách để sửa."
                : "Bạn chưa có lịch hẹn nào. Ghi chú được gắn với từng buổi tư vấn, nên cần có sinh viên đặt lịch trước."}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

function AccountSection({ user, profile }: { user: User; profile: Profile | null }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form);
    if (f.get("new") !== f.get("again")) return setError("Mật khẩu nhập lại chưa khớp.");
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/me/password", { method: "PUT", body: JSON.stringify({ current_password: f.get("current"), new_password: f.get("new") }) });
      form.reset();
      setMessage("Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rows: [string, string][] = [
    ["Họ tên tài khoản", user.name],
    ["Email đăng nhập", user.email],
    ["Hồ sơ chuyên gia", profile?.name || "—"],
    ["Chuyên môn", profile?.specialty || "—"],
    ["Bằng cấp", profile?.degree || "—"],
    ["Nơi làm việc", profile?.workplace || "—"],
    ["Hiển thị với sinh viên", profile ? (profile.published ? "Đang hiển thị" : "Đang tạm ngưng") : "—"],
  ];
  return (
    <div className="au">
      <AdminBanner eyebrow="CHUYÊN GIA" title="Cài đặt tài khoản" subtitle="Thông tin hồ sơ do Admin quản lý. Bạn có thể đổi mật khẩu tại đây." motto={["An toàn", "Bảo mật", "Riêng tư"]} icon={<Settings size={38} strokeWidth={1.5} aria-hidden="true" />} />
      <div className="ex-account">
        <section className="au-card">
          <h2>Thông tin hồ sơ</h2>
          <dl className="au-details">
            {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <p className="au-hint">Cần sửa thông tin hồ sơ? Hãy liên hệ Admin.</p>
        </section>
        <section className="au-card">
          <h2>Đổi mật khẩu</h2>
          <form onSubmit={submit} className="ex-password">
            <label>Mật khẩu hiện tại<input name="current" type="password" required maxLength={128} autoComplete="current-password" /></label>
            <label>Mật khẩu mới<input name="new" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
            <label>Nhập lại mật khẩu mới<input name="again" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></label>
            {error && <Notice tone="error">{error}</Notice>}
            {message && <Notice tone="success">{message}</Notice>}
            <button className="button primary" disabled={busy}>{busy ? "Đang lưu…" : "Cập nhật mật khẩu"}</button>
          </form>
        </section>
      </div>
    </div>
  );
}

export default function ExpertShell({ user, logout, theme, toggleTheme }: { user: User; logout: () => void; theme: string; toggleTheme: () => void }) {
  const [section, setSection] = useState<Section>("overview"),
    [bookings, setBookings] = useState<Booking[]>([]),
    [notes, setNotes] = useState<Note[]>([]),
    [profile, setProfile] = useState<Profile | null>(null),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [opened, setOpened] = useState<Booking | null>(null),
    [bookingSearch, setBookingSearch] = useState("");
  function refresh() {
    Promise.all([api<Booking[]>("/expert/bookings"), api<Note[]>("/expert/notes"), api<Profile>("/expert/profile")])
      .then(([b, n, p]) => {
        setBookings(b);
        setOpened(previous => previous ? b.find(row => row.id === previous.id) || null : null);
        setNotes(n);
        setProfile(p);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }
  useEffect(() => {refresh();const id=setInterval(refresh,15000);return()=>clearInterval(id);}, []);
  function go(next: Section) {
    setSection(next);
    setMessage("");
    if (next !== "bookings") setBookingSearch("");
  }
  const pending = bookings.filter((b) => b.status === "pending").length;
  let content: ReactNode;
  if (!loaded) content = <div className="admin-loading">Đang tải công việc của bạn…</div>;
  else if (section === "availability") content = <WeeklyAvailability />;
  else if (section === "income") content = <ExpertWallet />;
  else if (section === "overview") content = <Overview user={user} profile={profile} bookings={bookings} open={setOpened} go={go} />;
  else if (section === "bookings") content = <BookingsSection key={bookingSearch} bookings={bookings} open={setOpened} initialSearch={bookingSearch} />;
  else if (section === "students") content = <StudentsSection bookings={bookings} showBookings={(name) => { setBookingSearch(name); setSection("bookings"); }} />;
  else if (section === "sessions") content = <SessionsSection bookings={bookings} open={setOpened} />;
  else if (section === "confirm") content = <ConfirmSection bookings={bookings} open={setOpened} changed={(m) => { setMessage(m); refresh(); }} />;
  else if (section === "notes") content = <NotesSection notes={notes} bookings={bookings} open={setOpened} />;
  else content = <AccountSection user={user} profile={profile} />;
  return (
    <PortalShell
      user={user}
      roleLabel="Chuyên gia tâm lý"
      sections={sections}
      section={section}
      onSection={go}
      alerts={pending}
      alertLabel={pending ? `${pending} lịch hẹn chờ xác nhận` : "Không có lịch hẹn chờ xác nhận"}
      onAlerts={() => go("confirm")}
      logout={logout}
      theme={theme}
      toggleTheme={toggleTheme}
    >
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {content}
      {opened && (
        <BookingModal
          booking={opened}
          close={() => setOpened(null)}
          changed={(m) => {
            setOpened(null);
            setMessage(m);
            refresh();
          }}
        />
      )}
    </PortalShell>
  );
}
