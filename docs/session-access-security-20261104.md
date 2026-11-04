# Housekeeping｜登入與房間權限安全檢查（2026-11-04）

**僅變更開發分支 `feature/remember-login-30d`；正式網站、正式 Supabase、原版 UI 與 GitHub main 未變動。**

## 本次完成

- 新增 `api/_lib/sessionAccess.js`，純函式 `verifiedLoginIdentity` 只接受與實際要求登入帳號完全一致的 `hk_verify_login` 結果。舊版僅確認陣列長度為 1，現在拒絕錯誤 ID、空陣列、重複列或格式不正確的資料。
- `api/auth/login.js` 已接上身分一致性驗證，拒絕錯誤 RPC 結果後**不核發登入 Cookie**。
- `api/_lib/auth.js` 在每次有 Cookie 的 API 存取重新取得 session 與 account，透過 `verifiedSessionPrincipal` 確認： session 尚未撤銷、有效期限仍在、session user ID 等於 account ID、帳號明確啟用、角色只能是 admin 或 cleaner、角色與 ID 格式一致、名稱不可空白。
- 新增 `tests/session-access-authorization.test.mjs` 的 9 個測試情境：RPC 身分一致、正常 Session、未登入／已撤銷、停用或非法角色、失效日期、跨帳號 Cookie 身分錯置、不合法房務 ID、登出撤銷、空白帳號。
- 已把測試加入 `npm run build` 與 GitHub branch CI。
- **這是純函式與伺服器 API 整合測試規劃，不等於已在真實瀏覽器完成端到端 401/403/PIN/跨裝置驗證。**
- Vercel 對最新含測試提交回覆 `build-rate-limit`；沒有最新測試的成功 Preview/CI 建置紀錄。

## 待完成

1. 最新 9 項測試在實際 GitHub CI / Vercel 執行成功（先解除限速），及 API 處理器層的 401、403 與 Cookie 狀態回歸。
2. 以隔離測試身分驗證錯誤 PIN、鎖定、停用與跨裝置 Session 即時撤銷，不能修改既有受保護房務或照片房間。
3. 完整測試管理員/房務人員對房間資料、照片、日曆和房間指派的角色與 ID 範圍。
4. 正式版帳號與 RLS/Storage 安全適配仍未完成，不能直接部署正式版。

## 下階段

優先實作不依賴實際帳號的 API handler mock 測試，驗證已撤銷的 Cookie 絕不能再讀取資料、非管理員禁止管理人員、異常登入 RPC 永遠不核發 Cookie。允許使用者自行決定何時做 QA 端到端驗收。

備份與付費升級依使用者指示暫緩。
