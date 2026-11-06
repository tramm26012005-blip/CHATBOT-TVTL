import { api, ApiError, type User } from "./api";

export async function loadSession(signal: AbortSignal): Promise<User | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api<User>("/auth/me", { signal });
    } catch (error) {
      if (signal.aborted) throw error;
      // Only an explicit unauthenticated response means the session is gone.
      if (error instanceof ApiError && error.status === 401) return null;
      const retryable = !(error instanceof ApiError) ||
        error.status >= 500 || error.status === 408 || error.status === 429;
      if (!retryable || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
      signal.throwIfAborted();
    }
  }
}
