"use client";

import VoiceDemo from "./voice-demo";
import ExpertBooking from "./dat-lich-chuyen-gia";
import AvailableSlots from "./khung-gio-ranh";
import {ConsultationPanel} from "../shared/phien-tu-van";
import HospitalVisits from "./book-tham-kham";
import ExpertDetails, { ExpertStars, expertDisplayName } from "./danh-gia-chuyen-gia";
import { VOICE_TEST_MODE } from "@/lib/voice-test-mode";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BookOpen,
  CalendarDays,
  Crown,
  Check,
  CheckCheck,
  ChevronRight,
  Clock,
  Headphones,
  Heart,
  HelpCircle,
  Home,
  Leaf,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircle,
  Mic,
  MicOff,
  Moon,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  Trash2,
  UserRound,
  Users,
  Volume2,
  X,
  Phone,
  ExternalLink,
  Pencil,
  Wind,
  LoaderCircle,
  ClipboardList,
  ClipboardCheck,
  LayoutDashboard,
  MapPin,
  CircleX,
} from "lucide-react";
import { api, chatStream, PLAN_USAGE_EVENT, type Message, type User } from "@/lib/api";
import { clearMoodContext, setMoodContext, takeMoodContext } from "@/lib/mood-context";
import { setAssessmentContext, takeAssessmentContext } from "@/lib/assessment-context";
import { musicCategoryIcons, musicCredit } from "@/lib/music-categories";
import { roleDestination } from "@/lib/role-navigation";
import { usePlanCountdown } from "@/lib/use-plan-countdown";
import { loadSession } from "@/lib/session";
import AuthEntry from "../shared/dang-nhap";
import { BrandWordmark } from "../shared/thuong-hieu";
import BreathingGuide from "./bai-tho";
import SupportDialog from "../shared/ho-tro-khan-cap";
import AdminShell from "../admin/khung-quan-tri";
import ExpertShell from "../expert/khung-chuyen-gia";
import { PlanPage, PlanBenefitsDialog, UsageCard, VipGate, vipRoutes, type PlanStatus } from "./goi-thanh-vien";

const navigation = [
  { href: "/", label: "Không gian của bạn", icon: Home },
  { href: "/talk", label: "Trò chuyện cùng AI", icon: MessageCircle },
  { href: "/voice", label: "Tâm sự bằng giọng nói", icon: AudioLines },
  { href: "/assessment", label: "Test tâm lý", icon: ClipboardList },
  { href: "/history", label: "Lịch sử trò chuyện", icon: Clock },
  { href: "/experts", label: "Kết nối chuyên gia", icon: Users },
  { href: "/book-visit", label: "Book thăm khám", icon: CalendarDays },
  { href: "/bookings", label: "Lịch hẹn của bạn", icon: CalendarDays },
  { href: "/healing", label: "Góc bình yên", icon: Headphones },
];
const emotions = [
  { face: "☀", label: "Vui vẻ", color: "#f8e7a1" },
  { face: "◡", label: "Bình yên", color: "#d9e9d1" },
  { face: "☁", label: "Bình thường", color: "#e5e8ed" },
  { face: "☂", label: "Hơi buồn", color: "#d8e4f0" },
  { face: "〰", label: "Căng thẳng", color: "#eddded" },
];
const statusNames: Record<string, string> = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  cancelled: "Đã hủy",
  rejected: "Đã từ chối",
  completed: "Đã hoàn thành",
};

function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success";
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "success" ? <Check size={17} /> : <ShieldCheck size={17} />}
      <span>{children}</span>
    </div>
  );
}
function Empty({
  icon: Icon = BookOpen,
  title,
  children,
  action,
}: {
  icon?: typeof BookOpen;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={30} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="section-title">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  );
}
function RequireLogin() {
  return (
    <Empty icon={LockKeyhole} title="Một không gian dành riêng cho bạn">
      Đăng nhập để sử dụng chức năng này và chủ động quản lý dữ liệu cá nhân.
      <Link className="button primary" href="/login">
        Đăng nhập / Đăng ký <ArrowRight size={16} />
      </Link>
    </Empty>
  );
}
function CalmArt() {
  return (
    <div className="calm-art" aria-hidden="true">
      <div className="art-orbit orbit-one" />
      <div className="art-orbit orbit-two" />
      <div className="art-sun" />
      <div className="art-hill hill-back" />
      <div className="art-hill hill-front" />
      <div className="art-water" />
      <svg className="art-plant" viewBox="0 0 160 240" fill="none">
        <path
          d="M82 237C74 174 82 114 101 41"
          stroke="#536f54"
          strokeWidth="3"
        />
        <path
          d="M86 177C34 180 22 143 29 116C64 122 87 146 86 177Z"
          fill="#76977a"
        />
        <path
          d="M84 149C128 150 153 117 148 89C109 92 88 120 84 149Z"
          fill="#9ab39b"
        />
        <path
          d="M94 102C60 103 50 71 59 46C86 55 99 75 94 102Z"
          fill="#6c8c70"
        />
        <path
          d="M100 66C129 61 142 31 131 10C108 20 95 44 100 66Z"
          fill="#a3b79a"
        />
        <path
          d="M80 217C46 215 34 195 39 170C64 177 78 195 80 217Z"
          fill="#afc0a1"
        />
      </svg>
      <div className="floating-note note-top">
        <span className="note-symbol">✧</span> Cứ là chính bạn thôi.
      </div>
      <div className="floating-note note-bottom">
        <span className="note-heart">
          <Heart size={16} />
        </span>
        <div>
          Mọi cảm xúc đều đáng được lắng nghe.
          <small>Mình ở đây, cùng bạn.</small>
        </div>
      </div>
      <span className="art-star star-one">✧</span>
      <span className="art-star star-two">✧</span>
    </div>
  );
}

export default function Workspace() {
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(false),
    [authError, setAuthError] = useState(false),
    [authAttempt, setAuthAttempt] = useState(0),
    [plan, setPlan] = useState<PlanStatus | null>(null),
    [benefitsOpen, setBenefitsOpen] = useState(false),
    [menu, setMenu] = useState(false),
    [support, setSupport] = useState(false),
    [theme, setTheme] = useState("light");
  const authRevision = useRef(0);
  useEffect(() => {
    const abort = new AbortController();
    const revision = ++authRevision.current;
    setAuthReady(false);
    setAuthError(false);
    loadSession(abort.signal)
      .then((u) => {
        if (abort.signal.aborted || revision !== authRevision.current) return;
        setUser(u);
        if (u) setTheme(u.settings.theme || "light");
      })
      .catch(() => {
        if (!abort.signal.aborted && revision === authRevision.current) setAuthError(true);
      })
      .finally(() => {
        if (!abort.signal.aborted && revision === authRevision.current) setAuthReady(true);
      });
    return () => abort.abort();
  }, [authAttempt]);
  useEffect(() => {
    const t = localStorage.getItem("tuvantamly-theme");
    if (t) setTheme(t);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("tuvantamly-theme", theme);
  }, [theme]);
  useEffect(() => setMenu(false), [path]);
  async function refreshPlan() {
    const status = await api<PlanStatus>("/membership/status"); setPlan(status);
  }
  useEffect(() => {
    setPlan(null);
    if (!user || user.role !== "student") return;
    const abort = new AbortController();
    api<PlanStatus>("/membership/status", {signal: abort.signal}).then(setPlan).catch(() => {});
    const onUsage = () => { api<PlanStatus>("/membership/status").then(setPlan).catch(() => {}); };
    window.addEventListener(PLAN_USAGE_EVENT, onUsage);
    return () => { abort.abort(); window.removeEventListener(PLAN_USAGE_EVENT, onUsage); };
  }, [user?.id, user?.role, path]);
  useEffect(() => {
    if (!user || user.role !== "student" || !["/talk", "/voice"].includes(path) || (VOICE_TEST_MODE && path === "/voice")) return;
    let disposed = false, sending = false;
    const clientId = crypto.randomUUID();
    async function beat() {
      if (disposed || sending) return;
      sending = true;
      try { const result = await api<PlanStatus>("/membership/heartbeat", { method: "POST", body: JSON.stringify({ client_id: clientId, active: document.visibilityState === "visible" && document.hasFocus() }) }); if (!disposed) setPlan(result); } catch {} finally { sending = false; }
    }
    void beat(); const timer = setInterval(beat, 10000);
    document.addEventListener("visibilitychange", beat); window.addEventListener("focus", beat); window.addEventListener("blur", beat);
    return () => { disposed = true; clearInterval(timer); document.removeEventListener("visibilitychange", beat); window.removeEventListener("focus", beat); window.removeEventListener("blur", beat); void api("/membership/heartbeat", {method: "POST", keepalive: true, body: JSON.stringify({active: false, client_id: clientId})}).catch(() => {}); };
  }, [user?.id, user?.role, path]);
  const destination = authReady && !authError ? roleDestination(user?.role, path) : null;
  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);
  const displayRemainingSeconds = usePlanCountdown(plan, !!user && user.role === "student" && ["/talk", "/voice"].includes(path) && !(VOICE_TEST_MODE && path === "/voice"));
  const vip = user?.role === "admin" || (plan ? plan.tier === "vip" : user?.membership_tier === "vip");
  function onUser(u: User | null) {
    ++authRevision.current;
    setAuthReady(true);
    setAuthError(false);
    if (user?.id !== u?.id) clearMoodContext();
    setUser(u);
    if (u) setTheme(u.settings.theme || "light");
  }
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    onUser(null);
    router.push("/");
  }
  if (
    ["/login", "/register", "/forgot-password", "/reset-password"].includes(
      path,
    )
  ) {
    return (
      <>
        <AuthEntry
          key={path}
          path={path}
          onUser={onUser}
          onSupport={() => setSupport(true)}
        />
        {support && <SupportModal close={() => setSupport(false)} />}
      </>
    );
  }
  if (destination) {
    return <div className="admin-boot" role="status"><LoaderCircle className="spin" /> Đang mở cổng đúng vai trò của bạn…</div>;
  }
  if ((path === "/admin" || path === "/expert") && !authReady) {
    // Keep the student shell from flashing while a staff session loads.
    return (
      <div className="admin-boot" role="status">
        <LoaderCircle className="spin" /> {path === "/admin" ? "Đang mở trang quản trị…" : "Đang mở trang chuyên gia…"}
      </div>
    );
  }
  if (path === "/expert" && !authError && user?.role === "expert") {
    return (
      <ExpertShell
        user={user}
        logout={logout}
        theme={theme}
        toggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
      />
    );
  }
  if (path === "/admin" && authReady && !authError && user?.role === "admin") {
    return (
      <AdminShell
        user={user}
        logout={logout}
        theme={theme}
        toggleTheme={() => setTheme(theme === "light" ? "dark" : "light")}
      />
    );
  }
  return (
    <div className={`app-shell interior-shell ${path === "/talk" || path === "/voice" ? "conversation-shell" : ""}`}>
      {benefitsOpen && <PlanBenefitsDialog vip={vip} close={() => setBenefitsOpen(false)} />}
      {path === "/" && <div className="home-frame-controls"><button className="icon-button interior-menu-toggle" onClick={() => setMenu(!menu)} aria-label={menu ? "Đóng menu" : "Mở menu"} aria-expanded={menu} aria-controls="workspace-sidebar"><Menu size={22} /></button></div>}
      <a className="skip-link" href="#main-content">
        Đến nội dung chính
      </a>
      {menu && (
        <div className="sidebar-backdrop" onClick={() => setMenu(false)} />
      )}
      <aside id="workspace-sidebar" className={`sidebar ${menu ? "open" : ""}`}>
        <div className="sidebar-brand-row"><BrandWordmark className="brand" /></div>
        {user && <UsageCard plan={plan} vip={vip} seconds={displayRemainingSeconds} />}
        <div className="nav-caption">KHÔNG GIAN ĐỒNG HÀNH</div>
        <nav aria-label="Điều hướng chính">
          {navigation.map((n) => (
            <Link
              href={n.href}
              key={n.href}
              className={`nav-item ${path === n.href ? "active" : ""}`}
            >
              <n.icon size={19} />
              <span>{n.label}</span>{user && !vip && vipRoutes.includes(n.href) && <LockKeyhole size={13} className="plan-nav-lock" />}
              
            </Link>
          ))}
        </nav>
        <Link
          href="/settings"
          className={`nav-item ${path === "/settings" ? "active" : ""}`}
        >
          <Settings size={19} />
          Cài đặt và quyền riêng tư
        </Link>
        {user?.role === "admin" && (
          <Link href="/admin" className="nav-item">
            <LayoutDashboard size={19} />
            Quản trị hệ thống
          </Link>
        )}
        <button className="nav-item help-nav" onClick={() => setSupport(true)}>
          <HelpCircle size={19} />
          Bạn cần hỗ trợ?
        </button>
        {!user && <Link className="button outline sidebar-login" href="/login">Đăng nhập <ArrowRight size={16} /></Link>}
        {user && <div className="sidebar-plan"><span className="plan-tier-label">{vip && <Crown size={19} className="vip-gold-crown" aria-hidden="true" />}{vip ? "Thành viên VIP" : "Gói thường"}</span><Link href="/plans" className="button primary small plan-manage-button">{vip ? "Quản lý gói" : "Nâng cấp gói"}</Link><button className="text-link" onClick={() => setBenefitsOpen(true)}>Quyền lợi gói</button></div>}
        {user && <div className="sidebar-profile"><Link href="/settings"><span className={`profile-avatar-wrap ${vip ? "is-vip" : ""}`}><span className="avatar">{user.name.charAt(0).toUpperCase()}</span>{vip && <span className="profile-vip-crown" role="img" aria-label="Thành viên VIP" title="Thành viên VIP"><Crown size={13} aria-hidden="true" /></span>}</span><span><strong>{user.name}</strong><small>{vip ? "Thành viên VIP" : "Gói thường"} · Hồ sơ</small></span></Link><button className="icon-button" onClick={logout} aria-label="Đăng xuất"><LogOut size={18} /></button></div>}
        <div className="sidebar-bottom">
          <span className="tiny-dot" /> Không gian riêng tư của bạn{" "}
          <LockKeyhole size={12} />
        </div>
      </aside>
      <div className="main-shell">
        {path !== "/" && <div className="chat-frame-controls"><button className="icon-button chat-theme-toggle" aria-label="Đổi giao diện sáng tối" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button>
        <button className="icon-button interior-menu-toggle" onClick={() => setMenu(!menu)} aria-label={menu ? "Đóng menu" : "Mở menu"} aria-expanded={menu} aria-controls="workspace-sidebar"><Menu size={22} /></button>
        </div>}
          {!["/", "/talk", "/voice"].includes(path) && (
            <div className="standard-page-header">
              <div className="chat-identity">
                <span className="laclac-header-logo"><img src="/images/laclac/header-avatar.png" alt="Logo Lạc Lạc" width={56} height={56} /></span>
                <div><h2>Lạc Lạc</h2><p>Một người bạn, sẵn sàng lắng nghe</p></div>
              </div>
              <span className="standard-page-label">{navigation.find((item) => item.href === path)?.label || ({ "/assessment/result": "Test tâm lý", "/plans": "Quản lý gói", "/settings": "Cài đặt và quyền riêng tư", "/admin": "Quản trị hệ thống", "/expert": "Lịch hẹn chuyên gia", "/privacy": "Quyền riêng tư" } as Record<string, string>)[path]}</span>
            </div>
          )}
        <main
          id="main-content"
          className={`main-content ${path === "/talk" ? "chat-main" : path === "/voice" ? "voice-main" : path !== "/" ? "standard-main" : ""}`}
        >
          {path === "/" ? (
            <HomePage user={user} />
          ) : path === "/login" ||
            path === "/register" ||
            path === "/forgot-password" ||
            path === "/reset-password" ? (
            <AuthEntry
              path={path}
              onUser={onUser}
              onSupport={() => setSupport(true)}
            />
          ) : !authReady ? (
            <div className="loading">
              <LoaderCircle className="spin" /> Đang mở không gian của bạn…
            </div>
          ) : authError ? (
            <Empty icon={ShieldCheck} title="Chưa kiểm tra được phiên đăng nhập">
              Kết nối đến máy chủ đang gián đoạn. Bạn hãy thử kết nối lại.
              <button className="button primary" onClick={() => setAuthAttempt((attempt) => attempt + 1)}>Thử kết nối lại</button>
            </Empty>
          ) : path === "/plans" ? (
            <PlanPage user={user} plan={plan} refresh={async () => { await refreshPlan(); onUser(await api<User>("/auth/me")); }} />
          ) : user && !vip && vipRoutes.includes(path) ? (
            <VipGate />
          ) : path === "/talk" ? (
            <ChatPage
              key={user?.id}
              exhausted={!!plan?.exhausted}
              user={user}
              onSupport={() => setSupport(true)}
            />
          ) : path === "/voice" ? (
            <VoicePage user={user} exhausted={!!plan?.exhausted} onSupport={() => setSupport(true)} />
          ) : path === "/assessment" || path === "/assessment/result" ? (
            <AssessmentPage user={user} onSupport={() => setSupport(true)} />
          ) : path === "/history" ? (
            <HistoryPage user={user} />
          ) : path === "/experts" ? (
            <ExpertsPage user={user} />
          ) : path === "/book-visit" ? (
            <HospitalVisits user={user} />
          ) : path === "/bookings" ? (
            <BookingsPage user={user} />
          ) : path === "/healing" ? (
            <HealingPage />
          ) : path === "/settings" ? (
            <SettingsPage user={user ? { ...user, membership_tier: vip ? "vip" : "normal" } : null} onUser={onUser} logout={logout} />
          ) : path === "/admin" ? (
            // Admins are routed to AdminShell above; anyone else lands here.
            user ? (
              <Empty icon={LockKeyhole} title="Khu vực dành cho quản trị viên">
                Tài khoản của bạn không có quyền truy cập. Vai trò quản trị do Admin
                hoặc công cụ vận hành tại backend cấp.
              </Empty>
            ) : (
              <RequireLogin />
            )
          ) : path === "/expert" ? (
            <Empty icon={LockKeyhole} title="Khu vực dành cho chuyên gia">
              Tài khoản chuyên gia do Admin tạo và gắn với hồ sơ chuyên gia.
            </Empty>
          ) : path === "/privacy" ? (
            <PrivacyPage />
          ) : (
            <Empty title="Trang này chưa có">
              Bạn có thể quay về không gian chính.
              <Link className="button primary" href="/">
                Về trang chủ
              </Link>
            </Empty>
          )}
        </main>
        <footer className="footer">
          <span>
            <Leaf size={13} /> Tư vấn tâm lý · Đồng hành cùng cảm xúc của bạn
          </span>
          <span>
            AI hỗ trợ tinh thần ban đầu, không thay thế chuyên gia.{" "}
            <Link href="/privacy">Quyền riêng tư</Link>
          </span>
        </footer>
      </div>
      {support && <SupportModal close={() => setSupport(false)} />}
    </div>
  );
}

function HomePage({ user }: { user: User | null }) {
  const [mood, setMood] = useState(""),
    [breathing, setBreathing] = useState(false);
  return (
    <div className="dashboard">
      {breathing && <BreathingGuide onStop={() => setBreathing(false)} />}
      <div className="welcome-row">
        <div>
          <span className="eyebrow">
            <span className="tiny-dot" /> MỘT CHÚT BÌNH YÊN, MỖI NGÀY
          </span>
          <p>
            <span className="welcome-name">Chào {user?.name || "bạn"},</span>
            <span className="welcome-second-line"><em className="welcome-message">thật vui vì bạn ở đây</em><Sun className="welcome-sun" size={32} strokeWidth={1.7} aria-hidden="true" /></span>
          </p>
        </div>
        <span className="welcome-caption">
          <span>Một nơi để lắng nghe.</span>
          <span>Một nơi để là chính mình.</span>
        </span>
      </div>
      <section className="your-space-image-hero" aria-labelledby="your-space-title">
        <h1 id="your-space-title" className="sr-only">Bạn không cần phải ổn mọi lúc.</h1>
        <img src="/images/your-space-banner.png" alt="Không gian ấm áp bên cửa sổ và cây xanh. Ngày hôm nay của bạn thế nào? Dù là niềm vui nhỏ hay những điều khó nói, Lạc Lạc luôn sẵn sàng lắng nghe. Bạn lựa chọn điều mình chia sẻ và lưu lại." />
        <Link href="/talk" className="your-space-hotspot your-space-share" aria-label="Bắt đầu chia sẻ"><span>Bắt đầu chia sẻ</span><span className="your-space-share-arrow" aria-hidden="true"><ArrowRight size={21} /></span></Link>
        <Link href="/voice" className="your-space-hotspot your-space-voice" aria-label="Mình muốn nói"><span className="sr-only">Mình muốn nói</span></Link>
      </section>
      <section className="mood-section">
        <div className="mood-heading">
          <div className="circle-icon">
            <Heart size={21} />
          </div>
          <div>
            <h2>Hôm nay, bạn cảm thấy thế nào?</h2>
            <p>Không có cảm xúc đúng hay sai. Mọi cảm xúc đều có chỗ ở đây.</p>
          </div>
        </div>
        <div className="mood-options">
          {emotions.map((e) => (
            <button
              key={e.label}
              className={`mood-option ${mood === e.label ? "selected" : ""}`}
              onClick={() => setMood(e.label)}
              aria-pressed={mood === e.label}
            >
              <span className="mood-face" style={{ background: e.color }}>
                {e.face}
              </span>
              <span>{e.label}</span>
              {mood === e.label && <Check className="mood-check" size={12} />}
            </button>
          ))}
        </div>
        {mood && (
          <div className="mood-response">
            Cảm ơn bạn đã gọi tên cảm xúc. Lạc Lạc sẽ dựa vào cảm xúc bạn chọn để bắt đầu trò chuyện.{" "}
            <Link href="/talk" onClick={() => { setAssessmentContext(null); if (user?.role === "student") setMoodContext(user.id, mood); }}>
              Kể mình nghe thêm <ArrowRight size={13} />
            </Link>
          </div>
        )}
      </section>
      <section>
        <div className="section-heading">
          <div>
            <h2>Một chút chăm sóc, dành cho bạn</h2>
            <p>Bắt đầu từ điều bạn cần, theo nhịp độ của riêng mình.</p>
          </div>
          <span className="subtle-caption">NHỮNG BƯỚC NHỎ, THAY ĐỔI LỚN</span>
        </div>
        <div className="feature-grid">
          {[
            {
              href: "/talk",
              icon: MessageCircle,
              title: "Có người lắng nghe",
              description: "Gỡ rối những suy nghĩ, sẻ chia những điều khó nói.",
              tag: "TALK AI",
              color: "green",
              cta: "Bắt đầu trò chuyện",
            },
            {
              href: "/assessment",
              icon: ClipboardList,
              title: "Hiểu mình thêm chút",
              description: "Dành một khoảng lặng để nhìn lại cảm xúc của bạn.",
              tag: "ĐÁNH GIÁ BAN ĐẦU",
              color: "lavender",
              cta: "Khám phá bản thân",
            },
            {
              href: "/experts",
              icon: Users,
              title: "Bạn không đơn độc",
              description: "Tìm sự đồng hành từ những chuyên gia đã xác minh.",
              tag: "KẾT NỐI CHUYÊN GIA",
              color: "peach",
              cta: "Tìm người đồng hành",
            },
            {
              href: "/healing",
              icon: Headphones,
              title: "Một khoảng bình yên",
              description: "Thả lỏng tâm trí trong những giai điệu nhẹ nhàng.",
              tag: "GÓC THƯ GIÃN",
              color: "blue",
              cta: "Ghé góc bình yên",
            },
          ].map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className={`feature-card ${f.color}`}
            >
              <div className="feature-top">
                <span className="feature-icon">
                  <f.icon size={24} strokeWidth={1.6} />
                </span>
                <ArrowRight size={18} />
              </div>
              <span className="feature-tag">{f.tag}</span>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
              <span className="feature-cta">
                {f.cta}
                <ChevronRight size={14} />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <div className="home-bottom">
        <section
          className={`breathing-card ${breathing ? "breathing-active" : ""}`}
        >
          <div className="breath-orb">
            <Wind size={27} />
          </div>
          <div>
            <span className="eyebrow">KHOẢNG NGHỈ NHỎ</span>
            <h3>
              {breathing
                ? "Hít vào nhẹ… thở ra chậm…"
                : "Dừng một nhịp. Thở một hơi."}
            </h3>
            <p>
              {breathing
                ? "Thở theo nhịp thoải mái. Bạn có thể dừng bất cứ lúc nào."
                : "Cho mình một phút để trở về với hiện tại."}
            </p>
          </div>
          <button
            className="round-button"
            onClick={() => setBreathing(!breathing)}
            aria-label={breathing ? "Dừng thư giãn" : "Bắt đầu thư giãn"}
          >
            {breathing ? <Pause size={17} /> : <Play size={17} />}
          </button>
        </section>
        <section className="quote-card">
          <span className="quote-mark">“</span>
          <div>
            <p>
              Bạn không cần đi nhanh.
              <br />
              Chỉ cần đừng quên dịu dàng với chính mình.
            </p>
            <span>MỘT LỜI NHẮN TỪ LẠC LẠC</span>
          </div>
          <Sparkles size={23} />
        </section>
      </div>
      <div className="care-note">
        <ShieldCheck size={17} />
        <p>
          Không gian này có AI đồng hành. Khi cần hỗ trợ chuyên sâu, hãy tìm đến
          chuyên gia hoặc người bạn tin cậy.
        </p>
      </div>
    </div>
  );
}

function ChatPage({
  user,
  onSupport,
  exhausted = false,
}: {
  user: User | null;
  exhausted?: boolean;
  onSupport: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [save, setSave] = useState(false),
    [id, setId] = useState<string | null>(null),
    [risk, setRisk] = useState(false);
  const controller = useRef<AbortController | null>(null),
    bottom = useRef<HTMLDivElement>(null);
  // Save by default whenever the account may keep history, so every chat shows up in "Lịch sử trò chuyện".
  const canSave = !!user && (user.membership_tier === "vip" || user.role === "admin") && !!user.settings.save_history;
  useEffect(() => setSave(canSave), [canSave]);
  useEffect(() => {
    if (!user) return;
    if (new URLSearchParams(location.search).has("conversation")) {
      clearMoodContext();
      return;
    }
    const assessment = takeAssessmentContext();
    if (assessment) { clearMoodContext(); setInput(assessment); return; }
    const opening = takeMoodContext(user.id);
    if (opening) setMessages(opening);
  }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    const conversation = new URLSearchParams(location.search).get(
      "conversation",
    );
    if (conversation)
      api(`/history/${conversation}`)
        .then((r) => {
          setMessages(r.messages);
          setId(r.id);
          setSave(!!user.settings.save_history);
        })
        .catch((e) => setError(e.message));
  }, [user]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);
  useEffect(() => () => controller.current?.abort(), []);
  if (!user) return <RequireLogin />;
  async function send(e?: FormEvent, override?: string) {
    e?.preventDefault();
    const content = (override || input).trim();
    if (!content || busy || exhausted) return;
    setError("");
    const next: Message[] = [...messages, { role: "user", content }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    controller.current = new AbortController();
    try {
      await chatStream(next, save, id, controller.current.signal, (event) => {
        if (event.conversation_id) setId(event.conversation_id);
        if (event.risk) setRisk(true);
        if (event.delta)
          setMessages((current) => {
            const copy = [...current];
            copy[copy.length - 1] = {
              role: "assistant",
              content: copy[copy.length - 1].content + event.delta,
            };
            return copy;
          });
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
      setMessages((current) => current.filter((m) => m.content));
    } finally {
      setBusy(false);
    }
  }
  function fresh() {
    controller.current?.abort();
    clearMoodContext();
    setInput("");
    setMessages([]);
    setId(null);
    setSave(canSave);
    setRisk(false);
    setError("");
    setBusy(false);
    history.replaceState(null, "", "/talk");
  }
  return (
    <div className="chat-page">
      <div className="chat-toolbar">
        <div className="chat-identity">
          <span className="laclac-header-logo">
            <img src="/images/laclac/header-avatar.png" alt="Logo Lạc Lạc" width={56} height={56} />
          </span>
          <div>
            <h2>
              Lạc Lạc
            </h2>
            <p>Một người bạn, sẵn sàng lắng nghe</p>
          </div>
        </div>
        <button className="button outline small" onClick={fresh}>
          <Plus size={16} />
          Cuộc trò chuyện mới
        </button>
      </div>
      <div className="chat-notice">
        <LockKeyhole size={13} />
        {save
          ? "Cuộc trò chuyện này sẽ được lưu trong tài khoản của bạn."
          : "Không lưu lịch sử · Nội dung chỉ giữ trong phiên đang mở."}
        <label className="inline-check">
          <input
            type="checkbox"
            checked={save}
            disabled={!canSave || busy}
            onChange={(e) => setSave(e.target.checked)}
          />
          Lưu cuộc trò chuyện
        </label>
        {!user.settings.save_history && <Link href="/settings">Cài đặt</Link>}
      </div>
      <div className="chat-scroll">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <div className="laclac-greeting">
              <div className="laclac-chat-stage">
                <img src="/images/laclac/chat-transparent.png" alt="Lạc Lạc vẫy tay chào bạn" className="laclac-chat" />
              </div>
              <div className="greeting-bubble"><span className="eyebrow">LẠC LẠC LUÔN Ở ĐÂY</span><h1><span>Chào bạn,</span> <em>mình đang lắng nghe.</em></h1><p>Cứ chia sẻ điều bạn đang nghĩ, hoặc bắt đầu bằng một cảm xúc nhỏ hôm nay. Mọi điều bạn chia sẻ đều được tôn trọng.</p><Link href="/assessment" className="text-link">Test tâm lý <ArrowRight size={15} /></Link></div>
            </div>
            <div className="prompt-grid">
              {[
                "Dạo này mình thấy áp lực học tập",
                "Mình muốn hiểu cảm xúc của mình hơn",
                "Hôm nay mình có một chuyện vui",
                "Mình chỉ muốn có người lắng nghe",
              ].map((p, i) => (
                <button key={p} onClick={() => send(undefined, p)}>
                  <span className={`prompt-card-icon prompt-card-icon-${i}`} aria-hidden="true">{i === 0 ? <BookOpen size={21} /> : i === 1 ? <Heart size={21} /> : i === 2 ? <MessageCircle size={21} /> : <UserRound size={21} />}</span>
                  <span className="prompt-card-text">{p}</span>
                  <ArrowRight size={18} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages">
            {messages.map((m, i) => (
              <div key={i} className={`message ${m.role}`}>
                <span className="message-avatar">
                  {m.role === "assistant" ? (
                    <img src="/images/laclac/chat-transparent.png" alt="Lạc Lạc" className="laclac-avatar" />
                  ) : (
                    user.name.charAt(0)
                  )}
                </span>
                <div>
                  <span className="message-author">
                    {m.role === "assistant" ? "Lạc Lạc" : user.name}
                  </span>
                  <p>
                    {m.content || (
                      <span className="typing">
                        Đang lắng nghe và chuẩn bị phản hồi…
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottom} />
          </div>
        )}
        {risk && (
          <Notice>
            Mình khuyến khích bạn tìm người tin cậy ở gần nếu đang không an
            toàn.{" "}
            <button className="text-link" onClick={onSupport}>
              Mở hỗ trợ trực tiếp
            </button>
          </Notice>
        )}
      </div>
      <div className="composer-wrap">
        <div className="conversation-support"><button onClick={onSupport}><Headphones size={16} /> Cần hỗ trợ ngay</button></div>
        {error && <Notice tone="error">{error}</Notice>}
        {exhausted && <Notice>Đã hết hạn mức hôm nay. <Link href="/plans">Xem gói VIP</Link> hoặc quay lại ngày mai.</Notice>}
        <form className="composer compact-composer" onSubmit={send}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={4000}
            placeholder="Cứ viết ra những gì đang ở trong lòng bạn…"
            aria-label="Tin nhắn của bạn"
            rows={1}
          />
          <div className="composer-bottom">
            <Link href="/voice" className="composer-voice">
              <Mic size={17} />
              Chuyển sang giọng nói
            </Link>
            {busy ? (
              <button
                type="button"
                className="send-button"
                onClick={() => controller.current?.abort()}
                aria-label="Dừng phản hồi"
              >
                <Square size={17} />
              </button>
            ) : (
              <button
                type="submit"
                className="send-button"
                disabled={!input.trim() || exhausted}
                aria-label="Gửi tin nhắn"
              >
                <ArrowRight size={20} />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function VoicePage(props: { user: User | null; exhausted?: boolean; onSupport: () => void }) {
  return VOICE_TEST_MODE ? <VoiceDemo onSupport={props.onSupport} /> : <LiveVoicePage {...props} />;
}

function LiveVoicePage({
  user,
  onSupport,
  exhausted = false,
}: {
  user: User | null;
  exhausted?: boolean;
  onSupport: () => void;
}) {
  const [state, setState] = useState("Sẵn sàng lắng nghe"),
    [recording, setRecording] = useState(false),
    [messages, setMessages] = useState<Message[]>([]),
    [error, setError] = useState(""),
    [active, setActive] = useState(false),
    [showTranscript, setShowTranscript] = useState(false),
    [speaking, setSpeaking] = useState(false),
    [mouthFrame, setMouthFrame] = useState(0),
    [busy, setBusy] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    audio = useRef<HTMLAudioElement | null>(null),
    controller = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    callActive = useRef(false),
    generation = useRef(0),
    starting = useRef(false),
    objectUrl = useRef("");
  useEffect(() => {
    ["speaking-soft", "speaking-open", "listening"].forEach((name) => { const image = new Image(); image.src = `/images/laclac/${name}-transparent.png`; });
  }, []);
  useEffect(() => {
    if (!speaking) { setMouthFrame(0); return; }
    const animation = setInterval(() => setMouthFrame((frame) => (frame + 1) % 4), 180);
    return () => clearInterval(animation);
  }, [speaking]);
  useEffect(() => { if (exhausted && recording) end(); }, [exhausted, recording]);
  function stopPlayback() {
    setSpeaking(false);
    if (audio.current) {
      audio.current.onended = null;
      audio.current.onplaying = null;
      audio.current.onpause = null;
      audio.current.onerror = null;
      audio.current.pause();
      audio.current = null;
    }
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = "";
    }
  }
  function end() {
    ++generation.current;
    starting.current = false;
    callActive.current = false;
    setActive(false);
    controller.current?.abort();
    if (recorder.current?.state === "recording") {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    stream.current?.getTracks().forEach((t) => t.stop());
    stopPlayback();
    if (timer.current) clearTimeout(timer.current);
    setRecording(false);
    setBusy(false);
    setState("Cuộc trò chuyện đã kết thúc");
  }
  useEffect(
    () => () => {
      ++generation.current;
      starting.current = false;
      callActive.current = false;
      controller.current?.abort();
      stream.current?.getTracks().forEach((t) => t.stop());
      stopPlayback();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  if (!user) return <RequireLogin />;
  async function startRecording() {
    if (exhausted || starting.current || recorder.current?.state === "recording" || busy) return;
    starting.current = true;
    const turn = ++generation.current;
    callActive.current = true;
    setActive(true);
    setBusy(true);
    setState("Đang mở micro…");
    let acquired: MediaStream | null = null;
    setError("");
    stopPlayback();
    controller.current?.abort();
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Micro cần trình duyệt hỗ trợ và kết nối HTTPS hoặc localhost.",
        );
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      acquired = media;
      if (turn !== generation.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      if (typeof MediaRecorder === "undefined") throw new Error("Trình duyệt chưa hỗ trợ thu âm. Bạn hãy dùng Chrome, Edge hoặc Safari mới.");
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      if (!mime)
        throw new Error("Trình duyệt chưa hỗ trợ định dạng thu âm phù hợp.");
      const rec = new MediaRecorder(media, { mimeType: mime });
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        media.getTracks().forEach((t) => t.stop());
        if (timer.current) clearTimeout(timer.current);
        if (turn === generation.current && callActive.current) void process(new Blob(chunks, { type: rec.mimeType || mime }), turn);
      };
      rec.onerror = () => {
        if (turn !== generation.current) return;
        end();
        setError("Micro bị gián đoạn. Bạn hãy kiểm tra thiết bị và thử lại.");
      };
      rec.start();
      callActive.current = true;
      setActive(true);
      setRecording(true);
      setState("Mình đang nghe bạn…");
      timer.current = setTimeout(() => {
        if (rec.state === "recording") {
          rec.stop();
          setRecording(false);
        }
      }, 45000);
    } catch (e) {
      acquired?.getTracks().forEach((track) => track.stop());
      if (turn !== generation.current) return;
      callActive.current = false;
      setActive(false);
      setRecording(false);
      const problem = e as Error;
      setError(problem.name === "NotAllowedError" ? "Bạn chưa cho phép dùng micro. Hãy mở quyền micro cho trang này trong trình duyệt rồi thử lại." : problem.name === "NotFoundError" ? "Không tìm thấy micro. Bạn hãy kết nối hoặc bật thiết bị thu âm." : problem.name === "NotReadableError" ? "Chưa mở được micro. Thiết bị có thể đang được ứng dụng khác sử dụng." : problem.message);
      setState("Chưa mở được micro");
    } finally {
      if (turn === generation.current) { starting.current = false; setBusy(false); }
    }
  }
  async function process(blob: Blob, turn: number) {
    setRecording(false);
    setBusy(true);
    setState("Đang chuyển lời nói của bạn…");
    const abort = new AbortController();
    controller.current = abort;
    try {
      const form = new FormData();
      if (!blob.size) throw new Error("Chưa thu được âm thanh. Bạn hãy nói rồi chạm micro để gửi.");
      const extension = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
      form.append("file", blob, `recording.${extension}`);
      const transcription = await api("/voice/transcribe", {
        method: "POST",
        body: form,
        signal: abort.signal,
      });
      if (!callActive.current || turn !== generation.current || abort.signal.aborted) return;
      if (!transcription.text.trim())
        throw new Error("Mình chưa nghe rõ. Bạn thử nói lại nhé.");
      const next: Message[] = [
        ...messages,
        { role: "user", content: transcription.text },
      ];
      setMessages(next);
      setState("Đang chuẩn bị phản hồi…");
      let reply = "";
      await chatStream(next, false, null, abort.signal, (event) => {
        if (event.risk) onSupport();
        if (event.delta) reply += event.delta;
      });
      if (!callActive.current || turn !== generation.current || abort.signal.aborted) return;
      if (!reply.trim()) throw new Error("Chưa nhận được phản hồi. Bạn có thể thử nói lại.");
      setMessages([...next, { role: "assistant", content: reply }]);
      setState("Đang tạo giọng nói…");
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tuvantamly-Client": "web",
        },
        body: JSON.stringify({
          text: reply,
          voice: user?.settings.voice || "coral",
          voice_style: user?.settings.voice_style || "warm",
          speed: user?.settings.speed || 1,
        }),
        signal: abort.signal,
      });
      if (!response.ok) {
        const r = await response.json().catch(() => ({}));
        throw new Error(r.detail || "Chưa phát được giọng nói.");
      }
      const sound = await response.blob();
      if (!callActive.current || turn !== generation.current || abort.signal.aborted) return;
      if (!sound.size) throw new Error("Giọng nói trả về đang trống. Bạn có thể đọc nội dung ở phần Hiện chữ.");
      objectUrl.current = URL.createObjectURL(sound);
      const player = new Audio(objectUrl.current);
      audio.current = player;
      player.volume = user?.settings.volume ?? 0.8;
      player.onended = () => {
        if (turn !== generation.current) return;
        stopPlayback();
        setState("Đến lượt bạn. Chạm micro để nói.");
      };
      setState("Lạc Lạc đang nói…");
      player.onplaying = () => setSpeaking(true);
      player.onpause = () => setSpeaking(false);
      player.onerror = () => {
        if (turn !== generation.current) return;
        stopPlayback();
        setState("Bạn có thể đọc phản hồi và nói tiếp.");
        setError("Trình duyệt chưa phát được giọng nói. Bạn có thể bấm Hiện chữ để đọc nội dung.");
      };
      await player.play();
    } catch (e) {
      if (turn !== generation.current || abort.signal.aborted) return;
      stopPlayback();
      if ((e as Error).name !== "AbortError") { setError((e as Error).message); }
      if (callActive.current) setState("Bạn có thể thử lại bằng micro.");
    } finally {
      if (turn === generation.current) setBusy(false);
    }
  }
  return (
    <div className="voice-page">
      <div className="chat-toolbar voice-chat-toolbar">
        <div className="chat-identity">
          <span className="laclac-header-logo"><img src="/images/laclac/header-avatar.png" alt="Logo Lạc Lạc" width={56} height={56} /></span>
          <div><h2>Lạc Lạc</h2><p>Một người bạn, sẵn sàng lắng nghe</p></div>
        </div>
        <Link href="/talk" className="button outline small"><MessageCircle size={16} /> Chuyển sang trò chuyện</Link>
      </div>
      <div className="chat-notice voice-privacy"><LockKeyhole size={13} /> Không lưu bản ghi âm trên ứng dụng <span>Tâm sự bằng giọng nói</span></div>
      {exhausted && <Notice>Đã hết hạn mức hôm nay. <Link href="/plans">Xem gói VIP</Link> hoặc quay lại ngày mai.</Notice>}
      <div className={`voice-layout ${showTranscript ? "with-transcript" : ""}`}>
        <section className="voice-stage panel">
          <div className={`laclac-voice ${recording ? "listening" : ""} ${speaking ? "speaking" : ""}`}>
            <span className="laclac-voice-halo" aria-hidden="true" />
            <span className="laclac-speech-rings" aria-hidden="true"><span /><span /><span /></span>
            <img src={`/images/laclac/${speaking ? ["speaking-soft", "speaking-open", "speaking-soft", "listening"][mouthFrame] : "listening"}-transparent.png`} alt={speaking ? "Lạc Lạc đang nói" : "Lạc Lạc đang lắng nghe"} />
          </div>
          <h2 aria-live="polite">{state}</h2>
          <p>Giọng bạn nghe là giọng AI · Mỗi lượt thu tối đa 45 giây</p>
          <div className="wave-bars">
            {Array.from({ length: 19 }, (_, i) => (
              <span
                key={i}
                style={{
                  height: `${12 + Math.sin(i * 1.7) * 9 + Math.abs(Math.cos(i)) * 15}px`,
                  animationDelay: `${i * 0.06}s`,
                }}
              />
            ))}
          </div>
          <div className="voice-controls">
            <button
              className="round-button"
              disabled={!speaking && !busy}
              onClick={() => {
                if (busy) end();
                stopPlayback();
                setState("Đã ngắt giọng AI. Bạn có thể nói tiếp.");
              }}
              aria-label="Ngắt giọng AI"
            >
              <Square size={20} />
            </button>
            <button
              className={`mic-button ${recording ? "recording" : ""}`}
              disabled={busy || (exhausted && !recording)}
              onClick={() => {
                if (recording) {
                  if (timer.current) clearTimeout(timer.current);
                  recorder.current?.stop();
                  setRecording(false);
                } else void startRecording();
              }}
              aria-label={recording ? "Tắt micro và gửi" : "Bật micro"}
            >
              {busy ? (
                <LoaderCircle className="spin" size={27} />
              ) : recording ? (
                <MicOff size={27} />
              ) : (
                <Mic size={27} />
              )}
            </button>
            <button
              className="round-button danger"
              onClick={end}
              disabled={!active}
              aria-label="Kết thúc cuộc gọi"
            >
              <Phone size={20} />
            </button>
            <Link href="/talk" className="round-button" aria-label="Chuyển sang trò chuyện cùng AI"><MessageCircle size={24} /></Link>
            <button className="transcript-toggle" aria-expanded={showTranscript} aria-controls="voice-transcript" onClick={() => setShowTranscript(!showTranscript)}>{showTranscript ? "Ẩn chữ" : "Hiện chữ"}</button>
          </div>
          <span className="muted">
            {recording
              ? "Chạm micro để gửi lời nói"
              : "Chạm micro để bắt đầu hoặc nói tiếp"}
          </span>
          <Link className="text-link" href="/settings">
            <Settings size={14} />
            Tùy chỉnh giọng nói
          </Link>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="conversation-support"><button onClick={onSupport}><Headphones size={16} /> Cần hỗ trợ ngay</button></div>
        </section>
        <section id="voice-transcript" className="panel transcript" hidden={!showTranscript}>
          <h3>
            <MessageCircle size={18} />
            Phụ đề cuộc trò chuyện
          </h3>
          {messages.length ? (
            messages.map((m, i) => (
              <div className={`transcript-item ${m.role}`} key={i}>
                <span>{m.role === "user" ? "Bạn" : "Lạc Lạc"}</span>
                <p>{m.content}</p>
              </div>
            ))
          ) : (
            <Empty icon={AudioLines} title="Lời nói của bạn xuất hiện ở đây">
              Phụ đề hiển thị sau mỗi lượt thu. Kết thúc cuộc gọi không tự xóa
              phụ đề; tải lại hoặc rời trang để xóa phiên hiện tại.
            </Empty>
          )}
        </section>
      </div>
    </div>
  );
}

type AssessmentResult = {
  title?: string;
  greeting?: string;
  encouragement?: string;
  suggestions?: string[];
  closing?: string;
  safety_message?: string | null;
  score: number;
  max_score: number;
  level: string;
  draft: boolean;
  support_prompt: boolean;
  explanation: string;
  id?: string;
};
function AssessmentPage({
  user,
  onSupport,
}: {
  user: User | null;
  onSupport: () => void;
}) {
  const [definition, setDefinition] = useState<any>(null),
    [error, setError] = useState(""),
    [index, setIndex] = useState(0),
    [answers, setAnswers] = useState<(number | null)[]>(Array(21).fill(null)),
    [result, setResult] = useState<AssessmentResult | null>(null),
    [busy, setBusy] = useState(false),
    [save, setSave] = useState(false),
    [sharing, setSharing] = useState(false),
    [completed, setCompleted] = useState(false),
    [safeNow, setSafeNow] = useState(false),
    [aiBusy, setAiBusy] = useState(false),
    [aiNote, setAiNote] = useState("");
  const assessmentRouter = useRouter();
  useEffect(() => {
    if (!user) return;
    const record = new URLSearchParams(location.search).get("record");
    if (record)
      api(`/history/${record}`)
        .then((r) => {
          setResult(r.result);
          setAnswers(r.answers);
        })
        .catch((e) => setError(e.message));
    else
      api("/assessment")
        .then(setDefinition)
        .catch((e) => setError(e.message));
  }, [user]);
  if (!user) return <RequireLogin />;
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await api<AssessmentResult>("/assessment/submit", {
        method: "POST",
        body: JSON.stringify({ answers, save, draft_acknowledged: Boolean(definition?.draft) }),
      });
      setResult(r);
      if (r.support_prompt) onSupport();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function explain() {
    setAiBusy(true);
    setAiNote("");
    try {
      const r = await api("/assessment/explain", {
        method: "POST",
        body: JSON.stringify({ answers }),
      });
      if (r.fallback) setAiNote(r.message || "Mình đang dùng lời nhắn có sẵn.");
      setResult((current) =>
        current ? { ...current, encouragement: r.encouragement || current.encouragement } : null,
      );
    } catch (e) {
      setAiNote("Chưa kết nối được Lạc Lạc. Lời nhắn có sẵn vẫn được giữ lại để bạn tham khảo.");
    } finally {
      setAiBusy(false);
    }
  }
  if (completed) return <div className="assessment-complete panel"><Heart size={30} /><h1>Cảm ơn bạn đã dành thời gian cho chính mình</h1><p>Phiên đánh giá đã hoàn tất. Bạn có thể nghỉ một chút hoặc quay về không gian của mình.</p><Link className="button primary" href="/">Về trang chủ</Link></div>;
  return (
    <div className="assessment-page">
      <SectionTitle
        eyebrow=""
        title={
          result
            ? "Kết quả đánh giá cảm xúc của bạn"
            : "Dành một khoảng lặng cho chính mình."
        }
        description="Đánh giá ban đầu giúp bạn nhìn lại cảm xúc, không thay thế chẩn đoán của chuyên gia."
      />
      {error && <Notice tone="error">{error}</Notice>}
      {result ? (
        <div className="result-card panel assessment-result">
          {result.support_prompt && (
            <Notice><span>{result.safety_message || "Ngay lúc này, bạn có đang an toàn không? Nếu có nguy hiểm, hãy tìm người tin cậy ở gần và trợ giúp y tế khẩn cấp."} <button onClick={onSupport} className="text-link">Mở hỗ trợ ngay</button></span></Notice>
          )}
          <section className="result-summary" aria-label="Tóm tắt kết quả đánh giá">
            <p className="result-thanks">{result.greeting || "Cảm ơn bạn đã dành thời gian hoàn thành 21 câu hỏi và lắng nghe chính mình."}</p>
            <div className="result-summary-icon" aria-hidden="true"><ClipboardCheck size={42} strokeWidth={1.6} /></div>
            <span className="result-summary-label">KẾT QUẢ THEO BỘ CÂU HỎI ĐÃ CHỌN</span>
            <h2>{result.draft ? "Mức điểm tham khảo: " : "Mức độ đánh giá: "}<strong>{result.level}</strong></h2>
            <div className="result-score-pill"><strong>{result.score}</strong><span>/ {result.max_score}</span></div>
            <div className="result-score-progress">
              <div className="score-track" role="progressbar" aria-label="Tổng điểm đánh giá" aria-valuemin={0} aria-valuemax={result.max_score} aria-valuenow={result.score}>
                <span style={{ width: `${Math.min(100, Math.max(0, (result.score / result.max_score) * 100))}%` }} />
              </div>
              <span className="result-score-fraction">{result.score}/{result.max_score}</span>
            </div>
            <div className="result-summary-note"><ShieldCheck size={21} aria-hidden="true" /><p>Đây là kết quả tham khảo, không phải chẩn đoán y khoa.<br />Nếu cảm thấy cần hỗ trợ thêm, bạn có thể chia sẻ với người thân, bạn bè hoặc chuyên gia tâm lý nhé.</p></div>
          </section>
          <section className="assessment-result-section"><h3>{result.title || "Một góc nhìn về cảm xúc của bạn"}</h3><p>{result.explanation}</p></section>
          <section className="assessment-result-section"><h3>Lời nhắn từ Lạc Lạc</h3>{aiBusy && <p role="status">Lạc Lạc đang chuẩn bị lời nhắn…</p>}{aiNote && <p role="status">{aiNote}</p>}<p>{result.encouragement}</p></section>
          {result.suggestions && <ul className="result-suggestions" aria-label="Ba gợi ý chăm sóc bản thân">{result.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul>}
          {result.closing && <p>{result.closing}</p>}
          {result.support_prompt && <label className="checkbox"><input type="checkbox" checked={safeNow} onChange={(e) => setSafeNow(e.target.checked)} />Hiện tại mình đang ở nơi an toàn. Nếu chưa an toàn, hãy mở hỗ trợ ngay.</label>}
          <label className="checkbox"><input type="checkbox" checked={sharing} onChange={(e) => setSharing(e.target.checked)} />Mình đồng ý đưa tổng điểm và mức tham khảo vào ô soạn tin khi chuyển sang trò chuyện.</label>
          <div className="button-row">
            <Link href="/experts" className="button primary">
              Tìm người đồng hành
              <ArrowRight size={16} />
            </Link>
            {(
              <button
                className="button outline"
                disabled={aiBusy}
                onClick={explain}
              >
                {aiBusy ? "Đang chuẩn bị lời nhắn…" : "Nhận lời nhắn riêng từ Lạc Lạc"}
              </button>
            )}
            <button className="button primary" onClick={() => { setAssessmentContext(sharing ? `Mình vừa hoàn thành bài đánh giá, tổng điểm ${result.score}/${result.max_score}, mức ${result.draft ? "tham khảo " : ""}${result.level}. Mình muốn chia sẻ thêm về cảm xúc của mình.` : null); assessmentRouter.push("/talk"); }}>Tâm sự cùng Lạc Lạc</button>
            <button className="button outline" disabled={result.support_prompt && !safeNow} onClick={() => { setResult(null); setAnswers(Array(21).fill(null)); setSharing(false); setCompleted(true); }}>Hoàn tất đánh giá</button>
          </div>
          <span className="muted">
            {result.id
              ? "Kết quả đã được lưu theo lựa chọn của bạn."
              : "Kết quả này không được lưu vào tài khoản."}
          </span>
        </div>
      ) : definition ? (
        <div className="assessment-card panel">
          <div className="assessment-header">
            <span className="assessment-question-tag"><ClipboardList size={14} /> 21 NHÓM CÂU HỎI</span>
            <div className="assessment-progress-summary">
              <div className="assessment-progress-bar" role="progressbar" aria-label="Tiến độ trả lời" aria-valuemin={0} aria-valuemax={21} aria-valuenow={answers.filter(a => a !== null).length}>
                <span style={{ width: `${answers.filter(a => a !== null).length / 21 * 100}%` }} />
              </div>
              <span>{answers.filter(a => a !== null).length}/21 đã trả lời</span>
            </div>
          </div>
          <div className="assessment-question-heading">
            <span className="assessment-question-index" aria-label={`Câu ${index + 1}`}>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2>Điều nào gần với bạn nhất?</h2>
              <p>Hãy chọn một đáp án phù hợp nhất với cảm xúc của bạn trong 2 tuần gần đây.</p>
            </div>
          </div>
          <fieldset
            className="answer-options"
          >
            <legend className="sr-only">
              Chọn một câu mô tả tình trạng của bạn
            </legend>
            {definition.items[index].options.map((o: any) => (
              <label
                className={`answer ${answers[index] === o.value ? "chosen" : ""}`}
                key={o.value}
              >
                <input
                  type="radio"
                  name={`question-${index}`}
                  checked={answers[index] === o.value}
                  onChange={() => {
                    setAnswers((current) =>
                      current.map((a, i) => (i === index ? o.value : a)),
                    );
                    if (index === 8 && o.value > 0) onSupport();
                  }}
                />
                <span className="answer-number">{o.value}</span>
                <span>{o.text}</span>
                <span className="radio-indicator">
                  {answers[index] === o.value && <Check size={12} />}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="assessment-navigation">
            <button
              className="button outline"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            >
              <ArrowLeft size={16} />
              Câu trước
            </button>
            {index < 20 ? (
              <button
                className="button primary"
                disabled={answers[index] === null}
                onClick={() => setIndex(index + 1)}
              >
                Câu tiếp theo
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                className="button primary"
                disabled={answers.some((a) => a === null) || busy}
                onClick={submit}
              >
                {busy ? "Đang tính điểm…" : definition.draft ? "Xem kết quả dùng thử" : "Xem kết quả"}
                <ArrowRight size={16} />
              </button>
            )}
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={save}
              disabled={!user.settings.save_assessments}
              onChange={(e) => setSave(e.target.checked)}
            />
            Lưu kết quả vào tài khoản
            {!user.settings.save_assessments && (
              <Link href="/settings"> · Bật quyền trong cài đặt</Link>
            )}
          </label>
        </div>
      ) : (
        <div className="panel">
          <Empty icon={ClipboardList} title="Bộ câu hỏi đang được chuẩn bị">
            Nội dung 21 câu đã được tiếp nhận. Bài đánh giá chỉ mở sau khi đơn
            vị vận hành xác minh hoặc bật chế độ trình diễn nội bộ. Bạn vẫn có
            thể trò chuyện hoặc tìm người hỗ trợ.
            <Link className="button primary" href="/talk">
              Trò chuyện cùng Lạc Lạc
              <ArrowRight size={16} />
            </Link>
          </Empty>
        </div>
      )}
    </div>
  );
}

function HistoryPage({ user }: { user: User | null }) {
  const [rows, setRows] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [renaming, setRenaming] = useState<string | null>(null),
    [title, setTitle] = useState(""),
    [pendingDelete, setPendingDelete] = useState<string | null>(null);
  useEffect(() => {
    if (user)
      api("/history")
        .then(setRows)
        .catch((e) => setError(e.message));
  }, [user]);
  if (!user) return <RequireLogin />;
  async function remove() {
    try {
      await api(
        pendingDelete === "all" ? "/history" : `/history/${pendingDelete}`,
        { method: "DELETE" },
      );
      setRows(
        pendingDelete === "all"
          ? []
          : rows.filter((r) => r.id !== pendingDelete),
      );
      setPendingDelete(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function rename(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/history/${renaming}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      setRows(rows.map((r) => (r.id === renaming ? { ...r, title } : r)));
      setRenaming(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function search(e: FormEvent) {
    e.preventDefault();
    try {
      setRows(await api(`/history?q=${encodeURIComponent(query)}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="history-page">
      <header className="history-heading">
        <span className="history-heading-tag"><span className="tiny-dot" /> NHỮNG ĐIỀU ĐÃ CHIA SẺ</span>
        <h1>Mỗi câu chuyện đều có <em>một chỗ riêng.</em></h1>
        <p>Chỉ những cuộc trò chuyện và kết quả bạn đồng ý lưu mới xuất hiện ở đây.</p>
      </header>
      <div className="list-toolbar">
        <form className="search-box" onSubmit={search}>
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm trong lịch sử của bạn…"
            aria-label="Tìm lịch sử"
          />
          <button className="text-link">Tìm</button>
        </form>
        <button
          className="button primary history-delete-all"
          onClick={() => setPendingDelete("all")}
          disabled={!rows.length}
        >
          <Trash2 size={15} />
          Xóa tất cả
        </button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className={`history-results ${rows.length ? "has-records" : "panel"}`}>
        {rows.length ? (
          <div className="history-list">
            {rows.map((r) => (
              <div className="history-row" key={r.id}>
                <span className="circle-icon">
                  {r.kind === "conversation" ? (
                    <MessageCircle size={21} />
                  ) : (
                    <ClipboardList size={21} />
                  )}
                </span>
                <Link
                  className="history-record-link"
                  href={
                    r.kind === "conversation"
                      ? `/talk?conversation=${r.id}`
                      : `/assessment/result?record=${r.id}`
                  }
                >
                  <h3>{r.title}</h3>
                  <p>
                    {r.kind === "conversation" ? <MessageCircle size={13} /> : <ClipboardList size={13} />}
                    {r.kind === "conversation"
                      ? "Cuộc trò chuyện"
                      : "Đánh giá ban đầu"}{" "}
                    · {new Date(r.created).toLocaleDateString("vi-VN")} · {new Date(r.created).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </Link>
                <button
                  className="icon-button history-rename"
                  onClick={() => {
                    setRenaming(r.id);
                    setTitle(r.title);
                  }}
                  aria-label="Đổi tên"
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button history-delete"
                  onClick={() => setPendingDelete(r.id)}
                  aria-label="Xóa"
                >
                  <Trash2 size={16} />
                </button>
                <Link className="history-open" href={r.kind === "conversation" ? `/talk?conversation=${r.id}` : `/assessment/result?record=${r.id}`} aria-label={`Mở ${r.title}`}><ChevronRight size={21} /></Link>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={Clock} title="Chưa có điều gì được lưu lại">
            Bạn có thể bật quyền lưu trong cài đặt và chọn lưu từng cuộc trò
            chuyện.
            <Link className="button primary" href="/talk">
              Bắt đầu một câu chuyện
              <ArrowRight size={16} />
            </Link>
          </Empty>
        )}
      </div>
      {pendingDelete && (
        <ConfirmModal
          title="Xóa dữ liệu đã chọn?"
          description="Thao tác sẽ xóa dữ liệu này khỏi hệ thống đang hoạt động và không thể khôi phục từ giao diện."
          close={() => setPendingDelete(null)}
          confirm={remove}
        />
      )}{" "}
      {renaming && (
        <div className="modal-backdrop">
          <div className="modal compact">
            <h2>Đặt tên câu chuyện</h2>
            <form onSubmit={rename}>
              <label>
                Tên mới
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={100}
                />
              </label>
              <div className="button-row">
                <button
                  type="button"
                  className="button outline"
                  onClick={() => setRenaming(null)}
                >
                  Hủy
                </button>
                <button className="button primary">Lưu tên</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ExpertsPage({ user, bookingMode = false }: { user: User | null; bookingMode?: boolean }) {
  const [experts, setExperts] = useState<any[]>([]),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [specialty, setSpecialty] = useState(""),
    [workplace, setWorkplace] = useState(""),
    [details, setDetails] = useState<any>(null),
    [selected, setSelected] = useState<any>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [availabilityDate,setAvailabilityDate]=useState(()=>new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"}));
  const [availabilityTime,setAvailabilityTime]=useState("");
  useEffect(() => {
    const abort=new AbortController();setBusy(true);setError("");
    const load=()=>api<any[]>(`/content/experts?date=${availabilityDate}${availabilityTime?`&time=${availabilityTime}`:""}`,{signal:abort.signal})
      .then(rows=>{if(!abort.signal.aborted){setExperts(rows);setError("");setBusy(false);}})
      .catch(e=>{if(!abort.signal.aborted){setError(e.message);setBusy(false);}});
    load();const id=setInterval(load,15000);return()=>{abort.abort();clearInterval(id);};
  }, [availabilityDate,availabilityTime]);
  const filtered = experts.filter(e => `${e.name} ${e.specialty} ${e.workplace}`.toLocaleLowerCase("vi").includes(search.trim().toLocaleLowerCase("vi")) && (!specialty || e.specialty === specialty) && (!workplace || e.workplace === workplace));
  return (
    <div className="experts-page expert-directory">
      <header className="experts-heading">
        <span className="eyebrow expert-directory-label"><Users size={18} /> KẾT NỐI CHUYÊN GIA</span>
        <h1>{bookingMode ? "Book thăm khám" : "Kết nối cùng chuyên gia"} <Heart size={34} aria-hidden="true" /></h1>
        <p>{bookingMode ? "Chọn chuyên gia và bấm Đặt lịch để điền thông tin, chọn ngày giờ và hoàn tất đăng ký tư vấn." : "Đội ngũ chuyên gia tâm lý đồng hành, lắng nghe và hỗ trợ bạn một cách chuyên nghiệp."}</p>
      </header>
      {error && <Notice tone="error">{error}</Notice>}
      {message && (
        <Notice tone="success">
          {message}
          <Link href="/bookings"> Xem yêu cầu</Link>
        </Notice>
      )}
      <div className="expert-directory-filters">
        <div className="search-box"><Search size={20} /><input placeholder="Tìm theo tên, chuyên ngành, nơi làm việc…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Tìm chuyên gia" /></div>
        <label><ClipboardList size={18} /><select aria-label="Chuyên ngành" value={specialty} onChange={e => setSpecialty(e.target.value)}><option value="">Chuyên ngành</option>{Array.from(new Set(experts.map(e => e.specialty).filter(Boolean))).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><MapPin size={18} /><select aria-label="Nơi làm việc" value={workplace} onChange={e => setWorkplace(e.target.value)}><option value="">Nơi làm việc</option>{Array.from(new Set(experts.map(e => e.workplace).filter(Boolean))).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <div className="expert-availability-filters"><label>Ngày muốn tư vấn<input type="date" required value={availabilityDate} min={new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Ho_Chi_Minh"})} onChange={e=>{if(e.target.value){setBusy(true);setAvailabilityDate(e.target.value);}}} /></label><label>Giờ muốn tư vấn<select value={availabilityTime} onChange={e=>{setBusy(true);setAvailabilityTime(e.target.value);}}><option value="">Tất cả giờ trong ngày</option>{Array.from({length:48},(_,i)=>`${Math.floor(i/2).toString().padStart(2,"0")}:${i%2?"30":"00"}`).map(t=><option key={t}>{t}</option>)}</select></label></div>
      <p className="expert-directory-note">{busy?"Đang kiểm tra lịch rảnh…":"Chọn ngày và giờ để xem chuyên gia rảnh. Hồ sơ mờ là chuyên gia bận hoặc chưa mở lịch, không thể đặt ở thời điểm này."}</p>
      <p className="expert-directory-note"><ShieldCheck size={15} /> Hồ sơ đã được xác minh · Yêu cầu đặt lịch cần được chuyên gia xác nhận.</p>
      {experts.length ? (
        <div className="expert-grid">
          {filtered.map(e => (
            <article className={`expert-card panel ${busy||!!error||e.available!==true?"is-busy":""}`} aria-disabled={busy||!!error||e.available!==true} key={e.id}>
              {typeof e.fee === "number" && <span className="expert-session-price">{e.fee.toLocaleString("vi-VN")}đ / buổi</span>}
              <div className="expert-card-top">
                {e.image ? <img className="expert-directory-avatar" src={e.image} alt={e.name} /> : <span className="expert-directory-avatar"><UserRound size={48} /></span>}
              </div>
              <h2>{expertDisplayName(e.name, e.degree)}</h2>
              <ExpertStars compact average={e.rating_average || 0} count={e.rating_count || 0} />
              <div className="expert-directory-info">
                <p><span><strong>Chuyên ngành:</strong> {e.specialty || "Đang cập nhật"}</span></p>
                <p><span><strong>Nơi làm việc:</strong> {e.workplace || "Đang cập nhật"}</span></p>
                <p><span><strong>Mô tả:</strong><br />{e.description || e.experience || "Xem hồ sơ để tìm hiểu thêm về chuyên gia."}</span></p>
              </div>
              <div className="expert-directory-actions">
                <p className="expert-availability-status">{busy?"Đang kiểm tra…":e.availability_note}</p><button className="button outline" disabled={busy||!!error||e.available!==true} onClick={() => setDetails(e)}>Xem chi tiết</button>
                <button className="button primary green-shimmer" disabled={busy||!!error||e.available!==true} onClick={() => { if (!user) { location.href = "/login"; return; } setError(""); setSelected(e); }}>Đặt lịch</button>
              </div>
            </article>
          ))}
          {!filtered.length && <p className="expert-no-results">Không tìm thấy chuyên gia phù hợp. Bạn thử đổi bộ lọc nhé.</p>}
        </div>
      ) : (
        <section className="experts-empty panel" aria-labelledby="experts-empty-title">
          <div className="experts-empty-art" aria-hidden="true"><span className="experts-art-blob" /><Users size={42} strokeWidth={1.7} /><span className="experts-art-rays"><i /><i /><i /><i /><i /><i /></span></div>
          <h2 id="experts-empty-title">Danh sách chuyên gia <em>đang được xác minh</em></h2>
          <p>Chưa có hồ sơ được công khai. Tư vấn tâm lý không sử dụng thông tin chuyên gia giả để trình diễn.</p>
        </section>
      )}
      {details && <ExpertDetails key={details.id} expert={details} initialDate={availabilityDate} initialTime={availabilityTime} close={() => setDetails(null)} book={(date,time) => {if(date)setAvailabilityDate(date);if(time)setAvailabilityTime(time); if (!user) { location.href = "/login"; return; } setError(""); setSelected(details); setDetails(null); }} onRated={(average, count) => setExperts(previous => previous.map(expert => expert.id === details.id ? {...expert, rating_average: average, rating_count: count} : expert))} />}
      {selected && user && <ExpertBooking expert={selected} user={user} initialDate={availabilityDate} initialTime={availabilityTime} close={() => setSelected(null)} />}

    </div>
  );
}


const VN_TIME = { timeZone: "Asia/Ho_Chi_Minh" } as const;

/** Student edits a request the expert has not confirmed yet: date, time slot and (optionally) phone. */
function BookingEditModal({ booking, close, saved, cancel }: { booking: any; close: () => void; saved: (row: any) => void; cancel: () => void }) {
  const canEdit = booking.status === "pending";
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const start = new Date(booking.starts_at);
  const date = start.toLocaleDateString("en-CA", VN_TIME),
    time = start.toLocaleTimeString("en-GB", { ...VN_TIME, hour: "2-digit", minute: "2-digit" });
  const [newDate,setNewDate]=useState(date),[newTime,setNewTime]=useState(time),[slotReady,setSlotReady]=useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const contact = String(f.get("contact") || "").trim();
    try {
      saved(await api(`/bookings/${booking.id}`, {
        method: "PATCH",
        body: JSON.stringify({ starts_at: `${newDate}T${newTime}:00+07:00`, ...(contact ? { contact } : {}) }),
      }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Chỉnh sửa yêu cầu đặt lịch">
      <div className="modal compact">
        <button className="modal-close icon-button" onClick={close} aria-label="Đóng"><X size={20} /></button>
        <span className="eyebrow">CHỈNH SỬA YÊU CẦU</span>
        <h2>{booking.expert_name}</h2>
        <p>{canEdit ? "Bạn có thể đổi thông tin hoặc hủy yêu cầu tại đây. Sau khi lưu, lịch vẫn chờ chuyên gia xác nhận." : "Lịch đã được xác nhận nên không thể đổi thông tin. Bạn vẫn có thể hủy yêu cầu tại đây."}</p>
        <form onSubmit={submit}>
          <div className="two-columns">
            <label>
              Ngày mong muốn
              <input disabled={!canEdit} type="date" name="date" required value={newDate} onChange={e=>{setSlotReady(false);setNewDate(e.target.value);}} min={new Date().toLocaleDateString("en-CA")} />
            </label>

          </div>
          {canEdit && <AvailableSlots expertId={booking.expert_id} bookingId={booking.id} date={newDate} value={newTime} onChange={setNewTime} onReady={setSlotReady} />}
          <label>
            Số điện thoại mới (để trống nếu giữ số cũ)
            <input disabled={!canEdit} name="contact" type="tel" pattern="^\+?[0-9 .\-]{8,20}$" maxLength={20} placeholder="Ví dụ: 0901 234 567" title="Nhập số điện thoại 8–20 chữ số" />
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="button-row">
            <button type="button" className="button outline" onClick={close} disabled={busy}>Quay lại</button>
            <button type="button" className="button outline" onClick={cancel} disabled={busy}>Hủy yêu cầu</button>
            {canEdit && <button className="button primary" disabled={busy||!slotReady||!newTime}>{busy ? "Đang lưu…" : "Lưu thay đổi"}</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

function BookingsPage({ user }: { user: User | null }) {
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(""),
    [cancel, setCancel] = useState<string | null>(null),
    [editing, setEditing] = useState<any>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!user) return;
    const load = () => api<any[]>("/bookings").then(setRows).catch((e) => setError(e.message));
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [user]);
  if (!user) return <RequireLogin />;
  async function confirmCancel() {
    try {
      await api(`/bookings/${cancel}`, { method: "DELETE" });
      setRows(await api<any[]>("/bookings"));
      setCancel(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="bookings-page">
      <header className="bookings-head">
        <span className="bookings-eyebrow">MỘT BƯỚC TỚI SỰ ĐỒNG HÀNH</span>
        <h1>Lịch hẹn của bạn <Sun size={30} strokeWidth={1.5} aria-hidden="true" /></h1>
        <svg className="bookings-swoosh" viewBox="0 0 200 12" aria-hidden="true"><path d="M2,9 C50,3 120,1 198,6" /></svg>
        <p>Theo dõi yêu cầu tư vấn. Chỉ trạng thái “Đã xác nhận” mới là lịch đã được xác nhận thực tế.</p>
      </header>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <div className={rows.length ? "bookings-list" : "bookings-empty-surface"}>
        {rows.length ? (
          rows.map((r) => {
            const upcoming = new Date(r.starts_at) > new Date();
            const cancellable = ["pending", "confirmed"].includes(r.status) && upcoming;
            // Only requests the expert has not confirmed yet can be changed.

            return (
              <article className={`booking-card ${cancellable ? "is-upcoming" : ""}`} key={r.id}>
                <span className="booking-card-icon"><CalendarDays size={24} strokeWidth={1.6} /></span>
                <div className="booking-card-body">
                  <h3>{r.expert_name}</h3>
                  <p>
                    <span><Clock size={14} />{new Date(r.starts_at).toLocaleString("vi-VN", VN_TIME)}</span>
                    <i aria-hidden="true">|</i>
                    <span><MapPin size={14} />Giờ Việt Nam</span>
                  </p>
                  {(r.student_name || r.expert_contact) && <details className="booking-saved-details"><summary>Thông tin đăng ký và liên hệ chuyên gia</summary><p>Sinh viên: {r.student_name || user.name} · {r.contact?.value}</p>{r.student_email && <p>Email: {r.student_email}</p>}{r.school && <p>Trường / khoa: {r.school}</p>}{r.topic && <p className="booking-description">Nội dung: {r.topic}</p>}{r.payment?.amount != null && <p>Phí tư vấn: {r.payment.amount.toLocaleString("vi-VN")}đ / buổi · {r.payment.demo ? "Thanh toán mô phỏng" : r.payment.status}</p>}{r.expert_contact?.phone && <p>Điện thoại chuyên gia: <a href={`tel:${r.expert_contact.phone}`}>{r.expert_contact.phone}</a></p>}{r.expert_contact?.zalo && <a href={r.expert_contact.zalo} target="_blank" rel="noreferrer">Zalo chuyên gia</a>}</details>}
                </div>
                <ConsultationPanel booking={r} role="student" changed={() => api<any[]>("/bookings").then(setRows).catch(e=>setError(e.message))} />
                <div className="booking-card-actions">
                  <span className={`booking-status ${r.status}`}>
                    <span className="booking-status-dot" aria-hidden="true">
                      {r.status === "pending" ? <Clock size={11} strokeWidth={2.6} /> : ["cancelled", "rejected"].includes(r.status) ? <X size={11} strokeWidth={3} /> : <Check size={11} strokeWidth={3} />}
                    </span>
                    {statusNames[r.status]}
                  </span>
                  {cancellable && (
                    <button className="booking-cancel booking-edit" onClick={() => { setMessage(""); setEditing(r); }}>
                      <Pencil size={15} strokeWidth={1.8} />
                      Chỉnh sửa
                    </button>
                  )}

                </div>
              </article>
            );
          })
        ) : (
          <section className="bookings-empty" aria-labelledby="bookings-empty-title">
            <div className="booking-calendar-art" aria-hidden="true">
              <span className="booking-art-halo" />
              <span className="booking-art-dot dot-one" /><span className="booking-art-dot dot-two" />
              <div className="booking-art-calendar"><span className="booking-art-binding" /><div className="booking-art-dates">{Array.from({ length: 6 }, (_, i) => <span key={i} />)}</div></div>
              <span className="booking-art-clock"><Clock size={34} strokeWidth={2} /></span>
            </div>
            <h2 id="bookings-empty-title">Bạn chưa có yêu cầu <em>đặt lịch</em></h2>
            <p>Khi tìm được chuyên gia phù hợp, bạn có thể gửi yêu cầu tại trang chuyên gia.</p>
            <Link href="/experts" className="button primary find-expert-button">Tìm chuyên gia <ArrowRight size={17} /></Link>
          </section>
        )}
      </div>
      {editing && (
        <BookingEditModal
          booking={editing}
          cancel={() => { setCancel(editing.id); setEditing(null); }}
          close={() => setEditing(null)}
          saved={(row) => {
            setRows(rows.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
            setEditing(null);
            setMessage("Đã cập nhật yêu cầu. Lịch vẫn đang chờ chuyên gia xác nhận.");
          }}
        />
      )}
      {cancel && (
        <ConfirmModal
          title="Hủy yêu cầu đặt lịch?"
          description="Yêu cầu này sẽ chuyển sang trạng thái đã hủy."
          close={() => setCancel(null)}
          confirm={confirmCancel}
        />
      )}
    </div>
  );
}

function youtubeId(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be")
      return /^[\w-]{11}$/.test(u.pathname.slice(1))
        ? u.pathname.slice(1)
        : null;
    if (["youtube.com", "www.youtube.com"].includes(u.hostname)) {
      const id = u.searchParams.get("v") || u.pathname.split("/").at(-1);
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
  } catch {}
  return null;
}
function HealingPage() {
  const [tracks, setTracks] = useState<any[]>([]),
    [category, setCategory] = useState("Tất cả"),
    [selected, setSelected] = useState<any>(null),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(false);
  const musicAudio = useRef<HTMLAudioElement>(null);
  const [youtubePlaybackKey, setYoutubePlaybackKey] = useState(0);
  const [playbackNotice, setPlaybackNotice] = useState("");
  const [listeningMinutes, setListeningMinutes] = useState(5);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved: unknown = JSON.parse(window.localStorage.getItem("laclac-music-favorites") || "[]");
      if (Array.isArray(saved)) setFavoriteIds(saved.filter((id): id is string => typeof id === "string").slice(0, 1000));
    } catch { /* Favorites are optional when browser storage is unavailable. */ }
  }, []);
  function toggleFavorite() {
    if (!selected) return;
    const id = String(selected.id);
    const next = favoriteIds.includes(id) ? favoriteIds.filter(value => value !== id) : [...favoriteIds, id];
    setFavoriteIds(next);
    try { if (typeof window !== "undefined") window.localStorage.setItem("laclac-music-favorites", JSON.stringify(next)); } catch {}
  }
  // A listening session ends after five minutes, including an embedded player.
  useEffect(() => {
    if (!selected) return;
    const timer = setTimeout(() => {
      musicAudio.current?.pause();
      setSelected(null);
      setPlaying(false);
      setPlaybackNotice(`Đã kết thúc ${listeningMinutes} phút nghe nhạc. Bạn có thể chọn bài để nghe tiếp.`);
    }, listeningMinutes * 60 * 1000);
    return () => clearTimeout(timer);
  }, [selected, youtubePlaybackKey, listeningMinutes]);
  useEffect(() => { const audio = musicAudio.current; return () => { audio?.pause(); }; }, []);
  useEffect(() => {
    api("/content/music")
      .then(setTracks)
      .catch((e) => setError(e.message));
  }, []);
  const categoryIcons = musicCategoryIcons;
  // The curated library now lives in the database, managed from /admin.
  const displayTracks = tracks;
  function chooseTrack(track: any) {
    setError("");
    setPlaybackNotice("");
    const audio = musicAudio.current;
    if (!audio) return;
    if (selected?.id === track.id && track.source_type === "audio") {
      if (!audio.paused) { audio.pause(); return; }
    } else {
      audio.pause();
      setSelected(track);
      if (track.source_type !== "audio") { setYoutubePlaybackKey(key => key + 1); return; }
      audio.src = track.url;
      audio.loop = !!track.builtin;
      audio.volume = .45;
    }
    void audio.play().catch(() => { setPlaying(false); setError("Chưa phát được âm thanh. Bạn hãy kiểm tra thiết bị hoặc bấm phát lại."); });
  }
  const visibleTracks = displayTracks.filter(t => category === "Tất cả" || t.category === category);
  return (
    <div className="healing-page">
      <section className="healing-image-hero" aria-labelledby="healing-banner-title">
        <h1 id="healing-banner-title" className="sr-only">Góc bình yên — Để tâm trí được nghỉ ngơi</h1>
        <img src="/images/healing-space-banner.png" alt="Không gian âm nhạc ấm áp bên cửa sổ, cây xanh và máy đĩa. Một chút âm nhạc, một khoảng lặng và một chút dịu dàng dành cho chính mình." width={1774} height={887} />
        <a className="healing-banner-link" href="#healing-music-list" aria-label="Lắng nghe theo nhịp của bạn — đến danh sách nhạc"><span>Lắng nghe theo nhịp của bạn <ArrowRight size={18} /></span></a>
      </section>
      {error && <Notice tone="error">{error}</Notice>}
      {playbackNotice && <p role="status" className="healing-preview-note">{playbackNotice}</p>}
      <div id="healing-music-list" className="section-heading" tabIndex={-1}>
        <div>
          <h2>Chọn giai điệu cho lúc này</h2>
          <p>Âm nhạc chỉ bắt đầu khi bạn chọn phát.</p>
        </div>
      </div>
      <div className="filter-tabs healing-filters" aria-label="Lọc giai điệu">
        {Array.from(new Set([...Object.keys(categoryIcons), ...tracks.map((t) => t.category)])).map(
          (c) => (
            <button
              key={c}
              className={category === c ? "active" : ""}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              <span className="healing-category-icon" aria-hidden="true">{categoryIcons[c] || "♫"}</span>{c}
            </button>
          ),
        )}
      </div>
      <p className="healing-preview-note">{visibleTracks.length} bài · Nhạc nhẹ từ YouTube · Mỗi lần nghe tối đa 5 phút.</p>
      {visibleTracks.length ? <div className="music-grid healing-music-grid">{visibleTracks.map((t: any, i: number) => <article className={`music-card healing-track ${selected?.id === t.id ? "is-selected" : ""}`} key={t.id}>
        <div className="music-cover">
          {t.image ? <img src={t.image} alt="" loading="lazy" /> : t.cover_atlas ? <div className="healing-photo healing-original-cover" style={{ backgroundImage: `url("${t.cover_atlas}")`, backgroundPosition: t.cover_position }} aria-hidden="true" /> : <div className={`healing-photo healing-photo-${t.cover ?? i % 6}`} aria-hidden="true" />}
          <details className="track-details"><summary aria-label={`Thông tin ${t.title}`}><MoreHorizontal size={17} /></summary><div><strong>{t.title}</strong><p>{t.preview ? "Chưa có nguồn phát. Đây là thẻ gợi ý giao diện." : (musicCredit(t) || "Nguồn nhạc do quản trị viên cung cấp.")}</p></div></details>
          <button className="play-overlay" onClick={() => chooseTrack(t)} aria-label={`${selected?.id === t.id && playing ? "Tạm dừng" : "Phát"}: ${t.title}`} aria-pressed={selected?.id === t.id && (t.source_type === "youtube" || playing)}>{selected?.id === t.id && playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
        </div>
        <div className="music-info"><h3>{t.title}</h3><p>{t.description}</p><div className="healing-track-meta"><span aria-hidden="true">{categoryIcons[t.category] || "♫"}</span><span>{t.category}</span><span>·</span><span>{t.source_type === "youtube" ? "Tối đa 5 phút" : t.builtin ? `${t.duration_seconds >= 60 ? `${Math.floor(t.duration_seconds / 60)} phút ${t.duration_seconds % 60} giây` : `${t.duration_seconds} giây`} · lặp` : t.duration_minutes ? `${t.duration_minutes} phút` : "Nghe nhạc"}</span></div></div>
      </article>)}</div> : <div className="panel"><Empty icon={Music2} title="Chưa có giai điệu trong mục này">Bạn có thể chọn một chủ đề khác để khám phá thêm.</Empty></div>}
      <div className={`music-player panel ${selected?.source_type === "youtube" ? "youtube-music-player" : ""}`} hidden={!selected}>
        <audio ref={musicAudio} controls hidden={selected?.source_type !== "audio"} aria-label={selected?.title || "Trình phát nhạc"} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={(event) => { if (event.currentTarget.currentTime >= listeningMinutes * 60) { event.currentTarget.pause(); setSelected(null); setPlaying(false); setPlaybackNotice(`Đã kết thúc ${listeningMinutes} phút nghe nhạc. Bạn có thể chọn bài để nghe tiếp.`); } }} onError={() => { setPlaying(false); setError("Nguồn âm thanh chưa phát được. Hãy chọn bài khác hoặc thử lại."); }} />
      {selected && (
        <>
          <button
            className="icon-button"
            onClick={() => { musicAudio.current?.pause(); setSelected(null); }}
            aria-label="Đóng trình phát"
          >
            <X size={19} />
          </button>
          <div className="music-player-info">
            <span className="music-now-playing"><Music2 size={15} /> ĐANG NGHE</span>
            <h3>{selected.title}</h3>
            <p className="music-listening-limit"><Clock size={14} /> Tự dừng sau {listeningMinutes} phút</p>
            {selected.source_type === "youtube" && <div className="music-creator-row">
              <span><UserRound size={15} /> {selected.channel || "Kênh cung cấp"}</span>
              <a href={selected.url} target="_blank" rel="noreferrer" className="youtube-source-link">YouTube <ExternalLink size={12} /></a>
            </div>}
            <div className="music-player-actions">
              <button type="button" className={`music-favorite-button ${favoriteIds.includes(String(selected.id)) ? "is-favorite" : ""}`} aria-label="Lưu yêu thích" aria-pressed={favoriteIds.includes(String(selected.id))} onClick={toggleFavorite}>
                <Heart size={20} fill={favoriteIds.includes(String(selected.id)) ? "currentColor" : "none"} />
                {favoriteIds.includes(String(selected.id)) ? "Đã yêu thích" : "Lưu yêu thích"}
              </button>
              <label className="music-timer-control"><Clock size={19} />
                <select aria-label="Hẹn giờ tắt nhạc" value={listeningMinutes} onChange={event => { const value = Number(event.target.value); if ([1, 3, 5].includes(value)) setListeningMinutes(value); }}>
                  <option value={5}>Hẹn giờ tắt · 5 phút</option>
                  <option value={3}>Hẹn giờ tắt · 3 phút</option>
                  <option value={1}>Hẹn giờ tắt · 1 phút</option>
                </select>
              </label>
            </div>
            <Leaf className="music-player-leaf" size={68} aria-hidden="true" />
          </div>
          {selected.source_type === "audio" ? null : selected.source_type === "youtube" && youtubeId(selected.url) ? (
            <div className="youtube-playback">
              <iframe
                key={`${youtubeId(selected.url)}-${youtubePlaybackKey}`}
                title={`YouTube: ${selected.source_title || selected.title}`}
                src={`https://www.youtube-nocookie.com/embed/${youtubeId(selected.url)}?autoplay=1&playsinline=1&rel=0&end=${listeningMinutes * 60}`}
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
              
            </div>
          ) : (
            <a
              href={selected.url}
              target="_blank"
              rel="noreferrer"
              className="button primary"
            >
              Mở nguồn nhạc
              <ExternalLink size={16} />
            </a>
          )}
        </>
      )}
      </div>
    </div>
  );
}

function SettingsPage({
  user,
  onUser,
  logout,
}: {
  user: User | null;
  onUser: (u: User | null) => void;
  logout: () => Promise<void>;
}) {
  const [supportsStyle, setSupportsStyle] = useState(false);
  useEffect(() => {
    api("/health")
      .then((r) => setSupportsStyle(!!r.voice_style_supported))
      .catch(() => {});
  }, []);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [deleting, setDeleting] = useState(false),
    [busy, setBusy] = useState(false);
  if (!user) return <RequireLogin />;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const u = await api<User>("/me/preferences", {
        method: "PUT",
        body: JSON.stringify({
          name: f.get("name"),
          save_history: f.get("save_history") === "on",
          save_assessments: f.get("save_assessments") === "on",
          voice: f.get("voice"),
          voice_style: f.get("voice_style") || "warm",
          speed: Number(f.get("speed")),
          volume: Number(f.get("volume")),
          theme: f.get("theme"),
        }),
      });
      onUser(u);
      setMessage(
        "Đã lưu lựa chọn của bạn. Tắt quyền lưu không tự xóa dữ liệu đã lưu trước đó.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function password(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError("");
    try {
      await api("/me/password", {
        method: "PUT",
        body: JSON.stringify({
          current_password: f.get("current"),
          new_password: f.get("new"),
        }),
      });
      setMessage("Đã đổi mật khẩu và đăng xuất các phiên cũ.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove() {
    try {
      await api("/me", { method: "DELETE" });
      onUser(null);
      location.href = "/";
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }
  async function previewVoice() {
    setError("");
    try {
      const r = await fetch("/api/voice/speak", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tuvantamly-Client": "web",
        },
        body: JSON.stringify({
          text: "Chào bạn, mình là Lạc Lạc. Mình sẵn sàng lắng nghe bạn.",
          voice: user?.settings.voice || "coral",
          voice_style: user?.settings.voice_style || "warm",
          speed: user?.settings.speed || 1,
        }),
      });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.detail);
      }
      const url = URL.createObjectURL(await r.blob());
      const a = new Audio(url);
      a.volume = user?.settings.volume ?? 0.8;
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (user.membership_tier !== "vip" && user.role !== "admin") return <div><SectionTitle eyebrow="TÀI KHOẢN" title="Đổi mật khẩu và đăng xuất" /><p>Gói thường sử dụng hai thao tác này. Các tùy chỉnh khác dành cho VIP.</p>{error && <Notice tone="error">{error}</Notice>}{message && <Notice tone="success">{message}</Notice>}<form className="panel settings-form" onSubmit={password}><h2>Đổi mật khẩu</h2><label>Mật khẩu hiện tại<input type="password" name="current" autoComplete="current-password" required maxLength={128} /></label><label>Mật khẩu mới<input type="password" name="new" autoComplete="new-password" required minLength={8} maxLength={128} /></label><button className="button primary">Cập nhật mật khẩu</button></form><button className="button outline" onClick={logout}>Đăng xuất</button></div>;
  return (
    <div>
      <SectionTitle
        eyebrow="THEO CÁCH CỦA BẠN"
        title="Hồ sơ và cài đặt"
        description="Bạn quyết định cách Lạc Lạc đồng hành và dữ liệu được lưu lại."
      />
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <div className="settings-grid">
        <form className="panel settings-form" onSubmit={save}>
          <h2>
            <UserRound size={21} />
            Thông tin của bạn
          </h2>
          <label>
            Tên hiển thị
            <input
              name="name"
              defaultValue={user.name}
              maxLength={80}
              required
            />
          </label>
          <label>
            Email
            <input value={user.email} readOnly />
          </label>
          <hr />
          <h2>
            <ShieldCheck size={21} />
            Quyền riêng tư
          </h2>
          <label className="setting-toggle">
            <div>
              <strong>Cho phép lưu lịch sử trò chuyện</strong>
              <p>Bạn vẫn chọn lưu riêng từng cuộc trò chuyện.</p>
            </div>
            <input
              type="checkbox"
              name="save_history"
              defaultChecked={user.settings.save_history}
            />
          </label>
          <label className="setting-toggle">
            <div>
              <strong>Cho phép lưu kết quả đánh giá</strong>
              <p>Chỉ lưu khi bạn chọn lưu ở cuối bài.</p>
            </div>
            <input
              type="checkbox"
              name="save_assessments"
              defaultChecked={user.settings.save_assessments}
            />
          </label>
          <p className="muted">
            Đổi quyền không xóa dữ liệu cũ. Bạn có thể xóa tại trang lịch sử.
            Admin không mặc định được đọc tâm sự hoặc kết quả của bạn.
          </p>
          <hr />
          <h2>
            <Volume2 size={21} />
            Giọng AI và giao diện
          </h2>
          <div className="two-columns">
            <label>
              Giọng AI
              <select
                name="voice"
                defaultValue={user.settings.voice || "coral"}
              >
                {["coral", "alloy", "sage", "ash", "nova", "onyx"].map((v) => (
                  <option key={v} value={v}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Giao diện
              <select
                name="theme"
                defaultValue={user.settings.theme || "light"}
              >
                <option value="light">Sáng dịu</option>
                <option value="dark">Tối nhẹ</option>
              </select>
            </label>
          </div>
          <label>
            Phong cách giọng nói
            <select
              name="voice_style"
              disabled={!supportsStyle}
              defaultValue={user.settings.voice_style || "warm"}
            >
              <option value="warm">Ấm áp, tự nhiên</option>
              <option value="calm">Điềm tĩnh, nhẹ nhàng</option>
              <option value="clear">Rõ ràng, đều đặn</option>
            </select>
            {!supportsStyle && (
              <span className="muted">
                Cần cấu hình model hỗ trợ chỉ dẫn phong cách để bật lựa chọn
                này.
              </span>
            )}
          </label>
          <label>
            Tốc độ giọng nói
            <input
              name="speed"
              type="range"
              min="0.75"
              max="1.25"
              step="0.05"
              defaultValue={user.settings.speed || 1}
            />
          </label>
          <label>
            Âm lượng
            <input
              name="volume"
              type="range"
              min="0"
              max="1"
              step="0.1"
              defaultValue={user.settings.volume ?? 0.8}
            />
          </label>
          <div className="button-row">
            <button disabled={busy} className="button primary green-shimmer">
              {busy ? "Đang lưu…" : "Lưu cài đặt"}
              <Check size={16} />
            </button>
            <button
              type="button"
              className="button outline"
              onClick={previewVoice}
            >
              <Volume2 size={16} />
              Nghe giọng đã lưu
            </button>
          </div>
        </form>
        <div className="settings-side">
          <form className="panel settings-form" onSubmit={password}>
            <h2>
              <LockKeyhole size={21} />
              Đổi mật khẩu
            </h2>
            <label>
              Mật khẩu hiện tại
              <input
                type="password"
                name="current"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <label>
              Mật khẩu mới
              <input
                type="password"
                name="new"
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
            <button className="button outline full">Cập nhật mật khẩu</button>
          </form>
          <section className="panel settings-form">
            <h2>Tài khoản và dữ liệu</h2>
            <Link className="button outline full" href="/history">
              <Clock size={16} />
              Quản lý lịch sử đã lưu
            </Link>
            <Link className="button outline full" href="/privacy">
              <ShieldCheck size={16} />
              Chính sách quyền riêng tư
            </Link>
            <button className="button outline full" onClick={logout}>
              <LogOut size={16} />
              Đăng xuất
            </button>
            <hr />
            <h3>Xóa tài khoản</h3>
            <p className="muted">
              Xóa tài khoản, phiên đăng nhập, dữ liệu riêng tư và yêu cầu đặt
              lịch khỏi hệ thống đang hoạt động.
            </p>
            <button
              className="button danger-outline full"
              onClick={() => setDeleting(true)}
            >
              <Trash2 size={16} />
              Xóa tài khoản và dữ liệu
            </button>
          </section>
        </div>
      </div>
      {deleting && (
        <ConfirmModal
          title="Xóa tài khoản và dữ liệu?"
          description="Bạn sẽ bị đăng xuất. Tài khoản, tâm sự, kết quả và yêu cầu đặt lịch của bạn sẽ bị xóa khỏi hệ thống đang hoạt động. Thao tác này không thể hoàn tác qua giao diện."
          close={() => setDeleting(false)}
          confirm={remove}
        />
      )}
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  close,
  confirm,
  confirmLabel = "Xác nhận xóa",
}: {
  title: string;
  description: string;
  close: () => void;
  confirm: () => void | Promise<void>;
  confirmLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="modal compact">
        <span className="circle-icon">
          <ShieldCheck size={24} />
        </span>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="button-row">
          <button className="button outline" onClick={close} disabled={busy}>
            Quay lại
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await confirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Đang xử lý…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
function SupportModal({ close }: { close: () => void }) {
  return <SupportDialog close={close} />;
}
function PrivacyPage() {
  return (
    <article className="privacy-page panel">
      <span className="eyebrow">MINH BẠCH VÀ TÔN TRỌNG</span>
      <h1>Dữ liệu của bạn, lựa chọn của bạn.</h1>
      <Notice>
        Bản thử nghiệm nội bộ · Cần bổ sung tên, thông tin liên hệ và chính sách
        vận hành của đơn vị chịu trách nhiệm trước khi mở cho người dùng thật.
      </Notice>
      <h2>Dữ liệu ứng dụng xử lý</h2>
      <p>
        Tài khoản dùng tên và email bạn cung cấp. Tin nhắn và âm thanh được gửi
        đến OpenAI khi bạn sử dụng chức năng AI. Ứng dụng không mặc định lưu
        lịch sử trò chuyện, kết quả đánh giá hoặc bản ghi âm.
      </p>
      <h2>Khi bạn chọn lưu</h2>
      <p>
        Nội dung tâm sự và kết quả được mã hóa tại backend. Bạn có thể xem, xóa
        và thay đổi quyền lưu trong cài đặt. Tắt quyền lưu ngăn việc lưu tiếp;
        không tự xóa các bản đã lưu.
      </p>
      <h2>Nhà cung cấp AI</h2>
      <p>
        Ứng dụng gửi phần ngữ cảnh cần thiết đến OpenAI và yêu cầu không lưu
        trạng thái phản hồi. Điều này không đồng nghĩa nhà cung cấp không có cơ
        chế lưu giữ phục vụ an toàn. Đơn vị vận hành cần công bố các nhà xử lý
        dữ liệu, thời hạn lưu giữ và cơ sở chuyển dữ liệu áp dụng.
      </p>
      <h2>Kết nối chuyên gia</h2>
      <p>
        Chỉ thông tin liên hệ bạn đồng ý cung cấp cho yêu cầu đặt lịch mới được
        dùng để xử lý yêu cầu đó. Lịch sử tâm sự không được tự gửi kèm. Admin
        không mặc định được đọc hội thoại hoặc kết quả đánh giá.
      </p>
      <h2>Xóa dữ liệu</h2>
      <p>
        Bạn có thể xóa từng bản ghi, toàn bộ lịch sử hoặc tài khoản. Xóa tài
        khoản loại bỏ dữ liệu liên quan khỏi cơ sở dữ liệu đang hoạt động. Chính
        sách thời hạn bản sao lưu và quy trình yêu cầu dữ liệu phải được đơn vị
        vận hành hoàn tất trước khi dùng thật.
      </p>
      <h2>Giới hạn và độ tuổi</h2>
      <p>
        Bản thử nghiệm dành cho người từ 18 tuổi. AI có thể hiểu sai và không
        thay thế chuyên gia. Ứng dụng không cung cấp dịch vụ cấp cứu hoặc theo
        dõi liên tục.
      </p>
      <Link href="/settings" className="button primary">
        Quản lý lựa chọn của tôi
        <ArrowRight size={16} />
      </Link>
    </article>
  );
}


