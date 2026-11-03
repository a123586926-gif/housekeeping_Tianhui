import { adminDb, allowSameOrigin, getSession, json } from "../_lib/auth.js";

const MAX_ROOMS_PER_EVENT = 120;
const FLOOR = new Set(["2F", "3F", "5F", "6F", "7F", "RF"]);
const BUILDING = new Set(["A", "B"]);
const STATUS = new Set(["pending", "in_progress", "completed"]);

function validId(id) {
  const value = Number(id);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
function validText(value, max) {
  return typeof value === "string" && value.length <= max;
}
function validChecklist(input) {
  return Array.isArray(input) && input.length <= 30 && input.every(item =>
    item && typeof item.id === "string" && item.id.length <= 60 &&
    typeof item.done === "boolean" && typeof item.photo === "boolean" &&
    Array.isArray(item.subItems) && item.subItems.length <= 30 &&
    item.subItems.every(sub => sub && typeof sub.id === "string" &&
      sub.id.length <= 60 && typeof sub.done === "boolean")
  );
}
function sanitizeChecklist(items) {
  return items.map(item => ({
    id: item.id,
    done: item.done,
    photo: item.photo,
    subItems: item.subItems.map(sub => ({ id: sub.id, done: sub.done })),
  }));
}
function statusOf(checklist) {
  const count = checklist.filter(item => item.done).length;
  if (count === 0) return "pending";
  if (count === checklist.length) return "completed";
  return "in_progress";
}
function bad(res) { return json(res, 400, { error: "Invalid room update" }); }

export default async function handler(req, res) {
  if (req.method !== "PATCH") return json(res, 405, { error: "Method not allowed" });
  if (!allowSameOrigin(req)) return json(res, 403, { error: "Origin rejected" });
  const body = req.body || {};
  const roomId = validId(body.roomId);
  if (!roomId || !body.changes || typeof body.changes !== "object" ||
      Array.isArray(body.changes)) return bad(res);

  const changes = body.changes;
  const keys = Object.keys(changes);
  const allowed = new Set(["occupant", "assignedTo", "checklist"]);
  if (!keys.length || keys.some(key => !allowed.has(key))) return bad(res);
  if ("occupant" in changes && !validText(changes.occupant, 3000)) return bad(res);
  if ("assignedTo" in changes && !validText(changes.assignedTo, 120)) return bad(res);
  if ("checklist" in changes && !validChecklist(changes.checklist)) return bad(res);

  try {
    const session = await getSession(req);
    if (!session) return json(res, 401, { error: "Not authenticated" });
    const { role, id: userId } = session.user;
    const cleanerId = role === "cleaner" ? Number(userId.slice("cleaner-".length)) : null;
    if (role !== "admin" && role !== "cleaner") return json(res, 403, { error: "Forbidden" });
    if (role === "cleaner" && keys.some(key => key !== "checklist")) {
      return json(res, 403, { error: "Cleaners can only update checklists" });
    }

    const db = adminDb();
    const { data: existing, error: fetchError } = await db.from("event_rooms")
      .select("id, cleaner_id, checklist, event_id").eq("id", roomId).maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) return json(res, 404, { error: "Room not found" });
    if (role === "cleaner" && existing.cleaner_id !== cleanerId) {
      return json(res, 403, { error: "Room not assigned to this cleaner" });
    }

    const payload = {};
    if ("occupant" in changes) {
      payload.occupant = changes.occupant;
      payload.guest_name = changes.occupant || null;
      payload.stay_status = changes.occupant.trim() ? "住宿中" : "空房";
    }
    if ("assignedTo" in changes) {
      payload.assigned_to = changes.assignedTo;
      // Resolve ID on server instead of trusting a client-provided cleaner_id.
      if (changes.assignedTo === "未分配") payload.cleaner_id = null;
      else {
        const { data: cleaner, error: cleanerError } = await db.from("cleaners")
          .select("id").eq("name", changes.assignedTo).eq("is_active", true).maybeSingle();
        if (cleanerError) throw cleanerError;
        if (!cleaner) return bad(res);
        payload.cleaner_id = cleaner.id;
      }
    }
    if ("checklist" in changes) {
      const next = sanitizeChecklist(changes.checklist);
      // Keep server-side definitions; only apply incoming completion flags.
      const original = Array.isArray(existing.checklist) ? existing.checklist : [];
      if (next.length !== original.length || next.some((item, index) =>
        original[index]?.id !== item.id ||
        !Array.isArray(original[index]?.subItems) ||
        original[index].subItems.length !== item.subItems.length ||
        item.subItems.some((sub, i) => original[index].subItems[i]?.id !== sub.id)
      )) return bad(res);
      const merged = original.map((item, i) => ({
        ...item,
        done: next[i].done,
        // Photo completion is controlled only by the separate verified photo endpoint.
        photo: item.photo,
        subItems: item.subItems.map((sub, j) => ({ ...sub, done: next[i].subItems[j].done })),
      }));
      // Items requiring photos cannot be marked done without an existing photo.
      for (const item of merged) {
        if (item.requiredPhoto && !item.photo) item.done = false;
      }
      const status = statusOf(merged);
      const progress = merged.length ? Math.round(100 * merged.filter(i => i.done).length / merged.length) : 0;
      payload.checklist = merged;
      payload.status = status;
      payload.progress = progress;
      payload.cleaning_status = status === "completed" ? "已完成" : status === "in_progress" ? "進行中" : "未開始";
      payload.cleaning_progress = progress;
    }
    // Repeat ownership constraint in the UPDATE itself. A reassignment between
    // the earlier read and this write must not permit a stale cleaner to write.
    let updateQuery = db.from("event_rooms")
      .update(payload).eq("id", roomId);
    if (role === "cleaner") {
      updateQuery = updateQuery.eq("cleaner_id", cleanerId);
    }
    const { data: updated, error: updateError } = await updateQuery
      .select("id, event_id, status, progress").maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return json(res, 403, { error: "Room assignment changed; update rejected" });
    return json(res, 200, { room: updated });
  } catch {
    return json(res, 503, { error: "Unable to update room" });
  }
}
