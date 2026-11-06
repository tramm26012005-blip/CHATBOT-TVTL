"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BookOpen, ExternalLink, Flower2, Headphones, Heart, LayoutGrid, Leaf, Moon, MoreHorizontal, Music, Music2, Pencil, Play, Plus, Search, ShieldCheck, Sun, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { musicCategories, musicCategoryIcons } from "@/lib/music-categories";
import { AdminBanner, Modal, Notice } from "../shared/thanh-phan-chung";
import "./nhac-thu-gian.css";

type Track = {
  id: string;
  published: boolean;
  data: {
    title: string;
    description?: string;
    category: string;
    url: string;
    image?: string | null;
    source_type: "audio" | "youtube" | "external";
    rights_note: string;
    library_id?: string;
    cover_atlas?: string;
    cover_position?: string;
    channel?: string;
    source_title?: string;
    duration_minutes?: number;
  };
};

const sourceNames = { youtube: "YouTube", audio: "Tệp âm thanh", external: "Liên kết ngoài" };

function Cover({ track, index }: { track: Track; index: number }) {
  const d = track.data;
  if (d.image) return <img src={d.image} alt="" loading="lazy" />;
  if (d.cover_atlas)
    return <div className="healing-photo healing-original-cover" style={{ backgroundImage: `url("${d.cover_atlas}")`, backgroundPosition: d.cover_position }} aria-hidden="true" />;
  return <div className={`healing-photo healing-photo-${index % 6}`} aria-hidden="true" />;
}

function TrackModal({ track, close, saved }: { track: Track | null; close: () => void; saved: (message: string) => void }) {
  const d = track?.data;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (key: string) => String(f.get(key) || "").trim();
    setBusy(true);
    setError("");
    try {
      // Merge so curated metadata (cover, channel, duration) survives edits.
      const data = {
        ...(d || {}),
        title: text("title"),
        description: text("description"),
        category: text("category"),
        source_type: text("source_type"),
        url: text("url"),
        image: text("image") || null,
        rights_note: text("rights_note"),
      };
      await api(track ? `/admin/content/${track.id}` : "/admin/content", {
        method: track ? "PUT" : "POST",
        body: JSON.stringify({ kind: "music", published: f.get("published") === "on", data }),
      });
      saved(track ? `Đã cập nhật “${data.title}”.` : `Đã thêm “${data.title}”.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={track ? "Sửa bài nhạc" : "Thêm bài nhạc"}>
      <div className="modal admin-modal">
        <button className="icon-button modal-close" onClick={close} aria-label="Đóng"><X size={20} /></button>
        <h2>{track ? "Sửa bài nhạc" : "Thêm bài nhạc mới"}</h2>
        <form onSubmit={submit}>
          <div className="two-columns">
            <label>Tên bài *<input name="title" required maxLength={200} defaultValue={d?.title} /></label>
            <label>
              Chủ đề *
              <select name="category" required defaultValue={d?.category || musicCategories[0].name}>
                {musicCategories.map((c) => <option key={c.name} value={c.name}>{c.icon} {c.name}</option>)}
                {d && !musicCategories.some((c) => c.name === d.category) && <option value={d.category}>{d.category}</option>}
              </select>
            </label>
            <label>
              Loại nguồn *
              <select name="source_type" defaultValue={d?.source_type || "youtube"}>
                <option value="youtube">YouTube</option>
                <option value="audio">Tệp âm thanh trực tiếp</option>
                <option value="external">Mở tại nguồn</option>
              </select>
            </label>
            <label>Liên kết nguồn (HTTPS) *<input name="url" type="url" required maxLength={500} defaultValue={d?.url} placeholder="https://www.youtube.com/watch?v=…" /></label>
            <label>Mô tả ngắn<input name="description" maxLength={1000} defaultValue={d?.description} /></label>
            <label>Ảnh bìa (HTTPS, không bắt buộc)<input name="image" type="url" maxLength={500} defaultValue={d?.image || ""} /></label>
          </div>
          <label className="admin-music-wide">
            Nguồn và quyền sử dụng *
            <textarea name="rights_note" required minLength={3} maxLength={500} rows={3} defaultValue={d?.rights_note} />
          </label>
          {d?.cover_atlas && !d.image && <p className="admin-music-hint">Bài trong thư viện có sẵn đang dùng ảnh bìa minh họa. Điền “Ảnh bìa” nếu muốn thay.</p>}
          <label className="checkbox">
            <input type="checkbox" name="published" defaultChecked={track ? track.published : true} />
            Hiển thị cho sinh viên · Tôi đã kiểm tra nguồn và quyền sử dụng.
          </label>
          {error && <div className="notice error" role="alert"><ShieldCheck size={17} />{error}</div>}
          <button className="button primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu bài nhạc"}</button>
        </form>
      </div>
    </div>
  );
}

// Category icons mirror the student page themes, drawn with the admin icon set.
const categoryIcons: Record<string, { icon: typeof Leaf; color: string }> = {
  "Tất cả": { icon: LayoutGrid, color: "currentColor" },
  "Thư giãn": { icon: Leaf, color: "#5f9a52" },
  "Giảm căng thẳng": { icon: Flower2, color: "#9a6fd6" },
  "Tập trung": { icon: BookOpen, color: "#3d6ab0" },
  "Dễ ngủ": { icon: Moon, color: "#d6a21e" },
  "Chữa lành": { icon: Heart, color: "#e0566a" },
  "Tích cực": { icon: Sun, color: "#ec9a2a" },
};

function CategoryIcon({ name, size = 18 }: { name: string; size?: number }) {
  const entry = categoryIcons[name];
  const Icon = entry?.icon || Music2;
  return <Icon size={size} color={entry?.color || "#b8892a"} strokeWidth={1.8} aria-hidden="true" />;
}

function formatDuration(minutes?: number) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:00` : `${String(m).padStart(2, "0")}:00`;
}

function TrackMenu({ track }: { track: Track }) {
  return (
    <details className="am-menu">
      <summary aria-label={`Tùy chọn cho ${track.data.title}`}><MoreHorizontal size={18} /></summary>
      <div>
        <a href={track.data.url} target="_blank" rel="noreferrer"><ExternalLink size={15} />Mở nguồn nhạc</a>
        <p><strong>Nguồn và quyền sử dụng</strong>{track.data.rights_note}</p>
      </div>
    </details>
  );
}

export default function AdminMusic() {
  const [tracks, setTracks] = useState<Track[]>([]),
    [loaded, setLoaded] = useState(false),
    [category, setCategory] = useState("Tất cả"),
    [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Track | null | undefined>(undefined),
    [deleting, setDeleting] = useState<Track | null>(null),
    [busyId, setBusyId] = useState<string | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  function refresh() {
    api<Track[]>("/admin/content/music")
      .then(setTracks)
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }
  useEffect(refresh, []);
  const categories = ["Tất cả", ...musicCategories.map((c) => c.name), ...new Set(tracks.map((t) => t.data.category).filter((c) => !musicCategoryIcons[c]))];
  const count = (c: string) => tracks.filter((t) => c === "Tất cả" || t.data.category === c).length;
  const needle = query.trim().toLowerCase();
  const visible = tracks.filter(
    (t) =>
      (category === "Tất cả" || t.data.category === category) &&
      (!needle || `${t.data.title} ${t.data.description || ""} ${t.data.channel || ""} ${t.data.category}`.toLowerCase().includes(needle)),
  );
  const shown = tracks.filter((t) => t.published).length;
  async function togglePublished(t: Track) {
    setBusyId(t.id);
    setError("");
    try {
      await api(`/admin/content/${t.id}`, { method: "PUT", body: JSON.stringify({ kind: "music", published: !t.published, data: t.data }) });
      setTracks(tracks.map((x) => (x.id === t.id ? { ...x, published: !t.published } : x)));
      setMessage(t.published ? `Đã ẩn “${t.data.title}” khỏi trang sinh viên.` : `Đã hiển thị lại “${t.data.title}”.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  async function remove() {
    if (!deleting) return;
    try {
      await api(`/admin/content/${deleting.id}`, { method: "DELETE" });
      setMessage(`Đã xóa “${deleting.data.title}”.`);
      setDeleting(null);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="au admin-music">
      <AdminBanner
        title="Nhạc thư giãn"
        subtitle="Cùng danh sách với trang “Góc bình yên” của sinh viên. Thay đổi và hiển thị ngay bên sinh viên."
        motto={["Âm nhạc chữa lành", "Kết nối cảm xúc", "Vì một tinh thần tích cực hơn"]}
        icon={<Music size={40} strokeWidth={1.5} aria-hidden="true" />}
      />
      <div className="am-filters" role="group" aria-label="Lọc theo chủ đề">
        {categories.map((c) => (
          <button key={c} className={category === c ? "active" : ""} aria-pressed={category === c} onClick={() => setCategory(c)}>
            <CategoryIcon name={c} />
            {c}
            <small>{count(c)}</small>
          </button>
        ))}
      </div>
      <div className="am-toolbar">
        <label className="am-search">
          <Search size={19} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tên bài, kênh, chủ đề…" aria-label="Tìm bài nhạc" />
        </label>
        <button className="button primary au-add" onClick={() => { setEditing(null); setMessage(""); }}>
          <Plus size={18} />
          Thêm bài nhạc
        </button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <p className="am-summary">
        {visible.length} bài trong mục này · Tổng {tracks.length} bài · {shown} đang hiển thị · {tracks.length - shown} đã ẩn
      </p>
      {visible.length ? (
        <div className="am-grid">
          {visible.map((t, i) => (
            <article key={t.id} className={`am-card ${t.published ? "" : "is-hidden"}`}>
              <div className="am-cover">
                <Cover track={t} index={i} />
                <span className={`am-badge ${t.published ? "on" : "off"}`}>{t.published ? "Đang hiển thị" : "Đã ẩn"}</span>
                <TrackMenu track={t} />
                <a className="am-play" href={t.data.url} target="_blank" rel="noreferrer" aria-label={`Nghe thử ${t.data.title} tại nguồn`}><Play size={18} fill="currentColor" /></a>
                {formatDuration(t.data.duration_minutes) && <span className="am-duration">{formatDuration(t.data.duration_minutes)}</span>}
              </div>
              <div className="am-info">
                <h3>{t.data.title}</h3>
                {t.data.description && <p>{t.data.description}</p>}
                <div className="am-chips">
                  <span><CategoryIcon name={t.data.category} size={14} />{t.data.category}</span>
                  <span><Headphones size={14} />{sourceNames[t.data.source_type]}{t.data.duration_minutes ? ` • ${t.data.duration_minutes} phút` : ""}</span>
                </div>
                {t.data.channel && <p className="am-channel">Kênh: {t.data.channel}</p>}
              </div>
              <div className="am-actions">
                <button
                  className={`am-switch ${t.published ? "on" : ""}`}
                  role="switch"
                  aria-checked={t.published}
                  disabled={busyId === t.id}
                  onClick={() => togglePublished(t)}
                  title={t.published ? "Ẩn khỏi trang sinh viên" : "Hiển thị cho sinh viên"}
                >
                  <i />
                  {t.published ? "Đang hiển thị" : "Đã ẩn"}
                </button>
                <button className="am-icon edit" onClick={() => { setEditing(t); setMessage(""); }} aria-label={`Sửa ${t.data.title}`} title="Sửa"><Pencil size={17} /></button>
                <button className="am-icon delete" onClick={() => setDeleting(t)} aria-label={`Xóa ${t.data.title}`} title="Xóa"><Trash2 size={17} /></button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel admin-music-empty">
          <Music2 size={28} />
          <h3>{loaded ? "Chưa có bài nhạc trong mục này" : "Đang tải danh sách nhạc…"}</h3>
          {loaded && <p>Chọn chủ đề khác hoặc thêm bài nhạc mới.</p>}
        </div>
      )}
      {editing !== undefined && (
        <TrackModal
          track={editing}
          close={() => setEditing(undefined)}
          saved={(m) => {
            setEditing(undefined);
            setMessage(m);
            refresh();
          }}
        />
      )}
      {deleting && (
        <Modal title={`Xóa “${deleting.data.title}”?`} close={() => setDeleting(null)}>
          <p>Bài sẽ biến mất khỏi trang sinh viên và không tự khôi phục. Nếu chỉ muốn tạm ngừng, hãy tắt công tắc “Đang hiển thị”.</p>
          <div className="button-row">
            <button className="button outline" onClick={() => setDeleting(null)}>Quay lại</button>
            <button className="button primary au-danger-solid" onClick={remove}>Xóa bài nhạc</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
