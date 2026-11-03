/**
 * Client-side contract for a future server-verified 30-day login session.
 *
 * IMPORTANT:
 * - These helpers are intentionally NOT connected to App.tsx yet.
 * - Never persist a PIN, a role, or an authentication token in localStorage.
 * - The server must validate HttpOnly session cookies on every protected API.
 * - Do not activate until the server endpoints and Supabase RLS are ready.
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
    (user.role === "admin" || user.role === "cleaner")
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
  return readSession();
}

/** Logout must invalidate the session on the server and clear its HttpOnly cookie. */
export async function signOutSession(): Promise<void> {
  await request<unknown>("/api/auth/logout", { method: "POST" });
}

/** Only admins may provision explicitly marked QA identities. PIN is never persisted. */
export async function provisionQaPin(cleanerId: number, newPin: string): Promise<void> {
  await request<{ok:boolean}>("/api/auth/pin", {
    method: "POST", body: JSON.stringify({ cleanerId, newPin }),
  });
}

/** Requires existing PIN; on success all sessions are revoked and the cookie cleared. */
export async function changeOwnPin(oldPin: string, newPin: string): Promise<void> {
  await request<{ok:boolean,signedOut:boolean}>("/api/auth/pin", {
    method: "PATCH", body: JSON.stringify({ oldPin, newPin }),
  });
}
