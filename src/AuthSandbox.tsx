import { useCallback, useEffect, useState } from "react";
import { readSession, signInWithPin, signOutSession, type AuthenticatedUser } from "./lib/authSession";

type AccountLabel = { id: string; name: string };
type SessionState = "checking" | "signedOut" | "signedIn" | "error";

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
      <section className="mx-auto max-w-md rounded-3xl border border-[#dfd2bd] bg-[#fffaf2] p-6 shadow-lg">
        <h1 className="text-xl font-bold">天惠會館｜30 天登入驗證</h1>
        <p className="mt-2 text-sm text-[#847663]">僅限測試資料庫，不會開啟活動、房間或人員管理功能。</p>
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
