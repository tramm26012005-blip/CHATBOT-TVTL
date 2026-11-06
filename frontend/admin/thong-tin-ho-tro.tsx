"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Building2, Eye, Globe, GraduationCap, Headset, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { AdminBanner, Modal, Notice, Pager } from "../shared/thanh-phan-chung";
import "./thong-tin-ho-tro.css";

type SupportType = "hotline" | "organization" | "internal" | "resource";
type Support = {
  id: string;
  published: boolean;
  data: {
    title: string;
    description: string;
    support_type?: SupportType;
    phone?: string | null;
    website?: string | null;
    region: string;
    hours: string;
    verification_source: string;
    verified_at: string;
  };
};

const types: Record<SupportType, { label: string; icon: typeof Phone }> = {
  hotline: { label: "Đường dây nóng", icon: Phone },
  organization: { label: "Tổ chức", icon: Building2 },
  internal: { label: "Hỗ trợ nội bộ", icon: GraduationCap },
  resource: { label: "Tài nguyên", icon: Globe },
};
const typeOf = (s: Support) => s.data.support_type || "organization";

function formatDate(value: string) {
  const [y, m, d] = value.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : value;
}

function TypeIcon({ type }: { type: SupportType }) {
  const Icon = types[type].icon;
  return <span className={`as-icon ${type}`}><Icon size={18} strokeWidth={1.8} /></span>;
}

function SupportModal({ item, close, saved }: { item: Support | null; close: () => void; saved: (title: string) => void }) {
  const d = item?.data;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (key: string) => String(f.get(key) || "").trim();
    setBusy(true);
    setError("");
    try {
      const data = {
        title: text("title"),
        support_type: text("support_type"),
        phone: text("phone") || null,
        website: text("website") || null,
        hours: text("hours"),
        region: text("region"),
        description: text("description"),
        verification_source: text("verification_source"),
        verified_at: text("verified_at"),
      };
      await api(item ? `/admin/content/${item.id}` : "/admin/content", {
        method: item ? "PUT" : "POST",
        body: JSON.stringify({ kind: "support", published: f.get("published") === "on", data }),
      });
      saved(data.title);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={item ? "Chỉnh sửa thông tin hỗ trợ" : "Thêm thông tin hỗ trợ"} close={close} wide>
      <form onSubmit={submit}>
        <div className="two-columns">
          <label>Tên đơn vị *<input name="title" required minLength={2} maxLength={200} defaultValue={d?.title} /></label>
          <label>
            Loại hỗ trợ *
            <select name="support_type" defaultValue={d?.support_type || "hotline"}>
              {Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label>Số điện thoại đã xác minh<input name="phone" maxLength={20} pattern="^\+?[0-9 \(\)\-]{8,20}$" defaultValue={d?.phone || ""} placeholder="Ví dụ: 1900 6190" /></label>
          <label>Website (HTTPS)<input name="website" type="url" maxLength={500} defaultValue={d?.website || ""} placeholder="https://…" /></label>
          <label>Thời gian hoạt động *<input name="hours" required minLength={2} maxLength={200} defaultValue={d?.hours} placeholder="Ví dụ: Thứ 2 - Thứ 6 (8:00 - 17:00)" /></label>
          <label>Khu vực *<input name="region" required minLength={2} maxLength={100} defaultValue={d?.region} /></label>
          <label className="as-wide">Phạm vi hỗ trợ *<input name="description" required minLength={2} maxLength={1000} defaultValue={d?.description} /></label>
          <label>URL nguồn xác minh (HTTPS) *<input name="verification_source" type="url" required maxLength={500} defaultValue={d?.verification_source} /></label>
          <label>Ngày xác minh *<input name="verified_at" type="date" required defaultValue={d?.verified_at?.slice(0, 10)} /></label>
        </div>
        <p className="au-hint">Cần ít nhất số điện thoại hoặc website. Đơn vị có số điện thoại sẽ hiện trong hộp thoại “Bạn cần hỗ trợ?” của sinh viên.</p>
        <label className="checkbox">
          <input type="checkbox" name="published" defaultChecked={item ? item.published : true} />
          Hiển thị cho sinh viên · Tôi đã kiểm tra nguồn xác minh.
        </label>
        {error && <Notice tone="error">{error}</Notice>}
        <button className="button primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu thông tin"}</button>
      </form>
    </Modal>
  );
}

function ViewModal({ item, close }: { item: Support; close: () => void }) {
  const d = item.data;
  const rows: [string, ReactNode][] = [
    ["Loại hỗ trợ", <span key="t" className={`au-pill as-type ${typeOf(item)}`}>{types[typeOf(item)].label}</span>],
    ["Số điện thoại", d.phone || "—"],
    ["Website", d.website ? <a key="w" href={d.website} target="_blank" rel="noreferrer">{d.website}</a> : "—"],
    ["Thời gian hoạt động", d.hours],
    ["Khu vực", d.region],
    ["Phạm vi hỗ trợ", d.description],
    ["Nguồn xác minh", <a key="v" href={d.verification_source} target="_blank" rel="noreferrer">Mở nguồn</a>],
    ["Ngày xác minh", formatDate(d.verified_at)],
    ["Trạng thái", item.published ? "Hiển thị" : "Ẩn"],
  ];
  return (
    <Modal title="Thông tin đơn vị hỗ trợ" close={close}>
      <div className="au-view-head">
        <TypeIcon type={typeOf(item)} />
        <div>
          <strong>{d.title}</strong>
          <span>{types[typeOf(item)].label}</span>
        </div>
      </div>
      <dl className="au-details">
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </Modal>
  );
}

export default function AdminSupport() {
  const [rows, setRows] = useState<Support[]>([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [search, setSearch] = useState(""),
    [type, setType] = useState("all"),
    [status, setStatus] = useState("all"),
    [pageSize, setPageSize] = useState(10),
    [page, setPage] = useState(1),
    [viewing, setViewing] = useState<Support | null>(null),
    [editing, setEditing] = useState<Support | null | undefined>(undefined),
    [deleting, setDeleting] = useState<Support | null>(null),
    [busy, setBusy] = useState(false);
  function refresh() {
    api<Support[]>("/admin/content/support")
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }
  useEffect(refresh, []);
  useEffect(() => setPage(1), [search, type, status, pageSize]);

  const needle = search.trim().toLowerCase();
  const filtered = rows.filter(
    (r) =>
      (type === "all" || typeOf(r) === type) &&
      (status === "all" || (status === "shown") === r.published) &&
      (!needle || `${r.data.title} ${r.data.phone || ""} ${r.data.website || ""} ${r.data.region}`.toLowerCase().includes(needle)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/content/${deleting.id}`, { method: "DELETE" });
      setMessage(`Đã xóa ${deleting.data.title}.`);
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
      <AdminBanner title="Thông tin hỗ trợ" subtitle="Đường dây nóng, tổ chức tư vấn và đơn vị hỗ trợ tâm lý sinh viên đã xác minh." motto={["Luôn có người", "lắng nghe", "Bạn không đơn độc"]} icon={<Headset size={40} strokeWidth={1.5} aria-hidden="true" />} />

      <section className="au-card">
        <div className="au-tools as-tools">
          <label className="au-search">
            <Search size={17} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên, số điện thoại, tổ chức…" aria-label="Tìm thông tin hỗ trợ" />
          </label>
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Lọc loại hỗ trợ">
            <option value="all">Tất cả loại</option>
            {Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
            <option value="all">Tất cả trạng thái</option>
            <option value="shown">Hiển thị</option>
            <option value="hidden">Ẩn</option>
          </select>
          <button className="button primary au-add" onClick={() => { setEditing(null); setMessage(""); }}>
            <Plus size={17} />
            Thêm mới
          </button>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {message && <Notice tone="success">{message}</Notice>}
        <div className="au-table-scroll">
          <table className="au-table as-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Tên đơn vị</th>
                <th>Loại hỗ trợ</th>
                <th>Liên hệ</th>
                <th>Thời gian hoạt động</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r, i) => (
                <tr key={r.id}>
                  <td>{(current - 1) * pageSize + i + 1}</td>
                  <td><span className="au-person"><TypeIcon type={typeOf(r)} /><span className="as-name">{r.data.title}</span></span></td>
                  <td><span className={`au-pill as-type ${typeOf(r)}`}>{types[typeOf(r)].label}</span></td>
                  <td>
                    {r.data.phone || (r.data.website && <a className="as-link" href={r.data.website} target="_blank" rel="noreferrer">{r.data.website}</a>)}
                  </td>
                  <td className="as-hours">{r.data.hours}</td>
                  <td><span className={`au-pill ${r.published ? "active" : "locked"}`}><i />{r.published ? "Hiển thị" : "Ẩn"}</span></td>
                  <td>
                    <div className="au-actions">
                      <button className="view" onClick={() => setViewing(r)} aria-label={`Xem ${r.data.title}`} title="Xem"><Eye size={17} /></button>
                      <button className="edit" onClick={() => { setEditing(r); setMessage(""); }} aria-label={`Sửa ${r.data.title}`} title="Sửa"><Pencil size={16} /></button>
                      <button className="delete" onClick={() => setDeleting(r)} aria-label={`Xóa ${r.data.title}`} title="Xóa"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={7} className="au-empty">
                    {!loaded ? "Đang tải danh sách…" : rows.length ? "Không tìm thấy đơn vị phù hợp." : "Chưa có thông tin hỗ trợ. Bấm “Thêm mới” để thêm đơn vị đầu tiên."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={current} pages={pages} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={filtered.length} unit="đơn vị" />
      </section>

      {viewing && <ViewModal item={viewing} close={() => setViewing(null)} />}
      {editing !== undefined && (
        <SupportModal
          item={editing}
          close={() => setEditing(undefined)}
          saved={(title) => {
            setEditing(undefined);
            setMessage(`Đã lưu ${title}.`);
            refresh();
          }}
        />
      )}
      {deleting && (
        <Modal title={`Xóa ${deleting.data.title}?`} close={() => setDeleting(null)}>
          <p>Đơn vị sẽ biến mất khỏi trang sinh viên. Nếu chỉ muốn tạm dừng, hãy sửa và bỏ chọn “Hiển thị cho sinh viên”.</p>
          <div className="button-row">
            <button className="button outline" onClick={() => setDeleting(null)} disabled={busy}>Quay lại</button>
            <button className="button primary au-danger-solid" onClick={confirmDelete} disabled={busy}>{busy ? "Đang xóa…" : "Xóa đơn vị"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
