"use client";

import { useEffect, useRef, useState } from "react";
import { Award, CalendarDays, FileText, MessageCircle, Send, Star, UserRound, Users, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import AvailableSlots from "./khung-gio-ranh";

type Review = { id: string; stars: number; comment: string; created: string; mine: boolean; author: string };
type Summary = { average: number; count: number; reviews: Review[]; can_review: boolean };
export function expertDisplayName(name: string, degree?: string) {
  if (/^(TS|ThS|CN|GS|PGS|BS)\s*\./i.test(name.trim())) return name;
  const qualification = (degree || "").trim().toLocaleLowerCase("vi-VN");
  const prefix = /tiến\s*sĩ|^ts\.?$/.test(qualification) ? "TS." : /thạc\s*sĩ|^ths\.?$/.test(qualification) ? "ThS." : /cử\s*nhân|^cn\.?$/.test(qualification) ? "CN." : "";
  return prefix ? `${prefix} ${name}` : name;
}
export function ExpertStars({ average, count, compact = false }: { average: number; count: number; compact?: boolean }) {
  if (compact) return <div className="expert-rating-badge" title={count ? `${count} đánh giá` : "Chưa có đánh giá"} aria-label={count ? `${average} trên 5 sao, ${count} đánh giá` : "Chưa có đánh giá"}><Star size={16} fill={count ? "currentColor" : "none"} aria-hidden="true" /><strong>{count ? average.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : "—"}/5</strong></div>;
  return <div className="expert-rating-summary" aria-label={count ? `${average} trên 5 sao, ${count} đánh giá` : "Chưa có đánh giá"}>
    <span aria-hidden="true">{[1,2,3,4,5].map(value => <Star key={value} size={16} fill={value <= Math.round(average) && count ? "currentColor" : "none"} />)}</span>
    <span>{count ? <><strong>{average.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}/5</strong> · {count} đánh giá</> : "Chưa có đánh giá"}</span>
  </div>;
}

export default function ExpertDetails({ expert, close, book, onRated, initialDate, initialTime="" }: {
  expert: { id: string; name: string; degree?: string; specialty?: string; workplace?: string; experience?: string; description?: string; image?: string | null; fee?: number | null; rating_average?: number; rating_count?: number };
  close: () => void; book: (date?:string,time?:string) => void; onRated: (average: number, count: number) => void; initialDate?:string;initialTime?:string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [summary, setSummary] = useState<Summary | null>(null), [stars, setStars] = useState(0), [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const alive = useRef(true);
  const [reload, setReload] = useState(0);
  const [tab, setTab] = useState("reviews");
  const [scheduleDate,setScheduleDate]=useState(initialDate||new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}));
  const [scheduleTime,setScheduleTime]=useState(initialTime),[scheduleReady,setScheduleReady]=useState(false);
  function friendlyError(err: Error) {
    return err instanceof ApiError && err.status === 404 && err.message === "Not Found"
      ? "Máy chủ chưa cập nhật chức năng đánh giá. Hãy khởi động lại backend rồi bấm Thử lại nhé."
      : err.message;
  }
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  useEffect(() => {
    alive.current = true;
    setLoading(true); setError("");
    const abort = new AbortController();
    api<Summary>(`/experts/${expert.id}/reviews`, {signal: abort.signal}).then(result => {
      setSummary(result); const own = result.reviews.find(row => row.mine);
      if (own) { setStars(own.stars); setComment(own.comment); }
    }).catch(err => { if (!abort.signal.aborted) setError(friendlyError(err)); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { alive.current = false; abort.abort(); };
  }, [expert.id, reload]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!stars || busy || !summary?.can_review) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const result = await api<Summary>(`/experts/${expert.id}/reviews`, {method:"PUT", body:JSON.stringify({stars, comment})});
      if (!alive.current) return;
      setSummary(result); onRated(result.average, result.count); setSuccess("Cảm ơn bạn đã chia sẻ đánh giá.");
    } catch (err) { if (alive.current) setError(friendlyError(err as Error)); }
    finally { if (alive.current) setBusy(false); }
  }
  const average = summary?.average ?? expert.rating_average ?? 0;
  const count = summary?.count ?? expert.rating_count ?? 0;
  const tabs = [{id:"reviews", label:"Đánh giá", Icon:MessageCircle}, {id:"schedule", label:"Lịch trống", Icon:CalendarDays}, {id:"more", label:"Thông tin khác", Icon:FileText}];
  return <dialog ref={dialog} className="expert-review-dialog expert-detail-design" onCancel={close} aria-labelledby="expert-detail-title">
    <button className="modal-close icon-button" aria-label="Đóng chi tiết" onClick={close}><X size={24} /></button>
    <div className="expert-detail-label"><Users size={21} />Chi tiết chuyên gia</div>
    <div className="expert-detail-overview">
      <aside className="expert-detail-aside">
        <div className="expert-detail-photo">{expert.image ? <img src={expert.image} alt={expert.name} /> : <UserRound size={90} strokeWidth={1.3} aria-label="Chưa có ảnh chuyên gia" />}</div>
        <div className="expert-detail-score"><h3>Đánh giá từ sinh viên</h3><div><strong>{count ? average.toFixed(1) : "—"}</strong><span>/5</span></div><ExpertStars average={average} count={count} /></div>
        <button className="button primary green-shimmer" onClick={()=>book()}><CalendarDays size={19} />Đặt lịch ngay</button>
      </aside>
      <div className="expert-detail-bio">
        <div className="expert-detail-name-row"><h2 id="expert-detail-title">{expertDisplayName(expert.name, expert.degree)}</h2>{typeof expert.fee === "number" && <span className="expert-detail-fee">{expert.fee.toLocaleString("vi-VN")}đ / buổi</span>}</div>
        {expert.degree && <span className="expert-detail-degree"><Award size={21} />{expert.degree}</span>}
        <dl className="expert-detail-facts"><div><dt>Chuyên ngành:</dt><dd>{expert.specialty || "Đang cập nhật"}</dd></div><div><dt>Nơi làm việc:</dt><dd>{expert.workplace || "Đang cập nhật"}</dd></div><div><dt>Kinh nghiệm:</dt><dd>{expert.experience || "Đang cập nhật"}</dd></div></dl>
        <section className="expert-detail-intro"><h3>Giới thiệu</h3><p>{expert.description || "Thông tin giới thiệu đang được cập nhật."}</p></section>
      </div>
    </div>
    <div className="expert-detail-tabs" role="tablist" aria-label="Thông tin chuyên gia" onKeyDown={event => {
      const index = tabs.findIndex(item => item.id === tab);
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); setTab(tabs[next].id); document.getElementById(`expert-tab-${tabs[next].id}`)?.focus(); }
    }}>{tabs.map(({id, label, Icon}) => <button key={id} id={`expert-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`expert-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}><Icon size={20} />{label}</button>)}</div>
    <section id="expert-panel-reviews" role="tabpanel" aria-labelledby="expert-tab-reviews" hidden={tab !== "reviews"} className="expert-review-section">
      {loading ? <p role="status">Đang tải đánh giá…</p> : summary && <>
        {summary.can_review ? <form onSubmit={save}>
          <fieldset className="expert-star-picker" disabled={busy}><legend>Đánh giá của bạn</legend>{[1,2,3,4,5].map(value => <label key={value} title={`${value} sao`}><input type="radio" name="expert-stars" value={value} checked={stars === value} onChange={() => setStars(value)} aria-label={`${value} sao`} /><Star size={27} fill={value <= stars ? "currentColor" : "none"} aria-hidden="true" /></label>)}</fieldset>
          <label>Bình luận<textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={1000} rows={3} placeholder="Chia sẻ cảm nhận của bạn về chuyên gia…" disabled={busy} /></label>
          <small>Bình luận sẽ hiển thị với tên “Sinh viên”. Bạn tránh chia sẻ thông tin cá nhân hoặc nội dung tâm sự riêng nhé.</small>
          <button className="button primary green-shimmer" type="submit" disabled={!stars || busy}><Send size={18} />{busy ? "Đang lưu…" : summary.reviews.some(row => row.mine) ? "Cập nhật đánh giá" : "Gửi đánh giá"}</button>
        </form> : <div className="expert-review-eligibility"><p>Bạn có thể đánh giá và bình luận sau khi hoàn thành buổi tư vấn với chuyên gia này. Lịch hủy, hoàn tiền hoặc vắng mặt không đủ điều kiện.</p><button className="button outline" onClick={()=>book()}>Đặt lịch với chuyên gia</button></div>}
        <div className="expert-review-list">{summary.reviews.length ? summary.reviews.map(row => <article key={row.id}><span className="expert-comment-avatar" aria-hidden="true"><UserRound size={26} /></span><div className="expert-comment-content"><header><strong>{row.author}</strong><span className="expert-review-score">{row.stars} ★</span><time dateTime={row.created}>{new Date(row.created).toLocaleDateString("vi-VN")}</time></header>{row.comment && <p>{row.comment}</p>}</div></article>) : <p>Chưa có đánh giá. Bạn có thể là người đầu tiên chia sẻ trải nghiệm.</p>}</div>
      </>}
      {error && <div role="alert"><p>{error}</p>{!summary && <button className="button outline" onClick={() => setReload(value => value + 1)}>Thử lại</button>}</div>}{success && <p role="status">{success}</p>}
    </section>
    <section id="expert-panel-schedule" role="tabpanel" aria-labelledby="expert-tab-schedule" hidden={tab !== "schedule"} className="expert-detail-tab-content"><h3>Lịch rảnh của chuyên gia</h3><label>Ngày tư vấn<input type="date" required value={scheduleDate} min={new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"})} onChange={e=>{setScheduleReady(false);setScheduleDate(e.target.value);}} /></label>{tab==="schedule"&&<AvailableSlots expertId={expert.id} date={scheduleDate} value={scheduleTime} onChange={setScheduleTime} onReady={setScheduleReady} />}<button className="button primary green-shimmer" disabled={!scheduleReady||!scheduleTime} onClick={()=>book(scheduleDate,scheduleTime)}>Đặt giờ đã chọn</button></section>
    <section id="expert-panel-more" role="tabpanel" aria-labelledby="expert-tab-more" hidden={tab !== "more"} className="expert-detail-tab-content"><h3>Thông tin tư vấn</h3><p>Hồ sơ chuyên gia đã được đơn vị vận hành xác minh. Yêu cầu đặt lịch chỉ trở thành lịch hẹn sau khi chuyên gia xác nhận.</p>{typeof expert.fee === "number" && <p>Phí tư vấn: <strong>{expert.fee.toLocaleString("vi-VN")}đ / buổi</strong>. Phí tư vấn không nằm trong gói VIP.</p>}<p>Nội dung trò chuyện với Lạc Lạc không được tự động gửi kèm khi đặt lịch.</p></section>
  </dialog>;
}
