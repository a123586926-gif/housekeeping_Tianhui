# Housekeeping｜Windows 備份工具執行前 QA 驗收（2026-11-04）

狀態：**程式已修補；未執行真實正式資料備份；正式上線 NO-GO。**

## 本次確認
- 原備份工具已存在於開發分支：`scripts/backup/backup-production.ps1`、`backup-storage.mjs`、`storage-backup-core.mjs`。
- 新增 `scripts/backup/storage-backup-runner.mjs`，使 Storage inventory / download 可用假的 Storage 回應與本機臨時檔進行測試，**不需要或使用正式服務密鑰**。
- 修正：Storage 清單若意外為 0 物件，預設不得回報成功；目前正式來源於唯讀盤點中有 1 個照片物件。
- 修正：檢查 Storage object metadata 的 size 是否有效，下載後校驗實際大小、寫入臨時檔後再次核對檔案內容，並產生 SHA-256 manifest。
- 修正：重複 key、不安全路徑及異常資料直接中止，避免部分下載被誤當作完整備份。
- 新增四項 offline fake-Storage + 真實本機臨時檔的自動測試（下載及 checksum、空清單、長度不符、路徑穿越）。
- 延續原 `tests/local-production-backup.test.mjs` 的五項純函式測試。
- **本次沒有連線下載正式 Storage bytes、沒有建立任何備份，且沒有碰正式 DB、正式網站或 GitHub main。**

## 未完成／待確認
1. 目前 Vercel Free/Hobby 顯示 `build-rate-limit`，最新 GitHub 提交沒有成功的 Vercel build 記錄，不應宣稱最新版已部署。
2. 目前工具容器為 Linux，有 Node.js v22，但沒有 `pwsh`；因此 Windows PowerShell 腳本尚未在實際 Windows/BitLocker/Docker/Supabase CLI 環境執行。
3. 所有本輪新增的自動測試已提交 GitHub，但在 CI 未取得成功記錄前，**不可標為已通過**。
4. 需在可信任 Windows 電腦，確認 BitLocker、Docker Desktop、Node 22、Supabase CLI 與加密備份位置。
5. 真正備份 database roles/schema/data、Storage 檔案、生成校驗 manifest；之後再做隔離還原及對照。
6. 要求使用者**不要在聊天提供正式連線字串、service role key、PIN、備份或照片檔案**。

## 本機操作前驗收步驟
- 從本開發分支取回最新原始碼，在 Windows PowerShell 本機執行 `npm ci`。
- 先執行 `npm run test:local-backup`；應全部通過，才可以考慮正式備份。
- 執行 `supabase --version`、`supabase db dump --help`、`docker info`、`node --version`，確保 CLI / Docker / Node 可用。
- 用系統工具 `Get-BitLockerVolume` 確認備份磁碟加密保護。
- 在本機按 `docs/free-plan-real-backup-runbook-20261104.md` 操作匯出，**僅傳回成功/失敗與摘要，不傳回任何密鑰、SQL 或照片**。
- 若 SQL/Storage 任一步失敗，整份備份視為 INCOMPLETE，**不得據此切換正式版**。
- 即使備份成功，仍需隔離還原並核對檔案 SHA-256，才可列為復原能力已驗收。

## 零影響保證
本輪改動僅在 GitHub `feature/remember-login-30d`。不在 Vercel / CI 自動執行真實備份；不觸碰來源資料及設定。
