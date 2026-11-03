-- Housekeeping authentication staging migration.
-- DO NOT run against production until backup, RLS audit and staged test are completed.
-- New tables only; does not modify existing events, event_rooms, rooms, or cleaners.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.hk_auth_accounts (
  user_id text primary key check (user_id ~ '^(admin|cleaner-[0-9]+)$'),
  display_name text not null,
  role text not null check (role in ('admin','cleaner')),
  pin_hash text not null,
  active boolean not null default true,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.hk_auth_sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id text not null references public.hk_auth_accounts(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint max_session_lifetime check (expires_at <= created_at + interval '30 days')
);
create index if not exists hk_auth_sessions_user_idx on public.hk_auth_sessions(user_id);
create index if not exists hk_auth_sessions_expiry_idx on public.hk_auth_sessions(expires_at);

alter table public.hk_auth_accounts enable row level security;
alter table public.hk_auth_sessions enable row level security;
revoke all on public.hk_auth_accounts from anon, authenticated;
revoke all on public.hk_auth_sessions from anon, authenticated;

-- The function is callable by service_role only. Credential checking and
-- lockout updates happen transactionally with a row lock.
create or replace function public.hk_verify_login(p_user_id text, p_pin text)
returns table (verified_user_id text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  a public.hk_auth_accounts%rowtype;
begin
  if p_user_id is null or p_pin is null or length(p_pin) < 4 or length(p_pin) > 128 then
    return;
  end if;

  select * into a from public.hk_auth_accounts
  where user_id = p_user_id for update;

  if not found or not a.active then return; end if;
  if a.locked_until is not null and a.locked_until > now() then return; end if;

  if extensions.crypt(p_pin, a.pin_hash) = a.pin_hash then
    update public.hk_auth_accounts
    set failed_attempts = 0, locked_until = null
    where user_id = p_user_id;
    verified_user_id := a.user_id;
    return next;
  else
    update public.hk_auth_accounts
    set failed_attempts = case when a.failed_attempts >= 4 then 0 else a.failed_attempts + 1 end,
        locked_until = case when a.failed_attempts >= 4 then now() + interval '15 minutes' else null end
    where user_id = p_user_id;
  end if;
end;
$$;

revoke all on function public.hk_verify_login(text, text) from public, anon, authenticated;
grant execute on function public.hk_verify_login(text, text) to service_role;

-- Provision users through a private, privileged migration script, not the public client.
-- Example only; replace credentials locally, NEVER paste PINs into chat or GitHub:
-- insert into public.hk_auth_accounts(user_id, display_name, role, pin_hash)
-- values ('admin', 'admin', 'admin', extensions.crypt('SET_A_NEW_STRONG_PIN', extensions.gen_salt('bf', 12)));
-- Cleaner ids should correspond to existing cleaner-${id} identifiers; keep existing rows untouched.

-- Before enabling these auth endpoints:
-- Audit and close existing direct anon/client writes to cleaners/events/event_rooms/storage.
-- Route existing CRUD through session-checked server functions or establish JWT/RLS
-- policies that verify a server-issued identity. This migration alone does NOT secure them.
