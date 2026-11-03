import { useState } from "react";
import { changeOwnPin } from "../lib/authSession";

export default function QaChangePin({ onChanged }: { onChanged: () => Promise<void> }) {
  const [oldPin,setOldPin] = useState("");
  const [newPin,setNewPin] = useState("");
  const [confirmPin,setConfirmPin] = useState("");
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const valid = oldPin.length >= 4 && /^[0-9]{8,32}$/.test(newPin) &&
    newPin !== oldPin && newPin === confirmPin;
  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await changeOwnPin(oldPin,newPin);
      setOldPin(""); setNewPin(""); setConfirmPin("");
      setMessage("PIN 已變更，所有登入工作階段已撤銷。請用新 PIN 重新登入。");
      await onChanged();
    } catch(cause) {
      setMessage(cause instanceof Error ? cause.message : "PIN 變更失敗");
    } finally {
      setOldPin(""); setNewPin(""); setConfirmPin(""); setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-[24px] border border-[#d8c9af] bg-[#f9f4ec] p-4">
      <h2 className="text-[16px] font-semibold text-[#514735]">測試人員｜變更自己的 PIN</h2>
      <p className="text-xs text-[#847663]">
        僅在獨立測試身分提供此介面。成功變更後，所有已登入分頁與裝置的工作階段立即失效，需要以新 PIN 重新登入。
      </p>
      <label className="block text-sm">目前 PIN
        <input type="password" inputMode="numeric" autoComplete="current-password" value={oldPin}
          onChange={e => setOldPin(e.target.value)} className="mt-1 w-full rounded-xl border bg-white p-2.5" />
      </label>
      <label className="block text-sm">新 PIN（8–32 位數字）
        <input type="password" inputMode="numeric" autoComplete="new-password" value={newPin}
          onChange={e => setNewPin(e.target.value)} className="mt-1 w-full rounded-xl border bg-white p-2.5" />
      </label>
      <label className="block text-sm">再次輸入新 PIN
        <input type="password" inputMode="numeric" autoComplete="new-password" value={confirmPin}
          onChange={e => setConfirmPin(e.target.value)} className="mt-1 w-full rounded-xl border bg-white p-2.5" />
      </label>
      <button disabled={busy || !valid} onClick={() => void save()}
        className="w-full rounded-xl bg-[#8d8768] p-2.5 text-white disabled:opacity-50">
        {busy ? "更新中…" : "變更 PIN 並登出全部工作階段"}
      </button>
      {message && <p role="status" className="rounded-lg bg-white p-3 text-sm">{message}</p>}
    </section>
  );
}
