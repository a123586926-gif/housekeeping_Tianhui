-- V2.5: append-only revisions of room guest lists, independent of photo/checklist writes.
create table if not exists public.hk_guest_revisions (
  id bigint generated always as identity primary key,
  room_id bigint not null,
  event_id bigint not null,
  previous_names text not null,
  current_names text not null,
  changed_at timestamptz not null default now()
);
create index if not exists hk_guest_revisions_room_changed_idx
  on public.hk_guest_revisions(room_id,changed_at desc,id desc);
alter table public.hk_guest_revisions enable row level security;
revoke all on table public.hk_guest_revisions from public,anon,authenticated;
grant select,insert on table public.hk_guest_revisions to service_role;
grant usage,select on sequence public.hk_guest_revisions_id_seq to service_role;

create or replace function public.hk_record_guest_revision()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
begin
  if old.occupant is distinct from new.occupant then
    insert into public.hk_guest_revisions(room_id,event_id,previous_names,current_names)
    values(new.id,new.event_id,coalesce(old.occupant,''),coalesce(new.occupant,''));
  end if;
  return new;
end;
$$;
drop trigger if exists hk_guest_revision_after_change on public.event_rooms;
create trigger hk_guest_revision_after_change
after update of occupant on public.event_rooms
for each row execute function public.hk_record_guest_revision();

create or replace function public.hk_restore_guest_revision(
  p_revision_id bigint,
  p_expected_current text
) returns boolean
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  revision public.hk_guest_revisions%rowtype;
  current_room public.event_rooms%rowtype;
begin
  if p_revision_id is null or p_revision_id<=0 or p_expected_current is null
    or length(p_expected_current)>3000 then
    raise exception 'INVALID_RESTORE';
  end if;
  select * into revision from public.hk_guest_revisions
    where id=p_revision_id;
  if not found then raise exception 'REVISION_NOT_FOUND'; end if;
  select * into current_room from public.event_rooms
    where id=revision.room_id and event_id=revision.event_id for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if coalesce(current_room.occupant,'')<>p_expected_current then
    raise exception 'ROOM_CHANGED';
  end if;
  if coalesce(current_room.occupant,'')=revision.previous_names then
    return true;
  end if;
  update public.event_rooms set
    occupant=revision.previous_names,
    guest_name=nullif(revision.previous_names,''),
    stay_status=case when btrim(revision.previous_names)='' then '空房' else '住宿中' end
    where id=revision.room_id;
  return true;
end;
$$;
revoke all on function public.hk_record_guest_revision() from public,anon,authenticated;
revoke all on function public.hk_restore_guest_revision(bigint,text) from public,anon,authenticated;
grant execute on function public.hk_restore_guest_revision(bigint,text) to service_role;
