"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUp, Clock, Crown, Eye, EyeOff, Pencil, Plus, Search, ShieldCheck, Trash2, UserCog, UserRound, Users } from "lucide-react";
import { api } from "@/lib/api";
import { AdminBanner, Avatar, Modal, Notice, Pager, VN, numberFormat } from "../shared/thanh-phan-chung";
import "./tai-khoan-nhan-su.css";

type StaffAccount = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "expert";
  expert_id: string | null;
  expert_name: string | null;
  is_active: boolean;
  created_at: string | null;
};
type ExpertProfile = { id: string; published: boolean; data: { name?: string } };

const roleNames = { admin: "Admin", expert: "Chuyên gia" };

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("vi-VN", { timeZone: VN, day: "2-digit", month: "2-digit", year: "numeric" }) : "Chưa ghi nhận";
}

function RolePill({ role }: { role: StaffAccount["role"] }) {
  return role === "admin" ? (
    <span className="au-pill admin"><Crown size={14} />Admin</span>
  ) : (
    <span className="au-pill normal"><UserRound size={14} />Chuyên gia</span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return <span className={`au-pill ${active ? "active" : "locked"}`}><i />{active ? "Đang hoạt động" : "Tạm ngưng"}</span>;
}

function PasswordField({
  value,
  onChange,
  label = "Mật khẩu",
  required = true,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="staff-password-field">
      {label}
      {required ? " *" : ""}
      <span>
        <input
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          required={required}
          disabled={disabled}
          minLength={8}
          maxLength={128}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="icon-button" disabled={disabled} onClick={() => setVisible(!visible)} aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
        <button
          type="button"
          className="button outline small"
          disabled={disabled}
          onClick={() => {
            onChange(randomPassword());
            setVisible(true);
          }}
        >
          Tạo ngẫu nhiên
        </button>
      </span>
      <small>Tối thiểu 8 ký tự. Hãy gửi mật khẩu cho người dùng qua kênh an toàn.</small>
    </label>
  );
}

function ExpertProfileSelect({ experts, taken, value, currentId }: { experts: ExpertProfile[]; taken: Set<string>; value?: string | null; currentId?: string | null }) {
  const available = experts.filter((e) => !taken.has(e.id) || e.id === currentId);
  return (
    <label>
      Hồ sơ chuyên gia *
      <select name="expert_id" required defaultValue={value || ""}>
        <option value="" disabled>{available.length ? "Chọn hồ sơ…" : "Chưa có hồ sơ trống"}</option>
        {available.map((e) => (
          <option key={e.id} value={e.id}>
            {e.data.name}
            {e.published ? "" : " (tạm ngưng)"}
          </option>
        ))}
      </select>
    </label>
  );
}

function CreateModal({ experts, taken, close, created }: { experts: ExpertProfile[]; taken: Set<string>; close: () => void; created: (account: StaffAccount) => void }) {
  const role = "expert" as const;
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      created(
        await api<StaffAccount>("/admin/staff", {
          method: "POST",
          body: JSON.stringify({ name: f.get("name"), email: f.get("email"), password, role, expert_id: f.get("expert_id") }),
        }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Tạo tài khoản chuyên gia" close={close} wide>
      <form onSubmit={submit}>
        <div className="two-columns">
          <label>Vai trò<input value="Chuyên gia" readOnly /></label>
          <ExpertProfileSelect experts={experts} taken={taken} />
          <label>Họ tên *<input name="name" required minLength={2} maxLength={80} /></label>
          <label>Email đăng nhập *<input name="email" type="email" required maxLength={254} autoComplete="off" /></label>
        </div>
        <PasswordField value={password} onChange={setPassword} />
        <p className="au-hint">
          Mỗi hồ sơ chuyên gia chỉ gắn với một tài khoản do Admin tạo. Tài khoản Admin được chủ hệ thống cấp bằng công cụ backend.
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        <button className="button primary" disabled={busy}>{busy ? "Đang tạo…" : "Tạo tài khoản"}</button>
      </form>
    </Modal>
  );
}

function EditModal({
  account,
  self,
  experts,
  taken,
  close,
  saved,
}: {
  account: StaffAccount;
  self: boolean;
  experts: ExpertProfile[];
  taken: Set<string>;
  close: () => void;
  saved: () => void;
}) {
  const [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    const name = String(f.get("name")).trim();
    if (name !== account.name) body.name = name;
    if (!self) {
      const active = f.get("status") === "active";
      if (active !== account.is_active) body.is_active = active;
      if (password) body.password = password;
    }
    if (account.role === "expert" && f.get("expert_id") !== account.expert_id) body.expert_id = f.get("expert_id");
    if (!Object.keys(body).length) return close();
    setBusy(true);
    setError("");
    try {
      await api(`/admin/staff/${account.id}`, { method: "PATCH", body: JSON.stringify(body) });
      saved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Chỉnh sửa tài khoản nhân sự" close={close} wide>
      <form onSubmit={submit}>
        <div className="two-columns">
          <label>Họ tên *<input name="name" required minLength={2} maxLength={80} defaultValue={account.name} /></label>
          <label>Email đăng nhập<input value={account.email} disabled readOnly /></label>
          <label>
            Trạng thái
            <select name="status" defaultValue={account.is_active ? "active" : "paused"} disabled={self}>
              <option value="active">Đang hoạt động</option>
              <option value="paused">Tạm ngưng</option>
            </select>
          </label>
          {account.role === "expert" ? (
            <ExpertProfileSelect experts={experts} taken={taken} value={account.expert_id} currentId={account.expert_id} />
          ) : (
            <label>Vai trò<input value="Admin" disabled readOnly /></label>
          )}
        </div>
        <PasswordField value={password} onChange={setPassword} label="Đặt lại mật khẩu (để trống nếu không đổi)" required={false} disabled={self} />
        <p className="au-hint">
          {self
            ? "Đây là tài khoản bạn đang dùng: không tự tạm ngưng được, đổi mật khẩu của bạn tại Cài đặt."
            : "Tạm ngưng hoặc đặt lại mật khẩu sẽ đăng xuất tài khoản khỏi mọi thiết bị."}
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        <button className="button primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu thay đổi"}</button>
      </form>
    </Modal>
  );
}

function ViewModal({ account, self, close }: { account: StaffAccount; self: boolean; close: () => void }) {
  const rows: [string, ReactNode][] = [
    ["Họ tên", account.name],
    ["Email đăng nhập", account.email],
    ["Vai trò", <RolePill key="role" role={account.role} />],
    ...(account.role === "expert" ? ([["Hồ sơ chuyên gia", account.expert_name || "Chưa gắn hồ sơ"]] as [string, ReactNode][]) : []),
    ["Ngày tạo", formatDate(account.created_at)],
    ["Trạng thái", <StatusPill key="status" active={account.is_active} />],
    ["Mật khẩu", "•••••••• (Argon2, không xem lại được)"],
  ];
  return (
    <Modal title="Thông tin tài khoản nhân sự" close={close}>
      <div className="au-view-head">
        <Avatar name={account.name} />
        <div>
          <strong>{account.name}</strong>
          <span>{self ? "Tài khoản của bạn" : roleNames[account.role]}</span>
        </div>
      </div>
      <dl className="au-details">
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <p className="au-hint">Chuyên gia chỉ xem được lịch hẹn gửi cho hồ sơ của mình, không đọc được tâm sự hay kết quả test.</p>
    </Modal>
  );
}

export default function StaffAccounts({ currentUserId }: { currentUserId: string }) {
  const [rows, setRows] = useState<StaffAccount[]>([]),
    [experts, setExperts] = useState<ExpertProfile[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [role, setRole] = useState("all"),
    [status, setStatus] = useState("all"),
    [pageSize, setPageSize] = useState(10),
    [page, setPage] = useState(1),
    [viewing, setViewing] = useState<StaffAccount | null>(null),
    [editing, setEditing] = useState<StaffAccount | null>(null),
    [creating, setCreating] = useState(false),
    [deleting, setDeleting] = useState<StaffAccount | null>(null),
    [busy, setBusy] = useState(false);
  function refresh() {
    Promise.all([api<StaffAccount[]>("/admin/staff"), api<ExpertProfile[]>("/admin/content/experts")])
      .then(([staff, profiles]) => {
        setRows(staff);
        setExperts(profiles);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }
  useEffect(refresh, []);
  useEffect(() => setPage(1), [search, role, status, pageSize]);

  const taken = new Set(rows.map((a) => a.expert_id).filter(Boolean) as string[]);
  const needle = search.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (role === "all" || r.role === role) &&
      (status === "all" || (status === "active") === r.is_active) &&
      (!needle || `${r.name} ${r.email} ${r.expert_name || ""}`.toLowerCase().includes(needle)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

  const total = rows.length, admins = rows.filter((r) => r.role === "admin").length, active = rows.filter((r) => r.is_active).length;
  const monthAgo = Date.now() - 30 * 86400000;
  const added = rows.filter((r) => r.created_at && new Date(r.created_at).getTime() >= monthAgo).length;

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/staff/${deleting.id}`, { method: "DELETE" });
      setMessage(`Đã xóa tài khoản ${deleting.email}.`);
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
      <AdminBanner title="Tài khoản nhân sự" subtitle="Tài khoản đăng nhập của Admin và Chuyên gia." motto={["Phối hợp", "Quản lý", "Phát triển cùng nhau"]} />

      <section className="au-stats" aria-label="Số liệu nhân sự">
        <article>
          <span className="au-stat-icon green"><Users size={28} strokeWidth={1.7} /></span>
          <div>
            <h3>Tổng nhân sự</h3>
            <div>
              <strong>{numberFormat.format(total)}</strong>
              {added ? (
                <small className="au-change"><b className="up"><ArrowUp size={14} />{added}</b>tài khoản mới trong 30 ngày</small>
              ) : (
                <small>Chưa có tài khoản mới trong 30 ngày</small>
              )}
            </div>
          </div>
        </article>
        <article>
          <span className="au-stat-icon coral"><ShieldCheck size={28} strokeWidth={1.7} /></span>
          <div>
            <h3>Tài khoản Admin</h3>
            <div><strong>{numberFormat.format(admins)}</strong><small>toàn quyền quản trị</small></div>
          </div>
        </article>
        <article>
          <span className="au-stat-icon blue"><UserRound size={28} strokeWidth={1.7} /></span>
          <div>
            <h3>Tài khoản Chuyên gia</h3>
            <div><strong>{numberFormat.format(total - admins)}</strong><small>gắn với hồ sơ chuyên gia</small></div>
          </div>
        </article>
        <article>
          <span className="au-stat-icon peach"><Clock size={28} strokeWidth={1.7} /></span>
          <div>
            <h3>Đang hoạt động</h3>
            <div><strong>{numberFormat.format(active)}</strong><small>{numberFormat.format(total - active)} tài khoản tạm ngưng</small></div>
          </div>
        </article>
      </section>

      <section className="au-card">
        <div className="au-card-head">
          <div className="au-card-title">
            <UserCog size={26} strokeWidth={1.6} />
            <div>
              <h2>Danh sách tài khoản nhân sự</h2>
              <p>Quản lý tài khoản đăng nhập của Admin và Chuyên gia.</p>
            </div>
          </div>
          <button className="button primary au-add" onClick={() => { setCreating(true); setMessage(""); }}>
            <Plus size={17} />
            Tạo tài khoản
          </button>
        </div>
        <div className="au-tools sa-tools">
          <label className="au-search">
            <Search size={17} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, email…" aria-label="Tìm tài khoản nhân sự" />
          </label>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Lọc vai trò">
            <option value="all">Tất cả vai trò</option>
            <option value="admin">Admin</option>
            <option value="expert">Chuyên gia</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="paused">Tạm ngưng</option>
          </select>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {message && <Notice tone="success">{message}</Notice>}
        <div className="au-table-scroll">
          <table className="au-table sa-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Họ và tên</th>
                <th>Email đăng nhập</th>
                <th>Vai trò</th>
                <th>Ngày tạo</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => {
                const self = r.id === currentUserId;
                return (
                  <tr key={r.id}>
                    <td>{(current - 1) * pageSize + i + 1}</td>
                    <td>
                      <span className="au-person">
                        <Avatar name={r.name} />
                        <span>
                          <strong>{r.name}</strong>
                          {self ? <small className="sa-sub">Tài khoản của bạn</small> : r.role === "expert" && <small className="sa-sub">{r.expert_name || "Chưa gắn hồ sơ"}</small>}
                        </span>
                      </span>
                    </td>
                    <td>{r.email}</td>
                    <td><RolePill role={r.role} /></td>
                    <td>{formatDate(r.created_at)}</td>
                    <td><StatusPill active={r.is_active} /></td>
                    <td>
                      <div className="au-actions">
                        <button className="view" onClick={() => setViewing(r)} aria-label={`Xem ${r.name}`} title="Xem"><Eye size={17} /></button>
                        <button className="edit" onClick={() => { setEditing(r); setMessage(""); }} aria-label={`Sửa ${r.name}`} title="Sửa"><Pencil size={16} /></button>
                        <button className="delete" disabled={self} onClick={() => setDeleting(r)} aria-label={`Xóa ${r.name}`} title={self ? "Không thể xóa tài khoản đang dùng" : "Xóa"}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!visible.length && (
                <tr>
                  <td colSpan={7} className="au-empty">
                    {!loaded ? "Đang tải danh sách…" : rows.length ? "Không tìm thấy tài khoản phù hợp." : "Chưa có tài khoản nhân sự."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={current} pages={pages} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={filtered.length} unit="tài khoản" />
      </section>

      {viewing && <ViewModal account={viewing} self={viewing.id === currentUserId} close={() => setViewing(null)} />}
      {editing && (
        <EditModal
          account={editing}
          self={editing.id === currentUserId}
          experts={experts}
          taken={taken}
          close={() => setEditing(null)}
          saved={() => {
            setMessage(`Đã cập nhật ${editing.email}.`);
            setEditing(null);
            refresh();
          }}
        />
      )}
      {creating && (
        <CreateModal
          experts={experts}
          taken={taken}
          close={() => setCreating(false)}
          created={(account) => {
            setCreating(false);
            setMessage(`Đã tạo tài khoản ${roleNames[account.role]} ${account.email}. Hãy gửi mật khẩu bạn vừa đặt cho người dùng.`);
            refresh();
          }}
        />
      )}
      {deleting && (
        <Modal title={`Xóa tài khoản ${deleting.name}?`} close={() => setDeleting(null)}>
          <p>
            Tài khoản {deleting.email} sẽ bị xóa vĩnh viễn và không đăng nhập được nữa.
            {deleting.role === "expert" ? " Hồ sơ chuyên gia vẫn giữ nguyên và có thể gắn với tài khoản khác." : ""} Nếu chỉ muốn tạm dừng, hãy chọn Tạm ngưng.
          </p>
          <div className="button-row">
            <button className="button outline" onClick={() => setDeleting(null)} disabled={busy}>Quay lại</button>
            <button className="button primary au-danger-solid" onClick={confirmDelete} disabled={busy}>{busy ? "Đang xóa…" : "Xóa tài khoản"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
