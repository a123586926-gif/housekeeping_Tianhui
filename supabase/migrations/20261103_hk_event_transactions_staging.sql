-- ISOLATED STAGING ONLY. Never apply to production without explicit release approval,
-- validated backups, a schema review, and a reversible migration rehearsal.
-- This source was repaired after detecting a truncated regex and repeated SQL body.
-- API uses hk_create_event_with_rooms for an atomic event plus room insertion.
CREATE OR REPLACE FUNCTION public.hk_create_event_with_rooms(
  p_event_date date, p_event_name text, p_event_type text, p_notes text,
  p_rooms jsonb DEFAULT '[]'::jsonb
) RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_event_id bigint;
BEGIN
  IF p_event_date IS NULL
     OR NULLIF(btrim(p_event_name), '') IS NULL
     OR length(btrim(p_event_name)) > 120
     OR p_event_type IS NULL OR p_event_type NOT IN ('活動','一般活動','住宿')
     OR length(coalesce(p_notes, '')) > 2000
     OR jsonb_typeof(p_rooms) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_rooms) > 84
     OR (p_event_type IN ('活動','住宿') AND jsonb_array_length(p_rooms) <> 84)
     OR (p_event_type = '一般活動' AND jsonb_array_length(p_rooms) <> 0)
  THEN RAISE EXCEPTION 'Invalid event'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rooms) AS room(value)
    WHERE jsonb_typeof(room.value) IS DISTINCT FROM 'object'
      OR room.value->>'building' NOT IN ('A','B')
      OR room.value->>'floor' NOT IN ('2F','3F','5F','6F','7F','RF')
      OR room.value->>'room_no' !~ '^[A-Za-z0-9]{1,8}$'
      OR jsonb_typeof(room.value->'checklist') IS DISTINCT FROM 'array'
  ) THEN RAISE EXCEPTION 'Invalid room template'; END IF;

  -- Prevent duplicate keys in an event before any database writes.
  IF (SELECT count(DISTINCT (room.value->>'building',room.value->>'floor',room.value->>'room_no'))
      FROM jsonb_array_elements(p_rooms) AS room(value)) <> jsonb_array_length(p_rooms)
  THEN RAISE EXCEPTION 'Duplicate room template'; END IF;

  INSERT INTO public.events (event_date,event_name,event_type,status,notes)
  VALUES (p_event_date,btrim(p_event_name),p_event_type,'未開始',coalesce(p_notes,''))
  RETURNING id INTO v_event_id;

  INSERT INTO public.event_rooms (
    event_id,building,floor,room_no,assigned_to,occupant,progress,status,
    checklist,guest_name,stay_status,cleaning_status,cleaning_progress,cleaner_id,room_id
  )
  SELECT v_event_id,r.building,r.floor,r.room_no,'未分配','',0,'pending',
         r.checklist,NULL,'空房','未開始',0,NULL,NULL
  FROM jsonb_to_recordset(p_rooms)
       AS r(building text,floor text,room_no text,checklist jsonb);
  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.hk_delete_event_with_rooms(p_event_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_deleted_id bigint;
BEGIN
  IF p_event_id IS NULL OR p_event_id <= 0
  THEN RAISE EXCEPTION 'Invalid event id'; END IF;
  -- This function is a staged building block only. The API must enforce
  -- fixture, photo and staff authorization rules before invocation.
  DELETE FROM public.event_rooms WHERE event_id = p_event_id;
  DELETE FROM public.events WHERE id = p_event_id RETURNING id INTO v_deleted_id;
  RETURN v_deleted_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.hk_create_event_with_rooms(date,text,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hk_delete_event_with_rooms(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hk_create_event_with_rooms(date,text,text,text,jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.hk_delete_event_with_rooms(bigint)
  TO service_role;
