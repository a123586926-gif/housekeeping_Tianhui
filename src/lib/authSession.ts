/**
 * QA-only client contract for a server-verified 30-day login session.
 *
 * IMPORTANT:
 * - App.tsx currently uses these helpers on the development branch.
 * - Never persist a PIN, role, or authentication token in localStorage.
 * - The server must validate HttpOnly cookies on every protected API.
 * - Production rollout remains blocked until the separate database
 *   migration, RLS review and account provisioning are explicitly approved.
 */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type SessionRole = "admin" | "cleaner";

export type AuthenticatedUser = {
  id: string;
  name: string;
  role: SessionRole;
};

export type SessionResult =
  | { authenticated: true; user: AuthenticatedUser; expiresAt: string }
  | { authenticated: false };

type ApiSessionResponse = {
  authenticated?: unknown;
  user?: unknown;
  expiresAt?: unknown;
};

function isAuthenticatedUser(value: unknown): value is AuthenticatedUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<AuthenticatedUser>;
  return (
    typeof user.id === "string" &&
    typeof user.name === "string" &&
    user.name.trim().length > 0 &&
    ((user.role === "admin" && user.id === "admin") ||
      (user.role === "cleaner" && /^cleaner-[1-9][0-9]*$/.test(user.id)))
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Authentication request failed (HTTP ${response.status})`);
  }
  return (await response.json()) as T;
}

/** Checks a server-side session. Does not infer authentication from a local flag. */
export async function readSession(): Promise<SessionResult> {
  const result = await request<ApiSessionResponse>("/api/auth/session", {
    method: "GET",
    cache: "no-store",
  });

  if (
    result.authenticated === true &&
    isAuthenticatedUser(result.user) &&
    typeof result.expiresAt === "string" &&
    Number.isFinite(Date.parse(result.expiresAt)) &&
    Date.parse(result.expiresAt) > Date.now()
  ) {
    return { authenticated: true, user: result.user, expiresAt: result.expiresAt };
  }
  return { authenticated: false };
}

/**
 * PIN is sent once over HTTPS to the server for verification.
 * Do not store it in browser persistence or in any log.
 */
export async function signInWithPin(userId: string, pin: string): Promise<SessionResult> {
  await request<unknown>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ userId, pin }),
  });
  const session = await readSession();
  // Another browser tab could have replaced the shared HttpOnly cookie between
  // the login response and this session read. Never accept another identity.
  if (!session.authenticated || session.user.id !== userId) {
    throw new Error("登入帳號已變更，請重新確認目前登入狀態。");
  }
  return session;
}

/** Logout must invalidate the session on the server and clear its HttpOnly cookie. */
export async function signOutSession(): Promise<void> {
  await request<unknown>("/api/auth/logout", { method: "POST" });
}

/** Only admins may provision explicitly marked QA identities. PIN is never persisted. */
export async function provisionQaPin(cleanerId: number, newPin: string): Promise<void> {
  await request<{ok:boolean}>("/api/auth/session", {
    method: "POST", body: JSON.stringify({ cleanerId, newPin }),
  });
}

/** Requires existing PIN; on success all sessions are revoked and the cookie cleared. */
export async function changeOwnPin(oldPin: string, newPin: string): Promise<void> {
  await request<{ok:boolean,signedOut:boolean}>("/api/auth/session", {
    method: "PATCH", body: JSON.stringify({ oldPin, newPin }),
  });
}
