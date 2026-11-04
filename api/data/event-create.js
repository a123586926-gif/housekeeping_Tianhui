import { adminDb, allowSameOrigin, getSession, json } from "../_lib/auth.js";
import { validateEvent, validId } from "../_lib/validation.js";
import { buildDefaultEventRooms } from "../_lib/defaultRooms.js";

// Admin-only atomic event + default rooms creation.
// The database RPC must be installed in the isolated test environment first.
export default async function handler(req, res) {
  if (!["POST", "PATCH", "DELETE"].includes(req.method)) return json(res, 405, { error: "Method not allowed" });
  if (!allowSameOrigin(req)) return json(res, 403, { error: "Origin rejected" });
  try {
    const session = await getSession(req);
    if (!session) return json(res, 401, { error: "Not authenticated" });
    if (session.user.role !== "admin") return json(res, 403, { error: "Admin required" });

    const db = adminDb();
    if (req.method !== "POST") {
      const eventId = Number(req.body?.eventId);
      if (!validId(eventId)) return json(res,400,{error:"Invalid event ID"});
      const {data: existing, error: guardError} = await db.from("events")
        .select("id,event_name").eq("id",eventId).maybeSingle();
      if (guardError) throw guardError;
      if (!existing) return json(res,404,{error:"Event not found"});
      if (!existing.event_name.startsWith("【權限驗收】") && ![9101,9102,9103].includes(eventId))
        return json(res,403,{error:"Only QA events may be modified in sandbox"});
      if (req.method === "DELETE") {
        const {data: photos,error: photoError} = await db.from("event_rooms")
          .select("id").eq("event_id",eventId)
          .or("floor_photo.not.is.null,bathroom_photo.not.is.null,final_photo.not.is.null").limit(1);
        if(photoError) throw photoError;
        if(photos?.length) return json(res,409,{error:"Event has cleaning photos; deletion blocked"});
      }
    }
    if (req.method === "DELETE") {
      if (!validId(req.body?.eventId)) return json(res, 400, { error: "Invalid event ID" });
      // event_rooms in the isolated test schema use ON DELETE CASCADE.
      // Production compatibility must be checked before real integration.
      const { data, error } = await db.from("events")
        .delete().eq("id", Number(req.body.eventId)).select("id").maybeSingle();
      if (error) throw error;
      return data ? json(res, 200, { ok: true }) : json(res, 404, { error: "Event not found" });
    }
    const event = validateEvent(req.body?.event);
    if (!event) return json(res, 400, { error: "Invalid event data" });
    if (req.method === "POST" && !event.event_name.startsWith("【權限驗收】"))
      return json(res,403,{error:"Sandbox only accepts QA-labeled activities"});
    if (req.method === "PATCH") {
      // The original fixture events may be edited inside this isolated QA database.
      // Other non-QA events remain protected, and callers cannot gain permission by
      // renaming an unrelated event.
      const { data, error } = await db.from("events").update(event)
        .eq("id", Number(req.body.eventId)).select("id").maybeSingle();
      if (error) throw error;
      return data ? json(res, 200, { ok: true }) : json(res, 404, { error: "Event not found" });
    }
    const rooms = event.event_type === "活動" ? buildDefaultEventRooms() : [];
    const { data, error } = await db.rpc("hk_create_event_with_rooms", {
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
