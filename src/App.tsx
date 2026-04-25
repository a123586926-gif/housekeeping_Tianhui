import React, { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Image as ImageIcon,
  Plus,
  Printer,
  ShieldCheck,
  UserPlus,
  Users,
  WandSparkles,
} from "lucide-react";
import { supabase } from "./lib/supabase";

type Role = "cleaner" | "admin";
type RoomStatus = "pending" | "in_progress" | "completed";
type BuildingType = "A" | "B";
type FloorType = "2F" | "3F" | "5F" | "6F" | "7F" | "RF";
type AdminView = "overview" | "activity" | "staff" | "calendar";
type OverviewFilter = "all" | "completed" | "in_progress" | "pending";

type User = {
  id: string;
  dbId?: number;
  name: string;
  role: Role;
  pin: string;
};

type DbCleaner = {
  id: number;
  name: string;
  pin: string;
  is_active: boolean;
  created_at?: string;
};

type SubItem = {
  id: string;
  label: string;
  done: boolean;
};

type ChecklistItem = {
  id: string;
  label: string;
  description: string;
  requiredPhoto: boolean;
  done: boolean;
  photo: boolean;
  subItems: SubItem[];
};

type Room = {
  id: string;
  dbId?: number;
  eventId?: number;
  building: BuildingType;
  floor: FloorType;
  roomNo: string;
  assignedTo: string;
  occupant: string;
  status: RoomStatus;
  checklist: ChecklistItem[];
};

type Activity = {
  id: string;
  dbId?: number;
  date: string;
  name: string;
  contact: string;
  category: string;
  requiresCleaning: boolean;
  guestCount: string;
  rooms: Room[];
};

type DbEvent = {
  id: number;
  event_date: string;
  event_name: string;
  event_type?: string | null;
  status?: string | null;
  notes?: string | null;
};

type DbEventRoom = {
  id: number;
  event_id: number;
  building?: string | null;
  floor?: string | null;
  room_no?: string | null;
  assigned_to?: string | null;
  occupant?: string | null;
  progress?: number | null;
  status?: string | null;
  checklist?: ChecklistItem[] | null;
  room_id?: number | null;
  cleaner_id?: number | null;
  guest_name?: string | null;
  stay_status?: string | null;
  cleaning_status?: string | null;
  cleaning_progress?: number | null;
  note?: string | null;
  floor_photo?: string | null;
  bathroom_photo?: string | null;
  final_photo?: string | null;
};

type PhotoAction =
  | {
      roomId: string;
      itemId: string;
      mode: "item";
    }
  | {
      roomId: string;
      itemId: string;
      mode: "subitem";
      subItemId: string;
    }
  | {
      roomId: string;
      itemId: string;
      mode: "photoOnly";
    };

const FLOOR_OPTIONS: FloorType[] = ["2F", "3F", "5F", "6F", "7F", "RF"];
const ROOM_NUMBER_SUFFIXES = ["1", "2", "3", "5", "6", "7", "8"];

const adminUser: User = {
  id: "admin",
  name: "admin",
  role: "admin",
  pin: "885288",
};

const checklistTemplate = [
  {
    id: "flooring",
    label: "掃地・拖地",
    description: "地板需清潔乾淨，無明顯灰塵、毛髮、污漬。",
    requiredPhoto: true,
    subItems: [
      { id: "sweep", label: "掃地" },
      { id: "mop", label: "拖地" },
    ],
  },
  {
    id: "surface_cleaning",
    label: "擦桌椅櫃子洗手台",
    description: "桌面、椅子、櫃體、洗手台表面需擦拭乾淨。",
    requiredPhoto: false,
    subItems: [
      { id: "table", label: "擦桌子" },
      { id: "chair", label: "擦椅子" },
      { id: "cabinet", label: "擦櫃子" },
      { id: "sink", label: "擦洗手台" },
    ],
  },
  {
    id: "bed_setup",
    label: "整理床鋪",
    description: "鋪設床墊、床罩、棉被、枕頭與最後擺設完整。",
    requiredPhoto: false,
    subItems: [
      { id: "mattress", label: "鋪設床墊" },
      { id: "bed_cover", label: "鋪設床罩" },
      { id: "quilt", label: "棉被＋被套" },
      { id: "pillow", label: "枕頭套" },
      { id: "bed_final", label: "最後擺設完整" },
    ],
  },
  {
    id: "bathroom",
    label: "廁所清潔",
    description: "擺放踏墊、沐浴乳／肥皂、衛生紙、吹風機。",
    requiredPhoto: true,
    subItems: [
      { id: "bathroom_clean", label: "廁所清潔完成" },
      { id: "mat", label: "擺放踏墊" },
      { id: "soap", label: "擺放沐浴乳／肥皂" },
      { id: "toilet_paper", label: "擺放衛生紙" },
      { id: "dryer", label: "擺放吹風機" },
    ],
  },
] as const;

function buildChecklist(): ChecklistItem[] {
  return checklistTemplate.map((item) => ({
    ...item,
    done: false,
    photo: false,
    subItems: item.subItems.map((sub) => ({
      ...sub,
      done: false,
    })),
  }));
}

function computeRoomStatus(checklist: ChecklistItem[]): RoomStatus {
  const total = checklist.length;
  const completed = checklist.filter((item) => item.done).length;
  if (completed === 0) return "pending";
  if (completed === total) return "completed";
  return "in_progress";
}

function roomProgress(room: Room): number {
  const total = room.checklist.length;
  const done = room.checklist.filter((item) => item.done).length;
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function formatDate(date: string): string {
  return date.replace(/-/g, "/");
}

function formatDateToInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function roomLabel(room: Pick<Room, "building" | "roomNo">): string {
  return `${room.building}棟${room.roomNo}房`;
}

function splitGuestLines(value: string): string[] {
  return value
    .split(/\n|、|,|，/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function gradientButton(active: boolean): string {
  return active
    ? "border-transparent bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_50%,#b5ae86_100%)] text-white shadow-[0_10px_24px_rgba(110,99,67,0.22)]"
    : "border-[#d8cebe] bg-[linear-gradient(180deg,#fbf8f2_0%,#f1eadf_100%)] text-[#6a5f4a] shadow-[0_6px_16px_rgba(83,69,45,0.08)]";
}

function statusText(status: RoomStatus): string {
  if (status === "completed") return "已完成";
  if (status === "in_progress") return "進行中";
  return "未開始";
}

function statusTextClass(status: RoomStatus): string {
  if (status === "completed") return "text-emerald-700";
  if (status === "in_progress") return "text-amber-700";
  return "text-slate-500";
}

function buildDefaultRooms(): Room[] {
  const buildings: BuildingType[] = ["A", "B"];
  const rooms: Room[] = [];

  buildings.forEach((building) => {
    FLOOR_OPTIONS.forEach((floor) => {
      const floorPrefix = floor === "RF" ? "R" : floor.replace("F", "0");

      ROOM_NUMBER_SUFFIXES.forEach((suffix) => {
        rooms.push({
          id: `${building}-${floor}-${floorPrefix}${suffix}`,
          building,
          floor,
          roomNo: `${floorPrefix}${suffix}`,
          assignedTo: "未分配",
          occupant: "",
          status: "pending",
          checklist: buildChecklist(),
        });
      });
    });
  });

  return rooms;
}

function buildCalendarDays(baseDate: Date): Date[] {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());

  return Array.from(
    { length: 42 },
    (_, i) =>
      new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate() + i
      )
  );
}

function monthLabel(date: Date): string {
  return `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
}

function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function parseDateStart(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0);
}

function isPastActivity(date: string, today: Date): boolean {
  return parseDateStart(date).getTime() < today.getTime();
}

function sortActivitiesByClosestDate(list: Activity[], today: Date): Activity[] {
  return [...list].sort((a, b) => {
    const aDate = parseDateStart(a.date).getTime();
    const bDate = parseDateStart(b.date).getTime();
    const todayTime = today.getTime();

    const aPast = aDate < todayTime;
    const bPast = bDate < todayTime;

    if (aPast !== bPast) return aPast ? 1 : -1;
    if (!aPast && !bPast) return aDate - bDate;
    return bDate - aDate;
  });
}

function getClosestCleaningActivity(list: Activity[], today: Date): Activity | null {
  const cleaning = list.filter((item) => item.requiresCleaning);
  if (cleaning.length === 0) return null;
  const sorted = sortActivitiesByClosestDate(cleaning, today);
  return sorted[0] || null;
}

function getPhotoFieldByChecklistItem(
  itemId: string
): "floor_photo" | "bathroom_photo" | "final_photo" {
  if (itemId === "flooring") return "floor_photo";
  if (itemId === "bathroom") return "bathroom_photo";
  return "final_photo";
}

function SectionTitle({
  title,
  sub,
  icon,
}: {
  title: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#f3ece1_0%,#e7dcc8_100%)] text-[#8a7756] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_16px_rgba(89,72,47,0.10)]">
        {icon}
      </div>
      <div>
        <div className="text-[16px] font-semibold tracking-tight text-[#4f4435]">
          {title}
        </div>
        {sub ? <div className="mt-0.5 text-[11px] leading-4 text-[#8e8475]">{sub}</div> : null}
      </div>
    </div>
  );
}

export default function App() {
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showLogin, setShowLogin] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [pin, setPin] = useState("");

  const [viewMode, setViewMode] = useState<"staff" | "admin">("staff");
  const [roomFilter, setRoomFilter] = useState<"all" | "completed" | "pending">("all");
  const [adminView, setAdminView] = useState<AdminView>("overview");
  const [overviewFilter, setOverviewFilter] = useState<OverviewFilter>("all");
  const [expandedRoomId, setExpandedRoomId] = useState("");
  const [expandedStaffName, setExpandedStaffName] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calendarSheetDate, setCalendarSheetDate] = useState("");

  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityModalMode, setActivityModalMode] = useState<"add" | "edit">("add");
  const [editingActivityId, setEditingActivityId] = useState("");
  const [activityName, setActivityName] = useState("");
  const [activityDate, setActivityDate] = useState(formatDateToInput(new Date()));
  const [activityContact, setActivityContact] = useState("");
  const [activityNeedsCleaning, setActivityNeedsCleaning] = useState(true);

  const [showRoomModal, setShowRoomModal] = useState(false);
  const [newRoomBuilding, setNewRoomBuilding] = useState<BuildingType>("A");
  const [newRoomFloor, setNewRoomFloor] = useState<FloorType>("2F");
  const [newRoomNo, setNewRoomNo] = useState("201");
  const [newOccupant, setNewOccupant] = useState("");
  const [newRoomStaff, setNewRoomStaff] = useState("未分配");

  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffModalMode, setStaffModalMode] = useState<"add" | "edit">("add");
  const [editingStaffId, setEditingStaffId] = useState("");
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffPin, setNewStaffPin] = useState("");

  const [activitySelectedBuilding, setActivitySelectedBuilding] = useState<"all" | BuildingType>("all");
  const [activitySelectedFloor, setActivitySelectedFloor] = useState<"all" | FloorType>("all");

  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [selectedPrintRoomIds, setSelectedPrintRoomIds] = useState<string[]>([]);

  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [pendingPhotoAction, setPendingPhotoAction] = useState<PhotoAction | null>(null);
  const [photoFileName, setPhotoFileName] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }, []);

  async function loadCleanersFromSupabase() {
    const { data, error } = await supabase
      .from("cleaners")
      .select("id, name, pin, is_active, created_at")
      .eq("is_active", true)
      .order("id", { ascending: true });

    if (error) {
      console.error("讀取 cleaners 失敗：", error);
      return;
    }

    const mapped: User[] = ((data || []) as DbCleaner[]).map((item) => ({
      id: `cleaner-${item.id}`,
      dbId: item.id,
      name: item.name,
      pin: item.pin,
      role: "cleaner",
    }));

    setStaffUsers(mapped);
  }

  function normalizeDbChecklist(input: unknown): ChecklistItem[] {
    if (!Array.isArray(input) || input.length === 0) {
      return buildChecklist();
    }

    const fallback = buildChecklist();

    return fallback.map((fallbackItem) => {
      const savedItem = (input as any[]).find((x) => x?.id === fallbackItem.id);
      if (!savedItem) return fallbackItem;

      return {
        ...fallbackItem,
        done: Boolean(savedItem.done),
        photo: Boolean(savedItem.photo),
        subItems: fallbackItem.subItems.map((fallbackSub) => {
          const savedSub = Array.isArray(savedItem.subItems)
            ? savedItem.subItems.find((x: any) => x?.id === fallbackSub.id)
            : null;

          return {
            ...fallbackSub,
            done: Boolean(savedSub?.done),
          };
        }),
      };
    });
  }

  async function loadEventsFromSupabase() {
    const { data: eventsData, error: eventsError } = await supabase
      .from("events")
      .select("id, event_date, event_name, event_type, status, notes")
      .order("event_date", { ascending: true })
      .order("id", { ascending: true });

    if (eventsError) {
      console.error("讀取 events 失敗：", eventsError);
      return;
    }

    const { data: roomsData, error: roomsError } = await supabase
      .from("event_rooms")
      .select(
        "id, event_id, building, floor, room_no, assigned_to, occupant, progress, status, checklist, room_id, cleaner_id, guest_name, stay_status, cleaning_status, cleaning_progress, floor_photo, bathroom_photo, final_photo"
      )
      .order("id", { ascending: true });

    if (roomsError) {
      console.error("讀取 event_rooms 失敗：", roomsError);
      return;
    }

    const events = (eventsData || []) as DbEvent[];
    const eventRooms = (roomsData || []) as DbEventRoom[];

    if (events.length === 0) {
      setActivities([]);
      setSelectedActivityId("");
      return;
    }

    const mappedActivities: Activity[] = events.map((event) => {
      const eventType = event.event_type || "活動";
      const needsCleaning = eventType !== "一般活動";

      const relatedRooms = eventRooms
        .filter((room) => room.event_id === event.id)
        .map((room) => {
          const checklist = normalizeDbChecklist(room.checklist);

          const statusFromDb =
            room.status ||
            (room.cleaning_status === "已完成"
              ? "completed"
              : room.cleaning_status === "進行中"
              ? "in_progress"
              : room.cleaning_status === "未開始"
              ? "pending"
              : computeRoomStatus(checklist));

          const occupantValue = room.occupant ?? room.guest_name ?? "";

          return {
            id: `room-${room.id}`,
            dbId: room.id,
            eventId: room.event_id,
            building: (room.building || "A") as BuildingType,
            floor: (room.floor || "2F") as FloorType,
            roomNo: room.room_no || "201",
            assignedTo: room.assigned_to || "未分配",
            occupant: occupantValue,
            checklist,
            status: statusFromDb as RoomStatus,
          } as Room;
        });

      return {
        id: String(event.id),
        dbId: event.id,
        date: event.event_date,
        name: event.event_name,
        contact: event.notes || "",
        category: eventType,
        requiresCleaning: needsCleaning,
        guestCount: String(relatedRooms.filter((room) => room.occupant.trim()).length),
        rooms: relatedRooms,
      };
    });

    const sorted = sortActivitiesByClosestDate(mappedActivities, today);
    setActivities(sorted);
    setSelectedActivityId((prev) =>
      sorted.some((item) => item.id === prev) ? prev : sorted[0]?.id ?? ""
    );
  }

  useEffect(() => {
    loadCleanersFromSupabase();
    loadEventsFromSupabase();
  }, []);

  const role = currentUser?.role ?? null;
  const loginUsers = useMemo(() => [adminUser, ...staffUsers], [staffUsers]);

  const sortedActivities = useMemo(
    () => sortActivitiesByClosestDate(activities, today),
    [activities, today]
  );

  const selectedActivity = useMemo(
    () =>
      sortedActivities.find((a) => a.id === selectedActivityId) ||
      sortedActivities[0] ||
      null,
    [sortedActivities, selectedActivityId]
  );

  const latestCleaningActivity = useMemo(
    () => getClosestCleaningActivity(sortedActivities, today),
    [sortedActivities, today]
  );

  const latestRooms = latestCleaningActivity?.rooms || [];

  const cleanerRooms = useMemo(() => {
    if (!currentUser) return [];

    const source =
      role === "admin"
        ? latestRooms
        : latestRooms.filter((room) => room.assignedTo === currentUser.name);

    if (roomFilter === "completed") return source.filter((r) => r.status === "completed");
    if (roomFilter === "pending") return source.filter((r) => r.status !== "completed");
    return source;
  }, [latestRooms, currentUser, role, roomFilter]);

  const adminSummary = useMemo(() => {
    const total = latestRooms.length;
    const completed = latestRooms.filter((r) => r.status === "completed").length;
    const inProgress = latestRooms.filter((r) => r.status === "in_progress").length;
    const pending = latestRooms.filter((r) => r.status === "pending").length;
    return { total, completed, inProgress, pending };
  }, [latestRooms]);

  const overviewRooms = useMemo(() => {
    if (overviewFilter === "completed") return latestRooms.filter((room) => room.status === "completed");
    if (overviewFilter === "in_progress") return latestRooms.filter((room) => room.status === "in_progress");
    if (overviewFilter === "pending") return latestRooms.filter((room) => room.status === "pending");
    return latestRooms;
  }, [latestRooms, overviewFilter]);

  const filteredActivityRooms = useMemo(() => {
    if (!selectedActivity) return [];
    return selectedActivity.rooms
      .filter(
        (room) =>
          activitySelectedBuilding === "all" || room.building === activitySelectedBuilding
      )
      .filter(
        (room) =>
          activitySelectedFloor === "all" || room.floor === activitySelectedFloor
      )
      .sort((a, b) => {
        if (a.building !== b.building) return a.building.localeCompare(b.building);
        if (a.floor !== b.floor) {
          return FLOOR_OPTIONS.indexOf(a.floor) - FLOOR_OPTIONS.indexOf(b.floor);
        }
        return a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true });
      });
  }, [selectedActivity, activitySelectedBuilding, activitySelectedFloor]);

  const selectedPrintCount = useMemo(() => {
    return filteredActivityRooms.filter((room) =>
      selectedPrintRoomIds.includes(room.id)
    ).length;
  }, [filteredActivityRooms, selectedPrintRoomIds]);

  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);

  const activitiesByDate = useMemo(() => {
    const map = new Map<string, Activity[]>();
    sortedActivities.forEach((activity) => {
      const list = map.get(activity.date) || [];
      list.push(activity);
      map.set(activity.date, list);
    });
    return map;
  }, [sortedActivities]);

  function resetPhotoModal() {
    setShowPhotoModal(false);
    setPendingPhotoAction(null);
    setPhotoFile(null);
    setPhotoFileName("");
  }

  function openPhotoModal(action: PhotoAction) {
    setPendingPhotoAction(action);
    setPhotoFile(null);
    setPhotoFileName("");
    setShowPhotoModal(true);
  }

  async function uploadCleaningPhoto(
    room: Room,
    itemId: string,
    file: File
  ): Promise<string | null> {
    if (!room.dbId) {
      window.alert("找不到房間資料，無法上傳照片");
      return null;
    }

    const ext = file.name.split(".").pop() || "jpg";
    const safeItemId = itemId.replace(/[^a-zA-Z0-9_-]/g, "");
    const fileName = `${room.dbId}-${safeItemId}-${Date.now()}.${ext}`;
    const filePath = `event-rooms/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("cleaning-photos")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      console.error("照片上傳失敗：", uploadError);
      window.alert(`照片上傳失敗：${uploadError.message}`);
      return null;
    }

    const { data } = supabase.storage
      .from("cleaning-photos")
      .getPublicUrl(filePath);

    return data.publicUrl || null;
  }

  function handleLogin() {
    const found = loginUsers.find((u) => u.id === selectedUserId && u.pin === pin);
    if (!found) {
      window.alert("帳號或密碼錯誤，請重新輸入");
      return;
    }
    setCurrentUser(found);
    setShowLogin(false);
    setPin("");
    setViewMode(found.role === "admin" ? "admin" : "staff");
  }

  function handleLogout() {
    setCurrentUser(null);
    setShowLogin(true);
    setSelectedUserId("");
    setPin("");
    setViewMode("staff");
    setAdminView("overview");
    setOverviewFilter("all");
    setExpandedRoomId("");
    setExpandedStaffName("");
    resetPhotoModal();
  }

  function mapRoomStatusToLegacy(status: RoomStatus) {
    if (status === "completed") return "已完成";
    if (status === "in_progress") return "進行中";
    return "未開始";
  }

  function mapOccupantToStayStatus(occupant: string) {
    return occupant.trim() ? "住宿中" : "空房";
  }

  function findCleanerIdByName(name: string): number | null {
    const found = staffUsers.find((item) => item.name === name);
    return found?.dbId ?? null;
  }

  async function saveRoomToSupabase(room: Room, eventId: number) {
    const progress = roomProgress(room);
    const status = room.status || computeRoomStatus(room.checklist);
    const occupant = room.occupant;
    const assignedTo = room.assignedTo;

    const payload: Record<string, any> = {
      event_id: eventId,
      building: room.building,
      floor: room.floor,
      room_no: room.roomNo,
      assigned_to: assignedTo,
      occupant,
      progress,
      status,
      checklist: room.checklist,
      guest_name: occupant || null,
      stay_status: mapOccupantToStayStatus(occupant),
      cleaning_status: mapRoomStatusToLegacy(status),
      cleaning_progress: progress,
      cleaner_id: findCleanerIdByName(assignedTo),
      room_id: null,
    };

    if (room.dbId) {
      const { error } = await supabase
        .from("event_rooms")
        .update(payload)
        .eq("id", room.dbId);

      if (error) {
        console.error("更新房間失敗：", error);
        window.alert(`更新房間失敗：${error.message}`);
      }
      return;
    }

    const { error } = await supabase.from("event_rooms").insert([payload]);

    if (error) {
      console.error("新增房間失敗：", error);
      window.alert(`新增房間失敗：${error.message}`);
    }
  }

  async function updateRoomField(
    activityId: string,
    roomId: string,
    updates: Partial<Room>
  ) {
    const targetActivity = activities.find((a) => a.id === activityId);
    const targetRoom = targetActivity?.rooms.find((r) => r.id === roomId);
    if (!targetActivity || !targetRoom || !targetActivity.dbId) return;

    const mergedRoom: Room = {
      ...targetRoom,
      ...updates,
    };

    if (updates.checklist) {
      mergedRoom.status = computeRoomStatus(updates.checklist);
    }

    setActivities((prev) =>
      prev.map((activity) =>
        activity.id === activityId
          ? {
              ...activity,
              guestCount: String(
                activity.rooms
                  .map((room) => (room.id === roomId ? mergedRoom : room))
                  .filter((room) => room.occupant.trim()).length
              ),
              rooms: activity.rooms.map((room) =>
                room.id === roomId ? mergedRoom : room
              ),
            }
          : activity
      )
    );

    await saveRoomToSupabase(mergedRoom, targetActivity.dbId);
    await loadEventsFromSupabase();
  }

  async function updateLatestActivityChecklist(roomId: string, itemId: string, checked: boolean) {
    if (!latestCleaningActivity) return;
    const room = latestCleaningActivity.rooms.find((r) => r.id === roomId);
    if (!room) return;

    const nextChecklist = room.checklist.map((item) => {
      if (item.id !== itemId) return item;

      if (!checked) {
        return {
          ...item,
          done: false,
          photo: false,
          subItems: item.subItems.map((sub) => ({ ...sub, done: false })),
        };
      }

      return {
        ...item,
        done: true,
        photo: item.requiredPhoto ? item.photo : item.photo,
        subItems: item.subItems.map((sub) => ({ ...sub, done: true })),
      };
    });

    await updateRoomField(latestCleaningActivity.id, roomId, {
      checklist: nextChecklist,
      status: computeRoomStatus(nextChecklist),
    });
  }

  async function updateLatestActivitySubItem(
    roomId: string,
    itemId: string,
    subItemId: string,
    checked: boolean
  ) {
    if (!latestCleaningActivity) return;
    const room = latestCleaningActivity.rooms.find((r) => r.id === roomId);
    if (!room) return;

    const nextChecklist = room.checklist.map((item) => {
      if (item.id !== itemId) return item;

      const nextSubItems = item.subItems.map((sub) =>
        sub.id === subItemId ? { ...sub, done: checked } : sub
      );

      return {
        ...item,
        subItems: nextSubItems,
        done: checked
          ? nextSubItems.every((sub) => sub.done) &&
            (!item.requiredPhoto || item.photo)
          : false,
      };
    });

    await updateRoomField(latestCleaningActivity.id, roomId, {
      checklist: nextChecklist,
      status: computeRoomStatus(nextChecklist),
    });
  }

  async function confirmPhotoUploadAndComplete() {
    if (!pendingPhotoAction || !photoFile || !latestCleaningActivity) {
      if (!photoFile) window.alert("請先上傳照片");
      return;
    }

    const room = latestCleaningActivity.rooms.find(
      (r) => r.id === pendingPhotoAction.roomId
    );
    if (!room || !room.dbId) {
      window.alert("找不到房間資料");
      return;
    }

    const publicUrl = await uploadCleaningPhoto(room, pendingPhotoAction.itemId, photoFile);
    if (!publicUrl) return;

    const photoField = getPhotoFieldByChecklistItem(pendingPhotoAction.itemId);

    const roomUpdatePayload: Record<string, any> = {
      [photoField]: publicUrl,
    };

    const { error: photoSaveError } = await supabase
      .from("event_rooms")
      .update(roomUpdatePayload)
      .eq("id", room.dbId);

    if (photoSaveError) {
      console.error("照片網址寫入失敗：", photoSaveError);
      window.alert(`照片網址寫入失敗：${photoSaveError.message}`);
      return;
    }

    const nextChecklist = room.checklist.map((item) => {
      if (item.id !== pendingPhotoAction.itemId) return item;

      if (pendingPhotoAction.mode === "item") {
        return {
          ...item,
          done: true,
          photo: true,
          subItems: item.subItems.map((sub) => ({ ...sub, done: true })),
        };
      }

      if (pendingPhotoAction.mode === "subitem") {
        const nextSubItems = item.subItems.map((sub) =>
          sub.id === pendingPhotoAction.subItemId ? { ...sub, done: true } : sub
        );

        return {
          ...item,
          subItems: nextSubItems,
          done: nextSubItems.every((sub) => sub.done),
          photo: true,
        };
      }

      return {
        ...item,
        photo: true,
        done: item.subItems.every((sub) => sub.done),
      };
    });

    await updateRoomField(latestCleaningActivity.id, room.id, {
      checklist: nextChecklist,
      status: computeRoomStatus(nextChecklist),
    });

    resetPhotoModal();
  }

  function openAddActivityModal(prefillDate?: string) {
    setActivityModalMode("add");
    setEditingActivityId("");
    setActivityName("");
    setActivityDate(prefillDate || formatDateToInput(new Date()));
    setActivityContact("");
    setActivityNeedsCleaning(true);
    setShowActivityModal(true);
  }

  function openEditActivityModal(activity: Activity) {
    setActivityModalMode("edit");
    setEditingActivityId(activity.id);
    setActivityName(activity.name);
    setActivityDate(activity.date);
    setActivityContact(activity.contact);
    setActivityNeedsCleaning(activity.requiresCleaning);
    setShowActivityModal(true);
  }

  async function saveActivityModal() {
    if (!activityName.trim() || !activityDate.trim()) {
      window.alert("請先輸入活動日期與活動名稱");
      return;
    }

    const eventType = activityNeedsCleaning ? "活動" : "一般活動";

    const payload = {
      event_date: activityDate,
      event_name: activityName.trim(),
      event_type: eventType,
      status: "未開始",
      notes: activityContact.trim() || "",
    };

    if (activityModalMode === "edit") {
      const dbId = Number(editingActivityId);
      const { error } = await supabase
        .from("events")
        .update(payload)
        .eq("id", dbId);

      if (error) {
        window.alert(`修改活動失敗：${error.message}`);
        return;
      }

      setShowActivityModal(false);
      await loadEventsFromSupabase();
      return;
    }

    const { data, error } = await supabase
      .from("events")
      .insert([payload])
      .select();

    if (error) {
      window.alert(`新增活動失敗：${error.message}`);
      return;
    }

    const inserted = data?.[0];

    if (inserted && activityNeedsCleaning) {
      const defaultRooms = buildDefaultRooms();
      const rows = defaultRooms.map((room) => ({
        event_id: inserted.id,
        building: room.building,
        floor: room.floor,
        room_no: room.roomNo,
        assigned_to: room.assignedTo,
        occupant: room.occupant,
        progress: 0,
        status: room.status,
        checklist: room.checklist,
        guest_name: null,
        stay_status: "空房",
        cleaning_status: "未開始",
        cleaning_progress: 0,
        cleaner_id: null,
        room_id: null,
      }));

      const { error: roomInsertError } = await supabase
        .from("event_rooms")
        .insert(rows);

      if (roomInsertError) {
        window.alert(`活動建立成功，但房間建立失敗：${roomInsertError.message}`);
      }
    }

    setShowActivityModal(false);
    await loadEventsFromSupabase();
  }

  async function deleteCurrentActivity() {
    if (activityModalMode !== "edit" || !editingActivityId) return;

    const confirmed = window.confirm("確定要刪除這個活動嗎？刪除後無法復原。");
    if (!confirmed) return;

    const dbId = Number(editingActivityId);

    const { error: eventRoomsError } = await supabase
      .from("event_rooms")
      .delete()
      .eq("event_id", dbId);

    if (eventRoomsError) {
      window.alert(`刪除活動房間資料失敗：${eventRoomsError.message}`);
      return;
    }

    const { error: eventsError } = await supabase
      .from("events")
      .delete()
      .eq("id", dbId);

    if (eventsError) {
      window.alert(`刪除活動失敗：${eventsError.message}`);
      return;
    }

    setShowActivityModal(false);
    setEditingActivityId("");
    setSelectedActivityId("");
    setSelectedPrintRoomIds([]);
    await loadEventsFromSupabase();
  }

  async function saveNewRoom() {
    if (!selectedActivity || !selectedActivity.dbId) return;

    const exists = selectedActivity.rooms.some(
      (room) =>
        room.building === newRoomBuilding &&
        room.floor === newRoomFloor &&
        room.roomNo === newRoomNo
    );

    if (exists) {
      window.alert("此房間已存在");
      return;
    }

    const newRoom: Room = {
      id: `temp-${Date.now()}`,
      building: newRoomBuilding,
      floor: newRoomFloor,
      roomNo: newRoomNo,
      assignedTo: newRoomStaff,
      occupant: newOccupant,
      checklist: buildChecklist(),
      status: "pending",
    };

    await saveRoomToSupabase(newRoom, selectedActivity.dbId);
    setShowRoomModal(false);
    setNewOccupant("");
    setNewRoomStaff("未分配");
    await loadEventsFromSupabase();
  }

  function selectActivity(activityId: string) {
    setSelectedActivityId(activityId);
    setActivitySelectedBuilding("all");
    setActivitySelectedFloor("all");
    setSelectedPrintRoomIds([]);
  }

  function escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function buildA4RoomPage(room: Room) {
    const guests = splitGuestLines(room.occupant);
    const useTwoColumns = guests.length > 6;

    const leftGuests = useTwoColumns ? guests.slice(0, 4) : guests;
    const rightGuests = useTwoColumns ? guests.slice(4, 8) : [];

    const singleColumnHtml =
      leftGuests.length > 0
        ? leftGuests
            .map(
              (guest) => `
                <div class="guest-row">${escapeHtml(guest)}</div>
              `
            )
            .join("")
        : `<div class="guest-row">空房</div>`;

    const twoColumnHtml = `
      <div class="guest-grid-two">
        <div class="guest-col">
          ${leftGuests
            .map(
              (guest) => `
                <div class="guest-row">${escapeHtml(guest)}</div>
              `
            )
            .join("")}
        </div>
        <div class="guest-col">
          ${rightGuests
            .map(
              (guest) => `
                <div class="guest-row">${escapeHtml(guest)}</div>
              `
            )
            .join("")}
        </div>
      </div>
    `;

    return `
      <section class="a4-page">
        <div class="room-title">${escapeHtml(roomLabel(room))}</div>
        <div class="guest-area">
          ${
            useTwoColumns
              ? twoColumnHtml
              : `<div class="guest-grid-one">${singleColumnHtml}</div>`
          }
        </div>
      </section>
    `;
  }

  function buildPrintDocument(pagesHtml: string) {
    return `
      <!DOCTYPE html>
      <html lang="zh-Hant">
        <head>
          <meta charset="UTF-8" />
          <title>房間列印</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 0;
            }

            html, body {
              margin: 0;
              padding: 0;
              background: white;
            }

            body {
              font-family:
                "DFKai-SB",
                "BiauKai",
                "標楷體",
                "KaiTi",
                serif;
              color: #000;
            }

            .a4-page {
              width: 210mm;
              height: 297mm;
              page-break-after: always;
              break-after: page;
              background: white;
              color: black;
              display: flex;
              flex-direction: column;
              align-items: center;
              padding-top: 18mm;
              padding-left: 14mm;
              padding-right: 14mm;
              box-sizing: border-box;
            }

            .a4-page:last-child {
              page-break-after: auto;
              break-after: auto;
            }

            .room-title {
              width: 100%;
              text-align: center;
              font-size: 34mm;
              line-height: 1.05;
              font-weight: 700;
              letter-spacing: 0;
              margin-bottom: 20mm;
            }

            .guest-area {
              width: 100%;
              flex: 1;
              display: flex;
              justify-content: center;
              align-items: flex-start;
            }

            .guest-grid-one {
              width: 100%;
              max-width: 120mm;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 9mm;
            }

            .guest-grid-two {
              width: 100%;
              max-width: 170mm;
              display: grid;
              grid-template-columns: 1fr 1fr;
              column-gap: 12mm;
              align-items: start;
            }

            .guest-col {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 9mm;
            }

            .guest-row {
              width: 100%;
              text-align: center;
              font-size: 23mm;
              line-height: 1.1;
              white-space: nowrap;
            }
          </style>
        </head>
        <body>
          ${pagesHtml}
          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `;
  }

  function openPrintWindow(html: string) {
    const printWindow = window.open("", "_blank", "width=900,height=1200");
    if (!printWindow) {
      window.alert("無法開啟列印視窗，請確認瀏覽器是否阻擋彈出視窗");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  function printSingleRoomA4(room: Room) {
    const html = buildPrintDocument(buildA4RoomPage(room));
    openPrintWindow(html);
  }

  function togglePrintRoom(roomId: string) {
    setSelectedPrintRoomIds((prev) =>
      prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]
    );
  }

  function selectAllPrintRooms() {
    setSelectedPrintRoomIds(filteredActivityRooms.map((room) => room.id));
  }

  function clearAllPrintRooms() {
    setSelectedPrintRoomIds([]);
  }

  function printSelectedRoomsA4() {
    if (!selectedActivity) {
      window.alert("請先選擇活動");
      return;
    }

    const selectedRooms = filteredActivityRooms.filter((room) =>
      selectedPrintRoomIds.includes(room.id)
    );

    if (selectedRooms.length === 0) {
      window.alert("請先勾選要列印的房間");
      return;
    }

    const pagesHtml = selectedRooms.map((room) => buildA4RoomPage(room)).join("");
    const html = buildPrintDocument(pagesHtml);
    openPrintWindow(html);
  }

  async function deleteSelectedActivityRoom(roomId: string) {
    if (!selectedActivity) return;

    const room = selectedActivity.rooms.find((r) => r.id === roomId);
    if (!room?.dbId) return;

    const confirmed = window.confirm("確定要刪除此房間嗎？");
    if (!confirmed) return;

    const { error } = await supabase.from("event_rooms").delete().eq("id", room.dbId);

    if (error) {
      window.alert(`刪除房間失敗：${error.message}`);
      return;
    }

    setSelectedPrintRoomIds((prev) => prev.filter((id) => id !== roomId));
    await loadEventsFromSupabase();
  }

  function openAddStaffModal() {
    setStaffModalMode("add");
    setEditingStaffId("");
    setNewStaffName("");
    setNewStaffPin("");
    setShowStaffModal(true);
  }

  function openEditStaffModal(user: User) {
    setStaffModalMode("edit");
    setEditingStaffId(user.id);
    setNewStaffName(user.name);
    setNewStaffPin(user.pin);
    setShowStaffModal(true);
  }

  async function saveStaffModal() {
    const name = newStaffName.trim();
    const pinValue = newStaffPin.trim();

    if (!name || !pinValue) {
      window.alert("請輸入人員姓名與密碼");
      return;
    }

    if (staffModalMode === "edit") {
      const editingUser = staffUsers.find((user) => user.id === editingStaffId);
      if (!editingUser?.dbId) {
        window.alert("找不到要修改的人員資料");
        return;
      }

      if (staffUsers.some((user) => user.name === name && user.id !== editingStaffId)) {
        window.alert("此打掃人員名稱已存在");
        return;
      }

      const oldName = editingUser.name;

      const { error } = await supabase
        .from("cleaners")
        .update({
          name,
          pin: pinValue,
        })
        .eq("id", editingUser.dbId);

      if (error) {
        window.alert(`修改打掃人員失敗：${error.message}`);
        return;
      }

      if (oldName !== name) {
        const { error: roomUpdateError } = await supabase
          .from("event_rooms")
          .update({
            assigned_to: name,
            cleaner_id: editingUser.dbId,
          })
          .eq("assigned_to", oldName);

        if (roomUpdateError) {
          window.alert(`人員名稱已更新，但房間指派同步失敗：${roomUpdateError.message}`);
        }
      }

      await loadCleanersFromSupabase();
      await loadEventsFromSupabase();

      if (currentUser?.id === editingStaffId) {
        setCurrentUser((prev) => (prev ? { ...prev, name, pin: pinValue } : prev));
      }

      setShowStaffModal(false);
      return;
    }

    if (staffUsers.some((user) => user.name === name)) {
      window.alert("此打掃人員名稱已存在");
      return;
    }

    const { error } = await supabase.from("cleaners").insert([
      {
        name,
        pin: pinValue,
        is_active: true,
      },
    ]);

    if (error) {
      window.alert(`新增打掃人員失敗：${error.message}`);
      return;
    }

    await loadCleanersFromSupabase();
    setShowStaffModal(false);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f8f4ed_0%,#f2ece2_44%,#e8dfd1_100%)] p-4 text-[#4f4435]">
      <div className="mx-auto max-w-md pb-28">
        <div className="overflow-hidden rounded-[28px] border border-[#e6ddd0] bg-[#fcfaf6]/95 shadow-[0_18px_40px_rgba(84,69,45,0.12)] backdrop-blur">
          <div className="bg-[linear-gradient(180deg,#f4ede2_0%,#e8ddcb_100%)] px-4 py-3.5 text-[#4f4435]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-[19px] font-semibold tracking-[0.08em]">
                <ShieldCheck className="h-5 w-5 text-[#8a7756]" />
                天惠會館房務管理系統
              </div>

              <button
                onClick={() => {
                  if (currentUser) handleLogout();
                  else setShowLogin((v) => !v);
                }}
                className="rounded-[22px] border border-[#d9cfbf] bg-[linear-gradient(180deg,#fffdfa_0%,#f2ecdf_100%)] px-4 py-2 text-sm font-semibold text-[#6b604b] shadow-[0_8px_18px_rgba(84,69,45,0.10)]"
              >
                {currentUser ? "登出" : "登入"}
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="inline-flex rounded-full border border-[#d9cfbf] bg-[#f7f1e8] px-3 py-1 text-xs text-[#6b604b] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
                目前登入：{currentUser ? currentUser.name : "尚未登入"}
              </div>

              {role === "admin" && currentUser && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setViewMode("staff")}
                    className={`rounded-[18px] border px-3 py-1.5 text-xs font-semibold ${gradientButton(
                      viewMode === "staff"
                    )}`}
                  >
                    清潔
                  </button>
                  <button
                    onClick={() => setViewMode("admin")}
                    className={`rounded-[18px] border px-3 py-1.5 text-xs font-semibold ${gradientButton(
                      viewMode === "admin"
                    )}`}
                  >
                    後台
                  </button>
                </div>
              )}
            </div>
          </div>

          {showLogin && !currentUser && (
            <div className="space-y-2 border-t border-[#e5ddd0] bg-[linear-gradient(180deg,#fcfaf6_0%,#f4eee4_100%)] p-3">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full rounded-[16px] border border-[#ddd4c6] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]"
              >
                <option value="">請選擇帳號</option>
                {loginUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>

              <input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full rounded-[16px] border border-[#ddd4c6] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]"
                placeholder="請輸入密碼"
                type="password"
              />

              <button
                onClick={handleLogin}
                className="w-full rounded-[16px] bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] px-3 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(110,99,67,0.20)]"
              >
                登入
              </button>
            </div>
          )}
        </div>

        {!currentUser ? (
          <div className="mt-3 rounded-[28px] border border-[#e2d8c8] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f3eb_100%)] p-6 text-center shadow-[0_12px_26px_rgba(84,69,45,0.08)]">
            <div className="text-[18px] font-semibold text-[#524736]">請先登入</div>
            <div className="mt-2 text-sm text-[#8d8272]">
              點右上角「登入」，選擇帳號並輸入密碼後使用系統。
            </div>
          </div>
        ) : viewMode === "staff" ? (
          <div className="mt-3 rounded-[28px] border border-[#e2d8c8] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f3eb_100%)] p-3 shadow-[0_12px_26px_rgba(84,69,45,0.08)]">
            <SectionTitle
              title="我的房間"
              sub={
                latestCleaningActivity
                  ? `${formatDate(latestCleaningActivity.date)} ${latestCleaningActivity.name}`
                  : undefined
              }
              icon={<WandSparkles className="h-4 w-4" />}
            />

            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                { key: "all", label: "全部" },
                { key: "completed", label: "完成" },
                { key: "pending", label: "未完成" },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setRoomFilter(item.key as "all" | "completed" | "pending")}
                  className={`rounded-[16px] border px-3 py-2 text-sm font-semibold ${gradientButton(
                    roomFilter === item.key
                  )}`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-2 space-y-2">
              {cleanerRooms.map((room) => {
                const expanded = expandedRoomId === room.id;

                return (
                  <div
                    key={room.id}
                    className="overflow-hidden rounded-[22px] border border-[#e2d8c8] bg-white shadow-[0_8px_18px_rgba(84,69,45,0.06)]"
                  >
                    <button
                      onClick={() => setExpandedRoomId((prev) => (prev === room.id ? "" : room.id))}
                      className={`w-full px-3 py-2.5 text-left ${
                        expanded
                          ? "bg-[linear-gradient(135deg,#8b8462_0%,#9b9471_58%,#b8b087_100%)] text-white"
                          : "bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[15px] font-semibold">{roomLabel(room)}</div>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span
                              className={`text-[11px] font-semibold ${
                                expanded ? "text-white/90" : statusTextClass(room.status)
                              }`}
                            >
                              {statusText(room.status)}
                            </span>
                            <span className={`text-[11px] ${expanded ? "text-white/85" : "text-[#8d8272]"}`}>
                              {room.assignedTo}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold shadow-sm ${
                              expanded ? "bg-white text-[#6b604b]" : "bg-[#efe7d7] text-[#75684f]"
                            }`}
                          >
                            {roomProgress(room)}%
                          </div>
                          <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
                        </div>
                      </div>
                    </button>

                    {expanded && (
                      <div className="space-y-2 bg-[#fdfaf6] px-2.5 py-2.5">
                        {room.checklist.map((item, idx) => (
                          <div
                            key={item.id}
                            className="rounded-[18px] border border-[#e5ddd0] bg-white px-2.5 py-2 shadow-[0_4px_10px_rgba(84,69,45,0.04)]"
                          >
                            <div className="flex items-start gap-2.5">
                              <input
                                type="checkbox"
                                checked={item.done}
                                onChange={(e) => {
                                  const checked = e.target.checked;

                                  if (!checked) {
                                    updateLatestActivityChecklist(room.id, item.id, false);
                                    return;
                                  }

                                  if (item.requiredPhoto && !item.photo) {
                                    openPhotoModal({
                                      roomId: room.id,
                                      itemId: item.id,
                                      mode: "item",
                                    });
                                    return;
                                  }

                                  updateLatestActivityChecklist(room.id, item.id, true);
                                }}
                                className="mt-0.5 h-5 w-5 shrink-0 accent-[#8b8462]"
                              />

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#efe7d7] px-1.5 text-[10px] font-semibold text-[#8a7756]">
                                        {idx + 1}
                                      </span>
                                      <div className="text-[14px] font-semibold text-[#524736]">
                                        {item.label}
                                      </div>
                                    </div>
                                    <div className="mt-0.5 text-[11px] leading-4 text-[#8e8475]">
                                      {item.description}
                                    </div>
                                  </div>

                                  {item.requiredPhoto && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openPhotoModal({
                                          roomId: room.id,
                                          itemId: item.id,
                                          mode: "photoOnly",
                                        })
                                      }
                                      className={`rounded-[14px] border px-2.5 py-1 text-[11px] font-semibold shadow-sm ${
                                        item.photo
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                          : "border-[#ddd4c6] bg-[#fdfaf6] text-[#75684f]"
                                      }`}
                                    >
                                      <span className="inline-flex items-center gap-1">
                                        <ImageIcon className="h-3.5 w-3.5" />
                                        {item.photo ? "已拍照" : "拍照"}
                                      </span>
                                    </button>
                                  )}
                                </div>

                                <div className="mt-2 space-y-0.5 rounded-[14px] bg-[#f6f0e6] px-2 py-1.5">
                                  {item.subItems.map((sub) => (
                                    <label key={sub.id} className="flex items-start gap-2 py-0.5">
                                      <input
                                        type="checkbox"
                                        checked={sub.done}
                                        onChange={(e) => {
                                          const checked = e.target.checked;

                                          if (!checked) {
                                            updateLatestActivitySubItem(room.id, item.id, sub.id, false);
                                            return;
                                          }

                                          const willAllDone = item.subItems.every((s) =>
                                            s.id === sub.id ? true : s.done
                                          );

                                          if (item.requiredPhoto && willAllDone && !item.photo) {
                                            openPhotoModal({
                                              roomId: room.id,
                                              itemId: item.id,
                                              subItemId: sub.id,
                                              mode: "subitem",
                                            });
                                            return;
                                          }

                                          updateLatestActivitySubItem(room.id, item.id, sub.id, true);
                                        }}
                                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#8b8462]"
                                      />
                                      <span className="text-[12px] leading-4 text-[#6c614d]">
                                        {sub.label}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {adminView === "overview" && (
              <div className="rounded-[28px] border border-[#e2d8c8] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f3eb_100%)] p-3 shadow-[0_12px_26px_rgba(84,69,45,0.08)]">
                <SectionTitle
                  title="整理現況"
                  sub={
                    latestCleaningActivity
                      ? `${formatDate(latestCleaningActivity.date)} ${latestCleaningActivity.name}`
                      : "目前無打掃活動"
                  }
                  icon={<Bell className="h-4 w-4" />}
                />

                <div className="mt-2 grid grid-cols-4 gap-2">
                  {[
                    { key: "all", label: "全部", value: adminSummary.total },
                    { key: "completed", label: "完成", value: adminSummary.completed },
                    { key: "in_progress", label: "進行", value: adminSummary.inProgress },
                    { key: "pending", label: "未開始", value: adminSummary.pending },
                  ].map((card) => (
                    <button
                      key={card.key}
                      onClick={() => setOverviewFilter(card.key as OverviewFilter)}
                      className={`rounded-[16px] border px-2 py-2 text-center text-[#6a5f4a] shadow-[0_6px_16px_rgba(83,69,45,0.08)] ${
                        overviewFilter === card.key
                          ? "border-transparent bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_50%,#b5ae86_100%)] text-white"
                          : "border-[#d9cfbe] bg-[linear-gradient(180deg,#fffdfa_0%,#f1eadf_100%)]"
                      }`}
                    >
                      <div className={`text-[10px] ${overviewFilter === card.key ? "text-white/90" : "text-[#8d8272]"}`}>
                        {card.label}
                      </div>
                      <div className="mt-0.5 text-[18px] font-semibold">{card.value}</div>
                    </button>
                  ))}
                </div>

                <div className="mt-2 space-y-2 rounded-[20px] border border-[#e2d8c8] bg-[#faf6f0] p-2">
                  {overviewRooms.map((room) => {
                    const guests = splitGuestLines(room.occupant);

                    return (
                      <div
                        key={room.id}
                        className="rounded-[16px] border border-[#e5ddd0] bg-white px-3 py-2 shadow-[0_4px_10px_rgba(84,69,45,0.04)]"
                      >
                        <div className="flex items-start gap-2 text-[13px] leading-5 text-[#524736]">
                          <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-[#8a7756]" />
                          <div className="min-w-0 flex-1">
                            <div className="grid grid-cols-[auto_auto_1fr_auto_auto] items-start gap-x-2 gap-y-0.5 font-medium">
                              <span>{roomLabel(room)}</span>
                              <span>客：</span>
                              <span>{guests[0] || "-"}</span>
                              <span className="justify-self-end whitespace-nowrap">
                                {room.assignedTo || "未分配"}
                              </span>
                              <span className="justify-self-end whitespace-nowrap">
                                {roomProgress(room)}%
                              </span>

                              {guests.slice(1).map((guest, index) => (
                                <React.Fragment key={index}>
                                  <span />
                                  <span />
                                  <span className="text-[12px] text-[#8d8272]">{guest}</span>
                                  <span />
                                  <span />
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {overviewRooms.length === 0 && (
                    <div className="py-6 text-center text-sm text-[#a79a86]">
                      目前此分類沒有房間資料
                    </div>
                  )}
                </div>
              </div>
            )}

            {adminView === "activity" && (
              <div className="rounded-[28px] border border-[#e2d8c8] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f3eb_100%)] p-3 shadow-[0_12px_26px_rgba(84,69,45,0.08)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <SectionTitle
                    title="活動列表"
                    sub="點選活動才顯示下方房間表單"
                    icon={<CalendarDays className="h-4 w-4" />}
                  />

                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-[#efe7d7] px-3 py-2 text-[12px] font-semibold text-[#75684f] shadow-[0_8px_16px_rgba(110,99,67,0.08)]">
                      已勾選 {selectedPrintCount} 間
                    </div>

                    <button
                      onClick={selectAllPrintRooms}
                      className="rounded-full bg-[linear-gradient(180deg,#fffdfa_0%,#f2ecdf_100%)] px-3 py-2 text-[12px] text-[#75684f] shadow-[0_8px_16px_rgba(110,99,67,0.12)]"
                      title="全選房間"
                    >
                      全選
                    </button>

                    <button
                      onClick={clearAllPrintRooms}
                      className="rounded-full bg-[linear-gradient(180deg,#fffdfa_0%,#f2ecdf_100%)] px-3 py-2 text-[12px] text-[#75684f] shadow-[0_8px_16px_rgba(110,99,67,0.12)]"
                      title="清除勾選"
                    >
                      清除
                    </button>

                    <button
                      onClick={printSelectedRoomsA4}
                      className="flex h-9 items-center justify-center rounded-full bg-[linear-gradient(180deg,#fffdfa_0%,#f2ecdf_100%)] px-3 text-[#75684f] shadow-[0_8px_16px_rgba(110,99,67,0.12)]"
                      title="列印已勾選房間"
                    >
                      <Printer className="h-4 w-4" />
                    </button>

                    <button
                      onClick={() => openAddActivityModal()}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] text-white shadow-[0_10px_18px_rgba(110,99,67,0.22)]"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {sortedActivities.map((activity) => {
                    const active = selectedActivity?.id === activity.id;
                    const expired = isPastActivity(activity.date, today);

                    return (
                      <div
                        key={activity.id}
                        onClick={() => selectActivity(activity.id)}
                        className={`w-full cursor-pointer rounded-[18px] border px-3 py-2 ${
                          active
                            ? "border-transparent bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] text-white shadow-[0_10px_20px_rgba(110,99,67,0.20)]"
                            : expired
                            ? "border-[#d7d2cb] bg-[#ece8e1] text-[#7b746b]"
                            : "border-[#e2d8c8] bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => selectActivity(activity.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="truncate text-[13px] font-medium">
                              {formatDate(activity.date)} {activity.name}
                            </div>
                          </button>

                          <div className="flex shrink-0 items-center gap-2">
                            {activity.requiresCleaning ? (
                              <span
                                className={
                                  active
                                    ? "text-white"
                                    : expired
                                    ? "text-[#8f887e]"
                                    : "text-[#8a7756]"
                                }
                              >
                                🧹
                              </span>
                            ) : null}

                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditActivityModal(activity);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openEditActivityModal(activity);
                                }
                              }}
                              className={`inline-flex cursor-pointer items-center justify-center rounded-full px-2 py-1 text-[10px] ${
                                active
                                  ? "bg-white/15 text-white"
                                  : expired
                                  ? "bg-[#d9d3ca] text-[#7b746b]"
                                  : "bg-[#efe7d7] text-[#75684f]"
                              }`}
                              title="編輯活動"
                            >
                              ✎
                            </span>

                            <span
                              className={`text-[12px] font-semibold ${
                                active
                                  ? "text-white"
                                  : expired
                                  ? "text-[#7b746b]"
                                  : "text-[#7f735d]"
                              }`}
                            >
                              {activity.guestCount || "0"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selectedActivity && (
                  <>
                    <div className="mt-3 rounded-[20px] bg-[linear-gradient(135deg,#f8f3ea_0%,#eee4d5_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[13px] font-semibold text-[#524736]">
                          {selectedActivity.name}
                        </div>

                        {selectedActivity.requiresCleaning && (
                          <button
                            onClick={() => setShowRoomModal(true)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] text-white shadow-[0_8px_16px_rgba(110,99,67,0.18)]"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      {selectedActivity.requiresCleaning && (
                        <>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {[
                              { key: "all", label: "全部" },
                              { key: "A", label: "A棟" },
                              { key: "B", label: "B棟" },
                            ].map((item) => (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() =>
                                  setActivitySelectedBuilding(item.key as "all" | BuildingType)
                                }
                                className={`rounded-[14px] border px-2.5 py-1 text-[11px] font-semibold ${gradientButton(
                                  activitySelectedBuilding === item.key
                                )}`}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setActivitySelectedFloor("all")}
                              className={`rounded-[14px] border px-2.5 py-1 text-[11px] font-semibold ${gradientButton(
                                activitySelectedFloor === "all"
                              )}`}
                            >
                              全部
                            </button>

                            {FLOOR_OPTIONS.map((floor) => (
                              <button
                                key={floor}
                                type="button"
                                onClick={() => setActivitySelectedFloor(floor)}
                                className={`rounded-[14px] border px-2.5 py-1 text-[11px] font-semibold ${gradientButton(
                                  activitySelectedFloor === floor
                                )}`}
                              >
                                {floor}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {selectedActivity.requiresCleaning ? (
                      <div className="mt-2 space-y-2 rounded-[20px] border border-[#e2d8c8] bg-[#faf6f0] p-2">
                        {filteredActivityRooms.map((room) => (
                          <div
                            key={room.id}
                            className="rounded-[16px] border border-[#e5ddd0] bg-white px-3 py-2 shadow-[0_4px_10px_rgba(84,69,45,0.04)]"
                          >
                            <div className="text-[13px] font-semibold text-[#524736]">
                              {roomLabel(room)}
                            </div>

                            <div className="mt-1 grid grid-cols-[24px_1fr_88px_66px_34px_30px] items-start gap-2">
                              <div className="pt-3">
                                <input
                                  type="checkbox"
                                  checked={selectedPrintRoomIds.includes(room.id)}
                                  onChange={() => togglePrintRoom(room.id)}
                                  className="h-4 w-4 accent-[#8b8462]"
                                  title="勾選列印此房"
                                />
                              </div>

                              <textarea
                                value={room.occupant}
                                onChange={(e) =>
                                  updateRoomField(selectedActivity.id, room.id, {
                                    occupant: e.target.value,
                                  })
                                }
                                className="w-full resize-none overflow-hidden rounded-[14px] border border-[#ddd4c6] bg-[#fdfaf6] px-3 py-2 text-[12px] leading-5 text-[#5f5444] focus:outline-none"
                                rows={Math.max(1, splitGuestLines(room.occupant).length || 1)}
                                placeholder="住宿人"
                              />

                              <select
                                value={room.assignedTo}
                                onChange={(e) =>
                                  updateRoomField(selectedActivity.id, room.id, {
                                    assignedTo: e.target.value,
                                  })
                                }
                                className="h-[46px] rounded-[14px] border border-[#ddd4c6] bg-[#fdfaf6] px-2 text-[12px] text-[#5f5444] focus:outline-none"
                              >
                                <option value="未分配">未分配</option>
                                {staffUsers.map((user) => (
                                  <option key={user.id} value={user.name}>
                                    {user.name}
                                  </option>
                                ))}
                              </select>

                              <div className="pt-3 text-[12px] font-semibold text-[#7c715c]">
                                {roomProgress(room)}%
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  printSingleRoomA4(room);
                                }}
                                className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#efe7db] text-[#7f735d]"
                                title="列印此房"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteSelectedActivityRoom(room.id);
                                }}
                                className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-[#efe7db] text-[12px] text-[#7f735d]"
                              >
                                -
                              </button>
                            </div>
                          </div>
                        ))}

                        {filteredActivityRooms.length === 0 && (
                          <div className="py-6 text-center text-sm text-[#a79a86]">
                            目前此分類沒有房間資料
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 rounded-[20px] border border-[#e2d8c8] bg-[#faf6f0] px-4 py-6 text-center text-sm text-[#8d8272]">
                        此活動未勾選需打掃，因此不建立房間列表。
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {adminView === "staff" && (
              <div className="rounded-[28px] border border-[#e2d8c8] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f3eb_100%)] p-3 shadow-[0_12px_26px_rgba(84,69,45,0.08)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <SectionTitle
                    title="打掃人員"
                    sub="點選人員顯示房號與完成度"
                    icon={<Users className="h-4 w-4" />}
                  />
                  <button
                    onClick={openAddStaffModal}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] text-white shadow-[0_10px_18px_rgba(110,99,67,0.22)]"
                  >
                    <UserPlus className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  {staffUsers.map((user) => {
                    const assignedRooms = latestRooms.filter(
                      (room) => room.assignedTo === user.name
                    );
                    const expanded = expandedStaffName === user.name;

                    return (
                      <div
                        key={user.id}
                        className="rounded-[18px] border border-[#e5ddd0] bg-white px-3 py-2 shadow-[0_4px_10px_rgba(84,69,45,0.04)]"
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEditStaffModal(user)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#efe7d7] text-[#75684f] shadow-sm"
                            title="編輯人員"
                          >
                            ✎
                          </button>

                          <button
                            onClick={() => setExpandedStaffName((prev) => (prev === user.name ? "" : user.name))}
                            className="flex flex-1 items-center justify-between gap-3 text-left"
                          >
                            <div className="min-w-0">
                              <div className="text-[14px] font-semibold text-[#524736]">
                                {user.name}
                              </div>
                              <div className="mt-0.5 truncate text-[11px] text-[#8d8272]">
                                {latestCleaningActivity
                                  ? `${formatDate(latestCleaningActivity.date)} ${latestCleaningActivity.name}`
                                  : "目前無活動"}
                              </div>
                            </div>
                            <div className="text-[11px] font-semibold text-[#8d8272]">
                              房數 {assignedRooms.length}
                            </div>
                          </button>
                        </div>

                        {expanded && (
                          <div className="mt-2 space-y-1 rounded-[14px] bg-[#f7f3eb] p-2">
                            {assignedRooms.length > 0 ? (
                              assignedRooms.map((room) => (
                                <div
                                  key={room.id}
                                  className="flex items-center justify-between rounded-[12px] bg-white px-2.5 py-1.5 text-[12px] text-[#6c614d]"
                                >
                                  <span>{roomLabel(room)}</span>
                                  <span className="font-semibold">{roomProgress(room)}%</span>
                                </div>
                              ))
                            ) : (
                              <div className="text-center text-[12px] text-[#a79a86]">
                                目前沒有負責房間
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {adminView === "calendar" && (
              <div className="rounded-[28px] border border-[#e2d8c8] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f3eb_100%)] p-3 shadow-[0_12px_26px_rgba(84,69,45,0.08)]">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <SectionTitle
                    title="日曆"
                    sub="點日期查看當日活動；日期固定在格子上方"
                    icon={<CalendarDays className="h-4 w-4" />}
                  />
                  <button
                    onClick={() => openAddActivityModal()}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] text-white shadow-[0_10px_18px_rgba(110,99,67,0.22)]"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="rounded-[22px] border border-[#e2d8c8] bg-white p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <button
                      onClick={() =>
                        setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#efe7d7] text-[#75684f]"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    <div className="text-[14px] font-semibold text-[#524736]">
                      {monthLabel(calendarMonth)}
                    </div>

                    <button
                      onClick={() =>
                        setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-[#efe7d7] text-[#75684f]"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 pb-1">
                    {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
                      <div key={day} className="py-1 text-center text-[11px] font-semibold text-[#8d8272]">
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day) => {
                      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
                        day.getDate()
                      ).padStart(2, "0")}`;

                      const dayActivities = activitiesByDate.get(key) || [];
                      const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                      const isToday = isSameDate(day, new Date());

                      return (
                        <button
                          key={key}
                          onClick={() => setCalendarSheetDate(key)}
                          className={`min-h-[92px] rounded-[14px] border px-1.5 py-1.5 text-left ${
                            isCurrentMonth
                              ? "border-[#e2d8c8] bg-white"
                              : "border-[#ece3d7] bg-[#faf6f0] text-[#b1a691]"
                          }`}
                        >
                          <div className="flex justify-start">
                            <span
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                                isToday
                                  ? "bg-[#8d8462] text-white"
                                  : isCurrentMonth
                                  ? "text-[#524736]"
                                  : "text-[#b1a691]"
                              }`}
                            >
                              {day.getDate()}
                            </span>
                          </div>

                          <div className="mt-1 space-y-0.5">
                            {dayActivities.slice(0, 3).map((activity) => (
                              <div
                                key={activity.id}
                                className={`truncate rounded-[8px] px-1.5 py-0.5 text-[10px] ${
                                  activity.requiresCleaning
                                    ? "bg-[#efe7d7] text-[#8a7756]"
                                    : "bg-[#f3ede3] text-[#8b7f6b]"
                                }`}
                              >
                                {activity.name.slice(0, 3)}
                              </div>
                            ))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {currentUser && viewMode === "admin" && (
        <div className="fixed inset-x-0 bottom-0 border-t border-[#e2d8c8] bg-[#fcfaf6]/96 px-3 py-3 shadow-[0_-10px_24px_rgba(84,69,45,0.10)] backdrop-blur">
          <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
            <button
              onClick={() => setAdminView("activity")}
              className={`rounded-[16px] border px-2 py-2 text-[11px] font-semibold ${gradientButton(
                adminView === "activity"
              )}`}
            >
              活動列表
            </button>
            <button
              onClick={() => setAdminView("staff")}
              className={`rounded-[16px] border px-2 py-2 text-[11px] font-semibold ${gradientButton(
                adminView === "staff"
              )}`}
            >
              打掃人員
            </button>
            <button
              onClick={() => setAdminView("calendar")}
              className={`rounded-[16px] border px-2 py-2 text-[11px] font-semibold ${gradientButton(
                adminView === "calendar"
              )}`}
            >
              日曆
            </button>
            <button
              onClick={() => setAdminView("overview")}
              className={`rounded-[16px] border px-2 py-2 text-[11px] font-semibold ${gradientButton(
                adminView === "overview"
              )}`}
            >
              現況
            </button>
          </div>
        </div>
      )}

      {calendarSheetDate && currentUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/40 p-4"
          onClick={() => setCalendarSheetDate("")}
        >
          <div
            className="w-full max-w-md rounded-[24px] bg-white p-4 shadow-[0_20px_40px_rgba(15,23,42,0.18)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-[16px] font-semibold text-[#4f4435]">
                {formatDate(calendarSheetDate)} 活動
              </div>
              <button
                type="button"
                onClick={() => openAddActivityModal(calendarSheetDate)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] text-white shadow-[0_8px_16px_rgba(110,99,67,0.22)]"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {(activitiesByDate.get(calendarSheetDate) || []).length > 0 ? (
                (activitiesByDate.get(calendarSheetDate) || []).map((activity) => (
                  <div
                    key={activity.id}
                    className="rounded-[18px] border border-[#e4dccf] bg-[#faf6f0] px-3 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[#524736]">
                          {formatDate(activity.date)} {activity.name}
                        </div>
                        <div className="mt-1 text-[11px] text-[#8d8272]">
                          住宿人數：{activity.guestCount || "0"}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#8d8272]">
                          打掃：{activity.requiresCleaning ? "需要" : "不需"}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => openEditActivityModal(activity)}
                        className="shrink-0 rounded-[12px] bg-[#efe7d7] px-2.5 py-1 text-[11px] font-semibold text-[#8a7756]"
                      >
                        修改
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[18px] border border-dashed border-[#e4dccf] px-3 py-5 text-center text-[12px] text-[#a79a86]">
                  當日沒有活動
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showActivityModal && currentUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-4"
          onClick={() => setShowActivityModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-[28px] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.14)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-[#4f4435]">
              {activityModalMode === "edit" ? "修改活動" : "新增活動"}
            </div>

            <div className="mt-3 space-y-3">
              <input
                type="date"
                value={activityDate}
                onChange={(e) => setActivityDate(e.target.value)}
                className="w-full rounded-[18px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]"
              />

              <input
                value={activityName}
                onChange={(e) => setActivityName(e.target.value)}
                className="w-full rounded-[18px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]"
                placeholder="活動名稱"
              />

              <input
                value={activityContact}
                onChange={(e) => setActivityContact(e.target.value)}
                className="w-full rounded-[18px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]"
                placeholder="聯絡人 / 備註"
              />

              <label className="flex items-center justify-between rounded-[18px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]">
                <span>需打掃</span>
                <input
                  type="checkbox"
                  checked={activityNeedsCleaning}
                  onChange={(e) => setActivityNeedsCleaning(e.target.checked)}
                  className="accent-[#8b8462]"
                />
              </label>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <div>
                {activityModalMode === "edit" && (
                  <button
                    onClick={deleteCurrentActivity}
                    className="rounded-[20px] bg-[#e7d9d5] px-3 py-2 text-sm font-medium text-[#8a4f43]"
                  >
                    刪除活動
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowActivityModal(false)}
                  className="rounded-[20px] bg-[#ece5d9] px-3 py-2 text-sm font-medium text-[#5f5444]"
                >
                  取消
                </button>
                <button
                  onClick={saveActivityModal}
                  className="rounded-[20px] bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] px-3 py-2 text-sm font-medium text-white"
                >
                  儲存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRoomModal && currentUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-4"
          onClick={() => setShowRoomModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-[28px] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.14)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-[#4f4435]">新增房間</div>

            <div className="mt-3 space-y-3">
              <select
                value={newRoomBuilding}
                onChange={(e) => setNewRoomBuilding(e.target.value as BuildingType)}
                className="w-full rounded-[20px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]"
              >
                <option value="A">A棟</option>
                <option value="B">B棟</option>
              </select>

              <select
                value={newRoomFloor}
                onChange={(e) => setNewRoomFloor(e.target.value as FloorType)}
                className="w-full rounded-[20px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]"
              >
                {FLOOR_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>

              <input
                value={newRoomNo}
                onChange={(e) => setNewRoomNo(e.target.value)}
                className="w-full rounded-[20px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]"
                placeholder="房號，例如 201"
              />

              <textarea
                value={newOccupant}
                onChange={(e) => setNewOccupant(e.target.value)}
                className="min-h-[60px] w-full resize-none rounded-[20px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm leading-5 text-[#5f5444]"
                placeholder="住宿人"
                rows={3}
              />

              <select
                value={newRoomStaff}
                onChange={(e) => setNewRoomStaff(e.target.value)}
                className="w-full rounded-[20px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]"
              >
                <option value="未分配">未分配</option>
                {staffUsers.map((user) => (
                  <option key={user.id} value={user.name}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowRoomModal(false)}
                className="rounded-[20px] bg-[#ece5d9] px-3 py-2 text-sm font-medium text-[#5f5444]"
              >
                取消
              </button>
              <button
                onClick={saveNewRoom}
                className="rounded-[20px] bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] px-3 py-2 text-sm font-medium text-white"
              >
                新增
              </button>
            </div>
          </div>
        </div>
      )}

      {showStaffModal && currentUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-4"
          onClick={() => setShowStaffModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-[28px] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.14)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-[#4f4435]">
              {staffModalMode === "edit" ? "編輯打掃人員" : "新增打掃人員"}
            </div>

            <div className="mt-3 space-y-3">
              <input
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
                className="w-full rounded-[20px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]"
                placeholder="人員姓名"
              />

              <input
                value={newStaffPin}
                onChange={(e) => setNewStaffPin(e.target.value)}
                className="w-full rounded-[20px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]"
                placeholder="登入密碼"
                type="password"
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowStaffModal(false)}
                className="rounded-[20px] bg-[#ece5d9] px-3 py-2 text-sm font-medium text-[#5f5444]"
              >
                取消
              </button>
              <button
                onClick={saveStaffModal}
                className="rounded-[20px] bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] px-3 py-2 text-sm font-medium text-white"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}

      {showPhotoModal && currentUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/45 p-4"
          onClick={resetPhotoModal}
        >
          <div
            className="w-full max-w-sm rounded-[28px] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.14)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-[#4f4435]">請上傳照片</div>
            <div className="mt-2 text-sm leading-6 text-[#8b8173]">
              掃地・拖地 與 廁所清潔 完成前需要先上傳照片。
            </div>

            <div className="mt-4">
              <label className="flex cursor-pointer items-center justify-center rounded-[20px] border border-dashed border-[#cfc4b3] bg-[#fcfaf6] px-4 py-5 text-sm text-[#6b604b]">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setPhotoFile(file);
                    setPhotoFileName(file?.name || "");
                  }}
                />
                {photoFileName ? `已選擇：${photoFileName}` : "點這裡選擇照片"}
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={resetPhotoModal}
                className="rounded-[20px] bg-[#ece5d9] px-3 py-2 text-sm font-medium text-[#5f5444]"
              >
                取消
              </button>
              <button
                onClick={confirmPhotoUploadAndComplete}
                className="rounded-[20px] bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] px-3 py-2 text-sm font-medium text-white"
              >
                上傳並完成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}