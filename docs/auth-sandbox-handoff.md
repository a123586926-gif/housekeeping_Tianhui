# 30-day login: sandbox setup and handoff

This feature branch is NOT ready for production; production `main` must remain unchanged.

## A. Create an isolated Supabase test project (user action)
1. Open https://supabase.com/dashboard/projects and click **New project** in the existing organization.
2. Use a distinctive name such as `housekeeping-auth-test`. Do not delete, rename or alter the existing Housekeeping database.
3. Open **SQL Editor** in the new test project; run these SQL files IN ORDER from the feature branch:
   - `supabase/migrations/20261103_housekeeping_auth_foundation.sql`
   - `supabase/migrations/20261103_housekeeping_auth_rate_limit.sql`
4. Create a **new** test admin PIN by adapting the commented admin INSERT in the first SQL file. Do not paste the PIN, SQL result, or secret key into chat. Avoid reusing the current admin PIN.
5. Check **Table Editor** in the TEST project to confirm `housekeeping_auth_users`, `housekeeping_auth_sessions`, `housekeeping_auth_attempts` exist.
6. Do not copy real guest names, cleaner PINs or production data into test project.

## B. Preview deployment (not production)
- In Vercel, use a preview deployment from branch `feature/remember-login-30d`, **not main**.
- Configure these variables for Preview ONLY:
  - `HOUSEKEEPING_SUPABASE_URL`: the TEST Supabase URL
  - `HOUSEKEEPING_SUPABASE_SECRET_KEY`: server-only secret or legacy service-role key for that TEST project, marked Secret (never `VITE_`).
- Never expose `HOUSEKEEPING_SUPABASE_SECRET_KEY` in screenshot or browser bundle; never send it in chat.
- Auth API functions are staged, but **App.tsx still uses the old login** and existing app queries still point to the production Supabase URL. Do not use Preview with real data, and do not treat auth endpoints as an enabled solution.
- To test these endpoints from a browser safely we still need an isolated test page or automated tests. Do not send real PIN in chat.

## C. Before promoting to Production
- Audit current Supabase RLS for `events`, `event_rooms`, `cleaners`, `rooms`, storage `cleaning-photos`.
- Replace all direct browser requests with role-authorized server operations or equivalent JWT/RLS. The secure session cookie alone does **not** restrict the old Supabase publishable-key API.
- Keep original UI and all existing business functionality.
- Rotate the previously exposed hard-coded admin PIN before going live.
- Confirm fresh login, reload, browser restart, fixed 30-day expiry, logout revocation, failed PIN throttle, role restrictions and all CRUD regressions.
