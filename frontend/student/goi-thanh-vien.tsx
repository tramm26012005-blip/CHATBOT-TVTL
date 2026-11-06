"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Check, LockKeyhole, QrCode, Sparkles, Crown, X, Wallet, Landmark, FileText, Info, ArrowRight, Gauge, CalendarDays } from "lucide-react";
import { api, type User } from "@/lib/api";

export type PlanStatus = { tier: "normal" | "vip"; expires_at: string | null; demo: boolean; demo_enabled: boolean; remaining_questions: number; remaining_seconds: number; daily_question_limit: number; daily_seconds_limit: number; exhausted: boolean; reset_at: string; };
export const vipRoutes = ["/history", "/experts", "/book-visit", "/healing"];
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
/** Sidebar card: today's remaining chat questions and minutes (normal plan), or unlimited use (VIP). */
export function UsageCard({ plan, vip, seconds }: { plan: PlanStatus | null; vip: boolean; seconds: number }) {
  if (!plan) return null;
  const qLimit = plan.daily_question_limit || (vip ? 200 : 20), sLimit = plan.daily_seconds_limit || 600;
  const rows = [
    { label: "Lượt hỏi", value: `${plan.remaining_questions}/${qLimit}`, ratio: plan.remaining_questions / qLimit, timer: false },
    // VIP has no time cap, so only the normal plan shows the minutes bar.
    ...(vip ? [] : [{ label: "Thời gian", value: `${clock(seconds)}/${clock(sLimit)}`, ratio: seconds / sLimit, timer: true }]),
  ];
  return (
    <div className={`sidebar-usage ${plan.exhausted ? "is-exhausted" : ""}`}>
      <svg className="usage-wave" viewBox="0 0 240 160" preserveAspectRatio="none" aria-hidden="true">
        <path className="top" d="M150,0 C175,14 195,26 240,30 L240,0 Z" />
        <path className="bottom" d="M0,140 C60,128 120,150 170,140 C200,134 220,124 240,122 L240,160 L0,160 Z" />
      </svg>
      <div className="usage-head">
        <span className="usage-icon"><Gauge size={18} strokeWidth={1.9} aria-hidden="true" /></span>
        <strong>Lượt sử dụng hôm nay</strong>
      </div>
      {rows.map((r) => (
        <div className="usage-row" key={r.label}>
          <div><span>{r.label}</span><b {...(r.timer ? { role: "timer", "aria-live": "off" as const, className: "plan-countdown" } : {})}>{r.value}</b></div>
          <span className="usage-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(1, r.ratio)) * 100}%` }} /></span>
        </div>
      ))}
      <div className="usage-foot">
        <span className="usage-icon small"><CalendarDays size={15} strokeWidth={1.9} aria-hidden="true" /></span>
        <small>{plan.exhausted ? "Đã hết hạn mức hôm nay · " : ""}Làm mới lúc 00:00 mỗi ngày{vip && plan.expires_at ? ` · VIP đến ${new Date(plan.expires_at).toLocaleDateString("vi-VN")}` : ""}</small>
      </div>
    </div>
  );
}
export function VipGate({ exhausted = false }: { exhausted?: boolean }) {
  return <section className="plan-gate panel"><LockKeyhole size={32} /><h2>{exhausted ? "Bạn đã dùng hết hạn mức hôm nay" : "Một tiện ích dành cho thành viên VIP"}</h2><p>{exhausted ? "Gói thường có 20 lượt hỏi hoặc 10 phút mỗi ngày, gói VIP có 200 lượt hỏi mỗi ngày. Hạn mức làm mới lúc 00:00 giờ Việt Nam." : "Nâng cấp để mở lịch sử, kết nối chuyên gia, lịch hẹn, góc bình yên và cài đặt đầy đủ."}</p><Link href="/plans" className="button primary">Xem gói VIP</Link><Link href="/assessment" className="text-link">Bạn vẫn có thể làm Test tâm lý</Link></section>;
}
export function PlanPage({ user, plan, refresh }: { user: User | null; plan: PlanStatus | null; refresh: () => Promise<void> }) {
  const [method, setMethod] = useState<"bank" | "momo">("bank"), [checkout, setCheckout] = useState(false), [agree, setAgree] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (!user) return <section className="plan-gate panel"><h2>Đăng nhập để xem gói của bạn</h2><Link href="/login" className="button primary">Đăng nhập</Link></section>;
  async function activate() {
    if (!agree || busy) return; setBusy(true); setError("");
    try { await api('/membership/demo-upgrade', { method: 'POST', body: JSON.stringify({ method, acknowledge_demo: agree }) }); await refresh(); setCheckout(false); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="plans-page"><h1>Chọn cách Lạc Lạc đồng hành cùng bạn</h1><p className="plan-demo-note">Bản thử thanh toán — không thu tiền, không quét mã chuyển khoản thật.</p>{error && <p role="alert">{error}</p>}
    <div className="plan-cards"><section className="plan-card panel"><span className="eyebrow">GÓI THƯỜNG</span><h2>Miễn phí</h2><strong className="plan-price">0đ</strong><ul>{["Chat và tâm sự: 20 lượt hỏi hoặc 10 phút/ngày", "Dùng chung hạn mức, chạm mốc nào trước thì dừng", "Chỉ tính thời gian mở và sử dụng chat/tâm sự", "Test tâm lý và hỗ trợ khẩn cấp", "Đổi mật khẩu, đăng xuất"].map(t => <li key={t}><Check size={16} />{t}</li>)}</ul>{plan?.tier === 'normal' && <span className="plan-current">Gói hiện tại</span>}</section>
    <section className="plan-card panel featured"><span className="eyebrow">THÀNH VIÊN VIP</span><h2>Đồng hành trọn vẹn hơn</h2><strong className="plan-price">300.000đ <small>/ 30 ngày</small></strong><ul>{["Chat và tâm sự 200 lượt hỏi mỗi ngày, không giới hạn thời gian", "Lịch sử trò chuyện theo lựa chọn lưu của bạn", "Kết nối chuyên gia, lịch hẹn, góc bình yên", "Cài đặt đầy đủ và Test tâm lý"].map(t => <li key={t}><Check size={16} />{t}</li>)}</ul><p className="muted">Vẫn áp dụng hạn mức vận hành và số dư API. Gói này không bao gồm phí khám hoặc tư vấn chuyên gia.</p>{plan?.tier === 'vip' ? <div className="plan-current"><span className="plan-tier-label"><Crown size={19} className="vip-gold-crown" aria-hidden="true" />{plan.demo ? "VIP dùng thử" : "VIP đang hoạt động"}</span>{plan.expires_at && <p>Đến {new Date(plan.expires_at).toLocaleString('vi-VN')}</p>}</div> : <button className="button primary full" disabled={!plan?.demo_enabled} onClick={() => { setAgree(false); setError(""); setCheckout(true); }}><Sparkles size={16} />Nâng Cấp Gói VIP</button>}</section></div>
    <section className="panel plan-management"><h2>Quyền lợi gói</h2><p>Gói hiện tại: <strong className="plan-tier-label">{plan?.tier === "vip" && <Crown size={18} className="vip-gold-crown" aria-hidden="true" />}{plan?.tier === "vip" ? "VIP" : "Thường"}</strong></p>{plan?.tier === 'normal' && <p>Hôm nay còn {plan.remaining_questions}/{plan.daily_question_limit} lượt hỏi và {Math.floor(plan.remaining_seconds / 60)} phút {plan.remaining_seconds % 60} giây.</p>}{plan?.tier === 'vip' && <p>Hôm nay còn {plan.remaining_questions}/{plan.daily_question_limit} lượt hỏi.</p>}<p>Hết hạn VIP sẽ trở về gói thường. Không tự gia hạn hoặc tự trừ tiền.</p></section>
    {checkout && <VipCheckout method={method} setMethod={setMethod} agree={agree} setAgree={setAgree} busy={busy} error={error} close={() => setCheckout(false)} activate={activate} />}
  </div>;
}



function VipCheckout({ method, setMethod, agree, setAgree, busy, error, close, activate }: {
  method: "bank" | "momo"; setMethod: (value: "bank" | "momo") => void;
  agree: boolean; setAgree: (value: boolean) => void; busy: boolean; error: string;
  close: () => void; activate: () => Promise<void>;
}) {
  const panel = useRef<HTMLElement>(null);
  const [order] = useState(() => "LL-DEMO-" + Date.now().toString().slice(-8));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = panel.current;
    root?.focus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = originalOverflow; previous?.focus(); };
  }, []);
  return <div className="modal-backdrop vip-checkout-backdrop"><section ref={panel} tabIndex={-1} className="vip-checkout" role="dialog" aria-modal="true" aria-labelledby="vip-payment-title" onKeyDown={event => {
    if (event.key === "Escape" && !busy) close();
    if (event.key === "Tab") {
      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href]') || []);
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    }
  }}>
    <button className="checkout-close icon-button" aria-label="Đóng thanh toán" onClick={close} disabled={busy}><X size={20} /></button>
    <aside className="checkout-benefits">
      <span className="vip-member-badge"><Crown size={21} />THÀNH VIÊN VIP</span>
      <h2>Đồng hành trọn vẹn hơn</h2><p>Mở thêm những tiện ích chăm sóc cảm xúc cùng Lạc Lạc.</p>
      <div className="checkout-price"><strong>300.000đ</strong><span>/ 30 ngày</span></div>
      <ul>{[
        ["Chat và tâm sự thoải mái hơn", "200 lượt hỏi mỗi ngày, không giới hạn thời gian."],
        ["Lịch sử trò chuyện theo lựa chọn", "Lưu lại những chia sẻ khi bạn đồng ý."],
        ["Kết nối chuyên gia, lịch hẹn, góc bình yên", "Thêm lựa chọn chăm sóc bản thân."],
        ["Cài đặt đầy đủ và Test tâm lý", "Tùy chỉnh trải nghiệm theo cách của bạn."]
      ].map(([title, text]) => <li key={title}><span className="checkout-check"><Check size={15} /></span><div><strong>{title}</strong><p>{text}</p></div></li>)}</ul>
      <div className="checkout-info"><Info size={18} /><p>Vẫn áp dụng hạn mức vận hành và số dư API. Gói này không bao gồm phí khám hoặc tư vấn chuyên gia.</p></div>
    </aside>
    <div className="checkout-payment">
      <header><h2 id="vip-payment-title">Thanh toán nâng cấp VIP</h2><p>Thành viên VIP trong 30 ngày · Bản thanh toán mô phỏng</p></header>
      <div className="checkout-order-grid"><section className="checkout-card"><h3>Thông tin đơn hàng</h3><dl><div><dt>Gói dịch vụ</dt><dd>Thành viên VIP (30 ngày)</dd></div><div><dt>Đơn giá</dt><dd>300.000đ</dd></div><div className="checkout-total"><dt>Tổng thanh toán</dt><dd>300.000đ</dd></div></dl></section><section className="checkout-order-code"><h3><FileText size={16} />Mã tham chiếu mô phỏng</h3><code>{order}</code><p>Chỉ dùng để xem trước giao diện, không phải đơn hàng đã thanh toán.</p></section></div>
      <h3 className="checkout-method-title">Chọn phương thức thanh toán</h3>
      <div className="checkout-methods"><button aria-pressed={method === "bank"} onClick={() => setMethod("bank")}><Landmark size={18} />QR ngân hàng</button><button aria-pressed={method === "momo"} onClick={() => setMethod("momo")}><Wallet size={18} />Ví điện tử (MoMo)</button></div>
      <div className="checkout-transfer-grid">
        <section className="checkout-card checkout-qr-card"><h3>QR nhận tiền · {method === "bank" ? "MB Bank" : "MoMo"}</h3>
          <div className={`payment-qr-crop ${method === "momo" ? "payment-qr-momo" : "payment-qr-bank"}`}><img src="/images/payment/payment-guides.png" alt={method === "bank" ? "Mã QR MB Bank do bạn cung cấp" : "Mã QR MoMo do bạn cung cấp"} /></div>
          <p>Thanh toán hiện ở chế độ mô phỏng.</p>
        </section>
        <section className="checkout-card"><h3>Thông tin nhận tiền</h3><dl>
          <div><dt>{method === "bank" ? "Ngân hàng" : "Ví điện tử"}</dt><dd>{method === "bank" ? "MB Bank (MB)" : "MoMo"}</dd></div>
          <div><dt>{method === "bank" ? "Số tài khoản" : "Số điện thoại"}</dt><dd>0866657828</dd></div>
          <div><dt>Số tiền</dt><dd><strong>300.000đ</strong></dd></div>
          <div><dt>Nội dung</dt><dd className="checkout-reference">NANG CAP GOI VIP</dd></div>
        </dl></section>
      </div>
      <section className="checkout-steps"><h3><FileText size={16} />Hướng dẫn thanh toán</h3><ol><li><b>1</b>Chọn ngân hàng hoặc MoMo</li><li><b>2</b>Xem trước thông tin minh họa</li><li><b>3</b>Xác nhận để thử quyền VIP</li></ol></section>
      <label className="checkbox checkout-consent"><input type="checkbox" checked={agree} onChange={event => setAgree(event.target.checked)} />Tôi hiểu đây là mô phỏng, không phát sinh giao dịch thật.</label>
      {error && <p className="checkout-error" role="alert">{error}</p>}
      <div className="checkout-actions"><button className="button outline" onClick={close} disabled={busy}>Quay lại</button><button className="button primary" onClick={activate} disabled={!agree || busy}>{busy ? "Đang kích hoạt…" : "Xác nhận mô phỏng"}<ArrowRight size={17} /></button></div>
      <div className="checkout-demo-warning"><Info size={17} /><p>Đây là môi trường mô phỏng, không phát sinh giao dịch thật. Không chuyển tiền theo thông tin trên màn hình.</p></div>
    </div>
  </section></div>;
}

export function PlanBenefitsDialog({ close, vip }: { close: () => void; vip: boolean }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const rows = [
    ['Giá gói', 'Miễn phí', '300.000đ / 30 ngày'],
    ['Chat và tâm sự', '20 lượt hỏi hoặc 10 phút/ngày, chạm mốc nào trước thì dừng', '200 lượt hỏi/ngày, không giới hạn thời gian'],
    ['Test tâm lý', 'Có', 'Có'],
    ['Lưu lịch sử theo sự đồng ý', 'Không', 'Có'],
    ['Kết nối chuyên gia', 'Không', 'Có'],
    ['Lịch hẹn', 'Không', 'Có'],
    ['Góc bình yên', 'Không', 'Có'],
    ['Cài đặt', 'Đổi mật khẩu, đăng xuất', 'Đầy đủ'],
    ['Hỗ trợ khẩn cấp', 'Có', 'Có'],
  ];
  return <div className="modal-backdrop benefits-backdrop" onClick={event => { if (event.target === event.currentTarget) close(); }}><section ref={panel} tabIndex={-1} className="plan-benefits-dialog" role="dialog" aria-modal="true" aria-labelledby="plan-benefits-title" onKeyDown={event => {
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button, [href]') || []);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus(); }
    }
  }}><button className="icon-button benefits-close" onClick={close} aria-label="Đóng bảng quyền lợi"><X size={21} /></button><h2 id="plan-benefits-title">Quyền lợi các gói thành viên</h2><p>Gói hiện tại: <strong className="plan-tier-label">{vip && <Crown size={18} className="vip-gold-crown" />}{vip ? 'VIP' : 'Thường'}</strong></p><div className="benefits-table-scroll"><table className="benefits-table"><thead><tr><th scope="col">Quyền lợi</th><th scope="col">Gói thường</th><th scope="col"><span className="plan-tier-label"><Crown size={18} className="vip-gold-crown" />Gói VIP</span></th></tr></thead><tbody>{rows.map(([feature, normal, premium]) => <tr key={feature}><th scope="row">{feature}</th><td>{normal}</td><td>{premium}</td></tr>)}</tbody></table></div><p className="benefits-footnote">Hạn mức gói thường làm mới lúc 00:00 giờ Việt Nam. Các gói vẫn phụ thuộc hạn mức vận hành và số dư API; phí khám, tư vấn chuyên gia không nằm trong giá VIP.</p><div className="button-row"><button className="button outline" onClick={close}>Đóng</button>{!vip && <Link className="button primary" href="/plans" onClick={close}>Nâng Cấp Gói VIP</Link>}</div></section></div>;
}
