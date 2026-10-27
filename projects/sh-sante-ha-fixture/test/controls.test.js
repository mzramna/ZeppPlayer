import { test } from "node:test";
import assert from "node:assert";
import {
  COVER_FEATURE, VACUUM_FEATURE, supportsFeature, pickHvacModes, rowX, alarmPolicy,
} from "../utils/controls.js";

test("cover feature bits", () => {
  assert.equal(supportsFeature(15, COVER_FEATURE.OPEN), true);
  assert.equal(supportsFeature(15, COVER_FEATURE.SET_POSITION), true);
  assert.equal(supportsFeature(1 | 2, COVER_FEATURE.STOP), false);
  assert.equal(supportsFeature(undefined, COVER_FEATURE.CLOSE), false);
});

test("hvac modes: common ones first, at most four, current kept visible", () => {
  assert.deepEqual(pickHvacModes(["dry", "heat", "off", "auto", "cool"]), ["off", "heat", "cool", "auto"]);
  assert.deepEqual(pickHvacModes(["dry", "heat"], "heat"), ["heat", "dry"]);
  assert.deepEqual(pickHvacModes(undefined, "off"), []);
  assert.deepEqual(pickHvacModes(["off", "heat", "cool", "auto", "dry", "fan_only"], "dry"), ["off", "heat", "cool", "dry"]);
});

test("button rows are centred", () => {
  assert.deepEqual(rowX(2, 160, 16), [72, 248]);
  assert.deepEqual(rowX(1, 100), [190]);
});

test("alarm code policy", () => {
  assert.deepEqual(alarmPolicy({}), { needsCode: false, canArm: true, canDisarm: true });
  assert.deepEqual(alarmPolicy({ code_format: "number", code_arm_required: true }),
    { needsCode: true, canArm: false, canDisarm: false });
  assert.deepEqual(alarmPolicy({ code_format: "number", code_arm_required: false }),
    { needsCode: true, canArm: true, canDisarm: false });
});

test("vacuum feature bits", () => {
  const features = 4 | 8192;
  assert.equal(supportsFeature(features, VACUUM_FEATURE.START), true);
  assert.equal(supportsFeature(features, VACUUM_FEATURE.PAUSE), true);
  assert.equal(supportsFeature(features, VACUUM_FEATURE.RETURN_HOME), false);
  assert.equal(supportsFeature(features, VACUUM_FEATURE.LOCATE), false);
});
