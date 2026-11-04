import { randomUUID } from "node:crypto";
import { buildChecklist } from "../_lib/defaultRooms.js";
import { adminDb, allowSameOrigin, getSession, json } from "../_lib/auth.js";

const MAX_ROOMS_PER_EVENT = 120;
const FLOOR = new Set(["2F", "3F", "5F", "6F", "7F", "RF"]);
const BUILDING = new Set(["A", "B"]);
const STATUS = new Set(["pending", "in_progress", "completed"]);

function validId(id) {
  // Reject coercible values (true, [1], "1e0", "01") before reaching a database query.
  if (typeof id === "number") return Number.isSafeInteger(id) && id > 0 ? id : null;
  if (typeof id !== "string" || !/^[1-9][0-9]*$/.test(id)) return null;
  const value = Number(id);
  return Number.isSafeInteger(value) ? value : null;
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
  if (checklist.length > 0 && count === checklist.length) return "completed";
  return "in_progress";
}
const PHOTO_BUCKET = "hk-qa-cleaning-photos";
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const PHOTO_FIELDS = { flooring: "floor_photo", bathroom: "bathroom_photo" };

function decodePhoto(base64, mime) {
  if (typeof base64 !== "string" || base64.length > Math.ceil(PHOTO_MAX_BYTES * 4 / 3) + 8 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) return null;
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > PHOTO_MAX_BYTES) return null;
  const matches = mime === "image/jpeg"
    ? bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : mime === "image/png"
      ? bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : bytes.length >= 12 && bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP";
  return matches ? bytes : null;
}

async function viewPhoto(req, res, db, session) {
  const roomId = validId(req.query?.roomId);
  const itemId = req.query?.itemId;
  if (!roomId || !["flooring", "bathroom"].includes(itemId)) return bad(res);
  const field = PHOTO_FIELDS[itemId];
  const cleanerId = session.user.role === "cleaner"
    ? Number(session.user.id.slice("cleaner-".length)) : null;
  let query = db.from("event_rooms")
    .select("id,cleaner_id,floor_photo,bathroom_photo").eq("id",roomId);
  if (session.user.role === "cleaner") query = query.eq("cleaner_id",cleanerId);
  const {data:room,error} = await query.maybeSingle();
  if(error) throw error;
  if(!room) return json(res,403,{error:"Room not accessible"});
  const path = room[field];
  if(typeof path !== "string" || !path.startsWith(`room-${roomId}/${itemId}/`))
    return json(res,404,{error:"Photo not found"});
  const {data:signed,error:signError} = await db.storage.from(PHOTO_BUCKET).createSignedUrl(path,60);
  if(signError || !signed?.signedUrl) return json(res,503,{error:"Photo unavailable"});
  return json(res,200,{signedUrl:signed.signedUrl,expiresIn:60});
}

async function uploadPhoto(req, res, db, session) {
  const body = req.body || {};
  const roomId = validId(body.roomId);
  const itemId = body.itemId;
  if (!roomId || typeof itemId !== "string" || !Object.hasOwn(PHOTO_FIELDS, itemId))
    return bad(res);
  const bytes = decodePhoto(body.base64, body.mime);
  if (!bytes) return json(res, 400, { error: "Only valid JPEG, PNG or WebP under 2 MB allowed" });
  const cleanerId = session.user.role === "cleaner"
    ? Number(session.user.id.slice("cleaner-".length)) : null;
  if (session.user.role !== "admin" && (!Number.isSafeInteger(cleanerId) || cleanerId < 1))
    return json(res, 403, { error: "Forbidden" });
  const { data: room, error: readError } = await db.from("event_rooms")
    .select("id, cleaner_id, checklist, floor_photo, bathroom_photo, final_photo").eq("id",roomId).maybeSingle();
  if (readError) throw readError;
  if (!room) return json(res, 404, { error: "Room not found" });
  if (session.user.role === "cleaner" && room.cleaner_id !== cleanerId)
    return json(res, 403, { error: "Not assigned to this room" });
  const items = room.checklist;
  const itemIndex = Array.isArray(items) ? items.findIndex(i => i.id === itemId) : -1;
  if (itemIndex < 0 || items[itemIndex]?.requiredPhoto !== true)
    return json(res, 400, { error: "This item does not require a photo" });

  const ext = body.mime === "image/jpeg" ? "jpg" : body.mime === "image/png" ? "png" : "webp";
  const photoPath = `room-${roomId}/${itemId}/${randomUUID()}.${ext}`;
  const { error: uploadError } = await db.storage.from(PHOTO_BUCKET).upload(photoPath,bytes,{
    contentType:body.mime, upsert:false, cacheControl:"0",
  });
  if (uploadError) return json(res, 503, { error: "Photo storage unavailable" });
  const nextChecklist = items.map((item,i) => i === itemIndex ? { ...item, photo:true } : item);
  const field = PHOTO_FIELDS[itemId];
  const previousPhoto = room[field];
  let mutation = db.from("event_rooms").update({
    checklist: nextChecklist, [field]: photoPath,
  }).eq("id",roomId);
  if (session.user.role === "cleaner") mutation=mutation.eq("cleaner_id",cleanerId);
  mutation = previousPhoto == null ? mutation.is(field,null) : mutation.eq(field,previousPhoto);
  // Only save when the checklist has not changed since it was read.
  mutation = mutation.eq("checklist",JSON.stringify(items));
  const { data: updated, error: updateError } = await mutation.select("id").maybeSingle();
  if (updateError || !updated) {
    await db.storage.from(PHOTO_BUCKET).remove([photoPath]);
    return json(res, updateError ? 503 : 403, {
      error: updateError ? "Unable to save photo reference" : "Room assignment changed",
    });
  }
  if(typeof previousPhoto === "string" &&
     previousPhoto.startsWith(`room-${roomId}/${itemId}/`) &&
     previousPhoto !== photoPath) {
    // Failure to remove a displaced object is safe but should be flagged
    // for later manual orphan reconciliation.
    const {error:cleanupError} = await db.storage.from(PHOTO_BUCKET).remove([previousPhoto]);
    if(cleanupError) console.error("QA photo cleanup needs reconciliation", {roomId,itemId});
  }
  return json(res, 200, { ok: true, roomId, itemId, photoStored:true });
}
function bad(res) { return json(res, 400, { error: "Invalid room update" }); }

export function createRoomsHandler({
  dbFactory=adminDb,sessionReader=getSession,originAllowed=allowSameOrigin,
}={}) {
  return async function handler(req, res) {
  if (!["PATCH", "POST", "GET", "PUT", "DELETE"].includes(req.method)) return json(res, 405, { error: "Method not allowed" });
  // Uploads are temporarily paused by owner request; photo reads remain enabled.
  // Reject before session, database or Storage access, including direct API callers.
  if (req.method === "POST") return json(res, 503, { error: "Photo upload is temporarily paused" });
  if (req.method !== "GET" && !originAllowed(req)) return json(res, 403, { error: "Origin rejected" });
  try {
    const session = await sessionReader(req);
    if (!session) return json(res, 401, { error: "Not authenticated" });
    const { role, id: userId } = session.user;
    const cleanerId = role === "cleaner" ? Number(userId.slice("cleaner-".length)) : null;
    if (role !== "admin" && role !== "cleaner") return json(res, 403, { error: "Forbidden" });
    const db = dbFactory();
    if (req.method === "PUT" || req.method === "DELETE") {
      if (role !== "admin") return json(res,403,{error:"Admin required"});
      const body=req.body || {};
      if(req.method === "PUT") {
        const eventId=validId(body.eventId);
        const building=body.building, floor=body.floor, roomNo=body.roomNo;
        if(!eventId || !BUILDING.has(building) || !FLOOR.has(floor) ||
           typeof roomNo !== "string" || !/^[A-Za-z0-9]{1,8}$/.test(roomNo))
          return bad(res);
        const {data:id,error}=await db.rpc("hk_qa_create_room_full",{
          p_event_id:eventId,p_building:building,p_floor:floor,
          p_room_no:roomNo.toUpperCase(),p_checklist:buildChecklist(),
        });
        if(error) return json(res,409,{error:"Room create rejected (duplicate, limit or protected event)"});
        return json(res,201,{ok:true,roomId:Number(id)});
      }
      const roomId=validId(body.roomId);
      if(!roomId) return bad(res);
      const {data:deleted,error}=await db.rpc("hk_qa_delete_room",{p_room_id:roomId});
      if(error) return json(res,503,{error:"Unable to remove room"});
      return deleted===true ? json(res,200,{ok:true}) :
        json(res,403,{error:"Protected room or room has photos"});
    }
    if (req.method === "POST") return await uploadPhoto(req,res,db,session);
    if (req.method === "GET") return await viewPhoto(req,res,db,session);
    const body = req.body || {};
    const roomId = validId(body.roomId);
    if (!roomId || !body.changes || typeof body.changes !== "object" ||
        Array.isArray(body.changes)) return bad(res);
    const changes = body.changes;
    const keys = Object.keys(changes);
    const allowed = new Set(["occupant","assignedTo","checklist"]);
    if (!keys.length || keys.some(key => !allowed.has(key))) return bad(res);
    if ("occupant" in changes && !validText(changes.occupant,3000)) return bad(res);
    if ("assignedTo" in changes && !validText(changes.assignedTo,120)) return bad(res);
    if ("checklist" in changes && !validChecklist(changes.checklist)) return bad(res);
    // Optional optimistic-lock snapshot supplied by the editing UI.
    // Exclude server-owned labels and descriptions from the comparison.
    if ("expectedChecklist" in body && !validChecklist(body.expectedChecklist)) return bad(res);
    if (role === "cleaner" && keys.some(key => key !== "checklist")) {
      return json(res, 403, { error: "Cleaners can only update checklists" });
    }

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
      const previous = Array.isArray(existing.checklist) ? existing.checklist : [];
      if ("expectedChecklist" in body &&
        JSON.stringify(sanitizeChecklist(previous)) !==
        JSON.stringify(sanitizeChecklist(body.expectedChecklist))) {
        return json(res,409,{error:"Checklist changed since it was opened; reload room before saving"});
      }
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
      // Owner-approved temporary policy: checklist work may finish without a photo.
      // Keep the persisted photo flag unchanged: only the photo endpoint may set it.
      // Reject inconsistent completion flags; a completed parent must have all children done.
      if (merged.some(item => item.done && item.subItems.some(sub => !sub.done))) return bad(res);
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
    // Database compare-and-swap also guards races between the read above and
    // the UPDATE. The UI then reloads and lets the user retry safely.
    if ("checklist" in changes) {
      updateQuery = updateQuery.eq("checklist",JSON.stringify(existing.checklist));
    }
    const { data: updated, error: updateError } = await updateQuery
      .select("id, event_id, status, progress").maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return json(res,"checklist" in changes ? 409 : 403, {
      error:"checklist" in changes ? "Checklist changed while saving; reload required" :
        "Room assignment changed; update rejected",
    });
    return json(res, 200, { room: updated });
  } catch {
    return json(res, 503, { error: "Unable to update room" });
  }
  };
}

export default createRoomsHandler();
