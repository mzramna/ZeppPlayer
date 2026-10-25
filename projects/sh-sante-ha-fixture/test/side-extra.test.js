// Extra branch coverage for the phone side modules: ha, http, mobile-app, sensors,
// camera and the zepp2hass payload. Happy paths live in ha/sensors/camera.test.js.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFetch } from "./helpers/phone.js";
import { SETTING } from "../shared/protocol.js";
import * as ha from "../app-side/ha.js";
import { joinUrl, baseUrls, request, haRequest, HttpError } from "../app-side/http.js";
import * as mobileApp from "../app-side/mobile-app.js";
import { BaseSideService } from "@zeppos/zml/base-side";
import { syncSensors } from "../app-side/sensors.js";
import { snapshotUrl, cameraSnapshot } from "../app-side/camera.js";
import { buildPayload, getPath, SENSOR_DEFS } from "../shared/zepp2hass.js";

const BASE = { [SETTING.LOCAL_URL]: "https://h", [SETTING.TOKEN]: "t" };
const json = (status, body) => ({ status, body: JSON.stringify(body) });
const isTemplate = (o) => o.url.endsWith("/api/template");

// Plain-object phone storage, so tests can read and write keys directly.
let store;
function useSettings(initial = {}) {
  store = { ...initial };
  globalThis.settings = {
    settingsStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
    },
  };
  return store;
}

beforeEach(() => {
  useSettings(BASE);
});

// A complete watch reading, so every SENSOR_DEFS path resolves.
const reading = {
  time: Date.UTC(2026, 9, 24, 8, 30, 0),
  battery: { level: 0, charging: false },
  steps: { current: 10, target: 8000 },
  calorie: { current: 120, target: 500 },
  distance: { current: 900 },
  fatBurning: { current: 12, target: 30 },
  stands: { current: 3, target: 12 },
  heartRate: { last: 70, resting: 55, max: 140 },
  bloodOxygen: [{ spo2: 95, time: 1 }, { spo2: 98, time: 2 }],
  stress: 0,
  bodyTemperature: 36.5,
  sleep: { status: 0, score: 77, startTime: 1, endTime: 2, deepTime: 50, totalTime: 420 },
  pai: { week: 30, day: 4, lastWeek: 25 },
  wearing: 0,
  device: { name: "Amazfit Balance", source: 2, width: 480, height: 480 },
  user: { nickName: "Ana", age: 40, height: 170, weight: 60, gender: 1 },
};

// ---- ha.js ----

test("toEntity tolerates a missing attributes object and a non-numeric brightness", () => {
  const bare = ha.toEntity({ entity_id: "sensor.x", state: "1" });
  assert.deepEqual(bare, { entity_id: "sensor.x", domain: "sensor", name: "sensor.x", state: "1", unit: "", area: "", attributes: {} });

  const odd = ha.toEntity({ entity_id: "light.x", state: "on", attributes: { brightness: "128" } });
  assert.equal(odd.attributes.brightness_pct, undefined);
});

test("toEntity ignores domains without an attribute list, even ones named like Object members", () => {
  const e = ha.toEntity({ entity_id: "lock.front", state: "locked", attributes: { code_format: "x" } });
  assert.deepEqual(e.attributes, {});
  const proto = ha.toEntity({ entity_id: "constructor.x", state: "", attributes: { a: 1 } });
  assert.deepEqual(proto.attributes, {});
});

test("getEntities without a stored list asks for nothing", async () => {
  const calls = installFetch([]);
  assert.deepEqual(await ha.getEntities(), []);
  assert.equal(calls.length, 0);
});

test("getEntities with a corrupt stored list treats it as empty", async () => {
  store[SETTING.ENTITY_LIST] = "{not json";
  const calls = installFetch([]);
  assert.deepEqual(await ha.getEntities(), []);
  assert.equal(calls.length, 0);
});

test("getEntities with an empty or all-invalid id list makes no request", async () => {
  const calls = installFetch([]);
  assert.deepEqual(await ha.getEntities({ ids: [] }), []);
  assert.deepEqual(await ha.getEntities({ ids: null }), []);
  assert.deepEqual(await ha.getEntities({ ids: ["bad id", "../x"] }), []);
  assert.equal(calls.length, 0);
});

test("getEntities skips a stored entry that is null or not enabled", async () => {
  store[SETTING.ENTITY_LIST] = JSON.stringify([null, { key: "light.a", value: "true" }, { key: "light.b", value: true }]);
  const calls = installFetch([[isTemplate, json(200, [{ entity_id: "light.b", state: "on", attributes: {} }])]]);
  const list = await ha.getEntities();
  assert.equal(list.length, 1);
  assert.ok(JSON.parse(JSON.parse(calls[0].body).template.match(/\{% for id in (.*?) %\}/)[1]).includes("light.b"));
  assert.equal(calls[0].body.includes("light.a"), false);
});

test("getEntities accepts a template answer that HA already sent as parsed JSON", async () => {
  installFetch([[isTemplate, { status: 200, body: [{ entity_id: "light.a", state: "on", attributes: {} }] }]]);
  const list = await ha.getEntities({ ids: ["light.a"] });
  assert.deepEqual(list.map((e) => e.entity_id), ["light.a"]);
});

test("getEntities rethrows a template answer that is not JSON", async () => {
  installFetch([[isTemplate, { status: 200, body: "<html>" }]]);
  await assert.rejects(ha.getEntities({ ids: ["light.a"] }), SyntaxError);
});

test("getEntities falls back to /api/states when the template fails and keeps requested order", async () => {
  const calls = installFetch([
    [isTemplate, json(404, "Not Found")],
    [(o) => o.url === "https://h/api/states", json(200, [
      { entity_id: "light.b", state: "on", attributes: {} },
      { entity_id: "light.a", state: "off", attributes: {} },
    ])],
  ]);
  const list = await ha.getEntities({ ids: ["light.a", "light.b"] });
  assert.deepEqual(list.map((e) => e.entity_id), ["light.a", "light.b"]);
  assert.equal(calls.length, 2);
});

test("getEntity passes a 500 through unchanged", async () => {
  installFetch([[(o) => o.url.endsWith("/api/states/light.a"), json(500, {})]]);
  await assert.rejects(ha.getEntity({ entity_id: "light.a" }), (e) => e instanceof HttpError && e.status === 500);
});

test("getEntity rethrows a connection failure", async () => {
  installFetch([[(o) => o.url.endsWith("/api/states/light.a"), new Error("offline")]]);
  await assert.rejects(ha.getEntity({ entity_id: "light.a" }), /Connection error: offline/);
});

test("getEntity without params is an invalid id", async () => {
  await assert.rejects(ha.getEntity(), /Invalid entity_id/);
});

test("callService without data sends only the entity id", async () => {
  const calls = installFetch([[(o) => o.method === "POST", json(200, [])]]);
  assert.deepEqual(await ha.callService({ domain: "scene", service: "turn_on", entity_id: "scene.night" }), { ok: true });
  assert.equal(calls[0].body, '{"entity_id":"scene.night"}');
});

test("callService rejects missing names with no params at all", async () => {
  await assert.rejects(ha.callService(), /Invalid service/);
  await assert.rejects(ha.callService({ domain: "Light", service: "on" }), /Invalid service/);
});

test("getAreas without enabled entities makes no request", async () => {
  const calls = installFetch([]);
  assert.deepEqual(await ha.getAreas(), []);
  assert.equal(calls.length, 0);
});

test("getAreas renders the areas template for the enabled entities", async () => {
  store[SETTING.ENTITY_LIST] = JSON.stringify([{ key: "light.a", value: true }]);
  const calls = installFetch([[isTemplate, json(200, [{ area_id: "hall", name: "Hall", entity_ids: ["light.a"] }])]]);
  assert.deepEqual(await ha.getAreas(), [{ area_id: "hall", name: "Hall", entity_ids: ["light.a"] }]);
  assert.match(JSON.parse(calls[0].body).template, /\["light\.a"\]/);
});

test(
  "getAreas on Home Assistant without /api/template returns no areas instead of failing",
  async () => {
    store[SETTING.ENTITY_LIST] = JSON.stringify([{ key: "light.a", value: true }]);
    installFetch([[isTemplate, json(404, "Not Found")]]);
    assert.deepEqual(await ha.getAreas(), []);
  }
);

test("getConfig reads the configured side-channel values", () => {
  store[SETTING.SAA_NOTIFY_SERVICE] = "notify.mobile_app_pixel";
  store[SETTING.SAA_STATUS_ENTITY] = "sensor.saa";
  store[SETTING.SENSOR_MODE] = "mobile_app";
  store[SETTING.SYNC_INTERVAL] = "0";
  assert.deepEqual(ha.getConfig(), {
    favorites: [],
    sensorMode: "mobile_app",
    syncInterval: 5,
    saaNotifyService: "notify.mobile_app_pixel",
    saaStatusEntity: "sensor.saa",
  });
});

test("refreshEntityList keeps only the first copy of a duplicated entry and skips junk", async () => {
  store[SETTING.ENTITY_LIST] = JSON.stringify([
    null,
    { key: "light.a", value: true },
    { key: "light.a", value: false },
  ]);
  installFetch([[(o) => o.url === "https://h/api/states", json(200, [
    { entity_id: "light.a", state: "on", attributes: {} },
    { entity_id: "light.new", state: "on" },
  ])]]);
  assert.equal(await ha.refreshEntityList(), "2 entities");
  assert.deepEqual(JSON.parse(store[SETTING.ENTITY_LIST]), [
    { key: "light.a", title: "light.a", value: true, area_id: "", area_name: "" },
    { key: "light.new", title: "light.new", value: false, area_id: "", area_name: "" },
  ]);
});

test("refreshEntityList starts from scratch when the stored list is corrupt", async () => {
  store[SETTING.ENTITY_LIST] = "[oops";
  installFetch([[(o) => o.url === "https://h/api/states", json(200, [{ entity_id: "switch.a", state: "on", attributes: { friendly_name: "A" } }])]]);
  await ha.refreshEntityList();
  assert.deepEqual(JSON.parse(store[SETTING.ENTITY_LIST]), [{ key: "switch.a", title: "A", value: false, area_id: "", area_name: "" }]);
});

// ---- http.js ----

test("joinUrl collapses repeated slashes on both sides", () => {
  assert.equal(joinUrl("https://h///", "///api/x"), "https://h/api/x");
});

test("baseUrls drops blank, missing and non-string addresses", () => {
  store[SETTING.LOCAL_URL] = "   ";
  store[SETTING.EXTERNAL_URL] = "https://ext";
  assert.deepEqual(baseUrls(), ["https://ext"]);
  store[SETTING.LOCAL_URL] = undefined;
  store[SETTING.EXTERNAL_URL] = undefined;
  assert.deepEqual(baseUrls(), []);
});

test("baseUrls trims addresses saved with stray spaces", () => {
  store[SETTING.LOCAL_URL] = " https://local ";
  store[SETTING.EXTERNAL_URL] = "https://ext  ";
  assert.deepEqual(baseUrls(), ["https://local", "https://ext"]);
});

test("request answers status 0 and a missing response as no response", async () => {
  installFetch([[() => true, { status: 0, body: "" }]]);
  await assert.rejects(request("https://x/a"), /No response from https:\/\/x\/a/);
  installFetch([[() => true, undefined]]);
  await assert.rejects(request("https://x/a"), /No response from https:\/\/x\/a/);
});

test("request sends a string body as is, stringifies objects, and sends no body for undefined", async () => {
  const calls = installFetch([[() => true, { status: 200, body: "{}" }]]);
  await request("https://x/a", { method: "PUT", body: '{"raw":true}', headers: { "X-A": "1" } });
  await request("https://x/a", { body: { n: 1 } });
  await request("https://x/a");
  assert.equal(calls[0].method, "PUT");
  assert.equal(calls[0].body, '{"raw":true}');
  assert.deepEqual(calls[0].headers, { "Content-Type": "application/json", "X-A": "1" });
  assert.equal(calls[1].method, "GET");
  assert.equal(calls[1].body, '{"n":1}');
  assert.equal(calls[2].body, undefined);
});

test("request keeps a non-JSON or empty body as text and passes parsed bodies through", async () => {
  installFetch([[(o) => o.url.endsWith("/text"), { status: 200, body: "OK" }],
    [(o) => o.url.endsWith("/empty"), { status: 200, body: "" }],
    [(o) => o.url.endsWith("/parsed"), { status: 200, body: { done: true } }],
    [(o) => o.url.endsWith("/missing"), { status: 204 }]]);
  assert.equal(await request("https://x/text"), "OK");
  assert.equal(await request("https://x/empty"), "");
  assert.deepEqual(await request("https://x/parsed"), { done: true });
  assert.equal(await request("https://x/missing"), undefined);
});

test("request turns a status outside 2xx into an HttpError that keeps the body", async () => {
  installFetch([[() => true, { status: 302, body: '{"to":"/login"}' }]]);
  await assert.rejects(request("https://x/a"), (e) => e instanceof HttpError && e.message === "HTTP 302" && e.body.to === "/login");
});

test("haRequest without any address fails before fetching", async () => {
  store = useSettings({ [SETTING.TOKEN]: "t" });
  const calls = installFetch([]);
  await assert.rejects(haRequest("/api/states"), /Home Assistant address not set/);
  assert.equal(calls.length, 0);
});

test("haRequest reports the last connection error when every address fails", async () => {
  store = useSettings({ [SETTING.LOCAL_URL]: "http://a", [SETTING.EXTERNAL_URL]: "http://b", [SETTING.TOKEN]: "t" });
  installFetch([[() => true, new Error("nope")]]);
  await assert.rejects(haRequest("/api/states"), /Connection error: nope/);
});

test("haRequest lets the caller override the Authorization header and works without options", async () => {
  const calls = installFetch([[() => true, { status: 200, body: "[]" }]]);
  await haRequest("/api/states");
  await haRequest("/api/states", { headers: { Authorization: "Bearer other" } });
  assert.equal(calls[0].headers.Authorization, "Bearer t");
  assert.equal(calls[1].headers.Authorization, "Bearer other");
});

test(
  "haRequest does not send 'Bearer null' when no token is stored",
  async () => {
    store = useSettings({ [SETTING.LOCAL_URL]: "https://h" });
    const calls = installFetch([[() => true, { status: 200, body: "[]" }]]);
    await assert.rejects(haRequest("/api/states"), /token not set/);
    assert.equal(calls.length, 0);
  }
);

test(
  "a fetch that rejects with a non-Error gives a readable connection message",
  async () => {
    globalThis.fetch = async () => {
      throw "socket reset";
    };
    await assert.rejects(haRequest("/api/states"), (e) => e.message === "Connection error: socket reset");
  }
);

// ---- mobile-app.js ----

test("register creates a device id on first use and reuses it afterwards", async () => {
  const calls = installFetch([
    [(o) => o.url.endsWith("/api/mobile_app/registrations"), json(201, { webhook_id: "wh", secret: "s", remote_ui_url: "https://ui" })],
    [(o) => o.url.includes("/api/webhook/wh"), json(200, {})],
  ]);
  assert.equal(await mobileApp.register(), "Registered");
  const first = JSON.parse(store[SETTING.MOBILE_APP]);
  assert.match(first.device_id, /^[0-9a-f]+$/);
  assert.equal(first.remote_ui_url, "https://ui");
  assert.equal(first.cloudhook_url, undefined);

  await mobileApp.register();
  const reg = JSON.parse(calls[0].body);
  assert.equal(reg.device_id, first.device_id);
  assert.equal(reg.device_name, "Zepp watch");
  assert.equal(reg.model, "Zepp OS watch");
});

test("updateSensors registers sensors HA reports as not_registered and sends them again", async () => {
  store[SETTING.MOBILE_APP] = JSON.stringify({ webhook_id: "wh" });
  const sent = [];
  installFetch([
    [
      (o) => o.url.includes("/api/webhook/wh"),
      (o) => {
        const body = JSON.parse(o.body);
        sent.push(body);
        const first = sent.filter((b) => b.type === "update_sensor_states").length === 1;
        return json(200, body.type === "update_sensor_states" && first
          ? { battery: { success: true }, steps: { success: false, error: { code: "not_registered" } } }
          : {});
      },
    ],
  ]);
  await mobileApp.updateSensors({ battery: { current: 80 }, steps: { current: 10 } });
  assert.deepEqual(sent.map((b) => b.type), ["update_sensor_states", "register_sensor", "update_sensor_states"]);
  assert.equal(sent[1].data.unique_id, "steps");
  assert.deepEqual(sent[2].data.map((s) => s.unique_id), ["steps"]);
});

test("register replaces a corrupt stored registration with a fresh device id", async () => {
  store[SETTING.MOBILE_APP] = "{broken";
  const calls = installFetch([
    [(o) => o.url.endsWith("/api/mobile_app/registrations"), json(201, { webhook_id: "wh" })],
    [(o) => o.url.includes("/api/webhook/wh"), json(200, {})],
  ]);
  await mobileApp.register();
  assert.match(JSON.parse(calls[0].body).device_id, /^[0-9a-f]+$/);
});

test("register registers one sensor per SENSOR_DEFS entry and drops empty fields", async () => {
  const calls = installFetch([
    [(o) => o.url.endsWith("/api/mobile_app/registrations"), json(201, { webhook_id: "wh" })],
    [(o) => o.url.includes("/api/webhook/wh"), json(200, {})],
  ]);
  await mobileApp.register();
  const sensorCalls = calls.filter((c) => c.url.includes("/api/webhook/wh")).map((c) => JSON.parse(c.body));
  assert.equal(sensorCalls.length, SENSOR_DEFS.length);
  assert.ok(sensorCalls.every((c) => c.type === "register_sensor"));

  const byId = Object.fromEntries(sensorCalls.map((c) => [c.data.unique_id, c.data]));
  assert.equal(byId.record_time.unit_of_measurement, undefined, "null unit is dropped");
  assert.equal(byId.record_time.state, "unknown");
  assert.equal(byId.is_charging.state, false, "binary sensors start off");
  assert.equal(byId.battery.unit_of_measurement, "%");
});

test("register without a webhook id fails and stores nothing", async () => {
  installFetch([[(o) => o.url.endsWith("/api/mobile_app/registrations"), json(200, {})]]);
  await assert.rejects(mobileApp.register(), /Unexpected response from Home Assistant/);
  assert.equal(store[SETTING.MOBILE_APP], undefined);
});

test("webhook uses the remote UI address when there is no cloud hook", async () => {
  store[SETTING.MOBILE_APP] = JSON.stringify({ webhook_id: "wh", remote_ui_url: "https://ui/" });
  const calls = installFetch([[() => true, json(200, {})]]);
  await mobileApp.webhook("update_sensor_states", []);
  assert.equal(calls[0].url, "https://ui/api/webhook/wh");
  assert.deepEqual(JSON.parse(calls[0].body), { type: "update_sensor_states", data: [] });
});

test("webhook with no address at all says so", async () => {
  store[SETTING.MOBILE_APP] = JSON.stringify({ webhook_id: "wh" });
  store[SETTING.LOCAL_URL] = undefined;
  installFetch([]);
  await assert.rejects(mobileApp.webhook("x", {}), /Home Assistant address not set/);
});

test("webhook reports the last network error once every URL has failed", async () => {
  store[SETTING.MOBILE_APP] = JSON.stringify({ webhook_id: "wh", cloudhook_url: "https://c" });
  installFetch([[() => true, new Error("down")]]);
  await assert.rejects(mobileApp.webhook("x", {}), /Connection error: down/);
});

test("webhook keeps the registration on a server error other than 410", async () => {
  store[SETTING.MOBILE_APP] = JSON.stringify({ webhook_id: "wh", cloudhook_url: "https://c" });
  installFetch([[() => true, json(500, {})]]);
  await assert.rejects(mobileApp.webhook("x", {}), (e) => e instanceof HttpError && e.status === 500);
  assert.ok(store[SETTING.MOBILE_APP]);
});

test("updateSensors treats binary sensors as booleans and skips missing paths", async () => {
  store[SETTING.MOBILE_APP] = JSON.stringify({ webhook_id: "wh", cloudhook_url: "https://c" });
  const calls = installFetch([[() => true, json(200, {})]]);
  await mobileApp.updateSensors({ is_wearing: 0, battery: { current: 55 } });
  const states = JSON.parse(calls[0].body).data;
  assert.deepEqual(states, [
    { unique_id: "battery", type: "sensor", state: 55 },
    { unique_id: "is_wearing", type: "binary_sensor", state: false },
  ]);
});

// ---- sensors.js ----

test("sync in rest mode posts only the REST metrics, per device, skipping missing values", async () => {
  store[SETTING.SENSOR_MODE] = "rest";
  const payload = buildPayload({ time: 0, battery: { level: 81 }, heartRate: { last: 66 }, wearing: 1, device: { name: "Amazfit Balance" } });
  const calls = installFetch([[() => true, json(200, {})]]);
  assert.deepEqual(await syncSensors({ payload }), { interval: 5 });
  assert.deepEqual(calls.map((c) => c.url), [
    "https://h/api/states/sensor.amazfit_balance_battery",
    "https://h/api/states/sensor.amazfit_balance_heart_rate",
  ]);
  const body = JSON.parse(calls[0].body);
  assert.equal(body.state, 81);
  assert.equal(body.attributes.friendly_name, "Battery");
  assert.equal(JSON.parse(store[SETTING.LAST_SYNC]).ok, true);
});

test("sync in rest mode falls back to the 'zepp' device name", async () => {
  store[SETTING.SENSOR_MODE] = "rest";
  const calls = installFetch([[() => true, json(200, {})]]);
  await syncSensors({ payload: buildPayload({ time: 0, battery: { level: 3 } }) });
  assert.equal(calls[0].url, "https://h/api/states/sensor.zepp_battery");
});

test(
  "rest mode builds valid entity ids for device names ending in a symbol",
  async () => {
    store[SETTING.SENSOR_MODE] = "rest";
    const calls = installFetch([[() => true, json(200, {})]]);
    await syncSensors({ payload: buildPayload({ time: 0, battery: { level: 3 }, device: { name: "Watch (2)" } }) });
    const id = calls[0].url.split("/api/states/")[1];
    // Home Assistant's entity id rule: no double underscore, no leading or trailing underscore.
    assert.match(id, /^(?!.+__)(?!_)[\da-z_]+(?<!_)\.(?!_)[\da-z_]+(?<!_)$/);
  }
);

test("rest mode stops at the first failing state write and records it", async () => {
  store[SETTING.SENSOR_MODE] = "rest";
  const calls = installFetch([
    [(o) => o.url.endsWith("/sensor.zepp_battery"), json(200, {})],
    [(o) => o.url.endsWith("/sensor.zepp_heart_rate"), json(503, {})],
  ]);
  const payload = buildPayload({ time: 0, battery: { level: 3 }, heartRate: { last: 60, resting: 50 } });
  await assert.rejects(syncSensors({ payload }), /HTTP 503/);
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(store[SETTING.LAST_SYNC]).ok, false);
});

test("sync in mobile_app mode without a registration records the error", async () => {
  store[SETTING.SENSOR_MODE] = "mobile_app";
  installFetch([]);
  await assert.rejects(syncSensors({ payload: { battery: { current: 1 } } }), /Not registered/);
  assert.match(JSON.parse(store[SETTING.LAST_SYNC]).error, /Not registered/);
});

test("sync refuses a payload that is missing or not an object", async () => {
  store[SETTING.SENSOR_MODE] = "zepp2hass";
  store[SETTING.ZEPP2HASS_URL] = "https://ha/api/webhook/z";
  installFetch([]);
  await assert.rejects(syncSensors({}), /No sensor payload/);
  await assert.rejects(syncSensors({ payload: "text" }), /No sensor payload/);
  assert.equal(JSON.parse(store[SETTING.LAST_SYNC]).ok, false);
});

test("sync in zepp2hass mode needs the webhook URL", async () => {
  store[SETTING.SENSOR_MODE] = "zepp2hass";
  installFetch([]);
  await assert.rejects(syncSensors({ payload: {} }), /zepp2hass webhook URL not set/);
});

test("sync in zepp2hass mode rejects a reply that is not status ok", async () => {
  store[SETTING.SENSOR_MODE] = "zepp2hass";
  store[SETTING.ZEPP2HASS_URL] = "https://ha/api/webhook/z";
  installFetch([[() => true, json(200, { status: "error" })]]);
  await assert.rejects(syncSensors({ payload: {} }), /Unexpected response from zepp2hass/);
});

test("sync in zepp2hass mode rejects an empty reply", async () => {
  store[SETTING.SENSOR_MODE] = "zepp2hass";
  store[SETTING.ZEPP2HASS_URL] = "https://ha/api/webhook/z";
  installFetch([[() => true, { status: 200 }]]);
  await assert.rejects(syncSensors({ payload: {} }), /Unexpected response from zepp2hass/);
});

// ---- camera.js ----

test("snapshotUrl keeps a base without a trailing slash", () => {
  assert.equal(snapshotUrl("http://ha", "camera.a", 1, 2), "http://ha/api/camera_proxy/camera.a?width=1&height=2");
});

test("cameraSnapshot rejects sizes that are not positive integers", async () => {
  store[SETTING.LOCAL_URL] = "http://ha.local";
  const service = { download: () => assert.fail("must not download") };
  for (const [width, height] of [[0, 300], [400, -1], ["abc", 300], [1.5, 300], [undefined, 300]]) {
    await assert.rejects(cameraSnapshot({ entity_id: "camera.a", width, height }, service), /Invalid size/);
  }
});

test("cameraSnapshot without an address fails before downloading", async () => {
  store = useSettings({ [SETTING.TOKEN]: "t" });
  const service = { download: () => assert.fail("must not download") };
  await assert.rejects(cameraSnapshot({ entity_id: "camera.a", width: 4, height: 3 }, service), /Home Assistant address not set/);
});

test("cameraSnapshot falls back to the external address when the local one fails", async () => {
  store[SETTING.LOCAL_URL] = "http://ha.local";
  store[SETTING.EXTERNAL_URL] = "https://ha.example";
  const urls = [];
  const service = {
    download(url, opts) {
      urls.push(url);
      const task = {};
      queueMicrotask(() => (url.startsWith("http://") ? task.onFail({ code: 1 }) : task.onSuccess({ filePath: opts.filePath, statusCode: 200 })));
      return task;
    },
    convert: async () => ({}),
    sendFile() {},
  };
  const out = await cameraSnapshot({ entity_id: "camera.a", width: 4, height: 3 }, service);
  assert.deepEqual(urls, [
    "http://ha.local/api/camera_proxy/camera.a?width=4&height=3",
    "https://ha.example/api/camera_proxy/camera.a?width=4&height=3",
  ]);
  assert.match(out.file, /^camera_\d+\.png$/);
});

test("cameraSnapshot reports a download that never starts", async () => {
  store[SETTING.LOCAL_URL] = "http://ha.local";
  const service = { download: () => undefined, sendFile: () => assert.fail("no file") };
  await assert.rejects(cameraSnapshot({ entity_id: "camera.a", width: 4, height: 3 }, service), /Connection error: download unavailable/);
});

test("cameraSnapshot reports a download that throws", async () => {
  store[SETTING.LOCAL_URL] = "http://ha.local";
  const service = {
    download() {
      throw new Error("no network");
    },
  };
  await assert.rejects(cameraSnapshot({ entity_id: "camera.a", width: 4, height: 3 }, service), /Connection error: no network/);
});

test("cameraSnapshot reports a failed download with the reason the runtime gave", async () => {
  store[SETTING.LOCAL_URL] = "http://ha.local";
  const service = {
    download(_url, _opts) {
      const task = {};
      queueMicrotask(() => task.onFail({ code: 404 }));
      return task;
    },
  };
  await assert.rejects(cameraSnapshot({ entity_id: "camera.a", width: 4, height: 3 }, service), /download failed \{"code":404\}/);
});

// ---- zepp2hass.js ----

test("buildPayload with a full reading resolves every SENSOR_DEFS path", () => {
  const payload = buildPayload(reading);
  for (const def of SENSOR_DEFS) {
    assert.notEqual(getPath(payload, def.path), undefined, def.unique_id);
  }
  assert.equal(payload.stress.current.value, 0, "a zero score is kept");
  assert.equal(payload.battery.current, 0, "zero battery is kept");
  assert.deepEqual(payload.user, { nickName: "Ana", age: 40, height: 170, weight: 60, gender: 1 });
  assert.equal(payload.is_wearing, 0);
  assert.equal(payload.body_temperature.current.value, 36.5, "Celsius passes through");
});

test("buildPayload divides Zepp's x100 body temperature and leaves 100 itself alone", () => {
  assert.equal(buildPayload({ time: 1, bodyTemperature: 3712 }).body_temperature.current.value, 37.12);
  assert.equal(buildPayload({ time: 1, bodyTemperature: 100 }).body_temperature.current.value, 100);
});

test("buildPayload without a time stamps the current moment", () => {
  const before = Date.now();
  const iso = buildPayload({}).record_time;
  assert.match(iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.ok(Date.parse(iso) >= before - 1000);
});

test("buildPayload keeps a heart rate without a maximum and drops empty sections", () => {
  const p = buildPayload({ time: 1, heartRate: { resting: 50 }, blood_oxygen: undefined, bloodOxygen: [], sleep: {}, pai: {}, distance: { current: 0 }, user: {} });
  assert.deepEqual(p.heart_rate, { resting: 50 });
  assert.equal(p.blood_oxygen, undefined);
  assert.equal(p.sleep, undefined);
  assert.equal(p.pai, undefined);
  assert.deepEqual(p.distance, { current: 0 });
  assert.equal(p.user, undefined);
});

test("buildPayload drops a heart rate block that has no values", () => {
  assert.equal(buildPayload({ time: 1, heartRate: {} }).heart_rate, undefined);
});

test("buildPayload keeps a fully set goal and drops a goal that is only null", () => {
  const p = buildPayload({ time: 1, stands: { current: 0 }, fatBurning: { target: 30 }, steps: { current: null, target: null } });
  assert.deepEqual(p.stands, { current: 0 });
  assert.deepEqual(p.fat_burning, { target: 30 });
  assert.equal(p.steps, undefined);
});

test("getPath walks negative indexes from the end and stops at missing parts", () => {
  const obj = { list: [{ v: 1 }, { v: 2 }], empty: [], nothing: null, num: 5 };
  assert.equal(getPath(obj, "list.-1.v"), 2);
  assert.equal(getPath(obj, "list.-2.v"), 1);
  assert.equal(getPath(obj, "list.-3.v"), undefined);
  assert.equal(getPath(obj, "empty.-1"), undefined);
  assert.equal(getPath(obj, "nothing.v"), undefined);
  assert.equal(getPath(obj, "num.v"), undefined);
  assert.equal(getPath(obj, "list.9.v"), undefined);
});

test("SENSOR_DEFS have unique ids and known types", () => {
  const ids = SENSOR_DEFS.map((d) => d.unique_id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(SENSOR_DEFS.every((d) => d.type === "sensor" || d.type === "binary_sensor"));
});

// ---- zml base-side mock (test/mocks/zml/base-side.js) ----

test("the ZML side mock: download returns a task that reports to onSuccess, convert resolves", async () => {
  const service = BaseSideService({});
  const task = service.download("https://h/cam", { filePath: "camera_1.png" });
  const got = await new Promise((resolve) => {
    task.onSuccess = resolve;
  });
  assert.deepEqual(got, { filePath: "camera_1.png", statusCode: 200 });
  assert.deepEqual(await service.convert({ filePath: "x" }), {});
});
