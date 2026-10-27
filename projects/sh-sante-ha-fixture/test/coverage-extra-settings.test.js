// Every handler and branch of setting/index.js in one process: the page is imported once, so V8
// coverage counts it (settings.test.js re-imports it per test and covers the same behaviour).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { installSettings } from "./helpers/phone.js";
import { SETTING } from "../shared/protocol.js";

for (const type of ["View", "Text", "Button", "Toggle", "Section", "TextInput", "Select"]) {
  globalThis[type] = (props = {}, children) => ({ type, props, children });
}

let definition;
before(async () => {
  await import("../setting/index.js");
  definition = globalThis.__zepp.settingsPage;
});
const RED = "#d32f2f";
const ENTITIES = [
  { key: "light.a", title: "A", value: true },
  { key: "climate.x", title: "X", value: false },
];

function open(initial = {}) {
  const store = installSettings(initial);
  const build = () => definition.build({ settingsStorage: globalThis.settings.settingsStorage });
  return { store, build, tree: build() };
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
const ofType = (tree, type) => nodes(tree).filter((n) => n.type === type);
const one = (tree, type, label) => {
  const found = ofType(tree, type).filter((n) => n.props.label === label);
  assert.equal(found.length, 1, `${type} "${label}" count`);
  return found[0];
};
const textNodes = (tree) => nodes(tree).filter((n) => n.type === "Text").map((n) => n.children);

test("access fields are saved trimmed; the refresh button stamps the refresh key", () => {
  const { store, tree } = open();
  one(tree, "TextInput", "IPLocal").props.onChange("http://ha.local:8123 ");
  one(tree, "TextInput", "IPExternal").props.onChange(" https://ha.example.com");
  one(tree, "TextInput", "LongToken").props.onChange("  tok ");
  assert.equal(store.get(SETTING.LOCAL_URL), "http://ha.local:8123");
  assert.equal(store.get(SETTING.EXTERNAL_URL), "https://ha.example.com");
  assert.equal(store.get(SETTING.TOKEN), "tok");
  const before = Date.now();
  one(tree, "Button", "Refresh entities").props.onClick();
  assert.ok(Number(store.get(SETTING.REFRESH_ENTITIES)) >= before);
});

test("status line: nothing, a success hint, a failure in red", () => {
  const { store, build } = open();
  assert.equal(textNodes(build()).includes(""), false);
  store.set(SETTING.STATUS, JSON.stringify({ ok: true, message: "3 entities", time: 1 }));
  assert.equal(nodes(build()).find((n) => n.children === "3 entities").props.style.color, undefined);
  store.set(SETTING.STATUS, JSON.stringify({ ok: false, message: "HA down", time: 2 }));
  assert.equal(nodes(build()).find((n) => n.children === "HA down").props.style.color, RED);
});

test("entities: empty hint, filter with no match, rows with enable, favourite and Top handlers", () => {
  const { store, build } = open({ settingsActiveTab: "entities" });
  assert.ok(textNodes(build()).includes("Tap Refresh entities to load them from Home Assistant."));

  store.set(SETTING.ENTITY_LIST, JSON.stringify(ENTITIES));
  store.set("filter", "nothing");
  let tree = build();
  assert.ok(textNodes(tree).includes("No entity matches the filter."));

  one(tree, "TextInput", "Filter").props.onChange("climate");
  assert.equal(store.get("filter"), "climate");
  assert.equal(store.get("entityPage"), "0");
  tree = build();
  assert.equal(ofType(tree, "Toggle").filter((n) => !n.props.label.startsWith("★") && n.props.label !== "Show only favorites").length, 1);

  store.set("filter", "");
  tree = build();
  const enable = ofType(tree, "Toggle").find((n) => n.props.label === "A (light.a)");
  enable.props.onChange(false);
  assert.equal(JSON.parse(store.get(SETTING.ENTITY_LIST))[0].value, false);

  const fav = ofType(tree, "Toggle").find((n) => n.props.label === "★ Favorite");
  assert.equal(fav.props.value, false);
  fav.props.onChange(true);
  assert.deepEqual(JSON.parse(store.get(SETTING.FAVORITES)), ["light.a"]);
  assert.equal(ofType(build(), "Toggle").find((n) => n.props.label === "★ Favorite").props.value, true);

  ofType(build(), "Button").find((n) => n.props.label === "Top").props.onClick();
  assert.equal(JSON.parse(store.get(SETTING.ENTITY_LIST))[0].key, "light.a");
});

test("theme and favorites quick-access section with up, down, remove, and filter toggle", () => {
  const { store, build } = open({
    [SETTING.ENTITY_LIST]: JSON.stringify(ENTITIES),
    [SETTING.FAVORITES]: JSON.stringify(["climate.x", "light.a"]),
  });

  let tree = build();
  // Theme selector (Access tab)
  const themeSelect = one(tree, "Select", "Theme");
  assert.equal(themeSelect.props.value, "dark");
  themeSelect.props.onChange("light");
  assert.equal(store.get("uiTheme"), "light");

  // Favorite quick access buttons (Favorites tab)
  store.set("settingsActiveTab", "favorites");
  tree = build();
  const upButtons = ofType(tree, "Button").filter((n) => n.props.label === "↑");
  const downButtons = ofType(tree, "Button").filter((n) => n.props.label === "↓");
  const removeButtons = ofType(tree, "Button").filter((n) => n.props.label === "Remove");
  assert.equal(upButtons.length, 2);
  assert.equal(downButtons.length, 2);
  assert.equal(removeButtons.length, 2);

  // Move climate.x down (step +1)
  downButtons[0].props.onClick();
  assert.deepEqual(JSON.parse(store.get(SETTING.FAVORITES)), ["light.a", "climate.x"]);

  // Move climate.x up (step -1)
  tree = build();
  ofType(tree, "Button").filter((n) => n.props.label === "↑")[1].props.onClick();
  assert.deepEqual(JSON.parse(store.get(SETTING.FAVORITES)), ["climate.x", "light.a"]);

  // Remove climate.x
  tree = build();
  ofType(tree, "Button").filter((n) => n.props.label === "Remove")[0].props.onClick();
  assert.deepEqual(JSON.parse(store.get(SETTING.FAVORITES)), ["light.a"]);

  // Show only favorites toggle (Entities tab)
  store.set("settingsActiveTab", "entities");
  tree = build();
  const filterFavToggle = one(tree, "Toggle", "Show only favorites");
  assert.equal(filterFavToggle.props.value, false);
  filterFavToggle.props.onChange(true);
  assert.equal(store.get("filterFav"), "true");
  assert.equal(store.get("entityPage"), "0");

  tree = build();
  const visibleLabels = ofType(tree, "Toggle").map((n) => n.props.label).filter((l) => !l.startsWith("★") && l !== "Show only favorites");
  assert.deepEqual(visibleLabels, ["A (light.a)"]);

  // Toggle filterFav off
  one(tree, "Toggle", "Show only favorites").props.onChange(false);
  assert.equal(store.get("filterFav"), "false");
});

test("pagination controls for entity list when items exceed PAGE_SIZE", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ key: `light.dev_${i}`, title: `Dev ${i}`, value: true }));
  const { store, build } = open({ settingsActiveTab: "entities", [SETTING.ENTITY_LIST]: JSON.stringify(many) });

  let tree = build();
  assert.ok(textNodes(tree).includes("1 / 2 (30)"));
  const nextBtn = ofType(tree, "Button").find((n) => n.props.label === "Next");
  const prevBtn = ofType(tree, "Button").find((n) => n.props.label === "Prev");
  assert.ok(nextBtn && prevBtn);

  // Next page
  nextBtn.props.onClick();
  assert.equal(store.get("entityPage"), "1");

  tree = build();
  assert.ok(textNodes(tree).includes("2 / 2 (30)"));

  // Prev page
  ofType(tree, "Button").find((n) => n.props.label === "Prev").props.onClick();
  assert.equal(store.get("entityPage"), "0");
});

test("health data: mode saves, interval appears for any mode but off, URL needs http(s)", () => {
  const { store, build } = open();
  let tree = build();
  one(tree, "Select", "Send health data to").props.onChange("zepp2hass");
  assert.equal(store.get(SETTING.SENSOR_MODE), "zepp2hass");

  tree = build();
  assert.equal(one(tree, "Select", "Sync every").props.value, "5", "default interval");
  one(tree, "Select", "Sync every").props.onChange("30");
  assert.equal(store.get(SETTING.SYNC_INTERVAL), "30");
  store.set(SETTING.SYNC_INTERVAL, "15");
  assert.equal(one(build(), "Select", "Sync every").props.value, "15");

  const url = () => one(build(), "TextInput", "zepp2hass webhook URL");
  url().props.onChange("ftp://no");
  assert.equal(store.get(SETTING.ZEPP2HASS_URL), undefined);
  assert.ok(textNodes(build()).includes("Must start with http:// or https://"));
  url().props.onChange("https://z.example/hook");
  assert.equal(store.get(SETTING.ZEPP2HASS_URL), "https://z.example/hook");
  assert.equal(textNodes(build()).includes("Must start with http:// or https://"), false, "error cleared");
  assert.equal(store.get("settingsErrors"), "{}");
});

test("health data: mobile_app registers, shows the registration state and the result", () => {
  const { store, build } = open({ [SETTING.SENSOR_MODE]: "mobile_app" });
  let tree = build();
  assert.ok(textNodes(tree).includes("Not registered yet"));
  one(tree, "Button", "Register in Home Assistant").props.onClick();
  assert.match(store.get(SETTING.REGISTER_REQUEST), /^\d+$/);

  store.set(SETTING.MOBILE_APP, JSON.stringify({ device_id: "d" }));
  store.set(SETTING.STATUS, JSON.stringify({ ok: false, message: "no link", time: 1 }));
  tree = build();
  assert.ok(textNodes(tree).includes("Registered in Home Assistant"));
  assert.equal(nodes(tree).find((n) => n.children === "no link").props.style.color, RED);
});

test("health data: rest shows the interval but no URL or registration", () => {
  const { build } = open({ [SETTING.SENSOR_MODE]: "rest" });
  const tree = build();
  assert.ok(one(tree, "Select", "Sync every"));
  assert.equal(ofType(tree, "TextInput").some((n) => n.props.label === "zepp2hass webhook URL"), false);
  assert.equal(ofType(tree, "Button").some((n) => n.props.label === "Register in Home Assistant"), false);
});

test("last sync: none, ok, failed with and without an error text", () => {
  const { store, build } = open({ [SETTING.SENSOR_MODE]: "rest" });
  assert.ok(textNodes(build()).includes("No sync yet"));

  store.set(SETTING.LAST_SYNC, JSON.stringify({ time: 1700000000000, ok: true }));
  let tree = build();
  const ok = nodes(tree).find((n) => String(n.children).startsWith("Last sync: "));
  assert.equal(ok.children, `Last sync: ${new Date(1700000000000).toLocaleString()}`);
  assert.equal(ok.props.style.color, undefined);

  store.set(SETTING.LAST_SYNC, JSON.stringify({ time: 1, ok: false, error: "HTTP 500" }));
  tree = build();
  assert.equal(nodes(tree).find((n) => n.children === "Last sync failed: HTTP 500").props.style.color, RED);

  store.set(SETTING.LAST_SYNC, JSON.stringify({ time: 1, ok: false }));
  assert.ok(textNodes(build()).includes("Last sync failed: "));
});

test("Sleep as Android: notify service and status entity save when valid, error shows when not", () => {
  const { store, build } = open();
  const notify = () => one(build(), "TextInput", "Notify service");
  const status = () => one(build(), "TextInput", "Status entity");
  const notifyErr = "Letters, digits and _ only, e.g. mobile_app_pixel_8";
  const statusErr = "Entity id like sensor.sleep_as_android, or empty";

  notify().props.onChange("Bad Name");
  assert.equal(store.get(SETTING.SAA_NOTIFY_SERVICE), undefined);
  assert.ok(textNodes(build()).includes(notifyErr));
  notify().props.onChange("notify.mobile_app_pixel_8");
  assert.equal(store.get(SETTING.SAA_NOTIFY_SERVICE), "mobile_app_pixel_8");
  assert.equal(textNodes(build()).includes(notifyErr), false);

  status().props.onChange("sleep");
  assert.equal(store.get(SETTING.SAA_STATUS_ENTITY), undefined);
  assert.ok(textNodes(build()).includes(statusErr));
  status().props.onChange("sensor.sleep_as_android");
  assert.equal(store.get(SETTING.SAA_STATUS_ENTITY), "sensor.sleep_as_android");
  assert.equal(textNodes(build()).includes(statusErr), false);
  status().props.onChange("");
  assert.equal(store.get(SETTING.SAA_STATUS_ENTITY), "");
});
