# Housekeeping｜正式六位房務帳號安全遷移：唯讀盤點與模擬測試
日期：2026-11-04（台灣）  
狀態：**NO-GO，禁止正式寫入與直接上線**

## 已驗證的正式資料摘要（不包含姓名、PIN、住客或照片）

- 正式 Supabase：`xmdznhkkvtohwxkahisr`；隔離測試：`zhvrgluwoookxaglfjdw`。
- `cleaners`：6 筆；全數 `is_active=true`；3 筆 `pin` 非空，另外 3 筆為空。
- cleaner ID 非法數量 0，姓名空白 0，以 `lower(trim(name))` 分組後重複姓名 0。
- `event_rooms` 共 168 筆；其中 1 筆 `cleaner_id` 非空，並能正確對上既有人員及 `assigned_to` 姓名；無孤立指派、無姓名不一致、無僅有姓名而沒有 ID 的有效指派。
- 正式 `hk_auth_accounts` 與 `hk_auth_sessions` 尚不存在。
- **沒有查詢、讀取、輸出或複製任何舊 PIN 明文**。對正式 DB 僅執行 SELECT 彙總。

## 必須遵守的轉換規則

1. **沿用既有 `cleaners.id` 與姓名**；對每個既有人員建立 `cleaner-${id}` 的登入身分，role 固定為 `cleaner`。不更改現有 `event_rooms.cleaner_id` 與 `assigned_to`。
2. 業務表 `cleaners.is_active=true` 只代表仍在職，**不代表新登入帳號可使用**。
3. 所有新的 `hk_auth_accounts.active` 初始必須為 **false**；PIN 雜湊預設為安全亂數不可使用的佔位資訊。**舊 `cleaners.pin` 的有無都不得直接變成新帳號可登入**。
4. 管理員需透過安全且經授權的流程，逐人設定全新強 PIN，伺服器端以適當的加鹽 KDF 雜湊保存，驗證後才啟用該登入帳號。不得將新 PIN 寫入原本 `cleaners.pin`。
5. 未提供 PIN 的三位人員不可獲得預設 PIN，也不可自動繼承管理員 PIN。
6. `admin` 身分要另外走獨立的管理員授權及 PIN 設定流程，**不得根據房務姓名推導或升權**。
7. 如任何帳號映射、重複姓名、孤立指派、新憑證設定有疑義，停止切換，保持原版可使用並先處理差異。
8. 舊版 PIN 欄位與匿名資料讀取權限的停用／移除，必須在完成新服務端授權、正式備份與回復演練後的**協調切換窗口**執行。

## 新增非破壞性程式與測試

- `server/production-account-dry-run.mjs`：純函式、**不含資料庫連線、不寫入、不產生真實雜湊**。只接受清理後的 ID、姓名、業務是否啟用、舊 PIN 是否存在的布林值、房間指派 ID。
- `tests/production-account-dry-run.test.mjs`：使用六名虛構人員，驗證三筆有舊 PIN、三筆沒有 PIN；新登入預設停用、需要管理員明確設定、不可憑舊 PIN 自動啟用、拒絕重複 ID/姓名、失效指派、角色提升、異常欄位或任何意外輸入的 PIN/雜湊。
- 已加入 `.github/workflows/auth-branch-checks.yml`，作為開發分支的防回歸檢查。
- 不以真實人員姓名、真實 PIN 或測試用 PIN 當作程式碼測資。

## 後續尚未完成、不得誤稱已完成

- 真正的正式資料庫備份／可還原驗證，以及正式 Storage 的備份。
- 正式用的帳號建立與強 PIN 授權流程（**尚未實作／尚未執行**）。
- 在隔離系統以去識別資料測試實際 SQL 憑證初始化交易。
- 30 天真實到期、多裝置撤銷及正式資料權限協調切換。
- 最終使用者對正式上線的核准。

**禁止因為本次模擬通過就修改 GitHub main、Vercel Production 或正式 Supabase。**
