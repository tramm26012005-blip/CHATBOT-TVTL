export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      "X-Tuvantamly-Client": "web",
      ...options.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const labels: Record<string, string> = {
      email: "Email",
      password: "Mật khẩu",
      name: "Tên hiển thị",
      adult: "Xác nhận độ tuổi",
      privacy_accepted: "Đồng ý chính sách",
      new_password: "Mật khẩu mới",
    };
    const detail = Array.isArray(data.detail)
      ? data.detail
          .map((e: any) => {
            const field = labels[e.loc?.at(-1)] || e.loc?.at(-1) || "Thông tin";
            if (e.type === "string_too_short")
              return `${field} cần ít nhất ${e.ctx?.min_length} ký tự.`;
            if (e.type === "missing")
              return `Vui lòng nhập ${field.toLowerCase()}.`;
            if (e.loc?.at(-1) === "email") return "Địa chỉ email chưa hợp lệ.";
            return `${field}: thông tin chưa hợp lệ.`;
          })
          .join(" ")
      : typeof data.detail === "string"
        ? data.detail
        : "Dịch vụ tạm chưa sẵn sàng. Bạn hãy thử lại.";
    throw new ApiError(detail, response.status);
  }
  return response.json();
}
export type Message = { role: "user" | "assistant"; content: string };
export type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  expert_id?: string | null;
  membership_tier?: "normal" | "vip";
  vip_expires_at?: string | null;
  membership_demo?: boolean;
  settings: Record<string, any>;
};

/** Fired after each chat request so the daily allowance shown in the sidebar can refresh. */
export const PLAN_USAGE_EVENT = "tuvantamly:plan-usage";

export async function chatStream(
  messages: Message[],
  save: boolean,
  conversationId: string | null,
  signal: AbortSignal,
  onEvent: (event: any) => void,
) {
  const response = await fetch("/api/chat", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Tuvantamly-Client": "web" },
    body: JSON.stringify({
      messages: messages.slice(-24),
      save,
      conversation_id: conversationId,
    }),
    signal,
  });
  window.dispatchEvent(new Event(PLAN_USAGE_EVENT));
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Chưa kết nối được AI.");
  }
  if (!response.body)
    throw new Error("Trình duyệt chưa hỗ trợ phản hồi trực tiếp.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts)
      if (part.startsWith("data: ")) onEvent(JSON.parse(part.slice(6)));
  }
}
