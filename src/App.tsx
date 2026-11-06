import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Coffee,
  House,
  Image as ImageIcon,
  Plus,
  Printer,
  UserPlus,
  Users,
  WandSparkles,
} from "lucide-react";
import { readSession, signInWithPin, signOutSession, provisionQaPin } from "./lib/authSession";
import SharedActivityCalendar from "./components/SharedActivityCalendar";
import { HousekeepingApiError, getBusinessOverview, getCleaners, createActivity, editActivity, deleteActivity, type CalendarEvent,
  createQaRoom, deleteQaRoom, updateRoomChecklist, updateRoomAdministration,
  createQaCleaner, renameQaCleaner, moveGuestAtomic } from "./lib/housekeepingApi";

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
  cleanerId?: number | null;
  assignedCleanerId?: number | null;
  occupant: string;
  status: RoomStatus;
  checklist: ChecklistItem[];
};

type PendingChecklistWrite = {
  activityId: string;
  roomId: string;
  dbId: number;
  epoch: number;
  committed: ChecklistItem[];
  desired: ChecklistItem[];
  writing: boolean;
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

function isApprovedProductionUI(): boolean {
  // Trust the build-time HTML marker, not a Vite env key that may be missing
  // from the shipped bundle. Server handlers always enforce real permissions.
  // UI-only distinction for the published production hostname. Vercel
  // preview deployments cannot enable production-only editing screens.
  // Backend authorization always relies on the validated server session.
  return typeof window !== "undefined" &&
    window.location.hostname.toLowerCase() === "housekeeping-tianhui.vercel.app";
}

function validateNewStaffPin(value: string): string {
  if(value.length === 0)return "請輸入新 PIN。";
  if(!/^[0-9]{8,32}$/.test(value))
    return "新 PIN 必須是 8～32 位半形數字，不能有空格、英文字或其他符號。";
  if(/^([0-9]{1,4})\1+$/.test(value))
    return "這組 PIN 是重複數字或重複組合，請改用較不規律的數字。";
  const digits=[...value].map(Number);
  if(digits.every((digit,i)=>i===0||digit===(digits[i-1]+1)%10))
    return "這組 PIN 是連續遞增數字，請改用不連續的數字。";
  if(digits.every((digit,i)=>i===0||digit===(digits[i-1]+9)%10))
    return "這組 PIN 是連續遞減數字，請改用不連續的數字。";
  return "";
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
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return parseDateStart(date).getTime() < todayStart;
}

function sortActivitiesByClosestDate(list: Activity[], today: Date): Activity[] {
  return [...list].sort((a, b) => {
    const aDate = parseDateStart(a.date).getTime();
    const bDate = parseDateStart(b.date).getTime();
    const todayTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

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

function ZenLotusIcon({className="h-5 w-5"}:{className?:string}) {
  return <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 26C6 22 7 14 16 6c9 8 10 16 0 20Z"/><path d="M15 26C7 27 3 21 3 14c6 0 10 3 12 12Zm2 0c8 1 12-5 12-12-6 0-10 3-12 12Z"/><path d="M3 28c8-2 18-2 26 0"/>
  </svg>;
}
function RoundedPersonIcon({className="h-5 w-5"}:{className?:string}) {
  return <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="16" cy="9" r="5"/><path d="M5 27c0-7 4-11 11-11s11 4 11 11c-7 3-15 3-22 0Z"/>
  </svg>;
}
function IncenseStatusIcon({className="h-5 w-5"}:{className?:string}) {
  return <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 5c-5 6 5 5 0 12M17 3c-6 7 4 7-1 13M25 5c-5 6 5 6 0 12"/><path d="M4 21h24c-1 7-6 9-12 9S5 28 4 21Z"/>
  </svg>;
}
export default function App() {
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [loginUsers,setLoginUsers] = useState<User[]>([]);
  const [authBusy,setAuthBusy] = useState(false);
  const [loginFeedback,setLoginFeedback] = useState("");
  const [staffFeedback,setStaffFeedback] = useState("");
  const [staffSaveStage,setStaffSaveStage] = useState("等待操作");
  const [staffSaveStatus,setStaffSaveStatus] = useState<"idle"|"saving"|"error">("idle");
  const [staffButtonPresses,setStaffButtonPresses] = useState(0);
  const [staffSuccess,setStaffSuccess] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const dataEpoch=useRef(0);
  const overviewRequestSequence=useRef(0);
  const cleanerRequestSequence=useRef(0);
  const [showLogin, setShowLogin] = useState(true);
  const [authRestoring,setAuthRestoring]=useState(true);
  const [authRestoreError,setAuthRestoreError]=useState("");
  const [staffCalendarVisible,setStaffCalendarVisible]=useState(false);
  const [sharedCalendarEvents,setSharedCalendarEvents]=useState<CalendarEvent[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [pin, setPin] = useState("");

  const [viewMode, setViewMode] = useState<"staff" | "admin">("staff");
  const [roomFilter, setRoomFilter] = useState<"all" | "completed" | "pending">("all");
  const [adminView, setAdminView] = useState<AdminView>("overview");
  const [activitySection,setActivitySection] = useState<"summary"|"rooms">("summary");
  const [roomDisplay,setRoomDisplay] = useState<"cards"|"table">("cards");
  const [activityYear,setActivityYear] = useState(()=>String(new Date().getFullYear()));
  const [activityMonth,setActivityMonth] = useState("all");
  const activityScope = activityMonth==="all" ? activityYear : `${activityYear}-${activityMonth}`;
  const [overviewFilter, setOverviewFilter] = useState<OverviewFilter>("all");
  const [overviewSearch, setOverviewSearch] = useState("");
  const [managementSection,setManagementSection] = useState<"home"|"lodging"|"cafe">("home");
  const [lodgingPanel,setLodgingPanel] = useState<"duplicates"|"anomalies"|"supplies"|"notices"|"progress">("duplicates");
  const [cafePanel,setCafePanel] = useState<"income"|"inventory">("income");
  const [expandedRoomId, setExpandedRoomId] = useState("");
  const checklistSavingRooms = useRef(new Set<string>());
  // One serialized write stream per room. Other checkboxes remain interactive
  // while pending writes are submitted in the order needed for optimistic locks.
  const pendingChecklistWrites = useRef(new Map<string, PendingChecklistWrite>());
  const [savingChecklistRoomIds, setSavingChecklistRoomIds] = useState<string[]>([]);
  const roomAdministrationSaving = useRef(new Set<string>());
  const [savingRoomAdministrationIds,setSavingRoomAdministrationIds] = useState<string[]>([]);
  const [openCleanerPickerRoomId,setOpenCleanerPickerRoomId] = useState("");
  const [expandedStaffName, setExpandedStaffName] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [calendarSheetDate, setCalendarSheetDate] = useState("");

  const [showActivityModal, setShowActivityModal] = useState(false);
  const activityMutationBusy = useRef(false);
  const [activitySaving, setActivitySaving] = useState(false);
  const [activityModalMode, setActivityModalMode] = useState<"add" | "edit">("add");
  const [editingActivityId, setEditingActivityId] = useState("");
  const [activityName, setActivityName] = useState("");
  const [activityDate, setActivityDate] = useState(formatDateToInput(new Date()));
  const [activityContact, setActivityContact] = useState("");
  const [activityNeedsCleaning, setActivityNeedsCleaning] = useState(true);

  const [showRoomModal, setShowRoomModal] = useState(false);
  const roomMutationBusy = useRef(false);
  const [roomSaving, setRoomSaving] = useState(false);
  const [newRoomBuilding, setNewRoomBuilding] = useState<BuildingType>("A");
  const [newRoomFloor, setNewRoomFloor] = useState<FloorType>("2F");
  const [newRoomNo, setNewRoomNo] = useState("209");
  const [newOccupant, setNewOccupant] = useState("");
  const [newRoomStaff, setNewRoomStaff] = useState("");

  const [showStaffModal, setShowStaffModal] = useState(false);
  const staffMutationBusy = useRef(false);
  const [staffSaving, setStaffSaving] = useState(false);
  const [staffModalMode, setStaffModalMode] = useState<"add" | "edit">("add");
  const [editingStaffId, setEditingStaffId] = useState("");
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffPin, setNewStaffPin] = useState("");

  const [activitySelectedBuilding, setActivitySelectedBuilding] = useState<"all" | BuildingType>("all");
  const [activitySelectedFloor, setActivitySelectedFloor] = useState<"all" | FloorType>("all");
  const [activityRoomSearch,setActivityRoomSearch] = useState("");

  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [selectedPrintRoomIds, setSelectedPrintRoomIds] = useState<string[]>([]);
  const [occupantDrafts,setOccupantDrafts] = useState<Record<string,string>>({});
  const [quickPasteRoomId,setQuickPasteRoomId] = useState("");
  const [quickPasteText,setQuickPasteText] = useState("");
  const [quickPasteMode,setQuickPasteMode] = useState<"append"|"replace">("append");
  const [duplicatePending,setDuplicatePending] = useState<{activityId:string;roomId:string;names:string;person:string;locations:string[]}|null>(null);
  const [duplicateReport,setDuplicateReport] = useState<Array<{name:string;rooms:string[]}>|null>(null);
  const [guestMove,setGuestMove] = useState<{fromRoomId:string;name:string;toRoomId:string}|null>(null);
  const [guestMoving,setGuestMoving] = useState(false);

  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [pendingPhotoAction, setPendingPhotoAction] = useState<PhotoAction | null>(null);
  const [photoFileName, setPhotoFileName] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [today, setToday] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  useEffect(() => {
    // Keep the activity order correct when a browser tab stays open overnight.
    const refreshDate = () => {
      const now = new Date();
      setToday(previous => isSameDate(previous, now)
        ? previous
        : new Date(now.getFullYear(), now.getMonth(), now.getDate()));
    };
    const timer = window.setInterval(refreshDate, 60_000);
    window.addEventListener("focus", refreshDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshDate);
    };
  }, []);

  async function loadCleanersFromSupabase() {
    const epoch=dataEpoch.current;
    const sequence=++cleanerRequestSequence.current;
    try {
      const rows = await getCleaners();
      if(epoch!==dataEpoch.current || sequence!==cleanerRequestSequence.current)return;
      setStaffUsers(rows.filter(row=>row.is_active).map(row=>({
        id:`cleaner-${row.id}`,dbId:row.id,name:row.name,role:"cleaner",
      })));
    } catch (error) {
      console.error("無法取得房務人員清單（僅管理員）",error);
    }
  }

  function normalizeDbChecklist(input: unknown): ChecklistItem[] {
    if (!Array.isArray(input) || input.length === 0) return buildChecklist();
    const defaults=buildChecklist();
    return input.filter((x):x is Record<string,any> => !!x && typeof x==="object" && typeof x.id==="string")
      .map(saved=>{
        const base=defaults.find(x=>x.id===saved.id);
        return {
          id:saved.id,
          label:base?.label||String(saved.label||saved.id),
          description:base?.description||String(saved.description||""),
          requiredPhoto:base?.requiredPhoto??Boolean(saved.requiredPhoto),
          done:Boolean(saved.done),photo:Boolean(saved.photo),
          subItems:Array.isArray(saved.subItems)?saved.subItems.map((sub:any)=>({
            id:String(sub.id),
            label:base?.subItems.find(s=>s.id===sub.id)?.label||String(sub.label||sub.id),
            done:Boolean(sub.done),
          })):[],
        };
      });
  }

  async function loadEventsFromSupabase() {
    const epoch=dataEpoch.current;
    const sequence=++overviewRequestSequence.current;
    try {
      const data = await getBusinessOverview();
      if(epoch!==dataEpoch.current || sequence!==overviewRequestSequence.current)return;
      const eventsData = data.events;
      const roomsData = data.eventRooms;
      setSharedCalendarEvents(data.calendarEvents);
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
          const pending = pendingChecklistWrites.current.get(`room-${room.id}`);
          const checklist = pending && pending.epoch === epoch
            ? pending.desired : normalizeDbChecklist(room.checklist);

          // The checklist is the canonical source of UI progress and status.
          // Fallback supports older records that do not yet contain a checklist.
          const legacyStatus = room.status === "completed" || room.status === "已完成" ||
            room.cleaning_status === "已完成"
              ? "completed"
              : room.status === "in_progress" || room.status === "進行中" ||
                room.cleaning_status === "進行中"
                ? "in_progress"
                : "pending";
          const statusFromDb: RoomStatus =
            Array.isArray(room.checklist) && room.checklist.length > 0
              ? computeRoomStatus(checklist)
              : legacyStatus;

          const occupantValue = room.occupant ?? room.guest_name ?? "";

          return {
            id: `room-${room.id}`,
            dbId: room.id,
            eventId: room.event_id,
            building: (room.building || "A") as BuildingType,
            floor: (room.floor || "2F") as FloorType,
            roomNo: room.room_no || "201",
            assignedTo: room.assigned_to || "未分配",
            cleanerId: room.cleaner_id ?? null,
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
    } catch (error) {
      if(epoch!==dataEpoch.current || sequence!==overviewRequestSequence.current)return;
      if(error instanceof HousekeepingApiError && (error.status===401 || error.status===403)){
        // Fail closed immediately if a session was revoked while the tab was open.
        dataEpoch.current+=1;
        setCurrentUser(null);
        setShowLogin(true);
        setPin("");
        setActivities([]);
        setSharedCalendarEvents([]);
        setAuthRestoreError("登入已失效或權限已變更，請重新登入。");
        return;
      }
      console.error("房務資料讀取失敗",error);
      window.alert("目前無法安全讀取房務資料，請稍後重新登入");
    }
  }

  useEffect(() => {
    let active=true;
    const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
    async function restore(){
      setAuthRestoring(true);
      setAuthRestoreError("");
      // Account labels are not a prerequisite for restoring an existing session.
      // The secure HttpOnly cookie is authoritative; never infer sign-in from local state.
      try {
        for(let attempt=0;attempt<3;attempt++){
          try {
            const session=await readSession();
            if(active && session.authenticated){
              setCurrentUser(session.user);
              setShowLogin(false);
              setViewMode(session.user.role==="admin"?"admin":"staff");
            }
            break;
          }catch(error){
            if(attempt===2)throw error;
            await delay(250*(attempt+1));
          }
        }
      } catch(error){
        if(active)setAuthRestoreError("工作階段驗證失敗，請檢查網路後重新整理；系統不會要求重設 PIN。");
      } finally {
        if(active)setAuthRestoring(false);
      }
      try {
        const response=await fetch("/api/auth/accounts",{credentials:"same-origin",cache:"no-store"});
        if(!response.ok)throw new Error("帳號清單無法載入");
        const directory=await response.json() as {users:Array<{id:string;name:string}>};
        if(active)setLoginUsers(directory.users.map(row=>({
          id:row.id,name:row.name,role:row.id==="admin"?"admin":"cleaner",
        })));
      }catch(error){
        if(active)setAuthRestoreError(prev=>prev||"目前無法載入登入帳號，請重新整理。");
      }
    }
    void restore();
    return ()=>{active=false;};
  }, []);

  useEffect(()=>{
    dataEpoch.current+=1;
    pendingChecklistWrites.current.clear();
    checklistSavingRooms.current.clear();
    setSavingChecklistRoomIds([]);
    if(!currentUser){
      setActivities([]);setStaffUsers([]);setSharedCalendarEvents([]);
      setSelectedPrintRoomIds([]);setOccupantDrafts({});
      setQuickPasteRoomId("");setQuickPasteText("");setDuplicatePending(null);setDuplicateReport(null);
      setGuestMove(null);
      setOpenCleanerPickerRoomId("");
      setOverviewSearch("");setCalendarSheetDate("");
      setExpandedRoomId("");setExpandedStaffName("");
      setShowActivityModal(false);setShowRoomModal(false);setShowStaffModal(false);
      setShowPhotoModal(false);setPendingPhotoAction(null);setPhotoFile(null);
      return;
    }
    void loadEventsFromSupabase();
    if(currentUser.role==="admin")void loadCleanersFromSupabase();
  },[currentUser?.id]);

  // Refresh the dashboard while it is being used, so updates by another
  // cleaner appear without a manual reload. Hidden tabs do not poll.
  useEffect(()=>{
    if(!currentUser)return;
    const refresh=()=>{
      if(document.visibilityState!=="visible")return;
      void loadEventsFromSupabase();
      if(currentUser.role==="admin")void loadCleanersFromSupabase();
    };
    const onVisible=()=>{if(document.visibilityState==="visible")refresh();};
    const timer=window.setInterval(refresh,currentUser.role==="cleaner"?15_000:30_000);
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",onVisible);
    return ()=>{
      window.clearInterval(timer);
      window.removeEventListener("focus",refresh);
      document.removeEventListener("visibilitychange",onVisible);
    };
  },[currentUser?.id,currentUser?.role]);

  // Revalidate the HttpOnly session when returning to the tab and periodically
  // while it is open. A revoked or expired session must not leave old room data
  // accessible in memory after account switching.
  useEffect(()=>{
    if(!currentUser)return;
    let active=true;
    let checking=false;
    const expectedId=currentUser.id;
    async function verify(){
      if(!active||checking)return;
      checking=true;
      try {
        const session=await readSession();
        if(!active)return;
        if(!session.authenticated||session.user.id!==expectedId||
           session.user.role!==currentUser?.role){
          dataEpoch.current+=1;
          setCurrentUser(null);
          setShowLogin(true);
          setPin("");
          setViewMode("staff");
          setAuthRestoreError("登入已失效或帳號權限已變更，請重新登入。");
        } else if (session.user.name !== currentUser?.name) {
          // Name changes should refresh the visible label, never the account ID.
          setCurrentUser(previous => previous?.id === expectedId ? session.user : previous);
        }
      }catch{
        // Transient connectivity must not falsely mark a still-valid session expired.
      }finally{checking=false;}
    }
    const onFocus=()=>{void verify();};
    const onVisible=()=>{if(document.visibilityState==="visible")void verify();};
    window.addEventListener("focus",onFocus);
    document.addEventListener("visibilitychange",onVisible);
    const interval=window.setInterval(()=>void verify(),60000);
    return ()=>{
      active=false;
      window.removeEventListener("focus",onFocus);
      document.removeEventListener("visibilitychange",onVisible);
      window.clearInterval(interval);
    };
  },[currentUser?.id,currentUser?.role]);

  const role = currentUser?.role ?? null;


  const sortedActivities = useMemo(
    () => sortActivitiesByClosestDate(activities, today),
    [activities, today]
  );

  // Offer a broad year range even for years with no events, while including
  // the earliest and latest saved activity years. Entering Activities always
  // defaults to the current year, not the previously viewed year/month.
  const activityYears = useMemo(()=>{
    const thisYear=today.getFullYear();
    const eventYears=activities.map(a=>Number(a.date.slice(0,4)))
      .filter(y=>Number.isSafeInteger(y) && y>=1900 && y<=2200);
    const earliest=Math.min(2000,...eventYears);
    const latest=Math.max(thisYear+20,...eventYears);
    return Array.from({length:latest-earliest+1},(_,i)=>latest-i);
  },[activities,today]);
  const scopedActivities = useMemo(()=>sortedActivities.filter(a=>a.date.startsWith(activityScope)),[sortedActivities,activityScope]);
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
        : latestRooms.filter((room) =>
            /^cleaner-[1-9]\d*$/.test(currentUser.id) &&
            room.cleanerId === Number(currentUser.id.slice("cleaner-".length))
          );

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
    const search = overviewSearch.trim().toLocaleLowerCase();
    return latestRooms.filter((room) => {
      if (overviewFilter !== "all" && room.status !== overviewFilter) return false;
      if (!search) return true;
      return [roomLabel(room), room.roomNo, room.assignedTo, room.occupant]
        .some(value => value.toLocaleLowerCase().includes(search));
    });
  }, [latestRooms, overviewFilter, overviewSearch]);

  // Read-only diagnostics from the same event/room state used by Activity.
  // Identity comparison is exact (including character variants), and separate
  // events are never treated as duplicates of each other.
  const lodgingDiagnostics=useMemo(()=>{
    const duplicates:Array<{id:string;activityId:string;activityName:string;name:string;rooms:string[];roomNo:string}>=[];
    const anomalies:Array<{id:string;activityId:string;activityName:string;roomNo:string;roomName:string;kind:string;detail:string}>=[];
    for(const activity of activities){
      if(!activity.requiresCleaning)continue;
      const names=new Map<string,Array<{room:Room;label:string}>>();
      for(const room of activity.rooms){
        const list=splitGuestLines(occupantDrafts[room.id]??room.occupant);
        for(const name of list){
          const found=names.get(name)??[];
          found.push({room,label:roomLabel(room)});
          names.set(name,found);
        }
        if(list.length>0 && room.cleanerId==null){
          anomalies.push({id:activity.id+"/"+room.id+"/unassigned",activityId:activity.id,
            activityName:activity.name,roomNo:room.roomNo,roomName:roomLabel(room),
            kind:"未指派房務",detail:"已有住宿人，但尚未指派打掃人員"});
        }
        if(occupantDrafts[room.id]!==undefined &&
          splitGuestLines(occupantDrafts[room.id]).join("、")!==splitGuestLines(room.occupant).join("、")){
          anomalies.push({id:activity.id+"/"+room.id+"/draft",activityId:activity.id,
            activityName:activity.name,roomNo:room.roomNo,roomName:roomLabel(room),
            kind:"名單待儲存",detail:"有尚未同步至資料庫的住宿人修改"});
        }
      }
      for(const [name,locations] of names){
        if(locations.length<2)continue;
        duplicates.push({
          id:activity.id+"/"+name,activityId:activity.id,activityName:activity.name,
          name,rooms:locations.map(x=>x.label),roomNo:locations[0].room.roomNo,
        });
      }
    }
    return {duplicates,anomalies};
  },[activities,occupantDrafts]);

  function openManagedRoom(activityId:string,roomNo:string) {
    setAdminView("activity");
    setActivitySection("rooms");
    selectActivity(activityId);
    // selectActivity clears stale filter and search. Set the new room number
    // only after changing the selected activity.
    setActivityRoomSearch(roomNo);
  }

  const filteredActivityRooms = useMemo(() => {
    if (!selectedActivity) return [];
    const term=activityRoomSearch.trim().toLocaleLowerCase();
    return selectedActivity.rooms
      .filter(room=>!term || [roomLabel(room),room.roomNo,room.assignedTo,room.occupant]
        .some(value=>value.toLocaleLowerCase().includes(term)))
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
  }, [selectedActivity, activitySelectedBuilding, activitySelectedFloor, activityRoomSearch]);

  const selectedPrintCount = useMemo(() => {
    // Selection belongs to the activity, not the current building/floor filter.
    return selectedActivity?.rooms.filter(room =>
      selectedPrintRoomIds.includes(room.id)).length ?? 0;
  }, [selectedActivity, selectedPrintRoomIds]);

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

  function openPhotoModal(_action: PhotoAction) {
    // Intentional pause: retain preexisting photo viewing, never open upload modal.
    window.alert("照片上傳功能目前暫停。已儲存照片仍可檢視；清潔勾選可以照常完成。");
  }

  async function uploadCleaningPhoto(room: Room,itemId:string,file:File):Promise<string|null>{
    if(!room.dbId){window.alert("找不到房間資料");return null;}
    if(file.size>2*1024*1024||!["image/png","image/jpeg","image/webp"].includes(file.type)){
      window.alert("照片限 PNG、JPEG 或 WebP，大小不得超過 2MB");return null;
    }
    try {
      const bytes=new Uint8Array(await file.arrayBuffer());
      let binary="";
      for(let i=0;i<bytes.length;i+=8192)
        binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      const response=await fetch("/api/data/rooms",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({roomId:room.dbId,itemId,mime:file.type,base64:btoa(binary)}),
      });
      if(!response.ok)throw new Error(`伺服器拒絕照片上傳（HTTP ${response.status}）`);
      return "private";
    } catch(error) {
      window.alert(error instanceof Error?error.message:"照片上傳失敗");
      return null;
    }
  }

  async function viewPrivatePhoto(room:Room,itemId:string) {
    if(!room.dbId)return;
    const preview=window.open("about:blank","_blank");
    try{
      const params=new URLSearchParams({roomId:String(room.dbId),itemId});
      const response=await fetch("/api/data/rooms?"+params.toString(),{
        credentials:"same-origin",cache:"no-store",
      });
      if(!response.ok)throw new Error("無法查看私人照片（HTTP "+response.status+"）");
      const body=await response.json() as {signedUrl?:string};
      if(!body.signedUrl||!body.signedUrl.startsWith("https://"))throw new Error("照片連結無效");
      if(preview)preview.location.href=body.signedUrl;
      else window.alert("瀏覽器已阻擋照片視窗，請允許彈出視窗再重試。");
    }catch(error){
      preview?.close();
      window.alert(error instanceof Error?error.message:"照片檢視失敗");
    }
  }

  async function handleLogin() {
    if(authBusy||authRestoring)return;
    setLoginFeedback("");
    if(!selectedUserId||!pin){setLoginFeedback("請先選擇帳號並輸入 PIN。");return;}
    setAuthBusy(true);
    try {
      const session=await signInWithPin(selectedUserId,pin);
      setPin("");
      if(!session.authenticated || session.user.id !== selectedUserId)
        throw new Error("登入帳號驗證不一致，請重新登入。");
      setAuthRestoreError("");
      dataEpoch.current+=1;
      // Clear previous account UI before exposing the newly authenticated identity.
      setActivities([]);
      setStaffUsers([]);
      setSharedCalendarEvents([]);
      setSelectedPrintRoomIds([]);
      setOccupantDrafts({});
      setExpandedRoomId("");
      setExpandedStaffName("");
      setOverviewSearch("");
      setCalendarSheetDate("");
      setCurrentUser(session.user);
      setShowLogin(false);
      setViewMode(session.user.role==="admin"?"admin":"staff");
    }catch(error) {
      setPin("");
      setLoginFeedback(error instanceof Error?error.message:"登入失敗");
    }finally {setAuthBusy(false);}
  }

  async function handleLogout() {
    if(authBusy)return;
    setAuthBusy(true);
    try {
      await signOutSession();
      dataEpoch.current+=1;
      setCurrentUser(null);
      setActivities([]);
      setStaffUsers([]);
      setShowLogin(true);
      setSelectedUserId("");
      setPin("");
      setViewMode("staff");
      setAdminView("overview");
      setOverviewFilter("all");
      setExpandedRoomId("");
      setExpandedStaffName("");
      setOverviewSearch("");
      setCalendarSheetDate("");
      setSelectedPrintRoomIds([]);
      setOccupantDrafts({});
      setSharedCalendarEvents([]);
      resetPhotoModal();
    }catch(error) {
      window.alert("登出失敗，請重試；不會假設登入已失效");
    }finally {setAuthBusy(false);}
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

  function findDuplicateOccupants(activityId:string,roomId:string,names:string[]) {
    const activity=activities.find(a=>a.id===activityId);
    if(!activity)return [] as Array<{person:string;locations:string[]}>;
    const result:Array<{person:string;locations:string[]}>=[];
    for(const person of new Set(names)){
      const locations=activity.rooms.filter(r=>r.id!==roomId && splitGuestLines(r.occupant).includes(person))
        .map(r=>roomLabel(r));
      if(names.filter(n=>n===person).length>1)locations.push("目前房間名單內");
      if(locations.length)result.push({person,locations});
    }
    return result;
  }

  async function saveOccupantList(activityId:string,roomId:string,text:string,allowDuplicate=false) {
    const activity=activities.find(a=>a.id===activityId);
    const room=activity?.rooms.find(r=>r.id===roomId);
    if(!room)return false;
    const normalized=splitGuestLines(text).join("、");
    if(normalized===splitGuestLines(room.occupant).join("、")){
      setOccupantDrafts(prev=>{const next={...prev};if(next[roomId]===text || splitGuestLines(next[roomId]??"").join("、")===normalized)delete next[roomId];return next;});
      return true;
    }
    if(!allowDuplicate){
      const existingNames=splitGuestLines(room.occupant);
      const introduced=splitGuestLines(normalized).filter(name=>!existingNames.includes(name));
      const duplicates=findDuplicateOccupants(activityId,roomId,introduced);
      if(duplicates.length){
        setDuplicatePending({activityId,roomId,names:normalized,person:duplicates[0].person,locations:duplicates[0].locations});
        return false;
      }
    }
    const saved=await updateRoomField(activityId,roomId,{occupant:normalized});
    if(saved)setOccupantDrafts(prev=>{
      if(prev[roomId]!==text && splitGuestLines(prev[roomId]??"").join("、")!==normalized)return prev;
      const next={...prev};delete next[roomId];return next;
    });
    return saved;
  }

  function openQuickPaste(roomId:string) {
    setQuickPasteRoomId(roomId);
    setQuickPasteText("");
    setQuickPasteMode("append");
  }

  function openGuestMove(roomId:string) {
    if(!selectedActivity)return;
    const room=selectedActivity.rooms.find(r=>r.id===roomId);
    if(!room)return;
    if(roomHasPendingOccupant(room)){window.alert("此房間的名單尚未儲存，請先完成儲存再移動。");return;}
    const to=selectedActivity.rooms.find(r=>r.id!==roomId);
    const name=splitGuestLines(room.occupant)[0]??"";
    if(!name || !to){window.alert("沒有可移動的住宿人或其他房間。");return;}
    setGuestMove({fromRoomId:roomId,name,toRoomId:to.id});
  }

  async function confirmGuestMove() {
    if(!selectedActivity || !guestMove || guestMoving || currentUser?.role!=="admin")return;
    const source=selectedActivity.rooms.find(r=>r.id===guestMove.fromRoomId);
    const target=selectedActivity.rooms.find(r=>r.id===guestMove.toRoomId);
    if(!source?.dbId || !target?.dbId || source.id===target.id)return;
    if(roomHasPendingOccupant(source)||roomHasPendingOccupant(target)){
      window.alert("有尚未儲存的住宿人名單，請先完成儲存。");return;
    }
    const epoch=dataEpoch.current;
    setGuestMoving(true);
    try{
      await moveGuestAtomic({fromRoomId:source.dbId,toRoomId:target.dbId,name:guestMove.name,
        expectedFrom:source.occupant,expectedTo:target.occupant});
      if(epoch===dataEpoch.current){setGuestMove(null);await loadEventsFromSupabase();}
    }catch(error){
      if(epoch===dataEpoch.current){
        window.alert((error instanceof Error?error.message:"移動失敗")+"；兩間房資料未完成更新，請確認最新資料。");
        await loadEventsFromSupabase();
      }
    }finally{setGuestMoving(false);}
  }

  function scanDuplicateOccupants() {
    if(!selectedActivity)return;
    const names=new Map<string,Set<string>>();
    for(const room of selectedActivity.rooms){
      for(const name of splitGuestLines(occupantDrafts[room.id]??room.occupant)){
        const rooms=names.get(name)??new Set<string>();
        rooms.add(roomLabel(room));
        names.set(name,rooms);
      }
    }
    const results=Array.from(names,([name,rooms])=>({name,rooms:Array.from(rooms)}))
      .filter(row=>row.rooms.length>1);
    setDuplicateReport(results);
  }

  async function applyQuickPaste() {
    if(!selectedActivity || !quickPasteRoomId)return;
    const room=selectedActivity.rooms.find(r=>r.id===quickPasteRoomId);
    if(!room)return;
    const incoming=splitGuestLines(quickPasteText.replace(/\t/g,"、"));
    if(!incoming.length){window.alert("請先貼上至少一位住宿人姓名。");return;}
    const existing=splitGuestLines(occupantDrafts[room.id]??room.occupant);
    const names=quickPasteMode==="append"?[...existing,...incoming]:incoming;
    const text=names.join("、");
    setOccupantDrafts(prev=>({...prev,[room.id]:text}));
    setQuickPasteRoomId("");
    setQuickPasteText("");
    await saveOccupantList(selectedActivity.id,room.id,text);
  }

  async function updateRoomField(activityId:string,roomId:string,updates:Partial<Room>):Promise<boolean> {
    const activity=activities.find(a=>a.id===activityId);
    const room=activity?.rooms.find(r=>r.id===roomId);
    if(!room?.dbId)return false;
    const mutationEpoch=dataEpoch.current;
    const savingChecklist=updates.checklist!==undefined;
    const savingAdministration=updates.assignedTo!==undefined ||
      updates.assignedCleanerId!==undefined || updates.occupant!==undefined;
    if(savingAdministration){
      if(roomAdministrationSaving.current.has(roomId))return false;
      roomAdministrationSaving.current.add(roomId);
      setSavingRoomAdministrationIds(prev=>[...prev,roomId]);
    }
    if(savingChecklist){
      if(checklistSavingRooms.current.has(roomId))return false;
      checklistSavingRooms.current.add(roomId);
      setSavingChecklistRoomIds(prev=>[...prev,roomId]);
      // Optimistic display only. The server is still authoritative and validates
      // both assignment and expected previous checklist before committing.
      // The per-room write lock prevents conflicting rapid changes.
      const nextChecklist=updates.checklist!;
      setActivities(prev=>prev.map(item=>item.id!==activityId?item:{
        ...item,rooms:item.rooms.map(entry=>entry.id!==roomId?entry:{
          ...entry,checklist:nextChecklist,status:computeRoomStatus(nextChecklist),
        }),
      }));
    }
    try {
      if(updates.checklist){
        const flags=(items:ChecklistItem[])=>items.map(item=>({
          id:item.id,done:item.done,photo:item.photo,
          subItems:item.subItems.map(s=>({id:s.id,done:s.done})),
        }));
        // Upload updates the photo flag server-side before the completion
        // update. That one workflow cannot compare with its pre-upload snapshot.
        const photoJustUploaded=updates.checklist.some(item=>
          item.photo && !room.checklist.find(old=>old.id===item.id)?.photo);
        await updateRoomChecklist(room.dbId,flags(updates.checklist),
          photoJustUploaded?undefined:flags(room.checklist));
      }
      if(updates.assignedTo!==undefined||updates.assignedCleanerId!==undefined||updates.occupant!==undefined){
        if(currentUser?.role!=="admin")throw new Error("僅管理員可以修改入住者及指派");
        await updateRoomAdministration(room.dbId,{
          ...(updates.assignedTo!==undefined?{assignedTo:updates.assignedTo}:{}),
          ...(updates.assignedCleanerId!==undefined?{assignedCleanerId:updates.assignedCleanerId}:{}),
          ...(updates.occupant!==undefined?{occupant:updates.occupant}:{}),
        }, updates.assignedCleanerId!==undefined || updates.assignedTo!==undefined
          ? room.cleanerId ?? null : undefined);
      }
      if(mutationEpoch!==dataEpoch.current)return false;
      // Checklist results are deterministic and already reflected in local state.
      // Don't block a simple checkbox on reloading all events and rooms.
      // Periodic refresh and account switching still re-fetch authoritative data.
      if(!savingChecklist)await loadEventsFromSupabase();
      return mutationEpoch===dataEpoch.current;
    }catch(error) {
      // Never display an old account's write result after logout or account switch.
      if(mutationEpoch===dataEpoch.current){
        window.alert(error instanceof Error?error.message:"房間資料儲存失敗");
        await loadEventsFromSupabase();
      }
      return false;
    }finally{
      if(savingAdministration){
        roomAdministrationSaving.current.delete(roomId);
        setSavingRoomAdministrationIds(prev=>prev.filter(id=>id!==roomId));
      }
      if(savingChecklist){
        checklistSavingRooms.current.delete(roomId);
        setSavingChecklistRoomIds(prev=>prev.filter(id=>id!==roomId));
      }
    }
  }

  const checklistFlags=(items:ChecklistItem[])=>items.map(item=>({
    id:item.id,done:item.done,photo:item.photo,
    subItems:item.subItems.map(sub=>({id:sub.id,done:sub.done})),
  }));

  async function flushChecklistQueue(roomId:string) {
    const task=pendingChecklistWrites.current.get(roomId);
    if(!task || task.writing)return;
    task.writing=true;
    try {
      while(task.epoch===dataEpoch.current &&
        pendingChecklistWrites.current.get(roomId)===task){
        const next=task.desired;
        if(JSON.stringify(checklistFlags(next))===JSON.stringify(checklistFlags(task.committed)))break;
        // Server-owned room assignment and compare-and-swap prevent cross-account
        // and concurrent edits. Never send overlapping writes for the same room.
        await updateRoomChecklist(task.dbId,checklistFlags(next),checklistFlags(task.committed));
        task.committed=next;
      }
    }catch(error){
      if(task.epoch===dataEpoch.current &&
        pendingChecklistWrites.current.get(roomId)===task){
        pendingChecklistWrites.current.delete(roomId);
        window.alert((error instanceof Error?error.message:"清潔項目儲存失敗")+
          "；已停止後續勾選，正在重新同步房間資料，請確認最新狀態。");
        await loadEventsFromSupabase();
      }
    }finally{
      if(pendingChecklistWrites.current.get(roomId)===task){
        pendingChecklistWrites.current.delete(roomId);
      }
      if(task.epoch===dataEpoch.current &&
        !pendingChecklistWrites.current.has(roomId)){
        checklistSavingRooms.current.delete(roomId);
        setSavingChecklistRoomIds(prev=>prev.filter(id=>id!==roomId));
      }
    }
  }

  function queueChecklistChange(roomId:string,transform:(items:ChecklistItem[])=>ChecklistItem[]) {
    if(!latestCleaningActivity)return;
    const activityId=latestCleaningActivity.id;
    const room=latestCleaningActivity.rooms.find(entry=>entry.id===roomId);
    if(!room?.dbId)return;
    const epoch=dataEpoch.current;
    let task=pendingChecklistWrites.current.get(roomId);
    // The queue's desired state, not an old React render, is the source for
    // rapid successive clicks in the same room.
    if(task && task.epoch!==epoch) {
      pendingChecklistWrites.current.delete(roomId);
      task=undefined;
    }
    const desired=transform(task?.desired??room.checklist);
    if(task){
      task.desired=desired;
    }else{
      task={
        activityId,roomId,dbId:room.dbId,epoch,
        committed:room.checklist,desired,writing:false,
      };
      pendingChecklistWrites.current.set(roomId,task);
      checklistSavingRooms.current.add(roomId);
      setSavingChecklistRoomIds(prev=>prev.includes(roomId)?prev:[...prev,roomId]);
    }
    setActivities(prev=>prev.map(activity=>activity.id!==activityId?activity:{
      ...activity,
      rooms:activity.rooms.map(entry=>entry.id!==roomId?entry:{
        ...entry,checklist:desired,status:computeRoomStatus(desired),
      }),
    }));
    void flushChecklistQueue(roomId);
  }

  function updateLatestActivityChecklist(roomId:string,itemId:string,checked:boolean) {
    queueChecklistChange(roomId,checklist=>checklist.map(item=>{
      if(item.id!==itemId)return item;
      return {
        ...item,done:checked,photo:item.photo,
        subItems:item.subItems.map(sub=>({...sub,done:checked})),
      };
    }));
  }

  function updateLatestActivitySubItem(roomId:string,itemId:string,subItemId:string,checked:boolean) {
    queueChecklistChange(roomId,checklist=>checklist.map(item=>{
      if(item.id!==itemId)return item;
      const subItems=item.subItems.map(sub=>sub.id===subItemId?{...sub,done:checked}:sub);
      return {...item,subItems,done:subItems.every(sub=>sub.done)};
    }));
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

    // The authenticated upload API has already verified the room ownership,
    // stored the photo privately and set the photo flag server-side.
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
    if(currentUser?.role!=="admin" || activityMutationBusy.current)return;
    if(!activityName.trim()||!activityDate.trim()){window.alert("請輸入活動名稱與日期");return;}
    const input={
      event_date:activityDate,
      event_name:!isApprovedProductionUI() && activityModalMode==="add" && !activityName.trim().startsWith("【權限驗收】")
        ? "【權限驗收】"+activityName.trim() : activityName.trim(),
      event_type:(activityModalMode==="edit" && activityNeedsCleaning &&
        activities.find(a=>a.id===editingActivityId)?.category==="住宿"
          ? "住宿" : activityNeedsCleaning?"活動":"一般活動") as "活動"|"一般活動"|"住宿",
      notes:activityContact.trim(),
    };
    activityMutationBusy.current = true;
    setActivitySaving(true);
    try {
      if(activityModalMode==="edit"){
        await editActivity(Number(editingActivityId),input);
      }else {
        await createActivity(input);
      }
      setShowActivityModal(false);
      await loadEventsFromSupabase();
    } catch(error) {window.alert(error instanceof Error?error.message:"活動儲存失敗");}
    finally { activityMutationBusy.current = false; setActivitySaving(false); }
  }

  async function deleteCurrentActivity() {
    if(currentUser?.role!=="admin"||activityModalMode!=="edit"||!editingActivityId||activityMutationBusy.current)return;
    if(!window.confirm("確定刪除此活動及其所有房間？此操作不可還原。"))return;
    activityMutationBusy.current = true;
    setActivitySaving(true);
    try {
      await deleteActivity(Number(editingActivityId));
      setShowActivityModal(false);
      setEditingActivityId("");
      setSelectedActivityId("");
      setSelectedPrintRoomIds([]);
      await loadEventsFromSupabase();
    }catch(error){window.alert(error instanceof Error?error.message:"活動刪除失敗");}
    finally { activityMutationBusy.current = false; setActivitySaving(false); }
  }

  async function saveNewRoom() {
    if(currentUser?.role!=="admin" || !selectedActivity?.dbId || roomMutationBusy.current)return;
    const roomNo=newRoomNo.trim().toUpperCase();
    if(!/^[A-Z0-9]{1,8}$/.test(roomNo)){
      window.alert("房號請輸入 1～8 位英文字母或數字，不可空白或使用特殊符號。");return;
    }
    if(selectedActivity.rooms.some(room=>room.building===newRoomBuilding&&
       room.floor===newRoomFloor&&room.roomNo===roomNo)){
      window.alert("此活動已經有相同棟別、樓層與房號，請輸入尚未存在的房間。");return;
    }
    roomMutationBusy.current=true;
    setRoomSaving(true);
    let createdRoomId:number|null=null;
    try {
      const created=await createQaRoom({
        eventId:selectedActivity.dbId,building:newRoomBuilding,floor:newRoomFloor,roomNo,
      });
      createdRoomId=created.roomId;
      if(newRoomStaff!==""||newOccupant.trim()){
        await updateRoomAdministration(created.roomId,{
          ...(newRoomStaff!==""?{assignedCleanerId:Number(newRoomStaff)}:{}),
          ...(newOccupant.trim()?{occupant:newOccupant}:{}),
        });
      }
      setShowRoomModal(false);
      setNewOccupant("");
      setNewRoomStaff("");
    }catch(error){
      const detail=error instanceof Error?error.message:"房間操作失敗";
      window.alert(createdRoomId
        ? "房間已建立，但房務指派或入住資料未完成，請檢查該房間後再操作。"+detail
        : "新增房間未完成，請檢查房間列表後再重試。"+detail);
    }finally{
      await loadEventsFromSupabase();
      roomMutationBusy.current=false;
      setRoomSaving(false);
    }
  }

  function selectActivity(activityId: string) {
    setSelectedActivityId(activityId);
    setOpenCleanerPickerRoomId("");setDuplicateReport(null);
    setActivitySelectedBuilding("all");
    setActivitySelectedFloor("all");
    setActivityRoomSearch("");
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
    const useTwoColumns = guests.length >= 6;
    // The six-person layout can be especially tall if names wrap. Keep the
    // established 6/7/8-column behavior, with compact type when needed.
    const hasLongNames = guests.some((guest) => [...guest].length > (useTwoColumns ? 5 : 7));
    const compactPrint = hasLongNames || guests.length > 16;
    const layoutClass = guests.length <= 1 ? "single-xl" : guests.length <= 5 ? "single-lg"
      : guests.length <= 8 ? "double" : "double dense";
    const pageClass = "a4-page " + layoutClass + (compactPrint ? " compact-print" : "");
    const printedRoomNo = (room.building + room.roomNo).toUpperCase();
    const titleLength = [...printedRoomNo].length;
    const titleSizeClass = titleLength <= 4 ? "title-xl" : titleLength <= 6 ? "title-md" : "title-sm";

    const splitAt = Math.ceil(guests.length / 2);
    const leftGuests = useTwoColumns ? guests.slice(0, splitAt) : guests;
    const rightGuests = useTwoColumns ? guests.slice(splitAt) : [];

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
      <section class="${pageClass} ${titleSizeClass}">
        <div class="room-title">${escapeHtml(printedRoomNo)}</div>
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
              padding-top: 12mm;
              padding-left: 12mm;
              padding-right: 12mm;
              padding-bottom: 12mm;
              box-sizing: border-box;
              overflow: hidden;
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .a4-page:last-child {
              page-break-after: auto;
              break-after: auto;
            }

            /* A4 poster: a 1.5x larger, heavy headline as approved. */
            .room-title {
              width: 100%;
              text-align: center;
              font-size: 69mm;
              line-height: 0.96;
              white-space: nowrap;
              font-weight: 900;
              letter-spacing: -1mm;
              flex-shrink: 0;
            }
            .title-md .room-title { font-size: 48mm; }
            .title-sm .room-title { font-size: 34mm; }

            /* The remaining page height is shared evenly by every name.
               Internal padding keeps the first/last guest off the edges. */
            .guest-area {
              width: 100%;
              flex: 1;
              min-height: 0;
              display: flex;
              justify-content: center;
              align-items: stretch;
              padding: 10mm 0 14mm;
              box-sizing: border-box;
            }
            .guest-grid-one {
              width: 100%;
              max-width: 155mm;
              height: 100%;
              min-height: 0;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-evenly;
            }
            .guest-grid-two {
              width: 100%;
              max-width: 180mm;
              height: 100%;
              min-height: 0;
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              column-gap: 10mm;
              align-items: stretch;
            }
            .guest-col {
              min-width: 0;
              height: 100%;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-evenly;
            }
            .guest-row {
              width: 100%;
              text-align: center;
              font-size: 19mm;
              line-height: 1.12;
              white-space: normal;
              overflow-wrap: anywhere;
              word-break: break-word;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .single-xl .guest-row { font-size: 24mm; }
            .single-lg .guest-row { font-size: 21mm; }
            .double .guest-row { font-size: 18mm; }
            .double.dense .guest-row { font-size: 15mm; }
            .compact-print .guest-row { font-size: 12mm; }
            .compact-print.single-xl .guest-row { font-size: 19mm; }
            .compact-print.single-lg .guest-row { font-size: 16mm; }
            .compact-print.double:not(.dense) .guest-row { font-size: 15mm; }
            @media screen {
              .a4-page { margin: 0 auto 12px; }
            }
            @media print {
              html, body { width: 210mm; }
              .a4-page { margin: 0; }
            }
          </style>
        </head>
        <body>
          ${pagesHtml}
          <div id="print-controls" role="toolbar" aria-label="列印視窗操作">
            <button type="button" id="print-now" onclick="window.print()">重新列印</button>
            <button type="button" id="print-exit" onclick="window.close()">關閉並返回網站</button>
          </div>
          <style>
            #print-controls { position:fixed;top:10px;right:10px;z-index:9999;display:flex;gap:8px; }
            #print-controls button {background:#858264;color:white;border:0;border-radius:10px;padding:12px;font:16px sans-serif;cursor:pointer;}
            #print-exit {background:#65543e !important;}
            @media print { #print-controls {display:none !important;} }
          </style>
          <script>
            (function () {
              var printed = false;
              var closed = false;
              function closeAfterPrint() {
                if (closed) return;
                closed = true;
                // The preview may be cancelled: close only this popup to
                // return to the existing Housekeeping page.
                setTimeout(function () { window.close(); }, 200);
              }
              window.addEventListener("afterprint", closeAfterPrint, { once: true });
              function printOnce() {
                if (printed) return;
                printed = true;
                window.print();
              }
              window.addEventListener("load", function () {
                if (document.fonts && document.fonts.ready) {
                  document.fonts.ready.then(printOnce).catch(printOnce);
                } else {
                  printOnce();
                }
              }, { once: true });
            })();
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

  function roomHasPendingOccupant(room: Room): boolean {
    return roomAdministrationSaving.current.has(room.id) ||
      (occupantDrafts[room.id] !== undefined && occupantDrafts[room.id] !== room.occupant);
  }

  function printSingleRoomA4(room: Room) {
    if(roomHasPendingOccupant(room)){
      window.alert("住宿人資料尚未儲存完成，請確認完成後再列印，避免印到舊名單。");
      return;
    }
    const html = buildPrintDocument(buildA4RoomPage(room));
    openPrintWindow(html);
  }

  function togglePrintRoom(roomId: string) {
    setSelectedPrintRoomIds((prev) =>
      prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]
    );
  }

  function selectAllPrintRooms() {
    // Add visible rooms without discarding selections from another floor.
    setSelectedPrintRoomIds(prev => Array.from(new Set([
      ...prev, ...filteredActivityRooms.map(room => room.id),
    ])));
  }

  function selectOccupiedPrintRooms() {
    // This action deliberately selects across the entire chosen activity,
    // not just the currently displayed building/floor/search filter.
    // Replace the selection so it is clear which rooms will be printed.
    if (!selectedActivity) return;
    const occupiedRooms=selectedActivity.rooms.filter(room=>
      splitGuestLines(occupantDrafts[room.id] ?? room.occupant).length > 0
    );
    setSelectedPrintRoomIds(occupiedRooms.map(room=>room.id));
    if(occupiedRooms.length===0)
      window.alert("此活動目前沒有填寫住宿人的房間可供列印。");
  }

  function clearAllPrintRooms() {
    setSelectedPrintRoomIds([]);
  }

  function printSelectedRoomsA4() {
    if (!selectedActivity) {
      window.alert("請先選擇活動");
      return;
    }

    const selectedRooms = selectedActivity.rooms.filter(room =>
      selectedPrintRoomIds.includes(room.id)
    ).sort((a,b) => {
      if (a.building !== b.building) return a.building.localeCompare(b.building);
      if (a.floor !== b.floor) return FLOOR_OPTIONS.indexOf(a.floor) - FLOOR_OPTIONS.indexOf(b.floor);
      return a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true });
    });

    if (selectedRooms.length === 0) {
      window.alert("請先勾選要列印的房間");
      return;
    }
    if (selectedRooms.some(roomHasPendingOccupant)) {
      window.alert("部分勾選房間的住宿人資料尚未儲存完成，請確認完成後再列印。");
      return;
    }

    const pagesHtml = selectedRooms.map((room) => buildA4RoomPage(room)).join("");
    const html = buildPrintDocument(pagesHtml);
    openPrintWindow(html);
  }

  async function deleteSelectedActivityRoom(roomId:string) {
    if(currentUser?.role!=="admin"||!selectedActivity)return;
    const room=selectedActivity.rooms.find(r=>r.id===roomId);
    if(!room?.dbId)return;
    if(!window.confirm("確定刪除此房間？清潔紀錄也將刪除。"))return;
    try {
      await deleteQaRoom(room.dbId);
      setSelectedPrintRoomIds(prev=>prev.filter(id=>id!==roomId));
      await loadEventsFromSupabase();
    }catch(error){window.alert(error instanceof Error?error.message:"房間刪除失敗");}
  }

  function openAddStaffModal() {
    setStaffModalMode("add");
    setEditingStaffId("");
    setNewStaffName("");
    setNewStaffPin("");
    setStaffButtonPresses(0);
    setStaffFeedback("");
    setStaffSaveStatus("idle");
    setStaffSaveStage("等待操作");
    setStaffSuccess("");
    setShowStaffModal(true);
  }

  function openEditStaffModal(user: User) {
    setStaffModalMode("edit");
    setEditingStaffId(user.id);
    setNewStaffName(user.name);
    setNewStaffPin("");
    setStaffButtonPresses(0);
    setStaffFeedback("");
    setStaffSaveStatus("idle");
    setStaffSaveStage("等待操作");
    setStaffSuccess("");
    setShowStaffModal(true);
  }

  async function saveStaffModal() {
    setStaffButtonPresses(x=>x+1);
    const rejectSave=(message:string)=>{
      setStaffSaveStatus("error");
      setStaffSaveStage("送出前驗證失敗");
      setStaffFeedback(message);
    };
    if(staffMutationBusy.current){
      rejectSave("上一次儲存還在進行，請勿重複點擊。");
      return;
    }
    setStaffFeedback("");
    setStaffSuccess("");
    setStaffSaveStatus("saving");
    setStaffSaveStage("檢查輸入資料");
    setStaffFeedback("已收到儲存操作，正在驗證。");
    // Entire preflight is inside this catch. Previously any synchronous
    // exception before the API try left the modal in "saving" forever.
    try {
    if(currentUser?.role!=="admin"){
      rejectSave("管理員登入狀態已失效，請重新登入後設定 PIN。");
      return;
    }
    const name=newStaffName.trim();
    const pinValue=newStaffPin.trim();
    const staff=staffModalMode==="edit"
      ? staffUsers.find(x=>x.id===editingStaffId) : null;
    if(!name){
      rejectSave("請填寫房務人員姓名。");
      return;
    }
    if(staffModalMode==="edit" && !staff?.dbId){
      rejectSave("找不到這位房務人員，請重新整理人員清單後再操作。");
      return;
    }
    if(!isApprovedProductionUI() && !name.startsWith("【權限驗收】")){
      rejectSave("獨立測試版只允許建立或修改【權限驗收】帳號");
      return;
    }
    if(!pinValue && (staffModalMode==="add" || staff?.name===name)){
      rejectSave("請輸入新的 8～32 位數字 PIN，才能啟用或更新登入密碼。");
      return;
    }
    if(pinValue && validateNewStaffPin(pinValue)){
      rejectSave(validateNewStaffPin(pinValue));
      return;
    }
    staffMutationBusy.current=true;
    setStaffSaveStatus("saving");
    setStaffSaveStage("等待 PIN 設定 API 回應");
    setStaffFeedback("正在向伺服器設定 PIN；若逾時會顯示失敗階段。");
    setStaffSaving(true);
      if(staffModalMode==="edit"){
        if(staff!.name!==name)await renameQaCleaner(staff!.dbId!,name);
        if(pinValue)await provisionQaPin(staff!.dbId!,pinValue);
      }else{
        const created=await createQaCleaner(name);
        if(!created?.cleanerId)throw new Error("新增人員沒有回傳有效編號。");
        await provisionQaPin(created.cleanerId,pinValue);
      }
      // PIN update was acknowledged by the server. Account directory refresh
      // is best-effort and must never keep a successful PIN save stuck open.
      setStaffSaveStage("PIN API 已確認，更新登入名單");
      if(pinValue){
        void fetch("/api/auth/accounts",{credentials:"same-origin",cache:"no-store"})
          .then(response=>response.ok?response.json():null)
          .then((directory:{users?:Array<{id:string;name:string}>}|null)=>{
            if(Array.isArray(directory?.users))setLoginUsers(directory.users.map(row=>({
              id:row.id,name:row.name,role:row.id==="admin"?"admin":"cleaner",
            })));
          }).catch(()=>{});
      }
      setStaffSaveStage("PIN 設定成功");
      setNewStaffPin("");
      setShowStaffModal(false);
      setStaffSaveStatus("idle");
      setStaffFeedback("");
      setStaffSuccess(pinValue ? "PIN 已設定成功，這位房務人員可以使用新 PIN 登入。" : "房務人員資料已儲存。");
      void loadCleanersFromSupabase();
      void loadEventsFromSupabase();
    }catch(error){
      // Covers both preflight exceptions and API failures. No PIN or other
      // credentials are printed or written into the error log.

      // made a failed PIN submission appear to do absolutely nothing.
      setStaffSaveStatus("error");
      setStaffSaveStage(staffMutationBusy.current
        ? "PIN 設定 API 失敗或逾時" : "送出前程式錯誤");
      setStaffFeedback((error instanceof Error?error.message:"人員操作失敗")+
        "。新 PIN 尚未確認儲存，請先檢查訊息再決定是否重試。");
    }finally{
      staffMutationBusy.current=false;
      setStaffSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f8f4ed_0%,#f2ece2_44%,#e8dfd1_100%)] p-2 text-[#4f4435] sm:p-4">
      <div className="mx-auto w-full max-w-md pb-32 md:max-w-3xl">
        <div className="overflow-hidden rounded-[28px] border border-[#e6ddd0] bg-[#fcfaf6]/95 shadow-[0_18px_40px_rgba(84,69,45,0.12)] backdrop-blur">
          <div className="bg-[linear-gradient(180deg,#f4ede2_0%,#e8ddcb_100%)] px-4 py-3.5 text-[#4f4435]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-[0.04em] sm:text-[19px] sm:tracking-[0.08em]">
                <img src="/brand-logo.svg" alt="" className="h-7 w-7 shrink-0 object-contain" />
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

          {authRestoring && <p role="status" className="border-t border-[#e5ddd0] p-3 text-sm text-[#847663]">正在恢復 30 天登入狀態…</p>}
          {authRestoreError && <p role="alert" className="border-t border-[#e5ddd0] p-3 text-sm text-red-700">{authRestoreError}</p>}
          {!authRestoring && showLogin && !currentUser && (
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

              {loginFeedback && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{loginFeedback.includes("401") ? "PIN 不正確或帳號暫時鎖定。請確認使用原本管理員 PIN，避免連續嘗試。" : loginFeedback}</p>}
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
            <div className="text-[18px] font-semibold text-[#524736]">{authRestoring?"正在確認登入狀態":"請先登入"}</div>
            <div className="mt-2 text-sm text-[#8d8272]">
              點右上角「登入」，選擇帳號並輸入密碼後使用系統。
            </div>
          </div>
        ) : viewMode === "staff" ? (
          <div className="mt-3 space-y-3">
            <button type="button" onClick={()=>setStaffCalendarVisible(v=>!v)}
              className="w-full rounded-[18px] border border-[#d9cfbf] bg-[#f7f1e8] px-4 py-2.5 text-sm font-semibold text-[#6b604b]">
              <CalendarDays className="mr-1 inline h-4 w-4"/>
              {staffCalendarVisible?"返回清潔房間":"查看共用活動日曆"}
            </button>
            {staffCalendarVisible ? <SharedActivityCalendar events={sharedCalendarEvents} isAdmin={false}/> : (
          <div className="rounded-[28px] border border-[#e2d8c8] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f3eb_100%)] p-3 shadow-[0_12px_26px_rgba(84,69,45,0.08)]">
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
                          {savingChecklistRoomIds.includes(room.id) && (
                            <span className="text-[11px]" aria-live="polite">同步中…</span>
                          )}
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

                                  // Photo proof is optional while uploads are paused.
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
                                      disabled
                                      title="照片上傳功能暫停"
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
                                        {item.photo ? "照片暫停更換" : "照片上傳暫停"}
                                      </span>
                                    </button>
                                  )}
                                  {item.requiredPhoto && item.photo && (
                                    <button type="button"
                                      onClick={()=>void viewPrivatePhoto(room,item.id)}
                                      className="rounded-[14px] border border-[#ddd4c6] bg-white px-2 py-1 text-[11px] text-[#75684f]">
                                      查看照片
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

                                          // Subitems can complete without a photo during the upload pause.
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
          )}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {adminView === "overview" && (
              <div className="rounded-[28px] border border-[#e2d8c8] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f3eb_100%)] p-3 shadow-[0_12px_26px_rgba(84,69,45,0.08)]">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <SectionTitle title="管理中心" sub="住宿與咖啡廳日常管理" icon={<IncenseStatusIcon className="h-5 w-5"/>}/>
                  {managementSection!=="home" && (
                    <button type="button" onClick={()=>setManagementSection("home")}
                      className="shrink-0 rounded-full border border-[#d7cbbb] bg-[#f6f0e6] px-3 py-2 text-[13px] font-medium text-[#6a5b43]">
                      返回管理
                    </button>
                  )}
                </div>
                {managementSection==="home" && (
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={()=>{setManagementSection("lodging");setLodgingPanel("duplicates");}}
                      className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-[20px] border border-[#ded2bc] bg-[#f9f4eb] px-2 text-[#584a38]">
                      <House className="h-9 w-9 text-[#8b8462]"/>
                      <span className="text-[18px] font-semibold">住宿管理</span>
                      <span className="text-[12px]">名單 · 異常 · 備品</span>
                    </button>
                    <button type="button" onClick={()=>{setManagementSection("cafe");setCafePanel("income");}}
                      className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-[20px] border border-[#ded2bc] bg-[#f9f4eb] px-2 text-[#584a38]">
                      <Coffee className="h-9 w-9 text-[#8b8462]"/>
                      <span className="text-[18px] font-semibold">咖啡廳管理</span>
                      <span className="text-[12px]">收支 · 庫存</span>
                    </button>
                  </div>
                )}
                {managementSection==="lodging" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {key:"duplicates",title:"重複住宿人",count:lodgingDiagnostics.duplicates.length},
                        {key:"anomalies",title:"資料異常",count:lodgingDiagnostics.anomalies.length},
                        {key:"supplies",title:"備品管理",count:null},
                        {key:"notices",title:"活動通知",count:null},
                        {key:"progress",title:"清潔進度",count:null},
                      ].map(item=>(
                        <button type="button" key={item.key}
                          onClick={()=>setLodgingPanel(item.key as typeof lodgingPanel)}
                          className={`flex min-h-[52px] items-center justify-between rounded-[14px] border px-3 py-2 text-left text-[14px] font-semibold ${lodgingPanel===item.key
                            ?"border-[#8b8462] bg-[#e8e3d3] text-[#514635]"
                            :"border-[#ded5c6] bg-white text-[#655742]"}`}>
                          <span>{item.title}</span>
                          {item.count!==null && <span className="rounded-full bg-[#f2eee5] px-2 py-0.5 text-[12px]">{item.count}</span>}
                        </button>
                      ))}
                    </div>
                    {lodgingPanel==="duplicates" && (
                      <div className="space-y-2">
                        <p className="text-[13px] leading-5 text-[#786d5c]">按同一場活動檢查完全相同的姓名，包含同房重複；不同活動不會混在一起。</p>
                        {lodgingDiagnostics.duplicates.map(entry=>(
                          <button key={entry.id} type="button" onClick={()=>openManagedRoom(entry.activityId,entry.roomNo)}
                            className="w-full rounded-[15px] border border-[#e0d3c3] bg-white p-3 text-left">
                            <div className="text-[16px] font-semibold text-[#584936]">{entry.name}</div>
                            <div className="mt-1 text-[13px] text-[#776851]">{entry.activityName}</div>
                            <div className="mt-1 break-words text-[14px] text-[#8a674c]">出現於：{entry.rooms.join("、")}</div>
                            <div className="mt-2 text-right text-[12px] text-[#827553]">查看房間 ›</div>
                          </button>
                        ))}
                        {lodgingDiagnostics.duplicates.length===0 &&
                          <p role="status" className="rounded-[15px] border border-[#e3dacb] bg-[#faf7f1] px-3 py-8 text-center text-[14px] text-[#77705c]">目前沒有同活動完全同名的住宿人。</p>}
                      </div>
                    )}
                    {lodgingPanel==="anomalies" && (
                      <div className="space-y-2">
                        <p className="text-[13px] leading-5 text-[#786d5c]">目前檢查已有住宿人卻未指派房務，以及尚未儲存的名單；空房不會直接判為異常。</p>
                        {lodgingDiagnostics.anomalies.map(item=>(
                          <button key={item.id} type="button" onClick={()=>openManagedRoom(item.activityId,item.roomNo)}
                            className="w-full rounded-[15px] border border-[#e0d3c3] bg-white p-3 text-left">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[15px] font-semibold text-[#584936]">{item.roomName}</span>
                              <span className="rounded-full bg-[#f7e9da] px-2 py-1 text-[12px] text-[#956b43]">{item.kind}</span>
                            </div>
                            <div className="mt-1 text-[13px] text-[#776851]">{item.activityName} · {item.detail}</div>
                            <div className="mt-2 text-right text-[12px] text-[#827553]">查看房間 ›</div>
                          </button>
                        ))}
                        {lodgingDiagnostics.anomalies.length===0 &&
                          <p role="status" className="rounded-[15px] border border-[#e3dacb] bg-[#faf7f1] px-3 py-8 text-center text-[14px] text-[#77705c]">目前沒有符合已設定規則的資料異常。</p>}
                      </div>
                    )}
                    {lodgingPanel==="supplies" && (
                      <div className="rounded-[16px] border border-[#e0d5c4] bg-white p-4">
                        <h3 className="text-[17px] font-semibold text-[#584936]">備品管理 · 下一階段</h3>
                        <p className="mt-2 text-[14px] leading-6 text-[#766a59]">規劃品項、安全庫存、進貨、領用及盤點紀錄；尚未開放資料輸入，避免資料未有備份與異動紀錄。</p>
                      </div>
                    )}
                    {lodgingPanel==="notices" && (
                      <div className="rounded-[16px] border border-[#e0d5c4] bg-white p-4">
                        <h3 className="text-[17px] font-semibold text-[#584936]">活動通知 · 下一階段</h3>
                        <p className="mt-2 text-[14px] leading-6 text-[#766a59]">預計在活動前七天提醒指定人員，需先完成通知對象、渠道、同意及防重複通知設定。目前沒有自動發送訊息。</p>
                      </div>
                    )}
                    {lodgingPanel==="progress" && (
                      <div className="space-y-2">
                        <p className="text-[13px] text-[#786d5c]">保留原本最近清潔活動的統計與搜尋功能。</p>
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

                <label className="mt-3 block">
                  <span className="sr-only">搜尋房號、房務人員或入住者</span>
                  <input type="search" value={overviewSearch}
                    onChange={e=>setOverviewSearch(e.target.value)}
                    placeholder="搜尋房號、房務人員、入住者"
                    className="w-full rounded-[14px] border border-[#ddd3c4] bg-white px-3 py-2 text-sm text-[#524736] focus:outline-[#9a946f]"/>
                </label>
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
                            <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-start gap-x-2 gap-y-1 font-medium">
                              <span className="whitespace-nowrap">{roomLabel(room)}</span>
                              <span>客：</span>
                              <span className="min-w-0 break-words">{guests[0] || "-"}</span>
                              <span className="max-w-20 justify-self-end break-words text-right">
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
                      </div>
                    )}
                  </div>
                )}
                {managementSection==="cafe" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={()=>setCafePanel("income")}
                        className={`rounded-[14px] border p-3 text-[15px] font-semibold ${cafePanel==="income"?"border-[#8b8462] bg-[#e8e3d3]":"border-[#ded5c6] bg-white"}`}>收支管理</button>
                      <button type="button" onClick={()=>setCafePanel("inventory")}
                        className={`rounded-[14px] border p-3 text-[15px] font-semibold ${cafePanel==="inventory"?"border-[#8b8462] bg-[#e8e3d3]":"border-[#ded5c6] bg-white"}`}>庫存管理</button>
                    </div>
                    <div className="rounded-[16px] border border-[#e0d5c4] bg-white p-4">
                      <h3 className="text-[17px] font-semibold text-[#584936]">{cafePanel==="income"?"咖啡廳收支":"咖啡廳庫存"} · 下一階段</h3>
                      <p className="mt-2 text-[14px] leading-6 text-[#766a59]">{cafePanel==="income"
                        ?"規劃每日收入、支出、付款方式及月結統計；尚未建立正式交易紀錄。"
                        :"規劃食材、商品、包材與耗材的入出庫、盤點與低庫存提醒；尚未建立正式庫存紀錄。"}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {adminView === "activity" && (
              <div className="rounded-[28px] border border-[#e2d8c8] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f3eb_100%)] p-3 shadow-[0_12px_26px_rgba(84,69,45,0.08)]">
                {activitySection==="summary" ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <SectionTitle title="活動總覽" sub="預設當年全年，可選擇單一月份" icon={<CalendarDays className="h-4 w-4"/>}/>
                      <button type="button" onClick={()=>openAddActivityModal()}
                        className="shrink-0 rounded-full bg-[#898567] px-3 py-2 text-[14px] font-medium text-white">
                        ＋ 新增活動
                      </button>
                    </div>
                    <div className="flex items-stretch gap-2">
                      <div className="flex min-w-0 flex-1 gap-2">
                        <label className="min-w-0 flex-1">
                          <span className="sr-only">選擇活動年度</span>
                          <select aria-label="選擇活動年度" value={activityYear}
                            onChange={e=>{setActivityYear(e.target.value);setActivityMonth("all");}}
                            className="h-12 w-full min-w-0 rounded-[15px] border border-[#d7cbb8] bg-[#fffdfa] px-2 text-[15px] font-semibold text-[#544735]">
                            {activityYears.map(year=><option key={year} value={String(year)}>{year} 年</option>)}
                          </select>
                        </label>
                        <label className="min-w-0 flex-1">
                          <span className="sr-only">選擇活動月份</span>
                          <select aria-label="選擇活動月份" value={activityMonth}
                            onChange={e=>setActivityMonth(e.target.value)}
                            className="h-12 w-full min-w-0 rounded-[15px] border border-[#d7cbb8] bg-[#fffdfa] px-2 text-[15px] font-semibold text-[#544735]">
                            <option value="all">全年</option>
                            {Array.from({length:12},(_,m)=>(
                              <option key={m+1} value={String(m+1).padStart(2,"0")}>{m+1} 月</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="flex min-w-[91px] flex-col items-center justify-center rounded-[15px] border border-[#d7cbb8] bg-[#f2eadc] px-3">
                        <span className="text-[11px] text-[#75684f]">活動總數</span>
                        <span className="text-[17px] font-bold text-[#524736]">{scopedActivities.length} 場</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {scopedActivities.map(activity=>{
                        const done=activity.rooms.filter(room=>room.status==="completed").length;
                        return (
                          <button key={activity.id} type="button"
                            onClick={()=>{selectActivity(activity.id);setActivitySection("rooms");}}
                            className="flex w-full items-center gap-3 rounded-[17px] border border-[#e2d8c8] bg-white px-3 py-3 text-left shadow-sm">
                            <div className="shrink-0 rounded-[11px] bg-[#f2eadc] px-2 py-2 text-center text-[14px] font-semibold text-[#594933]">
                              {activity.date.slice(5).replace("-","/")}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[16px] font-semibold text-[#514331]">{activity.name}</span>
                                <span className="rounded-full bg-[#ede4d5] px-2 py-0.5 text-[11px] text-[#75684f]">
                                  {activity.requiresCleaning?"需打掃":"一般活動"}
                                </span>
                              </div>
                              <div className="mt-1 text-[13px] text-[#8a7b64]">
                                房間：{activity.rooms.length} 間
                                {activity.requiresCleaning ? `｜進度：${activity.rooms.length?Math.round(done/activity.rooms.length*100):0}%` : ""}
                              </div>
                            </div>
                            <ChevronRight className="h-5 w-5 shrink-0 text-[#887b5e]"/>
                          </button>
                        );
                      })}
                      {scopedActivities.length===0 && (
                        <div className="rounded-[16px] border border-dashed border-[#d6cbbb] px-3 py-8 text-center text-[14px] text-[#8a806f]">
                          目前選擇的年度或月份沒有活動
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <button type="button" onClick={()=>setActivitySection("summary")}
                      className="mb-3 inline-flex items-center gap-1 rounded-full bg-[#ede7dc] px-3 py-2 text-[14px] font-medium text-[#65563e]">
                      <ChevronLeft className="h-4 w-4"/> 返回活動總覽
                    </button>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <SectionTitle
                    title="活動列表"
                    sub="直接編輯所選活動的房間與住宿人"
                    icon={<CalendarDays className="h-4 w-4" />}
                  />

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <div className="rounded-full bg-[#efe7d7] px-3 py-2 text-[12px] font-semibold text-[#75684f] shadow-[0_8px_16px_rgba(110,99,67,0.08)]">
                      已勾選 {selectedPrintCount} 間
                    </div>

                    <button
                      onClick={selectAllPrintRooms}
                      className="rounded-full bg-[linear-gradient(180deg,#fffdfa_0%,#f2ecdf_100%)] px-3 py-2 text-[12px] text-[#75684f] shadow-[0_8px_16px_rgba(110,99,67,0.12)]"
                      title="將目前篩選的房間加入列印勾選"
                    >
                      加選目前
                    </button>

                    <button
                      type="button"
                      onClick={selectOccupiedPrintRooms}
                      className="rounded-full border border-[#d9cfbe] bg-[#f1e9db] px-3 py-2 text-[12px] font-semibold text-[#65563f] shadow-[0_4px_10px_rgba(110,99,67,0.08)]"
                      title="勾選此活動所有已填寫住宿人的房間，並取消未入住房間的列印勾選"
                    >
                      有住宿人全選
                    </button>

                    <button
                      onClick={clearAllPrintRooms}
                      className="rounded-full bg-[linear-gradient(180deg,#fffdfa_0%,#f2ecdf_100%)] px-3 py-2 text-[12px] text-[#75684f] shadow-[0_8px_16px_rgba(110,99,67,0.12)]"
                      title="清除本活動所有列印勾選"
                    >
                      全部清除
                    </button>

                    <button
                      onClick={printSelectedRoomsA4}
                      className="flex h-9 items-center justify-center rounded-full bg-[linear-gradient(180deg,#fffdfa_0%,#f2ecdf_100%)] px-3 text-[#75684f] shadow-[0_8px_16px_rgba(110,99,67,0.12)]"
                      title="列印已勾選房間"
                    >
                      <Printer className="h-4 w-4" />
                    </button>


                  </div>
                </div>

                {selectedActivity && (
                  <>
                    <div className="mt-3 rounded-[20px] bg-[linear-gradient(135deg,#f8f3ea_0%,#eee4d5_100%)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[16px] font-semibold text-[#524736]">{selectedActivity.name}</div>
                          <div className="mt-1 text-[12px] text-[#8a7b64]">{formatDate(selectedActivity.date)}</div>
                        </div>
                        <button type="button" onClick={()=>openEditActivityModal(selectedActivity)}
                          className="shrink-0 rounded-[11px] border border-[#ddd1bc] bg-white px-3 py-2 text-[13px] text-[#6e6047]">
                          編輯活動
                        </button>

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
                          <label className="mt-2 block">
                            <span className="sr-only">搜尋活動房號、房務人員或住宿人</span>
                            <input
                              type="search"
                              value={activityRoomSearch}
                              onChange={e=>setActivityRoomSearch(e.target.value)}
                              placeholder="搜尋此活動的房號、房務人員、住宿人"
                              className="w-full rounded-[14px] border border-[#ddd3c4] bg-white px-3 py-2 text-sm text-[#524736] focus:outline-[#9a946f]"
                            />
                          </label>
                          <p role="status" className="mt-1 text-xs text-[#8d8272]">
                            顯示 {filteredActivityRooms.length} / {selectedActivity.rooms.length} 間房
                          </p>
                        </>
                      )}
                    </div>

                    {selectedActivity.requiresCleaning && (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <button type="button" onClick={()=>openQuickPaste(filteredActivityRooms[0]?.id??selectedActivity.rooms[0]?.id??"")}
                          className="rounded-[13px] border border-[#ded1bc] bg-[#fffdfa] px-1 py-2 text-[13px] font-medium text-[#6a5a3c]">快速貼上</button>
                        <button type="button" onClick={scanDuplicateOccupants}
                          className="rounded-[13px] border border-[#ded1bc] bg-[#fffdfa] px-1 py-2 text-[13px] font-medium text-[#6a5a3c]">重複檢查</button>
                        <button type="button" onClick={printSelectedRoomsA4}
                          className="rounded-[13px] border border-[#ded1bc] bg-[#fffdfa] px-1 py-2 text-[13px] font-medium text-[#6a5a3c]">批次列印</button>
                      </div>
                    )}
                    {selectedActivity.requiresCleaning && (
                      <div className="mt-2 flex justify-end gap-2">
                        <button type="button" onClick={()=>setRoomDisplay("cards")}
                          className={"rounded-[12px] px-3 py-2 text-[13px] "+(roomDisplay==="cards"?"bg-[#888465] text-white":"border border-[#ddd2c0] bg-white")}>
                          卡片檢視
                        </button>
                        <button type="button" onClick={()=>setRoomDisplay("table")}
                          className={"rounded-[12px] px-3 py-2 text-[13px] "+(roomDisplay==="table"?"bg-[#888465] text-white":"border border-[#ddd2c0] bg-white")}>
                          Excel 式表格
                        </button>
                      </div>
                    )}
                    {selectedActivity.requiresCleaning ? (
                      roomDisplay==="table" ? (
                        <div className="mt-2 overflow-x-auto rounded-[18px] border border-[#e2d8c8] bg-white">
                          <table className="min-w-[780px] w-full border-collapse text-left text-[14px]">
                            <thead className="bg-[#f1eadf] text-[#544735]">
                              <tr>
                                <th className="p-2">列印</th>
                                <th className="p-2">房間</th>
                                <th className="p-2">住宿人名單（直接編輯）</th>
                                <th className="p-2">人數</th>
                                <th className="p-2">房務</th>
                                <th className="p-2">操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredActivityRooms.map(room=>(
                                <tr key={room.id} className="border-t border-[#ede4d7] align-top">
                                  <td className="p-2"><input type="checkbox" aria-label={"勾選列印 "+roomLabel(room)}
                                    checked={selectedPrintRoomIds.includes(room.id)} onChange={()=>togglePrintRoom(room.id)}/></td>
                                  <td className="whitespace-nowrap p-2 font-bold">{roomLabel(room)}</td>
                                  <td className="min-w-[260px] p-2">
                                    <textarea
                                      value={occupantDrafts[room.id]??splitGuestLines(room.occupant).join("、")}
                                      onChange={e=>setOccupantDrafts(prev=>({...prev,[room.id]:e.target.value}))}
                                      onBlur={()=>{
                                        const draft=occupantDrafts[room.id];
                                        if(draft!==undefined)void saveOccupantList(selectedActivity.id,room.id,draft);
                                      }}
                                      disabled={savingRoomAdministrationIds.includes(room.id)}
                                      ref={node=>{if(node){node.style.height="auto";node.style.height=node.scrollHeight+"px";}}}
                                      rows={2}
                                      className="min-h-[46px] w-full resize-none overflow-hidden rounded-[9px] border border-[#dfd4c1] bg-[#fffcf7] p-2 text-[15px] leading-6"
                                      placeholder="輸入住宿人姓名"/>
                                  </td>
                                  <td className="whitespace-nowrap p-2">{splitGuestLines(occupantDrafts[room.id]??room.occupant).length} 位</td>
                                  <td className="p-2">
                                    <select value={room.cleanerId==null?"":String(room.cleanerId)}
                                      onChange={e=>void updateRoomField(selectedActivity.id,room.id,
                                        {assignedCleanerId:e.target.value?Number(e.target.value):null})}
                                      disabled={savingRoomAdministrationIds.includes(room.id)}
                                      className="min-h-[42px] w-full rounded-[10px] border border-[#ddd3c4] bg-white px-2 text-[14px]">
                                      <option value="">未分配</option>
                                      {staffUsers.map(user=><option key={user.id} value={String(user.dbId)}>{user.name}</option>)}
                                    </select>
                                  </td>
                                  <td className="whitespace-nowrap p-2">
                                    <button type="button" onClick={()=>openGuestMove(room.id)}
                                      className="mr-1 rounded-[8px] bg-[#efe9db] px-2 py-2">移動</button>
                                    <button type="button" onClick={()=>printSingleRoomA4(room)}
                                      className="rounded-[8px] bg-[#efe9db] px-2 py-2">列印</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                      <div className="mt-2 space-y-2 rounded-[20px] border border-[#e2d8c8] bg-[#faf6f0] p-2">
                        {filteredActivityRooms.map((room) => (
                          <div
                            key={room.id}
                            className="rounded-[16px] border border-[#e5ddd0] bg-white px-3 py-2 shadow-[0_4px_10px_rgba(84,69,45,0.04)]"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <input type="checkbox" checked={selectedPrintRoomIds.includes(room.id)}
                                onChange={()=>togglePrintRoom(room.id)}
                                aria-label={"勾選列印 "+roomLabel(room)}
                                className="h-5 w-5 shrink-0 accent-[#8b8462]"/>
                              <div className="min-w-0 flex-1 truncate text-[16px] font-semibold text-[#524736]">{roomLabel(room)}</div>
                              <span className="shrink-0 rounded-full bg-[#efe5d6] px-2 py-1 text-[13px] font-semibold text-[#64563c]">
                                {splitGuestLines(occupantDrafts[room.id] ?? room.occupant).length} 位
                              </span>
                              <button type="button" onClick={()=>openGuestMove(room.id)}
                                title="移動住宿人到其他房間" className="shrink-0 rounded-full bg-[#f2ecdf] px-2 py-1 text-[12px] font-semibold text-[#76674f]">移動</button>
                              <button type="button" onClick={()=>deleteSelectedActivityRoom(room.id)}
                                className="shrink-0 rounded-full px-1 text-[16px] text-[#9b8974]" title="刪除此房間">−</button>
                            </div>
                            <textarea
                              value={occupantDrafts[room.id] ?? splitGuestLines(room.occupant).join("、")}
                              disabled={savingRoomAdministrationIds.includes(room.id)}
                              onChange={e=>setOccupantDrafts(prev=>({...prev,[room.id]:e.target.value}))}
                              onBlur={()=>{
                                const draft=occupantDrafts[room.id];
                                if(draft!==undefined)void saveOccupantList(selectedActivity.id,room.id,draft);
                              }}
                              ref={node=>{if(node){node.style.height="auto";node.style.height=node.scrollHeight+"px";}}}
                              rows={Math.max(1,Math.ceil((occupantDrafts[room.id] ?? splitGuestLines(room.occupant).join("、")).length / 17))}
                              placeholder="直接填寫住宿人姓名，例如：李貞儀、陳美華"
                              className="mt-2 min-h-[48px] w-full resize-none overflow-hidden rounded-[12px] border border-[#ded4c5] bg-[#fffcf8] px-3 py-2 text-[15px] leading-6 text-[#514837] focus:outline-[#9a946f] disabled:opacity-60"
                            />
                            <div className="mt-2 flex items-center gap-2">
                              <span className="shrink-0 text-[20px] leading-none" aria-label="房務指派">🧹</span>
                              <button type="button"
                                aria-expanded={openCleanerPickerRoomId===room.id}
                                aria-controls={"cleaner-options-"+room.id}
                                disabled={savingRoomAdministrationIds.includes(room.id)}
                                onClick={()=>setOpenCleanerPickerRoomId(prev=>prev===room.id?"":room.id)}
                                className="min-h-[42px] min-w-0 flex-1 rounded-[12px] border border-[#d9cebc] bg-[#fdfaf6] px-3 text-[15px] font-medium text-[#5f5444] disabled:opacity-60">
                                <span className="flex items-center justify-between gap-2">
                                  <span className="truncate">{savingRoomAdministrationIds.includes(room.id)?"儲存中…":room.assignedTo||"未分配"}</span>
                                  <ChevronDown className="h-4 w-4 shrink-0"/>
                                </span>
                              </button>
                              <span className="shrink-0 text-[13px] text-[#8b7d69]">{roomProgress(room)}%</span>
                              <button type="button" onClick={()=>printSingleRoomA4(room)}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eee6d9] text-[#76674f]"
                                title="單房A4列印"><Printer className="h-5 w-5"/></button>
                            </div>
                            {openCleanerPickerRoomId===room.id && (
                              <div id={`cleaner-options-${room.id}`} role="group"
                                aria-label={`指派 ${roomLabel(room)} 的房務人員`}
                                className="mt-3 rounded-[16px] border border-[#dbd1c1] bg-[#f8f4ec] p-2">
                                <p className="mb-2 px-1 text-[14px] font-semibold text-[#524736]">選擇打掃人員</p>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                  {[{id:"",name:"未分配"},...staffUsers.map(user=>({id:String(user.dbId),name:user.name}))].map(option=>(
                                    <button key={option.id || "unassigned"} type="button"
                                      disabled={savingRoomAdministrationIds.includes(room.id)}
                                      onClick={()=>{
                                        setOpenCleanerPickerRoomId("");
                                        const assignedCleanerId=option.id ? Number(option.id) : null;
                                        if(assignedCleanerId!== (room.cleanerId??null)){
                                          void updateRoomField(selectedActivity.id,room.id,{assignedCleanerId});
                                        }
                                      }}
                                      className={`min-h-[48px] rounded-[12px] border px-2 py-2 text-[15px] font-medium ${String(room.cleanerId??"")===option.id
                                        ? "border-[#8b8462] bg-[#e5dfcf] text-[#4f4435]"
                                        : "border-[#e4dacc] bg-white text-[#5f5444]"}`}
                                    >{option.name}</button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}

                        {filteredActivityRooms.length === 0 && (
                          <div className="py-6 text-center text-sm text-[#a79a86]">
                            目前此分類沒有房間資料
                          </div>
                        )}
                      </div>
                      )
                    ) : (
                      <div className="mt-2 rounded-[20px] border border-[#e2d8c8] bg-[#faf6f0] px-4 py-6 text-center text-sm text-[#8d8272]">
                        此活動未勾選需打掃，因此不建立房間列表。
                      </div>
                    )}
                  </>
                )}
                  </div>
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
                  {staffSuccess && <p role="status" className="mb-2 rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-800">{staffSuccess}</p>}
                  {staffUsers.map((user) => {
                    const assignedRooms = latestRooms.filter(
                      (room) => user.dbId != null && room.cleanerId === user.dbId
                    );
                    const expanded = expandedStaffName === user.id;

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
                            onClick={() => setExpandedStaffName((prev) => (prev === user.id ? "" : user.id))}
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
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e2d8c8] bg-[#fcfaf6]/96 px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-[0_-10px_24px_rgba(84,69,45,0.10)] backdrop-blur">
          <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
            <button
              onClick={() => {
                setAdminView("activity");
                setActivitySection("summary");
                setActivityYear(String(new Date().getFullYear()));
                setActivityMonth("all");
              }}
              className={`min-h-[46px] rounded-[16px] border px-2 py-2 text-[13px] font-semibold ${gradientButton(
                adminView === "activity"
              )}`}
            >
              <ZenLotusIcon className="mx-auto mb-1 h-6 w-6"/>活動
            </button>
            <button
              onClick={() => setAdminView("staff")}
              className={`rounded-[16px] border px-2 py-2 text-[11px] font-semibold ${gradientButton(
                adminView === "staff"
              )}`}
            >
              <RoundedPersonIcon className="mx-auto mb-1 h-6 w-6"/>人員
            </button>
            <button
              onClick={() => setAdminView("calendar")}
              className={`rounded-[16px] border px-2 py-2 text-[11px] font-semibold ${gradientButton(
                adminView === "calendar"
              )}`}
            >
              <CalendarDays className="mx-auto mb-1 h-6 w-6"/>日曆
            </button>
            <button
              onClick={() => {setAdminView("overview");setManagementSection("home");}}
              className={`rounded-[16px] border px-2 py-2 text-[11px] font-semibold ${gradientButton(
                adminView === "overview"
              )}`}
            >
              <IncenseStatusIcon className="mx-auto mb-1 h-6 w-6"/>管理
            </button>
          </div>
        </div>
      )}

      {calendarSheetDate && currentUser && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-[#0f172a]/40 px-3 py-4 sm:items-center sm:p-4"
          onClick={() => setCalendarSheetDate("")}
        >
          <div
            className="my-auto w-full max-w-md min-w-0 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-[24px] bg-white p-4 shadow-[0_20px_40px_rgba(15,23,42,0.18)]"
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

      {quickPasteRoomId && selectedActivity && currentUser?.role==="admin" && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0F172A]/40 px-3 py-5 sm:items-center"
          onClick={()=>setQuickPasteRoomId("")}>
          <div className="my-auto w-full max-w-md rounded-[24px] bg-[#fffdf8] p-4 shadow-xl"
            onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-[20px] font-bold text-[#4f4435]">快速貼上住宿人</h3>
              <button type="button" onClick={()=>setQuickPasteRoomId("")} aria-label="關閉快速貼上" className="p-2 text-[#746854]">✕</button>
            </div>
            <p className="mt-2 text-[13px] leading-5 text-[#81735f]">從 Excel、Word、LINE 複製名單，一行一位，或直接貼上多個儲存格。系統會保留姓名順序。</p>
            <label className="mt-3 block text-[14px] font-semibold">目標房間
              <select value={quickPasteRoomId} onChange={e=>setQuickPasteRoomId(e.target.value)}
                className="mt-1 w-full min-w-0 rounded-[12px] border border-[#dacebb] bg-white px-3 py-3 text-[16px]">
                {selectedActivity.rooms.map(room=><option key={room.id} value={room.id}>{roomLabel(room)}</option>)}
              </select>
            </label>
            <textarea value={quickPasteText} onChange={e=>setQuickPasteText(e.target.value)}
              rows={7} placeholder={"李貞儀\n陳美華\n黃彩戀\n許樊密"}
              className="mt-3 w-full rounded-[14px] border border-[#dacebb] bg-white p-3 text-[16px] leading-7"/>
            <p className="text-[13px] text-[#75684f]">辨識到 {splitGuestLines(quickPasteText.replace(/\t/g,"、")).length} 位住宿人</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={()=>setQuickPasteMode("append")}
                className={"rounded-[13px] px-2 py-3 text-[14px] font-semibold "+(quickPasteMode==="append"?"bg-[#888465] text-white":"border border-[#ddd1be] bg-white")}>追加（預設）</button>
              <button type="button" onClick={()=>setQuickPasteMode("replace")}
                className={"rounded-[13px] px-2 py-3 text-[14px] font-semibold "+(quickPasteMode==="replace"?"bg-[#888465] text-white":"border border-[#ddd1be] bg-white")}>取代現有名單</button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={()=>setQuickPasteRoomId("")} className="rounded-[13px] bg-[#eee8dc] px-4 py-3 text-[15px]">取消</button>
              <button type="button" onClick={()=>void applyQuickPaste()} className="rounded-[13px] bg-[#888465] px-4 py-3 text-[15px] text-white">預覽檢查並儲存</button>
            </div>
          </div>
        </div>
      )}
      {guestMove && selectedActivity && currentUser?.role==="admin" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0F172A]/45 p-3" role="dialog" aria-label="移動住宿人">
          <div className="w-full max-w-sm rounded-[24px] bg-[#fffdf8] p-4 shadow-xl">
            <h3 className="text-[19px] font-bold text-[#544735]">跨房間移動住宿人</h3>
            <p className="mt-2 text-[14px] text-[#806f5c]">移動會一次更新原房與目的房，失敗時不會只刪除其中一間。</p>
            <label className="mt-3 block text-[14px] font-semibold">選擇住宿人
              <select value={guestMove.name}
                onChange={e=>setGuestMove(prev=>prev?{...prev,name:e.target.value}:null)}
                disabled={guestMoving}
                className="mt-1 w-full min-w-0 rounded-[12px] border border-[#d9cbb7] bg-white px-3 py-3 text-[16px]">
                {splitGuestLines(selectedActivity.rooms.find(r=>r.id===guestMove.fromRoomId)?.occupant??"").map((name,i)=>(
                  <option key={name+"-"+i} value={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-[14px] font-semibold">目的房間
              <select value={guestMove.toRoomId}
                onChange={e=>setGuestMove(prev=>prev?{...prev,toRoomId:e.target.value}:null)}
                disabled={guestMoving}
                className="mt-1 w-full min-w-0 rounded-[12px] border border-[#d9cbb7] bg-white px-3 py-3 text-[16px]">
                {selectedActivity.rooms.filter(room=>room.id!==guestMove.fromRoomId).map(room=>(
                  <option key={room.id} value={room.id}>{roomLabel(room)}</option>
                ))}
              </select>
            </label>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" disabled={guestMoving} onClick={()=>setGuestMove(null)}
                className="rounded-[12px] bg-[#efe8dc] px-3 py-3 text-[15px]">取消</button>
              <button type="button" disabled={guestMoving} onClick={()=>void confirmGuestMove()}
                className="rounded-[12px] bg-[#858264] px-3 py-3 text-[15px] text-white">
                {guestMoving?"移動中…":"確認移動"}
              </button>
            </div>
          </div>
        </div>
      )}
      {duplicatePending && currentUser?.role==="admin" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0f172a]/45 p-3" role="alertdialog"
          aria-label="重複姓名提醒">
          <div className="w-full max-w-sm rounded-[22px] border border-[#e2aaa0] bg-[#fff9f4] p-4 shadow-xl">
            <h3 className="text-[20px] font-bold text-[#a53c2d]">發現重複姓名！</h3>
            <p className="mt-2 text-[16px] font-semibold text-[#5b4637]">{duplicatePending.person}</p>
            <p className="mt-1 text-[14px] text-[#6b5548]">同活動已出現在：{duplicatePending.locations.join("、")}</p>
            <p className="mt-2 text-[13px] text-[#806a5e]">姓名必須完全相同才提醒。不同人同名時仍可選擇儲存。</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-[13px] border border-[#d9b5a8] bg-white px-2 py-3 text-[14px]"
                onClick={()=>setDuplicatePending(null)}>返回檢查</button>
              <button type="button" className="rounded-[13px] bg-[#858264] px-2 py-3 text-[14px] text-white"
                onClick={()=>{
                  const pending=duplicatePending;
                  setDuplicatePending(null);
                  void saveOccupantList(pending.activityId,pending.roomId,pending.names,true);
                }}>仍要儲存</button>
            </div>
            <button type="button" className="mt-3 w-full text-[14px] text-[#857359]"
              onClick={()=>{
                const matched=selectedActivity?.rooms.find(r=>roomLabel(r)===duplicatePending.locations[0]);
                if(matched){setActivityRoomSearch(matched.roomNo);setActivitySelectedBuilding(matched.building);setActivitySelectedFloor(matched.floor);}
                setDuplicatePending(null);
              }}>查看該房間</button>
          </div>
        </div>
      )}
      {duplicateReport && currentUser?.role==="admin" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/40 p-3" onClick={()=>setDuplicateReport(null)}>
          <div className="w-full max-w-sm rounded-[22px] bg-white p-4 shadow-xl" onClick={e=>e.stopPropagation()}>
            <h3 className="text-[18px] font-bold">活動住宿人重複檢查</h3>
            {duplicateReport.length===0 ? <p className="mt-3 text-[15px]">目前沒有跨房間完全同名的住宿人。</p>
              : duplicateReport.map(row=><p className="mt-3 rounded-[12px] bg-[#f8eee6] p-3 text-[14px]" key={row.name}>
                <strong>{row.name}</strong>：{row.rooms.join("、")}
              </p>)}
            <button type="button" onClick={()=>setDuplicateReport(null)} className="mt-4 rounded-[12px] bg-[#858264] px-4 py-2 text-white">關閉</button>
          </div>
        </div>
      )}
      {showActivityModal && currentUser && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-[#0F172A]/40 px-3 py-4 sm:items-center sm:p-4"
          onClick={() => { if(!activitySaving) setShowActivityModal(false); }}
        >
          <div
            className="my-auto box-border w-full max-w-sm min-w-0 max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[28px] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.14)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-[#4f4435]">
              {activityModalMode === "edit" ? "修改活動" : "新增活動"}
            </div>
            {!isApprovedProductionUI() && <p className="mt-2 text-[11px] text-[#847663]">獨立測試環境：新活動將自動加上「【權限驗收】」標記；原有測試活動 A／B／C 可以調整日期與名稱。</p>}

            <div className="mt-3 space-y-3">
              <label className="block min-w-0 text-[15px] font-semibold text-[#5f5444]">
                活動日期
                <input type="date" value={activityDate}
                  onChange={e=>setActivityDate(e.target.value)}
                  className="mt-1 box-border block min-h-[52px] w-full min-w-0 max-w-full appearance-none overflow-hidden rounded-[16px] border border-[#ddd3c4] bg-[#fffdfa] px-2 py-2 text-[16px] font-normal text-[#5f5444] [min-width:0] [&::-webkit-date-and-time-value]:min-w-0" style={{width:"100%",maxWidth:"100%",minWidth:0,boxSizing:"border-box"}}/>
              </label>
              <label className="block min-w-0 text-[15px] font-semibold text-[#5f5444]">
                活動名稱
                <textarea value={activityName} onChange={e=>setActivityName(e.target.value)}
                  onInput={e=>{const n=e.currentTarget;n.style.height="auto";n.style.height=n.scrollHeight+"px";}}
                  ref={n=>{if(n){n.style.height="auto";n.style.height=n.scrollHeight+"px";}}}
                  rows={1} placeholder="活動名稱"
                  className="mt-1 box-border block min-h-[52px] w-full max-w-full min-w-0 resize-none overflow-hidden rounded-[16px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-3 text-[16px] font-normal leading-6 text-[#5f5444]"/>
              </label>
              <label className="block min-w-0 text-[15px] font-semibold text-[#5f5444]">
                聯絡人／備註
                <textarea value={activityContact} onChange={e=>setActivityContact(e.target.value)}
                  onInput={e=>{const n=e.currentTarget;n.style.height="auto";n.style.height=n.scrollHeight+"px";}}
                  ref={n=>{if(n){n.style.height="auto";n.style.height=n.scrollHeight+"px";}}}
                  rows={2} placeholder="聯絡人／備註（可多行）"
                  className="mt-1 box-border block min-h-[72px] w-full max-w-full min-w-0 resize-none overflow-hidden rounded-[16px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-3 text-[16px] font-normal leading-6 text-[#5f5444]"/>
              </label>

              <label className="flex items-center justify-between rounded-[18px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]">
                <span>需打掃</span>
                <input
                  type="checkbox"
                  checked={activityNeedsCleaning}
                  disabled={activityModalMode === "edit"}
                  title={activityModalMode === "edit" ? "活動建立後不可直接切換打掃類型，以免遺失房間清單" : undefined}
                  onChange={(e) => setActivityNeedsCleaning(e.target.checked)}
                  className="accent-[#8b8462] disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
              {activityModalMode === "edit" && (
                <p className="text-xs leading-5 text-[#8d8272]">
                  修改活動名稱、日期與備註不影響房間；需打掃設定建立後不可直接更改，以保護既有房間資料。
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <div>
                {activityModalMode === "edit" && (
                  <button
                    onClick={deleteCurrentActivity}
                    disabled={activitySaving}
                    className="rounded-[20px] bg-[#e7d9d5] px-3 py-2 text-sm font-medium text-[#8a4f43]"
                  >
                    刪除活動
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { if(!activitySaving) setShowActivityModal(false); }}
                  disabled={activitySaving}
                  className="rounded-[20px] bg-[#ece5d9] px-3 py-2 text-sm font-medium text-[#5f5444]"
                >
                  取消
                </button>
                <button
                  onClick={saveActivityModal}
                  disabled={activitySaving}
                  className="rounded-[20px] bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] px-3 py-2 text-sm font-medium text-white"
                >
                  {activitySaving ? "處理中…" : "儲存"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRoomModal && currentUser && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-[#0F172A]/40 px-3 py-4 sm:items-center sm:p-4"
          onClick={() => { if(!roomSaving) setShowRoomModal(false); }}
        >
          <div
            className="my-auto w-full max-w-sm min-w-0 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-[28px] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.14)]"
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
                <option value="">未分配</option>
                {staffUsers.map((user) => (
                  <option key={user.id} value={String(user.dbId)}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { if(!roomSaving) setShowRoomModal(false); }}
                disabled={roomSaving}
                className="rounded-[20px] bg-[#ece5d9] px-3 py-2 text-sm font-medium text-[#5f5444]"
              >
                取消
              </button>
              <button
                onClick={saveNewRoom}
                disabled={roomSaving}
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
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-[#0F172A]/40 px-3 py-4 sm:items-center sm:p-4"
          onClick={() => { if(!staffSaving) setShowStaffModal(false); }}
        >
          <div
            className="my-auto w-full max-w-sm min-w-0 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-[28px] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.14)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-[#4f4435]">
              {staffModalMode === "edit" ? "編輯打掃人員" : "新增打掃人員"}
            </div>

            <p className="mt-2 text-xs text-[#8b7755]" role="status">房務 PIN 修正版 11/05-K · 本次點擊：{staffButtonPresses}</p>
            <div className="mt-3 space-y-3">
              <input
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
                className="w-full rounded-[20px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]"
                placeholder="人員姓名"
              />

              <input
                value={newStaffPin}
                onChange={(e) => { if(!staffMutationBusy.current) setNewStaffPin(e.target.value); }}
                className="w-full rounded-[20px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]"
                placeholder="輸入新 PIN（8～32 位數字）"
                inputMode="numeric"
                autoComplete="new-password"
                type="password"
              />
              <p className="text-xs text-[#786b54]" id="new-staff-pin-help">PIN 需為 8～32 位半形數字，不可使用連號或重複組合。</p>
              {newStaffPin.length>0 && (
                <p role="status" aria-live="polite"
                  className={`rounded-xl border px-3 py-2 text-xs ${validateNewStaffPin(newStaffPin.trim())
                    ? "border-red-300 bg-red-50 text-red-800" : "border-green-300 bg-green-50 text-green-800"}`}>
                  {validateNewStaffPin(newStaffPin.trim())
                    ? validateNewStaffPin(newStaffPin.trim()) : "PIN 格式符合安全規則，可以點選儲存。"}
                </p>
              )}
            </div>

            <p className="mt-3 text-xs text-[#786b54]" role="status">目前階段：{staffSaveStage}</p>
            <p className="mt-3 text-xs text-[#786b54]" role="status">
              {staffSaveStatus==="saving"?"正在儲存，請稍候…":
               staffSaveStatus==="error"?"儲存未成功，請看下方錯誤訊息。":
               newStaffPin.trim().length===0?"尚未輸入新 PIN。":
               `已輸入 ${newStaffPin.trim().length} 位數字，按儲存後會驗證。`}
            </p>
            {staffFeedback && <p role={staffSaveStatus==="saving"?"status":"alert"} className={`mt-2 rounded-xl border p-3 text-sm ${staffSaveStatus==="saving"?"border-amber-300 bg-amber-50 text-amber-900":"border-red-300 bg-red-50 text-red-800"}`}>{staffFeedback}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { if(!staffSaving) setShowStaffModal(false); }}
                disabled={staffSaving}
                className="rounded-[20px] bg-[#ece5d9] px-3 py-2 text-sm font-medium text-[#5f5444]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  void saveStaffModal().catch(()=>{
                    // Last-resort guard against uncaught async errors.
                    setStaffSaveStatus("error");
                    setStaffSaveStage("未預期的儲存錯誤");
                    setStaffFeedback("設定 PIN 發生未預期錯誤，尚未確認儲存。請重新開啟編輯畫面。");
                    staffMutationBusy.current=false;
                    setStaffSaving(false);
                  });
                }}
                disabled={staffSaving}
                className="rounded-[20px] bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] px-3 py-2 text-sm font-medium text-white"
              >
                {staffSaving ? "PIN 處理中…" : "儲存 PIN（11/05-K）"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPhotoModal && currentUser && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-[#0F172A]/45 px-3 py-4 sm:items-center sm:p-4"
          onClick={resetPhotoModal}
        >
          <div
            className="my-auto w-full max-w-sm min-w-0 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-[28px] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.14)]"
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