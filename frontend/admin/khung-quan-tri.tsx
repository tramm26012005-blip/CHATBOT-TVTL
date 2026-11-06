"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowDown,
  BarChart3, ClipboardList, CreditCard, Settings, Star, PanelsTopLeft,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  Home,
  LifeBuoy,
  MessageCircle,
  Music2,
  Sun,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import { api, type User } from "@/lib/api";
import PortalShell from "../shared/khung-giao-dien";
import { AdminBanner } from "../shared/thanh-phan-chung";
import AdminBookings from "./quan-ly-lich-hen";
import AdminHospitalVisits from "./book-tham-kham";
import AdminExperts from "./quan-ly-chuyen-gia";
import AdminMusic from "./nhac-thu-gian";
import AdminSupport from "./thong-tin-ho-tro";
import AdminUsers from "./quan-ly-nguoi-dung";
import StaffAccounts from "./tai-khoan-nhan-su";
import ReferenceDashboard from "./dashboard-thiet-ke";
import {ConversationManagement,AssessmentManagement,PaymentManagement,ReportsManagement,PackageManagement,SystemManagement} from "./trung-tam-quan-ly";
import type {AdminTarget,DashboardPayload} from "@/lib/admin-center";
import {Modal} from "../shared/thanh-phan-chung";
import "./admin-reference.css";
import "../shared/khung-giao-dien.css";

export type AdminSection = AdminTarget;

type Change = number | null;
type Dashboard = DashboardPayload;

const sections: { key: AdminSection; label: string; icon: typeof Home }[] = [
  {key:"overview",label:"Tổng quan (Dashboard)",icon:Home},
  {key:"users",label:"Quản lý người dùng",icon:Users},
  {key:"experts",label:"Quản lý chuyên gia",icon:UserPlus},
  {key:"conversations",label:"Quản lý trò chuyện",icon:MessageCircle},
  {key:"bookings",label:"Quản lý lịch hẹn",icon:CalendarDays},
  {key:"assessments",label:"Quản lý bài test",icon:ClipboardList},
  {key:"packages",label:"Quản lý gói dịch vụ",icon:Star},
  {key:"payments",label:"Quản lý thanh toán",icon:CreditCard},
  {key:"reports",label:"Doanh thu và báo cáo",icon:BarChart3},
  {key:"content",label:"Quản lý nội dung",icon:PanelsTopLeft},
  {key:"system",label:"Cài đặt hệ thống",icon:Settings},
];

const numberFormat = new Intl.NumberFormat("vi-VN");
const VN_TIME = { timeZone: "Asia/Ho_Chi_Minh" } as const;

function initial(name: string) {
  return (name.trim().charAt(0) || "?").toUpperCase();
}

function ChangeBadge({ value, unit }: { value: Change; unit: string }) {
  if (value === null)
    return (
      <span className="admin-change">
        <small>Chưa có số liệu {unit} để so sánh</small>
      </span>
    );
  const Icon = value < 0 ? ArrowDown : ArrowUp;
  return (
    <span className={`admin-change ${value < 0 ? "down" : "up"}`}>
      <b>
        <Icon size={15} strokeWidth={2.2} />
        {Math.abs(value)}%
      </b>
      <small>so với {unit}</small>
    </span>
  );
}

function niceStep(value: number) {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value)), f = value / 10 ** exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * 10 ** exp;
}

// Monotone cubic (Fritsch–Carlson): smooth, but never overshoots the data.
function smoothPath(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 2) return n ? `M${points[0].x},${points[0].y}` : "";
  const dx = points.slice(1).map((p, i) => p.x - points[i].x);
  const slope = points.slice(1).map((p, i) => (p.y - points[i].y) / dx[i]);
  const m = points.map((_, i) =>
    i === 0 ? slope[0] : i === n - 1 ? slope[n - 2] : slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2,
  );
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i], b = m[i + 1] / slope[i], s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3, p = points[i], q = points[i + 1];
    d += ` C${p.x + h},${p.y + m[i] * h} ${q.x - h},${q.y - m[i + 1] * h} ${q.x},${q.y}`;
  }
  return d;
}

// Eased 0→1 progress that replays whenever `trigger` changes (e.g. fresh data).
function useGrow(trigger: unknown, duration = 1100) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(1);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setProgress(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    setProgress(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [trigger, duration]);
  return progress;
}

const lineSeries = [
  { key: "new_users", label: "Người dùng mới", className: "series-a" },
  { key: "ai_requests", label: "Cuộc trò chuyện đã lưu", className: "series-b" },
] as const;

function UsageChart({ series }: { series: Dashboard["series"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 250, left = 48, right = 20, top = 14, bottom = 36;
  const step = niceStep(Math.max(1, ...series.flatMap((d) => [d.new_users, d.ai_requests])) / 4);
  const max = step * 4;
  const x = (i: number) => left + (i * (W - left - right)) / Math.max(1, series.length - 1);
  const y = (v: number) => H - bottom - (v / max) * (H - top - bottom);
  const grow = useGrow(series);
  // Data marks rise from the baseline; gridlines and labels stay fixed.
  const yData = (v: number) => y(v * grow);
  const label = (day: string) => day.slice(8, 10) + "/" + day.slice(5, 7);
  return (
    <div className="admin-line-chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Biểu đồ người dùng mới và cuộc trò chuyện đã lưu trong 7 ngày qua">
        <defs>
          {lineSeries.map((s) => (
            <linearGradient key={s.key} id={`admin-fill-${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" className={`${s.className}-stop`} stopOpacity="0.22" />
              <stop offset="100%" className={`${s.className}-stop`} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i} className="admin-grid">
            <line x1={left} x2={W - right} y1={y(step * i)} y2={y(step * i)} />
            <text x={left - 10} y={y(step * i) + 4} textAnchor="end">
              {numberFormat.format(step * i)}
            </text>
          </g>
        ))}
        {series.map((d, i) => (
          <text key={d.day} className="admin-axis-label" x={x(i)} y={H - 8} textAnchor="middle">
            {label(d.day)}
          </text>
        ))}
        {hover !== null && <line className="admin-crosshair" x1={x(hover)} x2={x(hover)} y1={top} y2={H - bottom} />}
        {[...lineSeries].reverse().map((s) => {
          const points = series.map((d, i) => ({ x: x(i), y: yData(d[s.key]) }));
          const path = smoothPath(points);
          return (
            <g key={s.key} className={s.className}>
              <path d={`${path} L${x(series.length - 1)},${H - bottom} L${x(0)},${H - bottom} Z`} fill={`url(#admin-fill-${s.key})`} />
              <path d={path} className="admin-line" />
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={hover === i ? 6 : 4.5} className="admin-dot" />
              ))}
            </g>
          );
        })}
        {series.map((d, i) => (
          <rect
            key={d.day}
            className="admin-hit"
            x={x(i) - (W - left - right) / (2 * Math.max(1, series.length - 1))}
            y={top}
            width={(W - left - right) / Math.max(1, series.length - 1)}
            height={H - top - bottom}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            tabIndex={0}
            aria-label={`${label(d.day)}: ${d.new_users} người dùng mới, ${d.ai_requests} lượt dùng AI`}
          />
        ))}
      </svg>
      {hover !== null && (
        <div className="admin-tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(Math.min(...lineSeries.map((s) => yData(series[hover][s.key]))) / H) * 100}%` }}>
          <strong>{label(series[hover].day)}</strong>
          {lineSeries.map((s) => (
            <span key={s.key}>
              <i className={`admin-swatch ${s.className}`} />
              {s.label}
              <b>{numberFormat.format(series[hover][s.key])}</b>
            </span>
          ))}
        </div>
      )}
      <table className="sr-only">
        <caption>Số liệu 7 ngày qua</caption>
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Người dùng mới</th>
            <th>Lượt dùng AI</th>
          </tr>
        </thead>
        <tbody>
          {series.map((d) => (
            <tr key={d.day}>
              <td>{label(d.day)}</td>
              <td>{d.new_users}</td>
              <td>{d.ai_requests}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountDonut({ accounts }: { accounts: Dashboard["accounts"] }) {
  const [active, setActive] = useState<number | null>(null);
  const slices = [
    { label: "Sinh viên thường", value: accounts.normal, className: "series-a" },
    { label: "Sinh viên VIP", value: accounts.vip, className: "series-b" },
    { label: "Chuyên gia", value: accounts.expert, className: "series-c" },
    { label: "Admin", value: accounts.admin, className: "series-d" },
  ];
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const grow = useGrow(accounts);
  const r = 74, c = 2 * Math.PI * r, gap = slices.filter((s) => s.value).length > 1 ? 3 : 0;
  let offset = 0;
  const focus = active === null ? null : slices[active];
  return (
    <div className="admin-donut">
      <div className="admin-donut-figure" onMouseLeave={() => setActive(null)}>
        <svg viewBox="0 0 200 200" role="img" aria-label="Cơ cấu tài khoản">
          <circle cx="100" cy="100" r={r} className="admin-donut-track" />
          {total > 0 &&
            slices.map((s, i) => {
              // Slices sweep around the ring together as `grow` goes 0→1.
              const length = (s.value / total) * c * grow;
              const segment = (
                <circle
                  key={s.label}
                  cx="100"
                  cy="100"
                  r={r}
                  className={`admin-donut-slice ${s.className} ${active === i ? "active" : ""}`}
                  strokeDasharray={`${Math.max(0, length - gap)} ${c}`}
                  strokeDashoffset={-offset}
                  onMouseEnter={() => setActive(i)}
                />
              );
              offset += length;
              return s.value ? segment : null;
            })}
        </svg>
        <div className="admin-donut-center">
          <strong>{numberFormat.format(Math.round((focus ? focus.value : total) * grow))}</strong>
          <span>{focus ? focus.label : "tài khoản"}</span>
        </div>
      </div>
      <ul className="admin-legend">
        {slices.map((s, i) => (
          <li key={s.label} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} className={active === i ? "active" : ""}>
            <i className={`admin-swatch ${s.className}`} />
            <span>{s.label}</span>
            <small>{numberFormat.format(Math.round(s.value * grow))}</small>
            <b>{total ? Math.round((s.value / total) * 100 * grow) : 0}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function bookingBadge(b: Dashboard["upcoming_bookings"][number]) {
  const soon = b.status === "confirmed" && new Date(b.starts_at).getTime() - Date.now() < 3 * 3600 * 1000;
  if (soon) return <span className="admin-pill soon">Sắp diễn ra</span>;
  return b.status === "confirmed" ? <span className="admin-pill ok">Đã xác nhận</span> : <span className="admin-pill pending">Chờ xác nhận</span>;
}

function AdminHub({kind,user}:{kind:"experts"|"bookings"|"content";user:User}) {
  const [tab,setTab]=useState("");
  const choices=kind==="experts"?[["profiles","Hồ sơ chuyên gia"],["accounts","Tài khoản chuyên gia"]]:kind==="bookings"?[["consultations","Lịch tư vấn"],["hospital","Book thăm khám"]]:[["music","Nhạc thư giãn"],["support","Thông tin hỗ trợ"],["hospital","Cơ sở y tế và thăm khám"]];
  const active=tab||choices[0][0];
  return <><div className="ref-hub-tabs">{choices.map(([value,label])=><button key={value} aria-pressed={active===value} onClick={()=>setTab(value)}>{label}</button>)}</div>{kind==="experts"?(active==="accounts"?<StaffAccounts currentUserId={user.id} />:<AdminExperts />):kind==="bookings"?(active==="hospital"?<AdminHospitalVisits />:<AdminBookings />):active==="music"?<AdminMusic />:active==="support"?<AdminSupport />:<AdminHospitalVisits />}</>;
}

export default function AdminShell({user,logout,theme,toggleTheme}:{user:User;logout:()=>void;theme:string;toggleTheme:()=>void}) {
  const [section,setSection]=useState<AdminSection>("overview"),[data,setData]=useState<Dashboard|null>(null),[error,setError]=useState("");
  const [alertsOpen,setAlertsOpen]=useState(false);
  useEffect(()=>{const abort=new AbortController();api<Dashboard>("/admin/dashboard",{signal:abort.signal}).then(result=>{setData(result);setError("");}).catch(err=>{if(!abort.signal.aborted)setError(err.message);});return()=>abort.abort();},[section]);
  function go(next:AdminTarget){setSection(next);setAlertsOpen(false);}
  const pending=(data?.pending_bookings||0)+(data?.management?.finance.refund_requests||0);
  return <PortalShell reference user={user} roleLabel="Quản trị viên" sections={sections} section={section} onSection={go} alerts={pending} alertLabel={`${pending} yêu cầu cần xử lý`} onAlerts={()=>setAlertsOpen(true)} logout={logout} theme={theme} toggleTheme={toggleTheme}>
    {section==="overview"?<ReferenceDashboard user={user} data={data} error={error} go={go} UsageChart={UsageChart} />:section==="users"?<AdminUsers />:section==="experts"||section==="bookings"||section==="content"?<AdminHub key={section} kind={section} user={user} />:section==="conversations"?<ConversationManagement />:section==="assessments"?<AssessmentManagement />:section==="packages"?<PackageManagement go={go} />:section==="payments"?<PaymentManagement />:section==="reports"?<ReportsManagement />:<SystemManagement />}
    {alertsOpen&&<Modal title="Thông báo quản trị" close={()=>setAlertsOpen(false)}><div className="ref-notifications"><button onClick={()=>go("bookings")}>{data?.pending_bookings||0} lịch tư vấn chờ xác nhận</button><button onClick={()=>go("payments")}>{data?.management?.finance.refund_requests||0} yêu cầu hoàn tiền mô phỏng</button><button onClick={()=>go("system")}>Kiểm tra cấu hình hệ thống</button><button onClick={()=>go("content")}>Quản lý nội dung và cơ sở y tế</button></div></Modal>}
  </PortalShell>;
}
