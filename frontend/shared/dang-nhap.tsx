"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Headphones,
  LoaderCircle,
  LockKeyhole,
  Mail,
  UserRound,
  UserRoundPlus,
} from "lucide-react";
import { api, type User } from "@/lib/api";
import { BrandWordmark } from "./thuong-hieu";
import "./dang-nhap.css";

export default function AuthEntry({
  path,
  onUser,
  onSupport,
}: {
  path: string;
  onUser: (user: User) => void;
  onSupport: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [showPassword, setShowPassword] = useState(false);
  const register = path === "/register",
    forgot = path === "/forgot-password",
    reset = path === "/reset-password";
  useEffect(() => {
    if (reset) router.replace("/forgot-password");
  }, [reset, router]);
  const formRef = useRef<HTMLFormElement>(null);
  const [challenge, setChallenge] = useState("");
  const [recoveryToken, setRecoveryToken] = useState("");
  const [otp, setOtp] = useState("");
  const [emailSent, setEmailSent] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    setChallenge("");
    setRecoveryToken("");
    setOtp("");
    setError("");
    setFieldErrors({});
    setMessage(
      path === "/login" &&
        new URLSearchParams(window.location.search).get("password_reset") ===
          "success"
        ? "Đã đổi mật khẩu thành công. Bạn hãy đăng nhập bằng mật khẩu mới."
        : "",
    );
  }, [path]);

  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  function fieldMessage(input: HTMLInputElement): string {
    const value = input.value;
    if (input.name === "privacy")
      return input.checked
        ? ""
        : "Bạn cần đồng ý chính sách quyền riêng tư để đăng ký.";
    const labels: Record<string, string> = {
      name: "họ tên",
      email: "email",
      password: "mật khẩu",
      otp: "mã OTP",
      password_confirm: "xác nhận mật khẩu",
    };
    if (!value.trim())
      return `Vui lòng nhập ${labels[input.name] || "thông tin"}.`;
    if (input.name === "email") {
      if (
        input.validity.typeMismatch ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      )
        return "Email chưa đúng định dạng, ví dụ: tenban@gmail.com.";
      if (register && !/@gmail\.com$/i.test(value))
        return "Vui lòng sử dụng địa chỉ @gmail.com để đăng ký.";
    }
    if (
      input.name === "password" &&
      (register || reset || !!recoveryToken) &&
      value.length < 8
    )
      return "Mật khẩu cần có ít nhất 8 ký tự.";
    if (
      input.name === "password_confirm" &&
      value !==
        formRef.current?.querySelector<HTMLInputElement>(
          'input[name="password"]',
        )?.value
    )
      return "Mật khẩu xác nhận chưa khớp.";
    if (input.name === "otp" && !/^[0-9]{6}$/.test(value))
      return "Vui lòng nhập đủ 6 chữ số của mã OTP.";
    if (input.maxLength > 0 && value.length > input.maxLength)
      return `Thông tin không được vượt quá ${input.maxLength} ký tự.`;
    return "";
  }
  function fieldFeedback(name: string) {
    return fieldErrors[name] ? (
      <span
        id={`auth-error-${name}`}
        className="auth-entry-field-error"
        role="alert"
      >
        {fieldErrors[name]}
      </span>
    ) : null;
  }
  function validateFields(form: HTMLFormElement) {
    const errors: Record<string, string> = {};
    let first: HTMLInputElement | undefined;
    for (const input of Array.from(
      form.querySelectorAll<HTMLInputElement>("input[required]"),
    )) {
      if (input.closest("fieldset[hidden]")) continue;
      const message = fieldMessage(input);
      if (message) {
        errors[input.name] = message;
        first ??= input;
      }
    }
    setFieldErrors(errors);
    first?.focus();
    return !first;
  }
  function refreshField(input: HTMLInputElement) {
    if (!input.required || input.closest("fieldset[hidden]")) return;
    setFieldErrors((previous) => ({
      ...previous,
      [input.name]: fieldMessage(input),
    }));
  }
  async function sendCode(form: FormData) {
    const result = await api<{
      challenge: string;
      expires_in: number;
      resend_after: number;
      message: string;
    }>(forgot ? "/auth/forgot-password" : "/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
        privacy_accepted: form.get("privacy") === "on",
        previous_challenge: challenge || undefined,
      }),
    });
    const timestamp = Date.now();
    setFieldErrors({});
    setChallenge(result.challenge);
    setOtp("");
    setEmailSent(String(form.get("email")));
    setClock(timestamp);
    setExpiresAt(timestamp + result.expires_in * 1000);
    setResendAt(timestamp + result.resend_after * 1000);
    setMessage(result.message);
  }
  async function resend() {
    if (!formRef.current || busy || Date.now() < resendAt) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await sendCode(new FormData(formRef.current));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function editEmail() {
    setBusy(true);
    setError("");
    try {
      await api(
        forgot ? "/auth/forgot-password/cancel" : "/auth/register/cancel",
        {
          method: "POST",
          body: JSON.stringify({ challenge }),
        },
      );
      setFieldErrors({});
      setChallenge("");
      setOtp("");
      setMessage("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setMessage("");
    if (!validateFields(event.currentTarget)) return;
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      if (register) {
        if (!challenge) {
          await sendCode(form);
        } else {
          const user = await api<User>("/auth/register/verify", {
            method: "POST",
            body: JSON.stringify({ challenge, otp }),
          });
          onUser(user);
          router.push("/");
        }
      } else if (forgot) {
        if (recoveryToken) {
          await api("/auth/reset-password", {
            method: "POST",
            body: JSON.stringify({
              token: recoveryToken,
              password: form.get("password"),
            }),
          });
          setRecoveryToken("");
          setChallenge("");
          setOtp("");
          formRef.current?.reset();
          router.push("/login?password_reset=success");
        } else if (challenge) {
          const result = await api<{ token: string }>(
            "/auth/forgot-password/verify",
            { method: "POST", body: JSON.stringify({ challenge, otp }) },
          );
          setRecoveryToken(result.token);
          setFieldErrors({});
          setMessage(
            "Xác thực thành công. Bạn hãy đặt mật khẩu mới trong 10 phút.",
          );
        } else {
          await sendCode(form);
        }
      } else if (reset) {
        await api("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({
            token:
              new URLSearchParams(location.hash.slice(1)).get("token") || "",
            password: form.get("password"),
          }),
        });
        history.replaceState(null, "", "/reset-password");
        setMessage("Đã đặt lại mật khẩu. Bạn có thể đăng nhập.");
      } else {
        const user = await api<User>("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email: form.get("email"),
            password: form.get("password"),
          }),
        });
        onUser(user);
        router.push(user.role === "admin" ? "/admin" : user.role === "expert" ? "/expert" : "/");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={`auth-entry ${register ? "is-register" : !forgot && !reset ? "is-login" : ""}`}
    >
      <a className="skip-link" href="#auth-form">
        Đến biểu mẫu
      </a>
      <div className="auth-entry-art" aria-hidden="true">
        <img src="/images/hinh%20nen.jpg" alt="" />
        {Array.from({ length: 10 }, (_, i) => (
          <i key={i} className="auth-entry-mote" />
        ))}
      </div>
      <div className="auth-entry-content">
        <header className="auth-entry-brand">
          <h1 className="sr-only">Tư vấn tâm lý</h1>
          <BrandWordmark
            className="is-scaled"
            tagline="LẮNG NGHE · ĐỒNG HÀNH · CHIA SẺ"
          />
        </header>
        <main
          className={`auth-entry-card ${register ? "is-register" : ""}`}
          id="auth-form"
        >
          <h2>
            {forgot
              ? recoveryToken
                ? "Đặt mật khẩu mới"
                : challenge
                  ? "Xác thực email"
                  : "Quên mật khẩu"
              : reset
                ? "Đặt mật khẩu mới"
                : <>{register ? "Đăng ký" : "Đăng nhập"} để <TitleMark /></>}
          </h2>
          <p className="auth-entry-description">
            {forgot ? (
              recoveryToken ? (
                "Chọn mật khẩu mới có ít nhất 8 ký tự."
              ) : (
                "Nhập email đã đăng ký để nhận mã OTP khôi phục mật khẩu."
              )
            ) : reset ? (
              "Chọn mật khẩu có ít nhất 8 ký tự để bảo vệ tài khoản của bạn."
            ) : (
              <>
                Nếu bạn cần hỗ trợ ngay, bấm nút{" "}
                <button type="button" onClick={onSupport}>
                  Cần hỗ trợ ngay
                </button>{" "}
                ở góc phải màn hình – luôn có người đồng hành và lắng nghe cùng
                bạn.
              </>
            )}
          </p>
          {!forgot && !reset && (
            <nav
              className="auth-entry-tabs"
              aria-label="Chọn đăng nhập hoặc đăng ký"
            >
              <Link
                href="/login"
                className={!register ? "selected" : ""}
                aria-current={!register ? "page" : undefined}
              >
                <UserRound size={21} />
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className={register ? "selected" : ""}
                aria-current={register ? "page" : undefined}
              >
                <UserRoundPlus size={21} />
                Đăng ký
              </Link>
            </nav>
          )}
          {error && (
            <div className="auth-entry-alert error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="auth-entry-alert success" role="status">
              {message}
            </div>
          )}
          <form
            ref={formRef}
            onSubmit={submit}
            className="auth-entry-form"
            noValidate
            onBlur={(event) => {
              if (event.target instanceof HTMLInputElement)
                refreshField(event.target);
            }}
            onInput={(event) => {
              if (
                event.target instanceof HTMLInputElement &&
                fieldErrors[event.target.name]
              )
                refreshField(event.target);
            }}
            onChange={(event) => {
              if (
                event.target instanceof HTMLInputElement &&
                event.target.type === "checkbox"
              )
                refreshField(event.target);
            }}
          >
            <fieldset
              className="auth-entry-details"
              hidden={
                (register && !!challenge) ||
                (forgot && !!challenge && !recoveryToken)
              }
            >
              {register && (
                <label className="auth-entry-field">
                  <span>
                    <UserRound size={18} />
                    Họ tên
                  </span>
                  <input
                    name="name"
                    aria-invalid={!!fieldErrors.name}
                    aria-describedby={
                      fieldErrors.name ? "auth-error-name" : undefined
                    }
                    autoComplete="name"
                    placeholder="Nhập họ tên của bạn…"
                    maxLength={80}
                    required
                  />
                  {fieldFeedback("name")}
                </label>
              )}
              <div
                className={
                  register ? "auth-entry-field-row" : "auth-entry-field-stack"
                }
              >
                {!reset && !(forgot && recoveryToken) && (
                  <label className="auth-entry-field">
                    <span>
                      <Mail size={18} />
                      Email
                    </span>
                    <input
                      name="email"
                      aria-invalid={!!fieldErrors.email}
                      aria-describedby={
                        fieldErrors.email ? "auth-error-email" : undefined
                      }
                      type="email"
                      autoComplete="email"
                      placeholder={
                        register ? "tenban@gmail.com" : "Nhập email của bạn…"
                      }
                      pattern={
                        register
                          ? "[^@\\s]+@[gG][mM][aA][iI][lL]\\.[cC][oO][mM]"
                          : undefined
                      }
                      title={
                        register
                          ? "Vui lòng nhập địa chỉ @gmail.com của bạn"
                          : undefined
                      }
                      maxLength={254}
                      required
                    />
                    {fieldFeedback("email")}
                  </label>
                )}
                {(!forgot || !!recoveryToken) && (
                  <div className="auth-entry-field">
                    <label htmlFor="auth-password">
                      <LockKeyhole size={18} />
                      Mật khẩu
                    </label>
                    <div className="auth-entry-password">
                      <input
                        id="auth-password"
                        name="password"
                        aria-invalid={!!fieldErrors.password}
                        aria-describedby={
                          fieldErrors.password
                            ? "auth-error-password"
                            : undefined
                        }
                        type={showPassword ? "text" : "password"}
                        autoComplete={
                          register || reset || !!recoveryToken
                            ? "new-password"
                            : "current-password"
                        }
                        placeholder={
                          register || reset || !!recoveryToken
                            ? "Ít nhất 8 ký tự"
                            : "Nhập mật khẩu của bạn…"
                        }
                        minLength={register || reset || recoveryToken ? 8 : 1}
                        maxLength={128}
                        required
                      />
                      <button
                        type="button"
                        aria-label={
                          showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                        }
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <Eye size={22} />
                        ) : (
                          <EyeOff size={22} />
                        )}
                      </button>
                    </div>
                    {fieldFeedback("password")}
                  </div>
                )}
              </div>
              {!register && !forgot && !reset && (
                <Link className="auth-entry-forgot" href="/forgot-password">
                  Quên mật khẩu?
                </Link>
              )}
              {register && (
                <div className="auth-entry-consent">
                  <label>
                    <input
                      name="privacy"
                      type="checkbox"
                      required
                      aria-invalid={!!fieldErrors.privacy}
                      aria-describedby={
                        fieldErrors.privacy ? "auth-error-privacy" : undefined
                      }
                    />
                    <span>
                      Tôi đã đọc{" "}
                      <Link href="/privacy">chính sách quyền riêng tư</Link> và
                      đồng ý xử lý dữ liệu để sử dụng dịch vụ.
                    </span>
                  </label>
                  {fieldFeedback("privacy")}
                </div>
              )}
              {forgot && recoveryToken && (
                <label className="auth-entry-field auth-entry-confirm">
                  <span>Xác nhận mật khẩu mới</span>
                  <input
                    name="password_confirm"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Nhập lại mật khẩu mới"
                    maxLength={128}
                    required
                    aria-invalid={!!fieldErrors.password_confirm}
                    aria-describedby={
                      fieldErrors.password_confirm
                        ? "auth-error-password_confirm"
                        : undefined
                    }
                  />
                  {fieldFeedback("password_confirm")}
                </label>
              )}
            </fieldset>
            {(register || forgot) && challenge && !recoveryToken && (
              <div className="auth-entry-otp">
                <p>
                  Mã xác thực gửi đến <strong>{emailSent}</strong>
                </p>
                <label className="auth-entry-field">
                  <span>Mã OTP gồm 6 chữ số</span>
                  <input
                    autoFocus
                    name="otp"
                    aria-invalid={!!fieldErrors.otp}
                    aria-describedby={
                      fieldErrors.otp ? "auth-error-otp" : undefined
                    }
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  />
                  {fieldFeedback("otp")}
                </label>
                <p>
                  {clock >= expiresAt
                    ? "Mã đã hết hạn. Vui lòng gửi mã mới."
                    : `Mã còn hiệu lực ${Math.max(0, Math.ceil((expiresAt - clock) / 1000))} giây.`}
                </p>
                <div className="auth-entry-otp-actions">
                  <button
                    type="button"
                    disabled={busy || clock < resendAt}
                    onClick={resend}
                  >
                    {clock < resendAt
                      ? `Gửi lại sau ${Math.ceil((resendAt - clock) / 1000)}s`
                      : "Gửi lại mã"}
                  </button>
                  <button type="button" disabled={busy} onClick={editEmail}>
                    {forgot ? "Đổi email" : "Sửa thông tin đăng ký"}
                  </button>
                </div>
              </div>
            )}
            <button
              className="auth-entry-submit"
              disabled={
                busy ||
                ((register || forgot) &&
                  !!challenge &&
                  !recoveryToken &&
                  clock >= expiresAt)
              }
            >
              <span>
                {busy
                  ? "Đang xử lý…"
                  : register
                    ? challenge
                      ? "Xác nhận đăng ký"
                      : "Đăng ký"
                    : forgot
                      ? recoveryToken
                        ? "Lưu mật khẩu mới"
                        : challenge
                          ? "Xác thực OTP"
                          : "Gửi mã OTP"
                      : reset
                        ? "Lưu mật khẩu mới"
                        : "Đăng nhập"}
              </span>
              <span className="auth-entry-submit-icon">
                {busy ? (
                  <LoaderCircle className="spin" size={22} />
                ) : (
                  <ArrowRight size={23} />
                )}
              </span>
            </button>
          </form>
          <div className="auth-entry-switch">
            <span>
              {register
                ? "Bạn đã có tài khoản?"
                : forgot || reset
                  ? "Quay lại trò chuyện?"
                  : "Bạn chưa có tài khoản?"}{" "}
              <Link href={register || forgot || reset ? "/login" : "/register"}>
                {register || forgot || reset ? "Đăng nhập" : "Đăng ký ngay"}
                <span aria-hidden="true"> ›</span>
              </Link>
            </span>
          </div>
          <p className="auth-entry-footnote">
            <LockKeyhole size={12} />
            Bạn chủ động lựa chọn việc lưu tâm sự. Lạc Lạc là trợ lý AI, không
            thay thế chuyên gia.
          </p>
        </main>
      </div>
      <button
        className="urgent-support-button"
        onClick={onSupport}
        aria-haspopup="dialog"
      >
        <Headphones size={19} />
        <span>Cần hỗ trợ ngay</span>
      </button>
    </div>
  );
}

/* "trò chuyện" with the hand-drawn underline that ends in a heart. */
function TitleMark() {
  return (
    <span className="auth-entry-title-mark">
      trò chuyện
      <svg viewBox="0 0 300 60" aria-hidden="true">
        <path pathLength={1} d="M2 52 C70 58 170 56 252 40" />
        <path pathLength={1} d="M252 40 C226 26 222 8 238 6 C247 5 252 11 254 16 C258 7 268 3 276 8 C286 16 274 32 252 40 Z" />
        <path pathLength={1} d="M276 28 C284 30 290 27 298 20" />
      </svg>
    </span>
  );
}
