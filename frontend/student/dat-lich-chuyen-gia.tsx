"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { api, type User } from "@/lib/api";
import { expertDisplayName } from "./danh-gia-chuyen-gia";
import AvailableSlots from "./khung-gio-ranh";

type Draft = { student_name: string; student_email: string; school: string; contact: string; description: string; date: string; time: string; consent_contact: boolean; consent_details: boolean };
type Result = { id: string; expert_name: string; starts_at: string; status: string; payment?: {amount: number | null; status: string}; expert_contact?: {name: string; phone: string; zalo?: string | null} };
export default function ExpertBooking({ expert, user, close, initialDate="", initialTime="" }: { expert: {id: string; name: string; degree?: string; fee?: number | null}; user: User; close: () => void; initialDate?:string; initialTime?:string }) {
  const dialog = useRef<HTMLDialogElement>(null), sending = useRef(false), alive = useRef(true);
  const [step, setStep] = useState<"details" | "payment" | "done">("details"), [draft, setDraft] = useState<Draft>({student_name:user.name,student_email:user.email,school:"",contact:"",description:"",date:initialDate,time:initialTime,consent_contact:false,consent_details:false});
  const [slotReady,setSlotReady]=useState(false);
  const [method, setMethod] = useState<"bank" | "momo">("bank"), [agree, setAgree] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [result, setResult] = useState<Result | null>(null);
  useEffect(() => { alive.current = true; const node = dialog.current; node?.showModal(); return () => { alive.current = false; node?.close(); }; }, []);
  const fee = typeof expert.fee === "number" ? expert.fee : null;
  const price = fee === null ? "Chưa cập nhật" : `${fee.toLocaleString("vi-VN")}đ`;
  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!slotReady || !draft.time) {setError("Bạn hãy chọn một khung giờ còn trống trong lịch của chuyên gia.");return;}
    if (fee === null) { setError("Chuyên gia chưa cập nhật giá. Bạn vui lòng chọn lại sau khi đơn vị vận hành bổ sung phí tư vấn."); return; }
    const starts = new Date(`${draft.date}T${draft.time}:00+07:00`);
    if (starts.getTime() <= Date.now()) { setError("Bạn hãy chọn ngày giờ trong tương lai nhé."); return; }
    setStep("payment");
  }
  async function finish() {
    if (!agree || sending.current || fee === null) return;
    sending.current = true; setBusy(true); setError("");
    try {
      const value = await api<Result>("/bookings", {method:"POST", body:JSON.stringify({...draft, starts_at:`${draft.date}T${draft.time}:00+07:00`,expert_id:expert.id,payment_method:method,demo_payment_confirmed:true,expected_fee:fee})});
      if (alive.current) { setResult(value); setStep("done"); }
    } catch (err) { if (alive.current) setError((err as Error).message); }
    finally { sending.current = false; if (alive.current) setBusy(false); }
  }
  const change = (key: keyof Draft, value: string | boolean) => setDraft(previous => ({...previous,[key]:value}));
  return <dialog ref={dialog} className="expert-booking-dialog" aria-labelledby="expert-booking-title" onCancel={event => { if (busy) event.preventDefault(); else close(); }}>
    <button className="modal-close icon-button" aria-label="Đóng đặt lịch" onClick={close} disabled={busy}><X size={20} /></button>
    <span className="eyebrow">ĐỒNG HÀNH CÙNG CHUYÊN GIA</span><h2 id="expert-booking-title">{step === "done" ? "Đã gửi đăng ký tư vấn" : step === "payment" ? "Kiểm tra và thanh toán" : "Đăng ký tư vấn"}</h2>
    <p className="expert-booking-name">{expertDisplayName(expert.name,expert.degree)} · <strong>{price} / buổi</strong></p>
    <ol className="expert-booking-steps" aria-label="Các bước đăng ký">{["Thông tin", "Thanh toán", "Hoàn tất"].map((label,index) => <li key={label} aria-current={index === ["details","payment","done"].indexOf(step) ? "step" : undefined}>{index+1}. {label}</li>)}</ol>
    {step === "details" && <form onSubmit={next}>
      <div className="two-columns"><label>Họ và tên sinh viên<input required minLength={2} maxLength={100} autoComplete="name" value={draft.student_name} onChange={e => change("student_name",e.target.value)} /></label><label>Email<input type="email" required maxLength={254} autoComplete="email" value={draft.student_email} onChange={e => change("student_email",e.target.value)} /></label><label>Số điện thoại<input type="tel" required pattern="^\+?[0-9 .\-]{8,20}$" maxLength={20} autoComplete="tel" placeholder="0901 234 567" value={draft.contact} onChange={e => change("contact",e.target.value)} /></label><label>Trường / khoa (không bắt buộc)<input maxLength={200} value={draft.school} onChange={e => change("school",e.target.value)} /></label></div>
      <label>Điều bạn muốn chia sẻ với chuyên gia<textarea required maxLength={3000} rows={4} placeholder="Gần đây bạn gặp khó khăn gì, cảm thấy thế nào và mong được hỗ trợ điều gì?" value={draft.description} onChange={e => change("description",e.target.value)} /></label>
      <label>Ngày mong muốn<input type="date" required min={new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}).format(new Date())} value={draft.date} onChange={e => {setSlotReady(false);change("date",e.target.value);}} /></label>
      <AvailableSlots expertId={expert.id} date={draft.date} value={draft.time} onChange={time=>change("time",time)} onReady={setSlotReady} />
      <p className="muted">Khung giờ mong muốn cần được chuyên gia xác nhận.</p>
      <label className="checkbox"><input type="checkbox" required checked={draft.consent_contact} onChange={e => change("consent_contact",e.target.checked)} />Tôi đồng ý dùng thông tin liên hệ để xử lý đăng ký.</label>
      <label className="checkbox"><input type="checkbox" required checked={draft.consent_details} onChange={e => change("consent_details",e.target.checked)} />Tôi đồng ý chia sẻ phần mô tả với chuyên gia được chọn. Lịch sử trò chuyện không được gửi kèm.</label>
      <button className="button primary green-shimmer" type="submit" disabled={!slotReady||!draft.time}>Tiếp tục thanh toán</button>
    </form>}
    {step === "payment" && <>
      <section className="booking-order-summary"><h3>Thông tin đăng ký</h3><dl><div><dt>Sinh viên</dt><dd>{draft.student_name}</dd></div><div><dt>Email</dt><dd>{draft.student_email}</dd></div><div><dt>Điện thoại</dt><dd>{draft.contact}</dd></div>{draft.school && <div><dt>Trường / khoa</dt><dd>{draft.school}</dd></div>}<div><dt>Chuyên gia</dt><dd>{expertDisplayName(expert.name,expert.degree)}</dd></div><div><dt>Lịch mong muốn</dt><dd>{draft.date.split("-").reverse().join("/")} · {draft.time} (giờ Việt Nam)</dd></div><div><dt>Nội dung chia sẻ</dt><dd className="booking-description">{draft.description}</dd></div><div><dt>Tổng phí tư vấn</dt><dd><strong>{price} / buổi</strong></dd></div></dl></section>
      <p>Buổi tư vấn tối đa 30 phút. Bạn có thể hủy và hoàn đủ tiền trước giờ hẹn. Chuyên gia được trễ tối đa 5 phút; bạn được trễ 15 phút. Nếu chuyên gia có mặt đúng hạn nhưng bạn vắng quá 15 phút, phí buổi sẽ không được hoàn. Sau giờ hẹn, yêu cầu hoàn tiền cần Admin xét duyệt; hạn gửi là 7 ngày sau khi kết thúc buổi.</p><p className="booking-demo-note">Thanh toán mô phỏng — không chuyển tiền thật. Phí tư vấn tách riêng với gói VIP.</p>
      <div className="booking-payment-methods"><button aria-pressed={method === "bank"} onClick={() => setMethod("bank")}>QR ngân hàng</button><button aria-pressed={method === "momo"} onClick={() => setMethod("momo")}>MoMo</button></div>
      <div className="booking-demo-payment"><div className={`payment-qr-crop ${method === "momo" ? "payment-qr-momo" : "payment-qr-bank"}`}><img src="/images/payment/payment-guides.png" alt="QR minh họa, không dùng chuyển tiền tư vấn" /></div><div><h3>{method === "bank" ? "MB Bank" : "MoMo"} · Mô phỏng</h3><p>Số tiền: <strong>{price}</strong></p><p>Nội dung: DANG KY TU VAN</p><small>QR hiện có chỉ để xem trước, chưa được cấu hình nhận phí tư vấn.</small></div></div>
      <label className="checkbox"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} disabled={busy} />Tôi hiểu đây là mô phỏng, không có giao dịch thật.</label>
      <div className="button-row"><button className="button outline" disabled={busy} onClick={() => setStep("details")}>Chỉnh thông tin</button><button className="button primary green-shimmer" disabled={!agree || busy} onClick={finish}>{busy ? "Đang đăng ký…" : "Xác nhận mô phỏng và đăng ký"}</button></div>
    </>}
    {step === "done" && result && <section className="booking-complete"><p>Đã nhận đăng ký của bạn. Thanh toán mô phỏng đã hoàn tất; lịch hẹn đang <strong>chờ chuyên gia xác nhận</strong>.</p><p>Mã đăng ký: <strong>{result.id}</strong></p><dl className="booking-order-summary"><div><dt>Sinh viên</dt><dd>{draft.student_name}</dd></div><div><dt>Email</dt><dd>{draft.student_email}</dd></div><div><dt>Điện thoại</dt><dd>{draft.contact}</dd></div>{draft.school && <div><dt>Trường / khoa</dt><dd>{draft.school}</dd></div>}</dl><p>Lịch mong muốn: {new Date(result.starts_at).toLocaleString("vi-VN",{timeZone:"Asia/Ho_Chi_Minh"})}</p><p>Phí tư vấn: <strong>{result.payment?.amount != null ? `${result.payment.amount.toLocaleString("vi-VN")}đ` : price} / buổi</strong></p><p className="booking-description">Nội dung đã chia sẻ: {draft.description}</p><div className="booking-expert-contact"><h3>Liên hệ chuyên gia khi cần</h3><strong>{expertDisplayName(expert.name,expert.degree)}</strong>{result.expert_contact?.phone ? <p>Điện thoại: <a href={`tel:${result.expert_contact.phone}`}>{result.expert_contact.phone}</a></p> : <p>Chuyên gia chưa cập nhật số liên hệ.</p>}{result.expert_contact?.zalo && <a href={result.expert_contact.zalo} target="_blank" rel="noreferrer">Liên hệ qua Zalo</a>}<small>Chuyên gia có thể không phản hồi ngay. Nếu đang gặp nguy hiểm tức thời, hãy đến cơ sở cấp cứu gần nhất.</small></div><div className="button-row"><Link className="button primary green-shimmer" href="/bookings" onClick={close}>Xem lịch hẹn của bạn</Link><button className="button outline" onClick={close}>Hoàn tất</button></div></section>}
    {error && <p className="checkout-error" role="alert">{error}</p>}
  </dialog>;
}
