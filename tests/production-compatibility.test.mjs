import test from "node:test";
import assert from "node:assert/strict";
import {buildDefaultEventRooms} from "../api/_lib/defaultRooms.js";
import {auditExistingRooms} from "../server/production-compatibility.mjs";

const makeRooms=(eventIds=[19,20])=>eventIds.flatMap((eventId,ei)=>
  buildDefaultEventRooms().map((room,index)=>({
    ...room,id:ei*84+index+1,event_id:eventId,room_id:null,
  })));

test("legacy production 2×84 room layouts reuse original IDs without backfilling room_id",()=>{
  const rows=makeRooms();
  const results=auditExistingRooms(rows,[19,20]);
  assert.equal(results.safeToReuseExistingRows,true);
  assert.equal(results.expectedRooms,168);
  assert.equal(results.existingRows,168);
  assert.equal(results.errors.length,0);
  assert.equal(results.eventSummaries[0].missingMasterLinks,84);
  assert.equal(rows[0].id,1);
  assert.equal(rows[0].room_id,null);
});
test("missing room is a blocker, not an instruction to insert it",()=>{
  const r=auditExistingRooms(makeRooms().slice(1),[19,20]);
  assert.equal(r.safeToReuseExistingRows,false);
  assert.equal(r.eventSummaries[0].missing,1);
});
test("unexpected and duplicate room keys are blocked",()=>{
  const rooms=makeRooms();
  rooms[0]={...rooms[0],room_no:"INVALID"};
  let r=auditExistingRooms(rooms,[19,20]);
  assert.equal(r.safeToReuseExistingRows,false);
  assert.equal(r.eventSummaries[0].extra,1);
  assert.equal(r.eventSummaries[0].missing,1);
  rooms[0]={...rooms[1],id:rooms[0].id};
  r=auditExistingRooms(rooms,[19,20]);
  assert.equal(r.eventSummaries[0].duplicates,1);
});
test("checklist shape with wrong photo requirements is blocked",()=>{
  const rooms=makeRooms();
  rooms[0].checklist[0].requiredPhoto=false;
  const r=auditExistingRooms(rooms,[19,20]);
  assert.equal(r.safeToReuseExistingRows,false);
  assert.equal(r.eventSummaries[0].invalidChecklists,1);
});
test("input from an unapproved event is rejected",()=>{
  const rooms=makeRooms();
  rooms[0].event_id=200;
  assert.equal(auditExistingRooms(rooms,[19,20]).safeToReuseExistingRows,false);
});
test("invalid event set is rejected",()=>{
  assert.throws(()=>auditExistingRooms([],[]),TypeError);
  assert.throws(()=>auditExistingRooms([],[19,19]),TypeError);
});
