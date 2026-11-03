-- Staging only. DO NOT execute in production before backup and release rehearsal.
-- These functions run atomically within their PostgreSQL statements.
-- They are only callable through a trusted service-role server endpoint.

create or replace function public.hk_create_event_with_rooms(
  p_event_date date, p_event_name text, p_event_type text, p_notes text,
  p_rooms jsonb default '[]'::jsonb
) returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_event_id bigint;
begin
  if p_event_date is null or nullif(btrim(p_event_name), '') is null
     or length(p_event_name) > 120
     or p_event_type is null or p_event_type not in ('活動','一般活動')
     or length(coalesce(p_notes, '')) > 2000
     or jsonb_typeof(p_rooms) <> 'array'
     or jsonb_array_length(p_rooms) > 84
  then
    raise exception 'Invalid event';
  end if;

  if (p_event_type = '活動' and jsonb_array_length(p_rooms) <> 84)
     or (p_event_type = '一般活動' and jsonb_array_length(p_rooms) <> 0)
  then
    raise exception 'Unexpected room count';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_rooms) as x(building text, floor text, room_no text, checklist jsonb)
    where x.building is null or x.building not in ('A','B')
      or x.floor is null or x.floor not in ('2F','3F','5F','6F','7F','RF')
      or x.room_no is null or x.room_no !~ '^[0-9R]{1,3}
  values (p_event_date,btrim(p_event_name),p_event_type,'未開始',coalesce(p_notes,''))
  returning id into v_event_id;

  insert into public.event_rooms (
    event_id,building,floor,room_no,assigned_to,occupant,progress,status,
    checklist,guest_name,stay_status,cleaning_status,cleaning_progress,cleaner_id,room_id
  )
  select v_event_id, r.building, r.floor, r.room_no, '未分配', '', 0, 'pending',
         r.checklist, null, '空房', '未開始', 0, null, null
  from jsonb_to_recordset(p_rooms) as r(
    building text, floor text, room_no text, checklist jsonb
  );
  return v_event_id;
end;
$$;

create or replace function public.hk_delete_event_with_rooms(p_event_id bigint)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_deleted_id bigint;
begin
  if p_event_id is null or p_event_id <= 0 then
    raise exception 'Invalid event id';
  end if;
  -- Both deletes are in one transaction; failures roll back both operations.
  delete from public.event_rooms where event_id = p_event_id;
  delete from public.events where id = p_event_id returning id into v_deleted_id;
  return v_deleted_id is not null;
end;
$$;

revoke all on function public.hk_create_event_with_rooms(date,text,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.hk_delete_event_with_rooms(bigint)
  from public, anon, authenticated;
grant execute on function public.hk_create_event_with_rooms(date,text,text,text,jsonb)
  to service_role;
grant execute on function public.hk_delete_event_with_rooms(bigint)
  to service_role;

      or x.checklist is null or jsonb_typeof(x.checklist) <> 'array'
  ) then
    raise exception 'Invalid room template';
  end if;

  insert into public.events (event_date,event_name,event_type,status,notes)
  values (p_event_date,btrim(p_event_name),p_event_type,'未開始',coalesce(p_notes,''))
  returning id into v_event_id;

  insert into public.event_rooms (
    event_id,building,floor,room_no,assigned_to,occupant,progress,status,
    checklist,guest_name,stay_status,cleaning_status,cleaning_progress,cleaner_id,room_id
  )
  select v_event_id, r.building, r.floor, r.room_no, '未分配', '', 0, 'pending',
         r.checklist, null, '空房', '未開始', 0, null, null
  from jsonb_to_recordset(p_rooms) as r(
    building text, floor text, room_no text, checklist jsonb
  );
  return v_event_id;
end;
$$;

create or replace function public.hk_delete_event_with_rooms(p_event_id bigint)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare v_deleted_id bigint;
begin
  if p_event_id is null or p_event_id <= 0 then
    raise exception 'Invalid event id';
  end if;
  -- Both deletes are in one transaction; failures roll back both operations.
  delete from public.event_rooms where event_id = p_event_id;
  delete from public.events where id = p_event_id returning id into v_deleted_id;
  return v_deleted_id is not null;
end;
$$;

revoke all on function public.hk_create_event_with_rooms(date,text,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.hk_delete_event_with_rooms(bigint)
  from public, anon, authenticated;
grant execute on function public.hk_create_event_with_rooms(date,text,text,text,jsonb)
  to service_role;
grant execute on function public.hk_delete_event_with_rooms(bigint)
  to service_role;
