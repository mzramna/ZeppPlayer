import { test } from "node:test";
import assert from "node:assert/strict";
import { state, reset, respond, openOnce as open, texts, findText, click, flush } from "./helpers/watch.js";
import { emitGesture, emitDigitalCrown, GESTURE_LEFT, GESTURE_RIGHT } from "./mocks/zos/interaction.js";

const SENSORS = [
  { entity_id: "sensor.main_power", name: "Main Power", state: "1200", unit: "W", attributes: { device_class: "power" } },
  { entity_id: "sensor.daily_energy", name: "Daily Energy", state: "14.5", unit: "kWh", attributes: { device_class: "energy" } },
  { entity_id: "sensor.water_meter", name: "Water Meter", state: "340", unit: "L", attributes: { device_class: "water" } },
  { entity_id: "sensor.gas_consumption", name: "Gas Consumption", state: "2.1", unit: "m³", attributes: { device_class: "gas" } },
  { entity_id: "sensor.outdoor_temperature", name: "Outdoor Temp", state: "22", unit: "°C", attributes: {} },
];

function setup(entities = SENSORS) {
  reset();
  state.strings = {
    energy: "Energy",
    no_entities: "No entities",
  };
  respond({ GET_ENTITIES: entities });
}

test("energy page loads and displays title, tabs and first tab items", async () => {
  setup();
  const page = await open("page/energy/index.js");
  const t = texts();
  assert.ok(t.includes("Energy"), "page title shown");
  assert.ok(t.includes("⚡"), "electricity tab icon");
  assert.ok(t.includes("💧"), "water tab icon");
  assert.ok(t.includes("🔥"), "gas tab icon");
  assert.ok(t.includes("📊"), "other tab icon");
  assert.ok(t.includes("Main Power"), "electricity sensor shown");
  assert.ok(t.includes("Daily Energy"), "second electricity sensor shown");
  page.onDestroy();
});

test("energy page tab switching via tab button tap", async () => {
  setup();
  const page = await open("page/energy/index.js");
  const waterTab = findText("💧");
  assert.ok(waterTab);
  await click(waterTab);
  const t = texts();
  assert.ok(t.includes("Water Meter"), "water sensor shown after clicking water tab");
  assert.ok(!t.includes("Main Power"), "electricity sensors hidden");
  page.onDestroy();
});

test("energy page lateral swipe advances tabs left and back right", async () => {
  setup();
  const page = await open("page/energy/index.js");
  assert.ok(texts().includes("Main Power"));

  // Swipe left: moves to water tab
  const handledLeft = emitGesture(GESTURE_LEFT);
  await flush();
  assert.equal(handledLeft, true);
  assert.ok(texts().includes("Water Meter"), "swiped left to water");

  // Swipe left again: moves to gas tab
  emitGesture(GESTURE_LEFT);
  await flush();
  assert.ok(texts().includes("Gas Consumption"), "swiped left to gas");

  // Swipe right: goes back to water tab
  const handledRight = emitGesture(GESTURE_RIGHT);
  await flush();
  assert.equal(handledRight, true);
  assert.ok(texts().includes("Water Meter"), "swiped right back to water");

  page.onDestroy();
});

test("energy page crown scroll paginates items when more than page size", async () => {
  const manyElectricity = Array.from({ length: 7 }, (_, i) => ({
    entity_id: `sensor.power_${i}`,
    name: `Power ${i}`,
    state: `${100 + i}`,
    unit: "W",
    attributes: { device_class: "power" },
  }));
  setup(manyElectricity);
  const page = await open("page/energy/index.js");

  assert.ok(texts().includes("1/2"), "shows pagination indicator");
  assert.ok(texts().includes("Power 0"));
  assert.ok(!texts().includes("Power 5"));

  // Crown scroll forward
  emitDigitalCrown(1);
  await flush();
  assert.ok(texts().includes("2/2"), "moved to page 2");
  assert.ok(texts().includes("Power 5"), "shows item from page 2");

  // Crown scroll backward
  emitDigitalCrown(-1);
  await flush();
  assert.ok(texts().includes("1/2"), "moved back to page 1");

  page.onDestroy();
});

test("energy page shows empty state message when a tab has no entities", async () => {
  setup([]);
  const page = await open("page/energy/index.js");
  assert.ok(texts().includes("No entities"), "empty state text shown");
  page.onDestroy();
});
