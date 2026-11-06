"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowUp, BadgeCheck, Clock, Eye, PauseCircle, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { AdminBanner, Avatar, Modal, Notice, Pager, numberFormat } from "../shared/thanh-phan-chung";
import "./quan-ly-chuyen-gia.css";

type Expert = {
  id: string;
  published: boolean;
  created: string | null;
  account_email: string | null;
  data: {
    name: string;
    degree: string;
    fee?: number | null;
    specialty: string;
    workplace: string;
    experience?: string;
    phone: string;
    zalo?: string | null;
    image?: string | null;
    description?: string;
    verification_source: string;
    verified_at: string;
  };
};

const fields: { key: keyof Expert["data"]; label: string; required?: boolean; type?: string; wide?: boolean }[] = [
  { key: "name", label: "Họ và tên", required: true },
  { key: "degree", label: "Bằng cấp", required: true },
  { key: "fee", label: "Phí tư vấn (đ / buổi)", type: "number" },
  { key: "specialty", label: "Chuyên môn", required: true },
  { key: "workplace", label: "Nơi làm việc", required: true },
  { key: "experience", label: "Kinh nghiệm" },
  { key: "phone", label: "Số điện thoại", required: true },
  { key: "zalo", label: "Liên kết Zalo (HTTPS)", type: "url" },
  { key: "image", label: "URL ảnh (HTTPS)", type: "url" },
  { key: "verification_source", label: "Nguồn / căn cứ xác minh", required: true },
  { key: "verified_at", label: "Ngày xác minh", required: true, type: "date" },
  { key: "description", label: "Thông tin tư vấn", wide: true },
];

function formatDate(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : value;
}

function ExpertModal({ expert, close, saved }: { expert: Expert | null; close: () => void; saved: (name: string) => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data: Record<string, string | number | null> = {};
    for (const field of fields) {
      const value = String(f.get(field.key) || "").trim();
      data[field.key] = field.key === "fee" ? (value ? Number(value) : null) : value || (field.key === "zalo" || field.key === "image" ? null : "");
    }
    setBusy(true);
    setError("");
    try {
      await api(expert ? `/admin/content/${expert.id}` : "/admin/content", {
        method: expert ? "PUT" : "POST",
        body: JSON.stringify({ kind: "experts", published: f.get("published") === "on", data }),
      });
      saved(String(data.name));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={expert ? "Chỉnh sửa chuyên gia" : "Thêm chuyên gia"} close={close} wide>
      <form onSubmit={submit}>
        <div className="two-columns">
          {fields.map((field) => (
            <label key={field.key} className={field.wide ? "ae-wide" : undefined}>
              {field.label}
              {field.required ? " *" : ""}
              <input
                name={field.key}
                type={field.type || "text"}
                min={field.key === "fee" ? 0 : undefined}
                max={field.key === "fee" ? 100000000 : undefined}
                step={field.key === "fee" ? 1 : undefined}
                required={field.required}
                maxLength={field.key === "description" ? 2000 : 500}
                defaultValue={expert?.data[field.key] ?? ""}
              />
            </label>
          ))}
        </div>
        <label className="checkbox">
          <input type="checkbox" name="published" defaultChecked={expert ? expert.published : true} />
          Đang hoạt động · Hiển thị cho sinh viên. Tôi đã kiểm tra căn cứ xác minh.
        </label>
        {error && <Notice tone="error">{error}</Notice>}
        <button className="button primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu chuyên gia"}</button>
      </form>
    </Modal>
  );
}

function ViewModal({ expert, close }: { expert: Expert; close: () => void }) {
  const d = expert.data;
  const rows: [string, ReactNode][] = [
    ["Bằng cấp", d.degree],
    ["Phí tư vấn", d.fee != null ? `${d.fee.toLocaleString("vi-VN")}đ / buổi` : "Chưa cập nhật"],
    ["Chuyên môn", d.specialty],
    ["Nơi làm việc", d.workplace],
    ["Kinh nghiệm", d.experience || "—"],
    ["Số điện thoại", d.phone],
    ["Zalo", d.zalo ? <a key="zalo" href={d.zalo} target="_blank" rel="noreferrer">Mở liên kết</a> : "—"],
    ["Tài khoản đăng nhập", expert.account_email || "Chưa có tài khoản"],
    ["Nguồn xác minh", d.verification_source],
    ["Ngày xác minh", formatDate(d.verified_at)],
    ["Trạng thái", <span key="s" className={`au-pill ${expert.published ? "active" : "paused"}`}><i />{expert.published ? "Đang hoạt động" : "Tạm ngưng"}</span>],
  ];
  return (
    <Modal title="Thông tin chuyên gia" close={close}>
      <div className="au-view-head">
        <Avatar name={d.name} tint="#5f907c" />
        <div>
          <strong>{d.name}</strong>
          <span>{d.specialty}</span>
        </div>
      </div>
      <dl className="au-details">
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {d.description && <p className="au-hint">{d.description}</p>}
    </Modal>
  );
}

export default function AdminExperts() {
  const [rows, setRows] = useState<Expert[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [pageSize, setPageSize] = useState(10),
    [page, setPage] = useState(1),
    [viewing, setViewing] = useState<Expert | null>(null),
    [editing, setEditing] = useState<Expert | null | undefined>(undefined),
    [deleting, setDeleting] = useState<Expert | null>(null),
    [busyId, setBusyId] = useState<string | null>(null);
  function refresh() {
    api<Expert[]>("/admin/content/experts")
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }
  useEffect(refresh, []);
  useEffect(() => setPage(1), [search, status, pageSize]);

  const needle = search.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (status === "all" || (status === "active") === r.published) &&
      (!needle || `${r.data.name} ${r.data.specialty} ${r.account_email || ""} ${r.data.phone}`.toLowerCase().includes(needle)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

  const total = rows.length, verified = rows.filter((r) => r.data.verification_source && r.data.verified_at).length, active = rows.filter((r) => r.published).length;
  // Profiles created before the timestamp column existed count as older than a month.
  const monthAgo = Date.now() - 30 * 86400000;
  const before = rows.filter((r) => !r.created || new Date(r.created).getTime() < monthAgo).length;
  const added = total - before;

  async function setPublished(r: Expert, published: boolean) {
    setBusyId(r.id);
    setError("");
    try {
      await api(`/admin/content/${r.id}`, { method: "PUT", body: JSON.stringify({ kind: "experts", published, data: r.data }) });
      setRows(rows.map((x) => (x.id === r.id ? { ...x, published } : x)));
      setMessage(published ? `${r.data.name} đã hoạt động trở lại.` : `Đã tạm ngưng hiển thị ${r.data.name}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api(`/admin/content/${deleting.id}`, { method: "DELETE" });
      setMessage(`Đã xóa ${deleting.data.name}. Hồ sơ có lịch hẹn hoặc tài khoản liên quan được chuyển sang Tạm ngưng.`);
      setDeleting(null);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="au">
      <AdminBanner title="Quản lý chuyên gia" subtitle="Hồ sơ chuyên gia đã xác minh nguồn trước khi công khai." motto={["Kết nối chuyên gia", "vì một cộng đồng sinh viên", "khỏe mạnh hơn"]} />

      <section className="au-stats" aria-label="Số liệu chuyên gia">
        <article>
          <span className="au-stat-icon green"><Users size={28} strokeWidth={1.7} /></span>
          <div>
            <h3>Tổng số chuyên gia</h3>
            <div>
              <strong>{numberFormat.format(total)}</strong>
              {added ? (
                <small className="au-change">
                  <b className="up"><ArrowUp size={14} />{added}</b>
                  hồ sơ mới trong 30 ngày
                </small>
              ) : (
                <small>Chưa có hồ sơ mới trong 30 ngày</small>
              )}
            </div>
          </div>
        </article>
        <article>
          <span className="au-stat-icon peach"><BadgeCheck size={28} strokeWidth={1.7} /></span>
          <div>
            <h3>Đã xác minh</h3>
            <div><strong>{numberFormat.format(verified)}</strong><small>có nguồn và ngày xác minh</small></div>
          </div>
        </article>
        <article>
          <span className="au-stat-icon blue"><Clock size={28} strokeWidth={1.7} /></span>
          <div>
            <h3>Đang hoạt động</h3>
            <div><strong>{numberFormat.format(active)}</strong><small>đang hiển thị cho sinh viên</small></div>
          </div>
        </article>
        <article>
          <span className="au-stat-icon coral"><PauseCircle size={28} strokeWidth={1.7} /></span>
          <div>
            <h3>Tạm ngưng</h3>
            <div><strong>{numberFormat.format(total - active)}</strong><small>đang ẩn khỏi sinh viên</small></div>
          </div>
        </article>
      </section>

      <section className="au-card">
        <div className="au-card-head">
          <div className="au-card-title">
            <Users size={26} strokeWidth={1.6} />
            <div>
              <h2>Danh sách chuyên gia</h2>
              <p>Quản lý hồ sơ chuyên gia đã xác minh nguồn trước khi công khai.</p>
            </div>
          </div>
          <div className="au-tools">
            <label className="au-search">
              <Search size={17} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, chuyên môn, email…" aria-label="Tìm chuyên gia" />
            </label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="paused">Tạm ngưng</option>
            </select>
            <button className="button primary au-add" onClick={() => { setEditing(null); setMessage(""); }}>
              <Plus size={17} />
              Thêm mới
            </button>
          </div>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {message && <Notice tone="success">{message}</Notice>}
        <div className="au-table-scroll">
          <table className="au-table ae-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Tên chuyên gia</th>
                <th>Chuyên môn</th>
                <th>Email</th>
                <th>Số điện thoại</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.id}>
                  <td>{(current - 1) * pageSize + i + 1}</td>
                  <td><span className="au-person"><Avatar name={r.data.name} tint="#5f907c" /><strong>{r.data.name}</strong></span></td>
                  <td className="ae-clip" title={r.data.specialty}>{r.data.specialty}</td>
                  <td>{r.account_email || <span className="ae-muted">Chưa có tài khoản</span>}</td>
                  <td>{r.data.phone}</td>
                  <td>
                    <select
                      className={`ae-status ${r.published ? "active" : "paused"}`}
                      value={r.published ? "active" : "paused"}
                      disabled={busyId === r.id}
                      onChange={(e) => setPublished(r, e.target.value === "active")}
                      aria-label={`Trạng thái của ${r.data.name}`}
                    >
                      <option value="active">● Đang hoạt động</option>
                      <option value="paused">● Tạm ngưng</option>
                    </select>
                  </td>
                  <td>
                    <div className="au-actions">
                      <button className="view" onClick={() => setViewing(r)} aria-label={`Xem ${r.data.name}`} title="Xem"><Eye size={17} /></button>
                      <button className="edit" onClick={() => { setEditing(r); setMessage(""); }} aria-label={`Sửa ${r.data.name}`} title="Sửa"><Pencil size={16} /></button>
                      <button className="delete" onClick={() => setDeleting(r)} aria-label={`Xóa ${r.data.name}`} title="Xóa"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={7} className="au-empty">
                    {!loaded ? "Đang tải danh sách…" : rows.length ? "Không tìm thấy chuyên gia phù hợp." : "Chưa có hồ sơ chuyên gia. Bấm “Thêm mới” để tạo hồ sơ đầu tiên."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={current} pages={pages} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={filtered.length} unit="chuyên gia" />
      </section>

      {viewing && <ViewModal expert={viewing} close={() => setViewing(null)} />}
      {editing !== undefined && (
        <ExpertModal
          expert={editing}
          close={() => setEditing(undefined)}
          saved={(name) => {
            setEditing(undefined);
            setMessage(`Đã lưu hồ sơ ${name}.`);
            refresh();
          }}
        />
      )}
      {deleting && (
        <Modal title={`Xóa ${deleting.data.name}?`} close={() => setDeleting(null)}>
          <p>Hồ sơ không còn liên quan sẽ bị xóa. Nếu chuyên gia đã có lịch hẹn hoặc tài khoản đăng nhập, hồ sơ chỉ chuyển sang Tạm ngưng để giữ dữ liệu lịch hẹn.</p>
          <div className="button-row">
            <button className="button outline" onClick={() => setDeleting(null)}>Quay lại</button>
            <button className="button primary au-danger-solid" onClick={confirmDelete}>Xóa hồ sơ</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
