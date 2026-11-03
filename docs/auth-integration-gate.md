# Housekeeping authenticated API integration gate (2026-11-03)

## Staged on this branch (not deployed)
- `api/auth/login.js`, `session.js`, `logout.js`, `accounts.js`
- `api/data/overview.js`: logged-in-only activity/room read, cleaner limited to assigned room.
- `api/data/cleaners.js`: logged-in admin-only read; never exposes cleaner PINs.
- `api/data/event-update.js`: logged-in admin-only event update with validated inputs.
- `api/data/room-update.js`: logged-in user update; cleaner limited to own assigned room and checklist/status/photo fields.
- `api/_lib/validation.js`: whitelists and payload validation.
- `tests/auth-validators.test.js`: isolated unit tests (not yet CI verified).

## Still needed before replacing existing frontend calls
- Transactional create/delete of events and their default rooms.
- Room creation/removal and synchronization of room assignment, occupant, status.
- Cleaner add/edit, PIN hash update, safe credential rotation and revoking sessions.
- Secure object upload/download and photo metadata update; Storage policy migration.
- Authenticated, role-scoped queries for every read/write in App.tsx.
- Session restore / login/logout UX in existing App.tsx; avoid showing private data before verification.
- Data backups, migration of existing account PINs, and closing the old anon policies.
- End-to-end testing on a separate Supabase project and preview Vercel deployment.
- Verify that `api/_lib/auth.js` and `supabase/migrations/20261103_hk_auth_staging.sql` are compatible with chosen Vercel runtime and Supabase extension setup.

## Safety and rollout
DO NOT merge this branch into main or put service role credentials in VITE_ environment variables.
DO NOT disable existing anonymous RLS policies until **all** client Supabase paths have moved to authenticated endpoints; otherwise production breaks.
Never place real credential data in GitHub files, chat, screenshots or tests.

## Unit test command (run on a checkout of this branch)
`node --test tests/auth-validators.test.js`

## Acceptance blocker
30-day sessions are NOT yet enabled; the deployed app still uses old in-browser PIN checking.
