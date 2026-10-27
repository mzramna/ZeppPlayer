// shared/validate.js: the parsing and name checks shared by the phone side and the settings page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ENTITY_ID, NAME, parseJson, readList } from "../shared/validate.js";

test("ENTITY_ID and NAME accept only Home Assistant's format", () => {
  assert.equal(ENTITY_ID.test("light.kitchen_1"), true);
  assert.equal(ENTITY_ID.test("light"), false);
  assert.equal(ENTITY_ID.test("Light.Kitchen"), false);
  assert.equal(NAME.test("mobile_app_pixel_8"), true);
  assert.equal(NAME.test("mobile-app"), false);
  assert.equal(NAME.test("a.b"), false);
});

test("parseJson returns the value, or the fallback for corrupt text, null and undefined", () => {
  assert.deepEqual(parseJson("[1]", null), [1]);
  assert.equal(parseJson("nope", "fallback"), "fallback");
  assert.equal(parseJson("null", "fallback"), "fallback");
  assert.equal(parseJson(undefined, 7), 7);
  assert.equal(parseJson(null, 7), 7);
});

test("readList returns arrays only and [] for anything else", () => {
  assert.deepEqual(readList("[1,2]"), [1, 2]);
  assert.deepEqual(readList('{"a":1}'), []);
  assert.deepEqual(readList(""), []);
  assert.deepEqual(readList(null), []);
});
