# Housekeeping｜正式資料備份與隔離還原門檻（2026-11-04）

**狀態：NO-GO。正式 Supabase、Storage、GitHub main 和正式 Vercel 均未更改。**

## 1. 已查核的來源基準（正式 Supabase xmdznhkkvtohwxkahisr）

2026-11-04 使用 `REPEATABLE READ READ ONLY` 查詢取得彙總，沒有輸出客戶資訊、房務 PIN 或照片內容：

| 欄位 | 數量 |
|--|--:|
| public.events | 2 |
| public.event_rooms | 168 |
| public.rooms | 5 |
| public.cleaners | 6 |
| storage.objects (cleaning-photos) | 1 |
| Storage 物件 metadata byte size | 1,589,759 |
| 已分配的活動房間 | 1 |
| 具有 DB 照片引用的活動房間 | 0 |

注意：這些是**檢查基準，不是備份**，且正式資料會持續變更，執行實際備份時必須重新取同一時間點的彙總。

## 2. 方案與能力限制（2026-11-04 已查證 Free 方案）

Supabase 官方（2026-11）說明：Pro、Team、Enterprise 有每日資料庫備份（各自保留期有所不同），PITR 需另外啟用；Free 不應依賴 Dashboard 可用自動備份。Supabase 組織 API 已確認方案為 `free` / `tier_free`，且目前有兩個啟用專案。Free 方案沒有 Pro／Team／Enterprise 的每日自動備份保障，應主動使用 CLI `db dump` 建立受限的異地備份；不可將可用恢復點視為已存在。即使有 DB 備份，Storage 檔案**內容不包含其中**。

參考：
- https://supabase.com/docs/guides/platform/backups
- https://supabase.com/kb/faqs/platform/free-plan-backups
- https://supabase.com/docs/guides/platform/clone-project

本連接工具目前未提供列出現有備份／下載實際備份的可用操作；已另建立 [Free 方案實際備份執行手冊](./free-plan-real-backup-runbook-20261104.md)，包含 Windows 本機 SQL/Storage 備份、檔案 SHA-256、與本機隔離還原。**不得宣稱已產生資料庫備份或完成 restore。**

## 3. 正式操作前的備份 SOP（人工受控操作；尚未執行）

1. 在正式 Supabase Dashboard > Database > Backups 確認可用恢復點與費用方案、備份頻率、保留期；記錄時間（UTC）、實際使用的資料庫備份型態。
2. 準備受限、加密且有存取稽核的備份目的地。使用 Supabase CLI 官方 `db dump` 方案，以授權的正式資料庫連線建立 roles/schema/data 三種匯出。請從 Dashboard/CLI 互動取得連線，不要把 DB 密碼貼到聊天、程式碼、CI logs。
3. 獨立備份 Storage `cleaning-photos` 的每個物件**內容、路徑、大小、MIME、SHA-256**。保留單獨 manifest，限制存取。現有 1 個無 DB 引用的物件仍必須保留。
4. 在一個**不同的隔離 Supabase 專案/隔離 PostgreSQL + Storage**執行 restore 演練，絕不可在正式來源專案直接呼叫 restore。對照 schema、RLS、授權、序列、登入相關資料；不把正式人員 PIN 直接暴露給測試前端。
5. 從隔離環境重取相同計數並檢查每個 Storage 物件 SHA-256/size 一致；確認 restore 期間無敏感檔被公開。還原驗證的其他設定（含 Edge Functions、專案 secrets、Storage 策略）須另查，不能假設資料庫複製會包含。
6. 取得正式站目前可使用的 Vercel 正式部署 ID，紀錄域名、env 範圍與舊版部署參照，做獨立測試環境的部署回滾演練。Vercel 回滾不等同 DB/RLS/Storage 回滾。
7. 設定寫入凍結窗口及 RPO/RTO、資料庫／Storage 雙向回滾決策；全部驗收並由使用者明確核准後才安排正式切換。

## 4. 已加入開發分支的證據檢查器

- `server/restore-readiness.mjs`：純函式，檢查來源與隔離還原專案不同、8 項統計一致、Storage 物件大小及 SHA-256 manifest 相符、資料庫和 Storage 實際備份/還原證據、schema/RLS/序列核對、加密保護、應用和資料庫回滾演練、切換窗口核准。
- `tests/restore-readiness.test.mjs`：以虛構或彙總資料模擬成功、不完整備份、遺失／錯誤照片、同專案還原、房間數量改變、重複物件及無效 metadata。
- 開發分支 build 與 CI 將運行 `test:restore-readiness`。
- 這套程式**沒有執行備份、沒有產生實際備份檔案、不連線正式 DB，也不會呼叫恢復 API**。

## 5. 目前決策

| 項目 | 狀態 |
|--|--|
| 正式資料唯讀彙總 | 完成 |
| 官方備份選項資訊 | 已確認 |
| 正式方案 | **已確認為 Free**，不能依賴每日自動備份 | 
| 可用備份／恢復點 | **未確認／不可假設存在** |
| 實際資料庫備份檔 | **尚未建立/驗證** |
| Storage 真實物件備份與 SHA-256 | **尚未建立/驗證** |
| 隔離 restore 演練 | **未執行** |
| 正式 Vercel 回滾演練 | **未執行** |
| 正式上線授權 | **尚未核准** |

**結論：繼續 NO-GO，禁止直接合併 main、修改正式 Supabase 或切換正式網站。**
