// Every handler and branch of app-service/sync.js and page/sync/index.js, each module imported once
// per process so V8 coverage counts them (sync.test.js covers the main paths through load()/open()).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { state, reset, respond, open, texts, findText, click } from "./helpers/watch.js";
import { localStorage } from "./mocks/zos/storage.js";
import { refuse } from "./mocks/zos/alarm.js";
import { nextDelaySeconds } from "../app-service/sync.js";
import { FEATURES } from "../config/build.js";

const service = globalThis.__zepp.service;

const realGetApp = globalThis.getApp;
const realNow = Date.now;
const realStorage = { getItem: localStorage.getItem, setItem: localStorage.setItem, removeItem: localStorage.removeItem };
const realAppService = FEATURES.appService;
const realNotification = FEATURES.notification;

// Phone messaging as app.js exposes it (globalData.messaging).
function phone(request) {
  globalThis.getApp = () => ({ _options: { globalData: { messaging: { request } } } });
}
const boom = () => {
  throw new Error("storage blocked");
};

afterEach(() => {
  Object.assign(localStorage, realStorage);
  globalThis.getApp = realGetApp;
  Date.now = realNow;
  refuse.set = false;
  refuse.cancel = false;
  FEATURES.appService = realAppService;
  FEATURES.notification = realNotification;
  reset();
});

// ---- app-service/sync.js ----

test("nextDelaySeconds: no result, a bad interval or a failure all retry in 5 minutes", () => {
  assert.equal(nextDelaySeconds(undefined), 300);
  assert.equal(nextDelaySeconds({ ok: true, interval: "abc" }), 300);
  assert.equal(nextDelaySeconds({ ok: true, interval: "2" }), 120);
});

test("service: blocked storage is survived; the run still sends and schedules", async () => {
  reset();
  localStorage.getItem = boom;
  localStorage.setItem = boom;
  localStorage.removeItem = boom;
  phone(async () => ({ interval: 5 }));
  const result = await service.onInit();
  assert.deepEqual([result.ok, result.interval], [true, 5]);
  assert.ok(state.alarms.size >= 1, "an alarm is still set");
  assert.equal(state.storage.size, 0, "nothing could be stored");
});

// runSync schedules a retry before sending and the next run after. With storage blocked the id of the
// first one cannot be read back, so it is never cancelled and every run adds alarms.
test("with storage blocked the pre-send retry alarm is still replaced", async () => {
  reset();
  localStorage.getItem = boom;
  localStorage.setItem = boom;
  phone(async () => ({ interval: 5 }));
  await service.onInit();
  assert.equal(state.alarms.size, 1);
});

test("service: a null storage read falls back to the default; a refused alarm removes the stored id", async () => {
  reset();
  state.storage.set("sync_alarm_id", 99);
  localStorage.getItem = () => null; // blank read: prev alarm 0, failures 0
  phone(async () => {
    throw new Error("down");
  });
  refuse.set = true;
  localStorage.removeItem = boom; // refused alarm: removing the id fails and is ignored
  const result = await service.onInit();
  assert.deepEqual(result, { ok: false, error: "down" });
  assert.equal(state.alarms.size, 0);
  assert.equal(state.storage.get("sync_failures"), 1);
});

test("service: a stale alarm the system will not cancel is ignored and a new one is set", async () => {
  reset();
  phone(async () => ({ interval: 5 }));
  await service.onInit();
  const [firstId] = [...state.alarms.keys()];
  refuse.cancel = true;
  await service.onInit();
  assert.ok(state.alarms.has(firstId), "the old alarm could not be cancelled and keeps running");
  assert.ok(state.alarms.has(Number(state.storage.get("sync_alarm_id"))), "the stored id is the newest alarm");
});

test("service: a non-Error rejection is stored as text; notifications can be turned off", async () => {
  reset();
  FEATURES.notification = false;
  phone(async () => {
    throw "boom";
  });
  for (let i = 0; i < 3; i++) await service.onInit();
  assert.equal(JSON.parse(state.storage.get("last_sync")).error, "boom");
  assert.equal(state.notifications.length, 0, "no notification with the feature off");
  assert.equal(state.storage.get("sync_failures"), 3, "the streak is still counted");
});

test("service: onDestroy has nothing to release", () => {
  assert.equal(service.onDestroy(), undefined);
});

// ---- page/sync/index.js ----

test("page: never synced, unknown mode when the config fails, and the auto-sync line when appService is off", async () => {
  reset();
  respond({ GET_CONFIG: new Error("offline") });
  FEATURES.appService = false;
  await open("page/sync/index.js");
  assert.ok(texts().some((t) => t.endsWith("sync_never")), texts().join("|"));
  assert.ok(texts().some((t) => t.includes("sync_mode_unknown")), texts().join("|"));
  assert.equal(texts().some((t) => t.startsWith("sync_auto")), false);
});

test("page: a config without a mode shows the loading dots; an unreadable last sync counts as never", async () => {
  reset();
  respond({ GET_CONFIG: {} });
  FEATURES.appService = true;
  state.storage.set("last_sync", "{broken");
  await open("page/sync/index.js");
  assert.ok(texts().some((t) => t.endsWith(": ...")), texts().join("|"));
  assert.ok(texts().some((t) => t.endsWith("sync_never")));
  assert.ok(texts().includes("sync_auto_off"));
  assert.ok(findText("sync_start"));
});

test("page: blocked storage shows as never synced and not auto-syncing", async () => {
  reset();
  respond({ GET_CONFIG: { sensorMode: "rest" } });
  FEATURES.appService = true;
  localStorage.getItem = boom;
  await open("page/sync/index.js");
  assert.ok(texts().some((t) => t.endsWith("sync_never")));
  assert.ok(texts().includes("sync_auto_off"));
});

test("page: a successful last sync shows its time and the ok line, auto-sync on shows stop", async () => {
  reset();
  respond({ GET_CONFIG: { sensorMode: "rest" } });
  FEATURES.appService = true;
  state.storage.set("last_sync", JSON.stringify({ time: Date.UTC(2026, 9, 24, 12, 0), ok: true }));
  state.storage.set("sync_alarm_id", "7");
  await open("page/sync/index.js");
  assert.ok(texts().includes("sync_ok"));
  assert.ok(texts().some((t) => /^sync_last: \d\d-\d\d \d\d:\d\d$/.test(t)), texts().join("|"));
  assert.ok(texts().includes("sync_auto_on"));
  assert.ok(findText("sync_stop"));
});

test("page: a failed sync is toasted even when storage cannot save it", async () => {
  reset();
  respond({ GET_CONFIG: { sensorMode: "rest" }, SYNC_SENSORS: new Error("offline") });
  await open("page/sync/index.js");
  localStorage.setItem = boom;
  await click(findText("sync_now"));
  assert.deepEqual(state.toasts, ["sync_failed"]);
});

test("page: a payload that cannot be built fails the sync with that error", async () => {
  reset();
  respond({ GET_CONFIG: { sensorMode: "rest" }, SYNC_SENSORS: { interval: 5 } });
  await open("page/sync/index.js");
  Date.now = () => NaN; // the payload time is invalid, so building it throws
  await click(findText("sync_now"));
  Date.now = realNow;
  assert.deepEqual(state.toasts, ["sync_failed"]);
  assert.equal(state.requests.filter((r) => r.method === "SYNC_SENSORS").length, 0, "nothing was sent");
  assert.equal(JSON.parse(state.storage.get("last_sync")).ok, false);
});

test("page: start with a refused alarm says so and stores nothing", async () => {
  reset();
  respond({ GET_CONFIG: { sensorMode: "zepp2hass" } });
  await open("page/sync/index.js");
  refuse.set = true;
  await click(findText("sync_start"));
  assert.deepEqual(state.toasts, ["sync_failed"]);
  assert.equal(state.storage.has("sync_alarm_id"), false);
  assert.ok(findText("sync_start"), "still offers to start");
});

test("page: stopping an alarm the system will not cancel still clears the stored id", async () => {
  reset();
  respond({ GET_CONFIG: { sensorMode: "zepp2hass" } });
  state.storage.set("sync_alarm_id", "5");
  state.storage.set("last_sync", "not json at all"); // unreadable last sync is shown as never synced
  state.alarms.set(5, { url: "app-service/sync" });
  refuse.cancel = true;
  const page = await open("page/sync/index.js");
  assert.ok(findText("sync_stop"), "the stored alarm counts as on");
  await click(findText("sync_stop"));
  assert.deepEqual(state.toasts, ["sync_stopped"]);
  assert.equal(state.storage.has("sync_alarm_id"), false);
  assert.equal(state.alarms.size, 1, "the system kept the refused alarm");
  page.onDestroy();
});

test("page: stopping when the storage cannot remove the key still stops the timer", async () => {
  reset();
  respond({ GET_CONFIG: { sensorMode: "zepp2hass" } });
  state.storage.set("sync_alarm_id", "3");
  state.alarms.set(3, {});
  localStorage.removeItem = boom;
  await open("page/sync/index.js");
  await click(findText("sync_stop"));
  assert.equal(state.alarms.size, 0);
  assert.deepEqual(state.toasts, ["sync_stopped"]);
});

test("page: a sync that returns no text reason in its error is shown as the String of it", async () => {
  reset();
  respond({ GET_CONFIG: { sensorMode: "rest" }, SYNC_SENSORS: async () => {
    throw "plain text";
  } });
  await open("page/sync/index.js");
  await click(findText("sync_now"));
  assert.equal(JSON.parse(state.storage.get("last_sync")).error, "plain text");
  assert.ok(texts().some((t) => t === "sync_error: plain text"), texts().join("|"));
});

test("page: starting again replaces the stored alarm; one the system will not cancel keeps running", async () => {
  reset();
  respond({ GET_CONFIG: { sensorMode: "rest" } });
  state.storage.set("sync_alarm_id", "4");
  state.alarms.set(4, {});
  const page = await open("page/sync/index.js");
  page.startAuto(); // the button only offers start when no alarm is stored, so call the handler directly
  assert.equal(state.alarms.has(4), false, "the stored alarm is cancelled");
  assert.equal(state.alarms.size, 1);
  assert.deepEqual(state.toasts, ["sync_started"]);

  refuse.cancel = true;
  page.startAuto();
  assert.equal(state.alarms.size, 2, "the alarm the system refused to cancel keeps running");
  page.onDestroy();
});

test("page: destroying the page clears its widgets", async () => {
  reset();
  respond({ GET_CONFIG: { sensorMode: "rest" } });
  const page = await open("page/sync/index.js");
  assert.ok(state.widgets.length > 0);
  page.onDestroy();
  assert.equal(state.widgets.length, 0);
});
