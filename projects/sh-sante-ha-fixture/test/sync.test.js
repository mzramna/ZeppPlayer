import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { state, reset, respond, load, open, texts, findText, click, flush } from "./helpers/watch.js";
import { collectReadings } from "../app-service/collect.js";
import { nextDelaySeconds } from "../app-service/sync.js";
import { FEATURES } from "../config/build.js";

const realGetApp = globalThis.getApp;
const realAppService = FEATURES.appService;

// Phone messaging as app.js exposes it (globalData.messaging).
function phone(request) {
  globalThis.getApp = () => ({ _options: { globalData: { messaging: { request } } } });
}

const sensors = () => {
  state.sensors.HeartRate = { getLast: 72, getResting: 60, getDailySummary: () => ({ maximum: { hr_value: 150 } }) };
  state.sensors.Battery = { getCurrent: 80 };
  state.sensors.Step = { getCurrent: 4200, getTarget: 8000 };
  state.sensors.Sleep = {
    updateInfo() {},
    getInfo: () => ({ score: 80, startTime: 1, endTime: 2, deepTime: 30, totalTime: 400 }),
    getSleepingStatus: 1,
  };
  state.sensors.Stress = { getCurrent: () => ({ value: 35 }) };
};

beforeEach(() => {
  reset();
  sensors();
});
afterEach(() => {
  globalThis.getApp = realGetApp;
  FEATURES.appService = realAppService;
});

test("collectReadings maps sensors into the zepp2hass readings shape", () => {
  const r = collectReadings();
  assert.equal(r.battery.level, 80);
  assert.deepEqual(r.steps, { current: 4200, target: 8000 });
  assert.deepEqual(r.heartRate, { last: 72, resting: 60, max: 150 });
  assert.equal(r.stress, 35);
  assert.equal(r.sleep.status, 1);
  assert.equal(r.sleep.score, 80);
  assert.equal(r.device.name, "Amazfit Balance");
  assert.equal(r.user.nickName, "Tester");
});

test("collectReadings leaves only the failing sensor undefined", () => {
  state.sensors.Stress = { getCurrent: () => { throw new Error("sensor busy"); } };
  const r = collectReadings();
  assert.equal(r.stress, undefined);
  assert.equal(r.steps.current, 4200);
  assert.equal(r.heartRate.last, 72);
});

test("nextDelaySeconds: interval minutes after success, 5 minutes after failure", () => {
  assert.equal(nextDelaySeconds({ ok: true, interval: 10 }), 600);
  assert.equal(nextDelaySeconds({ ok: true, interval: 0 }), 300);
  assert.equal(nextDelaySeconds({ ok: false, error: "x" }), 300);
});

test("service success schedules the next run after interval minutes", async () => {
  const svc = await load("app-service/sync.js", "service");
  const sent = [];
  phone(async (req) => {
    sent.push(req);
    return { interval: 10 };
  });
  await svc.onInit();
  assert.equal(sent[0].method, "SYNC_SENSORS");
  assert.equal(sent[0].params.payload.device.deviceName, "Amazfit Balance");
  assert.equal(state.alarms.size, 1);
  const [[id, alarm]] = [...state.alarms];
  assert.deepEqual([alarm.url, alarm.delay, alarm.store], ["app-service/sync", 600, true]);
  assert.equal(state.storage.get("sync_alarm_id"), id);
  assert.equal(JSON.parse(state.storage.get("last_sync")).ok, true);
});

test("service failure retries in 300 seconds and records the error", async () => {
  const svc = await load("app-service/sync.js", "service");
  phone(async () => {
    throw new Error("no phone");
  });
  await svc.onInit();
  const [alarm] = [...state.alarms.values()];
  assert.equal(alarm.delay, 300);
  const last = JSON.parse(state.storage.get("last_sync"));
  assert.deepEqual([last.ok, last.error], [false, "no phone"]);
});

test("third failure in a row notifies once; later failures in the same streak do not notify again", async () => {
  const svc = await load("app-service/sync.js", "service");
  let fail = true;
  phone(async () => {
    if (fail) throw new Error("down");
    return { interval: 5 };
  });
  await svc.onInit();
  await svc.onInit();
  assert.equal(state.notifications.length, 0);
  await svc.onInit();
  assert.equal(state.notifications.length, 1);
  assert.equal(state.notifications[0].title, "sync_failing_title");
  assert.equal(state.storage.get("sync_failures"), 3);

  // The retry every 5 minutes must not re-notify while the streak lasts.
  await svc.onInit();
  await svc.onInit();
  assert.equal(state.notifications.length, 1);

  fail = false;
  await svc.onInit();
  assert.equal(state.notifications.length, 1);
  assert.equal(state.storage.get("sync_failures"), 0);
});

test("a phone with no sensor mode stops the background sync: the alarm is cancelled and not renewed", async () => {
  const svc = await load("app-service/sync.js", "service");
  let answer = { interval: 5 };
  phone(async () => answer);
  await svc.onInit();
  assert.equal(state.alarms.size, 1);
  const lastBefore = state.storage.get("last_sync");

  answer = { disabled: true };
  const result = await svc.onInit();
  assert.equal(result.disabled, true);
  assert.equal(state.alarms.size, 0, "no retry or next run is set");
  assert.equal(state.storage.has("sync_alarm_id"), false);
  assert.equal(state.storage.get("last_sync"), lastBefore, "not recorded as a failure");
  assert.equal(state.notifications.length, 0);
});

test("a success in between resets the failure count", async () => {
  const svc = await load("app-service/sync.js", "service");
  let fail = true;
  phone(async () => {
    if (fail) throw new Error("down");
    return { interval: 5 };
  });
  await svc.onInit();
  await svc.onInit();
  fail = false;
  await svc.onInit();
  fail = true;
  await svc.onInit();
  await svc.onInit();
  assert.equal(state.notifications.length, 0);
});

test("page shows last sync, the mode and hides start/stop without appService", async () => {
  respond({ GET_CONFIG: { sensorMode: "zepp2hass" } });
  state.storage.set("last_sync", JSON.stringify({ time: Date.UTC(2026, 9, 24, 12, 0), ok: false, error: "offline" }));
  FEATURES.appService = false;
  await open("page/sync/index.js");
  assert.ok(texts().some((t) => t.includes("sync_error: offline")), texts().join("|"));
  assert.ok(texts().some((t) => t.includes("sync_mode_zepp2hass")));
  assert.ok(findText("sync_now"));
  assert.equal(findText("sync_start"), undefined);
  assert.equal(findText("sync_stop"), undefined);
});

test("sync now sends the payload, toasts ok and stores last_sync", async () => {
  respond({ GET_CONFIG: { sensorMode: "rest" }, SYNC_SENSORS: { interval: 5 } });
  await open("page/sync/index.js");
  await click(findText("sync_now"));
  const req = state.requests.find((r) => r.method === "SYNC_SENSORS");
  assert.equal(req.params.payload.battery.current, 80);
  assert.deepEqual(state.toasts, ["sync_done"]);
  assert.equal(JSON.parse(state.storage.get("last_sync")).ok, true);
});

test("sync now shows the error and stores it when the phone refuses", async () => {
  respond({ GET_CONFIG: { sensorMode: "none" }, SYNC_SENSORS: new Error("offline") });
  await open("page/sync/index.js");
  await click(findText("sync_now"));
  assert.deepEqual(state.toasts, ["sync_failed"]);
  assert.equal(JSON.parse(state.storage.get("last_sync")).error, "offline");
});

test("start sets an alarm for the service, stop cancels it", async () => {
  respond({ GET_CONFIG: { sensorMode: "zepp2hass" } });
  await open("page/sync/index.js");
  await click(findText("sync_start"));
  assert.equal(state.alarms.size, 1);
  const [[id, alarm]] = [...state.alarms];
  assert.deepEqual([alarm.url, alarm.delay], ["app-service/sync", 10]);
  assert.equal(state.storage.get("sync_alarm_id"), id);
  assert.ok(findText("sync_stop"));

  await click(findText("sync_stop"));
  assert.equal(state.alarms.size, 0);
  assert.equal(state.storage.has("sync_alarm_id"), false);
  assert.ok(findText("sync_start"));
});

test("start replaces an alarm that was already set", async () => {
  respond({ GET_CONFIG: { sensorMode: "zepp2hass" } });
  await open("page/sync/index.js");
  await click(findText("sync_start"));
  const [firstId] = [...state.alarms.keys()];
  await click(findText("sync_stop"));
  await click(findText("sync_start"));
  assert.equal(state.alarms.size, 1);
  assert.notEqual([...state.alarms.keys()][0], firstId);
});

test("page: a sync reply that arrives after the page was left toasts and draws nothing", async () => {
  reset();
  let release;
  respond({ GET_CONFIG: { sensorMode: "rest" }, SYNC_SENSORS: () => new Promise((r) => (release = r)) });
  const page = await open("page/sync/index.js");
  const done = page.syncNow();
  await flush(); // the request is out, its reply pending
  page.onDestroy();
  release({ interval: 5 });
  await done;
  assert.deepEqual(state.toasts, []);
  assert.equal(state.widgets.length, 0, "nothing drawn after destroy");
});
