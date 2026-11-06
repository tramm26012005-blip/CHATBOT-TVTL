"use client";

// Sidebar + top bar frame shared by the admin and expert portals.
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Bell, ChevronDown, Home, LogOut, Menu, Moon, Sun, X, type LucideIcon } from "lucide-react";
import type { User } from "@/lib/api";
import { BrandWordmark } from "./thuong-hieu";
import "./khung-giao-dien.css";

export type PortalSection<K extends string> = { key: K; label: string; icon: LucideIcon };

export default function PortalShell<K extends string>({
  user,
  roleLabel,
  sections,
  section,
  onSection,
  alerts,
  alertLabel,
  onAlerts,
  toolbar,
  logout,
  theme,
  toggleTheme,
  children,
  reference = false,
  decoration,
}: {
  user: User;
  roleLabel: string;
  sections: PortalSection<K>[];
  section: K;
  onSection: (key: K) => void;
  alerts: number;
  alertLabel: string;
  onAlerts: () => void;
  toolbar?: ReactNode;
  logout: () => void;
  theme: string;
  toggleTheme: () => void;
  children: ReactNode;
  reference?: boolean;
  decoration?: ReactNode;
}) {
  const [nav, setNav] = useState(false),
    [profile, setProfile] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    if (!reference) return;
    const media = window.matchMedia("(min-width: 981px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [reference]);
  useEffect(() => {
    if (!profile) return;
    const close = (e: MouseEvent) => {
      if (!profileRef.current?.contains(e.target as Node)) setProfile(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [profile]);
  function go(key: K) {
    setNav(false);
    onSection(key);
  }
  const initial = (user.name.trim().charAt(0) || "?").toUpperCase();
  return (
    <div className={`admin-shell ${reference ? "admin-reference" : ""} ${collapsed ? "nav-collapsed" : ""} ${nav ? "nav-open" : ""}`}>
      <aside className="admin-sidebar" aria-label="Điều hướng">
        <div className="admin-brand">
          <BrandWordmark className="is-scaled portal-brand" href={user.role === "admin" ? "/admin" : "/expert"} />
          <button className="admin-icon-button admin-nav-close" onClick={() => setNav(false)} aria-label="Đóng menu"><X size={20} /></button>
        </div>
        <nav>
          {sections.map(({ key, label, icon: Icon }) => (
            <button key={key} title={label} aria-label={label} className={section === key ? "active" : ""} aria-current={section === key ? "page" : undefined} onClick={() => go(key)}>
              <Icon size={23} strokeWidth={1.6} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        {decoration}
        <button className="admin-logout" onClick={logout}>
          <LogOut size={23} strokeWidth={1.6} />
          <span>Đăng xuất</span>
        </button>
      </aside>
      {nav && <div className="admin-scrim" onClick={() => setNav(false)} />}
      <div className="admin-main">
        <header className="admin-topbar">
          <button className="admin-icon-button admin-menu-toggle" onClick={() => { if (reference && desktop) setCollapsed(!collapsed); else setNav(!nav); }} aria-label="Đóng hoặc mở menu" aria-expanded={reference && desktop ? !collapsed : nav}><Menu size={24} strokeWidth={1.6} /></button>
          {toolbar}
          <button className="admin-icon-button admin-bell" onClick={onAlerts} aria-label={alertLabel} title={alertLabel}>
            <Bell size={24} strokeWidth={1.6} />
            {alerts > 0 && <i />}
          </button>
          <div className="admin-profile" ref={profileRef}>
            <button onClick={() => setProfile(!profile)} aria-expanded={profile} aria-haspopup="menu">
              <span className="admin-avatar">{initial}</span>
              <span className="admin-profile-text">
                <strong>{user.name}</strong>
                <small>{roleLabel}</small>
              </span>
              <ChevronDown size={18} />
            </button>
            {profile && (
              <div className="admin-menu" role="menu">
                <Link href="/" role="menuitem"><Home size={17} />Trang người dùng</Link>
                <button role="menuitem" onClick={toggleTheme}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}{theme === "light" ? "Giao diện tối" : "Giao diện sáng"}</button>
                <button role="menuitem" onClick={logout}><LogOut size={17} />Đăng xuất</button>
              </div>
            )}
          </div>
        </header>
        <main className="admin-content" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
