-- Auth rate-limit functions used by /api/auth/login.
-- Run AFTER 20261103_housekeeping_auth_foundation.sql in a TEST database first.
-- The service_role client alone may call these functions.
create or replace function public.housekeeping_auth_allow_attempt(p_key text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_until timestamptz;
begin
  if length(p_key) <> 64 or p_key !~ '^[a-f0-9]{64}$' then return false; end if;
  select blocked_until into v_until
  from public.housekeeping_auth_attempts
  where attempt_key = p_key;
  return v_until is null or v_until <= now();
end;
$$;

create or replace function public.housekeeping_auth_record_attempt(p_key text, p_success boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if length(p_key) <> 64 or p_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid rate limit key';
  end if;

  if p_success then
    delete from public.housekeeping_auth_attempts where attempt_key = p_key;
    return;
  end if;

  insert into public.housekeeping_auth_attempts(attempt_key, failed_count, blocked_until, updated_at)
  values(p_key, 1, null, now())
  on conflict(attempt_key) do update set
    failed_count = case
      when housekeeping_auth_attempts.updated_at < now() - interval '15 minutes'
      then 1 else housekeeping_auth_attempts.failed_count + 1 end,
    blocked_until = case
      when housekeeping_auth_attempts.updated_at < now() - interval '15 minutes'
      then null
      when housekeeping_auth_attempts.failed_count + 1 >= 5
      then now() + interval '15 minutes'
      else null end,
    updated_at = now();
end;
$$;

revoke all on function public.housekeeping_auth_allow_attempt(text) from public, anon, authenticated;
revoke all on function public.housekeeping_auth_record_attempt(text, boolean) from public, anon, authenticated;
grant execute on function public.housekeeping_auth_allow_attempt(text) to service_role;
grant execute on function public.housekeeping_auth_record_attempt(text, boolean) to service_role;
