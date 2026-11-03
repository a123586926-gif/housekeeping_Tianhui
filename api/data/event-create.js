import { adminDb, allowSameOrigin, getSession, json } from "../_lib/auth.js";
import { validateEvent } from "../_lib/validation.js";
import { buildDefaultEventRooms } from "../_lib/defaultRooms.js";

// Admin-only atomic event + default rooms creation.
// The database RPC must be installed in the isolated test environment first.
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  if (!allowSameOrigin(req)) return json(res, 403, { error: "Origin rejected" });
  try {
    const session = await getSession(req);
    if (!session) return json(res, 401, { error: "Not authenticated" });
    if (session.user.role !== "admin") return json(res, 403, { error: "Admin required" });

    const event = validateEvent(req.body?.event);
    if (!event) return json(res, 400, { error: "Invalid event data" });
    const rooms = event.event_type === "活動" ? buildDefaultEventRooms() : [];
    const { data, error } = await adminDb().rpc("hk_create_event_with_rooms", {
      p_event_date: event.event_date,
      p_event_name: event.event_name,
      p_event_type: event.event_type,
      p_notes: event.notes,
      p_rooms: rooms,
    });
    if (error) throw error;
    if (!Number.isSafeInteger(Number(data)) || Number(data) < 1) {
      throw new Error("Unexpected database response");
    }
    return json(res, 201, { ok: true, eventId: Number(data), roomsCreated: rooms.length });
  } catch {
    return json(res, 503, { error: "Unable to create event" });
  }
}
