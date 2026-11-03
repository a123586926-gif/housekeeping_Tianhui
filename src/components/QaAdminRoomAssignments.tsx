import { useEffect, useState } from "react";
import { getCleaners, updateRoomAdministration, type CleanerInfo, type DbEventRoom } from "../lib/housekeepingApi";

type RoomForAssignment = Pick<DbEventRoom, "id" | "building" | "floor" | "room_no" | "assigned_to" | "occupant">;
type Props = { rooms: RoomForAssignment[]; onUpdated: () => Promise<void> };

/**
 * Admin-only room assignment QA. Only rendered for an authenticated admin
 * and all mutations also require an admin session on the server.
 */
export default function QaAdminRoomAssignments({ rooms, onUpdated }: Props) {
  const [cleaners, setCleaners] = useState<CleanerInfo[]>([]);
  const [loadError, setLoadError] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [assignee, setAssignee] = useState("未分配");
  const [occupant, setOccupant] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    void getCleaners().then(items => {
      if (mounted) { setCleaners(items.filter(item => item.is_active)); setLoadError(""); }
    }).catch(err => {
      if (mounted) setLoadError(err instanceof Error ? err.message : "無法取得房務人員名單");
    });
    return () => { mounted = false; };
  }, []);

  const selected = rooms.find(room => String(room.id) === selectedRoomId) || null;
  const originalAssignee = selected?.assigned_to || "未分配";
  const originalOccupant = selected?.occupant || "";
  const dirty = Boolean(selected) && (assignee !== originalAssignee || occupant !== originalOccupant);

  function selectRoom(id: string) {
    setSelectedRoomId(id);
    const room = rooms.find(item => String(item.id) === id);
    setAssignee(room?.assigned_to || "未分配");
    setOccupant(room?.occupant || "");
    setMessage("");
  }

  async function save() {
    if (!selected || !dirty || busy || occupant.length > 3000) return;
    const changes: { assignedTo?: string; occupant?: string } = {};
    if (assignee !== originalAssignee) changes.assignedTo = assignee;
    if (occupant !== originalOccupant) changes.occupant = occupant;
    setBusy(true);
    setMessage("");
    try {
      await updateRoomAdministration(selected.id, changes);
      await onUpdated();
      setMessage(`房間 #${selected.id} 已由伺服器驗證並儲存，請核對下方指派與入住者資料`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-[24px] border border-[#d8c9af] bg-[#f9f4ec] p-4">
      <div>
        <h2 className="text-[16px] font-semibold text-[#514735]">管理員｜測試房間指派及入住者</h2>
        <p className="mt-1 text-xs text-[#847663]">只在獨立測試資料庫操作。清潔人員可查看自己指派的房間，但無法修改指派或入住者資料。</p>
      </div>
      {loadError && <p role="alert" className="rounded-lg border border-red-200 bg-white p-2 text-sm text-red-700">{loadError}</p>}
      <label className="block text-sm">選擇測試房間
        <select value={selectedRoomId} onChange={e => selectRoom(e.target.value)}
          className="mt-1 w-full rounded-xl border border-[#ddd4c6] bg-white p-2.5">
          <option value="">請選擇房間</option>
          {rooms.map(room => (
            <option key={room.id} value={room.id}>
              {room.building}棟 {room.floor} {room.room_no}｜{room.assigned_to}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <>
          <label className="block text-sm">房務人員指派
            <select value={assignee} onChange={e => setAssignee(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#ddd4c6] bg-white p-2.5">
              <option value="未分配">未分配</option>
              {cleaners.map(person => <option key={person.id} value={person.name}>{person.name}</option>)}
              {assignee !== "未分配" && !cleaners.some(person => person.name === assignee) && <option value={assignee}>{assignee}（目前指派）</option>}
            </select>
          </label>
          <label className="block text-sm">入住者（測試資料）
            <input value={occupant} onChange={e => setOccupant(e.target.value)}
              maxLength={3000} className="mt-1 w-full rounded-xl border border-[#ddd4c6] bg-white p-2.5" />
          </label>
          <button disabled={!dirty || busy} onClick={() => void save()}
            className="w-full rounded-xl bg-[#8d8768] p-2.5 text-sm text-white disabled:opacity-50">
            {busy ? "儲存中…" : "儲存指派／入住者"}
          </button>
          <div className="rounded-xl bg-white p-2.5 text-xs text-[#75684f]">
            目前資料庫狀態：{originalAssignee}｜{originalOccupant || "空房"}。
            儲存後將重新讀取伺服器資料，不使用本機假成功狀態。
          </div>
        </>
      )}
      {message && <p role="status" className="rounded-xl border bg-white p-2.5 text-sm">{message}</p>}
    </section>
  );
}
