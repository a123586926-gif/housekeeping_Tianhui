import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { assertQaEnvironment } from "./qaGuard.js";

const COOKIE = "__Host-hk_session";
const LIFETIME = 30 * 24 * 60 * 60;
let client;

export function adminDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Server-side Supabase configuration is missing");
  assertQaEnvironment({vercelEnv:process.env.VERCEL_ENV,supabaseUrl:url});
  if (!client) client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
export function json(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(status).json(body);
}
export function allowSameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (typeof origin !== "string" || typeof host !== "string") return false;
  try {
    const target = new URL(origin);
    return target.protocol === "https:" && target.host === host;
  } catch { return false; }
}
export function shaToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
export function cookieString(token, maxAge = LIFETIME) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}
export function getCookie(req) {
  const header = req.headers.cookie || "";
  const match = header.match(/(?:^|;\s*)__Host-hk_session=([a-f0-9]{64})(?:;|$)/);
  return match?.[1] || null;
}
export async function getSession(req) {
  const token = getCookie(req);
  if (!token) return null;
  const db = adminDb();
  const { data, error } = await db.from("hk_auth_sessions")
    .select("user_id, expires_at, revoked_at")
    .eq("token_hash", shaToken(token)).maybeSingle();
  if (error || !data || data.revoked_at || Date.parse(data.expires_at) <= Date.now()) return null;
  const { data: account, error: accountError } = await db.from("hk_auth_accounts")
    .select("user_id, display_name, role, active").eq("user_id", data.user_id).maybeSingle();
  if (accountError || !account || !account.active) return null;
  return {
    user: { id: account.user_id, name: account.display_name, role: account.role },
    expiresAt: data.expires_at,
    tokenHash: shaToken(token),
  };
}
export function newSessionToken() { return randomBytes(32).toString("hex"); }
export const MAX_AGE_SECONDS = LIFETIME;
