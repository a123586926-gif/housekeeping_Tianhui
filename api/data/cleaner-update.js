import { adminDb, allowSameOrigin, getSession, json } from "../_lib/auth.js";
import { parseCleanerUpdate } from "../_lib/cleanerValidation.js";
import { validId } from "../_lib/validation.js";

// Name changes preserve room assignments. PIN changes revoke existing sessions.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!allowSameOrigin(req)) return json(res, 403, { error: "Origin rejected" });
  try {
    const session = await getSession(req);
    if (!session) return json(res, 401, { error: "Not authenticated" });
    if (session.user.role !== "admin") return json(res, 403, { error: "Admin required" });
    if (!validId(req.body?.id)) return json(res, 400, { error: "Invalid cleaner ID" });
    const payload = parseCleanerUpdate(req.body);
    if (!payload) return json(res, 400, { error: "Invalid name or PIN" });
    const { data, error } = await adminDb().rpc("hk_update_cleaner", {
      p_id: Number(req.body.id), p_name: payload.name, p_new_pin: payload.pin,
    });
    if (error) throw error;
    if (data !== true) return json(res, 404, { error: "Cleaner not found" });
    return json(res, 200, { ok: true });
  } catch {
    return json(res, 503, { error: "Unable to update cleaner" });
  }
}
