// Shared authorization and validation for Housekeeping's server-side API.
// These helpers are not wired to the production React application.
export function validId(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}
export function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day;
}
export function validateEvent(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (!validDate(data.event_date) || typeof data.event_name !== "string" ||
    data.event_name.trim().length < 1 || data.event_name.trim().length > 120 ||
    !["活動", "一般活動", "住宿"].includes(data.event_type) ||
    (data.notes !== undefined && (typeof data.notes !== "string" || data.notes.length > 2000))) return null;
  return {
    event_date: data.event_date,
    event_name: data.event_name.trim(),
    event_type: data.event_type,
    notes: data.notes || "",
  };
}
export function validateRoomPatch(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const allowed = new Set(["assigned_to", "occupant", "status", "progress",
    "checklist", "guest_name", "stay_status", "cleaning_status", "cleaning_progress",
    "cleaner_id", "floor_photo", "bathroom_photo", "final_photo"]);
  const keys = Object.keys(data);
  if (!keys.length || keys.some(key => !allowed.has(key))) return null;
  if ("assigned_to" in data && (typeof data.assigned_to !== "string" || data.assigned_to.length > 120)) return null;
  if ("occupant" in data && (typeof data.occupant !== "string" || data.occupant.length > 2000)) return null;
  if ("status" in data && !["pending", "in_progress", "completed"].includes(data.status)) return null;
  if ("progress" in data && (!Number.isFinite(data.progress) || data.progress < 0 || data.progress > 100)) return null;
  if ("cleaning_progress" in data && (!Number.isFinite(data.cleaning_progress) || data.cleaning_progress < 0 || data.cleaning_progress > 100)) return null;
  if ("checklist" in data && (!Array.isArray(data.checklist) || data.checklist.length > 60 || JSON.stringify(data.checklist).length > 40000)) return null;
  if ("cleaner_id" in data && data.cleaner_id !== null && !validId(data.cleaner_id)) return null;
  for (const key of ["floor_photo", "bathroom_photo", "final_photo", "guest_name", "stay_status", "cleaning_status"]) {
    if (key in data && data[key] !== null && (typeof data[key] !== "string" || data[key].length > 2048)) return null;
  }
  return Object.fromEntries(keys.map(key => [key, data[key]]));
}
