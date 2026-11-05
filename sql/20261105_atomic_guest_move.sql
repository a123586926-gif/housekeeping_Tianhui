-- Atomic cross-room movement of a single EXACT guest name, within one activity.
-- Called only by the server via the service-role connection.
create or replace function public.hk_move_guest_atomic(
 p_from_room_id bigint,
 p_to_room_id bigint,
 p_name text,
 p_expected_from text,
 p_expected_to text
) returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
 src public.event_rooms%rowtype;
 dst public.event_rooms%rowtype;
 source_names text[];
 target_names text[];
 idx integer;
 next_source text;
 next_target text;
begin
 if p_from_room_id is null or p_to_room_id is null or p_from_room_id=p_to_room_id
    or p_name is null or length(btrim(p_name))<1 or length(p_name)>100
    or p_name<>btrim(p_name) or p_name ~ E'[\\n\\r\\t、,，]'
    or p_expected_from is null or p_expected_to is null then
    raise exception 'INVALID_MOVE';
 end if;

 -- Lock in a deterministic order to avoid deadlock across simultaneous moves.
 perform id from public.event_rooms
   where id in (p_from_room_id,p_to_room_id)
   order by id for update;
 select * into src from public.event_rooms where id=p_from_room_id;
 if not found then raise exception 'ROOM_NOT_FOUND'; end if;
 select * into dst from public.event_rooms where id=p_to_room_id;
 if not found then raise exception 'ROOM_NOT_FOUND'; end if;
 if src.event_id<>dst.event_id then raise exception 'DIFFERENT_ACTIVITY'; end if;
 if coalesce(src.occupant,'')<>p_expected_from or
    coalesce(dst.occupant,'')<>p_expected_to then
    raise exception 'ROOM_CHANGED'; end if;

 select coalesce(array_agg(name order by ord),array[]::text[]) into source_names
   from (select btrim(x) as name,ord
     from unnest(regexp_split_to_array(coalesce(src.occupant,''),E'[\\n\\r、,，]+')) with ordinality as t(x,ord)
     where length(btrim(x))>0) q;
 select coalesce(array_agg(name order by ord),array[]::text[]) into target_names
   from (select btrim(x) as name,ord
     from unnest(regexp_split_to_array(coalesce(dst.occupant,''),E'[\\n\\r、,，]+')) with ordinality as t(x,ord)
     where length(btrim(x))>0) q;
 idx:=array_position(source_names,p_name);
 if idx is null then raise exception 'GUEST_NOT_IN_ROOM'; end if;
 if p_name=any(target_names) then raise exception 'DESTINATION_ALREADY_HAS_GUEST'; end if;
 select coalesce(array_agg(name order by ord),array[]::text[]) into source_names
   from unnest(source_names) with ordinality as t(name,ord) where ord<>idx;
 target_names:=array_append(target_names,p_name);
 next_source:=array_to_string(source_names,'、');
 next_target:=array_to_string(target_names,'、');
 if length(next_source)>3000 or length(next_target)>3000 then raise exception 'ROOM_GUEST_LIMIT'; end if;

 update public.event_rooms set occupant=next_source,
   guest_name=nullif(next_source,''),
   stay_status=case when next_source='' then '空房' else '住宿中' end
 where id=p_from_room_id;
 update public.event_rooms set occupant=next_target,
   guest_name=nullif(next_target,''),
   stay_status='住宿中'
 where id=p_to_room_id;
 return true;
end;
$$;
revoke all on function public.hk_move_guest_atomic(bigint,bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.hk_move_guest_atomic(bigint,bigint,text,text,text) to service_role;
