# Housekeeping — 30-day sign-in implementation gate

## Baseline and non-regression
- Production main commit: `f260e654aaf6f8afec8713c6aad906755adbb899`.
- The work on `feature/remember-login-30d` is isolated. Do NOT merge or deploy until the acceptance checklist below passes.
- Keep the current account selector, PIN input, login/logout buttons, admin/cleaner view, activities, rooms, checklists, images, calendars and A4 printing.
- `src/lib/authSession.ts` is currently **unused** and does NOT enable remember-me by itself.

## Security prerequisites (must be finished before wiring the UI)
1. Move PIN checking off the client. Remove the hard-coded admin PIN and stop fetching cleaners' plaintext PINs to the browser. Store verifier hashes on the server (e.g. Argon2id, with managed reset/rotation).
2. Add same-origin server-side endpoints:
   - `POST /api/auth/login`: validate input, rate-limit attempts, verify PIN on the server, issue a random opaque session identifier in an `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` cookie.
   - `GET /api/auth/session`: validate cookie against the server session record, return only minimal user identity/role and absolute expiration. Return `{ "authenticated": false }` for unauthenticated sessions.
   - `POST /api/auth/logout`: revoke session server-side and clear cookie.
3. Persist only a hash of the opaque session token in a database record with `user_id`, `role`, `created_at`, `expires_at`, `revoked_at`. Use a fixed 30-day expiry (not sliding). Ensure expired or revoked sessions cannot authorize any API call.
4. Put privileged Supabase access only in server-side environment variables, never in `VITE_` variables. Check and restrict RLS policies. **The old public browser Supabase writes must not remain an authorization bypass.**
5. Protect all reads and writes of `cleaners`, `events`, `event_rooms`, photos/storage, and related tables by user session/role, via server APIs or correctly enforced RLS. Audit all UI call sites before deployment.
6. Add CSRF protection for state-changing cookie-authenticated requests, plus origin checks, input validation, no PIN logging, and account/session revocation on credential changes.
7. Migrate existing PINs securely; do not delete existing rows or modify production database without verified backups and a reversible migration plan.

## Required acceptance tests
- Login success and failure for each role; invalid PIN rate limiting.
- F5, tab close/reopen and browser restart restore session (same browser).
- Session expires no later than 30 days from original login; no unintended refresh extension.
- Logout and PIN change invalidate old sessions.
- Cleaner cannot call admin endpoints directly, not just hide UI controls.
- Fresh install/new browser does not inherit an existing session.
- Existing activity CRUD, room assignment and checklists, person management, photo upload, calendar and A4 print retain original behavior.
- Reproduce tests in a non-production environment before approving any deployment.

## Current status
Only typed browser API helpers are staged as a foundation; no endpoint is implemented and the app still uses its original login behavior. Do not claim 30-day remember-me is finished.
