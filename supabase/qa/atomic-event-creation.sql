-- ISOLATED QA DATABASE ONLY (zhvrgluwoookxaglfjdw).
-- Do NOT apply to production without separate schema review.
-- Creates the atomic event + default room RPC used by /api/data/event-create.
-- Invocation requires the private server-side service_role key.
create or replace function public.hk_create_event_with_rooms(
 p_event_date date, p_event_name text, p_event_type text, p_notes text, p_rooms jsonb
) returns bigint
language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare new_id bigint;
begin
 if p_event_date is null or nullif(btrim(p_event_name),'') is null
   or length(p_event_name)>120
   or p_event_type not in ('活動','一般活動')
   or length(coalesce(p_notes,''))>2000
   or jsonb_typeof(p_rooms) is distinct from 'array'
   or jsonb_array_length(p_rooms)>120
   or (p_event_type='一般活動' and jsonb_array_length(p_rooms)<>0)
 then raise exception 'Invalid event data'; end if;

 if exists(
   select 1 from jsonb_array_elements(p_rooms) as item
   where jsonb_typeof(item)<>'object'
      or item->>'building' not in ('A','B')
      or item->>'floor' not in ('2F','3F','5F','6F','7F','RF')
      or length(coalesce(item->>'room_no','')) not between 1 and 12
      or jsonb_typeof(item->'checklist') is distinct from 'array'
 ) then raise exception 'Invalid room data'; end if;

 insert into public.events(event_date,event_name,event_type,status,notes)
 values(p_event_date,btrim(p_event_name),p_event_type,'未開始',coalesce(p_notes,''))
 returning id into new_id;

 insert into public.event_rooms(
   event_id,building,floor,room_no,assigned_to,occupant,status,progress,checklist,
   guest_name,stay_status,cleaning_status,cleaning_progress
 )
 select new_id,x.building,x.floor,x.room_no,'未分配','','pending',0,x.checklist,
   null,'空房','未開始',0
 from jsonb_to_recordset(p_rooms) as x(building text,floor text,room_no text,checklist jsonb);

 return new_id;
end
$$;
revoke all on function public.hk_create_event_with_rooms(date,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.hk_create_event_with_rooms(date,text,text,text,jsonb) to service_role;
