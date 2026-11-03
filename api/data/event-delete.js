import { adminDb, allowSameOrigin, getSession, json } from "../_lib/auth.js";
import { validId } from "../_lib/validation.js";

// Admin-only event deletion. Event rooms and event are removed atomically.
// Existing external photo files are NOT deleted by this endpoint.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!allowSameOrigin(req)) return json(res, 403, { error: "Origin rejected" });
  try {
    const session = await getSession(req);
    if (!session) return json(res, 401, { error: "Not authenticated" });
    if (session.user.role !== "admin") return json(res, 403, { error: "Admin required" });
    if (!validId(req.body?.id)) return json(res, 400, { error: "Invalid event id" });

    const { data, error } = await adminDb().rpc("hk_delete_event_with_rooms", {
      p_event_id: Number(req.body.id),
    });
    if (error) throw error;
    if (data !== true) return json(res, 404, { error: "Event not found" });
    return json(res, 200, { ok: true });
  } catch {
    return json(res, 503, { error: "Unable to delete event" });
  }
}
