import { adminDb, allowSameOrigin, cookieString, json, MAX_AGE_SECONDS, newSessionToken, shaToken } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!allowSameOrigin(req)) return json(res, 403, { error: "Origin rejected" });
  const body = req.body;
  const { userId, pin } = typeof body === "object" && body !== null ? body : {};
  if (typeof userId !== "string" || !/^(admin|cleaner-\d+)$/.test(userId) ||
      typeof pin !== "string" || pin.length < 4 || pin.length > 128) {
    return json(res, 400, { error: "Invalid credentials" });
  }
  try {
    const db = adminDb();
    // RPC verifies a bcrypt PIN hash and atomically enforces attempt limits.
    const { data, error } = await db.rpc("hk_verify_login", { p_user_id: userId, p_pin: pin });
    if (error || !verifiedLoginIdentity(data, userId)) {
      return json(res, 401, { error: "Invalid credentials or temporarily locked" });
    }
    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000).toISOString();
    const { error: insertError } = await db.from("hk_auth_sessions").insert({
      token_hash: shaToken(token), user_id: userId, expires_at: expiresAt,
    });
    if (insertError) throw insertError;
    res.setHeader("Set-Cookie", cookieString(token));
    return json(res, 200, { authenticated: true });
  } catch {
    return json(res, 503, { error: "Authentication service unavailable" });
  }
}
