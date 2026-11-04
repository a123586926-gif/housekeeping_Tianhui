# Housekeeping｜安全登入與房間 API 自動驗證整合報告（2026-11-04）

## 現況與邊界

- 本次**只修改 GitHub `feature/remember-login-30d`**。正式 Supabase、Vercel Production、原版 UI 和 `main` 未修改。
- 使用者已指定先不處理備份與 Supabase 升級。本輪不建立備份，也不以暫停備份作為放寬正式遷移安全限制的理由。
- 新增 API HTTP 處理器的測試用依賴注入；**預設執行入口仍使用 `adminDb`、`getSession`、`allowSameOrigin`**，而 `api/_lib/qaGuard.js` 繼續拒絕 Production 及非指定 QA Supabase。
- 修正登入 RPC 驗證：只有回傳的 `verified_user_id` 和請求帳號完全一致才核發 Cookie。空結果／多結果／錯誤 ID 全部拒絕。
- `getSession` 按請求重新從 `hk_auth_sessions` 和 `hk_auth_accounts` 取得狀態，驗證過期、撤銷、停用、角色、帳號 ID 一致性；已消除非 Boolean 驗證結果。
- 在不修改原版畫面的情況下，將 login、logout、session/PIN、cleaners、overview、rooms API handler 抽成可注入假的資料庫測試函式。

## 可重現的 66 項隔離測試

使用 GitHub 分支現有檔案，於隔離 V8 環境編譯並實際呼叫函式、HTTP handler，使用假資料庫及本機 mock，不含任何正式憑證。結果 **66 passed / 0 failed**：

| 測試檔案 | 通過數 |
|---|---:|
| `session-access-authorization.test.mjs` | 9 |
| `cleaner-management-policy.test.mjs` | 4 |
| `qa-cleaner-management-contract.test.mjs` | 7 |
| `qa-cleaner-lifecycle-simulation.test.mjs` | 3 |
| `http-auth-handler.test.mjs` | 10 |
| `http-overview-authorization.test.mjs` | 7 |
| `http-session-logout.test.mjs` | 10 |
| `session-database-lookup.test.mjs` | 8 |
| `http-room-authorization.test.mjs` | 8 |
| **總計** | **66** |

其中包含 401 未登入、403 非管理員／非房間擁有人、錯誤 PIN 不發 Cookie、Session 寫入失敗不發 Cookie、停用及撤銷、跨帳號身份拒絕、PIN 更換後登出、敏感活動備註不外洩、短效照片 signed URL、樂觀鎖失敗拒寫等。

**重要限定：**這 66 項為 V8 + 假資料庫執行，並非 Node.js 官方 test runner CI 通過、Vercel Preview 最新版本完成建置、真實 browser E2E、或正式 Supabase 的真實登入測試。所有測試已加入 `package.json` 和 GitHub Actions；仍需正常 CI/build 核驗。

## QA Supabase 唯讀安全稽核

- 6 個核心表 `cleaners`、`events`、`event_rooms`、`rooms`、`hk_auth_accounts`、`hk_auth_sessions`：RLS 均啟用，`anon` 不具直接 SELECT/INSERT/UPDATE/DELETE 權限，無直接允許政策（預期採伺服器 service-role API）。
- `hk_verify_login`、`hk_qa_manage_cleaner`、`hk_qa_provision_pin`、`hk_change_own_pin`、`hk_qa_create_room_full`、`hk_qa_delete_room` 的 EXECUTE 權限：anon=false、authenticated=false、service_role=true。
- 顧問結果僅有 `rls_enabled_no_policy` INFO，符合目前使用伺服器 API 的禁止直連設計。
- 唯讀計數：人員 3、登入帳號 4、session 紀錄 33、活動房間 339、已指派 7；未產生本輪生命週期測試人員／房間，停用但仍有有效 session 的帳號 0。
- 本輪不建立/刪除 QA 既有資料或照片。

## Vercel 與 GitHub

- 目前觀察到最近 READY 的 Preview 部署 commit `0ad5b943`，不含全部後續測試與 route 重構。
- 最新提交的 Vercel status 回覆 `build-rate-limit`；不得宣稱本輪全部程式已由 Vercel 成功部署。
- 未能透過目前 GitHub 工作流程查詢工具取得 branch push 的完整 Actions 結果。
- 原版 `src/App.tsx` 的 main SHA `8e35ff6bf8b2da0bf887510544af00f56244a6c5` 和 feature SHA `435461de7c7576439905afe3b4406fbeb3415e4f` 已再次比對未變。

## 下一步需要真實操作的阻擋條件

1. **部署驗證**：當 Vercel 免費方案建置配額可用時，讓 GitHub 開發分支的最新 commit 正常 Preview 建置，檢查 `npm ci`、完整 Node.js 迴歸測試、`tsc -b` 與 Vite build 成功。不可把舊版 READY 當成最新版本 READY。
2. **登入瀏覽器 E2E**：在固定 QA 網址 `https://housekeeping-tianhui-git-featur-941b7a-a123586926-gifs-projects.vercel.app`，用既有合法測試身分確認：管理員登入、人員管理、新 PIN、普通房務只能見指派房間、共用活動日曆、照片權限、登出和重新整理、異常或停用後的 session 失效。**請勿把 PIN / token / 管理員秘密貼到聊天**。在新版 Preview READY 前，不要以舊版測試通過抵充最新版驗收。
3. **正式切換**：正式六位房務的帳號／PIN 安全遷移、QA RPC 替換正式版本、正式 private Storage/RLS 轉換，仍需獨立審查與使用者明確核准。不得直接合併 main 或更改正式 Supabase。

**整體狀態：開發分支安全 API mock 驗證完成；真實瀏覽器與正式切換仍是 NO-GO。**
