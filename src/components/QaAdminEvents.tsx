import { useState } from "react";
import {
  createActivity, editActivity, deleteActivity,
  type ActivityInput, type DbEvent,
} from "../lib/housekeepingApi";

const TAG = "【權限驗收】";
const initialDate = "2026-11-20";

type Props = { events: DbEvent[]; onUpdated: () => Promise<void> };

function freshInput(): ActivityInput {
  return {
    event_date: initialDate,
    event_name: `${TAG}活動測試`,
    event_type: "一般活動",
    notes: "",
  };
}

/**
 * Isolated QA admin controls. Only test-tagged rows may be edited/deleted
 * through this panel; server independently enforces admin authorization.
 * Intentionally never mounted by the production App.tsx.
 */
export default function QaAdminEvents({ events, onUpdated }: Props) {
  const [input, setInput] = useState<ActivityInput>(freshInput);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const ordered = events.slice().sort((a,b) =>
    a.event_date.localeCompare(b.event_date) || a.id - b.id);
  const filtered = ordered.filter(event =>
    (category === "all" || (category === "cleaning" ? event.event_type !== "一般活動" : event.event_type === "一般活動")) &&
    (!search.trim() || [event.event_name,event.event_date,event.notes||""].some(s=>s.includes(search.trim())))
  );
  const ownEvents = filtered.filter(event => event.event_name.startsWith(TAG));
  const canSave = input.event_name.trim().startsWith(TAG) &&
    input.event_name.trim().length <= 120 &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.event_date);

  function startEdit(event: DbEvent) {
    if (!event.event_name.startsWith(TAG)) return;
    setEditingId(event.id);
    setInput({
      event_date: event.event_date,
      event_name: event.event_name,
      event_type: event.event_type === "活動" ? "活動" : "一般活動",
      notes: event.notes || "",
    });
    setMessage("");
  }

  async function save() {
    if (!canSave || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (editingId === null) {
        const response = await createActivity(input);
        setMessage(`已新增虛構活動 #${response.eventId}；可在月曆查閱`);
      } else {
        await editActivity(editingId, input);
        setMessage(`已修改虛構活動 #${editingId}`);
      }
      setEditingId(null);
      setInput(freshInput());
      await onUpdated();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "活動操作失敗");
    } finally {
      setBusy(false);
    }
  }

  async function remove(event: DbEvent) {
    if (busy || !event.event_name.startsWith(TAG)) return;
    if (!window.confirm(`只刪除測試活動「${event.event_name}」與其測試房間，確定？`)) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteActivity(event.id);
      setMessage(`已刪除虛構活動 #${event.id}`);
      if (editingId === event.id) {
        setEditingId(null);
        setInput(freshInput());
      }
      await onUpdated();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "刪除失敗");
    } finally { setBusy(false); }
  }

  return (
    <section className="mt-4 space-y-3 rounded-[24px] border border-[#d8c9af] bg-[#f9f4ec] p-4">
      <div>
        <h2 className="text-[16px] font-semibold text-[#514735]">管理員｜虛構活動管理驗收</h2>
        <p className="mt-1 text-xs text-[#847663]">僅限獨立測試資料庫。固定保護原始測試活動 A、B、C；此處只能修改或刪除標記為「{TAG}」的測試活動。</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-sm">活動日期
          <input type="date" value={input.event_date} onChange={event => setInput(old => ({...old,event_date:event.target.value}))}
            className="mt-1 w-full rounded-xl border border-[#ddd4c6] bg-white p-2.5"/>
        </label>
        <label className="text-sm">活動種類
          <select value={input.event_type} onChange={event => setInput(old => ({...old,event_type:event.target.value as ActivityInput["event_type"]}))}
            className="mt-1 w-full rounded-xl border border-[#ddd4c6] bg-white p-2.5">
            <option value="一般活動">一般活動（不建立房間）</option>
            <option value="活動">活動（建立預設房間）</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">活動名稱
        <input value={input.event_name} onChange={event => setInput(old => ({...old,event_name:event.target.value}))}
          maxLength={120} className="mt-1 w-full rounded-xl border border-[#ddd4c6] bg-white p-2.5"/>
      </label>
      <label className="block text-sm">活動聯絡資訊／備註（限虛構測試資料）
        <textarea value={input.notes} maxLength={2000} rows={2}
          onChange={event => setInput(old => ({...old,notes:event.target.value}))}
          className="mt-1 w-full rounded-xl border border-[#ddd4c6] bg-white p-2.5"/>
      </label>
      <p className="text-xs text-[#847663]">活動名稱必須以「{TAG}」開頭，避免將一般活動誤認成測試資料。修改活動種類不會自動新增或移除既有房間。</p>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy || !canSave} onClick={() => void save()}
          className="flex-1 rounded-xl bg-[#8d8768] p-2.5 text-sm text-white disabled:opacity-50">
          {editingId === null ? "新增測試活動" : "儲存測試活動修改"}
        </button>
        {editingId !== null && <button disabled={busy} className="rounded-xl border p-2.5 text-sm"
          onClick={() => {setEditingId(null);setInput(freshInput());setMessage("");}}>取消修改</button>}
      </div>
      <div className="space-y-2 border-t border-[#e2d8c8] pt-3">
        <h3 className="text-sm font-semibold">全部活動（依日期排序）</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="搜尋日期、活動名稱或備註" className="rounded-xl border bg-white p-2.5 text-sm"/>
          <select value={category} onChange={e=>setCategory(e.target.value)} className="rounded-xl border bg-white p-2.5 text-sm">
            <option value="all">全部活動</option>
            <option value="cleaning">需要清潔</option>
            <option value="general">一般活動</option>
          </select>
        </div>
        <p className="text-xs text-[#847663]">找到 {filtered.length} 筆活動。非測試活動僅顯示，無法修改或刪除。</p>
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {filtered.map(event=><div key={event.id}
            className="flex justify-between gap-2 rounded-lg border border-[#e2d8c8] bg-white px-3 py-2 text-xs">
            <div className="min-w-0">
              <strong className="break-words">{event.event_name}</strong>
              <p className="mt-0.5 text-[#847663]">{event.event_date} · {event.event_type} · {event.status||"未註記"}</p>
            </div>
            <span className="shrink-0 text-[#847663]">{event.event_name.startsWith(TAG)?"測試活動":"唯讀"}</span>
          </div>)}
          {filtered.length===0&&<p className="text-xs text-[#847663]">沒有符合條件的活動。</p>}
        </div>
        <h3 className="text-sm font-semibold">符合目前篩選條件、可修改／刪除的測試活動：{ownEvents.length} 筆</h3>
        {ownEvents.length === 0 && <p className="text-xs text-[#847663]">尚未新增帶標記的測試活動。</p>}
        {ownEvents.map(event => <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-2.5">
          <div className="text-sm"><strong>{event.event_name}</strong><div className="text-xs text-[#847663]">{event.event_date} · {event.event_type}</div></div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => startEdit(event)} className="rounded-lg border px-3 py-1.5 text-xs">修改</button>
            <button disabled={busy} onClick={() => void remove(event)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700">刪除</button>
          </div>
        </div>)}
      </div>
      {message && <p role="status" className="rounded-xl bg-white p-2.5 text-sm">{message}</p>}
    </section>
  );
}
