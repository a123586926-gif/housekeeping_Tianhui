import { useCallback, useEffect, useState } from "react";
import { readSession, signInWithPin, signOutSession, type AuthenticatedUser } from "./lib/authSession";
import type { DbEvent } from "./lib/housekeepingApi";
import SecureHousekeepingDashboard from "./components/SecureHousekeepingDashboard";

type AccountLabel = { id: string; name: string };
type SessionState = "checking" | "signedOut" | "signedIn" | "error";
type CalendarEvent = { id: number; date: string; name: string; requiresCleaning: boolean };
type ChecklistItem = { id: string; label?: string; description?: string; requiredPhoto?: boolean; done: boolean; photo: boolean; subItems: { id: string; label?: string; done: boolean }[] };
type AssignedRoom = { id: number; event_id: number; building: string; floor: string; room_no: string; assigned_to: string; occupant: string; progress: number; status: string; checklist: ChecklistItem[] };
type Overview = { calendarEvents: CalendarEvent[]; eventRooms: AssignedRoom[]; events: DbEvent[] };

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
              {loadingOverview && <p role="status">正在讀取房務資料…</p>}
              {overviewError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{overviewError}</p>}
              {overview && <SecureHousekeepingDashboard
                user={user}
                expiry={expiry}
                overview={overview}
                onRefresh={refreshOverview}
                onSignOut={logout}
                onPinChanged={refresh}
              >
                {user.role === "cleaner" && (
                  <div className="space-y-2 rounded-xl border border-[#d5c8b1] bg-[#f8f2e8] p-3">
                    <h3 className="text-sm font-semibold">舊版權限回歸測試</h3>
                    <button disabled={qaBusy} className="w-full rounded-lg border p-2 text-sm" onClick={() => void qaAttemptOtherRoom()}>禁止操作其他人的房間（預期 403）</button>
                    <button disabled={qaBusy} className="w-full rounded-lg border p-2 text-sm" onClick={() => void qaCheckAdminOnly()}>禁止讀取管理員人員名單（預期 403）</button>
                    <button disabled={qaBusy} className="w-full rounded-lg border p-2 text-sm" onClick={() => void qaCheckOccupantWrite()}>禁止修改入住者（預期 403）</button>
                    <button disabled={qaBusy} className="w-full rounded-lg border p-2 text-sm" onClick={() => void qaCheckAdminWrite()}>禁止新增活動（預期 403）</button>
                    {qaResult && <p role="status" className="rounded-lg bg-white p-2 text-sm">{qaResult}</p>}
                  </div>
                )}
              </SecureHousekeepingDashboard>}
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
