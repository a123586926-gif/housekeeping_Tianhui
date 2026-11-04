# Housekeeping｜QA 房務人員管理 API 安全整合（2026-11-04）

## 本次完成

- 新增 `api/_lib/qaCleanerManagement.js`：將現有 `POST/PATCH /api/data/cleaners` 的管理員檢查、測試身分前綴、參數驗證與 server-only RPC 呼叫抽出成單一契約。僅限 role=`admin`，房務或非管理員不可呼叫任何管理 RPC。
- 原有 `api/data/cleaners.js` 已接入此契約；底層仍使用既有 `hk_qa_manage_cleaner`，保留原本 QA 隔離限制，沒有改動原版 UI。
- 新增 `verifyDisabledCleaner` **離線檢查函式**，可用於檢查停用後業務人員/登入帳號皆 inactive 且所有未到期 session 都被撤銷。這個檢查**尚未接到正式執行端點**，不宣稱已在真實停用流程中通過。
- 新增 `tests/qa-cleaner-management-contract.test.mjs`，涵蓋管理員新增、改名、停用的 RPC 參數、未授權拒絕、非 QA 姓名拒絕、錯誤回應及停用後 session 撤銷驗證。
- 更新 Preview build 和 GitHub branch CI 使新增測試被執行。**目前 Vercel 回報 build-rate-limit，沒有最新新程式的成功建置或自動測試執行證據。**
- QA Supabase 做**唯讀**核對：`hk_qa_manage_cleaner` 存在，操作涵蓋帳號及 session 撤銷；查核當時無 disabled cleaner 帳號，亦無 disabled 帳號持續有效的 session。因此本輪沒有真正「停用人員」可供觀察驗證。
- 只改 GitHub `feature/remember-login-30d`，未修改 Vercel Production、GitHub `main` 或任何正式資料庫。

## 尚未完成（依目前聚焦功能，不處理用戶暫緩的備份）

1. 新增的 7 項契約測試尚未取得成功 CI/Vercel 執行結果。
2. 需在隔離 QA 測試資料新增可停用帳號，實際跨登入裝置驗證停用後 session 被撤銷、原房間指派如何處理，且不刪除原房間歷史；避免更動目前使用者已驗收的 QA fixture。
3. 正式 API 仍然需要獨立權限方案；既有 `qaGuard` 明確封鎖 Production，正式 PIN 憑證初始化尚未實際整合。
4. 正式 RLS/Storage 和新登入 API 的安全協調切換以及回滾方案尚未完成。

## 下一步

在不動正式環境前提下，對 QA 的**獨立測試身分**做端到端新增→授權 PIN→登入→停用→驗證舊 session 失效，並確認房間歷史資料保留。每個步驟先確定對 QA 已有 fixture 無破壞性後才可執行。
