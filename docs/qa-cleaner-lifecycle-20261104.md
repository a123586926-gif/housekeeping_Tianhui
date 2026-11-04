# Housekeeping｜QA 人員生命週期驗證紀錄
日期：2026-11-04（台灣）
狀態：**QA 資料庫唯讀確認、離線生命週期模擬已建立；實際 QA 寫入整合測試仍未完成。**

## 本次完成

1. 事先核查 QA 資料庫的 `hk_qa_manage_cleaner`、`hk_qa_provision_pin`、`hk_verify_login` 函式定義。核查確認：新增帳號時建立停用身分、設定 PIN 時啟用、改名時更新原房間 `assigned_to`、停用時停用 `cleaners` 與 `hk_auth_accounts` 並撤銷 `hk_auth_sessions`。此為程式定義核查，**不是實際執行成功證據**。
2. 只讀確認既有受保護測試照片房間 `9401` 屬於活動 `9200`，進度已完成且存有照片；**沒有拿這個房間做修改測試**。
3. 原本計畫在資料庫單一交易中建立獨立房務／房間、驗證 PIN／登入／改名／指派／停用，最後全部 ROLLBACK。但安全檢查阻擋了此操作。**未成功執行該測試、不得聲稱回滾成功**。
4. 阻擋後未繞過安全限制，改新增 `tests/qa-cleaner-lifecycle-simulation.test.mjs`：在純記憶體模擬原函式契約，測試（a）建立後停用（b）僅管理員可設定 PIN（c）登入有效（d）房間指派（e）改名同步、保留進度（f）停用撤銷舊 session、禁止重新登入（g）房間歷史保留（h）非 QA 身分不可操作（i）不存在人員不能被停用。
5. 將模擬檔加入 `package.json` 的 `test:cleaner-lifecycle` 與 GitHub Actions CI。
6. Vercel 目前回報 `build-rate-limit`，**沒有新增測試的 CI/Preview 成功執行紀錄**。
7. QA 資料庫唯讀確認（此輪核查時）：`cleaners=3`、`hk_auth_accounts=4`、`hk_auth_sessions=33`、`event_rooms=339`、已指派房間 `7`；專用測試名稱與專用房間皆 **0 筆**，停用卻持有效 session 的帳號 **0 筆**。Session 數包含歷史紀錄；這些數字不是人工刪除後的結果。
8. 正式網站、正式 Supabase、GitHub `main` 未修改。開發分支 `feature/remember-login-30d` 持續隔離。

## 尚未完成

- 針對獨立 QA 的**真實新增→設定 PIN→登入→指派→改名→停用→撤銷登入**資料庫整合實測。因受安全檢查阻擋，僅保留離線模擬與唯讀確認。
- 新增模擬測試之成功 CI / Preview 執行結果（目前 Vercel 建置限速）。
- 使用具有登入狀態的瀏覽器測試管理員與房務角色。
- 正式六位人員與新帳號遷移、正式版 DB 權限及照片授權切換。

## 下一階段

優先補齊**不會修改正式資料**的 API 契約測試（未登入 401／非管理員 403／PIN 錯誤及停用後 session 失效），並在可允許的隔離 QA 測試工具與測試帳號條件下驗證端到端操作。避免再修改已驗收的 QA 既有帳號與照片房間。

> 使用者已決定暫緩備份與 Supabase 方案升級；不因本輪工作改動正式環境。
