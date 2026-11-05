import { adminDb, allowSameOrigin, cookieString, getSession, json } from "../_lib/auth.js";

import {pinIsStrong} from "../_lib/pinPolicy.js";

// GET remains unchanged. POST and PATCH are session-protected PIN operations.
// Consolidated into this existing function to stay under Vercel Hobby limits.
export function createSessionHandler({dbFactory=adminDb,sessionReader=getSession,originAllowed=allowSameOrigin,scope="qa"}={}) {
  return async function handler(req, res) {
  if (!["GET", "POST", "PATCH"].includes(req.method)) return json(res, 405, { error: "Method not allowed" });
  if (req.method !== "GET" && !originAllowed(req)) return json(res, 403, { error: "Origin rejected" });
  try {
    const session = await sessionReader(req);
    if (!session) return json(res, req.method === "GET" ? 200 : 401,
      req.method === "GET" ? { authenticated: false } : { error: "Not authenticated" });
    if (req.method !== "GET") {
      const body = req.body || {};
      if (req.method === "POST") {
        if (session.user?.role !== "admin" || session.user.id !== "admin") return json(res, 403, { error: "Admin required" });
        if (!Number.isSafeInteger(body.cleanerId) || body.cleanerId < 1)
          return json(res, 400, { error: "找不到有效的房務人員編號，請重新整理後選擇人員。" });
        if (!pinIsStrong(body.newPin))
          return json(res, 400, { error: "PIN 需為 8～32 位數字，不可使用連號、全部相同數字或重複的短數字組合。" });
        const { data, error } = await dbFactory().rpc(scope==="production" ? "hk_provision_cleaner_pin" : "hk_qa_provision_pin", {
          p_cleaner_id: body.cleanerId, p_new_pin: body.newPin,
        });
        if (error) return json(res, 503, { error: "Unable to provision account" });
        if (data !== true) return json(res, 403, { error: "Account cannot be provisioned" });
        return json(res, 200, { ok: true, cleanerId: body.cleanerId });
      }
      if (typeof body.oldPin !== "string" || body.oldPin.length < 4 || body.oldPin.length > 128 ||
          !pinIsStrong(body.newPin) || body.newPin === body.oldPin)
        return json(res, 400, { error: "Invalid PIN change request" });
      const { data, error } = await dbFactory().rpc("hk_change_own_pin", {
        p_user_id: session.user.id, p_old_pin: body.oldPin, p_new_pin: body.newPin,
      });
      if (error) return json(res, 503, { error: "PIN service unavailable" });
      if (data !== true) return json(res, 401, { error: "Current PIN incorrect or account locked" });
      res.setHeader("Set-Cookie", cookieString("", 0));
      return json(res, 200, { ok: true, signedOut: true });
    }
    return json(res, 200, {
      authenticated: true, user: session.user, expiresAt: session.expiresAt,
    });
  } catch {
    return json(res, 503, { error: "Authentication service unavailable" });
  }
  };
}

export default createSessionHandler({scope:process.env.VERCEL_ENV==="production"?"production":"qa"});
