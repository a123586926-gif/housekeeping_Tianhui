/**
 * Pure read-only compatibility analysis. Never inserts or updates production rows.
 * The caller supplies metadata-only room rows, without occupant, PIN or photo URLs.
 * Do not interpret absent room_id as a missing activity room; the legacy production
 * schema has a separate optional master rooms table.
 */
import { buildDefaultEventRooms } from "../api/_lib/defaultRooms.js";

export const CHECKLIST_IDS = Object.freeze(
  ["flooring", "surface_cleaning", "bed_setup", "bathroom"]
);
const requiredPhotos = new Set(["flooring", "bathroom"]);

function key({building,floor,room_no}) {
  return `${building}/${floor}/${room_no}`;
}
function validChecklist(items) {
  if (!Array.isArray(items) || items.length !== CHECKLIST_IDS.length) return false;
  if (items.some((item,i)=>!item || item.id!==CHECKLIST_IDS[i] ||
    item.requiredPhoto!==requiredPhotos.has(item.id) ||
    !Array.isArray(item.subItems))) return false;
  return true;
}

/**
 * @param {Array<{id:number, event_id:number, building:string, floor:string,
 *   room_no:string, room_id?:number|null, checklist?:unknown}>} actualRooms
 * @param {number[]} eventIds - ONLY existing event IDs observed in a read-only audit.
 * @returns {{safeToReuseExistingRows:boolean, expectedRooms:number,
 *   existingRows:number, errors:string[], warnings:string[], eventSummaries:Array}}
 */
export function auditExistingRooms(actualRooms,eventIds) {
  if (!Array.isArray(actualRooms) || !Array.isArray(eventIds) ||
    eventIds.length===0 || eventIds.some(x=>!Number.isSafeInteger(x)||x<=0) ||
    new Set(eventIds).size!==eventIds.length)
    throw new TypeError("Expected audited event IDs and sanitized room rows");
  const template=buildDefaultEventRooms();
  const expectedKeys=new Set(template.map(key));
  const errors=[];
  const warnings=[];
  const seenRoomIds=new Set();
  const eventSummaries=[];
  if (actualRooms.length>120*eventIds.length)
    errors.push("Unexpected volume: more than 120 rooms per audited event");

  for(const eventId of eventIds){
    const rows=actualRooms.filter(row=>row.event_id===eventId);
    const actualKeys=new Set();
    let duplicates=0,invalidChecklists=0,missingMasterLinks=0,invalidRoomIds=0;
    for(const row of rows){
      if(!Number.isSafeInteger(row.id)||row.id<=0||seenRoomIds.has(row.id))
        invalidRoomIds++;
      seenRoomIds.add(row.id);
      const roomKey=key(row);
      if(actualKeys.has(roomKey)) duplicates++;
      actualKeys.add(roomKey);
      if(row.checklist!==undefined&&!validChecklist(row.checklist))invalidChecklists++;
      if(row.room_id==null)missingMasterLinks++;
    }
    const missing=[...expectedKeys].filter(k=>!actualKeys.has(k));
    const extra=[...actualKeys].filter(k=>!expectedKeys.has(k));
    if(missing.length||extra.length||duplicates||invalidRoomIds||invalidChecklists)
      errors.push(`Event ${eventId}: missing ${missing.length}, extra ${extra.length}, duplicate ${duplicates}, invalid IDs ${invalidRoomIds}, invalid checklists ${invalidChecklists}`);
    if(missingMasterLinks)
      warnings.push(`Event ${eventId}: ${missingMasterLinks} optional room_id values are NULL; preserve original identifiers and do not auto-backfill`);
    eventSummaries.push({
      eventId,rows:rows.length,missing:missing.length,extra:extra.length,
      duplicates,invalidRoomIds,invalidChecklists,missingMasterLinks,
    });
  }
  if(actualRooms.some(row=>!eventIds.includes(row.event_id)))
    errors.push("Input contains unapproved event IDs");
  return {
    safeToReuseExistingRows:errors.length===0,
    expectedRooms:expectedKeys.size*eventIds.length,
    existingRows:actualRooms.length,
    errors,warnings,eventSummaries,
  };
}
