import { useEffect, useMemo, useState } from "react";
import { getCleaners, type CleanerInfo } from "../lib/housekeepingApi";

type Room = {id:number;event_id:number;cleaner_id?:number|null;assigned_to:string;status:string;progress?:number};
type Props = { rooms:Room[]; events:{id:number;event_name:string;event_date:string}[] };

export default function QaStaffProgress({rooms,events}:Props) {
  const [staff,setStaff]=useState<CleanerInfo[]>([]);
  const [error,setError]=useState("");
  const [eventId,setEventId]=useState("all");
  const [expanded,setExpanded]=useState<number|null>(null);
  useEffect(()=>{
    let active=true;
    void getCleaners().then(data=>{if(active){setStaff(data);setError("");}})
      .catch(reason=>{if(active)setError(reason instanceof Error?reason.message:"房務人員讀取失敗");});
    return ()=>{active=false;};
  },[]);
  const filtered=useMemo(()=>rooms.filter(r=>eventId==="all"||String(r.event_id)===eventId),[rooms,eventId]);
  const summary=useMemo(()=>staff.map(person=>{
    // Identity must be matched by stable server-provided cleaner_id, not by editable name.
    const assigned=filtered.filter(room=>room.cleaner_id===person.id);
    const completed=assigned.filter(room=>room.status==="completed").length;
    const started=assigned.filter(room=>room.status==="in_progress").length;
    const avg=assigned.length?Math.round(assigned.reduce((sum,r)=>sum+(r.progress||0),0)/assigned.length):0;
    return {person,assigned,completed,started,avg};
  }),[staff,filtered]);
  const unassigned=filtered.filter(r=>r.cleaner_id==null);

  return <section className="space-y-3 rounded-[24px] border border-[#d8c9af] bg-[#f9f4ec] p-4">
    <h2 className="text-[16px] font-semibold text-[#514735]">房務人員工作統計</h2>
    <p className="text-xs text-[#847663]">統計只使用伺服器授權讀取的測試房間，依人員 ID 彙總；房務資料與 PIN 不會公開。</p>
    <label className="block text-sm">統計活動
      <select value={eventId} onChange={e=>{setEventId(e.target.value);setExpanded(null);}}
        className="mt-1 w-full rounded-xl border bg-white p-2.5">
        <option value="all">全部活動</option>
        {events.slice().sort((a,b)=>a.event_date.localeCompare(b.event_date)).map(e=><option key={e.id} value={e.id}>{e.event_date} · {e.event_name}</option>)}
      </select>
    </label>
    {error&&<p role="alert" className="rounded-xl border border-red-200 bg-white p-3 text-sm text-red-700">{error}</p>}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[
        ["全部房間",filtered.length],
        ["已完成",filtered.filter(r=>r.status==="completed").length],
        ["未分配",unassigned.length],
        ["參與人員",summary.filter(x=>x.assigned.length>0).length],
      ].map(([label,value])=><div key={label} className="rounded-xl bg-white p-3 text-center">
        <div className="text-xl font-semibold tabular-nums">{value}</div>
        <p className="mt-1 text-xs text-[#847663]">{label}</p>
      </div>)}
    </div>
    {summary.map(({person,assigned,completed,started,avg})=><div key={person.id} className="rounded-xl border border-[#e2d8c8] bg-white p-3">
      <button onClick={()=>setExpanded(expanded===person.id?null:person.id)} className="w-full text-left"
        aria-expanded={expanded===person.id}>
        <div className="flex justify-between gap-2">
          <span className="text-sm font-semibold">{person.name}{!person.is_active?"（停用）":""}</span>
          <span className="text-xs text-[#847663]">{completed}/{assigned.length} 間完成</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ede4d5]">
          <div className="h-full bg-[#8d8768]" style={{width:`${avg}%`}} />
        </div>
        <p className="mt-2 text-xs text-[#847663]">平均清潔進度 {avg}% · 進行中 {started} · 未開始 {assigned.length-completed-started}</p>
      </button>
      {expanded===person.id&&<div className="mt-3 space-y-1 border-t border-[#e2d8c8] pt-2">
        {assigned.length===0&&<p className="text-xs text-[#847663]">沒有指派房間</p>}
        {assigned.map(room=><p key={room.id} className="flex justify-between text-xs">
          <span>房間 #{room.id}</span><span>{room.progress||0}% · {room.status==="completed"?"已完成":room.status==="in_progress"?"進行中":"未開始"}</span>
        </p>)}
      </div>}
    </div>)}
    {unassigned.length>0&&<p className="rounded-xl bg-white p-2.5 text-xs text-[#847663]">未分配房間：{unassigned.map(room=>`#${room.id}`).join("、")}</p>}
  </section>;
}
