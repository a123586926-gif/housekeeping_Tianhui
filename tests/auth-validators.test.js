import test from "node:test";
import assert from "node:assert/strict";
import { validId, validDate, validateEvent, validateRoomPatch } from "../api/_lib/validation.js";

test("database ids must be positive integers", () => {
  assert.equal(validId(1), true);
  assert.equal(validId("42"), true);
  for (const bad of [0, -1, "1.2", "abc", null, undefined]) {
    assert.equal(validId(bad), false);
  }
});
test("date validation rejects impossible dates", () => {
  assert.equal(validDate("2026-11-04"), true);
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2026-13-01"), false);
});
test("event data is strictly selected from allowed fields", () => {
  assert.deepEqual(validateEvent({
    event_date: "2026-11-04", event_name: " TEST ", event_type: "活動",
    notes: "備註", unauthorized: "blocked",
  }), {
    event_date: "2026-11-04", event_name: "TEST", event_type: "活動", notes: "備註",
  });
  assert.equal(validateEvent({ event_date: "2026-11-04", event_name: "", event_type: "活動" }), null);
});
test("room changes reject forbidden columns", () => {
  assert.equal(validateRoomPatch({ event_id: 5 }), null);
  assert.equal(validateRoomPatch({ id: 6 }), null);
  assert.equal(validateRoomPatch({ progress: 101 }), null);
  assert.deepEqual(validateRoomPatch({ status: "completed", progress: 100 }), {
    status: "completed", progress: 100,
  });
});
