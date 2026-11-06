"use client";

// Building blocks shared by the admin management pages (users, experts).
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Heart, ShieldCheck, X } from "lucide-react";
import "./thanh-phan-chung.css";
import "./banner-chung.css";

export const VN = "Asia/Ho_Chi_Minh";
export const numberFormat = new Intl.NumberFormat("vi-VN");
const avatarTints = ["#f4e1d8", "#e3ecfa", "#e6efe9", "#fdebd6", "#efe6f7", "#f2efe4"];

export function Avatar({ name, tint }: { name: string; tint?: string }) {
  const background = tint || avatarTints[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % avatarTints.length];
  return (
    <span className="au-avatar" style={tint ? { background, color: "#fff" } : { background }} aria-hidden="true">
      {(name.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}

export function Notice({ tone, children }: { tone: "error" | "success"; children: string }) {
  return (
    <div className={`notice ${tone}`} role={tone === "error" ? "alert" : "status"}>
      <ShieldCheck size={17} />
      {children}
    </div>
  );
}

export function Modal({ title, close, children, wide = false }: { title: string; close: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`modal ${wide ? "admin-modal" : "compact au-modal"}`}>
        <button className="icon-button modal-close" onClick={close} aria-label="Đóng"><X size={20} /></button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function pageList(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "…", pages];
  if (page >= pages - 3) return [1, "…", pages - 4, pages - 3, pages - 2, pages - 1, pages];
  return [1, "…", page - 1, page, page + 1, "…", pages];
}

export function Pager({
  page,
  pages,
  setPage,
  pageSize,
  setPageSize,
  total,
  unit,
}: {
  page: number;
  pages: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  total: number;
  unit: string;
}) {
  return (
    <footer className="au-foot">
      <label>
        Hiển thị
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Số dòng mỗi trang">
          {[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        / trang · {total} {unit}
      </label>
      <nav className="au-pages" aria-label="Phân trang">
        <button onClick={() => setPage(page - 1)} disabled={page === 1} aria-label="Trang trước"><ChevronLeft size={17} /></button>
        {pageList(page, pages).map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`}>…</span>
          ) : (
            <button key={p} className={p === page ? "active" : ""} aria-current={p === page ? "page" : undefined} onClick={() => setPage(p)}>{p}</button>
          ),
        )}
        <button onClick={() => setPage(page + 1)} disabled={page === pages} aria-label="Trang sau"><ChevronRight size={17} /></button>
      </nav>
    </footer>
  );
}

export function AdminBanner({ title, subtitle, motto, icon, eyebrow = "QUẢN TRỊ HỆ THỐNG" }: { title: string; subtitle: string; motto: string[]; icon?: ReactNode; eyebrow?: string }) {
  return (
    <header className="ae-banner">
      <svg className="ae-banner-wave" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">
        <path className="back" d="M480,200 C580,150 650,110 760,120 C860,130 910,80 1000,70 L1000,200 Z" />
        <path className="front" d="M440,200 C580,180 640,140 740,138 C830,136 880,185 1000,178 L1000,200 Z" />
      </svg>
      <div className="ae-banner-copy">
        <span>{eyebrow}</span>
        <h1>
          {title}
          {icon}
        </h1>
        <p>{subtitle}</p>
      </div>
      <div className="ae-banner-motto" aria-hidden="true">
        <p>
          {motto.map((line) => <em key={line}>{line}</em>)}
        </p>
        <Heart size={34} strokeWidth={1.3} />
        <svg viewBox="0 0 220 12"><path d="M2,8 C70,2 150,2 218,7" /></svg>
      </div>
    </header>
  );
}
