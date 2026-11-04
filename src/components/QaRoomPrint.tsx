import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";

type PrintableRoom = {id:number;event_id:number;building:string;floor:string;room_no:string;occupant?:string};
type Event = {id:number;event_date:string;event_name:string};
type Props = { rooms:PrintableRoom[]; events:Event[] };

function escapeHtml(value:string):string {
  return value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}
function guestsOf(value:string):string[] {
  return value.split(/\n|、|,|，/).map(item=>item.trim()).filter(Boolean);
}
function pageForRoom(room:PrintableRoom):string {
  const guests=guestsOf(room.occupant||"");
  const twoColumns=guests.length>6;
  const row=(guest:string)=>`<div class="guest-row">${escapeHtml(guest)}</div>`;
  const single=guests.length?guests.map(row).join(""):row("空房");
  const double=`<div class="guest-grid-two"><div class="guest-col">${guests.slice(0,4).map(row).join("")}</div><div class="guest-col">${guests.slice(4,8).map(row).join("")}</div></div>`;
  return `<section class="a4-page"><div class="room-title">${escapeHtml(room.building+"棟"+room.room_no+"房")}</div><div class="guest-area">${twoColumns?double:`<div class="guest-grid-one">${single}</div>`}</div></section>`;
}
function printDocument(rooms:PrintableRoom[]):string {
  // Mirrors the original App.tsx A4 room sign typography and breakpoints.
  return `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"/>
    <meta name="referrer" content="no-referrer"/><title>天惠會館｜房間列印（測試）</title><style>
    @page{size:A4 portrait;margin:0}
    html,body{margin:0;padding:0;background:white}
    body{font-family:"DFKai-SB","BiauKai","標楷體","KaiTi",serif;color:#000}
    .a4-page{width:210mm;height:297mm;page-break-after:always;break-after:page;background:#fff;
      display:flex;flex-direction:column;align-items:center;padding:18mm 14mm 0;box-sizing:border-box}
    .a4-page:last-child{page-break-after:auto;break-after:auto}
    .room-title{width:100%;text-align:center;font-size:34mm;line-height:1.05;font-weight:700;margin-bottom:20mm}
    .guest-area{width:100%;flex:1;display:flex;justify-content:center;align-items:flex-start}
    .guest-grid-one{width:100%;max-width:120mm;display:flex;flex-direction:column;align-items:center;gap:9mm}
    .guest-grid-two{width:100%;max-width:170mm;display:grid;grid-template-columns:1fr 1fr;column-gap:12mm;align-items:start}
    .guest-col{display:flex;flex-direction:column;align-items:center;gap:9mm}
    .guest-row{width:100%;text-align:center;font-size:23mm;line-height:1.1;white-space:nowrap}
    @media screen{body{background:#e7e7e7}.a4-page{margin:12px auto;box-shadow:0 4px 18px #0002}}
    </style></head><body>${rooms.map(pageForRoom).join("")}</body></html>`;
}

export default function QaRoomPrint({rooms,events}:Props) {
  const [eventId,setEventId]=useState("");
  const [selected,setSelected]=useState<number[]>([]);
  const [error,setError]=useState("");
  const [preview,setPreview]=useState(false);
  const [printRoom,setPrintRoom]=useState<number|null>(null);
  const event=events.find(e=>String(e.id)===eventId);
  const related=useMemo(()=>rooms.filter(r=>r.event_id===event?.id)
    .sort((a,b)=>a.building.localeCompare(b.building)||a.floor.localeCompare(b.floor)||a.room_no.localeCompare(b.room_no)),[rooms,event?.id]);
  const chosen=related.filter(room=>selected.includes(room.id));
  const tooMany=chosen.some(room=>guestsOf(room.occupant||"").length>8);

  useEffect(()=>{
    if(!preview)return;
    const finish=()=>setPreview(false);
    window.addEventListener("afterprint",finish);
    return ()=>window.removeEventListener("afterprint",finish);
  },[preview]);

  function print(target:PrintableRoom[]) {
    if(target.length===0){setError("請先選擇房間");return;}
    const invalid=target.filter(r=>guestsOf(r.occupant||"").length>8);
    if(invalid.length){setError("有房間超過 8 位入住者，原版版型無法完整呈現，請先調整。");return;}
    setError("");
    const doc=printDocument(target);
    const popup=window.open("","_blank","width=900,height=1200");
    if(!popup){setError("無法開啟列印預覽，請允許瀏覽器彈出視窗");return;}
    popup.document.open();
    popup.document.write(doc);
    popup.document.close();
    popup.focus();
    popup.onload=()=>popup.print();
  }

  return <section className="space-y-3 rounded-[24px] border border-[#d8c9af] bg-[#f9f4ec] p-4">
    <h2 className="flex items-center gap-2 text-[16px] font-semibold"><Printer className="h-4 w-4"/>A4 房間單張／批次列印</h2>
    <p className="text-xs text-[#847663]">依原版 A4 版型：6 人以下單欄、7／8 人雙欄；每間房一張。列印僅限管理員，且使用目前測試資料庫的房間。</p>
    <label className="block text-sm">選擇活動
      <select value={eventId} onChange={e=>{setEventId(e.target.value);setSelected([]);setError("");}}
        className="mt-1 w-full rounded-xl border bg-white p-2.5">
        <option value="">請選擇活動</option>
        {events.slice().sort((a,b)=>a.event_date.localeCompare(b.event_date)).map(e=><option key={e.id} value={e.id}>{e.event_date} · {e.event_name}</option>)}
      </select>
    </label>
    {event&&<>
      <div className="flex flex-wrap justify-between gap-2 text-xs">
        <span>已勾選 {chosen.length} / {related.length} 間</span>
        <div className="flex gap-2">
          <button className="underline" onClick={()=>setSelected(related.map(r=>r.id))}>全部勾選</button>
          <button className="underline" onClick={()=>setSelected([])}>全部清除</button>
        </div>
      </div>
      <div className="max-h-80 space-y-1.5 overflow-y-auto">
        {related.length===0&&<p className="text-sm text-[#847663]">此活動沒有房間</p>}
        {related.map(room=>{
          const count=guestsOf(room.occupant||"").length;
          return <div key={room.id} className="flex items-center gap-2 rounded-xl border bg-white p-2.5 text-sm">
            <input type="checkbox" checked={selected.includes(room.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,room.id]:old.filter(id=>id!==room.id))}
              className="h-4 w-4 accent-[#8d8768]" aria-label={`選擇房間 ${room.room_no}`}/>
            <div className="min-w-0 flex-1"><strong>{room.building}棟 {room.floor} {room.room_no}</strong>
              <p className="text-xs text-[#847663]">{count===0?"空房":`${count} 人 · ${count>6?"雙欄":"單欄"}`}</p>
            </div>
            <button disabled={count>8} onClick={()=>print([room])} className="rounded-lg border px-2 py-1.5 text-xs disabled:opacity-40">單張列印</button>
          </div>;
        })}
      </div>
      {tooMany&&<p className="text-xs text-red-700">已選房間有超過 8 人的資料，原版 A4 版型無法完整列印。</p>}
      <button disabled={!chosen.length||tooMany} onClick={()=>print(chosen)}
        className="w-full rounded-xl bg-[#8d8768] p-2.5 text-sm text-white disabled:opacity-50">列印已勾選房間（每間 A4 一頁）</button>
    </>}
    {error&&<p role="alert" className="rounded-xl border border-red-200 bg-white p-3 text-sm text-red-700">{error}</p>}
  </section>;
}
