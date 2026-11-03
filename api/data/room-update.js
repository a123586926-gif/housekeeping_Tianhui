import { adminDb, allowSameOrigin, getSession, json } from "../_lib/auth.js";
import { validId, validateRoomPatch } from "../_lib/validation.js";

// Room patch supports cleaner checklist/photo/status for their own assignments.
// Admin may update room assignment/occupant fields. IDs are checked on the server.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!allowSameOrigin(req)) return json(res, 403, { error: "Origin rejected" });
  try {
    const session = await getSession(req);
    if (!session) return json(res, 401, { error: "Not authenticated" });
    if (!req.body || !validId(req.body.id)) return json(res, 400, { error: "Invalid room id" });
    const patch = validateRoomPatch(req.body.patch);
    if (!patch) return json(res, 400, { error: "Invalid room update" });

    const db = adminDb();
    const roomId = Number(req.body.id);
    const { data: room, error: lookupError } = await db.from("event_rooms")
      .select("id, assigned_to").eq("id", roomId).maybeSingle();
    if (lookupError) throw lookupError;
    if (!room) return json(res, 404, { error: "Room not found" });

    if (session.user.role !== "admin") {
      if (session.user.role !== "cleaner" || room.assigned_to !== session.user.name) {
        return json(res, 403, { error: "Forbidden" });
      }
      const cleanerAllowed = new Set(["checklist", "status", "progress", "cleaning_status",
        "cleaning_progress", "floor_photo", "bathroom_photo", "final_photo"]);
      if (Object.keys(patch).some(key => !cleanerAllowed.has(key))) {
        return json(res, 403, { error: "Restricted field" });
      }
    }
    // Assignment guard is repeated on UPDATE to prevent race with reassignment.
    let query = db.from("event_rooms").update(patch).eq("id", roomId);
    if (session.user.role === "cleaner") query = query.eq("assigned_to", session.user.name);
    const { data, error } = await query.select("id").maybeSingle();
    if (error) throw error;
    if (!data) return json(res, 409, { error: "Room assignment has changed" });
    return json(res, 200, { ok: true, id: roomId });
  } catch {
    return json(res, 503, { error: "Unable to update room" });
  }
}
