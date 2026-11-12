"use client";
import {useEffect,useState,type FormEvent} from "react";
import {api,ApiError} from "@/lib/api";
import {adminMoney,paymentStatus,exportAdminCsv,type AdminMetrics,type AdminTarget,type PaymentRow} from "@/lib/admin-center";
import RevenueReports from "./doanh-thu-bao-cao";
import ConsultationAdmin from "./giu-tien-tu-van";
import ConversationsView, {type ConversationRecord} from "./quan-ly-tro-chuyen";
import AssessmentView, {type AssessmentInfo} from "./quan-ly-bai-test";
import "./quan-ly-thanh-toan.css";
import ServicePlans, {type ServicePlan} from "./quan-ly-goi-dich-vu";
import SystemSettings, {type SystemInfo} from "./cai-dat-he-thong";
import {Modal} from "../shared/thanh-phan-chung";

function useAdminData<T>(path:string){const[data,setData]=useState<T|null>(null),[error,setError]=useState(""),[version,setVersion]=useState(0);useEffect(()=>{const abort=new AbortController();setError("");setData(null);api<T>(path,{signal:abort.signal}).then(setData).catch(err=>{if(!abort.signal.aborted)setError(err instanceof ApiError && err.status===404 && err.message==="Not Found"?"Backend chưa cập nhật mục này. Bạn khởi động lại backend rồi bấm Thử lại nhé.":err.message);});return()=>abort.abort();},[path,version]);return{data,error,reload:()=>setVersion(v=>v+1)};}
function State({error,reload}:{error:string;reload:()=>void}){return error?<div role="alert" className="notice error"><p>{error}</p><button onClick={reload} className="text-link">Thử lại</button></div>:<p role="status">Đang tải…</p>;}
const date=(value:string)=>new Date(value).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"});

export function ConversationManagement(){
  const{data,error,reload}=useAdminData<ConversationRecord[]>("/admin/conversations");
  return <ConversationsView data={data} error={error} reload={reload} />;
}

export function AssessmentManagement(){
  const{data,error,reload}=useAdminData<AssessmentInfo>("/admin/assessments");
  return <AssessmentView data={data} error={error} reload={reload} />;
}

function RefundDialog({payment,close,saved}:{payment:PaymentRow;close:()=>void;saved:()=>void}){
  const[busy,setBusy]=useState(false),[error,setError]=useState("");async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=new FormData(event.currentTarget);setBusy(true);try{await api(`/admin/payments/${encodeURIComponent(payment.id)}`,{method:"PATCH",body:JSON.stringify({status:payment.status==="success"?"refund_requested":"refunded",note:form.get("note")})});saved();}catch(err){setError((err as Error).message);setBusy(false);}}
  return <Modal title={payment.demo?"Xử lý hoàn tiền mô phỏng":"Xác nhận hoàn tiền VIP"} close={close}><p>{payment.user} · {payment.service} · {adminMoney(payment.amount)}</p><p>{payment.demo?"Chỉ cập nhật trạng thái dữ liệu thử, không chuyển tiền thật và không tự thay đổi quyền VIP.":"Sinh viên đã hủy gói khi chưa sử dụng và quyền VIP đã kết thúc. Hãy chuyển trả tiền qua ngân hàng hoặc MoMo trước, sau đó xác nhận tại đây. Hệ thống không tự chuyển tiền."}</p><form onSubmit={submit}><label>Ghi chú<textarea name="note" maxLength={500} rows={3} /></label>{error&&<p role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy?"Đang xử lý…":payment.status==="success"?"Tạo yêu cầu hoàn mô phỏng":payment.demo?"Xác nhận đã hoàn mô phỏng":"Xác nhận đã chuyển trả tiền"}</button></form></Modal>;
}
export function PaymentManagement(){
  const{data,error,reload}=useAdminData<PaymentRow[]>("/admin/payments"),[q,setQ]=useState(""),[status,setStatus]=useState(""),[selected,setSelected]=useState<PaymentRow|null>(null);
  const rows=(data||[]).filter(row=>(!status||row.status===status)&&`${row.id} ${row.user} ${row.service}`.toLocaleLowerCase("vi").includes(q.toLocaleLowerCase("vi")));
  return <div className="ref-management payment-management"><h1 className="payment-page-title">Quản lý thanh toán</h1><header className="payment-banner"><h2>Giữ tiền và xét duyệt tư vấn</h2><p>Admin giữ tiền đến khi chuyên gia hoàn thành. Chia chuyên gia 80%, phí Admin 20%. Hoàn tiền được duyệt sẽ thu hồi cả hai phần.</p><strong>Lưu ý: Giao dịch VIP thật được xác nhận qua cổng thanh toán. Thanh toán tư vấn và thao tác hoàn tiền tại đây vẫn là mô phỏng.</strong></header><p className="payment-description">Danh sách các khoản thanh toán của người dùng, bao gồm thông tin gói dịch vụ, số tiền, thời gian và trạng thái xử lý.</p><div className="ref-filter-row"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Tìm mã, người dùng, dịch vụ…" aria-label="Tìm giao dịch" /><select value={status} onChange={e=>setStatus(e.target.value)} aria-label="Trạng thái giao dịch"><option value="">Tất cả trạng thái</option>{Object.entries(paymentStatus).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button className="button outline payment-export" onClick={()=>exportAdminCsv("danh-sach-thanh-toan.csv",[["Mã", "Người dùng", "Dịch vụ", "Số tiền", "Trạng thái", "Ngày"],...rows.map(row=>[row.id,row.user,row.service,row.amount,paymentStatus[row.status],date(row.created)])])}>Xuất CSV</button></div>{!data?<State error={error} reload={reload} />:<section className="ref-panel payment-table-card"><div className="admin-table-scroll"><table><thead><tr><th>Người dùng / mã</th><th>Dịch vụ</th><th>Số tiền</th><th>Thời gian</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong className="payment-user-name">{row.user}</strong><small>{row.id}</small></td><td>{row.service}<small>{row.demo ? "Mô phỏng" : "Thanh toán thật"}</small></td><td>{adminMoney(row.amount)}</td><td>{date(row.created)}</td><td><span className={`payment-status ${row.status}`}>{row.demo?paymentStatus[row.status]:paymentStatus[row.status]?.replace(" · mô phỏng","")}</span>{row.note&&<small>{row.note}</small>}</td><td>{((row.demo&&row.service!=="Tư vấn"&&row.status!=="refunded")||(!row.demo&&row.status==="refund_requested"))&&<button className="payment-refund" onClick={()=>setSelected(row)}>{row.status==="success"?"Yêu cầu hoàn":"Xử lý hoàn"}</button>}</td></tr>)}{!rows.length&&<tr><td colSpan={6}>Chưa có giao dịch phù hợp.</td></tr>}</tbody></table></div></section>}<details className="payment-operations"><summary>Xét duyệt yêu cầu và chi trả chuyên gia</summary><ConsultationAdmin changed={reload} /></details>{selected&&<RefundDialog payment={selected} close={()=>setSelected(null)} saved={()=>{setSelected(null);reload();}} />}</div>;
}

export function ReportsManagement(){
  const{data,error,reload}=useAdminData<AdminMetrics>("/admin/reports");
  return <RevenueReports data={data} error={error} reload={reload} />;
}

export function PackageManagement({go}:{go:(target:AdminTarget)=>void}){
  const{data,error,reload}=useAdminData<ServicePlan[]>("/admin/packages");
  return <ServicePlans data={data} error={error} reload={reload} go={go} />;
}

export function SystemManagement(){
  const{data,error,reload}=useAdminData<SystemInfo>("/admin/system");
  return <SystemSettings data={data} error={error} reload={reload} />;
}
