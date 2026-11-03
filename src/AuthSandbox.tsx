import { useCallback, useEffect, useState } from "react";
import { readSession, signInWithPin, signOutSession, type AuthenticatedUser } from "./lib/authSession";

type AccountLabel = { id: string; name: string };
type SessionState = "checking" | "signedOut" | "signedIn" | "error";
type CalendarEvent = { id: number; date: string; name: string; requiresCleaning: boolean };
type AssignedRoom = { id: number; event_id: number; building: string; floor: string; room_no: string; assigned_to: string; status: string };
type Overview = { calendarEvents: CalendarEvent[]; eventRooms: AssignedRoom[] };

async function readOverview(): Promise<Overview> {
  const response = await fetch("/api/data/overview", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error(`房務資料讀取失敗（HTTP ${response.status}）`);
  const data = await response.json() as Partial<Overview>;
  if (!Array.isArray(data.calendarEvents) || !Array.isArray(data.eventRooms)) {
    throw new Error("測試資料格式不正確");
  }
  return { calendarEvents: data.calendarEvents, eventRooms: data.eventRooms };
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
                    <div className="space-y-2">
                      {overview.calendarEvents.map(event => (
                        <div key={event.id} className="flex items-start justify-between gap-2 rounded-xl border border-[#e2d8c8] bg-white p-3">
                          <div><div className="text-sm font-semibold">{event.date}　{event.name}</div>
                          <div className="text-xs text-[#847663]">僅供查看，不提供活動編輯</div></div>
                          <span className="shrink-0 text-xs">{event.requiresCleaning ? "需清潔" : "不需清潔"}</span>
                        </div>
                      ))}
                      {overview.calendarEvents.length === 0 && <p className="text-sm">尚無測試活動</p>}
                    </div>
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
