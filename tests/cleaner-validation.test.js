import test from "node:test";
import assert from "node:assert/strict";
import { validCleanerName, validNewPin, parseCleanerCreate, parseCleanerUpdate } from "../api/_lib/cleanerValidation.js";

test("validates cleaner names", () => {
  assert.equal(validCleanerName("測試人員"), true);
  assert.equal(validCleanerName("   "), false);
  assert.equal(validCleanerName("a".repeat(81)), false);
  assert.equal(validCleanerName("x\n"), false);
});
test("new PIN requires at least six nontrivial digits", () => {
  assert.equal(validNewPin("827406"), true);
  assert.equal(validNewPin("1234"), false);
  assert.equal(validNewPin("123456"), false);
  assert.equal(validNewPin("999999"), false);
  assert.equal(validNewPin("abcd1234"), false);
});
test("create endpoint validation does not accept invalid data", () => {
  assert.deepEqual(parseCleanerCreate({ name: " 王阿姨 ", pin: "827406" }), {
    name: "王阿姨", pin: "827406",
  });
  assert.equal(parseCleanerCreate({ name: "王阿姨", pin: "1234" }), null);
});
test("editing without a PIN keeps existing credentials intact", () => {
  assert.deepEqual(parseCleanerUpdate({ name: " 王阿姨 " }), { name: "王阿姨", pin: null });
  assert.deepEqual(parseCleanerUpdate({ name: "王阿姨", pin: "827406" }), {
    name: "王阿姨", pin: "827406",
  });
  assert.equal(parseCleanerUpdate({ name: "王阿姨", pin: "" }), null);
});
