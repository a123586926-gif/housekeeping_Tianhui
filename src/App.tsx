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

type User = { id: string; name: string; role: Role; pin: string };
type SubItem = { id: string; label: string; done: boolean };
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
  category?: string | null;
  contact?: string | null;
  requires_cleaning?: boolean | null;
  guest_count?: number | null;
  status?: string | null;
  notes?: string | null;
};

const FLOOR_OPTIONS: FloorType[] = ["2F", "3F", "5F", "6F", "7F", "RF"];
const ROOM_NUMBER_SUFFIXES = ["1", "2", "3", "5", "6", "7", "8"];

const usersSeed: User[] = [
  { id: "admin", name: "admin", role: "admin", pin: "885288" },
  { id: "ym", name: "友美", role: "cleaner", pin: "885288" },
  { id: "lz", name: "麗珠", role: "cleaner", pin: "885288" },
];

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
    subItems: item.subItems.map((sub) => ({ ...sub, done: false })),
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

function buildRoomsForActivity(withSampleData = false): Room[] {
  const buildings: BuildingType[] = ["A", "B"];
  const staffCycle = ["友美", "麗珠", "未分配"];
  const rooms: Room[] = [];

  buildings.forEach((building, buildingIndex) => {
    FLOOR_OPTIONS.forEach((floor, floorIndex) => {
      const floorPrefix = floor === "RF" ? "R" : floor.replace("F", "0");
      ROOM_NUMBER_SUFFIXES.forEach((suffix, roomIndex) => {
        const checklist = buildChecklist();
        const assignedTo = withSampleData
          ? staffCycle[(buildingIndex + floorIndex + roomIndex) % staffCycle.length]
          : "未分配";
        let occupant = "";

        if (withSampleData && building === "A" && floor === "2F" && suffix === "1") {
          occupant = ["王小姐", "陳小姐"].join(String.fromCharCode(10));
          checklist[0].done = true;
          checklist[0].photo = true;
          checklist[0].subItems = checklist[0].subItems.map((sub) => ({ ...sub, done: true }));
        }

        if (withSampleData && building === "A" && floor === "2F" && suffix === "2") {
          occupant = "林小姐";
          checklist.forEach((item) => {
            item.done = true;
            item.photo = item.requiredPhoto;
            item.subItems = item.subItems.map((sub) => ({ ...sub, done: true }));
          });
        }

        rooms.push({
          id: `${building}-${floor}-${floorPrefix}${suffix}`,
          building,
          floor,
          roomNo: `${floorPrefix}${suffix}`,
          assignedTo,
          occupant,
          status: computeRoomStatus(checklist),
          checklist,
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
  return Array.from({ length: 42 }, (_, i) => new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i));
}

function monthLabel(date: Date): string {
  return `${date.getFullYear()}年 ${date.getMonth() + 1}月`;
}

function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function SectionTitle({ title, sub, icon }: { title: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#f3ece1_0%,#e7dcc8_100%)] text-[#8a7756] shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_16px_rgba(89,72,47,0.10)]">
        {icon}
      </div>
      <div>
        <div className="text-[16px] font-semibold tracking-tight text-[#4f4435]">{title}</div>
        {sub ? <div className="mt-0.5 text-[11px] leading-4 text-[#8e8475]">{sub}</div> : null}
      </div>
    </div>
  );
}

const fallbackActivities: Activity[] = [
  {
    id: "act-1",
    date: "2026-04-20",
    name: "禪修營",
    contact: "王小姐",
    category: "活動",
    requiresCleaning: true,
    guestCount: "14",
    rooms: buildRoomsForActivity(true),
  },
  {
    id: "act-2",
    date: "2026-04-18",
    name: "主管參訪",
    contact: "管理部",
    category: "一般活動",
    requiresCleaning: false,
    guestCount: "6",
    rooms: [],
  },
];

export default function App() {
  const [staffUsers, setStaffUsers] = useState<User[]>(usersSeed.filter((u) => u.role === "cleaner"));
  const [currentUser, setCurrentUser] = useState<User>(usersSeed[1]);
  const [showLogin, setShowLogin] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [pin, setPin] = useState("");
  const [viewMode, setViewMode] = useState<"staff" | "admin">("staff");
  const [roomFilter, setRoomFilter] = useState<"all" | "completed" | "pending">("all");
  const [adminView, setAdminView] = useState<AdminView>("overview");
  const [expandedRoomId, setExpandedRoomId] = useState("");
  const [expandedStaffName, setExpandedStaffName] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(new Date(2026, 3, 1));
  const [calendarSheetDate, setCalendarSheetDate] = useState("");

  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityModalMode, setActivityModalMode] = useState<"add" | "edit">("add");
  const [editingActivityId, setEditingActivityId] = useState("");
  const [activityName, setActivityName] = useState("");
  const [activityDate, setActivityDate] = useState("2026-04-20");
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

  const [activities, setActivities] = useState<Activity[]>(fallbackActivities);
  const [selectedActivityId, setSelectedActivityId] = useState(fallbackActivities[0]?.id ?? "");

  useEffect(() => {
    let isMounted = true;

    async function loadEvents() {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: false })
        .order("id", { ascending: false });

      if (error) {
        console.error("讀取 events 失敗：", error);
        return;
      }

      if (!data || data.length === 0) {
        return;
      }

      const mappedActivities: Activity[] = (data as DbEvent[]).map((event, index) => ({
        id: String(event.id),
        date: event.event_date,
        name: event.event_name,
        contact: event.contact || "",
        category: event.category || event.event_type || "活動",
        requiresCleaning: event.requires_cleaning ?? true,
        guestCount: String(event.guest_count ?? 0),
        rooms:
          (event.requires_cleaning ?? true)
            ? index === 0
              ? buildRoomsForActivity(true)
              : buildRoomsForActivity(false)
            : [],
      }));

      if (!isMounted) return;

      setActivities(mappedActivities);
      setSelectedActivityId((prev) =>
        mappedActivities.some((item) => item.id === prev) ? prev : mappedActivities[0]?.id ?? ""
      );
    }

    loadEvents();

    return () => {
      isMounted = false;
    };
  }, []);

  const role = currentUser.role;
  const loginUsers = useMemo(() => [usersSeed[0], ...staffUsers], [staffUsers]);
  const selectedActivity = useMemo(() => activities.find((a) => a.id === selectedActivityId) || activities[0] || null, [activities, selectedActivityId]);
  const latestCleaningActivity = useMemo(() => activities.find((a) => a.requiresCleaning) || activities[0] || null, [activities]);
  const latestRooms = latestCleaningActivity?.rooms || [];

  const cleanerRooms = useMemo(() => {
    const source = role === "admin" ? latestRooms : latestRooms.filter((room) => room.assignedTo === currentUser.name);
    if (roomFilter === "completed") return source.filter((r) => r.status === "completed");
    if (roomFilter === "pending") return source.filter((r) => r.status !== "completed");
    return source;
  }, [latestRooms, currentUser.name, role, roomFilter]);

  const adminSummary = useMemo(() => {
    const total = latestRooms.length;
    const completed = latestRooms.filter((r) => r.status === "completed").length;
    const inProgress = latestRooms.filter((r) => r.status === "in_progress").length;
    const pending = latestRooms.filter((r) => r.status === "pending").length;
    return { total, completed, inProgress, pending };
  }, [latestRooms]);

  const overviewRooms = latestRooms;

  const filteredActivityRooms = useMemo(() => {
    if (!selectedActivity) return [];
    return selectedActivity.rooms
      .filter((room) => activitySelectedBuilding === "all" || room.building === activitySelectedBuilding)
      .filter((room) => activitySelectedFloor === "all" || room.floor === activitySelectedFloor)
      .sort((a, b) => {
        if (a.building !== b.building) return a.building.localeCompare(b.building);
        if (a.floor !== b.floor) return FLOOR_OPTIONS.indexOf(a.floor) - FLOOR_OPTIONS.indexOf(b.floor);
        return a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true });
      });
  }, [selectedActivity, activitySelectedBuilding, activitySelectedFloor]);

  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);
  const activitiesByDate = useMemo(() => {
    const map = new Map<string, Activity[]>();
    activities.forEach((activity) => {
      const list = map.get(activity.date) || [];
      list.push(activity);
      map.set(activity.date, list);
    });
    return map;
  }, [activities]);

  function handleLogin() {
    const found = loginUsers.find((u) => u.id === selectedUserId && u.pin === pin);
    if (!found) {
      window.alert("帳號或密碼錯誤，請重新輸入");
      return;
    }
    setCurrentUser(found);
    setShowLogin(false);
    if (found.role === "cleaner") setViewMode("staff");
    setPin("");
  }

  function updateLatestActivityChecklist(roomId: string, itemId: string, checked: boolean) {
    if (!latestCleaningActivity) return;
    setActivities((prev) =>
      prev.map((activity) => {
        if (activity.id !== latestCleaningActivity.id) return activity;
        return {
          ...activity,
          rooms: activity.rooms.map((room) => {
            if (room.id !== roomId) return room;
            const nextChecklist = room.checklist.map((item) =>
              item.id !== itemId
                ? item
                : {
                    ...item,
                    done: checked,
                    photo: item.requiredPhoto ? checked : item.photo,
                    subItems: item.subItems.map((sub) => ({ ...sub, done: checked })),
                  }
            );
            return { ...room, checklist: nextChecklist, status: computeRoomStatus(nextChecklist) };
          }),
        };
      })
    );
  }

  function updateLatestActivitySubItem(roomId: string, itemId: string, subItemId: string, checked: boolean) {
    if (!latestCleaningActivity) return;
    setActivities((prev) =>
      prev.map((activity) => {
        if (activity.id !== latestCleaningActivity.id) return activity;
        return {
          ...activity,
          rooms: activity.rooms.map((room) => {
            if (room.id !== roomId) return room;
            const nextChecklist = room.checklist.map((item) => {
              if (item.id !== itemId) return item;
              const nextSubItems = item.subItems.map((sub) =>
                sub.id === subItemId ? { ...sub, done: checked } : sub
              );
              return {
                ...item,
                subItems: nextSubItems,
                done: nextSubItems.every((sub) => sub.done),
              };
            });
            return { ...room, checklist: nextChecklist, status: computeRoomStatus(nextChecklist) };
          }),
        };
      })
    );
  }

  function openAddActivityModal(prefillDate?: string) {
    setActivityModalMode("add");
    setEditingActivityId("");
    setActivityName("");
    setActivityDate(prefillDate || "2026-04-20");
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

  function saveActivityModal() {
    if (!activityName.trim() || !activityDate.trim() || !activityContact.trim()) return;

    if (activityModalMode === "edit") {
      setActivities((prev) =>
        prev.map((activity) =>
          activity.id === editingActivityId
            ? {
                ...activity,
                name: activityName.trim(),
                date: activityDate,
                contact: activityContact.trim(),
                requiresCleaning: activityNeedsCleaning,
                category: activityNeedsCleaning ? "活動" : "一般活動",
                rooms: activityNeedsCleaning ? (activity.rooms.length > 0 ? activity.rooms : buildRoomsForActivity(false)) : [],
              }
            : activity
        )
      );
      setShowActivityModal(false);
      return;
    }

    const newActivity: Activity = {
      id: `act-${Date.now()}`,
      date: activityDate,
      name: activityName.trim(),
      contact: activityContact.trim(),
      category: activityNeedsCleaning ? "活動" : "一般活動",
      requiresCleaning: activityNeedsCleaning,
      guestCount: "0",
      rooms: activityNeedsCleaning ? buildRoomsForActivity(false) : [],
    };
    setActivities((prev) => [newActivity, ...prev]);
    setSelectedActivityId(newActivity.id);
    setActivitySelectedBuilding("all");
    setActivitySelectedFloor("all");
    setShowActivityModal(false);
  }

  function saveNewRoom() {
    if (!selectedActivity) return;
    const exists = selectedActivity.rooms.some(
      (room) => room.building === newRoomBuilding && room.floor === newRoomFloor && room.roomNo === newRoomNo
    );
    if (exists) {
      window.alert("此房間已存在");
      return;
    }
    const newRoom: Room = {
      id: `${newRoomBuilding}-${newRoomFloor}-${newRoomNo}-${Date.now()}`,
      building: newRoomBuilding,
      floor: newRoomFloor,
      roomNo: newRoomNo,
      assignedTo: newRoomStaff,
      occupant: newOccupant,
      checklist: buildChecklist(),
      status: "pending",
    };
    setActivities((prev) => prev.map((activity) => (activity.id === selectedActivity.id ? { ...activity, rooms: [...activity.rooms, newRoom] } : activity)));
    setShowRoomModal(false);
    setNewOccupant("");
    setNewRoomStaff("未分配");
  }

  function selectActivity(activityId: string) {
    setSelectedActivityId(activityId);
    setActivitySelectedBuilding("all");
    setActivitySelectedFloor("all");
  }

  function deleteSelectedActivityRoom(roomId: string) {
    if (!selectedActivity) return;
    const confirmed = window.confirm("確定要刪除此房間嗎？");
    if (!confirmed) return;
    setActivities((prev) =>
      prev.map((activity) =>
        activity.id === selectedActivity.id
          ? { ...activity, rooms: activity.rooms.filter((targetRoom) => targetRoom.id !== roomId) }
          : activity
      )
    );
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

  function saveStaffModal() {
    const name = newStaffName.trim();
    const pinValue = newStaffPin.trim();
    if (!name || !pinValue) {
      window.alert("請輸入人員姓名與密碼");
      return;
    }

    if (staffModalMode === "edit") {
      if (staffUsers.some((user) => user.name === name && user.id !== editingStaffId)) {
        window.alert("此打掃人員名稱已存在");
        return;
      }
      setStaffUsers((prev) => prev.map((user) => (user.id === editingStaffId ? { ...user, name, pin: pinValue } : user)));
      if (currentUser.id === editingStaffId) {
        setCurrentUser((prev) => ({ ...prev, name, pin: pinValue }));
      }
      setShowStaffModal(false);
      return;
    }

    if (staffUsers.some((user) => user.name === name)) {
      window.alert("此打掃人員名稱已存在");
      return;
    }
    setStaffUsers((prev) => [...prev, { id: `cleaner-${Date.now()}`, name, role: "cleaner", pin: pinValue }]);
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
                onClick={() => setShowLogin((v) => !v)}
                className="rounded-[22px] border border-[#d9cfbf] bg-[linear-gradient(180deg,#fffdfa_0%,#f2ecdf_100%)] px-4 py-2 text-sm font-semibold text-[#6b604b] shadow-[0_8px_18px_rgba(84,69,45,0.10)]"
              >
                切換帳號
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="inline-flex rounded-full border border-[#d9cfbf] bg-[#f7f1e8] px-3 py-1 text-xs text-[#6b604b] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
                目前登入：{currentUser.name}
              </div>
              {role === "admin" && (
                <div className="flex items-center gap-2">
                  <button onClick={() => setViewMode("staff")} className={`rounded-[18px] border px-3 py-1.5 text-xs font-semibold ${gradientButton(viewMode === "staff")}`}>清潔</button>
                  <button onClick={() => setViewMode("admin")} className={`rounded-[18px] border px-3 py-1.5 text-xs font-semibold ${gradientButton(viewMode === "admin")}`}>後台</button>
                </div>
              )}
            </div>
          </div>

          {showLogin && (
            <div className="space-y-2 border-t border-[#e5ddd0] bg-[linear-gradient(180deg,#fcfaf6_0%,#f4eee4_100%)] p-3">
              <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="w-full rounded-[16px] border border-[#ddd4c6] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]">
                <option value="">請選擇帳號</option>
                {loginUsers.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
              <input value={pin} onChange={(e) => setPin(e.target.value)} className="w-full rounded-[16px] border border-[#ddd4c6] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]" placeholder="請輸入密碼" type="password" />
              <button onClick={handleLogin} className="w-full rounded-[16px] bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] px-3 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(110,99,67,0.20)]">登入</button>
              <div className="text-[11px] text-[#8d8272]">測試帳號：admin / 885288、友美 / 885288、麗珠 / 885288</div>
            </div>
          )}
        </div>

        {viewMode === "staff" ? (
          <div className="mt-3 rounded-[28px] border border-[#e2d8c8] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f3eb_100%)] p-3 shadow-[0_12px_26px_rgba(84,69,45,0.08)]">
            <SectionTitle title="我的房間" sub={latestCleaningActivity ? `${formatDate(latestCleaningActivity.date)} ${latestCleaningActivity.name}` : undefined} icon={<WandSparkles className="h-4 w-4" />} />
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                { key: "all", label: "全部" },
                { key: "completed", label: "完成" },
                { key: "pending", label: "未完成" },
              ].map((item) => (
                <button key={item.key} onClick={() => setRoomFilter(item.key as typeof roomFilter)} className={`rounded-[16px] border px-3 py-2 text-sm font-semibold ${gradientButton(roomFilter === item.key)}`}>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-2 space-y-2">
              {cleanerRooms.map((room) => {
                const expanded = expandedRoomId === room.id;
                return (
                  <div key={room.id} className="overflow-hidden rounded-[22px] border border-[#e2d8c8] bg-white shadow-[0_8px_18px_rgba(84,69,45,0.06)]">
                    <button onClick={() => setExpandedRoomId((prev) => (prev === room.id ? "" : room.id))} className={`w-full px-3 py-2.5 text-left ${expanded ? "bg-[linear-gradient(135deg,#8b8462_0%,#9b9471_58%,#b8b087_100%)] text-white" : "bg-white"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[15px] font-semibold">{roomLabel(room)}</div>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className={`text-[11px] font-semibold ${expanded ? "text-white/90" : statusTextClass(room.status)}`}>{statusText(room.status)}</span>
                            <span className={`text-[11px] ${expanded ? "text-white/85" : "text-[#8d8272]"}`}>{room.assignedTo}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`rounded-full px-3 py-1 text-[11px] font-semibold shadow-sm ${expanded ? "bg-white text-[#6b604b]" : "bg-[#efe7d7] text-[#75684f]"}`}>{roomProgress(room)}%</div>
                          <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
                        </div>
                      </div>
                    </button>
                    {expanded && (
                      <div className="space-y-2 bg-[#fdfaf6] px-2.5 py-2.5">
                        {room.checklist.map((item, idx) => (
                          <div key={item.id} className="rounded-[18px] border border-[#e5ddd0] bg-white px-2.5 py-2 shadow-[0_4px_10px_rgba(84,69,45,0.04)]">
                            <div className="flex items-start gap-2.5">
                              <input type="checkbox" checked={item.done} onChange={(e) => updateLatestActivityChecklist(room.id, item.id, e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#8b8462]" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#efe7d7] px-1.5 text-[10px] font-semibold text-[#8a7756]">{idx + 1}</span>
                                      <div className="text-[14px] font-semibold text-[#524736]">{item.label}</div>
                                    </div>
                                    <div className="mt-0.5 text-[11px] leading-4 text-[#8e8475]">{item.description}</div>
                                  </div>
                                  {item.requiredPhoto && (
                                    <button className={`rounded-[14px] border px-2.5 py-1 text-[11px] font-semibold shadow-sm ${item.photo ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#ddd4c6] bg-[#fdfaf6] text-[#75684f]"}`}>
                                      <span className="inline-flex items-center gap-1"><ImageIcon className="h-3.5 w-3.5" />{item.photo ? "已拍照" : "拍照"}</span>
                                    </button>
                                  )}
                                </div>
                                <div className="mt-2 space-y-0.5 rounded-[14px] bg-[#f6f0e6] px-2 py-1.5">
                                  {item.subItems.map((sub) => (
                                    <label key={sub.id} className="flex items-start gap-2 py-0.5">
                                      <input
                                        type="checkbox"
                                        checked={sub.done}
                                        onChange={(e) => updateLatestActivitySubItem(room.id, item.id, sub.id, e.target.checked)}
                                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#8b8462]"
                                      />
                                      <span className="text-[12px] leading-4 text-[#6c614d]">{sub.label}</span>
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
                <SectionTitle title="整理現況" sub={latestCleaningActivity ? `${formatDate(latestCleaningActivity.date)} ${latestCleaningActivity.name}` : "目前無打掃活動"} icon={<Bell className="h-4 w-4" />} />
                <div className="mt-2 grid grid-cols-4 gap-2">
                  <div className="rounded-[16px] border border-[#d9cfbe] bg-[linear-gradient(180deg,#fffdfa_0%,#f1eadf_100%)] px-2 py-2 text-center text-[#6a5f4a] shadow-[0_6px_16px_rgba(83,69,45,0.08)]"><div className="text-[10px] text-[#8d8272]">全部</div><div className="mt-0.5 text-[18px] font-semibold">{adminSummary.total}</div></div>
                  <div className="rounded-[16px] border border-[#d9cfbe] bg-[linear-gradient(180deg,#fffdfa_0%,#f1eadf_100%)] px-2 py-2 text-center text-[#6a5f4a] shadow-[0_6px_16px_rgba(83,69,45,0.08)]"><div className="text-[10px] text-[#8d8272]">完成</div><div className="mt-0.5 text-[18px] font-semibold">{adminSummary.completed}</div></div>
                  <div className="rounded-[16px] border border-[#d9cfbe] bg-[linear-gradient(180deg,#fffdfa_0%,#f1eadf_100%)] px-2 py-2 text-center text-[#6a5f4a] shadow-[0_6px_16px_rgba(83,69,45,0.08)]"><div className="text-[10px] text-[#8d8272]">進行</div><div className="mt-0.5 text-[18px] font-semibold">{adminSummary.inProgress}</div></div>
                  <div className="rounded-[16px] border border-[#d9cfbe] bg-[linear-gradient(180deg,#fffdfa_0%,#f1eadf_100%)] px-2 py-2 text-center text-[#6a5f4a] shadow-[0_6px_16px_rgba(83,69,45,0.08)]"><div className="text-[10px] text-[#8d8272]">未開始</div><div className="mt-0.5 text-[18px] font-semibold">{adminSummary.pending}</div></div>
                </div>
                <div className="mt-2 space-y-2 rounded-[20px] border border-[#e2d8c8] bg-[#faf6f0] p-2">
                  {overviewRooms.map((room) => {
                    const guests = splitGuestLines(room.occupant);
                    return (
                      <div key={room.id} className="rounded-[16px] border border-[#e5ddd0] bg-white px-3 py-2 shadow-[0_4px_10px_rgba(84,69,45,0.04)]">
                        <div className="flex items-start gap-2 text-[13px] leading-5 text-[#524736]">
                          <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-[#8a7756]" />
                          <div className="min-w-0 flex-1">
                            <div className="grid grid-cols-[auto_auto_1fr_auto_auto] items-start gap-x-2 gap-y-0.5 font-medium">
                              <span>{roomLabel(room)}</span>
                              <span>客：</span>
                              <span>{guests[0] || "-"}</span>
                              <span className="justify-self-end whitespace-nowrap">{room.assignedTo || "未分配"}</span>
                              <span className="justify-self-end whitespace-nowrap">{roomProgress(room)}%</span>
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
                </div>
              </div>
            )}

            {adminView === "activity" && (
              <div className="rounded-[28px] border border-[#e2d8c8] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f3eb_100%)] p-3 shadow-[0_12px_26px_rgba(84,69,45,0.08)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <SectionTitle title="活動列表" sub="點選活動才顯示下方房間表單" icon={<CalendarDays className="h-4 w-4" />} />
                  <button onClick={() => openAddActivityModal()} className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] text-white shadow-[0_10px_18px_rgba(110,99,67,0.22)]"><Plus className="h-4 w-4" /></button>
                </div>
                <div className="space-y-2">
                  {activities.map((activity) => {
                    const active = selectedActivity?.id === activity.id;
                    return (
                      <div key={activity.id} onClick={() => selectActivity(activity.id)} className={`w-full cursor-pointer rounded-[18px] border px-3 py-2 ${active ? "border-transparent bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] text-white shadow-[0_10px_20px_rgba(110,99,67,0.20)]" : "border-[#e2d8c8] bg-white"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <button type="button" onClick={() => selectActivity(activity.id)} className="min-w-0 flex-1 text-left">
                            <div className="truncate text-[13px] font-medium">{formatDate(activity.date)} {activity.name}</div>
                          </button>
                          <div className="flex items-center gap-2 shrink-0">
                            {activity.requiresCleaning ? <span className={active ? "text-white" : "text-[#8a7756]"}>🧹</span> : null}
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
                              className={`inline-flex cursor-pointer items-center justify-center rounded-full px-2 py-1 text-[10px] ${active ? "bg-white/15 text-white" : "bg-[#efe7d7] text-[#75684f]"}`}
                              title="編輯活動"
                            >
                              ✎
                            </span>
                            <span className={`text-[12px] font-semibold ${active ? "text-white" : "text-[#7f735d]"}`}>{activity.guestCount || "0"}</span>
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
                        <div className="text-[13px] font-semibold text-[#524736]">{selectedActivity.name}</div>
                        <button onClick={() => setShowRoomModal(true)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] text-white shadow-[0_8px_16px_rgba(110,99,67,0.18)]"><Plus className="h-4 w-4" /></button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {[
                          { key: "all", label: "全部" },
                          { key: "A", label: "A棟" },
                          { key: "B", label: "B棟" },
                        ].map((item) => (
                          <button key={item.key} type="button" onClick={() => setActivitySelectedBuilding(item.key as "all" | BuildingType)} className={`rounded-[14px] border px-2.5 py-1 text-[11px] font-semibold ${gradientButton(activitySelectedBuilding === item.key)}`}>
                            {item.label}
                          </button>
                        ))}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <button type="button" onClick={() => setActivitySelectedFloor("all")} className={`rounded-[14px] border px-2.5 py-1 text-[11px] font-semibold ${gradientButton(activitySelectedFloor === "all")}`}>全部</button>
                        {FLOOR_OPTIONS.map((floor) => (
                          <button key={floor} type="button" onClick={() => setActivitySelectedFloor(floor)} className={`rounded-[14px] border px-2.5 py-1 text-[11px] font-semibold ${gradientButton(activitySelectedFloor === floor)}`}>
                            {floor}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mt-2 space-y-2 rounded-[20px] border border-[#e2d8c8] bg-[#faf6f0] p-2">
                      {filteredActivityRooms.map((room) => (
                        <div key={room.id} className="rounded-[16px] border border-[#e5ddd0] bg-white px-3 py-2 shadow-[0_4px_10px_rgba(84,69,45,0.04)]">
                          <div className="text-[13px] font-semibold text-[#524736]">{roomLabel(room)}</div>
                          <div className="mt-1 grid grid-cols-[1fr_88px_66px_30px] items-start gap-2">
                            <textarea
                              value={room.occupant}
                              onChange={(e) =>
                                setActivities((prev) =>
                                  prev.map((activity) =>
                                    activity.id === selectedActivity.id
                                      ? { ...activity, rooms: activity.rooms.map((targetRoom) => (targetRoom.id === room.id ? { ...targetRoom, occupant: e.target.value } : targetRoom)) }
                                      : activity
                                  )
                                )
                              }
                              className="w-full resize-none overflow-hidden rounded-[14px] border border-[#ddd4c6] bg-[#fdfaf6] px-3 py-2 text-[12px] leading-5 text-[#5f5444] focus:outline-none"
                              rows={Math.max(1, splitGuestLines(room.occupant).length || 1)}
                              placeholder="住宿人"
                            />
                            <select
                              value={room.assignedTo}
                              onChange={(e) =>
                                setActivities((prev) =>
                                  prev.map((activity) =>
                                    activity.id === selectedActivity.id
                                      ? { ...activity, rooms: activity.rooms.map((targetRoom) => (targetRoom.id === room.id ? { ...targetRoom, assignedTo: e.target.value } : targetRoom)) }
                                      : activity
                                  )
                                )
                              }
                              className="h-[46px] rounded-[14px] border border-[#ddd4c6] bg-[#fdfaf6] px-2 text-[12px] text-[#5f5444] focus:outline-none"
                            >
                              <option value="未分配">未分配</option>
                              {staffUsers.map((user) => (
                                <option key={user.id} value={user.name}>{user.name}</option>
                              ))}
                            </select>
                            <div className="pt-3 text-[12px] font-semibold text-[#7c715c]">{roomProgress(room)}%</div>
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
                      {filteredActivityRooms.length === 0 && <div className="py-6 text-center text-sm text-[#a79a86]">目前此分類沒有房間資料</div>}
                    </div>
                  </>
                )}
              </div>
            )}

            {adminView === "staff" && (
              <div className="rounded-[28px] border border-[#e2d8c8] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f3eb_100%)] p-3 shadow-[0_12px_26px_rgba(84,69,45,0.08)]">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <SectionTitle title="打掃人員" sub="點選人員顯示房號與完成度" icon={<Users className="h-4 w-4" />} />
                  <button onClick={openAddStaffModal} className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] text-white shadow-[0_10px_18px_rgba(110,99,67,0.22)]"><UserPlus className="h-4 w-4" /></button>
                </div>
                <div className="space-y-2">
                  {staffUsers.map((user) => {
                    const assignedRooms = latestRooms.filter((room) => room.assignedTo === user.name);
                    const expanded = expandedStaffName === user.name;
                    return (
                      <div key={user.id} className="rounded-[18px] border border-[#e5ddd0] bg-white px-3 py-2 shadow-[0_4px_10px_rgba(84,69,45,0.04)]">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => openEditStaffModal(user)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#efe7d7] text-[#75684f] shadow-sm" title="編輯人員">✎</button>
                          <button onClick={() => setExpandedStaffName((prev) => (prev === user.name ? "" : user.name))} className="flex flex-1 items-center justify-between gap-3 text-left">
                            <div className="min-w-0">
                              <div className="text-[14px] font-semibold text-[#524736]">{user.name}</div>
                              <div className="mt-0.5 truncate text-[11px] text-[#8d8272]">{latestCleaningActivity ? `${formatDate(latestCleaningActivity.date)} ${latestCleaningActivity.name}` : "目前無活動"}</div>
                            </div>
                            <div className="text-[11px] font-semibold text-[#8d8272]">房數 {assignedRooms.length}</div>
                          </button>
                        </div>
                        {expanded && (
                          <div className="mt-2 space-y-1 rounded-[14px] bg-[#f7f3eb] p-2">
                            {assignedRooms.length > 0 ? assignedRooms.map((room) => (
                              <div key={room.id} className="flex items-center justify-between rounded-[12px] bg-white px-2.5 py-1.5 text-[12px] text-[#6c614d]">
                                <span>{roomLabel(room)}</span>
                                <span className="font-semibold">{roomProgress(room)}%</span>
                              </div>
                            )) : <div className="text-center text-[12px] text-[#a79a86]">目前沒有負責房間</div>}
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
                  <SectionTitle title="日曆" sub="點日期查看當日活動；日期固定在格子上方" icon={<CalendarDays className="h-4 w-4" />} />
                  <button onClick={() => openAddActivityModal()} className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] text-white shadow-[0_10px_18px_rgba(110,99,67,0.22)]"><Plus className="h-4 w-4" /></button>
                </div>
                <div className="rounded-[22px] border border-[#e2d8c8] bg-white p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <button onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#efe7d7] text-[#75684f]"><ChevronLeft className="h-4 w-4" /></button>
                    <div className="text-[14px] font-semibold text-[#524736]">{monthLabel(calendarMonth)}</div>
                    <button onClick={() => setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#efe7d7] text-[#75684f]"><ChevronRight className="h-4 w-4" /></button>
                  </div>
                  <div className="grid grid-cols-7 gap-1 pb-1">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <div key={day} className="py-1 text-center text-[11px] font-semibold text-[#8d8272]">{day}</div>)}</div>
                  <div className="grid grid-cols-7 gap-1">
                    {calendarDays.map((day) => {
                      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                      const dayActivities = activitiesByDate.get(key) || [];
                      const isCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                      const isToday = isSameDate(day, new Date(2026, 3, 20));
                      return (
                        <button key={key} onClick={() => setCalendarSheetDate(key)} className={`min-h-[92px] rounded-[14px] border px-1.5 py-1.5 text-left ${isCurrentMonth ? "border-[#e2d8c8] bg-white" : "border-[#ece3d7] bg-[#faf6f0] text-[#b1a691]"}`}>
                          <div className="flex justify-start"><span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${isToday ? "bg-[#8d8462] text-white" : isCurrentMonth ? "text-[#524736]" : "text-[#b1a691]"}`}>{day.getDate()}</span></div>
                          <div className="mt-1 space-y-0.5">{dayActivities.slice(0, 3).map((activity) => <div key={activity.id} className={`truncate rounded-[8px] px-1.5 py-0.5 text-[10px] ${activity.requiresCleaning ? "bg-[#efe7d7] text-[#8a7756]" : "bg-[#f3ede3] text-[#8b7f6b]"}`}>{activity.name.slice(0, 3)}</div>)}</div>
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

      {viewMode === "admin" && (
        <div className="fixed inset-x-0 bottom-0 border-t border-[#e2d8c8] bg-[#fcfaf6]/96 px-3 py-3 shadow-[0_-10px_24px_rgba(84,69,45,0.10)] backdrop-blur">
          <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
            <button onClick={() => setAdminView("activity")} className={`rounded-[16px] border px-2 py-2 text-[11px] font-semibold ${gradientButton(adminView === "activity")}`}>活動列表</button>
            <button onClick={() => setAdminView("staff")} className={`rounded-[16px] border px-2 py-2 text-[11px] font-semibold ${gradientButton(adminView === "staff")}`}>打掃人員</button>
            <button onClick={() => setAdminView("calendar")} className={`rounded-[16px] border px-2 py-2 text-[11px] font-semibold ${gradientButton(adminView === "calendar")}`}>日曆</button>
            <button onClick={() => setAdminView("overview")} className={`rounded-[16px] border px-2 py-2 text-[11px] font-semibold ${gradientButton(adminView === "overview")}`}>現況</button>
          </div>
        </div>
      )}

      {calendarSheetDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/40 p-4" onClick={() => setCalendarSheetDate("") }>
          <div className="w-full max-w-md rounded-[24px] bg-white p-4 shadow-[0_20px_40px_rgba(15,23,42,0.18)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[16px] font-semibold text-[#4f4435]">{formatDate(calendarSheetDate)} 活動</div>
              <button type="button" onClick={() => openAddActivityModal(calendarSheetDate)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] text-white shadow-[0_8px_16px_rgba(110,99,67,0.22)]"><Plus className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 space-y-2">
              {(activitiesByDate.get(calendarSheetDate) || []).length > 0 ? (activitiesByDate.get(calendarSheetDate) || []).map((activity) => (
                <div key={activity.id} className="rounded-[18px] border border-[#e4dccf] bg-[#faf6f0] px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-[#524736]">{formatDate(activity.date)} {activity.name}</div>
                      <div className="mt-1 text-[11px] text-[#8d8272]">住宿人數：{activity.guestCount || "0"}</div>
                      <div className="mt-0.5 text-[11px] text-[#8d8272]">打掃：{activity.requiresCleaning ? "需要" : "不需"}</div>
                    </div>
                    <button type="button" onClick={() => openEditActivityModal(activity)} className="shrink-0 rounded-[12px] bg-[#efe7d7] px-2.5 py-1 text-[11px] font-semibold text-[#8a7756]">修改</button>
                  </div>
                </div>
              )) : <div className="rounded-[18px] border border-dashed border-[#e4dccf] px-3 py-5 text-center text-[12px] text-[#a79a86]">當日沒有活動</div>}
            </div>
          </div>
        </div>
      )}

      {showActivityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-4" onClick={() => setShowActivityModal(false)}>
          <div className="w-full max-w-sm rounded-[28px] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.14)]" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold text-[#4f4435]">{activityModalMode === "edit" ? "修改活動" : "新增活動"}</div>
            <div className="mt-3 space-y-3">
              <input type="date" value={activityDate} onChange={(e) => setActivityDate(e.target.value)} className="w-full rounded-[18px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]" />
              <input value={activityName} onChange={(e) => setActivityName(e.target.value)} className="w-full rounded-[18px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]" placeholder="活動名稱" />
              <input value={activityContact} onChange={(e) => setActivityContact(e.target.value)} className="w-full rounded-[18px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]" placeholder="聯絡人" />
              <label className="flex items-center justify-between rounded-[18px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]"><span>需打掃</span><input type="checkbox" checked={activityNeedsCleaning} onChange={(e) => setActivityNeedsCleaning(e.target.checked)} className="accent-[#8b8462]" /></label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowActivityModal(false)} className="rounded-[20px] bg-[#ece5d9] px-3 py-2 text-sm font-medium text-[#5f5444]">取消</button>
              <button onClick={saveActivityModal} className="rounded-[20px] bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] px-3 py-2 text-sm font-medium text-white">儲存</button>
            </div>
          </div>
        </div>
      )}

      {showRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-4" onClick={() => setShowRoomModal(false)}>
          <div className="w-full max-w-sm rounded-[28px] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.14)]" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold text-[#4f4435]">新增房間</div>
            <div className="mt-3 space-y-3">
              <select value={newRoomBuilding} onChange={(e) => setNewRoomBuilding(e.target.value as BuildingType)} className="w-full rounded-[20px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]"><option value="A">A棟</option><option value="B">B棟</option></select>
              <select value={newRoomFloor} onChange={(e) => setNewRoomFloor(e.target.value as FloorType)} className="w-full rounded-[20px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]">{FLOOR_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}</select>
              <input value={newRoomNo} onChange={(e) => setNewRoomNo(e.target.value)} className="w-full rounded-[20px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]" placeholder="房號，例如 201" />
              <textarea value={newOccupant} onChange={(e) => setNewOccupant(e.target.value)} className="min-h-[60px] w-full resize-none rounded-[20px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm leading-5 text-[#5f5444]" placeholder="住宿人" rows={3} />
              <select value={newRoomStaff} onChange={(e) => setNewRoomStaff(e.target.value)} className="w-full rounded-[20px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]"><option value="未分配">未分配</option>{staffUsers.map((user) => <option key={user.id} value={user.name}>{user.name}</option>)}</select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowRoomModal(false)} className="rounded-[20px] bg-[#ece5d9] px-3 py-2 text-sm font-medium text-[#5f5444]">取消</button>
              <button onClick={saveNewRoom} className="rounded-[20px] bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] px-3 py-2 text-sm font-medium text-white">新增</button>
            </div>
          </div>
        </div>
      )}

      {showStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-4" onClick={() => setShowStaffModal(false)}>
          <div className="w-full max-w-sm rounded-[28px] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.14)]" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold text-[#4f4435]">{staffModalMode === "edit" ? "編輯打掃人員" : "新增打掃人員"}</div>
            <div className="mt-3 space-y-3">
              <input value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} className="w-full rounded-[20px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]" placeholder="人員姓名" />
              <input value={newStaffPin} onChange={(e) => setNewStaffPin(e.target.value)} className="w-full rounded-[20px] border border-[#ddd3c4] bg-[#fffdfa] px-3 py-2.5 text-sm text-[#5f5444]" placeholder="登入密碼" type="password" />
              <div className="rounded-[16px] bg-[#f7f1e8] px-3 py-2 text-[11px] leading-5 text-[#8d8272]">{staffModalMode === "edit" ? "修改後，切換帳號下拉選單與活動列表打掃人員名稱會同步更新。" : "新增後，該人員會同步出現在切換帳號下拉選單與活動列表的打掃人員選單中。"}</div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowStaffModal(false)} className="rounded-[20px] bg-[#ece5d9] px-3 py-2 text-sm font-medium text-[#5f5444]">取消</button>
              <button onClick={saveStaffModal} className="rounded-[20px] bg-[linear-gradient(135deg,#8b8462_0%,#9a946f_52%,#b5ae86_100%)] px-3 py-2 text-sm font-medium text-white">儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}