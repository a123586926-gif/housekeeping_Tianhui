/**
 * Server-session-backed Housekeeping data access.
 * Use this adapter while converting the original App.tsx.
 * The browser must never use a service-role key or write business tables directly.
 */
export type CalendarEvent = {
  id: number; date: string; name: string; requiresCleaning: boolean;
};
export type DbEvent = {
  id: number; event_date: string; event_name: string;
  event_type: string; status: string; notes: string;
};
export type DbEventRoom = {
  id: number; event_id: number; building: string; floor: string; room_no: string;
  assigned_to: string; occupant: string; progress: number; status: string;
  checklist: unknown; room_id: number | null; cleaner_id: number | null;
  guest_name?: string | null; stay_status?: string | null;
  cleaning_status?: string | null; cleaning_progress?: number | null;
  floor_photo?: string | null; bathroom_photo?: string | null; final_photo?: string | null;
};
export type BusinessOverview = {
  events: DbEvent[];
  eventRooms: DbEventRoom[];
  calendarEvents: CalendarEvent[];
};
export type CleanerInfo = {
  id: number; name: string; is_active: boolean; created_at?: string;
};
export type ActivityInput = {
  event_date: string; event_name: string;
  event_type: "活動" | "一般活動" | "住宿"; notes: string;
};
export type ChecklistUpdate = {
  id: string; done: boolean; photo: boolean;
  subItems: Array<{ id: string; done: boolean }>;
};

export class HousekeepingApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HousekeepingApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  if (!response.ok) {
    throw new HousekeepingApiError(response.status, `房務操作失敗（HTTP ${response.status}）`);
  }
  return await response.json() as T;
}
const jsonBody = (value: unknown) => JSON.stringify(value);

/** All staff can see the shared calendar, but room data is permission-filtered server-side. */
export function getBusinessOverview(): Promise<BusinessOverview> {
  return request<BusinessOverview>("/api/data/overview");
}

/** Admin only. PIN hashes and raw PIN values are never returned. */
export async function getCleaners(): Promise<CleanerInfo[]> {
  const data = await request<{ cleaners: CleanerInfo[] }>("/api/data/cleaners");
  return data.cleaners;
}

/** Admin only. Creates activity and default rooms in one database transaction. */
export function createActivity(event: ActivityInput): Promise<{ eventId: number }> {
  return request("/api/data/event-create", {
    method: "POST", body: jsonBody({ event }),
  });
}

/** Admin only. */
export function editActivity(eventId: number, event: ActivityInput): Promise<{ ok: boolean }> {
  return request("/api/data/event-create", {
    method: "PATCH", body: jsonBody({ eventId, event }),
  });
}

/** Admin only. */
export function deleteActivity(eventId: number): Promise<{ ok: boolean }> {
  return request("/api/data/event-create", {
    method: "DELETE", body: jsonBody({ eventId }),
  });
}

/** Cleaner can update only checklist of the room assigned to their immutable ID. */
export function updateRoomChecklist(roomId: number, checklist: ChecklistUpdate[]): Promise<{ room: unknown }> {
  return request("/api/data/rooms", {
    method: "PATCH", body: jsonBody({ roomId, changes: { checklist } }),
  });
}

/** Admin only; server resolves cleaner IDs, never trusts client role flags. */
export function updateRoomAdministration(
  roomId: number, changes: { occupant?: string; assignedTo?: string },
): Promise<{ room: unknown }> {
  return request("/api/data/rooms", {
    method: "PATCH", body: jsonBody({ roomId, changes }),
  });
}

/** Staging-only QA. The account remains disabled until a separate secure PIN provisioning flow exists. */
export function createQaCleaner(name: string): Promise<{ cleanerId: number }> {
  return request("/api/data/cleaners", {
    method: "POST", body: jsonBody({ name }),
  });
}

/** Staging-only QA; only prefixed test identities may be renamed. */
export function renameQaCleaner(cleanerId: number, name: string): Promise<{ ok: boolean }> {
  return request("/api/data/cleaners", {
    method: "PATCH", body: jsonBody({ action: "rename", cleanerId, name }),
  });
}

/** Staging-only QA; immediately disables and revokes any outstanding sessions. */
export function disableQaCleaner(cleanerId: number): Promise<{ ok: boolean }> {
  return request("/api/data/cleaners", {
    method: "PATCH", body: jsonBody({ action: "disable", cleanerId }),
  });
}

/** Admin only, staging-only QA event. Server supplies the original room checklist. */
export function createQaRoom(input: {
  eventId:number; building:"A"|"B"; floor:"2F"|"3F"|"5F"|"6F"|"7F"|"RF"; roomNo:string;
}):Promise<{ok:boolean;roomId:number}> {
  return request("/api/data/rooms",{
    method:"PUT",body:jsonBody(input),
  });
}

/** Admin only; server refuses fixture rooms and any room with attached photos. */
export function deleteQaRoom(roomId:number):Promise<{ok:boolean}> {
  return request("/api/data/rooms",{
    method:"DELETE",body:jsonBody({roomId}),
  });
}
