import { useCallback, useEffect, useState } from "react";
import { readSession, signInWithPin, signOutSession, type AuthenticatedUser } from "./lib/authSession";
import SharedActivityCalendar from "./components/SharedActivityCalendar";
import QaAdminEvents from "./components/QaAdminEvents";
import QaAdminRoomAssignments from "./components/QaAdminRoomAssignments";
import type { DbEvent } from "./lib/housekeepingApi";

type AccountLabel = { id: string; name: string };
type SessionState = "checking" | "signedOut" | "signedIn" | "error";
type CalendarEvent = { id: number; date: string; name: string; requiresCleaning: boolean };
type ChecklistItem = { id: string; done: boolean; photo: boolean; subItems: { id: string; done: boolean }[] };
type AssignedRoom = { id: number; event_id: number; building: string; floor: string; room_no: string; assigned_to: string; occupant: string; status: string; checklist: ChecklistItem[] };
type Overview = { calendarEvents: CalendarEvent[]; eventRooms: AssignedRoom[]; events: DbEvent[] };

async function patchChecklist(roomId: number, checklist: ChecklistItem[]): Promise<number> {
  const response = await fetch("/api/data/rooms", {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, changes: { checklist } }),
  });
  return response.status;
}

async function readOverview(): Promise<Overview> {
  const response = await fetch("/api/data/overview", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error(`房務資料讀取失敗（HTTP ${response.status}）`);
  const data = await response.json() as Partial<Overview>;
  if (!Array.isArray(data.calendarEvents) || !Array.isArray(data.eventRooms) || !Array.isArray(data.events)) {
    throw new Error("測試資料格式不正確");
  }
  return { calendarEvents: data.calendarEvents, eventRooms: data.eventRooms, events: data.events };
}

async function readAccounts(): Promise<AccountLabel[]> {
  const response = await fetch("/api/auth/accounts", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error(`帳號列表讀取失敗（HTTP ${response.status}）`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("users" in payload)) throw new Error("帳號格式錯誤");
  const users = (payload as { users: unknown }).users;
  if (!Array.isArray(users)) throw new Error("帳號格式錯誤");
  return users.filter((user): user is AccountLabel =>
    !!user && typeof user === "object" &&
    typeof user.id === "string" && typeof user.name === "string"
  );
}

/**
 * Isolated authentication-only QA page.
 * It intentionally never mounts App.tsx and never reads or writes business tables.
 * Only enable in an isolated Vercel Preview + test Supabase project.
 */
export default function AuthSandbox() {
  const [state, setState] = useState<SessionState>("checking");
  const [accounts, setAccounts] = useState<AccountLabel[]>([]);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [expiry, setExpiry] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [qaBusy, setQaBusy] = useState(false);
  const [qaResult, setQaResult] = useState("");

  const refresh = useCallback(async () => {
    setState("checking");
    setError("");
    try {
      const result = await readSession();
      if (result.authenticated) {
        setUser(result.user);
        setExpiry(result.expiresAt);
        setState("signedIn");
      } else {
        setUser(null);
        setExpiry("");
        setState("signedOut");
      }
    } catch (cause) {
      setUser(null);
      setExpiry("");
      setError(cause instanceof Error ? cause.message : "無法查詢登入狀態");
      setState("error");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let active = true;
    if (state !== "signedIn") {
      setOverview(null);
      setOverviewError("");
      return;
    }
    setLoadingOverview(true);
    void readOverview().then(data => {
      if (active) { setOverview(data); setOverviewError(""); }
    }).catch(cause => {
      if (active) setOverviewError(cause instanceof Error ? cause.message : "資料讀取失敗");
    }).finally(() => {
      if (active) setLoadingOverview(false);
    });
    return () => { active = false; };
  }, [state, user?.id]);
  useEffect(() => {
    let active = true;
    void readAccounts()
      .then(data => { if (active) setAccounts(data); })
      .catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : "帳號讀取失敗");
      });
    return () => { active = false; };
  }, []);

  async function refreshOverview() {
    const data = await readOverview();
    setOverview(data);
    setOverviewError("");
  }

  async function qaUpdateOwnRoom() {
    if (!overview || !user || user.role !== "cleaner" || qaBusy) return;
    const room = overview.eventRooms.find(room => Array.isArray(room.checklist) && room.checklist.length > 0);
    if (!room) { setQaResult("沒有可測試的已分配房間"); return; }
    const next = room.checklist.map((item, i) => i === 0
      ? { ...item, done: !item.done, subItems: item.subItems.map(sub => ({ ...sub })) }
      : item);
    setQaBusy(true);
    setQaResult("");
    try {
      const status = await patchChecklist(room.id, next);
      const refreshed = await readOverview();
      setOverview(refreshed);
      const changed = refreshed.eventRooms.find(x => x.id === room.id)?.checklist?.[0]?.done === next[0].done;
      setQaResult(status === 200 && changed ? "通過：自己的房間已成功更新（HTTP 200）" : `未通過：HTTP ${status}；更新驗證 ${changed ? "一致" : "不一致"}`);
    } catch (cause) {
      setQaResult(cause instanceof Error ? cause.message : "操作失敗");
    } finally { setQaBusy(false); }
  }

  async function qaAttemptOtherRoom() {
    if (!user || user.role !== "cleaner" || qaBusy) return;
    // Only fictitious QA fixtures in the isolated sandbox database.
    const otherRoomId = user.id === "cleaner-901" ? 9302
      : user.id === "cleaner-902" ? 9301 : null;
    if (!otherRoomId) { setQaResult("此帳號沒有配置越權測試案例"); return; }
    const dummyChecklist = [{ id: "wipe", done: true, photo: false, subItems: [] }];
    setQaBusy(true);
    setQaResult("");
    try {
      const status = await patchChecklist(otherRoomId, dummyChecklist);
      setQaResult(status === 403
        ? "通過：伺服器拒絕操作其他人房間（HTTP 403）"
        : `未通過：越權請求回傳 HTTP ${status}，請勿上線`);
    } catch (cause) {
      setQaResult(cause instanceof Error ? cause.message : "操作失敗");
    } finally { setQaBusy(false); }
  }

  async function qaCheckAdminOnly() {
    if (!user || user.role !== "cleaner" || qaBusy) return;
    setQaBusy(true);
    setQaResult("");
    try {
      const response = await fetch("/api/data/cleaners", {
        credentials: "same-origin", cache: "no-store",
      });
      setQaResult(response.status === 403
        ? "通過：房務人員不能取得管理員專用名單（HTTP 403）"
        : `未通過：管理員 API 回傳 HTTP ${response.status}，請勿上線`);
    } catch (cause) {
      setQaResult(cause instanceof Error ? cause.message : "操作失敗");
    } finally { setQaBusy(false); }
  }

  async function qaCheckAdminWrite() {
    if (!user || user.role !== "cleaner" || qaBusy) return;
    setQaBusy(true);
    setQaResult("");
    try {
      const response = await fetch("/api/data/event-create", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: {
          event_date: "2026-11-30", event_name: "不應新增的權限測試活動",
          event_type: "一般活動", notes: "",
        } }),
      });
      setQaResult(response.status === 403
        ? "通過：房務人員不能新增活動（HTTP 403）"
        : `未通過：新增活動回傳 HTTP ${response.status}，請勿上線`);
    } catch (cause) {
      setQaResult(cause instanceof Error ? cause.message : "測試失敗");
    } finally { setQaBusy(false); }
  }

  async function qaCheckOccupantWrite() {
    if (!user || user.role !== "cleaner" || qaBusy || !overview) return;
    const ownRoom = overview.eventRooms[0];
    if (!ownRoom) { setQaResult("沒有可測試的自有房間"); return; }
    setQaBusy(true);
    setQaResult("");
    try {
      const response = await fetch("/api/data/rooms", {
        method: "PATCH", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: ownRoom.id, changes: { occupant: "不得成功的虛構變更" } }),
      });
      setQaResult(response.status === 403
        ? "通過：房務人員不能修改入住者資料（HTTP 403）"
        : `未通過：修改入住者回傳 HTTP ${response.status}，請勿上線`);
    } catch (cause) {
      setQaResult(cause instanceof Error ? cause.message : "測試失敗");
    } finally { setQaBusy(false); }
  }

  async function login() {
    if (busy || !selectedId || !pin) return;
    setBusy(true);
    setError("");
    try {
      const result = await signInWithPin(selectedId, pin);
      setPin("");
      if (!result.authenticated) {
        setState("signedOut");
        setError("登入未建立有效工作階段");
      } else {
        setUser(result.user);
        setExpiry(result.expiresAt);
        setState("signedIn");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登入失敗");
    } finally {
      setPin("");
      setBusy(false);
    }
  }

  async function logout() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await signOutSession();
      setUser(null);
      setExpiry("");
      setPin("");
      setQaResult("");
      setState("signedOut");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登出失敗；請不要假設工作階段已失效");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f1ebe1] px-4 py-10 text-[#514735]">
      <section className="mx-auto max-w-2xl rounded-3xl border border-[#dfd2bd] bg-[#fffaf2] p-6 shadow-lg">
        <h1 className="text-xl font-bold">天惠會館｜30 天登入驗證</h1>
        <p className="mt-2 text-sm text-[#847663]">獨立測試資料庫：驗證 30 天登入、共用日曆與房間讀取權限。</p>
        <p className="mt-3 rounded-xl bg-[#efe3c7] px-3 py-2 text-sm">測試模式：不會修改正式房務資料</p>
        <div className="mt-5 space-y-3">
          {state === "checking" && <p role="status">正在確認登入狀態…</p>}
          {state === "error" && (
            <button className="rounded-xl border px-3 py-2" onClick={() => void refresh()}>
              重新檢查登入
            </button>
          )}
          {state === "signedIn" && user && (
            <>
              <p role="status">目前登入：{user.name}（{user.role === "admin" ? "管理員" : "打掃人員"}）</p>
              <p className="text-sm">固定到期時間：{new Date(expiry).toLocaleString("zh-TW")}</p>
              <p className="text-xs text-[#847663]">請按 F5 確認能否恢復登入，且到期時間沒有改變。</p>
              <button disabled={busy} className="w-full rounded-xl bg-[#8d8768] px-3 py-2 text-white disabled:opacity-50" onClick={() => void logout()}>登出</button>
              <section className="mt-5 space-y-4 border-t border-[#dfd2bd] pt-4">
                <h2 className="text-lg font-semibold">活動日曆（所有已登入人員可查看）</h2>
                {loadingOverview && <p role="status">正在讀取測試活動…</p>}
                {overviewError && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{overviewError}</p>}
                {overview && (
                  <>
                    <SharedActivityCalendar events={overview.calendarEvents} isAdmin={user.role === "admin"} />
                    {user.role === "admin" && <QaAdminEvents events={overview.events} onUpdated={refreshOverview} />}
                    {user.role === "admin" && <QaAdminRoomAssignments rooms={overview.eventRooms} onUpdated={refreshOverview} />}
                    <h2 className="pt-3 text-lg font-semibold">{user.role === "admin" ? "全部測試房間" : "我被分配的房間"}</h2>
                    <div className="space-y-2">
                      {overview.eventRooms.map(room => (
                        <div key={room.id} className="rounded-xl border border-[#e2d8c8] bg-white p-3 text-sm">
                          {room.building}棟　{room.floor}　{room.room_no} 房
                          <span className="ml-2 text-xs text-[#847663]">指派：{room.assigned_to}</span>
                        </div>
                      ))}
                      {overview.eventRooms.length === 0 && <p className="text-sm">沒有分配的測試房間</p>}
                    </div>
                    {user.role === "cleaner" && (
                      <div className="space-y-2 rounded-xl border border-[#d5c8b1] bg-[#f8f2e8] p-3">
                        <h3 className="font-semibold">房務人員操作權限驗收</h3>
                        <p className="text-xs text-[#847663]">僅在虛構測試資料庫執行。第一次操作會變更一間自己的測試房間清潔狀態；另兩項應被伺服器拒絕。</p>
                        <button disabled={qaBusy} className="w-full rounded-lg bg-[#8d8768] p-3 text-sm text-white disabled:opacity-50" onClick={() => void qaUpdateOwnRoom()}>測試更新自己的清潔項目（預期 200）</button>
                        <button disabled={qaBusy} className="w-full rounded-lg border border-[#b9aa90] p-3 text-sm disabled:opacity-50" onClick={() => void qaAttemptOtherRoom()}>測試修改其他人房間（預期 403）</button>
                        <button disabled={qaBusy} className="w-full rounded-lg border border-[#b9aa90] p-3 text-sm disabled:opacity-50" onClick={() => void qaCheckAdminOnly()}>測試讀取管理員名單（預期 403）</button>
                        <button disabled={qaBusy} className="w-full rounded-lg border border-[#b9aa90] p-3 text-sm disabled:opacity-50" onClick={() => void qaCheckOccupantWrite()}>測試修改入住者資料（預期 403）</button>
                        <button disabled={qaBusy} className="w-full rounded-lg border border-[#b9aa90] p-3 text-sm disabled:opacity-50" onClick={() => void qaCheckAdminWrite()}>測試越權新增活動（預期 403）</button>
                        {qaResult && <p role="status" className="rounded-lg bg-white p-2 text-sm">{qaResult}</p>}
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          )}
          {state === "signedOut" && (
            <>
              <label className="block text-sm">帳號
                <select className="mt-1 w-full rounded-xl border p-3" value={selectedId} onChange={event => setSelectedId(event.target.value)}>
                  <option value="">請選擇帳號</option>
                  {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
              <label className="block text-sm">PIN
                <input className="mt-1 w-full rounded-xl border p-3" type="password" autoComplete="current-password"
                  value={pin} onChange={event => setPin(event.target.value)} />
              </label>
              <button disabled={busy || !selectedId || !pin} className="w-full rounded-xl bg-[#8d8768] px-3 py-2 text-white disabled:opacity-50" onClick={() => void login()}>
                {busy ? "驗證中…" : "登入"}
              </button>
            </>
          )}
          {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        </div>
      </section>
    </main>
  );
}
