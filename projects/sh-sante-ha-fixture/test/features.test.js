import { test } from "node:test";
import assert from "node:assert/strict";
import { MEDIA_FEATURE, supportsBrightness, supportsColorTemp, supportsColor, lightModes } from "../utils/features.js";
import { supportsFeature } from "../utils/controls.js";
import { isInteractive, isSensor, energyCategory, filterEnergy } from "../utils/groups.js";

test("supportsBrightness is true for any mode except onoff", () => {
  assert.equal(supportsBrightness(["onoff"]), false);
  assert.equal(supportsBrightness([]), false);
  assert.equal(supportsBrightness(undefined), false);
  assert.equal(supportsBrightness(["brightness"]), true);
  assert.equal(supportsBrightness(["onoff", "color_temp"]), true);
  assert.equal(supportsBrightness(["rgb"]), true);
});

test("supportsColorTemp checks color modes or color temp attributes", () => {
  assert.equal(supportsColorTemp(["color_temp"]), true);
  assert.equal(supportsColorTemp(["rgbww"]), true);
  assert.equal(supportsColorTemp(["xy"]), true);
  assert.equal(supportsColorTemp(["onoff"]), false);
  assert.equal(supportsColorTemp(undefined), false);
  // Via attributes
  assert.equal(supportsColorTemp([], { color_temp: 300 }), true);
  assert.equal(supportsColorTemp([], { color_temp_kelvin: 4000 }), true);
  assert.equal(supportsColorTemp([], { min_color_temp_kelvin: 2000 }), true);
  assert.equal(supportsColorTemp([], { min_mireds: 153 }), true);
  assert.equal(supportsColorTemp([], {}), false);
});

test("supportsColor checks color modes or hs/rgb attributes", () => {
  assert.equal(supportsColor(["hs"]), true);
  assert.equal(supportsColor(["rgb"]), true);
  assert.equal(supportsColor(["rgbw"]), true);
  assert.equal(supportsColor(["rgbww"]), true);
  assert.equal(supportsColor(["color_temp"]), false);
  assert.equal(supportsColor(undefined), false);
  // Via attributes
  assert.equal(supportsColor([], { hs_color: [10, 100] }), true);
  assert.equal(supportsColor([], { rgb_color: [255, 0, 0] }), true);
  assert.equal(supportsColor([], {}), false);
});

test("lightModes returns list of supported mode tabs", () => {
  assert.deepEqual(lightModes(["onoff"]), []);
  assert.deepEqual(lightModes(["brightness"]), ["brightness"]);
  assert.deepEqual(lightModes(["color_temp"]), ["brightness", "color_temp"]);
  assert.deepEqual(lightModes(["rgb"]), ["brightness", "color"]);
  assert.deepEqual(lightModes(["color_temp", "hs"]), ["brightness", "color_temp", "color"]);
  assert.deepEqual(lightModes([], { color_temp: 200 }), ["color_temp"]);
});

test("media feature bits are checked with supportsFeature", () => {
  const supported = MEDIA_FEATURE.PAUSE | MEDIA_FEATURE.NEXT_TRACK;
  assert.equal(supportsFeature(supported, MEDIA_FEATURE.PAUSE), true);
  assert.equal(supportsFeature(supported, MEDIA_FEATURE.NEXT_TRACK), true);
  assert.equal(supportsFeature(supported, MEDIA_FEATURE.PREVIOUS_TRACK), false);
  assert.equal(supportsFeature(undefined, MEDIA_FEATURE.PAUSE), false);
});

test("groups helpers: isInteractive, isSensor, energyCategory, filterEnergy", () => {
  assert.equal(isInteractive({ entity_id: "light.bulb" }), true);
  assert.equal(isInteractive({ entity_id: "media_player.living_room" }), true);
  assert.equal(isInteractive({ entity_id: "sensor.temp" }), false);

  assert.equal(isSensor({ entity_id: "sensor.power" }), true);
  assert.equal(isSensor({ entity_id: "binary_sensor.door" }), true);
  assert.equal(isSensor({ entity_id: "camera.front" }), true);
  assert.equal(isSensor({ entity_id: "switch.outlet" }), false);

  const eEnergy = { entity_id: "sensor.power", unit: "kW" };
  const eWater = { entity_id: "sensor.water", unit: "L" };
  const eGas = { entity_id: "sensor.gas", unit: "ft³" };
  const eOther = { entity_id: "sensor.cumulative", attributes: { state_class: "total" } };
  const eNon = { entity_id: "light.living_room" };

  assert.equal(energyCategory(eEnergy), "electricity");
  assert.equal(energyCategory(eWater), "water");
  assert.equal(energyCategory(eGas), "gas");
  assert.equal(energyCategory(eOther), "other");
  assert.equal(energyCategory(eNon), null);

  assert.equal(filterEnergy([eEnergy, eWater, eGas, eOther, eNon]).length, 4);
});
