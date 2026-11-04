# Housekeeping｜Free 方案實際備份執行手冊（尚未執行）
日期：2026-11-04

## 核實的目前環境

- Supabase 組織 `ceuzgstvrnrhzfyozfdp`：**Free / tier_free**（透過已連接 Supabase 組織 API 查證）。
- 同組織已使用兩個啟用專案：正式 `xmdznhkkvtohwxkahisr`、獨立 QA `zhvrgluwoookxaglfjdw`。沒有第三個專案或 branch。
- 官方說明 Free 方案不提供 Pro、Team、Enterprise 的每日自動資料庫備份保障；Free 應以 `supabase db dump` 定期外部備份。
- 資料庫 SQL 備份**不包含 Storage 檔案 bytes**。
- 本次沒有對正式環境執行備份、下載個資、複製照片、重建或復原。

官方：[Database Backups](https://supabase.com/docs/guides/platform/backups)、[Restore a Platform Project to Self-Hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform)。

## A. 正式資料庫外部備份（須有正式管理員在自己的電腦操作）

操作系統：Windows。預備 Docker Desktop、Supabase CLI（`supabase --version`）、足夠容量且**加密**的非公開資料夾（例：Windows BitLocker 加密磁碟）。不要把備份寫到 GitHub、Vercel、聊天室、同步到公開雲端、或專案原始碼資料夾。

1. 從 [正式 Supabase Dashboard](https://supabase.com/dashboard/project/xmdznhkkvtohwxkahisr) 的 **Connect** 複製正式 DB 專用連線資訊，建議採官方的 direct / session pooler 連線方式。**不得貼到 ChatGPT 或 commit。**
2. 從官方 CLI 文件查核指令選項 `supabase db dump --help`；不要假設 CLI 的使用方式永遠不變。
3. 在加密磁碟上的**專用備份資料夾**執行三個官方範例（下列 `[CONNECTION_STRING]` 須在自己本機安全替換；不要把真實內容放進原始碼或錄影）：

```powershell
supabase db dump --db-url "[CONNECTION_STRING]" -f roles.sql --role-only
supabase db dump --db-url "[CONNECTION_STRING]" -f schema.sql
supabase db dump --db-url "[CONNECTION_STRING]" -f data.sql --use-copy --data-only
```

**注意：** 命令列 URL 可能出現在本機程序資訊、終端歷史或監控記錄。僅在受控的本機電腦操作，避免分享命令輸出。工具完成後妥善清除含秘密的暫存與終端歷史，並依安全政策輪替曝露的資料庫連線密碼。

4. 在本機檢查檔案存在且非空（不要列印內容）：

```powershell
Get-Item .\roles.sql, .\schema.sql, .\data.sql | Select-Object Name,Length
Get-FileHash .\roles.sql, .\schema.sql, .\data.sql -Algorithm SHA256 | Select-Object Path,Hash
```

5. 三份 SQL 檔視為**含敏感資料**。需要保留資料庫結構、RLS、trigger、grant 以及可能包含憑證雜湊的資料；不要直接分享或用作網頁測試內容。加密備份檔應有受限權限、保留政策及異地副本。

## B. Storage 照片必須獨立備份

正式 `cleaning-photos` 目前 **1 個物件**，來源 metadata 記錄 **1,589,759 bytes**，且沒有任何 `event_rooms` 欄位引用。它不是可自動刪除的垃圾檔案。

1. 透過正式 Supabase Dashboard 的 Storage，或**使用受控且具授權的官方 Storage API/CLI** 將檔案 bytes 下載至獨立加密備份資料夾，不要透過此專案任何公開頁面匯出。
2. 記錄物件 key、bucket、MIME、byte size、`Get-FileHash -Algorithm SHA256` 值與備份時間（UTC），**私下保管**。
3. 保留 bucket public 設定及 `storage.objects` 政策/metadata 的備份；不可把「有一個 Storage SQL row」當成已備份照片 bytes。
4. 先**保留**這個孤立物件，沒有人工審核與可還原備份時禁止刪除、覆蓋或自動關聯房間。

## C. 不花第三個 Supabase 專案費用的隔離還原方案

目前 Free 組織已有兩個啟用專案，**不得把備份還原到正在使用的 QA 專案**，因為會覆蓋登入、測試房間和測試照片。

優先選擇：
- 在**完全隔離且受保護的本機 Docker / PostgreSQL（版本相容）**建立恢復測試，並參考官方 [Restore a Platform Project to Self-Hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform)；
- 或由使用者先確認新增獨立 Supabase 專案的費用與同意後，再建立新專案。

本機還原必須與任何實際服務網域隔離，不能暴露到公網。官方還原示例會使用角色、schema、data 三份 SQL，並需要核對 DB 版本/延伸套件差異；不可不經檢查便直接還原到正式或 QA。

**注意**：備份可能含真實房務姓名、PIN 或住客個資。本機還原完成後仍不得用原始資料直接開放測試網站；若要讓測試版使用，需去識別化並限制權限。

## D. 還原後驗證（請回報摘要，不要回傳敏感檔案）

在隔離資料庫核對 `events`、`event_rooms`、`rooms`、`cleaners` 的總數、房號唯一性及既有指派；另核對 Storage 物件數、大小、SHA-256，且 RLS／政策與備份時一致。不可用「部署成功」或「表數量相同」取代實際的檔案內容比對。

本輪（2026-11-04）的來源唯讀彙總基準：**2 活動、168 活動房間、5 房間主檔、6 房務、1 照片物件、1,589,759 bytes、1 指派房間**。正式資料會持續變化；**備份與還原兩端需要採用同一份備份快照的基準**。

檔案檢查程式：`server/restore-readiness.mjs` + `tests/restore-readiness.test.mjs`（虛構測資，僅檢查證據，不會連線或還原資料）。

## E. NO-GO 判定

截止本文件更新：尚未下載任何 SQL/照片備份，也尚未完成任何實際隔離還原及正式上線核准。因此：

- **不合併 GitHub main**。
- **不變更 Vercel Production 或公開域名**。
- **不撤銷正式 anon RLS / Storage policy**，因目前舊版仍依賴它們。
- **不呼叫 Supabase restore_project**；該工具不能用作「安全先試一次」。
- **不產生額外可能計費的 Supabase 專案或 branch**。

需要使用者在自己可信任的電腦完成本手冊的 A/B 階段，或提供可受控操作的專用備份環境後，才能進入真正的還原演練。
