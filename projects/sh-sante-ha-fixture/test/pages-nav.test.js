import { test } from "node:test";
import assert from "node:assert/strict";
// Pages load once per process (openOnce), so V8 coverage counts every test here.
import { state, reset, respond, openOnce as open, texts, findText, click, clickable, flush } from "./helpers/watch.js";
import { emitDigitalCrown, emitGesture, GESTURE_LEFT, GESTURE_RIGHT } from "./mocks/zos/interaction.js";
import { FEATURES } from "../config/build.js";
import { COLOR, DOMAINS } from "../utils/theme.js";
import { GROUP_DOMAINS } from "../utils/groups.js";
import { runTap } from "../utils/nav.js";
import { BasePage } from "@zeppos/zml/base-page";

const ent = (entity_id, name, st = "off", extra = {}) => ({ entity_id, name, state: st, ...extra });
const LIGHT = ent("light.a", "Lamp");
const SWITCH = ent("switch.s", "Desk Switch", "on");
const SENSOR = ent("sensor.t", "Temp", "21", { unit: "°C" });
const SCRIPT = ent("script.night", "Night Script");
const ALL = [LIGHT, SWITCH, SENSOR, SCRIPT];

// Translations used by the pages, so assertions read like the screen.
const STRINGS = {
  favorites: "Favorites", devices: "Devices", energy: "Energy", scripts: "Scripts", sensors: "Sensors", areas: "Areas", sync: "Sync",
  done: "Done", action_failed: "Failed", no_entities: "No entities", no_areas: "No areas", entities: "entities",
  sleep_as_android: "Sleep as Android", loading: "Loading", state_on: "On", state_off: "Off",
  next: "Next", prev: "Prev",
};

// GET_ENTITIES answers with the entities of `ids` when given, like the phone does.
const byIds = (p) => (p.ids ? ALL.filter((e) => p.ids.includes(e.entity_id)) : ALL);

function setup(extra = {}) {
  reset();
  state.strings = { ...STRINGS };
  respond({ GET_CONFIG: { favorites: [], sensorMode: "none" }, GET_ENTITIES: byIds, ...extra });
}

// A failed request is drawn as text in the danger colour.
const expectErrorShown = (text) => {
  const w = findText(text);
  assert.ok(w, `error text "${text}" shown`);
  assert.equal(w.props.color, COLOR.danger);
};

const hasFeature = async (name, value, fn) => {
  const old = FEATURES[name];
  FEATURES[name] = value;
  try {
    return await fn();
  } finally {
    FEATURES[name] = old;
  }
};

// ---- page/home ---------------------------------------------------------------

test("home lists favourites in the configured order and skips ids that are gone", async () => {
  setup({
    GET_CONFIG: { favorites: ["switch.s", "gone.x", "light.a"], sensorMode: "none" },
  });
  await open("page/home/index.js");
  const t = texts();
  assert.ok(t.includes("Favorites"));
  assert.ok(t.indexOf("Desk Switch") < t.indexOf("Lamp"), t.join("|"));
  assert.ok(!t.some((x) => x.includes("gone")));
  assert.deepEqual(state.requests.map((r) => r.method), ["GET_CONFIG", "GET_ENTITIES"]);
});

test("home asks for the config first, then only the favourites by their ids", async () => {
  setup({ GET_CONFIG: { favorites: ["switch.s", "light.a"], sensorMode: "none" } });
  await open("page/home/index.js");
  assert.deepEqual(state.requests, [
    { method: "GET_CONFIG", params: {} },
    { method: "GET_ENTITIES", params: { ids: ["switch.s", "light.a"] } },
  ]);
});

test("home with no favourites asks the phone for the config and nothing else", async () => {
  setup({ GET_CONFIG: { favorites: [], sensorMode: "none" } });
  await open("page/home/index.js");
  assert.deepEqual(state.requests, [{ method: "GET_CONFIG", params: {} }]);
});

test("home without favourites draws only the categories", async () => {
  setup({ GET_CONFIG: { favorites: ["gone.x"], sensorMode: "none" } });
  await hasFeature("appService", false, () => open("page/home/index.js"));
  const t = texts();
  assert.ok(!t.includes("Favorites"), "no favourites heading when none resolve");
  for (const label of ["Devices", "Energy", "Scripts", "Sensors", "Areas"]) assert.ok(t.includes(label), label);
  assert.ok(!t.includes("Sync"), "sync hidden when no sensor mode and feature off");
});

test("home shows the sync category only when the app service is on and sensors are pushed", async () => {
  setup({ GET_CONFIG: { favorites: [], sensorMode: "none" } });
  await hasFeature("appService", true, () => open("page/home/index.js"));
  assert.ok(!texts().includes("Sync"), "app service alone: nothing to sync");

  setup({ GET_CONFIG: { favorites: [], sensorMode: "zepp2hass" } });
  await hasFeature("appService", false, () => open("page/home/index.js"));
  assert.ok(!texts().includes("Sync"), "sensors alone: no app service");

  setup({ GET_CONFIG: { favorites: [], sensorMode: "zepp2hass" } });
  await hasFeature("appService", true, () => open("page/home/index.js"));
  assert.ok(texts().includes("Sync"), "both: sync shown");
});

test("home shows the Sleep as Android card only with a notify service and the sleep feature", async () => {
  setup({ GET_CONFIG: { favorites: [], sensorMode: "none", saaNotifyService: "mobile_app_pixel_8" } });
  await open("page/home/index.js");
  assert.ok(texts().includes("Sleep as Android"), texts().join("|"));

  setup({ GET_CONFIG: { favorites: [], sensorMode: "none", saaNotifyService: "" } });
  await open("page/home/index.js");
  assert.ok(!texts().includes("Sleep as Android"), "no notify service");

  setup({ GET_CONFIG: { favorites: [], sensorMode: "none", saaNotifyService: "mobile_app_pixel_8" } });
  await hasFeature("sleepAsAndroid", false, () => open("page/home/index.js"));
  assert.ok(!texts().includes("Sleep as Android"), "feature off");
});

test("tapping the Sleep as Android card opens the sleep page", async () => {
  setup({ GET_CONFIG: { favorites: [], sensorMode: "none", saaNotifyService: "mobile_app_pixel_8" } });
  await open("page/home/index.js");
  await click(findText("Sleep as Android"));
  assert.deepEqual(state.routes, [{ type: "push", url: "page/sleep/index", params: undefined }]);
});

test("home category buttons open the entity groups and areas", async () => {
  setup();
  await open("page/home/index.js");
  const routeOf = async (label) => {
    state.routes = [];
    await click(findText(label));
    return state.routes;
  };
  assert.deepEqual(await routeOf("Devices"), [{ type: "push", url: "page/entities/index", params: '{"group":"devices"}' }]);
  assert.deepEqual(await routeOf("Energy"), [{ type: "push", url: "page/energy/index", params: undefined }]);
  assert.deepEqual(await routeOf("Scripts"), [{ type: "push", url: "page/entities/index", params: '{"group":"scripts"}' }]);
  assert.deepEqual(await routeOf("Sensors"), [{ type: "push", url: "page/entities/index", params: '{"group":"sensors"}' }]);
  assert.deepEqual(await routeOf("Areas"), [{ type: "push", url: "page/areas/index", params: undefined }]);
});

test("home sync category opens the sync page", async () => {
  setup({ GET_CONFIG: { favorites: [], sensorMode: "zepp2hass" } });
  await open("page/home/index.js");
  await click(findText("Sync"));
  assert.deepEqual(state.routes, [{ type: "push", url: "page/sync/index", params: undefined }]);
});

test("tapping a favourite with its own page pushes that page with the entity id", async () => {
  setup({ GET_CONFIG: { favorites: ["light.a"], sensorMode: "none" } });
  await open("page/home/index.js");
  await click(clickable("Lamp"));
  assert.equal(state.routes.length, 1);
  assert.equal(state.routes[0].url, "page/light/index");
  assert.deepEqual(JSON.parse(state.routes[0].params), { entity_id: "light.a" });
  assert.equal(state.requests.filter((r) => r.method === "CALL_SERVICE").length, 0);
});

test("tapping a favourite with a service runs it, toasts done and reloads the home page", async () => {
  setup({
    GET_CONFIG: { favorites: ["switch.s"], sensorMode: "none" },
    CALL_SERVICE: { ok: true },
    GET_ENTITY: { ...SWITCH, state: "off" },
  });
  await open("page/home/index.js");
  state.requests = [];
  await click(clickable("Desk Switch"));
  assert.deepEqual(state.requests.map((r) => r.method), ["CALL_SERVICE", "GET_ENTITY"]);
  assert.deepEqual(state.requests[0].params, { domain: "switch", service: "toggle", entity_id: "switch.s" });
  assert.deepEqual(state.toasts, ["Done"]);
  assert.deepEqual(state.routes, []);
  assert.ok(texts().includes("Off"), "updated local entity is reflected in render");
});

test("a failed service call on a favourite toasts the failure and does not reload", async () => {
  setup({
    GET_CONFIG: { favorites: ["switch.s"], sensorMode: "none" },
    CALL_SERVICE: new Error("device offline"),
  });
  await open("page/home/index.js");
  state.requests = [];
  await click(clickable("Desk Switch"));
  assert.deepEqual(state.requests.map((r) => r.method), ["CALL_SERVICE"]);
  assert.deepEqual(state.toasts, ["Failed"]);
});

test("tapping a sensor favourite does nothing", async () => {
  setup({ GET_CONFIG: { favorites: ["sensor.t"], sensorMode: "none" } });
  await open("page/home/index.js");
  state.requests = [];
  await click(clickable("Temp"));
  assert.deepEqual(state.requests, []);
  assert.deepEqual(state.routes, []);
  assert.deepEqual(state.toasts, []);
});

test("a failed home load shows the error in danger colour and draws no categories", async () => {
  setup({ GET_CONFIG: new Error("HA unreachable") });
  await open("page/home/index.js");
  expectErrorShown("HA unreachable");
  assert.ok(!texts().includes("Devices"));
});

test("a failed favourites request also shows the error", async () => {
  setup({ GET_CONFIG: { favorites: ["light.a"], sensorMode: "none" }, GET_ENTITIES: new Error("timeout") });
  await open("page/home/index.js");
  expectErrorShown("timeout");
});

test("error values without a message are shown as text", async () => {
  for (const [thrown, shown] of [[new Error(""), "Error"], [null, "null"], ["plain text", "plain text"]]) {
    setup();
    state.respond = async () => {
      throw thrown;
    };
    await open("page/home/index.js");
    assert.ok(texts().includes(shown), `${shown} in ${texts().join("|")}`);
  }
});

test("home onDestroy clears every widget the page drew", async () => {
  setup({ GET_CONFIG: { favorites: ["light.a"], sensorMode: "none" } });
  const page = await open("page/home/index.js");
  assert.ok(state.widgets.length > 0);
  page.onDestroy();
  assert.deepEqual(page.state.widgets, []);
  assert.deepEqual(state.widgets, []);
});

test("home load that finishes after the page was destroyed does not draw", async () => {
  reset();
  state.strings = { ...STRINGS };
  let release;
  respond({
    GET_CONFIG: () => new Promise((r) => (release = r)),
    GET_ENTITIES: ALL,
  });
  const page = await open("page/home/index.js");
  page.onDestroy();
  release({ favorites: [], sensorMode: "none" });
  await flush();
  assert.deepEqual(state.widgets, []);
});

// ---- page/entities -----------------------------------------------------------

test("group page shows only that group's entities under the group heading", async () => {
  setup();
  await open("page/entities/index.js", { group: "devices" });
  const t = texts();
  assert.ok(t.includes("Devices"), t.join("|"));
  assert.ok(t.includes("Lamp") && t.includes("Desk Switch"));
  assert.ok(!t.includes("Temp") && !t.includes("Night Script"));
  assert.deepEqual(state.requests, [{ method: "GET_ENTITIES", params: {} }]);
});

test("group page with nothing in the group shows the empty message", async () => {
  setup({ GET_ENTITIES: [LIGHT] });
  await open("page/entities/index.js", { group: "sensors" });
  assert.ok(texts().includes("No entities"));
  assert.ok(texts().includes("Sensors"));
});

test("page without a group or with an unknown group lists nothing", async () => {
  setup();
  await open("page/entities/index.js", { group: "bogus" });
  assert.ok(texts().includes("No entities"));
  reset();
  respond({ GET_ENTITIES: ALL });
  state.strings = { ...STRINGS };
  await open("page/entities/index.js");
  assert.ok(texts().includes("No entities"), "no params at all");
});

test("title and name route params set the heading, and ids fetch only those entities", async () => {
  setup();
  await open("page/entities/index.js", { ids: ["light.a"], title: "Picked" });
  assert.ok(texts().includes("Picked"));
  assert.ok(texts().includes("Lamp"));
  assert.ok(!texts().includes("Temp"));
  assert.deepEqual(state.requests, [{ method: "GET_ENTITIES", params: { ids: ["light.a"] } }]);

  setup();
  await open("page/entities/index.js", { name: "Kitchen" });
  assert.ok(texts().includes("Kitchen"));
  assert.ok(texts().includes("No entities"), "no group: nothing to list");
});

test("empty ids are answered without asking the phone", async () => {
  setup();
  await open("page/entities/index.js", { ids: [] });
  assert.deepEqual(state.requests, []);
  assert.ok(texts().includes("No entities"));
});

test("area route fetches the area's entities by id", async () => {
  setup({
    GET_AREAS: [
      { area_id: "kitchen", name: "Kitchen", entity_ids: ["light.a"] },
      { area_id: "hall", name: "Hall", entity_ids: [] },
    ],
  });
  await open("page/entities/index.js", { area_id: "kitchen", name: "Kitchen" });
  assert.ok(texts().includes("Kitchen"));
  assert.ok(texts().includes("Lamp"));
  assert.ok(!texts().includes("Desk Switch"));
  assert.deepEqual(state.requests.map((r) => r.method), ["GET_AREAS", "GET_ENTITIES"]);
  assert.deepEqual(state.requests[1].params, { ids: ["light.a"] });
});

test("area route with an empty or unknown area shows the empty message without an entity request", async () => {
  setup({ GET_AREAS: [{ area_id: "hall", name: "Hall", entity_ids: [] }] });
  await open("page/entities/index.js", { area_id: "hall", name: "Hall" });
  assert.ok(texts().includes("No entities"));
  assert.deepEqual(state.requests.map((r) => r.method), ["GET_AREAS"]);

  setup({ GET_AREAS: [] });
  await open("page/entities/index.js", { area_id: "nope", name: "Nope" });
  assert.ok(texts().includes("No entities"));
  assert.deepEqual(state.requests.map((r) => r.method), ["GET_AREAS"]);
});

test("a failed entity list on the entities page shows the error", async () => {
  setup({ GET_ENTITIES: new Error("boom") });
  await open("page/entities/index.js", { group: "devices" });
  expectErrorShown("boom");

  setup({ GET_AREAS: new Error("areas down") });
  await open("page/entities/index.js", { area_id: "kitchen" });
  expectErrorShown("areas down");
});

test("tapping a light opens its page with the entity id", async () => {
  setup();
  await open("page/entities/index.js", { group: "devices" });
  await click(clickable("Lamp"));
  assert.deepEqual(state.routes, [{ type: "push", url: "page/light/index", params: '{"entity_id":"light.a"}' }]);
});

test("tapping a switch runs its service, toasts done and refreshes just that entity", async () => {
  setup({
    CALL_SERVICE: { ok: true },
    GET_ENTITY: ({ entity_id }) => ({ ...SWITCH, entity_id, state: "off" }),
  });
  await open("page/entities/index.js", { group: "devices" });
  assert.ok(texts().includes("On"), "switch starts on");
  state.requests = [];
  await click(clickable("Desk Switch"));
  assert.deepEqual(state.requests.map((r) => r.method), ["CALL_SERVICE", "GET_ENTITY"]);
  assert.deepEqual(state.requests[0].params, { domain: "switch", service: "toggle", entity_id: "switch.s" });
  assert.deepEqual(state.requests[1].params, { entity_id: "switch.s" });
  assert.deepEqual(state.toasts, ["Done"]);
  assert.ok(texts().includes("Off"), "card redrawn with the fresh state");
  assert.ok(!texts().includes("On"));
});

test("a failed service call on the entities page toasts the failure and keeps the list", async () => {
  setup({ CALL_SERVICE: new Error("nope") });
  await open("page/entities/index.js", { group: "devices" });
  state.requests = [];
  await click(clickable("Desk Switch"));
  assert.deepEqual(state.requests.map((r) => r.method), ["CALL_SERVICE"]);
  assert.deepEqual(state.toasts, ["Failed"]);
  assert.ok(texts().includes("Desk Switch"));
});

test("when the service works but the refresh fails the user is not told the action failed", async () => {
  setup({ CALL_SERVICE: { ok: true }, GET_ENTITY: new Error("gone") });
  await open("page/entities/index.js", { group: "devices" });
  await click(clickable("Desk Switch"));
  assert.deepEqual(state.toasts, ["Done"]);
  assert.ok(texts().includes("On"), "card keeps its last known state");
});

test("tapping a sensor on the entities page does nothing", async () => {
  setup();
  await open("page/entities/index.js", { group: "sensors" });
  state.requests = [];
  await click(clickable("Temp"));
  assert.deepEqual(state.requests, []);
  assert.deepEqual(state.routes, []);
});

test("entities page onDestroy clears its widgets", async () => {
  setup();
  const page = await open("page/entities/index.js", { group: "devices" });
  assert.ok(state.widgets.length > 0);
  page.onDestroy();
  assert.deepEqual(page.state.widgets, []);
  assert.deepEqual(state.widgets, []);
});

test("entities page paginates when there are more than 10 entities", async () => {
  const many = Array.from({ length: 15 }, (_, i) => ent(`light.item_${i}`, `Item ${i}`));
  setup({ GET_ENTITIES: many });
  const page = await open("page/entities/index.js", { ids: many.map((e) => e.entity_id), title: "Many" });
  assert.ok(texts().includes("1/2"));
  assert.ok(texts().includes("Item 0"));
  assert.ok(texts().includes("Item 9"));
  assert.ok(!texts().includes("Item 10"));

  await click(clickable("Next"));
  assert.ok(texts().includes("2/2"));
  assert.ok(texts().includes("Item 10"));
  assert.ok(texts().includes("Item 14"));
  assert.ok(!texts().includes("Item 0"));

  await click(clickable("Next"));
  assert.ok(texts().includes("2/2"));

  await click(clickable("Prev"));
  assert.ok(texts().includes("1/2"));
  assert.ok(texts().includes("Item 0"));

  await click(clickable("Prev"));
  assert.ok(texts().includes("1/2"));

  page.onDestroy();
});

test("entities load that finishes after the page was destroyed does not draw", async () => {
  reset();
  state.strings = { ...STRINGS };
  let release;
  respond({ GET_ENTITIES: () => new Promise((r) => (release = r)) });
  const page = await open("page/entities/index.js", { group: "devices" });
  page.onDestroy();
  release(ALL);
  await flush();
  assert.deepEqual(state.widgets, []);
});

// ---- page/areas --------------------------------------------------------------

const AREAS = [
  { area_id: "kitchen", name: "Kitchen", entity_ids: ["light.a", "switch.s"] },
  { area_id: "hall", name: "Hall", entity_ids: [] },
];

test("areas page lists each area with its entity count", async () => {
  setup({ GET_AREAS: AREAS });
  await open("page/areas/index.js");
  const t = texts();
  assert.ok(t.includes("Areas"));
  assert.ok(t.includes("Kitchen") && t.includes("Hall"));
  assert.ok(t.includes("2 entities") && t.includes("0 entities"), t.join("|"));
  assert.deepEqual(state.requests, [{ method: "GET_AREAS", params: {} }]);
});

test("areas page with no areas shows the empty message", async () => {
  setup({ GET_AREAS: [] });
  await open("page/areas/index.js");
  assert.ok(texts().includes("No areas"));
});

test("tapping an area opens the entities page with its id and name", async () => {
  setup({ GET_AREAS: AREAS });
  await open("page/areas/index.js");
  await click(clickable("Kitchen"));
  assert.equal(state.routes.length, 1);
  assert.equal(state.routes[0].url, "page/entities/index");
  assert.deepEqual(JSON.parse(state.routes[0].params), { area_id: "kitchen", name: "Kitchen" });
});

test("a failed areas request shows the error", async () => {
  setup({ GET_AREAS: new Error("areas down") });
  await open("page/areas/index.js");
  expectErrorShown("areas down");
  assert.ok(!texts().includes("Areas"));
});

test("areas onDestroy clears its widgets", async () => {
  setup({ GET_AREAS: AREAS });
  const page = await open("page/areas/index.js");
  page.onDestroy();
  assert.deepEqual(state.widgets, []);
});

test("areas load that finishes after the page was destroyed does not draw", async () => {
  reset();
  state.strings = { ...STRINGS };
  let release;
  respond({ GET_AREAS: () => new Promise((r) => (release = r)) });
  const page = await open("page/areas/index.js");
  page.onDestroy();
  release(AREAS);
  await flush();
  assert.deepEqual(state.widgets, []);
});

// ---- runTap (utils/nav.js) ---------------------------------------------------

// A page stand-in with what runTap uses: request (answered by respond()) and state.alive.
const navPage = () => ({ ...BasePage({}), state: { alive: true } });
const beginNav = () => {
  reset();
  state.strings = { ...STRINGS };
};

test("runTap opens an entity's own page without any request", () => {
  beginNav();
  runTap(navPage(), LIGHT, () => assert.fail("no onDone for a page tap"));
  assert.deepEqual(state.routes, [{ type: "push", url: "page/light/index", params: '{"entity_id":"light.a"}' }]);
  assert.deepEqual(state.requests, []);
});

test("runTap does nothing for an entity without a tap action", () => {
  beginNav();
  runTap(navPage(), SENSOR, () => assert.fail("no onDone without an action"));
  assert.deepEqual(state.routes, []);
  assert.deepEqual(state.requests, []);
  assert.deepEqual(state.toasts, []);
});

test("runTap runs the service, toasts done and hands the refreshed entity to onDone", async () => {
  beginNav();
  respond({ CALL_SERVICE: { ok: true }, GET_ENTITY: { ...SWITCH, state: "off" } });
  let got;
  runTap(navPage(), SWITCH, (en) => (got = en));
  await flush();
  assert.deepEqual(state.requests.map((r) => r.method), ["CALL_SERVICE", "GET_ENTITY"]);
  assert.deepEqual(state.requests[0].params, { domain: "switch", service: "toggle", entity_id: "switch.s" });
  assert.deepEqual(state.requests[1].params, { entity_id: "switch.s" });
  assert.deepEqual(state.toasts, ["Done"]);
  assert.equal(got.state, "off");
});

test("runTap keeps the old entity and still says done when only the refresh fails", async () => {
  beginNav();
  respond({ CALL_SERVICE: { ok: true }, GET_ENTITY: new Error("gone") });
  let got;
  runTap(navPage(), SWITCH, (en) => (got = en));
  await flush();
  assert.deepEqual(state.toasts, ["Done"]);
  assert.equal(got, SWITCH);
});

test("runTap toasts a failed service call once and skips the refresh and onDone", async () => {
  beginNav();
  respond({ CALL_SERVICE: new Error("device offline") });
  let called = false;
  runTap(navPage(), SWITCH, () => (called = true));
  await flush();
  assert.deepEqual(state.requests.map((r) => r.method), ["CALL_SERVICE"]);
  assert.deepEqual(state.toasts, ["Failed"]);
  assert.equal(called, false);
});

test("runTap says nothing and calls nothing once the page is gone", async () => {
  beginNav();
  let release;
  respond({ CALL_SERVICE: () => new Promise((r) => (release = r)), GET_ENTITY: SWITCH });
  const page = navPage();
  let called = false;
  runTap(page, SWITCH, () => (called = true));
  await flush(); // the service call is pending
  page.state.alive = false;
  release({ ok: true });
  await flush();
  assert.deepEqual(state.requests.map((r) => r.method), ["CALL_SERVICE"]);
  assert.deepEqual(state.toasts, []);
  assert.equal(called, false);
});

test("runTap does not call onDone when the page is destroyed during the refresh", async () => {
  beginNav();
  let release;
  respond({ CALL_SERVICE: { ok: true }, GET_ENTITY: () => new Promise((r) => (release = r)) });
  const page = navPage();
  let called = false;
  runTap(page, SWITCH, () => (called = true));
  await flush(); // the refresh is pending
  page.state.alive = false;
  release(SWITCH);
  await flush();
  assert.equal(called, false);
});

// ---- navigation contracts ----------------------------------------------------

test("every domain with a tap or a page belongs to exactly one home group", () => {
  const groups = Object.values(GROUP_DOMAINS).flat();
  assert.equal(new Set(groups).size, groups.length, "no domain in two groups");
  for (const domain of Object.keys(DOMAINS)) {
    if (DOMAINS[domain].label === "sensors") continue;
    assert.ok(groups.includes(domain), `${domain} is reachable from home`);
  }
});

test("area route: toggling device visibility sends SET_ENTITY_VISIBILITY", async () => {
  setup({
    GET_AREAS: [{ area_id: "kitchen", name: "Kitchen", entity_ids: ["light.a"] }],
    GET_ENTITIES: byIds,
    SET_ENTITY_VISIBILITY: { ok: true },
  });
  const page = await open("page/entities/index.js", { area_id: "kitchen", name: "Kitchen" });
  assert.ok(texts().includes("Kitchen"));
  assert.ok(texts().includes("Lamp"));

  const visBtn = findText("👁");
  assert.ok(visBtn, "visibility button shown for area device");
  state.requests = [];
  await click(visBtn);

  const req = state.requests.find((r) => r.method === "SET_ENTITY_VISIBILITY");
  assert.ok(req, "SET_ENTITY_VISIBILITY called");
  assert.deepEqual(req.params, { entity_id: "light.a", visible: false });
  assert.ok(texts().includes("✕"), "visibility button toggled to hidden icon");
  page.onDestroy();
});

test("entities page: crown scroll and lateral swipe navigates pages", async () => {
  const many = Array.from({ length: 15 }, (_, i) => ent(`switch.s${i}`, `Switch ${i}`));
  setup({ GET_ENTITIES: many });
  const page = await open("page/entities/index.js", { group: "devices" });
  assert.ok(texts().includes("1/2"));

  // Crown scroll down: page 2
  emitDigitalCrown(1);
  await flush();
  assert.ok(texts().includes("2/2"));

  // Crown scroll up: page 1
  emitDigitalCrown(-1);
  await flush();
  assert.ok(texts().includes("1/2"));

  // Lateral swipe left: page 2
  const handled = emitGesture(GESTURE_LEFT);
  await flush();
  assert.equal(handled, true);
  assert.ok(texts().includes("2/2"));

  // Lateral swipe right: page 1
  const handledRight = emitGesture(GESTURE_RIGHT);
  await flush();
  assert.equal(handledRight, true);
  assert.ok(texts().includes("1/2"));

  page.onDestroy();
});

test("entities page: lateral swipe between areas switches rooms", async () => {
  setup({
    GET_AREAS: [
      { area_id: "kitchen", name: "Kitchen", entity_ids: ["light.a"] },
      { area_id: "living", name: "Living Room", entity_ids: ["switch.s"] },
    ],
    GET_ENTITIES: byIds,
  });
  const page = await open("page/entities/index.js", { area_id: "kitchen", name: "Kitchen" });
  assert.ok(texts().includes("Kitchen"));
  assert.ok(texts().includes("Lamp"));

  // Swipe left: switches to living room
  emitGesture(GESTURE_LEFT);
  await flush();
  assert.ok(texts().includes("Living Room"));
  assert.ok(texts().includes("Desk Switch"));

  page.onDestroy();
});

test("areas page: crown scroll and lateral swipe navigates areas", async () => {
  const manyAreas = Array.from({ length: 8 }, (_, i) => ({
    area_id: `area_${i}`,
    name: `Area ${i}`,
    entity_ids: [`light.${i}`],
  }));
  setup({ GET_AREAS: manyAreas });
  const page = await open("page/areas/index.js");
  assert.ok(texts().includes("1/2"));
  assert.ok(texts().includes("Area 0"));

  // Crown scroll down
  emitDigitalCrown(1);
  await flush();
  assert.ok(texts().includes("2/2"));
  assert.ok(texts().includes("Area 6"));

  // Lateral swipe right goes back to page 1
  emitGesture(GESTURE_RIGHT);
  await flush();
  assert.ok(texts().includes("1/2"));

  page.onDestroy();
});

