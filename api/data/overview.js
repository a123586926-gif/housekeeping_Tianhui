import { adminDb, getSession, json } from "../_lib/auth.js";

// Authenticated read-only endpoint. Not connected to App.tsx until the
// remaining browser-side Supabase calls are replaced and RLS is tightened.
export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  try {
    const session = await getSession(req);
    if (!session) return json(res, 401, { error: "Not authenticated" });

    const db = adminDb();
    const { data: events, error: eventError } = await db.from("events")
      .select("id, event_date, event_name, event_type, status, notes")
      .order("event_date", { ascending: true });
    if (eventError) throw eventError;

    let roomsQuery = db.from("event_rooms").select(
      "id, event_id, building, floor, room_no, assigned_to, occupant, progress, status, checklist, room_id, cleaner_id, guest_name, stay_status, cleaning_status, cleaning_progress, floor_photo, bathroom_photo, final_photo"
    ).order("id", { ascending: true });

    // Cleaner identities can only read rooms explicitly assigned to them.
    // The server, not a query parameter supplied by the browser, selects owner.
    if (session.user.role === "cleaner") {
      roomsQuery = roomsQuery.eq("assigned_to", session.user.name);
    } else if (session.user.role !== "admin") {
      return json(res, 403, { error: "Forbidden" });
    }

    const { data: eventRooms, error: roomsError } = await roomsQuery;
    if (roomsError) throw roomsError;

    // Cleaners only see event records associated with their own room assignments.
    const permittedEvents = session.user.role === "admin"
      ? events
      : events.filter(e => new Set((eventRooms || []).map(room => room.event_id)).has(e.id));

    return json(res, 200, { events: permittedEvents || [], eventRooms: eventRooms || [] });
  } catch {
    return json(res, 503, { error: "Unable to retrieve room data" });
  }
}
