"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Crown,
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { AdminBanner, Avatar, Modal, Notice, Pager, VN, numberFormat } from "../shared/thanh-phan-chung";

type Student = {
  id: string;
  stt: number;
  name: string;
  email: string;
  password_hash_masked: string;
  created_at: string | null;
  created_at_source: string | null;
  membership_tier: "normal" | "vip";
  vip_expires_at: string | null;
  email_verified: boolean;
  is_active: boolean;
};

function formatDateTime(value: string | null) {
  if (!value) return "Chưa ghi nhận";
  const d = new Date(value);
  const date = d.toLocaleDateString("vi-VN", { timeZone: VN, day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("vi-VN", { timeZone: VN, hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${time}`;
}

function TierPill({ tier }: { tier: Student["membership_tier"] }) {
  return tier === "vip" ? (
    <span className="au-pill vip"><Crown size={14} />VIP</span>
  ) : (
    <span className="au-pill normal"><UserRound size={14} />Thường</span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return <span className={`au-pill ${active ? "active" : "locked"}`}><i />{active ? "Đang hoạt động" : "Tạm khóa"}</span>;
}

function EditModal({ student, close, saved }: { student: Student; close: () => void; saved: () => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name")).trim(), tier = f.get("tier"), active = f.get("status") === "active";
    // Only send what changed: re-sending "vip" would restart the 30-day term.
    const body: Record<string, unknown> = {};
    if (name !== student.name) body.name = name;
    if (tier !== student.membership_tier) body.membership_tier = tier;
    if (active !== student.is_active) body.is_active = active;
    if (!Object.keys(body).length) return close();
    setBusy(true);
    setError("");
    try {
      await api(`/admin/users/${student.id}`, { method: "PATCH", body: JSON.stringify(body) });
      saved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Chỉnh sửa người dùng" close={close} wide>
      <form onSubmit={submit}>
        <div className="two-columns">
          <label>Họ tên *<input name="name" required minLength={2} maxLength={80} defaultValue={student.name} /></label>
          <label>Email<input value={student.email} disabled readOnly /></label>
          <label>
            Hạng tài khoản
            <select name="tier" defaultValue={student.membership_tier}>
              <option value="normal">Thường</option>
              <option value="vip">VIP</option>
            </select>
          </label>
          <label>
            Trạng thái
            <select name="status" defaultValue={student.is_active ? "active" : "locked"}>
              <option value="active">Đang hoạt động</option>
              <option value="locked">Tạm khóa</option>
            </select>
          </label>
        </div>
        <p className="au-hint">Chuyển sang VIP cấp 30 ngày kể từ hôm nay. Tạm khóa sẽ đăng xuất tài khoản khỏi mọi thiết bị.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <button className="button primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu thay đổi"}</button>
      </form>
    </Modal>
  );
}

function ViewModal({ student, close }: { student: Student; close: () => void }) {
  const rows: [string, ReactNode][] = [
    ["Họ tên", student.name],
    ["Email", student.email],
    ["Email đã xác thực", student.email_verified ? "Đã xác thực" : "Chưa xác thực"],
    ["Mật khẩu", student.password_hash_masked],
    ["Ngày khởi tạo", formatDateTime(student.created_at)],
    ["Hạng tài khoản", <TierPill key="tier" tier={student.membership_tier} />],
    ["Hạn VIP", student.membership_tier === "vip" ? (student.vip_expires_at ? formatDateTime(student.vip_expires_at) : "Không thời hạn") : "—"],
    ["Trạng thái", <StatusPill key="status" active={student.is_active} />],
  ];
  return (
    <Modal title="Thông tin người dùng" close={close}>
      <div className="au-view-head">
        <Avatar name={student.name} />
        <div>
          <strong>{student.name}</strong>
          <span>STT {student.stt}</span>
        </div>
      </div>
      <dl className="au-details">
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <p className="au-hint">Admin không xem được nội dung tâm sự hay kết quả test của sinh viên.</p>
    </Modal>
  );
}

export default function AdminUsers({ initialSearch = "" }: { initialSearch?: string }) {
  const [rows, setRows] = useState<Student[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(initialSearch),
    [tier, setTier] = useState("all"),
    [status, setStatus] = useState("all"),
    [pageSize, setPageSize] = useState(5),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [viewing, setViewing] = useState<Student | null>(null),
    [editing, setEditing] = useState<Student | null>(null),
    [deleting, setDeleting] = useState<Student[] | null>(null),
    [busy, setBusy] = useState(false);
  function refresh() {
    api<Student[]>("/admin/users")
      .then((data) => {
        setRows(data);
        setSelected((prev) => new Set([...prev].filter((id) => data.some((r) => r.id === id))));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }
  useEffect(refresh, []);
  useEffect(() => setPage(1), [search, tier, status, pageSize]);

  const needle = search.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (tier === "all" || r.membership_tier === tier) &&
      (status === "all" || (status === "active") === r.is_active) &&
      (!needle || `${r.name} ${r.email}`.toLowerCase().includes(needle)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  const total = rows.length, vip = rows.filter((r) => r.membership_tier === "vip").length, active = rows.filter((r) => r.is_active).length;
  const monthAgo = Date.now() - 30 * 86400000;
  const before = rows.filter((r) => r.created_at && new Date(r.created_at).getTime() < monthAgo).length;
  const growth = before ? Math.round(((total - before) * 100) / before) : null;
  const share = (n: number) => (total ? Math.round((n * 100) / total) : 0);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    const next = new Set(selected);
    visible.forEach((r) => (allVisibleSelected ? next.delete(r.id) : next.add(r.id)));
    setSelected(next);
  }
  async function bulkStatus(nextActive: boolean) {
    const targets = rows.filter((r) => selected.has(r.id) && r.is_active !== nextActive);
    setBusy(true);
    setError("");
    try {
      for (const r of targets) await api(`/admin/users/${r.id}`, { method: "PATCH", body: JSON.stringify({ is_active: nextActive }) });
      setMessage(`Đã ${nextActive ? "mở khóa" : "khóa"} ${targets.length} tài khoản.`);
      refresh();
    } catch (e) {
      setError((e as Error).message);
      refresh();
    } finally {
      setBusy(false);
    }
  }
  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      for (const r of deleting) await api(`/admin/users/${r.id}`, { method: "DELETE" });
      setMessage(deleting.length === 1 ? `Đã xóa tài khoản ${deleting[0].email}.` : `Đã xóa ${deleting.length} tài khoản.`);
      setDeleting(null);
      refresh();
    } catch (e) {
      setError((e as Error).message);
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="au">
      <AdminBanner title="Quản lý người dùng" subtitle="Hồ sơ tài khoản sinh viên, hạng VIP/thường và trạng thái truy cập." motto={["Quản lý tốt", "Đồng hành lâu dài", "Vì sinh viên khỏe mạnh"]} />
      <section className="au-stats" aria-label="Số liệu người dùng">
        <article>
          <span className="au-stat-icon green"><Users size={28} strokeWidth={1.7} /></span>
          <div>
            <h3>Tổng người dùng</h3>
            <div>
              <strong>{numberFormat.format(total)}</strong>
              {growth === null ? (
                <small>Chưa có số liệu 30 ngày trước</small>
              ) : (
                <small className="au-change">
                  <b className={growth < 0 ? "down" : "up"}>{growth < 0 ? <ArrowDown size={14} /> : <ArrowUp size={14} />}{Math.abs(growth)}%</b>
                  so với 30 ngày trước
                </small>
              )}
            </div>
          </div>
        </article>
        <article>
          <span className="au-stat-icon coral"><Crown size={28} strokeWidth={1.7} /></span>
          <div>
            <h3>Tài khoản VIP</h3>
            <div><strong>{numberFormat.format(vip)}</strong><small>{share(vip)}% tổng số người dùng</small></div>
          </div>
        </article>
        <article>
          <span className="au-stat-icon blue"><UserRound size={28} strokeWidth={1.7} /></span>
          <div>
            <h3>Tài khoản thường</h3>
            <div><strong>{numberFormat.format(total - vip)}</strong><small>{share(total - vip)}% tổng số người dùng</small></div>
          </div>
        </article>
        <article>
          <span className="au-stat-icon peach"><Clock size={28} strokeWidth={1.7} /></span>
          <div>
            <h3>Đang hoạt động</h3>
            <div><strong>{numberFormat.format(active)}</strong><small>{numberFormat.format(total - active)} tài khoản đang tạm khóa</small></div>
          </div>
        </article>
      </section>

      <section className="au-card">
        <div className="au-card-head">
          <div className="au-card-title">
            <Users size={26} strokeWidth={1.6} />
            <div>
              <h2>Danh sách người dùng</h2>
              <p>Quản lý hồ sơ tài khoản, hạng VIP/thường và trạng thái truy cập.</p>
            </div>
          </div>
          <div className="au-tools">
            <label className="au-search">
              <Search size={17} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, email…" aria-label="Tìm người dùng" />
            </label>
            <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Lọc hạng tài khoản">
              <option value="all">Tất cả hạng</option>
              <option value="vip">VIP</option>
              <option value="normal">Thường</option>
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="locked">Tạm khóa</option>
            </select>
            <span className="au-hint">Khách hàng tự đăng ký và xác thực email.</span>
          </div>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {message && <Notice tone="success">{message}</Notice>}
        {selected.size > 0 && (
          <div className="au-bulk" role="toolbar" aria-label="Thao tác hàng loạt">
            <span>Đã chọn {selected.size} tài khoản</span>
            <button className="button outline small" disabled={busy} onClick={() => bulkStatus(false)}>Khóa</button>
            <button className="button outline small" disabled={busy} onClick={() => bulkStatus(true)}>Mở khóa</button>
            <button className="button outline small au-danger" disabled={busy} onClick={() => setDeleting(rows.filter((r) => selected.has(r.id)))}>Xóa</button>
            <button className="au-link" onClick={() => setSelected(new Set())}>Bỏ chọn</button>
          </div>
        )}
        <div className="au-table-scroll">
          <table className="au-table">
            <thead>
              <tr>
                <th><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="Chọn tất cả trên trang" /></th>
                <th>STT</th>
                <th>Tên khách hàng</th>
                <th>Email</th>
                <th className="au-col-hash">Mật khẩu băm</th>
                <th>Ngày khởi tạo</th>
                <th>Hạng tài khoản</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className={selected.has(r.id) ? "is-selected" : ""}>
                  <td><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Chọn ${r.name}`} /></td>
                  <td>{r.stt}</td>
                  <td><span className="au-person"><Avatar name={r.name} />{r.name}</span></td>
                  <td>{r.email}</td>
                  <td className="au-hash au-col-hash">{r.password_hash_masked}</td>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td><TierPill tier={r.membership_tier} /></td>
                  <td><StatusPill active={r.is_active} /></td>
                  <td>
                    <div className="au-actions">
                      <button className="view" onClick={() => setViewing(r)} aria-label={`Xem ${r.name}`} title="Xem"><Eye size={17} /></button>
                      <button className="edit" onClick={() => { setEditing(r); setMessage(""); }} aria-label={`Sửa ${r.name}`} title="Sửa"><Pencil size={16} /></button>
                      <button className="delete" onClick={() => setDeleting([r])} aria-label={`Xóa ${r.name}`} title="Xóa"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={9} className="au-empty">
                    {!loaded ? "Đang tải danh sách…" : rows.length ? "Không tìm thấy người dùng phù hợp." : "Chưa có tài khoản sinh viên."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={current} pages={pages} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={filtered.length} unit="người dùng" />
      </section>

      {viewing && <ViewModal student={viewing} close={() => setViewing(null)} />}
      {editing && <EditModal student={editing} close={() => setEditing(null)} saved={() => { setMessage(`Đã cập nhật ${editing.email}.`); setEditing(null); refresh(); }} />}
      {deleting && (
        <Modal title={deleting.length === 1 ? `Xóa tài khoản ${deleting[0].name}?` : `Xóa ${deleting.length} tài khoản?`} close={() => setDeleting(null)}>
          <p>Toàn bộ dữ liệu của {deleting.length === 1 ? "tài khoản này" : "các tài khoản này"} (lịch sử đã lưu, lịch hẹn, hạn mức) sẽ bị xóa vĩnh viễn và không khôi phục được. Nếu chỉ muốn tạm ngừng, hãy dùng Tạm khóa.</p>
          <div className="button-row">
            <button className="button outline" onClick={() => setDeleting(null)} disabled={busy}>Quay lại</button>
            <button className="button primary au-danger-solid" onClick={confirmDelete} disabled={busy}>{busy ? "Đang xóa…" : "Xóa vĩnh viễn"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
