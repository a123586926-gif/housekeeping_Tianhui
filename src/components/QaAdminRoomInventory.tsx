import { useMemo, useState } from "react";
import { createQaRoom, deleteQaRoom, type DbEvent } from "../lib/housekeepingApi";

type Room = {
 id:number;event_id:number;building:string;floor:string;room_no:string;
 assigned_to:string;floor_photo?:string|null;bathroom_photo?:string|null;final_photo?:string|null;
};
type Props = {events:DbEvent[];rooms:Room[];onUpdated:()=>Promise<void>};
const FLOORS = ["2F","3F","5F","6F","7F","RF"] as const;
const PREFIX = "【權限驗收】";

export default function QaAdminRoomInventory({events,rooms,onUpdated}:Props) {
 const [eventId,setEventId]=useState("");
 const [building,setBuilding]=useState<"A"|"B">("A");
 const [floor,setFloor]=useState<typeof FLOORS[number]>("2F");
 const [roomNo,setRoomNo]=useState("209");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const qaEvents=useMemo(()=>events.filter(e=>e.event_name.startsWith(PREFIX))
   .sort((a,b)=>a.event_date.localeCompare(b.event_date)||a.id-b.id),[events]);
 const selected=qaEvents.find(e=>String(e.id)===eventId);
 const related=rooms.filter(r=>r.event_id===selected?.id)
   .sort((a,b)=>a.building.localeCompare(b.building)||a.floor.localeCompare(b.floor)||a.room_no.localeCompare(b.room_no));
 const roomValid=/^[A-Za-z0-9]{1,8}$/.test(roomNo);
 const exists=related.some(r=>r.building===building&&r.floor===floor&&r.room_no===roomNo.toUpperCase());
 async function add(){
   if(!selected||!roomValid||exists||busy)return;
   setBusy(true);setMessage("");
   try{
     const created=await createQaRoom({eventId:selected.id,building,floor,roomNo:roomNo.toUpperCase()});
     await onUpdated();
     setMessage(`房間已建立：#${created.roomId}。系統已建立原始四大項清潔清單。`);
   }catch(e){setMessage(e instanceof Error?e.message:"新增房間失敗");}
   finally{setBusy(false);}
 }
 async function remove(room:Room){
   if(busy||!selected||room.event_id!==selected.id)return;
   if(!window.confirm(`刪除「${selected.event_name}」的 ${room.building}棟 ${room.floor} ${room.room_no} 房？不可還原。`))return;
   setBusy(true);setMessage("");
   try{
     await deleteQaRoom(room.id);
     await onUpdated();
     setMessage(`房間 #${room.id} 已刪除；其他活動和有照片的房間不受影響。`);
   }catch(e){setMessage(e instanceof Error?e.message:"刪除房間失敗");}
   finally{setBusy(false);}
 }
 return <section className="space-y-3 rounded-[24px] border border-[#d8c9af] bg-[#f9f4ec] p-4">
   <div><h2 className="text-[16px] font-semibold text-[#514735]">管理員｜活動房間新增及刪除</h2>
   <p className="mt-1 text-xs text-[#847663]">只操作標記為「{PREFIX}」的虛構活動。原始 A／B／C 活動不可修改；已有照片的房間禁止刪除。</p></div>
   <label className="block text-sm">選擇測試活動
     <select value={eventId} onChange={e=>{setEventId(e.target.value);setMessage("");}}
       className="mt-1 w-full rounded-xl border bg-white p-2.5">
       <option value="">請選擇活動</option>
       {qaEvents.map(e=><option key={e.id} value={e.id}>{e.event_date}　{e.event_name}（#{e.id}）</option>)}
     </select>
   </label>
   {selected&&<>
     <div className="grid grid-cols-3 gap-2">
       <label className="text-xs">棟別
         <select value={building} onChange={e=>setBuilding(e.target.value as "A"|"B")} className="mt-1 w-full rounded-lg border bg-white p-2 text-sm">
           <option>A</option><option>B</option>
         </select>
       </label>
       <label className="text-xs">樓層
         <select value={floor} onChange={e=>setFloor(e.target.value as typeof FLOORS[number])} className="mt-1 w-full rounded-lg border bg-white p-2 text-sm">
           {FLOORS.map(f=><option key={f}>{f}</option>)}
         </select>
       </label>
       <label className="text-xs">房號
         <input value={roomNo} maxLength={8} onChange={e=>setRoomNo(e.target.value.toUpperCase())} className="mt-1 w-full rounded-lg border bg-white p-2 text-sm"/>
       </label>
     </div>
     {exists&&<p className="text-xs text-red-700">這個活動已有相同的棟別、樓層及房號。</p>}
     <button disabled={busy||!roomValid||exists} onClick={()=>void add()} className="w-full rounded-xl bg-[#8d8768] p-2.5 text-sm text-white disabled:opacity-50">新增測試房間</button>
     <div className="border-t border-[#e2d8c8] pt-3">
       <h3 className="text-sm font-semibold">此活動現有房間（{related.length} 間）</h3>
       <div className="mt-2 max-h-80 space-y-2 overflow-y-auto">
       {related.length===0&&<p className="text-xs text-[#847663]">沒有房間</p>}
       {related.map(room=>{
         const photos=Boolean(room.floor_photo||room.bathroom_photo||room.final_photo);
         return <div key={room.id} className="flex items-center justify-between gap-2 rounded-xl border bg-white p-2.5 text-sm">
           <div><strong>{room.building}棟 {room.floor} {room.room_no}</strong>
             <p className="text-xs text-[#847663]">#{room.id}｜{room.assigned_to}{photos?"｜已有照片":""}</p>
           </div>
           <button disabled={busy||photos} onClick={()=>void remove(room)}
             className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 disabled:opacity-40">
             {photos?"不可刪":"刪除"}
           </button>
         </div>;
       })}
       </div>
     </div>
   </>}
   {message&&<p role="status" className="rounded-xl bg-white p-2.5 text-sm">{message}</p>}
 </section>;
}
