import { useCallback, useEffect, useState } from "react";
import {
  createQaCleaner, renameQaCleaner, disableQaCleaner,
  getCleaners, type CleanerInfo,
} from "../lib/housekeepingApi";

const PREFIX = "【權限驗收】";

export default function QaAdminCleaners() {
  const [cleaners,setCleaners] = useState<CleanerInfo[]>([]);
  const [name,setName] = useState(PREFIX + "新房務人員");
  const [editId,setEditId] = useState<number | null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");

  const refresh = useCallback(async () => {
    const data = await getCleaners();
    setCleaners(data);
    setError("");
  }, []);
  useEffect(() => {
    void refresh().catch(cause => setError(cause instanceof Error ? cause.message : "人員名單讀取失敗"));
  }, [refresh]);

  const testStaff = cleaners.filter(person => person.name.startsWith(PREFIX));
  const validName = name.trim().startsWith(PREFIX)
    && name.trim().length > PREFIX.length && name.trim().length <= 100;

  async function save() {
    if (!validName || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (editId === null) {
        const result = await createQaCleaner(name.trim());
        setMessage(`已建立測試人員 #${result.cleanerId}（預設停用，沒有可登入 PIN）`);
      } else {
        await renameQaCleaner(editId,name.trim());
        setMessage(`已同步改名測試人員 #${editId} 及其登入身分`);
      }
      setName(PREFIX + "新房務人員");
      setEditId(null);
      await refresh();
    } catch(cause) {
      setError(cause instanceof Error ? cause.message : "儲存失敗");
    } finally {setBusy(false);}
  }

  async function disable(person: CleanerInfo) {
    if (busy || !person.name.startsWith(PREFIX)) return;
    if (!window.confirm(`停用測試人員「${person.name}」？`)) return;
    setBusy(true);
    setMessage("");
    try {
      await disableQaCleaner(person.id);
      await refresh();
      setMessage(`測試人員 #${person.id} 已停用並撤銷既有工作階段`);
      if (editId === person.id) {
        setEditId(null); setName(PREFIX + "新房務人員");
      }
    } catch(cause) {
      setError(cause instanceof Error ? cause.message : "停用失敗");
    } finally {setBusy(false);}
  }

  return (
    <section className="space-y-3 rounded-[24px] border border-[#d8c9af] bg-[#f9f4ec] p-4">
      <h2 className="text-[16px] font-semibold text-[#514735]">管理員｜測試房務人員管理</h2>
      <p className="text-xs text-[#847663]">
        此功能只在隔離測試版使用。原始房務甲、乙不提供修改或停用。新增人員不會取得 PIN，也不能登入。
      </p>
      <label className="block text-sm">測試人員名稱
        <input value={name} maxLength={100}
          onChange={event => setName(event.target.value)}
          className="mt-1 w-full rounded-xl border border-[#ddd4c6] bg-white p-2.5"/>
      </label>
      <div className="flex gap-2">
        <button disabled={busy || !validName} onClick={() => void save()}
          className="flex-1 rounded-xl bg-[#8d8768] p-2.5 text-sm text-white disabled:opacity-50">
          {editId === null ? "新增停用中的測試人員" : "儲存改名"}
        </button>
        {editId !== null && <button disabled={busy} className="rounded-xl border p-2.5 text-sm"
          onClick={() => {setEditId(null);setName(PREFIX + "新房務人員");}}>取消</button>}
      </div>
      <h3 className="border-t border-[#e2d8c8] pt-3 text-sm font-semibold">測試身分（{testStaff.length} 位）</h3>
      {testStaff.length === 0 && <p className="text-xs text-[#847663]">尚無新增的測試房務人員。</p>}
      {testStaff.map(person => (
        <div key={person.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3">
          <div className="text-sm font-medium">{person.name}
            <div className="text-xs text-[#847663]">#{person.id}｜{person.is_active ? "啟用" : "停用"}</div>
          </div>
          <div className="flex gap-2">
            <button disabled={busy} className="rounded-lg border px-3 py-1.5 text-xs"
              onClick={() => {setEditId(person.id);setName(person.name);setError("");}}>改名</button>
            <button disabled={busy || !person.is_active} onClick={() => void disable(person)}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 disabled:opacity-50">停用</button>
          </div>
        </div>
      ))}
      {message && <p role="status" className="rounded-xl bg-white p-2 text-sm">{message}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-white p-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
