import test from "node:test";
import assert from "node:assert/strict";
import { buildChecklist, buildDefaultEventRooms } from "../api/_lib/defaultRooms.js";

test("cleaning activities create exactly 84 unique rooms", () => {
  const rooms = buildDefaultEventRooms();
  assert.equal(rooms.length, 84);
  assert.equal(new Set(rooms.map(r => `${r.building}/${r.floor}/${r.room_no}`)).size, 84);
  assert.equal(rooms.filter(r => r.building === "A").length, 42);
  assert.equal(rooms.filter(r => r.building === "B").length, 42);
  for (const room of rooms) {
    assert.equal(room.checklist.length, 4);
    assert.equal(room.checklist.every(item => item.done === false && item.photo === false), true);
    assert.equal(room.checklist.every(item => item.subItems.every(sub => sub.done === false)), true);
  }
});
test("room templates do not share mutable checklist objects", () => {
  const rooms = buildDefaultEventRooms();
  rooms[0].checklist[0].subItems[0].done = true;
  assert.equal(rooms[1].checklist[0].subItems[0].done, false);
  assert.equal(buildChecklist()[0].subItems[0].done, false);
});
test("room IDs follow the existing UI room labels", () => {
  const rooms = buildDefaultEventRooms();
  assert.ok(rooms.some(r => r.building === "A" && r.floor === "2F" && r.room_no === "201"));
  assert.ok(rooms.some(r => r.building === "B" && r.floor === "RF" && r.room_no === "R8"));
});
