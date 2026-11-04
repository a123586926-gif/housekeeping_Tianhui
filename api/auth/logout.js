import { adminDb, allowSameOrigin, cookieString, getCookie, json, shaToken } from "../_lib/auth.js";

export function createLogoutHandler({dbFactory=adminDb,originAllowed=allowSameOrigin,cookieReader=getCookie,now=()=>new Date()}={}) {
  return async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!originAllowed(req)) return json(res, 403, { error: "Origin rejected" });
  const token = cookieReader(req);
  if (token) {
    try {
      const { error } = await dbFactory().from("hk_auth_sessions")
        .update({ revoked_at: now().toISOString() }).eq("token_hash", shaToken(token));
      if (error) return json(res, 503, { error: "Unable to revoke session" });
    } catch { return json(res, 503, { error: "Authentication service unavailable" }); }
  }
  res.setHeader("Set-Cookie", cookieString("", 0));
  return json(res, 200, { authenticated: false });
  };
}

export default createLogoutHandler();
