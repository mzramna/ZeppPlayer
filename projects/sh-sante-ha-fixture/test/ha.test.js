import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as ha from "../app-side/ha.js";
import { joinUrl, haRequest } from "../app-side/http.js";
import { SETTING } from "../shared/protocol.js";

// Phone storage stub: values are strings, like settings.settingsStorage.
let store;
let calls;

function setStore(values) {
  store = { ...values };
  globalThis.settings = {
    settingsStorage: {
      getItem: (k) => store[k],
      setItem: (k, v) => {
        store[k] = v;
      },
    },
  };
}

// handler(opts) -> { status, body } or throws (network error).
function stubFetch(handler) {
  calls = [];
  globalThis.fetch = async (opts) => {
    calls.push(opts);
    return handler(opts);
  };
}

const json = (status, body) => ({ status, body: JSON.stringify(body) });

beforeEach(() => {
  setStore({ [SETTING.LOCAL_URL]: "https://h", [SETTING.TOKEN]: "t" });
});

test("toEntity maps light brightness to percent and drops unknown attributes", () => {
  const e = ha.toEntity({
    entity_id: "light.kitchen",
    state: "on",
    area: "Kitchen",
    attributes: { friendly_name: "Kitchen", brightness: 128, effect: "rainbow", secret: "x", device_class: "y" },
  });
  assert.deepEqual(e, {
    entity_id: "light.kitchen",
    domain: "light",
    name: "Kitchen",
    state: "on",
    unit: "",
    area: "Kitchen",
    attributes: { brightness_pct: 50, effect: "rainbow" },
  });
});

test("toEntity falls back to entity_id for name and keeps unit and sensor attributes", () => {
  const e = ha.toEntity({
    entity_id: "sensor.temp",
    state: "21.5",
    attributes: { unit_of_measurement: "°C", device_class: "temperature", state_class: "measurement" },
  });
  assert.equal(e.name, "sensor.temp");
  assert.equal(e.unit, "°C");
  assert.equal(e.area, "");
  assert.deepEqual(e.attributes, {
    device_class: "temperature",
    state_class: "measurement",
    unit_of_measurement: "°C",
  });
});

test("toEntity handles light color temp and converts tuples to arrays for hs_color and rgb_color", () => {
  const e = ha.toEntity({
    entity_id: "light.living",
    state: "on",
    attributes: {
      color_temp: 350,
      color_temp_kelvin: 2850,
      min_color_temp_kelvin: 2000,
      max_color_temp_kelvin: 6500,
      hs_color: [25.5, 100],
      rgb_color: [255, 128, 0],
    },
  });
  assert.equal(e.attributes.color_temp, 350);
  assert.equal(e.attributes.color_temp_kelvin, 2850);
  assert.equal(e.attributes.min_color_temp_kelvin, 2000);
  assert.equal(e.attributes.max_color_temp_kelvin, 6500);
  assert.ok(Array.isArray(e.attributes.hs_color));
  assert.deepEqual(e.attributes.hs_color, [25.5, 100]);
  assert.ok(Array.isArray(e.attributes.rgb_color));
  assert.deepEqual(e.attributes.rgb_color, [255, 128, 0]);
});

test("toEntity accepts the [key, value] attribute pairs sent by the template", () => {
  const e = ha.toEntity({ entity_id: "fan.f", state: "on", attributes: [["friendly_name", "Fan"], ["percentage", 40]] });
  assert.equal(e.name, "Fan");
  assert.deepEqual(e.attributes, { percentage: 40 });
});

test("getEntities without ids uses enabled settings in order and skips entities missing in HA", async () => {
  setStore({
    [SETTING.LOCAL_URL]: "https://h",
    [SETTING.TOKEN]: "t",
    [SETTING.ENTITY_LIST]: JSON.stringify([
      { key: "switch.b", title: "B", value: true },
      { key: "light.off", title: "C", value: false },
      { key: "light.a", title: "A", value: true },
      { key: "sensor.gone", title: "G", value: true },
    ]),
  });
  stubFetch(() =>
    json(200, [
      { entity_id: "switch.b", state: "on", attributes: { friendly_name: "B" }, area: "Hall" },
      { entity_id: "light.a", state: "off", attributes: {}, area: "" },
    ])
  );

  const list = await ha.getEntities();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://h/api/template");
  assert.equal(calls[0].method, "POST");
  const template = JSON.parse(calls[0].body).template;
  assert.ok(template.includes('["switch.b","light.a","sensor.gone"]'), "ids in settings order, disabled left out");
  assert.deepEqual(
    list.map((e) => [e.entity_id, e.name, e.area]),
    [["switch.b", "B", "Hall"], ["light.a", "light.a", ""]]
  );
});

test("getEntities falls back to /api/states on HTTP 400 and filters there", async () => {
  stubFetch((opts) => {
    if (opts.url.endsWith("/api/template")) return json(400, "TemplateError");
    return json(200, [
      { entity_id: "light.a", state: "on", attributes: { friendly_name: "A", brightness: 255 } },
      { entity_id: "light.z", state: "on", attributes: {} },
    ]);
  });

  const list = await ha.getEntities({ ids: ["light.a", "light.missing"] });

  assert.deepEqual(calls.map((c) => c.url), ["https://h/api/template", "https://h/api/states"]);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "A");
  assert.equal(list[0].area, "");
  assert.equal(list[0].attributes.brightness_pct, 100);
});

test("getEntities rethrows non-HTTP errors instead of falling back", async () => {
  stubFetch(() => {
    throw new Error("boom");
  });
  setStore({ [SETTING.LOCAL_URL]: "https://h", [SETTING.TOKEN]: "t" });
  await assert.rejects(() => ha.getEntities({ ids: ["light.a"] }), /Connection error/);
  assert.equal(calls.length, 1);
});

test("callService posts the service and returns ok", async () => {
  stubFetch(() => json(200, []));

  const res = await ha.callService({ domain: "light", service: "turn_on", entity_id: "light.a", data: { brightness: 100 } });

  assert.deepEqual(res, { ok: true });
  assert.equal(calls[0].url, "https://h/api/services/light/turn_on");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body, '{"entity_id":"light.a","brightness":100}');
});

test("callService rejects names that are not plain identifiers before any request", async () => {
  stubFetch(() => json(200, []));
  await assert.rejects(() => ha.callService({ domain: "light", service: "../x", entity_id: "light.a" }), /Invalid service/);
  await assert.rejects(() => ha.callService({ domain: "light/../x", service: "on", entity_id: "light.a" }), /Invalid service/);
  await assert.rejects(() => ha.callService({ domain: "light", entity_id: "light.a" }), /Invalid service/);
  assert.equal(calls.length, 0);
});

test("refreshEntityList keeps flags and order, appends new supported entities, drops gone ones", async () => {
  setStore({
    [SETTING.LOCAL_URL]: "https://h",
    [SETTING.TOKEN]: "t",
    [SETTING.ENTITY_LIST]: JSON.stringify([
      { key: "switch.b", title: "old", value: true },
      { key: "light.gone", title: "G", value: true },
      { key: "light.a", title: "A", value: false },
    ]),
  });
  stubFetch(() =>
    json(200, [
      { entity_id: "light.a", state: "on", attributes: { friendly_name: "Lamp A" } },
      { entity_id: "switch.b", state: "on", attributes: {} },
      { entity_id: "lock.front", state: "locked", attributes: {} },
      { entity_id: "update.core", state: "off", attributes: {} },
    ])
  );

  const message = await ha.refreshEntityList();

  assert.equal(message, "3 entities");
  assert.deepEqual(JSON.parse(store[SETTING.ENTITY_LIST]), [
    { key: "switch.b", title: "switch.b", value: true, area_id: "", area_name: "" },
    { key: "light.a", title: "Lamp A", value: false, area_id: "", area_name: "" },
    { key: "lock.front", title: "lock.front", value: false, area_id: "", area_name: "" },
  ]);
});

test("refreshEntityList attaches area_id and area_name from areas template", async () => {
  setStore({
    [SETTING.LOCAL_URL]: "https://h",
    [SETTING.TOKEN]: "t",
    [SETTING.ENTITY_LIST]: "[]",
  });
  stubFetch((opts) => {
    if (opts.url.endsWith("/api/states")) {
      return json(200, [
        { entity_id: "light.living_room", state: "on", attributes: { friendly_name: "Living Room Light" } },
        { entity_id: "switch.kitchen_plug", state: "off", attributes: { friendly_name: "Kitchen Plug" } },
      ]);
    }
    if (opts.url.endsWith("/api/template")) {
      return json(200, [
        { area_id: "living", name: "Living Room", entities: ["light.living_room"] },
        { area_id: "kitchen", name: "Kitchen", entities: ["switch.kitchen_plug"] },
      ]);
    }
    return json(404, {});
  });

  await ha.refreshEntityList();
  const list = JSON.parse(store[SETTING.ENTITY_LIST]);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], {
    key: "light.living_room",
    title: "Living Room Light",
    value: false,
    area_id: "living",
    area_name: "Living Room",
  });
  assert.deepEqual(list[1], {
    key: "switch.kitchen_plug",
    title: "Kitchen Plug",
    value: false,
    area_id: "kitchen",
    area_name: "Kitchen",
  });
});

test("getEnergy fetches states and filters for energy sensors", async () => {
  stubFetch(() =>
    json(200, [
      { entity_id: "sensor.house_power", state: "1250", attributes: { unit_of_measurement: "W", device_class: "power" } },
      { entity_id: "sensor.water_meter", state: "340", attributes: { unit_of_measurement: "L", device_class: "water" } },
      { entity_id: "sensor.gas_consumption", state: "12.4", attributes: { unit_of_measurement: "m³", device_class: "gas" } },
      { entity_id: "sensor.outside_temp", state: "22", attributes: { unit_of_measurement: "°C" } },
      { entity_id: "light.bulb", state: "on", attributes: {} },
    ])
  );

  const energySensors = await ha.getEnergy();
  assert.equal(energySensors.length, 3);
  assert.deepEqual(
    energySensors.map((e) => e.entity_id),
    ["sensor.house_power", "sensor.water_meter", "sensor.gas_consumption"]
  );
  assert.equal(energySensors[0].unit, "W");
  assert.equal(energySensors[1].unit, "L");
  assert.equal(energySensors[2].unit, "m³");
});

test("setEntityVisibility updates or creates entity item in ENTITY_LIST", () => {
  setStore({
    [SETTING.ENTITY_LIST]: JSON.stringify([
      { key: "light.a", title: "Light A", value: true },
      { key: "switch.b", title: "Switch B", value: false },
    ]),
  });

  const res1 = ha.setEntityVisibility({ entity_id: "switch.b", visible: true });
  assert.equal(res1.ok, true);
  assert.equal(res1.visible, true);
  let list = JSON.parse(store[SETTING.ENTITY_LIST]);
  assert.equal(list.find((e) => e.key === "switch.b").value, true);

  // Non-existent entity is appended
  const res2 = ha.setEntityVisibility({ entity_id: "sensor.c", visible: false });
  assert.equal(res2.ok, true);
  list = JSON.parse(store[SETTING.ENTITY_LIST]);
  assert.equal(list.length, 3);
  assert.equal(list[2].key, "sensor.c");
  assert.equal(list[2].value, false);

  assert.throws(() => ha.setEntityVisibility({}), /Missing entity_id/);
});

test("joinUrl keeps a base path behind a reverse proxy", async () => {
  assert.equal(joinUrl("https://h/ha/", "/api/states"), "https://h/ha/api/states");
  assert.equal(joinUrl("https://h", "api/states"), "https://h/api/states");

  setStore({ [SETTING.LOCAL_URL]: "https://h/ha/", [SETTING.TOKEN]: "t" });
  stubFetch(() => json(200, { entity_id: "light.a", state: "on", attributes: {} }));
  await ha.getEntity({ entity_id: "light.a" });
  assert.equal(calls[0].url, "https://h/ha/api/states/light.a");
});

test("haRequest fails over to the external URL on a network error", async () => {
  setStore({
    [SETTING.LOCAL_URL]: "http://local:8123",
    [SETTING.EXTERNAL_URL]: "https://ext.example",
    [SETTING.TOKEN]: "t",
  });
  stubFetch((opts) => {
    if (opts.url.startsWith("http://local")) throw new Error("ECONNREFUSED");
    return json(200, { entity_id: "light.a", state: "on", attributes: { friendly_name: "A" } });
  });

  const e = await ha.getEntity({ entity_id: "light.a" });

  assert.deepEqual(calls.map((c) => c.url), ["http://local:8123/api/states/light.a", "https://ext.example/api/states/light.a"]);
  assert.equal(e.name, "A");
});

test("haRequest trims stored addresses, so a stray space does not reach the URL", async () => {
  setStore({
    [SETTING.LOCAL_URL]: "  http://local:8123 ",
    [SETTING.EXTERNAL_URL]: "https://ext.example/ ",
    [SETTING.TOKEN]: "t",
  });
  stubFetch((opts) => {
    if (opts.url.startsWith("http://local")) throw new Error("ECONNREFUSED");
    return json(200, {});
  });

  await haRequest("/api/states");

  assert.deepEqual(calls.map((c) => c.url), ["http://local:8123/api/states", "https://ext.example/api/states"]);
});

test("haRequest reports HTTP 401 without trying the next URL", async () => {
  setStore({
    [SETTING.LOCAL_URL]: "http://local:8123",
    [SETTING.EXTERNAL_URL]: "https://ext.example",
    [SETTING.TOKEN]: "bad",
  });
  stubFetch(() => json(401, { message: "Unauthorized" }));

  await assert.rejects(() => haRequest("/api/states"), (e) => e.status === 401);
  assert.equal(calls.length, 1);
});

test("getEntity rejects a malformed entity_id before any request", async () => {
  stubFetch(() => json(200, {}));
  await assert.rejects(() => ha.getEntity({ entity_id: "light.a/../../config" }), /Invalid entity_id/);
  assert.equal(calls.length, 0);
});

test("getConfig applies defaults and survives bad JSON", () => {
  setStore({ [SETTING.FAVORITES]: "not json" });
  assert.deepEqual(ha.getConfig(), { favorites: [], sensorMode: "none", syncInterval: 5, saaNotifyService: "", saaStatusEntity: "" });

  setStore({ [SETTING.FAVORITES]: '["light.a"]', [SETTING.SENSOR_MODE]: "rest", [SETTING.SYNC_INTERVAL]: "15" });
  assert.deepEqual(ha.getConfig(), { favorites: ["light.a"], sensorMode: "rest", syncInterval: 15, saaNotifyService: "", saaStatusEntity: "" });
});
