import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const SESSION_SECONDS = 30 * 24 * 60 * 60;
const COOKIE_NAME = "__Host-housekeeping_session";

export function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

export function sameOrigin(request) {
  // Require an explicit Origin for state-changing requests, including from scripts.
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  const url = new URL(request.url);
  return origin === url.origin && url.protocol === "https:";
}

export function serviceClient() {
  const url = process.env.HOUSEKEEPING_SUPABASE_URL;
  const key = process.env.HOUSEKEEPING_SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Server-side authentication is not configured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function parseSessionCookie(cookieHeader = "") {
  const entry = cookieHeader.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE_NAME + "="));
  const token = entry ? entry.slice(COOKIE_NAME.length + 1) : "";
  // 32 random bytes base64url length 43. Reject malformed cookies.
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function sessionCookie(token, maxAge = SESSION_SECONDS) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookie() {
  return sessionCookie("", 0);
}

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function validPin(value) {
  // Accept legacy numeric PINs only; cap length against denial-of-service.
  return typeof value === "string" && /^[0-9]{4,32}$/.test(value);
}

export function validUserId(value) {
  return typeof value === "string" && /^(admin|cleaner-[1-9][0-9]*)$/.test(value);
}

export function safeCompare(a, b) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export async function getSession(request, supabase = serviceClient()) {
  const token = parseSessionCookie(request.headers.get("cookie") || "");
  if (!token) return null;
  const tokenHash = hashToken(token);

  const { data: session, error } = await supabase
    .from("housekeeping_auth_sessions")
    .select("user_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !session || session.revoked_at || Date.parse(session.expires_at) <= Date.now()) return null;
  const { data: user, error: userError } = await supabase
    .from("housekeeping_auth_users")
    .select("user_id, display_name, role, active")
    .eq("user_id", session.user_id)
    .maybeSingle();

  if (userError || !user || user.active !== true) return null;
  if (user.role !== "admin" && user.role !== "cleaner") return null;
  return {
    user: { id: user.user_id, name: user.display_name, role: user.role },
    expiresAt: session.expires_at,
    tokenHash,
  };
}

// All cookie-authenticated mutations should reject a non-matching Origin.
export function methodNotAllowed(allowed) {
  return json({ error: "Method not allowed" }, 405, { Allow: allowed });
}
