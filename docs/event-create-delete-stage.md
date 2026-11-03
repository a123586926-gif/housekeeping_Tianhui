# Stage: protected event create/delete (2026-11-03)

## Delivered in feature branch only
- `api/_lib/defaultRooms.js`: server-generated existing 84 room template + four item checklists.
- `api/data/event-create.js`: admin session + origin check + strict event validation; calls transactional create RPC.
- `api/data/event-delete.js`: admin session + origin check + id validation; calls transactional delete RPC.
- `supabase/migrations/20261103_hk_event_transactions_staging.sql`: privileged SQL RPCs designed to insert/delete event + rooms atomically.
- `tests/default-rooms.test.js`: regression tests.
- `.github/workflows/auth-branch-checks.yml`: check on feature branch push and PR builds.

## Not activated
- No live database migration.
- No changes to `src/App.tsx`.
- No Vercel Production deployment.
- Do not run these APIs against production until authenticated session tables, accounts, protected CRUD and Storage rules are operational.

## Safety and remaining issues
- Event deletion leaves photos in storage; define deletion/retention policy.
- Changing existing event type to or from cleaning needs an atomic room sync plan.
- All old client-side direct Supabase operations remain until the new backend is complete.
- End-to-end tests must verify that malformed/default-room mismatches roll back events and rooms as one transaction.
- CI only checks local code/build; it does not validate RLS, SQL migrations, Vercel behavior or data integrity.
- Test database must be separate from the production Supabase project and must not contain copied real guest PINs or identifying data.
