import { useState } from "react";

type Room = { id:number; building:string; floor:string; room_no:string; checklist:Array<{
  id:string; label?:string; requiredPhoto?:boolean; photo?:boolean
}> };
export default function QaPhotoUpload({ rooms, onUploaded }: {
  rooms:Room[]; onUploaded:()=>Promise<void>;
}) {
  const [roomId,setRoomId] = useState("9401");
  const [itemId,setItemId] = useState("flooring");
  const [file,setFile] = useState<File|null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [viewUrl,setViewUrl] = useState("");
  const room = rooms.find(r=>String(r.id)===roomId);
  const items = room?.checklist?.filter(i=>i.requiredPhoto===true)||[];
  const item = items.find(i=>i.id===itemId);
  async function view() {
    if (!room || !item || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const query = new URLSearchParams({roomId:String(room.id),itemId:item.id});
      const response = await fetch(`/api/data/rooms?${query.toString()}`, {
        method:"GET", credentials:"same-origin", cache:"no-store",
      });
      if (!response.ok) {
        setMessage(`無法查看照片（HTTP ${response.status}）`);
        return;
      }
      const data: unknown = await response.json();
      if (!data || typeof data !== "object" || !("signedUrl" in data) ||
          typeof data.signedUrl !== "string" ||
          !data.signedUrl.startsWith("https://")) {
        setMessage("照片連結格式不正確");
        return;
      }
      setViewUrl(data.signedUrl);
      setMessage("已取得 60 秒有效的私人照片檢視連結，請點下方連結查看");
    } catch(cause) {
      setMessage(cause instanceof Error ? cause.message : "照片檢視失敗");
    } finally {setBusy(false);}
  }
  async function testDeniedView() {
    if (busy) return;
    setBusy(true);setMessage("");setViewUrl("");
    try {
      // Room 9301 is assigned to another test cleaner, not cleaner-1.
      const response = await fetch("/api/data/rooms?roomId=9301&itemId=flooring", {
        method:"GET", credentials:"same-origin", cache:"no-store",
      });
      setMessage(response.status === 403
        ? "通過：伺服器拒絕查看其他人房間照片（HTTP 403）"
        : `未通過：越權查看回傳 HTTP ${response.status}`);
    } catch(cause) {
      setMessage(cause instanceof Error ? cause.message : "無法完成權限測試");
    } finally {setBusy(false);}
  }
  async function upload() {
    if (!room || !item || !file || busy) return;
    if (file.size > 2*1024*1024 || !["image/jpeg","image/png","image/webp"].includes(file.type)) {
      setMessage("檔案必須為 JPEG、PNG 或 WebP，且不超過 2 MB");
      return;
    }
    setBusy(true);setMessage("");setViewUrl("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i=0;i<bytes.length;i+=8192) {
        binary += String.fromCharCode(...bytes.subarray(i,i+8192));
      }
      const response = await fetch("/api/data/rooms",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({roomId:room.id,itemId:item.id,mime:file.type,base64:btoa(binary)}),
      });
      if (response.status!==200) {
        setMessage(`照片未上傳：HTTP ${response.status}`);
        return;
      }
      await onUploaded();
      setMessage("上傳成功：已儲存至私人空間並更新測試房間照片狀態");
      setFile(null);
    } catch(cause) {
      setMessage(cause instanceof Error ? cause.message : "照片上傳失敗");
    } finally {setBusy(false);}
  }
  return <section className="space-y-3 rounded-[24px] border border-[#d8c9af] bg-[#f9f4ec] p-4">
    <h2 className="text-[16px] font-semibold">清潔照片｜檢視模式（上傳暫停）</h2>
    <p className="text-xs text-[#847663]">照片上傳與更換已暫停；既有照片可檢視，權限測試照常進行。</p>
    <label className="block text-sm">測試房間
      <select value={roomId} onChange={e=>{setRoomId(e.target.value);setItemId("flooring");setFile(null);}}
        className="mt-1 w-full rounded-xl border bg-white p-2.5">
        <option value="">請選擇房間</option>
        {rooms.filter(r=>r.checklist?.some(i=>i.requiredPhoto)).map(r=><option key={r.id} value={r.id}>
          {r.building} 棟 {r.floor} {r.room_no}（#{r.id}）
        </option>)}
      </select>
    </label>
    {room && <label className="block text-sm">拍照項目
      <select value={itemId} onChange={e=>setItemId(e.target.value)}
        className="mt-1 w-full rounded-xl border bg-white p-2.5">
        {items.map(i=><option key={i.id} value={i.id}>{i.label||i.id}{i.photo?"（已上傳）":""}</option>)}
      </select>
    </label>}
    <label className="block text-sm">選擇測試照片
      <input disabled type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}
        className="mt-1 block w-full text-sm"/>
    </label>
    <button disabled={busy||!item||!item.photo} onClick={()=>void view()}
      className="w-full rounded-xl border border-[#8d8768] p-2.5 text-sm text-[#75684f] disabled:opacity-50">
      查看已上傳私人照片（短效連結）
    </button>
    <button disabled onClick={()=>void upload()}
      className="w-full rounded-xl bg-[#8d8768] p-2.5 text-sm text-white disabled:opacity-50">
      照片上傳暫停
    </button>
    <button disabled={busy} onClick={()=>void testDeniedView()}
      className="w-full rounded-xl border border-[#d8c9af] p-2.5 text-sm disabled:opacity-50">
      驗證不能查看其他房務人員的房間照片（預期 403）
    </button>
    {viewUrl && <a href={viewUrl} target="_blank" rel="noopener noreferrer"
      className="block rounded-xl border border-[#8d8768] bg-white p-2.5 text-center text-sm text-[#75684f] underline">
      開啟私人照片（60 秒內有效）
    </a>}
    {message&&<p role="status" className="rounded-xl bg-white p-2 text-sm">{message}</p>}
  </section>;
}
