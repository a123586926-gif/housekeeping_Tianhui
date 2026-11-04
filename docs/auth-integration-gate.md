# Housekeeping 安全整合狀態（2026-11-04）

此文件原先描述「尚未部署」的初期開發狀況，現已更新。

## 現況
- 原版 `src/App.tsx` 已接上隔離測試 Supabase 的伺服器 API。
- QA Vercel Preview `feature/remember-login-30d` 已完成多輪登入、清潔清單、房間、人員、活動、照片及列印驗收。
- 固定 Preview 網域有 30 天 HttpOnly Cookie，F5、登出與跨帳號隔離已由使用者驗收。
- 僅允許 QA Supabase 的服務端連線、拒絕 Vercel Production，詳見 `api/_lib/qaGuard.js`。
- 不得把 QA 配置或測試資料遷入正式版。

## 統一的正式上線門檻
請見 `docs/preproduction-go-no-go-20261104.md`。其中列出：
- QA 專用 RPC/桶名/活動前綴限制及正式替代設計。
- 正式資料庫唯讀盤點、備份回復、RLS/Storage 及 PIN 遷移。
- 原版 UI 回歸、跨裝置及 30 天到期測試。
- 合併 `main` 前需有明確核准。

**當前狀態：NO-GO**。目前沒有對正式網站、正式 Supabase 或 GitHub main 的更新。
