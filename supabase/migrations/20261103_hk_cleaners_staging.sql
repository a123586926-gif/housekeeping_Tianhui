-- STAGING ONLY: run in an isolated test Supabase project after hk_auth_staging.sql.
-- Functions execute as invoker (service_role when called by the server).
-- They do not store plaintext PINs. The legacy cleaners.pin column receives a
-- random non-credential marker pending safe removal in the coordinated rollout.
-- Do not expose old anon SELECT policies during the rollout.

create or replace function public.hk_create_cleaner(
  p_name text, p_pin text
) returns bigint
language plpgsql security invoker
set search_path = public, extensions, pg_temp
as $$
declare v_id bigint;
begin
  if p_name is null or length(btrim(p_name)) not between 1 and 80
     or p_pin is null or p_pin !~ '^[0-9]{6,12}$'
     or p_pin ~ '^([0-9])\1+$'
     or p_pin in ('123456','12345678','123456789','1234567890','012345','000000')
  then raise exception 'Invalid cleaner data'; end if;

  -- A transaction-scoped lock prevents two simultaneous requests from inserting
  -- the same normalized name. Preserve the UI rule of unique active names.
  perform pg_advisory_xact_lock(hashtext('hk-cleaner-names'));
  if exists (select 1 from public.cleaners where name = btrim(p_name) and is_active = true)
  then raise exception 'Cleaner name exists'; end if;

  insert into public.cleaners (name, pin, is_active)
  values (btrim(p_name), 'unused-' || gen_random_uuid()::text, true)
  returning id into v_id;

  insert into public.hk_auth_accounts (user_id, display_name, role, pin_hash)
  values ('cleaner-' || v_id::text, btrim(p_name), 'cleaner',
          extensions.crypt(p_pin, extensions.gen_salt('bf',12)));
  return v_id;
end;
$$;

create or replace function public.hk_update_cleaner(
  p_id bigint, p_name text, p_new_pin text default null
) returns boolean
language plpgsql security invoker
set search_path = public, extensions, pg_temp
as $$
declare v_old_name text;
begin
  if p_id is null or p_id <= 0 or p_name is null
     or length(btrim(p_name)) not between 1 and 80
  then raise exception 'Invalid cleaner data'; end if;
  if p_new_pin is not null and (
     p_new_pin !~ '^[0-9]{6,12}$'
     or p_new_pin ~ '^([0-9])\1+$'
     or p_new_pin in ('123456','12345678','123456789','1234567890','012345','000000')
  ) then raise exception 'Invalid new PIN'; end if;

  perform pg_advisory_xact_lock(hashtext('hk-cleaner-names'));
  select name into v_old_name from public.cleaners where id = p_id for update;
  if not found then return false; end if;
  if exists (select 1 from public.cleaners where id <> p_id
       and name = btrim(p_name) and is_active = true)
  then raise exception 'Cleaner name exists'; end if;

  update public.cleaners set name = btrim(p_name) where id = p_id;
  update public.event_rooms
     set assigned_to = btrim(p_name), cleaner_id = p_id
   where assigned_to = v_old_name;
  if p_new_pin is null then
    update public.hk_auth_accounts
       set display_name = btrim(p_name)
     where user_id = 'cleaner-' || p_id::text;
  else
    update public.hk_auth_accounts
       set display_name = btrim(p_name),
           pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf',12)),
           failed_attempts = 0, locked_until = null
     where user_id = 'cleaner-' || p_id::text;
  end if;
  if not found then raise exception 'Auth account missing'; end if;

  -- Revoke outstanding sessions on name or PIN changes, so claims cannot
  -- carry stale identity or continue after a credential change.
  if btrim(p_name) <> v_old_name or p_new_pin is not null then
    update public.hk_auth_sessions set revoked_at = now()
      where user_id = 'cleaner-' || p_id::text and revoked_at is null;
  end if;
  return true;
end;
$$;

revoke all on function public.hk_create_cleaner(text,text)
  from public, anon, authenticated;
revoke all on function public.hk_update_cleaner(bigint,text,text)
  from public, anon, authenticated;
grant execute on function public.hk_create_cleaner(text,text) to service_role;
grant execute on function public.hk_update_cleaner(bigint,text,text) to service_role;
