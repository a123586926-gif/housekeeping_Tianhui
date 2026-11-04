import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDefaultEventRooms } from "../api/_lib/defaultRooms.js";
import { validateEvent } from "../api/_lib/validation.js";

const sql=readFileSync(new URL("../supabase/migrations/20261103_hk_event_transactions_staging.sql",import.meta.url),"utf8");
test("staging SQL has exactly one complete event create and delete function",()=>{
  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION public\.hk_create_event_with_rooms\(/g)||[]).length,1);
  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION public\.hk_delete_event_with_rooms\(/g)||[]).length,1);
  assert.equal((sql.match(/\$\$/g)||[]).length,4);
  assert.match(sql,/Duplicate room template/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.hk_create_event_with_rooms/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.hk_delete_event_with_rooms/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.hk_create_event_with_rooms/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.hk_delete_event_with_rooms/);
});
test("staging SQL and API agree on activity types and default room counts",()=>{
  for(const type of ["活動","一般活動","住宿"]){
    const event=validateEvent({event_date:"2026-11-04",event_name:"【權限驗收】活動",event_type:type});
    assert.equal(event?.event_type,type);
    assert.ok(sql.includes("'"+type+"'"),type);
  }
  const rooms=buildDefaultEventRooms();
  assert.equal(rooms.length,84);
  assert.equal(new Set(rooms.map(r=>r.building+"/"+r.floor+"/"+r.room_no)).size,84);
  assert.match(sql,/p_event_type = '活動' AND jsonb_array_length\(p_rooms\) <> 84/);
  assert.match(sql,/p_event_type <> '活動' AND jsonb_array_length\(p_rooms\) <> 0/);
});
test("staging migration is explicitly non-production and inserts rooms atomically",()=>{
  assert.match(sql,/Never apply to production/);
  assert.match(sql,/INSERT INTO public\.events/);
  assert.match(sql,/INSERT INTO public\.event_rooms/);
  assert.match(sql,/SECURITY INVOKER/g);
  assert.doesNotMatch(sql,/SECURITY DEFINER/);
});
