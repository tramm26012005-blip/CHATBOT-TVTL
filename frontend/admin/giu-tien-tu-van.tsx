"use client";
import {useEffect,useState,type FormEvent} from "react";
import {api} from "@/lib/api";
import {adminMoney} from "@/lib/admin-center";
import {type Consultation,type Wallet} from "../shared/phien-tu-van";
import "../shared/phien-tu-van.css";

type Row={id:string;starts_at:string;student_name:string;expert_name:string;consultation:Consultation};
type ExpertBalance=Wallet&{expert_id:string;expert_name:string};
type Data={bookings:Row[];wallets:ExpertBalance[]};
export default function ConsultationAdmin({changed}:{changed:()=>void}){
  const[data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const[decision,setDecision]=useState<{booking:string;action:string}|null>(null),[reason,setReason]=useState("");
  const previous=new Date();previous.setDate(1);previous.setMonth(previous.getMonth()-1);
  const[month,setMonth]=useState(previous.toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).slice(0,7));
  function load(){return api<Data>("/admin/consultations").then(setData).catch(e=>setError(e.message));}
  useEffect(()=>{load();const id=setInterval(load,15000);return()=>clearInterval(id);},[]);
  async function decide(event:FormEvent){
    event.preventDefault();if(!decision)return;setBusy(true);setError("");
    try{await api(`/admin/bookings/${decision.booking}/consultation`,{method:"POST",body:JSON.stringify({action:decision.action,reason})});setDecision(null);setReason("");setMessage("Đã lưu quyết định và cập nhật số dư mô phỏng.");await load();changed();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function payout(expert_id:string){setBusy(true);setError("");try{await api("/admin/expert-payouts",{method:"POST",body:JSON.stringify({expert_id,month})});setMessage(`Đã ghi nhận chi trả mô phỏng kỳ ${month}; không chuyển tiền thật.`);await load();changed();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="consultation-panel"><h2>Giữ tiền và xét duyệt tư vấn</h2><p>Admin giữ tiền đến khi chuyên gia hoàn thành. Chia chuyên gia 80%, phí Admin 20%. Hoàn tiền được duyệt sẽ thu hồi cả hai phần.</p>
    {error&&<p role="alert" className="consultation-error">{error}</p>}{message&&<p role="status">{message}</p>}
    {data&&<><div className="consultation-balances"><p>Tiền đang giữ<strong>{adminMoney(data.bookings.reduce((s,b)=>s+(b.consultation.settlement==="held"?b.consultation.amount:0),0))}</strong></p><p>Phí Admin đã ghi nhận<strong>{adminMoney(data.bookings.reduce((s,b)=>s+(b.consultation.settlement==="allocated"?b.consultation.admin_share:0),0))}</strong></p></div>
      <h3>Yêu cầu chờ xét duyệt</h3>
      {data.bookings.filter(b=>b.consultation.refund_request?.status==="pending"||b.consultation.completion_request?.status==="pending").map(b=><article key={b.id} className="consultation-admin-item"><h3>{b.student_name} · {b.expert_name}</h3><p>{new Date(b.starts_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})} · {adminMoney(b.consultation.amount)}</p>{(["refund","completion"] as const).map(kind=>{const request=kind==="refund"?b.consultation.refund_request:b.consultation.completion_request;return request?.status==="pending"?<div key={kind}><strong>{kind==="refund"?"Sinh viên yêu cầu hoàn tiền":"Chuyên gia nhờ xác nhận đã tư vấn"}</strong><p>{request.reason}</p><p>Điểm danh chuyên gia: {b.consultation.expert_present_at||"Chưa có"} · sinh viên: {b.consultation.student_present_at||"Chưa có"}</p><p>Bắt đầu: {b.consultation.started_at||"Chưa có"} · kết thúc: {b.consultation.ended_at||"Chưa có"}</p><div className="button-row"><button className="button primary" disabled={busy} onClick={()=>{setDecision({booking:b.id,action:`approve_${kind}`});setReason("");}}>Duyệt {kind==="refund"?"hoàn đủ tiền":"ghi nhận 80%–20%"}</button><button className="button outline" disabled={busy} onClick={()=>{setDecision({booking:b.id,action:`reject_${kind}`});setReason("");}}>Từ chối yêu cầu</button></div></div>:null;})}</article>)}
      {!data.bookings.some(b=>b.consultation.refund_request?.status==="pending"||b.consultation.completion_request?.status==="pending")&&<p>Không có yêu cầu chờ xét duyệt.</p>}
      {decision&&<form className="consultation-feedback" onSubmit={decide}><h3>{decision.action.startsWith("approve")?"Xác nhận duyệt":"Xác nhận từ chối"}</h3><label>Lý do quyết định<textarea required maxLength={2000} rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label><div className="button-row"><button className="button primary" disabled={busy||!reason.trim()}>Lưu quyết định</button><button type="button" className="button outline" onClick={()=>setDecision(null)}>Quay lại</button></div></form>}
      <h3>Chi trả chuyên gia theo tháng · mô phỏng</h3><label>Tháng đối soát đã kết thúc<input type="month" required value={month} onChange={e=>setMonth(e.target.value)}/></label><p>Mỗi chuyên gia chi trả một lần mỗi kỳ. Chỉ tính khoản đã phân chia đến hết tháng chọn; khoản hoàn được trừ vào số dư, có thể âm.</p>
      {data.wallets.map(w=><article key={w.expert_id} className="consultation-admin-item"><h3>{w.expert_name}</h3><p>Số dư: <strong>{adminMoney(w.balance)}</strong> · thu nhập còn ghi nhận: {adminMoney(w.earned)} · đã chi trả: {adminMoney(w.paid)}</p><button className="button outline" disabled={busy||w.balance<=0||!month||w.payouts.some(p=>p.month===month)} onClick={()=>payout(w.expert_id)}>Ghi nhận chi trả mô phỏng kỳ {month}</button><details><summary>Lịch sử chi trả</summary>{w.payouts.length?w.payouts.map(p=><p key={p.id}>{p.month} · {adminMoney(p.amount)}</p>):<p>Chưa có chi trả.</p>}</details></article>)}
      <details><summary>Lịch sử và tiền từng buổi</summary>{data.bookings.map(b=><div className="consultation-admin-item" key={b.id}><strong>{b.student_name} · {b.expert_name}</strong><p>{new Date(b.starts_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})} · {adminMoney(b.consultation.amount)} · {b.consultation.settlement==="held"?"Đang giữ":b.consultation.settlement==="allocated"?"Đã chia tiền":"Đã hoàn đủ"}</p>{b.consultation.refund_reason&&<p>{b.consultation.refund_reason}</p>}{b.consultation.refund_request&&<p>Hoàn tiền: {b.consultation.refund_request.status} · {b.consultation.refund_request.reason} · {b.consultation.refund_request.decision_reason}</p>}{b.consultation.completion_request&&<p>Xác nhận buổi: {b.consultation.completion_request.status} · {b.consultation.completion_request.reason} · {b.consultation.completion_request.decision_reason}</p>}</div>)}</details>
    </>}
  </section>;
}
