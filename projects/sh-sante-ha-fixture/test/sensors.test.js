import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { buildPayload, getPath } from "../shared/zepp2hass.js";
import { syncSensors } from "../app-side/sensors.js";
import { webhook, updateSensors } from "../app-side/mobile-app.js";

let store;
let calls;

beforeEach(() => {
  store = {};
  calls = [];
  globalThis.settings = {
    settingsStorage: {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => {
        store[key] = value;
      },
      removeItem: (key) => {
        delete store[key];
      },
    },
  };
  globalThis.fetch = async () => ({ status: 200, body: "{}" });
});

// Records each fetch; `respond(opts)` returns the response or throws to simulate a network error.
function stubFetch(respond) {
  globalThis.fetch = async (opts) => {
    calls.push(opts);
    return respond(opts);
  };
}

const sample = {
  time: Date.UTC(2026, 9, 24, 12, 0, 0),
  battery: { level: 80, charging: true },
  steps: { current: 1234, target: 8000 },
  calorie: null,
  heartRate: { last: 72, resting: 58, max: 150 },
  bloodOxygen: [{ spo2: 96 }, { spo2: 97 }],
  bodyTemperature: 3650,
  sleep: { status: 0, score: 80, startTime: 1, endTime: 2, deepTime: 60, totalTime: 400 },
  wearing: 2,
  device: { name: "Amazfit Balance", source: 1, width: 480, height: 480 },
};

test("buildPayload maps readings to integration paths and omits empty sections", () => {
  const payload = buildPayload(sample);
  assert.equal(payload.record_time, "2026-10-24T12:00:00.000Z");
  assert.deepEqual(payload.battery, { current: 80, is_charging: true });
  assert.deepEqual(payload.steps, { current: 1234, target: 8000 });
  assert.deepEqual(payload.heart_rate, { last: 72, resting: 58, summary: { maximum: { hr_value: 150 } } });
  assert.deepEqual(payload.blood_oxygen, { few_hours: sample.bloodOxygen });
  assert.equal(payload.body_temperature.current.value, 36.5);
  assert.deepEqual(payload.sleep, { status: 0, info: { score: 80, startTime: 1, endTime: 2, deepTime: 60, totalTime: 400 } });
  assert.equal(payload.is_wearing, 2);
  assert.deepEqual(payload.device, { deviceName: "Amazfit Balance", deviceSource: 1, width: 480, height: 480 });
  for (const key of ["calorie", "distance", "stress", "pai", "user", "stands"]) {
    assert.ok(!(key in payload), `${key} should be omitted`);
  }
  assert.equal(getPath(payload, "blood_oxygen.few_hours.-1.spo2"), 97);
});

test("buildPayload with no readings keeps only record_time", () => {
  assert.deepEqual(Object.keys(buildPayload({ time: 0 })), ["record_time"]);
});

test("syncSensors posts the payload to the zepp2hass URL without an auth header", async () => {
  store.sensorMode = "zepp2hass";
  store.zepp2hassUrl = "https://ha.example/api/webhook/abc";
  store.syncInterval = "10";
  stubFetch(() => ({ status: 200, body: '{"status":"ok"}' }));

  const out = await syncSensors({ payload: { record_time: "x" } });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://ha.example/api/webhook/abc");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].body), { record_time: "x" });
  assert.deepEqual(out, { interval: 10 });
  assert.equal(JSON.parse(store.lastSync).ok, true);
});

test("syncSensors records a failure in lastSync and rethrows", async () => {
  store.sensorMode = "zepp2hass";
  store.zepp2hassUrl = "https://ha.example/api/webhook/abc";
  stubFetch(() => ({ status: 500, body: "boom" }));

  await assert.rejects(syncSensors({ payload: {} }), /HTTP 500/);
  const last = JSON.parse(store.lastSync);
  assert.equal(last.ok, false);
  assert.match(last.error, /HTTP 500/);
});

test("syncSensors answers disabled, without an error, when the mode is none or unset", async () => {
  store.sensorMode = "none";
  assert.deepEqual(await syncSensors({ payload: {} }), { disabled: true });
  delete store.sensorMode;
  assert.deepEqual(await syncSensors({ payload: {} }), { disabled: true });
  assert.equal(store.lastSync, undefined, "no status is written for a disabled sync");
});

test("webhook tries cloudhook, remote UI, then LAN and external URLs in order", async () => {
  store.mobileApp = JSON.stringify({
    device_id: "d",
    webhook_id: "wh",
    cloudhook_url: "https://hooks.example/cloud",
    remote_ui_url: "https://ui.example/",
  });
  store.localHAIP = "http://192.168.1.2:8123/";
  store.externalHAIP = "https://ha.example.com/ha";
  // Network errors (fetch rejects) fall through; the fourth URL answers.
  let attempt = 0;
  stubFetch(() => {
    attempt += 1;
    if (attempt < 4) throw new Error("unreachable");
    return { status: 200, body: "{}" };
  });

  await webhook("fire_event", { event_type: "x" });

  assert.deepEqual(calls.map((c) => c.url), [
    "https://hooks.example/cloud",
    "https://ui.example/api/webhook/wh",
    "http://192.168.1.2:8123/api/webhook/wh",
    "https://ha.example.com/ha/api/webhook/wh",
  ]);
  assert.deepEqual(JSON.parse(calls[3].body), { type: "fire_event", data: { event_type: "x" } });
});

test("webhook 410 clears the stored registration and asks for re-registration", async () => {
  store.mobileApp = JSON.stringify({ device_id: "d", webhook_id: "wh", cloudhook_url: "https://hooks.example/cloud" });
  stubFetch(() => ({ status: 410, body: "" }));

  await assert.rejects(webhook("fire_event", {}), /press Register in the settings again/);
  assert.equal(store.mobileApp, undefined);
});

test("webhook without a registration throws a clear error", async () => {
  await assert.rejects(webhook("fire_event", {}), /Not registered/);
});

test("updateSensors maps payload paths to states and skips missing values", async () => {
  store.mobileApp = JSON.stringify({ device_id: "d", webhook_id: "wh", cloudhook_url: "https://hooks.example/cloud" });
  stubFetch(() => ({ status: 200, body: "{}" }));

  await updateSensors(buildPayload(sample));

  const body = JSON.parse(calls[0].body);
  assert.equal(body.type, "update_sensor_states");
  const byId = Object.fromEntries(body.data.map((s) => [s.unique_id, s]));
  assert.deepEqual(byId.battery, { unique_id: "battery", type: "sensor", state: 80 });
  assert.deepEqual(byId.is_wearing, { unique_id: "is_wearing", type: "binary_sensor", state: true });
  assert.deepEqual(byId.blood_oxygen, { unique_id: "blood_oxygen", type: "sensor", state: 97 });
  assert.equal(byId.body_temperature.state, 36.5);
  assert.equal("calories" in byId, false);
  assert.equal("stress" in byId, false);
});
