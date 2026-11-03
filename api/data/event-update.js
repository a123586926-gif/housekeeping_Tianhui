import { adminDb, allowSameOrigin, getSession, json } from "../_lib/auth.js";
import { validId, validateEvent } from "../_lib/validation.js";

// Isolated admin-only update. No production UI references this endpoint yet.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!allowSameOrigin(req)) return json(res, 403, { error: "Origin rejected" });
  try {
    const session = await getSession(req);
    if (!session) return json(res, 401, { error: "Not authenticated" });
    if (session.user.role !== "admin") return json(res, 403, { error: "Admin required" });
    if (!req.body || !validId(req.body.id)) return json(res, 400, { error: "Invalid event id" });
    const payload = validateEvent(req.body.event);
    if (!payload) return json(res, 400, { error: "Invalid event data" });
    const { data, error } = await adminDb().from("events")
      .update(payload).eq("id", Number(req.body.id)).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return json(res, 404, { error: "Event not found" });
    return json(res, 200, { ok: true, id: data.id });
  } catch {
    return json(res, 503, { error: "Unable to update event" });
  }
}
