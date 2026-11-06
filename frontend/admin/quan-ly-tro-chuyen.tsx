"use client";
import {useState} from "react";
import {CalendarDays, CheckCircle2, ChevronDown, Download, Eye, Hash, Layers, MessageCircle, Search} from "lucide-react";
import {exportAdminCsv} from "@/lib/admin-center";
import {Modal} from "../shared/thanh-phan-chung";
import "./quan-ly-tro-chuyen.css";

export type ConversationRecord={id:string;created:string;status:string};
const date=(value:string)=>`${new Date(value).toLocaleTimeString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})} ${new Date(value).toLocaleDateString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}`;
export default function ConversationsView({data,error,reload}:{data:ConversationRecord[]|null;error:string;reload:()=>void}){
  const[q,setQ]=useState(""),[day,setDay]=useState(""),[selected,setSelected]=useState<ConversationRecord|null>(null);
  const rows=(data||[]).filter(row=>row.id.toLowerCase().includes(q.trim().toLowerCase())&&(!day||new Date(row.created).toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"})===day));
  return <div className="conversation-management">
    <header className="conversation-heading"><h1>Quản lý trò chuyện</h1><p>Thống kê và quản lý các cuộc trò chuyện đã được đồng ý lưu. Nội dung, tiêu đề riêng tư và kết quả tâm lý không được mở tại đây.</p></header>
    <div className="conversation-filters">
      <label className="conversation-search"><Search size={19} aria-hidden="true"/><input aria-label="Tìm mã cuộc trò chuyện" placeholder="Tìm mã cuộc trò chuyện…" value={q} onChange={e=>setQ(e.target.value)}/></label>
      <label className="conversation-date"><CalendarDays size={18} aria-hidden="true"/><input type="date" aria-label="Ngày tạo" value={day} onChange={e=>setDay(e.target.value)}/><ChevronDown size={15} aria-hidden="true"/></label>
      <button className="conversation-export" onClick={()=>exportAdminCsv("cuoc-tro-chuyen.csv",[["STT","Mã","Ngày tạo","Trạng thái"],...rows.map((row,index)=>[index+1,row.id,date(row.created),row.status])])} disabled={!data}><Download size={18} aria-hidden="true"/>Xuất CSV</button>
    </div>
    {!data?(error?<div className="notice error" role="alert"><p>{error}</p><button className="text-link" onClick={reload}>Thử lại</button></div>:<p role="status">Đang tải cuộc trò chuyện…</p>):<section className="conversation-table-card" aria-label="Danh sách cuộc trò chuyện">
      <h2><MessageCircle size={26} strokeWidth={1.5} aria-hidden="true"/>{rows.length} cuộc trò chuyện</h2>
      <div className="admin-table-scroll"><table><thead><tr><th className="conversation-number"><Hash size={16} aria-label="Số thứ tự"/></th><th>Mã</th><th><span><CalendarDays size={18} aria-hidden="true"/>Ngày tạo</span></th><th><span><Layers size={18} aria-hidden="true"/>Trạng thái lưu</span></th><th className="conversation-actions">Thao tác</th></tr></thead>
        <tbody>{rows.map((row,index)=><tr key={row.id}><td className="conversation-number"><span>{index+1}</span></td><td className="conversation-id">{row.id}</td><td>{date(row.created)}</td><td><span className="conversation-status"><CheckCircle2 size={13} fill="currentColor" aria-hidden="true"/><span>{row.status}</span></span></td><td className="conversation-actions"><button className="conversation-view" onClick={()=>setSelected(row)} aria-label={`Xem thông tin cuộc trò chuyện ${row.id}`}><Eye size={16} aria-hidden="true"/>Xem</button></td></tr>)}{!rows.length&&<tr><td className="conversation-empty" colSpan={5}>Không có cuộc trò chuyện phù hợp.</td></tr>}</tbody></table></div>
    </section>}
    {selected&&<Modal title="Thông tin bản ghi trò chuyện" close={()=>setSelected(null)}><dl className="conversation-record"><div><dt>Mã cuộc trò chuyện</dt><dd>{selected.id}</dd></div><div><dt>Ngày tạo</dt><dd>{date(selected.created)}</dd></div><div><dt>Trạng thái lưu</dt><dd>{selected.status}</dd></div></dl><p>Nội dung và tiêu đề trò chuyện riêng tư không được cung cấp cho Admin.</p></Modal>}
  </div>;
}
