import { adminDb, getSession, json } from "../_lib/auth.js";

// Read every page, rather than silently hiding rows after Supabase's default
// query result limit. An incomplete read must fail closed, never look like a
// correct housekeeping summary.
const PAGE_SIZE = 500;
const MAX_PAGES = 40;

export async function collectPagedRows(queryFactory, {pageSize=PAGE_SIZE,maxPages=MAX_PAGES}={}) {
  const rows = [];
  for (let page = 0; page < maxPages; page++) {
    const start = page * pageSize;
    const {data,error} = await queryFactory().range(start,start + pageSize - 1);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Invalid paginated data");
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
  throw new Error("Room data exceeds the validated pagination limit");
}

// All room and activity reads require a verified server-side session.
export function createOverviewHandler({dbFactory=adminDb,sessionReader=getSession}={}) {
  return async function handler(req, res) {
    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
    try {
      const session = await sessionReader(req);
      if (!session) return json(res, 401, { error: "Not authenticated" });
      const role = session.user?.role;
      const userId = session.user?.id;
      if (role !== "admin" && role !== "cleaner")
        return json(res, 403, { error: "Forbidden" });
      if ((role === "admin" && userId !== "admin") ||
          (role === "cleaner" && (typeof userId !== "string" ||
            !/^cleaner-[1-9][0-9]*$/.test(userId))))
        return json(res, 403, { error: "Invalid account" });

      const cleanerId = role === "cleaner" ? Number(userId.slice("cleaner-".length)) : null;
      if (role === "cleaner" && !Number.isSafeInteger(cleanerId))
        return json(res, 403, { error: "Invalid account" });
      const db = dbFactory();
      // Independent event and room reads can run concurrently: waiting for
      // two sequential network round trips made each overview refresh slower.
      const [events,eventRooms] = await Promise.all([
        collectPagedRows(() => db.from("events")
          .select("id, event_date, event_name, event_type, status, notes")
          .order("event_date", { ascending: true })
          .order("id", { ascending: true })),
        collectPagedRows(() => {
          let query = db.from("event_rooms").select(
            "id, event_id, building, floor, room_no, assigned_to, occupant, progress, status, checklist, room_id, cleaner_id, guest_name, stay_status, cleaning_status, cleaning_progress, floor_photo, bathroom_photo, final_photo"
          ).order("id", { ascending: true });
          if (role === "cleaner") query = query.eq("cleaner_id", cleanerId);
          return query;
        }),
      ]);

      const assignedEventIds = new Set(eventRooms.map(room => room.event_id));
      const permittedEvents = role === "admin"
        ? events
        : events.filter(event => assignedEventIds.has(event.id))
          .map(event => ({ ...event, notes: "" }));
      const calendarEvents = events.map(event => ({
        id: event.id,
        date: event.event_date,
        name: event.event_name,
        requiresCleaning: event.event_type !== "一般活動",
      }));
      return json(res, 200, {
        events: permittedEvents,
        eventRooms,
        calendarEvents,
      });
    } catch {
      return json(res, 503, { error: "Unable to retrieve room data" });
    }
  };
}

export default createOverviewHandler();
