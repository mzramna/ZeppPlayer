// Phone settings page (setting/index.js) driven through fake components, and its pure helpers (setting/logic.js).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { load } from "./helpers/watch.js";
import { installSettings } from "./helpers/phone.js";
import { SETTING } from "../shared/protocol.js";
import * as logic from "../setting/logic.js";

const ERRORS_KEY = "settingsErrors";
const errorsIn = (store) => JSON.parse(store.get(ERRORS_KEY) || "{}");

const RED = "#d32f2f";
const ENTITIES = [
  { key: "light.a", title: "A", value: true },
  { key: "climate.x", title: "X", value: false },
  { key: "foo.bar", title: "Foo", value: true }, // unsupported domain, never listed
  { key: "sensor.s", title: "S", value: false },
];

let store;
let props;
let page;

// Components return plain objects: { type, props, children }.
function installComponents() {
  for (const type of ["View", "Text", "Button", "Toggle", "Section", "TextInput", "Select"]) {
    globalThis[type] = (props = {}, children) => ({ type, props, children });
  }
}

function nodes(tree) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type) out.push(n);
    walk(n.children);
  };
  walk(tree);
  return out;
}

const texts = (tree) => nodes(tree).filter((n) => n.type === "Text" || n.type === "Section").map((n) => n.children);
const ofType = (tree, type) => nodes(tree).filter((n) => n.type === type);
function one(tree, type, label) {
  const found = ofType(tree, type).filter((n) => n.props.label === label);
  assert.equal(found.length, 1, `${type} "${label}" count`);
  return found[0];
}
const toggles = (tree, label) => ofType(tree, "Toggle").filter((n) => n.props.label === label);
const favToggles = (tree) => ofType(tree, "Toggle").filter((n) => n.props.label.startsWith("★"));
const topButtons = (tree) => ofType(tree, "Button").filter((n) => n.props.label === "Top");
const entityList = () => JSON.parse(store.get(SETTING.ENTITY_LIST));
const build = () => page.build(props);

async function open(initial = {}) {
  store = installSettings(initial);
  props = { settingsStorage: globalThis.settings.settingsStorage };
  page = await load("setting/index.js", "settingsPage");
  return build();
}

beforeEach(() => installComponents());

test("connection: URLs and token saved trimmed, so a stray space cannot break requests", async () => {
  let tree = await open();
  one(tree, "TextInput", "IPLocal").props.onChange("  http://ha.local:8123 ");
  one(tree, "TextInput", "IPExternal").props.onChange("https://ha.example.com  ");
  one(tree, "TextInput", "LongToken").props.onChange("  tok  ");
  assert.equal(store.get(SETTING.LOCAL_URL), "http://ha.local:8123");
  assert.equal(store.get(SETTING.EXTERNAL_URL), "https://ha.example.com");
  assert.equal(store.get(SETTING.TOKEN), "tok");
  tree = build();
  assert.equal(one(tree, "TextInput", "IPLocal").props.value, "http://ha.local:8123");
});

test("refresh button writes a timestamp to the refresh key", async () => {
  const tree = await open();
  const before = Date.now();
  one(tree, "Button", "Refresh entities").props.onClick();
  const after = Date.now();
  const stamp = store.get(SETTING.REFRESH_ENTITIES);
  assert.match(stamp, /^\d+$/);
  assert.ok(Number(stamp) >= before && Number(stamp) <= after);
});

test("status message shown under the buttons, red when it failed", async () => {
  let tree = await open({ [SETTING.STATUS]: JSON.stringify({ ok: true, message: "3 entities", time: 1 }) });
  let node = nodes(tree).find((n) => n.children === "3 entities");
  assert.ok(node);
  assert.notEqual(node.props.style.color, RED);

  store.set(SETTING.STATUS, JSON.stringify({ ok: false, message: "HA down", time: 2 }));
  tree = build();
  node = nodes(tree).find((n) => n.children === "HA down");
  assert.equal(node.props.style.color, RED);
});

test("no status message when none was written", async () => {
  const tree = await open();
  assert.equal(texts(tree).filter((t) => t === "HA down" || t === "3 entities").length, 0);
});

test("entity list: supported domains only, search filters by id", async () => {
  let tree = await open({ settingsActiveTab: "entities", entityTypeFilter: "all", [SETTING.ENTITY_LIST]: JSON.stringify(ENTITIES) });
  const labels = ofType(tree, "Toggle").map((n) => n.props.label).filter((l) => !l.startsWith("★") && l !== "Show only favorites");
  assert.deepEqual(labels, ["A (light.a)", "X (climate.x)", "S (sensor.s)"]);

  one(tree, "TextInput", "Filter").props.onChange("climate");
  assert.equal(store.get("filter"), "climate");
  tree = build();
  const filtered = ofType(tree, "Toggle").map((n) => n.props.label).filter((l) => !l.startsWith("★") && l !== "Show only favorites");
  assert.deepEqual(filtered, ["X (climate.x)"]);
});

test("empty list and no-match hints", async () => {
  let tree = await open({ settingsActiveTab: "entities" });
  assert.ok(texts(tree).includes("Tap Refresh entities to load them from Home Assistant."));

  store.set(SETTING.ENTITY_LIST, JSON.stringify(ENTITIES));
  store.set("filter", "nothing-like-this");
  tree = build();
  assert.ok(texts(tree).includes("No entity matches the filter."));
});

test("a corrupt entity list shows as empty", async () => {
  const tree = await open({ settingsActiveTab: "entities", [SETTING.ENTITY_LIST]: "{not json" });
  assert.ok(texts(tree).includes("Tap Refresh entities to load them from Home Assistant."));
});

test("show-on-watch toggle saves the flag", async () => {
  let tree = await open({ settingsActiveTab: "entities", [SETTING.ENTITY_LIST]: JSON.stringify(ENTITIES) });
  toggles(tree, "A (light.a)")[0].props.onChange(false);
  assert.equal(entityList().find((e) => e.key === "light.a").value, false);
  tree = build();
  assert.equal(toggles(tree, "X (climate.x)")[0].props.value, false);
  toggles(tree, "X (climate.x)")[0].props.onChange(true);
  assert.equal(entityList().find((e) => e.key === "climate.x").value, true);
});

test("favorites keep the order they were marked in; unmarking removes", async () => {
  let tree = await open({ settingsActiveTab: "entities", [SETTING.ENTITY_LIST]: JSON.stringify(ENTITIES) });
  const fav = () => JSON.parse(store.get(SETTING.FAVORITES));

  favToggles(tree)[1].props.onChange(true); // climate.x
  tree = build();
  favToggles(tree)[0].props.onChange(true); // light.a
  assert.deepEqual(fav(), ["climate.x", "light.a"]);

  tree = build();
  assert.equal(favToggles(tree)[0].props.value, true);
  favToggles(tree)[0].props.onChange(false); // light.a unmarked
  assert.deepEqual(fav(), ["climate.x"]);
  favToggles(build())[1].props.onChange(true); // climate.x again: already marked, no change
  assert.deepEqual(fav(), ["climate.x"]);
});

test("Top moves the entity to the front and keeps the flags", async () => {
  const tree = await open({ settingsActiveTab: "entities", [SETTING.ENTITY_LIST]: JSON.stringify(ENTITIES) });
  topButtons(tree)[1].props.onClick(); // climate.x
  assert.deepEqual(
    entityList().map((e) => e.key),
    ["climate.x", "light.a", "foo.bar", "sensor.s"]
  );
  assert.equal(entityList()[0].value, false);
});

test("Health data: default mode is off, no sync or URL fields", async () => {
  const tree = await open();
  const mode = one(tree, "Select", "Send health data to");
  assert.equal(mode.props.value, "none");
  assert.deepEqual(
    mode.props.options.map((o) => o.value),
    ["none", "zepp2hass", "mobile_app", "rest"]
  );
  assert.equal(ofType(tree, "Select").filter((s) => s.props.label !== "Theme").length, 1);
  assert.equal(ofType(tree, "TextInput").some((n) => n.props.label === "zepp2hass webhook URL"), false);
});

test("choosing a mode saves it; an interval select appears for any mode but off", async () => {
  let tree = await open();
  one(tree, "Select", "Send health data to").props.onChange("rest");
  assert.equal(store.get(SETTING.SENSOR_MODE), "rest");

  tree = build();
  const interval = one(tree, "Select", "Sync every");
  assert.equal(interval.props.value, "5");
  assert.deepEqual(
    interval.props.options.map((o) => o.value),
    ["1", "5", "10", "15", "30", "60"]
  );
  interval.props.onChange("30");
  assert.equal(store.get(SETTING.SYNC_INTERVAL), "30");
});

test("zepp2hass: URL must start with http:// or https://", async () => {
  await open({ [SETTING.SENSOR_MODE]: "zepp2hass" });
  const url = () => one(build(), "TextInput", "zepp2hass webhook URL");
  const err = "Must start with http:// or https://";

  url().props.onChange("ftp://nope");
  assert.equal(store.get(SETTING.ZEPP2HASS_URL), undefined);
  assert.ok(texts(build()).includes(err));

  url().props.onChange("https://");
  assert.equal(store.get(SETTING.ZEPP2HASS_URL), undefined);

  url().props.onChange("  https://z.example/hook  ");
  assert.equal(store.get(SETTING.ZEPP2HASS_URL), "https://z.example/hook");
  assert.equal(texts(build()).includes(err), false);
});

test("an invalid value is recorded in settingsErrors and the page shows it from that key", async () => {
  await open({ [SETTING.SENSOR_MODE]: "zepp2hass", [SETTING.ZEPP2HASS_URL]: "https://old/hook" });
  one(build(), "TextInput", "zepp2hass webhook URL").props.onChange("nope");
  assert.deepEqual(errorsIn(store), { zepp2hass: "Must start with http:// or https://" });
  assert.equal(store.get(SETTING.ZEPP2HASS_URL), "https://old/hook", "the last valid value stays");

  // A new page instance has no memory of the change: the error comes from storage alone.
  const fresh = await open({ [SETTING.SENSOR_MODE]: "zepp2hass", [ERRORS_KEY]: store.get(ERRORS_KEY) });
  assert.ok(texts(fresh).includes("Must start with http:// or https://"));
});

test("a valid save clears only its own field's error", async () => {
  await open({
    [SETTING.SENSOR_MODE]: "zepp2hass",
    [SETTING.SAA_NOTIFY_SERVICE]: "mobile_app_old",
    [ERRORS_KEY]: JSON.stringify({ zepp2hass: "bad url", saaNotify: "bad name" }),
  });
  one(build(), "TextInput", "zepp2hass webhook URL").props.onChange("https://z.example/hook");
  assert.deepEqual(errorsIn(store), { saaNotify: "bad name" });
  assert.equal(texts(build()).includes("bad name"), true, "other fields keep their error");
});

test("Sleep as Android errors go to settingsErrors and clear when fixed", async () => {
  await open();
  one(build(), "TextInput", "Notify service").props.onChange("Bad Name");
  one(build(), "TextInput", "Status entity").props.onChange("sleep");
  assert.deepEqual(errorsIn(store), {
    saaNotify: "Letters, digits and _ only, e.g. mobile_app_pixel_8",
    saaStatus: "Entity id like sensor.sleep_as_android, or empty",
  });
  one(build(), "TextInput", "Notify service").props.onChange("mobile_app_pixel_8");
  one(build(), "TextInput", "Status entity").props.onChange("sensor.sleep_as_android");
  assert.deepEqual(errorsIn(store), {});
});

test("mobile_app: register button and registration state", async () => {
  let tree = await open({ [SETTING.SENSOR_MODE]: "mobile_app" });
  assert.ok(texts(tree).includes("Not registered yet"));

  const before = Date.now();
  one(tree, "Button", "Register in Home Assistant").props.onClick();
  assert.match(store.get(SETTING.REGISTER_REQUEST), /^\d+$/);
  assert.ok(Number(store.get(SETTING.REGISTER_REQUEST)) >= before);

  store.set(SETTING.MOBILE_APP, JSON.stringify({ device_id: "d", webhook_id: "w" }));
  tree = build();
  assert.ok(texts(tree).includes("Registered in Home Assistant"));
});

test("the status line is shown once, also in mobile_app mode, red when the register failed", async () => {
  const message = "Unexpected response from Home Assistant";
  const tree = await open({
    [SETTING.SENSOR_MODE]: "mobile_app",
    [SETTING.STATUS]: JSON.stringify({ ok: false, message, time: 1 }),
  });
  const lines = nodes(tree).filter((n) => n.children === message);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].props.style.color, RED);
});

test("last sync: none, ok, and failed", async () => {
  let tree = await open({ [SETTING.SENSOR_MODE]: "rest" });
  assert.ok(texts(tree).includes("No sync yet"));

  store.set(SETTING.LAST_SYNC, JSON.stringify({ time: 1700000000000, ok: true }));
  tree = build();
  const ok = texts(tree).find((t) => t.startsWith("Last sync: "));
  assert.ok(ok);
  assert.notEqual(nodes(tree).find((n) => n.children === ok).props.style.color, RED);

  store.set(SETTING.LAST_SYNC, JSON.stringify({ time: 1700000000000, ok: false, error: "HTTP 500" }));
  tree = build();
  const failed = nodes(tree).find((n) => n.children === "Last sync failed: HTTP 500");
  assert.equal(failed.props.style.color, RED);
});

test("Sleep as Android: notify service is normalised, invalid input is not saved", async () => {
  let tree = await open({ [SETTING.SAA_NOTIFY_SERVICE]: "mobile_app_old" });
  const notify = () => one(build(), "TextInput", "Notify service");
  const err = "Letters, digits and _ only, e.g. mobile_app_pixel_8";

  notify().props.onChange("  notify.mobile_app_pixel_8 ");
  assert.equal(store.get(SETTING.SAA_NOTIFY_SERVICE), "mobile_app_pixel_8");

  notify().props.onChange("Bad Name!");
  assert.equal(store.get(SETTING.SAA_NOTIFY_SERVICE), "mobile_app_pixel_8");
  assert.ok(texts(build()).includes(err));

  notify().props.onChange("");
  assert.equal(store.get(SETTING.SAA_NOTIFY_SERVICE), "");
  assert.equal(texts(build()).includes(err), false);
});

test("Sleep as Android: status entity must be an entity id or empty", async () => {
  await open();
  const status = () => one(build(), "TextInput", "Status entity");
  const err = "Entity id like sensor.sleep_as_android, or empty";

  status().props.onChange("sleep");
  assert.equal(store.get(SETTING.SAA_STATUS_ENTITY), undefined);
  assert.ok(texts(build()).includes(err));

  status().props.onChange("sensor.sleep_as_android");
  assert.equal(store.get(SETTING.SAA_STATUS_ENTITY), "sensor.sleep_as_android");
  assert.equal(texts(build()).includes(err), false);

  status().props.onChange("   ");
  assert.equal(store.get(SETTING.SAA_STATUS_ENTITY), "");
});

// ---- setting/logic.js ----

test("isHttpUrl accepts http and https with something after the scheme", () => {
  assert.equal(logic.isHttpUrl("http://a"), true);
  assert.equal(logic.isHttpUrl("https://a.b/c"), true);
  assert.equal(logic.isHttpUrl("https://"), false);
  assert.equal(logic.isHttpUrl("ws://a"), false);
  assert.equal(logic.isHttpUrl(""), false);
});

test("normalizeNotifyService strips notify., trims, clears on empty, rejects bad names", () => {
  assert.equal(logic.normalizeNotifyService(" notify.mobile_app_x "), "mobile_app_x");
  assert.equal(logic.normalizeNotifyService("mobile_app_x"), "mobile_app_x");
  assert.equal(logic.normalizeNotifyService("notify."), "");
  assert.equal(logic.normalizeNotifyService("  "), "");
  assert.equal(logic.normalizeNotifyService("Mobile-App"), null);
  assert.equal(logic.normalizeNotifyService("a.b"), null);
});

test("normalizeStatusEntity accepts entity ids and empty, rejects the rest", () => {
  assert.equal(logic.normalizeStatusEntity(" sensor.x_1 "), "sensor.x_1");
  assert.equal(logic.normalizeStatusEntity(""), "");
  assert.equal(logic.normalizeStatusEntity("sensor"), null);
  assert.equal(logic.normalizeStatusEntity("Sensor.X"), null);
});

test("readEntities keeps only entries with a key, tolerating bad input", () => {
  assert.deepEqual(logic.readEntities(JSON.stringify([null, { key: 1 }, { key: "light.a", title: "A", value: true }])), [
    { key: "light.a", title: "A", value: true },
  ]);
});

test("visibleEntities keeps supported domains containing the text", () => {
  const list = [{ key: "light.a" }, { key: "foo.a" }, { key: "light.b" }, { key: "constructor.x" }];
  assert.deepEqual(logic.visibleEntities(list, undefined).map((e) => e.key), ["light.a", "light.b"]);
  assert.deepEqual(logic.visibleEntities(list, "b").map((e) => e.key), ["light.b"]);
});

test("setEnabled changes one flag and leaves the rest", () => {
  const list = [{ key: "a.a", value: false }, { key: "b.b", value: true }];
  assert.deepEqual(logic.setEnabled(list, "a.a", true), [
    { key: "a.a", value: true },
    { key: "b.b", value: true },
  ]);
  assert.equal(list[0].value, false);
});

test("setFavorite appends new ids, keeps existing order, removes on off", () => {
  assert.deepEqual(logic.setFavorite(["a"], "b", true), ["a", "b"]);
  assert.deepEqual(logic.setFavorite(["a", "b"], "a", true), ["a", "b"]);
  assert.deepEqual(logic.setFavorite(["a", "b"], "a", false), ["b"]);
  assert.deepEqual(logic.setFavorite(["a"], "z", false), ["a"]);
});

test("moveToTop moves one key to the front, unknown or first key changes nothing", () => {
  const list = [{ key: "a" }, { key: "b" }, { key: "c" }];
  assert.deepEqual(logic.moveToTop(list, "c").map((e) => e.key), ["c", "a", "b"]);
  assert.deepEqual(logic.moveToTop(list, "a").map((e) => e.key), ["a", "b", "c"]);
  assert.deepEqual(logic.moveToTop(list, "zzz").map((e) => e.key), ["a", "b", "c"]);
  assert.notEqual(logic.moveToTop(list, "a"), list);
});

test("theme selector updates uiTheme in storage", async () => {
  const tree = await open();
  const theme = one(tree, "Select", "Theme");
  assert.equal(theme.props.value, "dark");
  theme.props.onChange("light");
  assert.equal(store.get("uiTheme"), "light");
  const updated = build();
  assert.equal(one(updated, "Select", "Theme").props.value, "light");
});

test("favorites quick-access section displays hints and manages favorite ordering and removal", async () => {
  let tree = await open({
    settingsActiveTab: "favorites",
    [SETTING.ENTITY_LIST]: JSON.stringify(ENTITIES),
    [SETTING.FAVORITES]: JSON.stringify([]),
  });
  assert.ok(texts(tree).includes("NoFavoritesHint"));
  assert.ok(texts(tree).includes("QuickAccessHint"));

  store.set(SETTING.FAVORITES, JSON.stringify(["climate.x", "light.a"]));
  tree = build();
  assert.ok(!texts(tree).includes("NoFavoritesHint"));
  assert.ok(texts(tree).includes("★ X (climate.x)"));
  assert.ok(texts(tree).includes("★ A (light.a)"));

  const up = ofType(tree, "Button").filter((n) => n.props.label === "↑");
  const down = ofType(tree, "Button").filter((n) => n.props.label === "↓");
  const remove = ofType(tree, "Button").filter((n) => n.props.label === "Remove");
  assert.equal(up.length, 2);
  assert.equal(down.length, 2);
  assert.equal(remove.length, 2);

  // Move climate.x down (step +1)
  down[0].props.onClick();
  assert.deepEqual(JSON.parse(store.get(SETTING.FAVORITES)), ["light.a", "climate.x"]);

  // Move climate.x up (step -1)
  tree = build();
  ofType(tree, "Button").filter((n) => n.props.label === "↑")[1].props.onClick();
  assert.deepEqual(JSON.parse(store.get(SETTING.FAVORITES)), ["climate.x", "light.a"]);

  // Remove climate.x
  tree = build();
  ofType(tree, "Button").filter((n) => n.props.label === "Remove")[0].props.onClick();
  assert.deepEqual(JSON.parse(store.get(SETTING.FAVORITES)), ["light.a"]);
});

test("Show only favorites toggle filters entities and resets entityPage", async () => {
  let tree = await open({
    settingsActiveTab: "entities",
    [SETTING.ENTITY_LIST]: JSON.stringify(ENTITIES),
    [SETTING.FAVORITES]: JSON.stringify(["climate.x"]),
  });
  const favToggle = one(tree, "Toggle", "Show only favorites");
  assert.equal(favToggle.props.value, false);

  favToggle.props.onChange(true);
  assert.equal(store.get("filterFav"), "true");
  assert.equal(store.get("entityPage"), "0");

  tree = build();
  const visible = ofType(tree, "Toggle").map((n) => n.props.label).filter((l) => !l.startsWith("★") && l !== "Show only favorites");
  assert.deepEqual(visible, ["X (climate.x)"]);

  // Turn off
  one(tree, "Toggle", "Show only favorites").props.onChange(false);
  assert.equal(store.get("filterFav"), "false");
});

test("entities pagination in settings page handles page navigation", async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ key: `light.d_${i}`, title: `D ${i}`, value: true }));
  let tree = await open({ settingsActiveTab: "entities", [SETTING.ENTITY_LIST]: JSON.stringify(many) });
  assert.ok(texts(tree).includes("1 / 2 (30)"));

  const nextBtn = ofType(tree, "Button").find((n) => n.props.label === "Next");
  const prevBtn = ofType(tree, "Button").find((n) => n.props.label === "Prev");
  assert.ok(nextBtn && prevBtn);

  // Navigate to page 2
  nextBtn.props.onClick();
  assert.equal(store.get("entityPage"), "1");
  tree = build();
  assert.ok(texts(tree).includes("2 / 2 (30)"));

  // Navigate back to page 1
  ofType(tree, "Button").find((n) => n.props.label === "Prev").props.onClick();
  assert.equal(store.get("entityPage"), "0");
});

test("tab navigation: clicking tab buttons switches active tab in storage", async () => {
  let tree = await open();
  const tabNames = ["Access", "Favorites", "Entities", "Areas", "Energy"];
  for (const name of tabNames) {
    const btn = one(tree, "Button", name);
    assert.ok(btn);
  }

  // Switch to Entities
  one(tree, "Button", "Entities").props.onClick();
  assert.equal(store.get("settingsActiveTab"), "entities");
  tree = build();
  assert.ok(ofType(tree, "TextInput").some((n) => n.props.label === "Filter"));

  // Switch to Areas
  one(tree, "Button", "Areas").props.onClick();
  assert.equal(store.get("settingsActiveTab"), "areas");

  // Switch to Energy
  one(tree, "Button", "Energy").props.onClick();
  assert.equal(store.get("settingsActiveTab"), "energy");
});

test("entities tab filter pills: interactive (default), sensors, all", async () => {
  const entities = [
    { key: "light.lamp", title: "Lamp", value: true },
    { key: "switch.fan", title: "Fan Switch", value: true },
    { key: "sensor.temp", title: "Temperature", value: true },
  ];
  let tree = await open({ settingsActiveTab: "entities", [SETTING.ENTITY_LIST]: JSON.stringify(entities) });

  // Default interactive filter: only light and switch
  let labels = ofType(tree, "Toggle").map((n) => n.props.label).filter((l) => !l.startsWith("★") && l !== "Show only favorites");
  assert.deepEqual(labels, ["Lamp (light.lamp)", "Fan Switch (switch.fan)"]);

  // Switch to Sensors pill
  one(tree, "Button", "Sensors").props.onClick();
  assert.equal(store.get("entityTypeFilter"), "sensors");
  tree = build();
  labels = ofType(tree, "Toggle").map((n) => n.props.label).filter((l) => !l.startsWith("★") && l !== "Show only favorites");
  assert.deepEqual(labels, ["Temperature (sensor.temp)"]);

  // Switch to All pill
  one(tree, "Button", "All").props.onClick();
  assert.equal(store.get("entityTypeFilter"), "all");
  tree = build();
  labels = ofType(tree, "Toggle").map((n) => n.props.label).filter((l) => !l.startsWith("★") && l !== "Show only favorites");
  assert.deepEqual(labels, ["Lamp (light.lamp)", "Fan Switch (switch.fan)", "Temperature (sensor.temp)"]);
});

test("areas tab: grouped by room with device visibility toggle", async () => {
  const entities = [
    { key: "light.living_room", title: "Living Light", value: true, area_id: "living", area_name: "Living Room" },
    { key: "switch.kitchen_fan", title: "Kitchen Fan", value: false, area_id: "kitchen", area_name: "Kitchen" },
  ];
  let tree = await open({ settingsActiveTab: "areas", [SETTING.ENTITY_LIST]: JSON.stringify(entities) });

  const togglesList = ofType(tree, "Toggle");
  assert.equal(togglesList.length, 2);
  assert.equal(togglesList[0].props.label, "Kitchen Fan (switch.kitchen_fan)");
  assert.equal(togglesList[1].props.label, "Living Light (light.living_room)");

  // Toggle visibility in area
  togglesList[0].props.onChange(true);
  const updated = JSON.parse(store.get(SETTING.ENTITY_LIST));
  assert.equal(updated.find((e) => e.key === "switch.kitchen_fan").value, true);
});

test("energy tab: sensors categorized with visibility toggles", async () => {
  const entities = [
    { key: "sensor.main_power", title: "Power", value: true, unit: "W" },
    { key: "sensor.water_meter", title: "Water", value: false, unit: "L" },
    { key: "sensor.gas_consumption", title: "Gas", value: true, unit: "m³" },
  ];
  let tree = await open({ settingsActiveTab: "energy", [SETTING.ENTITY_LIST]: JSON.stringify(entities) });

  const togglesList = ofType(tree, "Toggle");
  assert.equal(togglesList.length, 3);
  togglesList[1].props.onChange(true); // turn on water meter
  const updated = JSON.parse(store.get(SETTING.ENTITY_LIST));
  assert.equal(updated.find((e) => e.key === "sensor.water_meter").value, true);
});

test("moveFavorite moves item up, down, to top, and handles boundary conditions", () => {
  const list = ["a", "b", "c"];
  // step -1 (up)
  assert.deepEqual(logic.moveFavorite(list, "b", -1), ["b", "a", "c"]);
  // step 1 (down)
  assert.deepEqual(logic.moveFavorite(list, "b", 1), ["a", "c", "b"]);
  // step 0 (top)
  assert.deepEqual(logic.moveFavorite(list, "c", 0), ["c", "a", "b"]);
  assert.deepEqual(logic.moveFavorite(list, "a", 0), ["a", "b", "c"]);
  // boundary checks
  assert.deepEqual(logic.moveFavorite(list, "a", -1), ["a", "b", "c"]);
  assert.deepEqual(logic.moveFavorite(list, "c", 1), ["a", "b", "c"]);
  // unknown id
  assert.deepEqual(logic.moveFavorite(list, "x", -1), ["a", "b", "c"]);
  assert.deepEqual(logic.moveFavorite(list, "x", 0), ["a", "b", "c"]);
});

test("paginate slices lists and clamps bounds safely", () => {
  const items = [1, 2, 3, 4, 5];
  assert.deepEqual(logic.paginate(items, 0, 2), { items: [1, 2], page: 0, totalPages: 3, total: 5 });
  assert.deepEqual(logic.paginate(items, 1, 2), { items: [3, 4], page: 1, totalPages: 3, total: 5 });
  assert.deepEqual(logic.paginate(items, 2, 2), { items: [5], page: 2, totalPages: 3, total: 5 });
  // Clamped bounds
  assert.deepEqual(logic.paginate(items, 99, 2), { items: [5], page: 2, totalPages: 3, total: 5 });
  assert.deepEqual(logic.paginate(items, -5, 2), { items: [1, 2], page: 0, totalPages: 3, total: 5 });
  // Empty or non-array
  assert.deepEqual(logic.paginate([], 0, 10), { items: [], page: 0, totalPages: 1, total: 0 });
  assert.deepEqual(logic.paginate(null, 0, 10), { items: [], page: 0, totalPages: 1, total: 0 });
});

