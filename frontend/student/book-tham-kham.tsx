"use client";
import {useEffect,useState,type FormEvent} from "react";
import {api,type User} from "@/lib/api";
import {type Hospital,type HospitalVisit,visitStatus,visitTime} from "@/lib/hospital-visits";

export default function HospitalVisits({user}:{user:User|null}) {
  const [hospitals,setHospitals]=useState<Hospital[]>([]),[visits,setVisits]=useState<HospitalVisit[]>([]),[hospitalId,setHospitalId]=useState(""),[department,setDepartment]=useState(""),[doctor,setDoctor]=useState("");
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState<HospitalVisit|null>(null),[refresh,setRefresh]=useState(0);
  const hospital=hospitals.find(row=>row.id===hospitalId),specialty=hospital?.departments.find(row=>row.name===department);
  useEffect(()=>{
    const abort=new AbortController();setLoading(true);setError("");
    Promise.all([api<Hospital[]>("/hospitals",{signal:abort.signal}),api<HospitalVisit[]>("/hospital-visits",{signal:abort.signal})]).then(([catalog,rows])=>{setHospitals(catalog);setVisits(rows);}).catch(err=>{if(!abort.signal.aborted)setError(err.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return()=>abort.abort();
  },[user?.id,refresh]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(busy)return;const form=event.currentTarget,f=new FormData(form);setBusy(true);setError("");
    try {
      const row=await api<HospitalVisit>("/hospital-visits",{method:"POST",body:JSON.stringify({hospital_id:hospitalId,department,doctor:doctor||null,starts_at:`${f.get("date")}T${f.get("time")}:00+07:00`,student_name:f.get("student_name"),email:f.get("email"),phone:f.get("phone"),school:f.get("school"),description:f.get("description"),consent:f.get("consent")==="on"})});
      setSuccess(row);setVisits(previous=>[row,...previous]);form.reset();setHospitalId("");setDepartment("");setDoctor("");
    } catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  async function cancel(row:HospitalVisit) {
    if(!window.confirm("Bạn muốn hủy yêu cầu thăm khám này?"))return;setBusy(true);setError("");
    try {await api(`/hospital-visits/${row.id}`,{method:"DELETE"});setVisits(previous=>previous.map(value=>value.id===row.id?{...value,status:"cancelled"}:value));if(success?.id===row.id)setSuccess(null);}catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  return <div className="hospital-visits-page"><header className="experts-heading"><span className="eyebrow">ĐĂNG KÝ THĂM KHÁM</span><h1>Book thăm khám</h1><p>Chọn cơ sở y tế, chuyên khoa và thời gian bạn mong muốn được thăm khám.</p></header>
    <p className="hospital-connection-note">Đăng ký được ghi nhận tại website và chờ đơn vị vận hành liên hệ bệnh viện. Chưa có kết nối đặt lịch tự động với hệ thống bệnh viện; bạn chỉ có lịch chính thức khi được xác nhận. Phí khám do cơ sở y tế thông báo.</p>
    {loading&&<p role="status">Đang tải thông tin bệnh viện…</p>}
    {error&&<div role="alert" className="notice error"><p>{error}</p><button className="text-link" onClick={()=>setRefresh(value=>value+1)}>Tải lại</button></div>}
    {!loading&&!hospitals.length&&!error&&<section className="panel hospital-empty"><h2>Danh sách cơ sở y tế đang được chuẩn bị</h2><p>Admin cần thêm bệnh viện, chuyên khoa và bác sĩ đã xác minh trước khi mở đăng ký. Hiện chưa có cơ sở được công khai.</p></section>}
    {success&&<section className="panel hospital-success" role="status"><h2>Đã ghi nhận yêu cầu thăm khám</h2><p>Mã yêu cầu: <strong>{success.id}</strong></p><p>{success.hospital_name} · {success.department} · {visitTime(success.starts_at)}</p><p>Trạng thái: <strong>{visitStatus[success.status]}</strong>. Đây chưa phải phiếu hẹn chính thức từ bệnh viện.</p></section>}
    {!loading&&hospitals.length>0&&<form className="panel hospital-registration" onSubmit={submit}><h2>Thông tin đăng ký</h2><fieldset disabled={busy}>
      <div className="two-columns"><label>Họ và tên sinh viên<input name="student_name" required minLength={2} maxLength={100} defaultValue={user?.name} autoComplete="name" /></label><label>Email<input type="email" name="email" required defaultValue={user?.email} autoComplete="email" /></label><label>Số điện thoại<input name="phone" type="tel" required pattern="^\+?[0-9 ().\-]{8,20}$" autoComplete="tel" /></label><label>Trường / khoa (không bắt buộc)<input name="school" maxLength={200} /></label></div>
      <label>Bệnh viện / cơ sở y tế<select required value={hospitalId} onChange={event=>{setHospitalId(event.target.value);setDepartment("");setDoctor("");}}><option value="">Chọn bệnh viện</option>{hospitals.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      {hospital&&<p className="hospital-address">{hospital.address} · Điện thoại: <a href={`tel:${hospital.phone}`}>{hospital.phone}</a></p>}
      <div className="two-columns"><label>Chuyên khoa<select required disabled={!hospital} value={department} onChange={event=>{setDepartment(event.target.value);setDoctor("");}}><option value="">Chọn chuyên khoa</option>{hospital?.departments.map(row=><option key={row.name}>{row.name}</option>)}</select></label><label>Bác sĩ mong muốn<select disabled={!specialty} value={doctor} onChange={event=>setDoctor(event.target.value)}><option value="">Để bệnh viện phân công</option>{specialty?.doctors.map(name=><option key={name}>{name}</option>)}</select></label></div>
      <div className="two-columns"><label>Ngày mong muốn<input name="date" type="date" required min={new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).format(new Date())} /></label><label>Giờ mong muốn (giờ Việt Nam)<input name="time" type="time" required /></label></div>
      <label>Lý do thăm khám và cảm xúc hiện tại<textarea name="description" required maxLength={3000} rows={4} placeholder="Bạn đang gặp khó khăn gì và mong được hỗ trợ điều gì?" /></label>
      <label className="checkbox"><input name="consent" type="checkbox" required />Tôi đồng ý cho đơn vị vận hành xử lý thông tin và chia sẻ nội dung đăng ký với cơ sở y tế đã chọn để sắp xếp thăm khám. Lịch sử trò chuyện không được gửi kèm.</label>
      <button className="button primary green-shimmer" disabled={busy}>{busy?"Đang gửi…":"Gửi yêu cầu thăm khám"}</button>
    </fieldset></form>}
    <section className="hospital-request-list"><h2>Yêu cầu thăm khám của bạn</h2>{!loading&&!visits.length&&<p>Bạn chưa có yêu cầu thăm khám nào.</p>}{visits.map(row=><article className="panel" key={row.id}><header><h3>{row.hospital_name}</h3><span className="tag">{visitStatus[row.status]}</span></header><p>{row.department} · {row.doctor||"Bệnh viện phân công bác sĩ"}</p><p>{visitTime(row.starts_at)} · Giờ Việt Nam</p><details><summary>Chi tiết đăng ký</summary><p>{row.student_name} · {row.phone} · {row.email}</p>{row.school&&<p>{row.school}</p>}<p className="booking-description">{row.description}</p><p>{row.hospital_address}</p><p>Liên hệ cơ sở y tế: <a href={`tel:${row.hospital_phone}`}>{row.hospital_phone}</a></p>{row.response_note&&<p>Phản hồi: {row.response_note}</p>}</details>{["pending","confirmed"].includes(row.status)&&new Date(row.starts_at)>new Date()&&<button className="text-link" disabled={busy} onClick={()=>cancel(row)}>Hủy yêu cầu</button>}</article>)}</section>
  </div>;
}
