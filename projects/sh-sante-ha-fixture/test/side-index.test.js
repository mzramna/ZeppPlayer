// Phone dispatcher (app-side/index.js): method routing, errors, settings-button actions.
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { load, reset, flush } from "./helpers/watch.js";
import { installSettings, installFetch } from "./helpers/phone.js";
import { METHOD, SETTING } from "../shared/protocol.js";

let store;
let fetchCalls;
let def;

const BASE = { [SETTING.LOCAL_URL]: "https://h", [SETTING.TOKEN]: "t" };

// Runs onRequest with a fake res; `this` is the side service unless a fake one is given.
async function request(req, service) {
  const replies = [];
  const res = (...args) => replies.push(args);
  if (service) def.onRequest.call(service, req, res);
  else def.onRequest(req, res);
  await flush();
  return replies;
}

// Installs fake HA routes and keeps the recorded calls for the assertions.
function routes(list) {
  fetchCalls = installFetch(list);
}

const template = (ok) => (opts) => opts.url.endsWith("/api/template") && ok;
const json = (status, body) => ({ status, body: JSON.stringify(body) });

// Service stub for CAMERA_SNAPSHOT: download resolves at once with the requested file path.
function cameraService() {
  const downloads = [];
  const sent = [];
  return {
    downloads,
    sent,
    download(url, opts) {
      downloads.push({ url, opts });
      const task = {};
      queueMicrotask(() => task.onSuccess({ filePath: opts.filePath, statusCode: 200 }));
      return task;
    },
    convert: async () => ({}),
    sendFile(path, opts) {
      sent.push({ path, opts });
    },
  };
}

// Loaded once: each import is a new module instance, and coverage only counts some of them.
before(async () => {
  def = await load("app-side/index.js", "side");
});

beforeEach(() => {
  reset();
  store = installSettings(BASE);
  routes([]);
});

test("every METHOD in shared/protocol.js has a handler (never 'Unknown method')", async () => {
  for (const method of Object.values(METHOD)) {
    const [reply] = await request({ method, params: {} }, cameraService());
    assert.notEqual(reply[0], `Unknown method ${method}`, method);
  }
});

test("GET_ENTITIES routes to ha.getEntities and maps the template rows", async () => {
  routes([
    [template(true), json(200, [{ entity_id: "light.a", state: "on", attributes: { friendly_name: "A", brightness: 255 } }])],
  ]);
  const [[err, list]] = await request({ method: METHOD.GET_ENTITIES, params: { ids: ["light.a"] } });
  assert.equal(err, null);
  assert.deepEqual(list.map((e) => [e.entity_id, e.name, e.attributes.brightness_pct]), [["light.a", "A", 100]]);
});

test("GET_ENTITY routes to ha.getEntity", async () => {
  routes([[(o) => o.url === "https://h/api/states/light.a", json(200, { entity_id: "light.a", state: "off", attributes: {} })]]);
  const [[err, entity]] = await request({ method: METHOD.GET_ENTITY, params: { entity_id: "light.a" } });
  assert.equal(err, null);
  assert.equal(entity.state, "off");
});

test("CALL_SERVICE routes to ha.callService and answers ok", async () => {
  routes([[(o) => o.method === "POST", json(200, [])]]);
  const [[err, out]] = await request({
    method: METHOD.CALL_SERVICE,
    params: { domain: "switch", service: "turn_off", entity_id: "switch.b" },
  });
  assert.equal(err, null);
  assert.deepEqual(out, { ok: true });
  assert.equal(fetchCalls[0].url, "https://h/api/services/switch/turn_off");
});

test("GET_AREAS routes to ha.getAreas", async () => {
  store.set(SETTING.ENTITY_LIST, JSON.stringify([{ key: "light.a", title: "A", value: true }]));
  routes([
    [template(true), json(200, [{ area_id: "kitchen", name: "Kitchen", entity_ids: ["light.a"] }])],
  ]);
  const [[err, areas]] = await request({ method: METHOD.GET_AREAS, params: {} });
  assert.equal(err, null);
  assert.deepEqual(areas, [{ area_id: "kitchen", name: "Kitchen", entity_ids: ["light.a"] }]);
});

test("GET_CONFIG answers the stored config, defaults when params are missing", async () => {
  const [[err, cfg]] = await request({ method: METHOD.GET_CONFIG });
  assert.equal(err, null);
  assert.deepEqual(cfg, { favorites: [], sensorMode: "none", syncInterval: 5, saaNotifyService: "", saaStatusEntity: "" });
});

test("CAMERA_SNAPSHOT routes to cameraSnapshot with the service as second argument", async () => {
  const service = cameraService();
  const [[err, out]] = await request(
    { method: METHOD.CAMERA_SNAPSHOT, params: { entity_id: "camera.front", width: 400, height: 300 } },
    service
  );
  assert.equal(err, null);
  assert.equal(service.downloads[0].url, "https://h/api/camera_proxy/camera.front?width=400&height=300");
  assert.equal(service.sent[0].path, service.downloads[0].opts.filePath);
  assert.match(out.file, /^camera_\d+\.png$/);
  assert.equal(service.sent[0].opts.name, out.file);
});

test("SYNC_SENSORS routes to syncSensors (sensor mode off answers disabled)", async () => {
  const [[err, out]] = await request({ method: METHOD.SYNC_SENSORS, params: { payload: {} } });
  assert.equal(err, null);
  assert.deepEqual(out, { disabled: true });
});

test("SYNC_SENSORS with zepp2hass mode posts the payload and answers the interval", async () => {
  store.set(SETTING.SENSOR_MODE, "zepp2hass");
  store.set(SETTING.ZEPP2HASS_URL, "https://ha.example/api/webhook/z");
  store.set(SETTING.SYNC_INTERVAL, "7");
  routes([[(o) => o.url.endsWith("/api/webhook/z"), json(200, { status: "ok" })]]);
  const [[err, out]] = await request({ method: METHOD.SYNC_SENSORS, params: { payload: { battery: { current: 1 } } } });
  assert.equal(err, null);
  assert.deepEqual(out, { interval: 7 });
});

test("an unknown method is answered with a single error argument", async () => {
  const replies = await request({ method: "NOPE", params: {} });
  assert.deepEqual(replies, [["Unknown method NOPE"]]);
  assert.equal(fetchCalls.length, 0);
});

test("the lifecycle hooks are no-ops", () => {
  assert.doesNotThrow(() => {
    def.onInit();
    def.onRun();
    def.onDestroy();
  });
});

test("a missing method is reported as unknown", async () => {
  const replies = await request({});
  assert.deepEqual(replies, [["Unknown method undefined"]]);
});

test("a handler error is answered with its message", async () => {
  const [[err]] = await request({ method: METHOD.GET_ENTITY, params: { entity_id: "../x" } });
  assert.equal(err, "Invalid entity_id");
});

test("a handler that rejects with an HTTP 404 reports the entity as not found", async () => {
  routes([[(o) => o.url.endsWith("/api/states/light.gone"), json(404, {})]]);
  const [[err]] = await request({ method: METHOD.GET_ENTITY, params: { entity_id: "light.gone" } });
  assert.equal(err, "Entity not found: light.gone");
});

test("a non-Error thrown by a handler is answered with its string form", async () => {
  settings.settingsStorage.getItem = () => {
    throw "storage offline";
  };
  const replies = await request({ method: METHOD.GET_CONFIG });
  assert.deepEqual(replies, [["storage offline"]]);
});

test("an Error without a message falls back to its string form", async () => {
  settings.settingsStorage.getItem = () => {
    throw new Error("");
  };
  const replies = await request({ method: METHOD.GET_CONFIG });
  assert.deepEqual(replies, [["Error"]]);
});

test("GET_ENERGY routes to ha.getEnergy", async () => {
  routes([
    [
      (o) => o.url === "https://h/api/states",
      json(200, [
        { entity_id: "sensor.power_meter", state: "100", attributes: { unit_of_measurement: "W", device_class: "power" } },
        { entity_id: "sensor.temperature", state: "20", attributes: { unit_of_measurement: "°C" } },
      ]),
    ],
  ]);
  const [[err, energy]] = await request({ method: METHOD.GET_ENERGY, params: {} });
  assert.equal(err, null);
  assert.equal(energy.length, 1);
  assert.equal(energy[0].entity_id, "sensor.power_meter");
});

test("SET_ENTITY_VISIBILITY routes to ha.setEntityVisibility", async () => {
  store.set(SETTING.ENTITY_LIST, JSON.stringify([{ key: "light.bulb", title: "Bulb", value: false }]));
  const [[err, res]] = await request({
    method: METHOD.SET_ENTITY_VISIBILITY,
    params: { entity_id: "light.bulb", visible: true },
  });
  assert.equal(err, null);
  assert.equal(res.ok, true);
  assert.equal(res.visible, true);
  const list = JSON.parse(store.get(SETTING.ENTITY_LIST));
  assert.equal(list[0].value, true);
});

test("REFRESH_ENTITIES rebuilds the entity list and writes an ok status", async () => {
  routes([[(o) => o.url === "https://h/api/states", json(200, [{ entity_id: "light.a", state: "on", attributes: {} }])]]);
  def.onSettingsChange({ key: SETTING.REFRESH_ENTITIES });
  await flush();
  const status = JSON.parse(store.get(SETTING.STATUS));
  assert.equal(status.ok, true);
  assert.equal(status.message, "1 entities");
  assert.equal(typeof status.time, "number");
  assert.deepEqual(JSON.parse(store.get(SETTING.ENTITY_LIST)), [{ key: "light.a", title: "light.a", value: false, area_id: "", area_name: "" }]);
});

test("REFRESH_ENTITIES writes the HA error into the status when the request fails", async () => {
  routes([[(o) => o.url === "https://h/api/states", json(500, {})]]);
  def.onSettingsChange({ key: SETTING.REFRESH_ENTITIES });
  await flush();
  const status = JSON.parse(store.get(SETTING.STATUS));
  assert.equal(status.ok, false);
  assert.equal(status.message, "HTTP 500");
});

test("REFRESH_ENTITIES reports a network failure with a plain message", async () => {
  routes([[(o) => o.url.startsWith("https://h"), new Error("offline")]]);
  def.onSettingsChange({ key: SETTING.REFRESH_ENTITIES });
  await flush();
  const status = JSON.parse(store.get(SETTING.STATUS));
  assert.equal(status.ok, false);
  assert.equal(status.message, "Connection error: offline");
});

test("REGISTER_REQUEST registers the watch and writes an ok status", async () => {
  routes([
    [(o) => o.url === "https://h/api/mobile_app/registrations", json(201, { webhook_id: "wh", secret: "s" })],
    [(o) => o.url === "https://h/api/webhook/wh", json(200, {})],
  ]);
  def.onSettingsChange({ key: SETTING.REGISTER_REQUEST });
  await flush();
  const status = JSON.parse(store.get(SETTING.STATUS));
  assert.deepEqual([status.ok, status.message], [true, "Registered"]);
  assert.equal(JSON.parse(store.get(SETTING.MOBILE_APP)).webhook_id, "wh");
});

test("REGISTER_REQUEST writes the failure into the status", async () => {
  routes([[(o) => o.url.endsWith("/api/mobile_app/registrations"), json(200, {})]]);
  def.onSettingsChange({ key: SETTING.REGISTER_REQUEST });
  await flush();
  const status = JSON.parse(store.get(SETTING.STATUS));
  assert.deepEqual([status.ok, status.message], [false, "Unexpected response from Home Assistant"]);
});

test("a non-Error failure in a settings action is written as its string form", async () => {
  settings.settingsStorage.getItem = () => {
    throw "no settings";
  };
  def.onSettingsChange({ key: SETTING.REFRESH_ENTITIES });
  await flush();
  const status = JSON.parse(store.get(SETTING.STATUS));
  assert.deepEqual([status.ok, status.message], [false, "no settings"]);
});

test("unrelated settings keys, including the status key itself, do nothing", async () => {
  def.onSettingsChange({ key: SETTING.LOCAL_URL });
  def.onSettingsChange({ key: SETTING.STATUS });
  def.onSettingsChange({ key: "constructorish" });
  await flush();
  assert.equal(fetchCalls.length, 0);
  assert.equal(store.has(SETTING.STATUS), false);
});

// HANDLERS is a plain object, so inherited keys look like methods.
test(
  "a method named after an Object.prototype key is not treated as a method",
  async () => {
    const replies = await request({ method: "toString", params: {} });
    assert.equal(replies[0][0], "Unknown method toString");
  }
);
