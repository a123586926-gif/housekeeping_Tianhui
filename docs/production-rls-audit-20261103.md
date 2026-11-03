# Production RLS audit — screenshots reviewed 2026-11-03

## Observed (not inferred)
Supabase Dashboard > Database > Policies, schema public, shows RLS enabled (the button reads "Disable RLS") for:
- cleaners: cleaners_select_all / insert_all / update_all / delete_all, applied to anon
- events: events_select_all / insert_all / update_all / delete_all, applied to anon
- event_rooms: event_rooms_select_all / insert_all / update_all / delete_all, applied to anon
- rooms: rooms_select_all / insert_all / update_all / delete_all, applied to anon

Policy names/roles do **not** prove their USING / WITH CHECK expressions are permissive. Obtain the expressions before declaring unrestricted access.

## Blocker
Current src/App.tsx uses a public Supabase publishable key and direct .from(...) read/write APIs for these tables; PIN checking is client-side. No secure server-enforced authorization boundary has been verified. Do not deploy the new persistent-login feature alone while old anonymous paths can bypass it.

## Safe release sequence
1. Export/backup all data (events, event_rooms, rooms, cleaners, photo objects) and record active policies and their USING/WITH CHECK expressions.
2. Review Supabase Storage policies (especially cleaning-photos) and inspect functions, triggers, grants. Treat existing plaintext PIN column as sensitive: no redistribution in screenshots or logs.
3. In an isolated test environment, create and provision hk_auth_accounts and hk_auth_sessions, rotate admin PIN and migrate cleaner credentials without exposing them to browser.
4. Replace **all** browser-accessible CRUD and photo operations with session-protected endpoints (or verifiably scoped JWT + RLS), preserving UI and existing data formats. Do not expose service-role credentials to browser.
5. Test admin and cleaner authorization including direct unauthenticated requests, cross-user access, negative cases, and 30-day expiry/logout.
6. Only after all code paths are migrated, restrict/revoke legacy anon policies and deploy code + policy changes as a coordinated release with rollback.
7. Keep production main untouched until tests and approval.

## Next non-destructive user evidence
In Supabase > Database > Policies, open e.g. events_insert_all and events_select_all (do NOT save) and capture Applied to / USING / WITH CHECK, redacting personally identifying values and any secrets. Alternatively query pg_policies in SQL Editor as read-only, but no SQL execution is necessary for screenshot method.

## Confirmed policy expressions (2026-11-03 additional screenshots)
- `public.events` / `events_select_all`: target role `anon`, `USING (true)` — unrestricted row visibility for anonymous role.
- `public.events` / `events_insert_all`: target role `anon`, `WITH CHECK (true)` — anonymous inserts can pass RLS (subject to grants and table constraints).
- Anonymous role has separate SELECT/INSERT/UPDATE/DELETE policies listed on `cleaners`, `event_rooms`, `rooms`, and `events`; their remaining expressions have not been inspected.
- **Do not edit these policies before the protected API migration is fully implemented and verified.**

## Staged additions
- `api/auth/accounts.js` returns account selector labels without PIN data.
- `api/data/overview.js` is a read-only endpoint requiring server-validated sessions and restricting cleaner room results to their assigned rooms.
- Neither endpoint is yet used by the current UI. Existing browser requests remain unprotected by these new endpoints.
