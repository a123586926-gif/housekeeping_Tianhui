# Housekeeping 正式 Supabase 唯讀盤點與遷移/回滾方案
盤點日期：2026-11-04（台灣時間）  
狀態：**NO-GO / 正式環境未修改**  
正式 Supabase 專案：`xmdznhkkvtohwxkahisr`  
隔離 QA 專案：`zhvrgluwoookxaglfjdw`

## 1. 唯讀盤點（僅查詢中繼資料、彙總計數；未匯出任何 PIN 或住客資料）

| 正式表 / 物件 | 現況 |
| --- | --- |
| public.events | 2 筆（皆為「活動」） |
| public.event_rooms | 168 筆，兩筆活動各 84 間；全部 checklist 為非空陣列 |
| public.rooms | 5 筆主檔；**168 筆活動房間的 room_id 全部 NULL** |
| public.cleaners | 6 筆、6 筆啟用；3 筆含舊版 PIN 欄位資料、3 筆未設定 |
| 已分配房間 | 僅 1 筆具有實際 assigned_to 名稱，且 cleaner_id 非 NULL；其餘 assigned_to 多為預設值 |
| public.hk_auth_accounts / hk_auth_sessions | 目前未建立 |
| storage.buckets | `cleaning-photos`，`public=true`，沒有檔案大小與 MIME 限制 |
| storage.objects | `cleaning-photos` 1 個物件，約 1,589,759 bytes |
| event_rooms 照片引用 | 新/舊欄位都沒有非 NULL 的照片引用；Storage 物件應獨立清查後再決定遷移，**不可自動刪除** |
| public.events / event_rooms / cleaners / rooms RLS | 已啟用，每表四個匿名 SELECT/INSERT/UPDATE/DELETE 政策；條件普遍是 `true` |
| Table grants | `anon` 與 `authenticated` 具有 SELECT/INSERT/UPDATE/DELETE 等表權限 |
| Storage RLS | 對 `cleaning-photos` 的 SELECT/INSERT/UPDATE 政策適用 `public` 角色（允許匿名存取） |

**重大安全發現（現有正式系統，非本次導致）**：正式版目前匿名角色具有資料讀寫權限，照片桶也公開。請在完成安全版佈署和資料轉換的**同一個協調切換窗口**移除舊權限；不可事先撤銷造成舊版功能中斷。

Supabase advisors 另提示 `public.set_updated_at` 函式未固定 search_path：
https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

## 2. QA 與正式版結構／介面差異

1. QA 使用 `hk_auth_accounts`/`hk_auth_sessions`、`hk_verify_login` 等測試登入函式；正式不存在。正式人員資料保留 `cleaners.pin` 舊欄位，不能回傳前端、不能直接複製進 QA。
2. QA 活動/房間交易使用 `hk_create_event_with_rooms`、`hk_qa_create_room_full`、`hk_qa_delete_room`；正式沒有這些函式。正式已有 `rooms` 主檔但 `event_rooms.room_id` 目前未連結，需先決定是否維持以 `(event_id,building,floor,room_no)` 識別。
3. QA 存到私有桶 `hk-qa-cleaning-photos`；正式桶 `cleaning-photos` 為公開桶，且存在 1 個未被房間欄位引用的物件。正式要設新私有桶（獨立名稱）及有授權的讀取介面，再考慮搬移檔案。
4. QA 程式限制 `【權限驗收】` 前綴、測試事件 ID 9101/9102/9103、QA cleaner RPC。**不可在正式版留下這些限制**。
5. QA `api/_lib/qaGuard.js` 指定只能連測試 Supabase，且封鎖 Vercel Production。正式版需要經核准的正式環境 guard 與正式 Secret 管理；不能簡單移除此 guard。

## 3. 完整備份與還原門檻（尚未執行）

在正式切換窗口開始前：
- 對正式 Supabase 建立可恢復的資料庫備份或 verified PITR restore point；確認方案、保留期、可用時間點。
- 額外建立**加密、限制存取**的 schema + data export，至少包含 `events`, `event_rooms`, `rooms`, `cleaners`, 既有序列、RLS、GRANT、trigger/function 定義；不得把含 PIN 或個資的匯出提交 GitHub、聊天或公開儲存位置。
- 私人／公開 Storage 的物件必須獨立備份：保存物件的 bytes、metadata、路徑、bucket policy，再比對 object count/checksum。資料庫快照本身不等於完成 Storage 備份。
- 在**隔離回復環境**試還原並核對主要計數、關聯、照片完整性；記錄 restore time，確認不會覆寫正式資料。
- 備妥舊版 Vercel 部署回滾參照，並確認新資料表/RLS 改動能與舊版不相容時的**資料庫回滾流程**。不能只回滾前端而保留阻止匿名存取的新 RLS。
- 沒有成功的還原演練前，保持 NO-GO。

## 4. 正式安全切換順序（擬議，非已執行）

1. 先在獨立環境以**去識別化**的正式 schema/資料形狀驗證欄位、約束、清潔狀態、預設房間清單及照片關聯。
2. 書面確認正式帳號清單與管理員權限，採安全 PIN 初始化／分別通知，不在前端或聊天公開密碼。把舊 `cleaners.pin` 停用前確保所有帳號能以新雜湊機制登入。
3. 建立正式相容的 auth/RPC、私有 Storage 和 server-only API；所有正式機密只放 Vercel Server env。先在正式域名以受限方式驗證，避免對外放行未驗證端點。
4. 指定受控切換時段，暫停寫入或採交易一致的同步策略，對 database + storage 再做最後一次備份、數量校對；切換前不影響舊版。
5. 以**協調變更**方式部署已核准的安全版、收緊 anon 的表 RLS 與 Storage 匿名讀寫；檢查管理員、房務人員的正負向操作，並檢查是否有舊端點／公開圖片遺留。
6. 確認流程成功後才能解除寫入暫停；監控錯誤率、照片上傳、房間清潔進度及會話撤銷，並保留明確回滾判斷條件。
7. 需使用者明確批准才合併 main / 切換正式站與正式資料庫。

## 5. 驗證矩陣（仍待執行）

- 管理員：活動增刪改查、房間 84 間預設、指派／入住者、清潔統計、列印 6/7/8 人、照片。
- 房務：僅能看自身房間；不同房務人員越權讀寫應 403；共用日曆可讀、管理工具不可用。
- 登入：F5、Cookie Host-only、30 天固定到期、停用帳號、多裝置、PIN 更換全部撤銷。
- Storage：未登入 401；跨房間 403；私有連結 60 秒到期；重新上傳不殘留孤兒檔；禁止惡意檔案 MIME。
- 同步：同房間多裝置修改 stale checklist 回 409、重新載入可恢復，不會遺失已寫入資料。
- 正式回復：從 DB + Storage 備份在隔離系統還原，確認對應數量與檔案 checksums。

## 6. 本次工作範圍與保護聲明

本次只對正式 Supabase 執行 SELECT/中繼資料查詢；未執行 INSERT、UPDATE、DELETE、DDL、還原或備份操作。沒有取得或展示任何 PIN 值、住客名、住客照片內容。文件僅寫入 GitHub 開發分支。正式 GitHub `main`、正式網站、正式 Supabase 保持不變。


## 7. 2026-11-04 進一步房間規則相容性驗證（唯讀）

對正式 `events.id = 19, 20` 執行集合差異查詢（只比較 `event_id,building,floor,room_no`，不取得個資）：

- 兩個活動各 **84** 間，棟別／樓層／房號唯一鍵各 **84** 組。
- 與原版 `A/B × 2F/3F/5F/6F/7F/RF × 1/2/3/5/6/7/8` 對照：**缺少 0、額外 0**。
- 清潔項目均包含四大項 `flooring`, `surface_cleaning`, `bed_setup`, `bathroom`，總計各 168 筆；`flooring` 和 `bathroom` 的照片需求也都是 168 筆。
- 所有 168 筆 `event_rooms.room_id` 均為 NULL，**不應據此重新建立房間或刪除現有紀錄**。
- 167 間未指派，僅 1 間有房務 `cleaner_id`。不得在遷移中清空現有指派。
- 新增 `server/production-compatibility.mjs`：純函式審核既有房間鍵、ID、四大清潔項與是否有缺漏／重複。**沒有連線、寫入、建房或匯出真實房間資料能力**。
- 新增 `tests/production-compatibility.test.mjs`：用虛構資料覆蓋完整 168 間、缺漏、重複、錯誤房號、照片必拍條件、不合法活動 ID。
- 加入 `.github/workflows/auth-branch-checks.yml` 的 CI；不存放正式資料庫列或 PIN。

驗證結論：**現有正式活動與測試版原始 84 間規則相容，未來應沿用既有 id/room_no/checklist 而非重新 seed**。但資料庫備份、正式帳號遷移、Storage 私有化與可還原演練仍尚未完成；保持 NO-GO。
