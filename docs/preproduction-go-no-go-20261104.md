# Housekeeping 原版安全整合｜上線前審核清單（2026-11-04）

## 結論：目前 **NO-GO，禁止直接合併 main / 正式部署**

目前實作在 `feature/remember-login-30d`，使用獨立的 Vercel Preview 專案以及測試 Supabase `zhvrgluwoookxaglfjdw`。原版 `src/App.tsx` 介面已接回安全 API；不等於正式環境適配已完成。所有使用者驗收僅代表測試環境與測試資料成功。

## 正式資料唯讀盤點已完成（2026-11-04）

詳見 [production-readonly-inventory-and-rollback-20261104.md](./production-readonly-inventory-and-rollback-20261104.md)。

已查明正式 2 活動、168 活動房間、5 房間主檔、6 啟用房務人員；舊版 PIN 欄位仍有 3 筆非空值。正式 `cleaning-photos` 為公開桶且 Storage 允許匿名存取；四張業務表對 anon 有 `true` 的 CRUD RLS 策略。**尚未建立／驗證實際 DB+Storage 備份或還原。必須保持 NO-GO。**

## 正式帳號遷移模擬（2026-11-04）

已查核正式人員共 6 位，舊 PIN 非空 3、空值 3，房務 ID 與姓名無重複，既有 1 筆有效房間指派沒有異常。建立純函式 `server/production-account-dry-run.mjs`、對應的六人虛構測試與 CI，設計為新登入帳號**全數停用、逐人重新設定強 PIN 後才可啟用**。詳見 [production-account-migration-dry-run-20261104.md](./production-account-migration-dry-run-20261104.md)。這只是模擬，正式備份、PIN 佈署與還原仍未執行，繼續 NO-GO。

## 正式照片私人化模擬（2026-11-04）

正式 `cleaning-photos` 目前公開，且有 1 張約 1.59 MB 的舊照片物件，但 168 間活動房間均沒有引用；該物件必須保留、人工核對，不可自動刪除。建立 `server/production-photo-migration-audit.mjs` 及 7 項虛構資料測試，並將測試納入 Vercel Build 和 CI，已在 Preview build 觀察到 7/7 pass。詳見 [production-photo-private-migration-20261104.md](./production-photo-private-migration-20261104.md)。**正式 Storage 未備份、未搬移、未改權限；繼續 NO-GO。**

## 備份與還原驗證門檻（2026-11-04）

已完成正式來源的 `REPEATABLE READ READ ONLY` 基準計數並核對官方備份規則。加入獨立資料庫與 Storage 雙還原驗證純函式、SHA-256 manifest/失敗情境測試。**尚未取得正式方案/可用備份點，也未建立實際備份或做隔離還原**；繼續 NO-GO。詳見 [production-backup-restore-readiness-20261104.md](./production-backup-restore-readiness-20261104.md)。

## Free 方案正式備份準備（2026-11-04）

**已由 Supabase 組織 API 確認 Free 方案、正式與 QA 兩個啟用專案。** 尚無受保障的每日自動備份，現有工具不能直接取得實際備份檔或完成本機還原。已提供 Windows 本機受保護的資料庫與 Storage 備份步驟及不新增第三個 Supabase 專案的隔離還原方案，詳見 [free-plan-real-backup-runbook-20261104.md](./free-plan-real-backup-runbook-20261104.md)。**正式資料備份與還原演練仍未完成，不得正式切換。**

## 登入、HTTP 權限及房間資料保護（2026-11-04 最新）

新增與修正：登入 RPC 身分需完全一致、Cookie/session/account 必須同時有效、停用帳號不可繼續存取；所有六個 API 處理器（登入、登出、PIN、房務人員、房間總表、房間/照片）加入可隔離測試的依賴注入但不改正式入口或 QA guard。

使用開發分支實際程式加模擬資料庫，在隔離 V8 執行 **66 項測試／66 通過**（不是最新 Node.js CI、真實瀏覽器或正式系統 E2E）。QA Supabase 唯讀確認主要 6 張表 RLS 啟用、anon 無直接 CRUD，6 個登入/管理 RPC anon 與 authenticated 無 EXECUTE；詳見 [auth-http-security-completion-20261104.md](./auth-http-security-completion-20261104.md)。

**後續已排除先前的 Vercel 建置阻擋：**開發分支 `e94a09b` 的 Preview 於 2026-11-04 確認 `READY`，Vercel build log 已通過既有 Node.js 測試、TypeScript 與 Vite build；但 GitHub Actions `verify` / `test-and-build` 仍未取得獨立成功結果。後續新增的測試提交仍須再次確認其 Preview 結果。 本階段用戶已表明暫不處理備份及付費升級，但這不等於已取得正式環境資料風險的上線豁免。正式合併、RLS/Storage 切換和實際遷移仍需獨立明確核准。

## 2026-11-04 最新使用者回報（QA Preview）

使用者在 `e94a09b` Preview 建置成功後回覆「測試沒問題」，表示本輪 QA 手動操作已回報通過；這並不等同由自動瀏覽器自行取得細項測試證據，也不代表正式 Production 已驗證。30 天真實到期、停用後跨裝置即時撤銷與正式資料遷移仍需獨立驗證。

## 目前已由使用者驗收

- 30 天工作階段：同一固定 Preview 網域 F5 後可維持登入（尚未做真正 30 天到期測試）。
- 原版清潔四大項、子項目、照片操作、勾選後重新整理保存。
- 測試活動 A/B/C 的原版房間清單、活動管理、人員指派及共用日曆。
- 原版 A4 六／七／八人列印預覽。
- 登出、帳號切換後未顯示前一帳號房間，切換分頁後維持登入。
- 測試用私人照片權限、短效檢視連結、照片替換。
- 資料庫交易測試：新建房間、已儲存照片房間保護、清潔資料過期版本拒寫。

## 自動化/靜態核查

- `npm run build` / Vercel Preview READY。
- Supabase QA RLS：業務及登入表啟用 RLS 且無直接對 `anon` / `authenticated` 開放的策略。請勿把這理解為可以直接更改正式 RLS。
- QA 安全顧問資訊提示：RLS enabled no policy（屬目前採 server-side service role 方案的預期阻擋）。
- `api/_lib/qaGuard.js` 限制：只允許 QA Supabase `zhvrgluwoookxaglfjdw.supabase.co`，拒絕 `VERCEL_ENV=production`。
- `tests/qa-environment-guard.test.mjs` 列入開發分支 CI。
- 從未在此階段更新正式 Supabase 或 GitHub `main`。

## 正式上線前 **必須完成** 的阻擋條件

1. **正式資料庫唯讀盤點及備份**：查驗 `events`, `event_rooms`, `cleaners`, `rooms`，現有約束、欄位、函式、RLS、Storage 與實際照片位置；備份可還原驗證，保留回滾方式。
2. **正式帳號與 PIN 遷移方案**：現有帳號、原版 PIN 的安全雜湊轉換與新管理員授權；不可把 QA 帳號或 QA PIN 複製至正式環境。
3. **清除 QA 專用限制**：`api/_lib/qaGuard.js` 必須用審查過的正式環境 allowlist/組態替換；`hk_qa_*` RPC、`【權限驗收】` 前綴限制、固定活動 ID（9101/9102/9103）、照片桶 `hk-qa-cleaning-photos` 不得無修改地帶進正式。
4. **正式房間規則驗證**：預設房間組合、住宿活動、活動修改/刪除與照片保留，需依正式資料規則核對，避免錯誤新建 84 間或刪除舊資料。
5. **正式 Storage 保密/授權**：使用新的私人桶或經審核的現有桶，盤點原版舊照片 URL 的遷移方法；未登入不可讀，房務僅可讀被指派房間。
6. **正式 API 功能全面測試**：管理員、房務人員、失效工作階段、停用帳號、PIN 更換與撤銷、越權 ID、跨瀏覽器與手機；測試 GET/POST/PATCH/DELETE/PUT 的授權差異。
7. **列印與 UI 差異比對**：原版活動清單、房間卡片、照片檢視/上傳、統計、A4 6/7/8 人版型，與正式資料的實際情境一致。
8. **部署與回滾演練**：受保護的正式環境變數、Domain/Cookie 主機一致性、綠燈部署與切換、回滾 Vercel 部署、資料庫可回復方案。
9. **使用者明確核准正式切換**：在以上條件完整通過之前禁止合併 `main`、啟用正式 Supabase 或公開新正式站。

## 測試限制／未自動驗證

- ChatGPT 連接的瀏覽器控制工具未連線到使用者原本的分頁，無法假裝已親自登入點擊完成 E2E。
- 60 秒失效檢查、長時間閒置、真正第 30 天到期與多裝置同步撤銷仍需要有登入狀態的瀏覽器或隔離專門測試。
- Supabase QA 環境目前的 252 間活動 A/B/C 測試房間、測試照片與帳號不可視為正式資料。

## 提交與發版守則

所有改動繼續留在 `feature/remember-login-30d`。現階段最佳下一步是「在不修改正式環境的前提下建立正式資料唯讀盤點 + 回滾計畫」，接著處理 QA/正式雙環境組態抽象與完整 E2E，不應直接升級目前 Preview 為正式。
