# Housekeeping｜正式人員管理相容性｜本輪進度（2026-11-04）

**只改開發分支；正式網站、正式 Supabase 與 main 均不切換。暫不處理備份/付費升級。**

## 本次完成

- 檢視 `api/data/cleaners.js`，確認目前人員新增、改名、停用使用 `hk_qa_manage_cleaner`，且只能操作以 `【權限驗收】` 開頭的測試身分。
- 新增 `api/_lib/cleanerManagementPolicy.js`，抽離驗證規則。正式相容規則可以接受一般人員姓名，但只在 `production-planning` **純驗證模式**回傳；該模式 `executableInQa=false`，並**不接上任何寫入端點**。
- 現有 QA API 固定使用 `mode:"qa"`，既有前綴、最多 100 字及禁止非測試人員變更的限制保留。
- 新增 `tests/cleaner-management-policy.test.mjs`，測試一般姓名只可規劃、測試用姓名保持原規則、新增/更名/停用輸入、錯誤 ID 與非法模式。
- 已加入開發分支 GitHub CI 及 Preview build 的回歸測試。
- `qaGuard.js` 仍阻止 Vercel Production 和正式 Supabase，**不是正式部署版本**。
- 不涉及 UI 修改或既有資料變動。

## 仍未完成（不涉及本階段已擱置的備份工作）

1. 尚未建立正式環境專用的、經審核的 `hk_create_cleaner` / `hk_update_cleaner` / 停用及新 PIN 安全初始化實際執行路徑。
2. 正式人員資料雖已查核六位，尚未把原 `cleaners` 與新 `hk_auth_accounts` 安全轉換。
3. 新正式 API 與舊版畫面需要進一步整合及真實權限 E2E 驗證，包括管理員和房務人員登入、指派與撤銷。
4. 正式照片儲存授權與現有匿名 RLS 必須先完成過渡設計才能收緊。
5. 正式上線仍需使用者明確核准；沒有變更 `main`、正式 Supabase 或正式網站。

## 下一步建議

在**不更動正式資料庫**前提下，建立可從 QA 測試模式分離的正式人員管理伺服器 API 設計與授權契約，先以 mock database/純函式測試覆蓋安全新增/更名/停用/重新登入，確認功能與原版一致後再研究正式切換。
