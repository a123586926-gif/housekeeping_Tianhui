import { useMemo, useState } from "react";
import { CalendarDays, ClipboardList, Home, Users, ShieldCheck, Camera, BarChart3, ArrowLeft } from "lucide-react";
import SharedActivityCalendar from "./SharedActivityCalendar";
import QaAdminEvents from "./QaAdminEvents";
import QaAdminRoomAssignments from "./QaAdminRoomAssignments";
import QaAdminCleaners from "./QaAdminCleaners";
import QaChangePin from "./QaChangePin";
import QaPhotoUpload from "./QaPhotoUpload";
import QaRoomChecklist from "./QaRoomChecklist";
import type { AuthenticatedUser } from "../lib/authSession";
import type { CalendarEvent, DbEvent } from "../lib/housekeepingApi";
import type { WorkRoom } from "./QaRoomChecklist";

type Overview = {events: DbEvent[]; calendarEvents: CalendarEvent[]; eventRooms: WorkRoom[]};
type Page = "home"|"calendar"|"activities"|"rooms"|"staff"|"photos"|"account";
type Props = {
  user: AuthenticatedUser;
  expiry: string;
  overview: Overview;
  onRefresh: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onPinChanged: () => Promise<void>;
  children?: React.ReactNode;
};

const UI = {
  shell: "rounded-[28px] border border-[#e2d8c8] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f3eb_100%)] p-3 shadow-[0_12px_26px_rgba(84,69,45,0.08)]",
  primary: "rounded-[16px] border border-[#d9cfbf] bg-[linear-gradient(180deg,#fffdfa_0%,#f2ecdf_100%)] px-3 py-2 text-sm font-semibold text-[#6a5f4a]"
};
const ADMIN_PAGES: Page[] = ["home","calendar","activities","rooms","staff","account"];
const CLEANER_PAGES: Page[] = ["home","calendar","rooms","photos","account"];
const labels: Record<Page,string> = {
  home:"現況",calendar:"日曆",activities:"活動列表",rooms:"房間",staff:"打掃人員",
  photos:"照片",account:"我的帳號",
};
const icons = {home:Home,calendar:CalendarDays,activities:ClipboardList,
  rooms:ClipboardList,staff:Users,photos:Camera,account:ShieldCheck};

export default function SecureHousekeepingDashboard({user,expiry,overview,onRefresh,onSignOut,onPinChanged,children}:Props) {
  const [page,setPage] = useState<Page>("home");
  const isAdmin = user.role === "admin";
  const pages = isAdmin ? ADMIN_PAGES : CLEANER_PAGES;
  const rooms = overview.eventRooms;
  const stats = useMemo(()=>{
    const completed=rooms.filter(room=>room.status==="completed").length;
    const started=rooms.filter(room=>room.status==="in_progress").length;
    return {completed,started,pending:rooms.length-completed-started};
  },[rooms]);
  const photoRooms = rooms.filter(room=>room.checklist?.some(item=>item.requiredPhoto));

  return <div className="space-y-3 pb-20">
    <header className={UI.shell}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight text-[#4f4435]">天惠會館｜房務管理</h1>
          <p className="mt-0.5 text-xs text-[#8e8475]">獨立安全測試版 · {isAdmin?"管理員":"房務人員"}：{user.name}</p>
        </div>
        <button type="button" className={UI.primary} onClick={()=>void onSignOut()}>登出</button>
      </div>
    </header>

    <div className={UI.shell}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-[#efe7d7] text-[#8a7756]">
          {(() => {const Icon=icons[page];return <Icon className="h-4 w-4"/>;})()}
        </span>
        <div>
          <h2 className="text-[16px] font-semibold tracking-tight">{labels[page]}</h2>
          <p className="text-[11px] text-[#8e8475]">{isAdmin?"查看全部房務資料與管理員操作":"日曆共用，僅可修改自己被指派房間"}</p>
        </div>
      </div>

      {page==="home"&&<div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["活動",overview.calendarEvents.length],
            [isAdmin?"全部房間":"我的房間",rooms.length],
            ["已完成",stats.completed],
            ["尚未完成",stats.pending+stats.started],
          ].map(([label,value])=><div key={label} className="rounded-[19px] border border-[#e2d8c8] bg-white p-3 text-center">
            <div className="text-2xl font-semibold tabular-nums text-[#746b50]">{value}</div>
            <div className="mt-1 text-xs text-[#8e8475]">{label}</div>
          </div>)}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-[#e5eee3] p-2 text-[#406747]">已完成 {stats.completed}</div>
          <div className="rounded-xl bg-[#f7eddc] p-2 text-[#8a6427]">進行中 {stats.started}</div>
          <div className="rounded-xl bg-[#f0ede9] p-2 text-[#766a5b]">未開始 {stats.pending}</div>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">近期活動</h3>
          {overview.calendarEvents.slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5).map(event=>
            <div key={event.id} className="flex justify-between gap-2 rounded-xl border border-[#e2d8c8] bg-white px-3 py-2 text-sm">
              <span className="truncate">{event.name}</span><span className="shrink-0 text-xs text-[#8e8475]">{event.date}</span>
            </div>)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={()=>setPage("rooms")} className={UI.primary}>查看房間工作</button>
          <button onClick={()=>setPage("calendar")} className={UI.primary}>查看共用日曆</button>
        </div>
      </div>}

      {page==="calendar"&&<SharedActivityCalendar events={overview.calendarEvents} isAdmin={isAdmin}/>}
      {page==="activities"&&isAdmin&&<QaAdminEvents events={overview.events} onUpdated={onRefresh}/>}
      {page==="rooms"&&<div className="space-y-3">
        <QaRoomChecklist rooms={rooms} editable={!isAdmin} onUpdated={onRefresh}/>
        {isAdmin&&<QaAdminRoomAssignments rooms={rooms.map(room=>({
          ...room,occupant:(room as WorkRoom & {occupant?:string}).occupant||""
        }))} onUpdated={onRefresh}/>}
      </div>}
      {page==="staff"&&isAdmin&&<QaAdminCleaners/>}
      {page==="photos"&&!isAdmin&&<QaPhotoUpload rooms={photoRooms} onUploaded={onRefresh}/>}
      {page==="account"&&<div className="space-y-3">
        <div className="rounded-xl border border-[#e2d8c8] bg-white p-3 text-sm">
          <div>登入帳號：{user.name}</div>
          <div className="mt-1 text-xs text-[#8e8475]">固定到期時間：{new Date(expiry).toLocaleString("zh-TW")}</div>
          <div className="mt-1 text-xs text-[#8e8475]">PIN、憑證和權限不保存在瀏覽器的本機儲存空間</div>
        </div>
        {!isAdmin&&user.name.startsWith("【權限驗收】")&&<QaChangePin onChanged={onPinChanged}/>}
        {children}
      </div>}
    </div>

    <nav aria-label="房務主選單" className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e2d8c8] bg-[#fcfaf6]/95 px-2 py-2 shadow-[0_-10px_24px_rgba(84,69,45,0.10)] backdrop-blur">
      <div className="mx-auto flex max-w-3xl justify-around gap-1">
        {pages.map(item=>{
          const Icon=icons[item];
          return <button type="button" key={item} onClick={()=>setPage(item)}
            aria-current={page===item?"page":undefined}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[13px] px-1 py-2 text-[10px] font-semibold ${page===item?"bg-[#8d8768] text-white":"text-[#736951]"}`}>
            <Icon className="h-4 w-4"/><span className="truncate">{labels[item]}</span>
          </button>;
        })}
      </div>
    </nav>
  </div>;
}
