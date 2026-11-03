# Isolated 30-day login QA handoff (2026-11-03)

## What is now implemented
- `src/AuthSandbox.tsx` provides a standalone UI that calls `/api/auth/accounts`, `/api/auth/login`, `/api/auth/session`, and `/api/auth/logout`.
- `vite.config.ts` switches the HTML entry to `src/authSandboxMain.tsx` **only when** `VITE_AUTH_SANDBOX=enabled` is set at build time; otherwise the normal `src/main.tsx` mounts the original `App.tsx` unchanged. This ensures the auth-only bundle does not import the legacy UI or its hardcoded PIN.
- The sandbox never imports or mounts the room/activity/cleaner UI and never directly connects to Supabase browser tables.
- The sandbox never stores PIN or session tokens. The browser only receives the server-issued HttpOnly cookie.
- Session restore is checked at page initialization. F5 should preserve identity and the original absolute expiry. Logout must revoke the session.

## Release gate — do NOT switch production yet
0. Confirm the preview build output excludes the legacy App chunk, and inspect the resulting HTML module entry. Never put Production Supabase public URL/key into the preview sandbox bundle.
1. Create a separate test Supabase project with no real guest/personnel data; install the audited `hk_auth_*` schema and functions there, not the conflicting `housekeeping_auth_*` draft. Reconcile duplicate draft families before any real migration.
2. Provision a dedicated TEST admin account with a fresh PIN entered privately, never in chat/GitHub.
3. Configure the Vercel **Preview only** secret environment variables `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for the TEST Supabase project; never prefix the service key with `VITE_`.
4. Configure Vercel **Preview only** `VITE_AUTH_SANDBOX=enabled`. The production value MUST remain unset. Env updates need a fresh preview deployment.
5. Run the preview login tests: first login, F5, browser restart, expiry unchanged, logout, wrong PIN, and 5-attempt lockout. Confirm cookie is HttpOnly and no PIN is stored in local/session storage.
6. Before integrating into App.tsx: replace all public browser Supabase CRUD + Storage operations with session-protected equivalents, remove admin/cleaner PINs from frontend, safely migrate accounts, then coordinate closure of permissive anon RLS policies.
7. Do not turn on session login on existing production UI until all authorization and original Housekeeping workflow regression checks pass.

## Known limitations
- This is an isolated QA view, NOT the final live login integration.
- Login APIs currently use `hk_auth_accounts` and `hk_auth_sessions`, not `housekeeping_auth_users` and `housekeeping_auth_sessions`.
- The current source has a second, incompatible `server/auth-core.mjs` and `housekeeping_*` migration family; keep unused and never run both.
- No staging credentials, SQL migrations, or browser tests have been executed as part of this commit.
