import { useState } from "react";
import { updateRoomChecklist, type ChecklistUpdate } from "../lib/housekeepingApi";

export type WorkChecklistItem = {
  id: string;
  label?: string;
  description?: string;
  done: boolean;
  photo: boolean;
  requiredPhoto?: boolean;
  subItems: Array<{id: string; label?: string; done: boolean}>;
};
export type WorkRoom = {
  id: number; building: string; floor: string; room_no: string;
  assigned_to: string; progress?: number; status: string; checklist: WorkChecklistItem[];
};
type Props = {
  rooms: WorkRoom[];
  editable: boolean;
  onUpdated: () => Promise<void>;
};

function toPayload(items: WorkChecklistItem[]): ChecklistUpdate[] {
  return items.map(item => ({
    id: item.id, done: item.done, photo: item.photo,
    subItems: item.subItems.map(sub => ({id: sub.id,done: sub.done})),
  }));
}

export default function QaRoomChecklist({rooms,editable,onUpdated}:Props) {
  const [selectedId,setSelectedId] = useState("");
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const selected = rooms.find(room => String(room.id) === selectedId);
  const list = selected?.checklist || [];
  const complete = list.filter(i=>i.done).length;

  async function commit(next: WorkChecklistItem[]) {
    if (!editable || !selected || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await updateRoomChecklist(selected.id,toPayload(next));
      await onUpdated();
      setMessage("清潔進度已由伺服器驗證並儲存；重新整理後仍會保留。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法儲存清潔進度");
    } finally {
      setBusy(false);
    }
  }

  function toggleItem(id: string) {
    const original = list.find(item => item.id === id);
    if(!original || (original.requiredPhoto && !original.photo && !original.done)) {
      setMessage("此清潔項目需先上傳照片才能標記完成。");
      return;
    }
    void commit(list.map(item => item.id === id ? {...item,done:!item.done} : item));
  }

  function toggleSub(itemId:string,subId:string) {
    void commit(list.map(item => item.id !== itemId ? item : ({
      ...item,
      subItems:item.subItems.map(sub=>sub.id === subId ? {...sub,done:!sub.done} : sub),
    })));
  }

  return <section className="space-y-3 rounded-[24px] border border-[#d8c9af] bg-[#f9f4ec] p-4">
    <div>
      <h2 className="text-base font-semibold">房間清潔工作清單</h2>
      <p className="mt-1 text-xs text-[#847663]">{editable
        ? "僅編輯分配給自己的房間；勾選後由伺服器驗證並儲存"
        : "管理員查看全部房間清潔狀態；此區為唯讀"}
      </p>
    </div>
    <label className="block text-sm">選擇房間
      <select className="mt-1 w-full rounded-xl border border-[#ddd4c6] bg-white p-2.5"
        value={selectedId} onChange={e=>{setSelectedId(e.target.value);setMessage("");}}>
        <option value="">請選擇測試房間</option>
        {rooms.map(room=><option key={room.id} value={room.id}>
          {room.building}棟 {room.floor} {room.room_no}｜{room.assigned_to}
        </option>)}
      </select>
    </label>
    {selected && <div className="space-y-3">
      <div className="rounded-xl bg-white p-3">
        <div className="flex justify-between text-sm font-medium">
          <span>房間 {selected.room_no} 清潔進度</span>
          <span>{complete} / {list.length} 項（{selected.progress??0}%）</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ede4d5]">
          <div className="h-full rounded-full bg-[#8d8768]" style={{width:`${Math.max(0,Math.min(100,selected.progress??0))}%`}} />
        </div>
      </div>
      {list.map(item=><div key={item.id} className="rounded-xl border border-[#e2d8c8] bg-white p-3">
        <div className="flex items-start gap-2.5">
          <input type="checkbox" checked={item.done}
            disabled={!editable||busy||Boolean(item.requiredPhoto&&!item.photo&&!item.done)}
            onChange={()=>toggleItem(item.id)}
            aria-label={item.label||item.id}
            className="mt-1 h-4 w-4 accent-[#8d8768]"/>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{item.label||item.id}</div>
            {item.description && <p className="mt-1 text-xs text-[#847663]">{item.description}</p>}
            {item.requiredPhoto && <p className="mt-1 text-xs text-[#847663]">
              照片：{item.photo?"已上傳":"尚未上傳，不能標記完成"}
            </p>}
          </div>
        </div>
        {item.subItems.length>0 && <div className="ml-6 mt-3 space-y-2 border-l border-[#e5d9c7] pl-3">
          {item.subItems.map(sub=><label key={sub.id} className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="accent-[#8d8768]" checked={sub.done}
              disabled={!editable||busy} onChange={()=>toggleSub(item.id,sub.id)}/>
            <span>{sub.label||sub.id}</span>
          </label>)}
        </div>}
      </div>)}
      {list.length===0&&<p className="text-sm text-[#847663]">目前沒有清潔項目</p>}
    </div>}
    {message&&<p role="status" className="rounded-xl bg-white p-2.5 text-sm">{message}</p>}
  </section>;
}
