import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { CalendarEvent } from "../lib/housekeepingApi";

type Props = { events: CalendarEvent[]; isAdmin: boolean };

function dateKey(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

function calendarDays(base: Date): Date[] {
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/**
 * Read-only shared schedule. Receives allowlisted fields from a session-checked
 * server endpoint, never room, occupant, guest, or internal event notes.
 * Management of activities remains in authenticated admin-only workflows.
 */
export default function SharedActivityCalendar({ events, isAdmin }: Props) {
  const [month, setMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState("");
  const byDate = useMemo(() => {
    const result = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const group = result.get(event.date) || [];
      group.push(event);
      result.set(event.date, group);
    }
    return result;
  }, [events]);
  const today = dateKey(new Date());
  const selectedEvents = byDate.get(selectedDate) || [];

  return (
    <section className="rounded-[28px] border border-[#e2d8c8] bg-[linear-gradient(180deg,#fffdfa_0%,#f7f3eb_100%)] p-3 shadow-[0_12px_26px_rgba(84,69,45,0.08)]">
      <div className="mb-3 flex items-center gap-2.5 text-[#4f4435]">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#f3ece1_0%,#e7dcc8_100%)] text-[#8a7756]"><CalendarDays className="h-4 w-4" /></div>
        <div>
          <h2 className="text-[16px] font-semibold">日曆</h2>
          <p className="text-[11px] text-[#8e8475]">點日期查看當日活動；{isAdmin ? "活動編輯請使用管理員功能" : "房務人員僅能查看排程"}</p>
        </div>
      </div>
      <div className="rounded-[22px] border border-[#e2d8c8] bg-white p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button type="button" aria-label="上一個月" onClick={() => setMonth(old => new Date(old.getFullYear(), old.getMonth()-1, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#efe7d7] text-[#75684f]"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-[14px] font-semibold text-[#524736]">{month.getFullYear()}年 {month.getMonth()+1}月</span>
          <button type="button" aria-label="下一個月" onClick={() => setMonth(old => new Date(old.getFullYear(), old.getMonth()+1, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#efe7d7] text-[#75684f]"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 pb-1">
          {["日","一","二","三","四","五","六"].map(day => <div key={day} className="py-1 text-center text-[11px] font-semibold text-[#8d8272]">{day}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays(month).map(day => {
            const key = dateKey(day);
            const dayEvents = byDate.get(key) || [];
            const currentMonth = day.getMonth() === month.getMonth();
            return <button type="button" key={key} onClick={() => setSelectedDate(key)}
              aria-label={`${key}，${dayEvents.length} 筆活動`}
              className={`min-h-[76px] rounded-[14px] border px-1 py-1.5 text-left sm:min-h-[92px] sm:px-1.5 ${currentMonth ? "border-[#e2d8c8] bg-white" : "border-[#ece3d7] bg-[#faf6f0] text-[#b1a691]"}`}>
              <div className="flex justify-start">
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${key === today ? "bg-[#8d8462] text-white" : currentMonth ? "text-[#524736]" : "text-[#b1a691]"}`}>{day.getDate()}</span>
              </div>
              <div className="mt-1 space-y-0.5">
                {dayEvents.slice(0,3).map(event => <div key={event.id}
                  className={`truncate rounded-[8px] px-1 py-0.5 text-[10px] ${event.requiresCleaning ? "bg-[#efe7d7] text-[#8a7756]" : "bg-[#f3ede3] text-[#8b7f6b]"}`}
                  title={event.name}>{event.name.slice(0,3)}</div>)}
                {dayEvents.length > 3 && <span className="text-[10px] text-[#8d8272]">+{dayEvents.length-3}</span>}
              </div>
            </button>;
          })}
        </div>
      </div>
      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/40 p-4" onClick={() => setSelectedDate("")}>
          <div role="dialog" aria-modal="true" aria-label={`${selectedDate} 活動`}
            className="w-full max-w-md rounded-[24px] bg-white p-4 shadow-[0_20px_40px_rgba(15,23,42,0.18)]"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-[#4f4435]">{selectedDate} 活動</h3>
              <button type="button" aria-label="關閉" onClick={() => setSelectedDate("")}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#efe7d7]"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto">
              {selectedEvents.length === 0
                ? <p className="text-sm text-[#8d8272]">當天沒有活動</p>
                : selectedEvents.map(event => (
                  <div key={event.id} className="rounded-[18px] border border-[#e4dccf] bg-[#faf6f0] px-3 py-2.5">
                    <div className="text-[13px] font-semibold text-[#524736]">{event.name}</div>
                    <div className="mt-1 text-[11px] text-[#8d8272]">打掃：{event.requiresCleaning ? "需要" : "不需"}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
