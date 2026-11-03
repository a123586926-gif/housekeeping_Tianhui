# Cleaner management / 30-day login — staged implementation

## Branch-only changes (not deployed)
- api/_lib/cleanerValidation.js — cleaner name and new PIN validation, never returns old PIN.
- api/data/cleaner-create.js — authenticated administrator only; creates cleaner through atomic RPC.
- api/data/cleaner-update.js — authenticated administrator only; renames worker and optionally rotates PIN.
- supabase/migrations/20261103_hk_cleaners_staging.sql — staging-only functions for cleaner creation, update, hash storage, room assignment sync and session revocation.
- tests/cleaner-validation.test.js — regression tests for PIN validation and omitted PIN semantics.
- .github/workflows/auth-branch-checks.yml — includes new tests.

## Compatibility rules
- Existing cleaner add/edit modal's visual layout remains unchanged.
- After switching to the secure API, an edit form must leave PIN blank by default; blank must be sent as omitted (no PIN rotation). Existing PINs must never be read back to the browser.
- New/rotated PINs: 6–12 digits; reject repeated digits and trivial common values. Existing weaker PINs require explicit planned migration/rotation.
- After a successful PIN or name change, existing sessions for that worker are revoked, requiring reauthentication.
- Current frontend directly fetches cleaners.pin and verifies PIN in App.tsx; NOT yet migrated. This is still a release blocker.
- The legacy cleaners.pin column receives a random non-authenticator marker from the new provisioning RPC. This is only safe after the old direct PIN login and anon access have been disabled in a coordinated release.
- Create/rename operations and room assignment sync use transactional PostgreSQL functions to avoid partial updates.

## Blocking work and verification
- Ensure migration SQL is compatible with the actual cleaners/event_rooms schemas, triggers and constraints in a separate test project.
- Verify that concurrent same-name requests cannot create duplicates, and that a failed room sync rolls back the cleaner update.
- Verify that failed login is rate-limited, and user session revocation works after PIN change.
- Migrate existing users without copying plaintext PINs to logs or GitHub.
- Move all browser CRUD and Storage reads/writes to verified server endpoints, then close all anon RLS policies.
- Complete frontend integration + isolated end-to-end testing, including existing activity/room/list/print behavior.
- Current feature branch has a reported Vercel check failure; check deployment logs before preview testing.
- Never merge this branch or run staging SQL in production before all gates pass.
