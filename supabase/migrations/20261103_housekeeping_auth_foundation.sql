-- Housekeeping authentication foundation. Review and run in a TEST Supabase project first.
-- Does not alter public.cleaners, public.events, public.event_rooms or public.rooms.
-- Requires the pgcrypto extension. Never paste production PINs in GitHub.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.housekeeping_auth_users (
  user_id text primary key,
  display_name text not null,
  role text not null check (role in ('admin', 'cleaner')),
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.housekeeping_auth_sessions (
  token_hash text primary key,
  user_id text not null references public.housekeeping_auth_users(user_id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint housekeeping_session_expiry check (expires_at > created_at)
);

create index if not exists idx_housekeeping_auth_sessions_user
  on public.housekeeping_auth_sessions (user_id, expires_at);

create table if not exists public.housekeeping_auth_attempts (
  attempt_key text primary key,
  failed_count integer not null default 0,
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.housekeeping_auth_users enable row level security;
alter table public.housekeeping_auth_sessions enable row level security;
alter table public.housekeeping_auth_attempts enable row level security;

revoke all on public.housekeeping_auth_users from anon, authenticated;
revoke all on public.housekeeping_auth_sessions from anon, authenticated;
revoke all on public.housekeeping_auth_attempts from anon, authenticated;

-- This function is server-only, callable via service_role; it never returns the hash.
create or replace function public.housekeeping_verify_pin(p_user_id text, p_pin text)
returns table(user_id text, display_name text, role text)
language sql security definer set search_path = public, extensions
as $$
  select u.user_id, u.display_name, u.role
  from public.housekeeping_auth_users u
  where u.user_id = p_user_id
    and u.active
    and u.pin_hash = extensions.crypt(p_pin, u.pin_hash)
  limit 1;
$$;
revoke all on function public.housekeeping_verify_pin(text, text) from public, anon, authenticated;
grant execute on function public.housekeeping_verify_pin(text, text) to service_role;

-- Provisioning examples, to run manually in the Supabase SQL Editor after reviewing.
-- Replace the placeholder with a NEW, private PIN, then do not save the query with secrets:
-- insert into public.housekeeping_auth_users(user_id, display_name, role, pin_hash)
-- values ('admin', 'admin', 'admin', extensions.crypt('REPLACE_WITH_NEW_ADMIN_PIN', extensions.gen_salt('bf')))
-- on conflict (user_id) do update set pin_hash=excluded.pin_hash, active=true;
--
-- For each existing cleaner, provision from the existing PIN in a private SQL session:
-- insert into public.housekeeping_auth_users(user_id, display_name, role, pin_hash)
-- select 'cleaner-' || id::text, name, 'cleaner',
--        extensions.crypt(pin, extensions.gen_salt('bf'))
-- from public.cleaners where is_active = true
-- on conflict (user_id) do update set display_name=excluded.display_name,
--                                    pin_hash=excluded.pin_hash, active=true;
--
-- IMPORTANT: Until ALL app data calls have authorization enforcement, do not relax
-- existing policies, do not make a production deployment, and do not drop plaintext PIN columns.
