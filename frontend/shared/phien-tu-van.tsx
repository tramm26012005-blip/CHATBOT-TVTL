"use client";

import {useEffect, useState, type FormEvent} from "react";
import {api,ApiError} from "@/lib/api";
import "./phien-tu-van.css";

export type Consultation = {
  phase: string; settlement: string; amount: number; expert_share: number; admin_share: number;
  expert_present_at?: string; student_present_at?: string; started_at?: string; ended_at?: string;
  min_complete_at?: string; auto_end_at?: string; server_now: string; student_confirmed_at?: string;
  refund_deadline?: string; refund_reason?: string;
  completion_request?: RequestState; refund_request?: RequestState;
};
type RequestState = {status: string; reason: string; decision_reason?: string};
type SessionBooking = {id: string; expert_id?: string; starts_at: string; status: string; consultation?: Consultation};
const money = (value: number) => `${value.toLocaleString("vi-VN")}đ`;
const phaseNames: Record<string,string> = {waiting:"Chờ buổi tư vấn",in_progress:"Đang tư vấn",completed:"Đã tư vấn",timed_out:"Đã tự kết thúc · tiền chờ Admin duyệt",student_absent:"Sinh viên vắng quá 15 phút",refunded:"Đã hoàn tiền mô phỏng"};
const requestNames: Record<string,string> = {pending:"Chờ Admin duyệt",approved:"Đã duyệt",rejected:"Đã từ chối"};

export function ConsultationPanel({booking, role, changed}: {booking: SessionBooking; role:"student"|"expert"; changed:()=>void}) {
  const d=booking.consultation;
  const [tick,setTick]=useState(Date.now()),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [dialog,setDialog]=useState<"feedback"|"refund_request"|"completion_request"|null>(null);
  const [reason,setReason]=useState(""),[stars,setStars]=useState(5),[comment,setComment]=useState("");
  const [clock,setClock]=useState({server:d?.server_now,offset:d?.server_now ? Date.parse(d.server_now)-Date.now():0});
  useEffect(()=>{setClock({server:d?.server_now,offset:d?.server_now ? Date.parse(d.server_now)-Date.now():0});},[d?.server_now]);
  useEffect(()=>{const id=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(id);},[]);
  if(!d) return null;
  const current=tick+clock.offset, start=Date.parse(booking.starts_at), deadline=Date.parse(d.refund_deadline||"");
  const ended=["completed","timed_out"].includes(d.phase), held=d.settlement==="held";
  const canPresent=booking.status==="confirmed" && d.phase==="waiting" && current>=start-15*60000 && current<=start+(role==="expert"?5:15)*60000;
  const present=role==="expert"?d.expert_present_at:d.student_present_at;
  async function action(action:string) {
    setBusy(true);setError("");setMessage("");
    try { await api(`${role==="expert"?"/expert":""}/bookings/${booking.id}/consultation`,{method:"POST",body:JSON.stringify({action,reason})});setDialog(null);setReason("");setMessage("Đã cập nhật.");changed(); }
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function feedback(event:FormEvent) {
    event.preventDefault();setBusy(true);setError("");
    try {await api(`/experts/${booking.expert_id}/reviews`,{method:"PUT",body:JSON.stringify({stars,comment})});setDialog(null);setMessage("Đã lưu đánh giá vào hồ sơ chuyên gia.");changed();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const seconds=d.started_at?Math.max(0,Math.min(1800,Math.floor(((d.ended_at?Date.parse(d.ended_at):current)-Date.parse(d.started_at))/1000))):0;
  return <section className="consultation-panel" aria-label="Theo dõi buổi tư vấn">
    <strong>{phaseNames[d.phase]||d.phase}</strong>
    <p>{d.settlement==="refunded"?`Đã hoàn ${money(d.amount)} · ${d.refund_reason||""}`:held?`Admin đang giữ ${money(d.amount)} · mô phỏng`:`Đã ghi nhận chuyên gia ${money(d.expert_share)} · phí Admin ${money(d.admin_share)}`}</p>
    {!ended && d.phase!=="student_absent" && d.settlement!=="refunded" && <p>Chuyên gia: {d.expert_present_at?"Đã có mặt":"Chưa điểm danh"} · Sinh viên: {d.student_present_at?"Đã có mặt":"Chưa điểm danh"}</p>}
    {d.started_at && <p role="timer">Thời gian tư vấn: {Math.floor(seconds/60).toString().padStart(2,"0")}:{(seconds%60).toString().padStart(2,"0")} / 30:00</p>}
    {d.phase==="waiting" && held && <small>Điểm danh từ 15 phút trước giờ hẹn. Chuyên gia được trễ 5 phút, sinh viên 15 phút. Chỉ bắt đầu khi cả hai đã có mặt.</small>}
    <div className="button-row">
      {canPresent && !present && <button className="button primary" disabled={busy} onClick={()=>action("present")}>Tôi đã có mặt</button>}
      {role==="expert" && held && d.phase==="waiting" && d.expert_present_at && d.student_present_at && current>=start && <button className="button primary" disabled={busy} onClick={()=>action("start")}>Bắt đầu tư vấn</button>}
      {role==="expert" && d.phase==="in_progress" && <button className="button primary" disabled={busy || current<Date.parse(d.min_complete_at||"") || current>=Date.parse(d.auto_end_at||"")} onClick={()=>action("complete")}>Xác nhận đã tư vấn {current<Date.parse(d.min_complete_at||"")?"(sau ít nhất 5 phút)":""}</button>}
      {role==="expert" && d.phase==="timed_out" && held && d.completion_request?.status!=="pending" && <button className="button outline" disabled={busy} onClick={()=>{setDialog("completion_request");setReason("");}}>Nhờ Admin xác nhận đã tư vấn</button>}
      {role==="student" && ended && d.settlement!=="refunded" && <>
        <button className="button primary" disabled={busy||!!d.student_confirmed_at} onClick={()=>action("student_confirm")}>{d.student_confirmed_at?"Bạn đã xác nhận":"Xác nhận đã tư vấn"}</button>
        <button className="button outline" disabled={busy} onClick={()=>setDialog("feedback")}>Phản hồi và đánh giá</button>
      </>}
      {role==="student" && current>=start && d.settlement!=="refunded" && d.phase!=="student_absent" && (!deadline||current<=deadline) && d.refund_request?.status!=="pending" && <button className="button outline consultation-report" disabled={busy} onClick={()=>{setDialog("refund_request");setReason("");}}>Báo cáo / yêu cầu hoàn tiền</button>}
    </div>
    {d.completion_request && <p>Yêu cầu xác nhận buổi: {requestNames[d.completion_request.status]}{d.completion_request.decision_reason?` · ${d.completion_request.decision_reason}`:""}</p>}
    {d.refund_request && <p>Yêu cầu hoàn tiền: {requestNames[d.refund_request.status]}{d.refund_request.decision_reason?` · ${d.refund_request.decision_reason}`:""}</p>}
    {role==="student" && d.refund_deadline && <small>Hạn yêu cầu hoàn tiền: {new Date(d.refund_deadline).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}.</small>}
    {dialog && <div className="consultation-feedback">
      <h3>{dialog==="feedback"?"Phản hồi về chuyên gia":dialog==="refund_request"?"Yêu cầu Admin xét hoàn tiền":"Yêu cầu xác nhận đã tư vấn"}</h3>
      {dialog==="feedback"?<form onSubmit={feedback}>
        <label>Đánh giá sao<select value={stars} onChange={e=>setStars(Number(e.target.value))}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{"★".repeat(n)} · {n} sao</option>)}</select></label>
        <label>Bình luận<textarea value={comment} onChange={e=>setComment(e.target.value)} maxLength={1000} rows={3}/></label>
        <div className="button-row"><button className="button primary" disabled={busy}>Lưu phản hồi</button>{d.settlement!=="refunded" && (!deadline||current<=deadline) && <button type="button" className="button outline consultation-report" onClick={()=>{setDialog("refund_request");setReason("");}}>Khẩn cấp · báo cáo hoàn tiền</button>}</div>
      </form>:<form onSubmit={e=>{e.preventDefault();action(dialog);}}>
        <label>Lý do (bắt buộc)<textarea required value={reason} onChange={e=>setReason(e.target.value)} maxLength={2000} rows={4}/></label>
        <p>{dialog==="refund_request"?"Nêu rõ sự việc, ví dụ chuyên gia chưa tư vấn nhưng đã đánh dấu hoàn thành. Admin sẽ xem xét trước khi hoàn tiền.":"Nêu thông tin buổi đã thực hiện để Admin kiểm tra. Tiền tiếp tục được giữ cho đến khi được duyệt."}</p>
        <button className="button primary" disabled={busy||!reason.trim()}>Gửi yêu cầu</button>
      </form>}
      <button className="button outline" disabled={busy} onClick={()=>setDialog(null)}>Đóng</button>
    </div>}
    {error && <p role="alert" className="consultation-error">{error}</p>}{message && <p role="status">{message}</p>}
  </section>;
}

export type Wallet = {earned:number; paid:number; balance:number; held:number; payouts:{id:string; month:string; amount:number; created:string}[]};
export function ExpertWallet() {
  const [data,setData]=useState<Wallet|null>(null),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let alive=true;const load=()=>api<Wallet>("/expert/wallet").then(d=>{if(alive){setData(d);setError("");}}).catch(e=>{if(alive)setError(e instanceof ApiError&&e.status===404&&e.message==="Not Found"?"Backend đang chạy chưa cập nhật chức năng số dư. Khởi động lại backend rồi bấm Thử lại.":e.message);});load();const id=setInterval(load,15000);return()=>{alive=false;clearInterval(id);};},[attempt]);
  return <section className="consultation-panel"><h2>Số dư chuyên gia · mô phỏng</h2>{error&&<div role="alert"><p>{error}</p><button className="button outline" onClick={()=>{setError("");setAttempt(n=>n+1);}}>Thử lại</button></div>}{!data&&!error&&<p role="status">Đang tải số dư…</p>}{data&&<><div className="consultation-balances"><p>Số dư hiện tại<strong>{money(data.balance)}</strong></p><p>Thu nhập sau phí 20%<strong>{money(data.earned)}</strong></p><p>Đã chi trả theo tháng<strong>{money(data.paid)}</strong></p><p>Tiền buổi còn được giữ<strong>{money(data.held)}</strong></p></div><p>Được cộng 80% khi xác nhận đã tư vấn sau ít nhất 5 phút, hoặc khi sinh viên vắng quá 15 phút và bạn đã điểm danh đúng hạn. Khoản hoàn tiền có thể làm số dư âm và được trừ vào kỳ tiếp theo.</p><h3>Lịch sử chi trả mô phỏng</h3>{data.payouts.map(p=><p key={p.id}>{p.month} · {money(p.amount)}</p>)}{!data.payouts.length&&<p>Chưa có kỳ chi trả.</p>}</>}</section>;
}
