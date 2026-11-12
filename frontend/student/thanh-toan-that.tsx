"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Landmark, Wallet, X, ExternalLink, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import "./thanh-toan-that.css";

type Method = "bank" | "momo";
type Order = { id: string; method: Method; amount: number; duration_days: number; status: string; checkout_url: string; expires_at: string; paid_at: string | null };
const labels: Record<string, string> = { creating: "Đang tạo phiên thanh toán", pending: "Đang chờ thanh toán", paid: "Đã nhận tiền · VIP đã được kích hoạt", expired: "Đơn đã hết hạn", cancelled: "Đơn đã hủy", review: "Đã ghi nhận giao dịch cần hỗ trợ đối soát" };
const terminal = (status: string) => ["paid", "review", "cancelled", "expired"].includes(status);
const storageKey = (userId: string) => `lac-lac:payment:${userId}`;

export default function LiveVipCheckout({ userId, methods, initialOrderId, close, refresh }: {
  userId: string; methods: { bank: boolean; momo: boolean }; initialOrderId?: string;
  close: () => void; refresh: () => Promise<void>;
}) {
  const [method, setMethod] = useState<Method>(methods.bank ? "bank" : "momo");
  const [order, setOrder] = useState<Order | null>(null), [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const panel = useRef<HTMLElement>(null), checking = useRef(false), refreshed = useRef("");
  const mounted = useRef(true), refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  const remember = useCallback((next: Order) => {
    setOrder(next);
    setMethod(next.method);
    try {
      if (terminal(next.status)) localStorage.removeItem(storageKey(userId));
      else localStorage.setItem(storageKey(userId), next.id);
    } catch { /* Storage can be disabled; the return URL still restores the order. */ }
    if (next.status === "paid" && refreshed.current !== next.id) {
      refreshed.current = next.id;
      void refreshRef.current().catch(() => { refreshed.current = ""; });
    }
  }, [userId]);
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    let saved = initialOrderId;
    try { saved ||= localStorage.getItem(storageKey(userId)) || undefined; } catch { /* optional */ }
    if (saved) {
      setBusy(true);
      api<Order>(`/payments/orders/${encodeURIComponent(saved)}`).then(next => {
        if (mounted.current) remember(next);
      }).catch(e => { if (mounted.current) setError(e.message); })
        .finally(() => { if (mounted.current) setBusy(false); });
    }
    return () => { mounted.current = false; document.body.style.overflow = overflow; previous?.focus(); };
  }, [userId, initialOrderId, remember]);
  const check = useCallback(async (id: string, contactProvider: boolean) => {
    if (checking.current) return;
    checking.current = true;
    try {
      const next = await api<Order>(`/payments/orders/${encodeURIComponent(id)}${contactProvider ? "/refresh" : ""}`, contactProvider ? { method: "POST" } : {});
      if (mounted.current) { remember(next); setError(""); }
    } catch (e) { if (mounted.current) setError((e as Error).message); }
    finally { checking.current = false; }
  }, [remember]);
  useEffect(() => {
    if (!order || terminal(order.status)) return;
    let count = 0;
    void check(order.id, true);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void check(order.id, ++count % 6 === 0);
    }, 5000);
    const focus = () => { void check(order.id, true); };
    window.addEventListener("focus", focus);
    return () => { clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [order?.id, order?.status, check]);
  async function create() {
    if (!agree || busy || !methods[method]) return;
    setBusy(true); setError("");
    try {
      const next = await api<Order>("/payments/orders", { method: "POST", body: JSON.stringify({ method, consent: true }) });
      if (mounted.current) remember(next);
    } catch (e) { if (mounted.current) setError((e as Error).message); }
    finally { if (mounted.current) setBusy(false); }
  }
  const safeLink = (() => {
    try { const u = new URL(order?.checkout_url || ""); return u.protocol === "https:" && u.hostname === (order?.method === "bank" ? "pay.payos.vn" : "payment.momo.vn") ? u.href : ""; }
    catch { return ""; }
  })();
  return <div className="modal-backdrop"><section ref={panel} tabIndex={-1} className="live-payment panel" role="dialog" aria-modal="true" aria-labelledby="real-payment-title" onKeyDown={e => {
    if (e.key === "Escape" && !busy) close();
    if (e.key === "Tab") {
      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]') || []);
      const first = items[0], last = items[items.length - 1];
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { e.preventDefault(); first.focus(); }
    }
  }}>
    <button className="icon-button live-payment-close" aria-label="Đóng thanh toán" disabled={busy} onClick={close}><X size={20} /></button>
    <h2 id="real-payment-title">Thanh toán gói VIP</h2>
    <p className="live-payment-price">{(order?.amount ?? 300000).toLocaleString("vi-VN")}đ <small>/ {order?.duration_days ?? 30} ngày</small></p>
    <p>200 lượt hỏi mỗi ngày, không giới hạn thời gian. Không bao gồm phí tư vấn chuyên gia. Không tự trừ tiền gia hạn.</p>
    {!order ? <>
      <div className="checkout-methods live-payment-methods">
        <button aria-pressed={method === "bank"} disabled={!methods.bank || busy} onClick={() => setMethod("bank")}><Landmark size={19} />MB Bank{!methods.bank && <small>Chưa sẵn sàng</small>}</button>
        <button aria-pressed={method === "momo"} disabled={!methods.momo || busy} onClick={() => setMethod("momo")}><Wallet size={19} />MoMo{!methods.momo && <small>Chưa sẵn sàng</small>}</button>
      </div>
      <label className="checkbox checkout-consent"><input type="checkbox" checked={agree} disabled={busy} onChange={e => setAgree(e.target.checked)} />Tôi đồng ý thanh toán 300.000đ để sử dụng gói VIP trong 30 ngày.</label>
      <button className="button primary full" disabled={!agree || busy || !methods[method]} onClick={() => void create()}>{busy ? "Đang tạo đơn…" : "Tạo đơn thanh toán"}</button>
    </> : <>
      <dl className="live-payment-summary"><div><dt>Mã đơn</dt><dd>{order.id}</dd></div><div><dt>Phương thức</dt><dd>{order.method === "bank" ? "QR MB Bank" : "Ví MoMo"}</dd></div><div><dt>Hạn thanh toán</dt><dd>{new Date(order.expires_at).toLocaleString("vi-VN")}</dd></div></dl>
      <p role="status" className={`live-payment-status ${order.status}`}>{order.status === "paid" && <CheckCircle2 size={20} />}{labels[order.status] || order.status}</p>
      {order.status === "pending" && safeLink && <><a className="button primary full" href={safeLink} target="_blank" rel="noopener noreferrer">{order.method === "bank" ? "Mở mã QR MB Bank" : "Mở thanh toán MoMo"}<ExternalLink size={17} /></a><p>Trang thanh toán mở trong tab mới. Thanh toán đúng số tiền và nội dung của đơn; trang này sẽ tự cập nhật khi nhận được xác nhận.</p></>}
      {order.status === "review" && <p>Vui lòng liên hệ hỗ trợ và cung cấp mã đơn ở trên. Chưa cần chuyển tiền thêm.</p>}
      {!terminal(order.status) && <button className="button outline full" disabled={busy} onClick={() => void check(order.id, true)}>Kiểm tra giao dịch</button>}
      {["cancelled", "expired"].includes(order.status) && <button className="button outline full" onClick={() => { setOrder(null); setAgree(false); }}>Tạo đơn mới</button>}
      {order.status === "paid" && <button className="button primary full" onClick={close}>Hoàn tất</button>}
      <small>Đóng cửa sổ không hủy giao dịch đang xử lý. Quyền VIP được cập nhật sau khi xác nhận tiền về.</small>
    </>}
    {error && <p className="checkout-error" role="alert">{error}</p>}
  </section></div>;
}
