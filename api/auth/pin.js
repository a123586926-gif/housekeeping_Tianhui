import { adminDb, allowSameOrigin, cookieString, getSession, json } from "../_lib/auth.js";

const pinIsStrong = value => typeof value === "string" && /^[0-9]{8,32}$/.test(value);

// Feature-branch QA endpoint. Never return, log, or persist plaintext PINs.
// POST: admin provisions QA-prefixed cleaner, and PATCH: signed-in user rotates own PIN.
export default async function handler(req, res) {
  if (!["POST", "PATCH"].includes(req.method)) return json(res, 405, { error: "Method not allowed" });
  if (!allowSameOrigin(req)) return json(res, 403, { error: "Origin rejected" });
  try {
    const session = await getSession(req);
    if (!session) return json(res, 401, { error: "Not authenticated" });
    const body = req.body || {};
    const db = adminDb();

    if (req.method === "POST") {
      if (session.user.role !== "admin") return json(res, 403, { error: "Admin required" });
      if (!Number.isSafeInteger(body.cleanerId) || body.cleanerId < 1 || !pinIsStrong(body.newPin)) {
        return json(res, 400, { error: "Use an 8-32 digit PIN for a QA cleaner" });
      }
      const { data, error } = await db.rpc("hk_qa_provision_pin", {
        p_cleaner_id: body.cleanerId,
        p_new_pin: body.newPin,
      });
      if (error) return json(res, 503, { error: "Unable to provision QA cleaner" });
      if (data !== true) return json(res, 403, { error: "Only QA-prefixed cleaners may be provisioned" });
      return json(res, 200, { ok: true, cleanerId: body.cleanerId });
    }

    if (typeof body.oldPin !== "string" || body.oldPin.length < 4 || body.oldPin.length > 128 ||
        !pinIsStrong(body.newPin) || body.oldPin === body.newPin) {
      return json(res, 400, { error: "Invalid PIN change request" });
    }
    const { data, error } = await db.rpc("hk_change_own_pin", {
      p_user_id: session.user.id,
      p_old_pin: body.oldPin,
      p_new_pin: body.newPin,
    });
    if (error) return json(res, 503, { error: "Unable to update PIN" });
    if (data !== true) return json(res, 401, { error: "Current PIN incorrect or account locked" });

    // All database sessions are now revoked, including this one.
    res.setHeader("Set-Cookie", cookieString("", 0));
    return json(res, 200, { ok: true, signedOut: true });
  } catch {
    return json(res, 503, { error: "PIN service unavailable" });
  }
}
