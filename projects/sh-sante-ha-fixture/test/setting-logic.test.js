import { test } from "node:test";
import assert from "node:assert/strict";
import * as logic from "../setting/logic.js";
import { isInteractive, isSensor, energyCategory, filterEnergy } from "../utils/groups.js";

test("tabs: normalization and list of tabs", () => {
  assert.deepEqual(logic.SETTINGS_TABS, ["access", "favorites", "entities", "areas", "energy"]);
  assert.equal(logic.normalizeTab("access"), "access");
  assert.equal(logic.normalizeTab("favorites"), "favorites");
  assert.equal(logic.normalizeTab("entities"), "entities");
  assert.equal(logic.normalizeTab("areas"), "areas");
  assert.equal(logic.normalizeTab("energy"), "energy");
  assert.equal(logic.normalizeTab("unknown"), "access");
  assert.equal(logic.normalizeTab(undefined), "access");
});

test("isInteractive and isSensor classify domains correctly", () => {
  assert.equal(isInteractive("light.living_room"), true);
  assert.equal(isInteractive("switch.kitchen"), true);
  assert.equal(isInteractive("climate.thermostat"), true);
  assert.equal(isInteractive("cover.garage"), true);
  assert.equal(isInteractive("script.movie_mode"), true);
  assert.equal(isInteractive("scene.relax"), true);
  assert.equal(isInteractive("automation.morning"), true);
  assert.equal(isInteractive("button.doorbell"), true);
  assert.equal(isInteractive({ key: "fan.bedroom" }), true);
  assert.equal(isInteractive({ entity_id: "vacuum.cleaner" }), true);
  assert.equal(isInteractive({ domain: "lock" }), true);

  assert.equal(isInteractive("sensor.temp"), false);
  assert.equal(isInteractive("binary_sensor.motion"), false);
  assert.equal(isInteractive("camera.front"), false);
  assert.equal(isInteractive("unsupported.x"), false);
  assert.equal(isInteractive(null), false);

  assert.equal(isSensor("sensor.power"), true);
  assert.equal(isSensor("binary_sensor.door"), true);
  assert.equal(isSensor("camera.patio"), true);
  assert.equal(isSensor({ key: "sensor.temp" }), true);
  assert.equal(isSensor({ entity_id: "sensor.temp" }), true);
  assert.equal(isSensor({ domain: "camera" }), true);

  assert.equal(isSensor("light.kitchen"), false);
  assert.equal(isSensor("switch.socket"), false);
  assert.equal(isSensor(null), false);
});

test("filterEntities handles search, type (interactive, sensors, all), and favorites", () => {
  const list = [
    { key: "light.ceiling", title: "Ceiling Light" },
    { key: "switch.coffee", title: "Coffee Maker" },
    { key: "sensor.power", title: "Main Power" },
    { key: "sensor.temp", title: "Room Temperature" },
    { key: "camera.front", title: "Front Door" },
    { key: "unsupported.device", title: "Unsupported" },
  ];

  // Default interactive filter
  const interactive = logic.filterEntities(list, { type: "interactive" });
  assert.deepEqual(interactive.map((e) => e.key), ["light.ceiling", "switch.coffee"]);

  // Sensors filter
  const sensors = logic.filterEntities(list, { type: "sensors" });
  assert.deepEqual(sensors.map((e) => e.key), ["sensor.power", "sensor.temp", "camera.front"]);

  // All supported filter
  const all = logic.filterEntities(list, { type: "all" });
  assert.deepEqual(all.map((e) => e.key), ["light.ceiling", "switch.coffee", "sensor.power", "sensor.temp", "camera.front"]);

  // Search by text (key or title)
  const searchedKey = logic.filterEntities(list, { search: "coffee", type: "all" });
  assert.deepEqual(searchedKey.map((e) => e.key), ["switch.coffee"]);
  const searchedTitle = logic.filterEntities(list, { search: "Room", type: "all" });
  assert.deepEqual(searchedTitle.map((e) => e.key), ["sensor.temp"]);

  // Filter with favorites
  const favs = logic.filterEntities(list, { type: "all", onlyFavorites: true, favorites: ["light.ceiling", "sensor.temp"] });
  assert.deepEqual(favs.map((e) => e.key), ["light.ceiling", "sensor.temp"]);

  // Empty or invalid input
  assert.deepEqual(logic.filterEntities(null), []);
});

test("visibleEntities backward compatibility", () => {
  const list = [{ key: "light.a" }, { key: "foo.a" }, { key: "light.b" }];
  assert.deepEqual(logic.visibleEntities(list, undefined).map((e) => e.key), ["light.a", "light.b"]);
  assert.deepEqual(logic.visibleEntities(list, "b").map((e) => e.key), ["light.b"]);
});

test("groupByArea groups entities and sorts unassigned to the end", () => {
  const list = [
    { key: "light.kitchen", title: "Kitchen Light", area_id: "kitchen", area_name: "Kitchen" },
    { key: "switch.living_tv", title: "Living TV", area_id: "living", area_name: "Living Room" },
    { key: "light.attic", title: "Attic Light" }, // unassigned
    { key: "sensor.kitchen_temp", title: "Kitchen Temp", area_id: "kitchen", area_name: "Kitchen" },
    { key: "unsupported.device", title: "Skip" },
  ];

  const grouped = logic.groupByArea(list);
  assert.equal(grouped.length, 3);
  assert.equal(grouped[0].name, "Kitchen");
  assert.deepEqual(grouped[0].entities.map((e) => e.key), ["light.kitchen", "sensor.kitchen_temp"]);
  assert.equal(grouped[1].name, "Living Room");
  assert.deepEqual(grouped[1].entities.map((e) => e.key), ["switch.living_tv"]);
  assert.equal(grouped[2].area_id, "unassigned");
  assert.equal(grouped[2].name, "No Area");
  assert.deepEqual(grouped[2].entities.map((e) => e.key), ["light.attic"]);

  assert.deepEqual(logic.groupByArea(null), []);
});

test("energy classification and grouping: electricity, water, gas, other", () => {
  const entities = [
    { entity_id: "sensor.grid_energy", unit: "kWh", attributes: { device_class: "energy", state_class: "total_increasing" } },
    { entity_id: "sensor.solar_power", unit: "W", attributes: { device_class: "power" } },
    { entity_id: "sensor.voltage_l1", unit: "V", attributes: { device_class: "voltage" } },
    { entity_id: "sensor.current_l1", unit: "A", attributes: { device_class: "current" } },
    { entity_id: "sensor.water_meter", unit: "m³", attributes: { device_class: "water" } },
    { entity_id: "sensor.water_liters", unit: "L", attributes: {} },
    { entity_id: "sensor.water_gallons", unit: "gal", attributes: {} },
    { entity_id: "sensor.gas_meter", unit: "m³", attributes: { device_class: "gas" } },
    { entity_id: "sensor.gas_ft3", unit: "ft³", attributes: {} },
    { entity_id: "sensor.unnamed_gas_meter", unit: "m³", attributes: {} }, // entity_id has "gas"
    { entity_id: "sensor.pellet_consumption", unit: "kg", attributes: { state_class: "total" } },
    { entity_id: "sensor.custom_metric", unit: "pts", attributes: { state_class: "measurement" } },
    { entity_id: "light.ceiling", state: "on" }, // not a sensor
    { entity_id: "sensor.unrelated", state: "abc" }, // no unit or class
  ];

  assert.equal(energyCategory(entities[0]), "electricity");
  assert.equal(energyCategory(entities[1]), "electricity");
  assert.equal(energyCategory(entities[2]), "electricity");
  assert.equal(energyCategory(entities[3]), "electricity");
  assert.equal(energyCategory(entities[4]), "water");
  assert.equal(energyCategory(entities[5]), "water");
  assert.equal(energyCategory(entities[6]), "water");
  assert.equal(energyCategory(entities[7]), "gas");
  assert.equal(energyCategory(entities[8]), "gas");
  assert.equal(energyCategory(entities[9]), "gas");
  assert.equal(energyCategory(entities[10]), "other");
  assert.equal(energyCategory(entities[11]), "other");
  assert.equal(energyCategory(entities[12]), null);
  assert.equal(energyCategory(entities[13]), null);

  const filtered = filterEnergy(entities);
  assert.equal(filtered.length, 12);

  // Grouping
  const settingsList = [
    { key: "sensor.solar_power", title: "Solar Power", unit: "W" },
    { key: "sensor.water_meter", title: "Water Meter", unit: "L" },
    { key: "sensor.gas_meter", title: "Gas Meter", unit: "ft³" },
    { key: "sensor.pellets", title: "Pellet Consumption", state_class: "total" },
  ];
  const groups = logic.groupByEnergy(settingsList);
  assert.equal(groups.electricity.length, 1);
  assert.equal(groups.water.length, 1);
  assert.equal(groups.gas.length, 1);
  assert.equal(groups.other.length, 1);
});

test("isHttpUrl, normalizeNotifyService, normalizeStatusEntity, readEntities, setEnabled, setFavorite, moveToTop, moveFavorite, paginate", () => {
  assert.equal(logic.isHttpUrl("http://example.com"), true);
  assert.equal(logic.isHttpUrl("https://example.com"), true);
  assert.equal(logic.isHttpUrl("ftp://example.com"), false);

  assert.equal(logic.normalizeNotifyService("notify.mobile_pixel"), "mobile_pixel");
  assert.equal(logic.normalizeNotifyService(""), "");
  assert.equal(logic.normalizeNotifyService("invalid name!"), null);

  assert.equal(logic.normalizeStatusEntity("sensor.sleep"), "sensor.sleep");
  assert.equal(logic.normalizeStatusEntity(""), "");
  assert.equal(logic.normalizeStatusEntity("bad"), null);

  assert.deepEqual(logic.readEntities('[{"key":"light.a"},{"bad":1}]'), [{ key: "light.a" }]);

  const list = [{ key: "light.a", value: false }, { key: "light.b", value: true }];
  assert.deepEqual(logic.setEnabled(list, "light.a", true), [{ key: "light.a", value: true }, { key: "light.b", value: true }]);

  assert.deepEqual(logic.setFavorite(["a"], "b", true), ["a", "b"]);
  assert.deepEqual(logic.setFavorite(["a", "b"], "a", false), ["b"]);

  assert.deepEqual(logic.moveToTop([{ key: "a" }, { key: "b" }], "b").map((e) => e.key), ["b", "a"]);

  assert.deepEqual(logic.moveFavorite(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
  assert.deepEqual(logic.moveFavorite(["a", "b", "c"], "b", 1), ["a", "c", "b"]);
  assert.deepEqual(logic.moveFavorite(["a", "b", "c"], "c", 0), ["c", "a", "b"]);

  const p = logic.paginate([1, 2, 3, 4, 5], 0, 2);
  assert.deepEqual(p, { items: [1, 2], page: 0, totalPages: 3, total: 5 });
});
