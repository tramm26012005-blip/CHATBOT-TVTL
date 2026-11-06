"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, CalendarDays, CheckCheck, Clock, Eye, Hourglass, Pencil, Phone, Plus, Search, Sun, Trash2, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { AdminBanner, Avatar, Modal, Notice, Pager, VN, numberFormat } from "../shared/thanh-phan-chung";
import "../shared/lich-hen-chung.css";

type Booking = {
  id: string;
  expert_id: string;
  expert_name: string;
  student_name: string;
  starts_at: string;
  duration_minutes: number;
  mode: "online" | "offline" | null;
  topic: string;
  status: "pending" | "confirmed" | "completed" | "rejected" | "cancelled";
  contact: { value: string };
  created: string | null;
};
type Student = { id: string; name: string; email: string };
type ExpertProfile = { id: string; published: boolean; data: { name: string } };

const statusNames: Record<Booking["status"], string> = {
  pending: "Đang chờ xác nhận",
  confirmed: "Đã xác nhận",
  completed: "Đã hoàn thành",
  rejected: "Đã từ chối",
  cancelled: "Đã hủy",
};
const transitions: Partial<Record<Booking["status"], Booking["status"][]>> = {
  pending: ["confirmed", "rejected"],
  confirmed: ["rejected"],
};
const avatarTints = ["#5f907c", "#d9705f", "#9a7b6b", "#8a6fb0", "#c98a4b"];

function vnDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: VN });
}
function vnTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: VN, hour: "2-digit", minute: "2-digit", hour12: false });
}
function displayDate(iso: string) {
  const [y, m, d] = vnDate(iso).split("-");
  return `${d}/${m}/${y}`;
}
function timeRange(b: Booking) {
  const end = new Date(new Date(b.starts_at).getTime() + b.duration_minutes * 60000).toISOString();
  return `${vnTime(b.starts_at)} - ${vnTime(end)}`;
}
function toIso(date: string, time: string) {
  return `${date}T${time}:00+07:00`;
}

function ModePill({ mode }: { mode: Booking["mode"] }) {
  if (!mode) return <span className="ab-dash">—</span>;
  return mode === "online" ? (
    <span className="au-pill ab-online"><Phone size={14} />Gọi điện</span>
  ) : (
    <span className="au-pill ab-offline"><UserRound size={14} />Trực tiếp</span>
  );
}

function StatusPill({ status }: { status: Booking["status"] }) {
  return <span className={`au-pill ab-${status}`}><i />{statusNames[status]}</span>;
}

const durations = [15, 20, 25, 30];

function ScheduleFields({ booking, locked = false }: { booking?: Booking; locked?: boolean }) {
  return (
    <>
      <label>Ngày *<input name="date" type="date" required disabled={locked} defaultValue={booking ? vnDate(booking.starts_at) : ""} /></label>
      <label>Giờ bắt đầu (giờ VN) *<input name="time" type="time" required disabled={locked} defaultValue={booking ? vnTime(booking.starts_at) : "09:00"} /></label>
      <label>
        Thời lượng
        <select name="duration" defaultValue={Math.min(booking?.duration_minutes ?? 30, 30)}>
          {durations.map((d) => <option key={d} value={d}>{d} phút</option>)}
        </select>
      </label>
      <label>
        Hình thức *
        <select name="mode" required defaultValue={booking?.mode ?? ""}>
          <option value="" disabled>Chọn hình thức…</option>
          <option value="online">Gọi điện thoại</option>
          <option value="offline">Trực tiếp</option>
        </select>
      </label>
      <label className="ab-wide">Nội dung tư vấn<input name="topic" maxLength={200} defaultValue={booking?.topic ?? ""} placeholder="Ví dụ: Căng thẳng học tập" /></label>
    </>
  );
}

function CreateModal({ students, experts, close, created }: { students: Student[]; experts: ExpertProfile[]; close: () => void; created: () => void }) {
  const [contact, setContact] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/admin/bookings", {
        method: "POST",
        body: JSON.stringify({
          user_id: f.get("user_id"),
          expert_id: f.get("expert_id"),
          starts_at: toIso(String(f.get("date")), String(f.get("time"))),
          duration_minutes: Number(f.get("duration")),
          mode: f.get("mode"),
          topic: String(f.get("topic") || "").trim(),
          contact,
        }),
      });
      created();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Thêm lịch hẹn" close={close} wide>
      <form onSubmit={submit}>
        <div className="two-columns">
          <label>
            Sinh viên *
            <select name="user_id" required defaultValue="">
              <option value="" disabled>{students.length ? "Chọn sinh viên…" : "Chưa có tài khoản sinh viên"}</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.email}</option>)}
            </select>
          </label>
          <label>
            Chuyên gia *
            <select name="expert_id" required defaultValue="">
              <option value="" disabled>{experts.length ? "Chọn chuyên gia…" : "Chưa có hồ sơ chuyên gia"}</option>
              {experts.map((x) => <option key={x.id} value={x.id}>{x.data.name}{x.published ? "" : " (tạm ngưng)"}</option>)}
            </select>
          </label>
          <ScheduleFields />
          <label className="ab-wide">Số điện thoại sinh viên (chuyên gia gọi tư vấn) *<input type="tel" required pattern="^\+?[0-9 .\-]{8,20}$" maxLength={20} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Ví dụ: 0901 234 567" /></label>
        </div>
        <p className="au-hint">Lịch do Admin tạo ở trạng thái “Đang chờ xác nhận”. Xác nhận sau khi đã có xác nhận thực tế từ chuyên gia.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <button className="button primary" disabled={busy}>{busy ? "Đang tạo…" : "Tạo lịch hẹn"}</button>
      </form>
    </Modal>
  );
}

function EditModal({ booking, close, saved }: { booking: Booking; close: () => void; saved: () => void }) {
  const [next, setNext] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const locked = booking.status === "confirmed";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    // Only send what changed, so an untouched confirmed slot is never "moved".
    const body: Record<string, unknown> = {};
    if (!locked) {
      const start = toIso(String(f.get("date")), String(f.get("time")));
      if (new Date(start).getTime() !== new Date(booking.starts_at).getTime()) body.starts_at = start;
    }
    if (Number(f.get("duration")) !== booking.duration_minutes) body.duration_minutes = Number(f.get("duration"));
    if (f.get("mode") !== booking.mode) body.mode = f.get("mode");
    const topic = String(f.get("topic") || "").trim();
    if (topic !== booking.topic) body.topic = topic;
    if (next) {
      body.status = next;
      body.confirmation_received = f.get("confirmed") === "on";
    }
    if (!Object.keys(body).length) return close();
    setBusy(true);
    setError("");
    try {
      await api(`/admin/bookings/${booking.id}`, { method: "PATCH", body: JSON.stringify(body) });
      saved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const options = transitions[booking.status] || [];
  return (
    <Modal title="Chỉnh sửa lịch hẹn" close={close} wide>
      <form onSubmit={submit}>
        <p className="au-hint">{booking.student_name} · {booking.expert_name}</p>
        <div className="two-columns">
          <ScheduleFields booking={booking} locked={locked} />
          <label className="ab-wide">
            Trạng thái
            <select value={next} onChange={(e) => setNext(e.target.value)} disabled={!options.length}>
              <option value="">Giữ nguyên · {statusNames[booking.status]}</option>
              {options.map((s) => <option key={s} value={s}>Chuyển sang: {statusNames[s]}</option>)}
            </select>
          </label>
        </div>
        {next === "confirmed" && (
          <label className="checkbox">
            <input type="checkbox" name="confirmed" required />
            Tôi đã nhận xác nhận thực tế từ chuyên gia hoặc cơ sở về khung giờ này.
          </label>
        )}
        {locked && <p className="au-hint">Lịch đã xác nhận không đổi được ngày giờ. Nếu cần dời lịch, hãy từ chối lịch này và tạo lịch mới.</p>}
        {error && <Notice tone="error">{error}</Notice>}
        <button className="button primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu thay đổi"}</button>
      </form>
    </Modal>
  );
}

function ViewModal({ booking, close }: { booking: Booking; close: () => void }) {
  const rows: [string, ReactNode][] = [
    ["Ngày", displayDate(booking.starts_at)],
    ["Thời gian", `${timeRange(booking)} (${booking.duration_minutes} phút)`],
    ["Chuyên gia", booking.expert_name],
    ["Hình thức", <ModePill key="mode" mode={booking.mode} />],
    ["Nội dung tư vấn", booking.topic || "—"],
    ["Liên hệ sinh viên", booking.contact?.value || "—"],
    ["Trạng thái", <StatusPill key="status" status={booking.status} />],
  ];
  return (
    <Modal title="Thông tin lịch hẹn" close={close}>
      <div className="au-view-head">
        <Avatar name={booking.student_name} tint="#5f907c" />
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
      <p className="au-hint">Thông tin liên hệ và nội dung tư vấn được mã hóa, chỉ dùng để sắp xếp buổi tư vấn.</p>
    </Modal>
  );
}

export default function AdminBookings() {
  const [rows, setRows] = useState<Booking[]>([]),
    [students, setStudents] = useState<Student[]>([]),
    [experts, setExperts] = useState<ExpertProfile[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [day, setDay] = useState(""),
    [pageSize, setPageSize] = useState(10),
    [page, setPage] = useState(1),
    [viewing, setViewing] = useState<Booking | null>(null),
    [editing, setEditing] = useState<Booking | null>(null),
    [creating, setCreating] = useState(false),
    [deleting, setDeleting] = useState<Booking | null>(null),
    [busy, setBusy] = useState(false);
  function refresh() {
    Promise.all([api<Booking[]>("/admin/bookings"), api<Student[]>("/admin/users"), api<ExpertProfile[]>("/admin/content/experts")])
      .then(([bookings, users, profiles]) => {
        // Latest appointment time first.
        setRows([...bookings].sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()));
        setStudents(users);
        setExperts(profiles);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }
  useEffect(refresh, []);
  useEffect(() => setPage(1), [search, status, day, pageSize]);

  const needle = search.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (!day || vnDate(r.starts_at) === day) &&
      (!needle || `${r.student_name} ${r.expert_name} ${r.topic}`.toLowerCase().includes(needle)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

  const today = new Date().toLocaleDateString("en-CA", { timeZone: VN });
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: VN });
  const scheduledOn = (d: string) => rows.filter((r) => vnDate(r.starts_at) === d && !["rejected", "cancelled"].includes(r.status)).length;
  const todayCount = scheduledOn(today), diff = todayCount - scheduledOn(yesterday);
  const monthAgo = Date.now() - 30 * 86400000;
  const added = rows.filter((r) => r.created && new Date(r.created).getTime() >= monthAgo).length;

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/bookings/${deleting.id}`, { method: "DELETE" });
      setMessage(`Đã xóa lịch hẹn của ${deleting.student_name}.`);
      setDeleting(null);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="au">
      <AdminBanner title="Quản lý lịch hẹn" subtitle="Theo dõi và quản lý lịch hẹn tư vấn của sinh viên với chuyên gia." motto={["Sắp xếp khoa học", "Quản lý hiệu quả", "Đồng hành kịp thời"]} icon={<Sun size={40} strokeWidth={1.5} aria-hidden="true" />} />

      <section className="au-stats" aria-label="Số liệu lịch hẹn">
        <article>
          <span className="au-stat-icon green"><CalendarDays size={28} strokeWidth={1.7} /></span>
          <div>
            <h3>Tổng lịch hẹn</h3>
            <div>
              <strong>{numberFormat.format(rows.length)}</strong>
              {added ? (
                <small className="au-change"><b className="up"><ArrowUp size={14} />{added}</b>lịch mới trong 30 ngày</small>
              ) : (
                <small>Chưa có lịch mới trong 30 ngày</small>
              )}
            </div>
          </div>
        </article>
        <article>
          <span className="au-stat-icon coral"><Clock size={28} strokeWidth={1.7} /></span>
          <div>
            <h3>Lịch hẹn hôm nay</h3>
            <div>
              <strong>{numberFormat.format(todayCount)}</strong>
              {diff ? (
                <small className="au-change"><b className={diff > 0 ? "up" : "down"}>{diff > 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}{Math.abs(diff)}</b>so với hôm qua</small>
              ) : (
                <small>bằng hôm qua</small>
              )}
            </div>
          </div>
        </article>
        <article>
          <span className="au-stat-icon blue"><CheckCheck size={28} strokeWidth={1.7} /></span>
          <div>
            <h3>Đã hoàn thành</h3>
            <div><strong>{numberFormat.format(rows.filter((r) => r.status === "completed").length)}</strong><small>buổi tư vấn đã diễn ra</small></div>
          </div>
        </article>
        <article>
          <span className="au-stat-icon peach"><Hourglass size={28} strokeWidth={1.7} /></span>
          <div>
            <h3>Đang chờ xác nhận</h3>
            <div><strong>{numberFormat.format(rows.filter((r) => r.status === "pending").length)}</strong><small>cần liên hệ chuyên gia</small></div>
          </div>
        </article>
      </section>

      <section className="au-card">
        <div className="au-card-head">
          <div className="au-card-title">
            <span className="ab-title-icon"><CalendarDays size={22} strokeWidth={1.7} /></span>
            <div>
              <h2>Danh sách lịch hẹn</h2>
              <p>Xem và quản lý tất cả lịch hẹn tư vấn của sinh viên.</p>
            </div>
          </div>
          <div className="au-tools">
            <label className="au-search">
              <Search size={17} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên sinh viên, chuyên gia…" aria-label="Tìm lịch hẹn" />
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
            <button className="button primary au-add" onClick={() => { setCreating(true); setMessage(""); }}>
              <Plus size={17} />
              Thêm lịch hẹn
            </button>
          </div>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {message && <Notice tone="success">{message}</Notice>}
        <div className="au-table-scroll">
          <table className="au-table ab-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Ngày giờ</th>
                <th>Tên sinh viên</th>
                <th>Chuyên gia</th>
                <th>Hình thức</th>
                <th>Nội dung tư vấn</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.id}>
                  <td>{(current - 1) * pageSize + i + 1}</td>
                  <td className="ab-when">{displayDate(r.starts_at)}<small>{timeRange(r)}</small></td>
                  <td>
                    <span className="au-person">
                      <Avatar name={r.student_name} tint={avatarTints[[...r.student_name].reduce((s, c) => s + c.charCodeAt(0), 0) % avatarTints.length]} />
                      {r.student_name}
                    </span>
                  </td>
                  <td>{r.expert_name}</td>
                  <td><ModePill mode={r.mode} /></td>
                  <td className="ab-topic" title={r.topic}>{r.topic || <span className="ab-dash">—</span>}</td>
                  <td><StatusPill status={r.status} /></td>
                  <td>
                    <div className="au-actions">
                      <button className="view" onClick={() => setViewing(r)} aria-label={`Xem lịch của ${r.student_name}`} title="Xem"><Eye size={17} /></button>
                      <button className="edit" onClick={() => { setEditing(r); setMessage(""); }} aria-label={`Sửa lịch của ${r.student_name}`} title="Sửa"><Pencil size={16} /></button>
                      <button className="delete" onClick={() => setDeleting(r)} aria-label={`Xóa lịch của ${r.student_name}`} title="Xóa"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={8} className="au-empty">
                    {!loaded ? "Đang tải danh sách…" : rows.length ? "Không có lịch hẹn phù hợp bộ lọc." : "Chưa có lịch hẹn nào."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={current} pages={pages} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={filtered.length} unit="lịch hẹn" />
      </section>

      {viewing && <ViewModal booking={viewing} close={() => setViewing(null)} />}
      {editing && <EditModal booking={editing} close={() => setEditing(null)} saved={() => { setMessage(`Đã cập nhật lịch hẹn của ${editing.student_name}.`); setEditing(null); refresh(); }} />}
      {creating && <CreateModal students={students} experts={experts} close={() => setCreating(false)} created={() => { setCreating(false); setMessage("Đã tạo lịch hẹn mới."); refresh(); }} />}
      {deleting && (
        <Modal title="Xóa lịch hẹn này?" close={() => setDeleting(null)}>
          <p>Lịch hẹn của {deleting.student_name} với {deleting.expert_name} ngày {displayDate(deleting.starts_at)} sẽ bị xóa vĩnh viễn, kể cả bên sinh viên. Nếu chỉ muốn hủy buổi hẹn, hãy chuyển trạng thái sang “Đã từ chối”.</p>
          <div className="button-row">
            <button className="button outline" onClick={() => setDeleting(null)} disabled={busy}>Quay lại</button>
            <button className="button primary au-danger-solid" onClick={confirmDelete} disabled={busy}>{busy ? "Đang xóa…" : "Xóa lịch hẹn"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
