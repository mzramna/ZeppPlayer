import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { state, reset, respond, texts, findText, click, flush, sleep } from "./helpers/watch.js";
import { COLOR, CX, DOMAINS, hsvToHex } from "../utils/theme.js";
import { emitGesture, emitDigitalCrown, GESTURE_LEFT, GESTURE_RIGHT } from "./mocks/zos/interaction.js";

// Each page module is imported once per file (so coverage counts it). A test opens a shallow copy
// of the definition with a fresh state, and every page a test opens is destroyed afterwards,
// so its timers never leak into the next test.
const definitions = new Map();
const opened = [];
async function openPage(path, params) {
  if (!definitions.has(path)) {
    await import(new URL(`../${path}`, import.meta.url).href);
    definitions.set(path, globalThis.__zepp.page);
  }
  const pristine = definitions.get(path);
  const page = { ...pristine, state: structuredClone(pristine.state || {}) };
  page.onInit?.(params === undefined ? undefined : JSON.stringify(params));
  page.build?.();
  await flush();
  opened.push(page);
  return page;
}
afterEach(() => {
  for (const page of opened.splice(0)) page.onDestroy?.();
});

const MINUS = "−";
const button = (text) => {
  const w = state.widgets.find((x) => x.type === "BUTTON" && x.props.text === text);
  if (!w) throw new Error(`no button "${text}"`);
  return w;
};
// Transport/power buttons only; the volume or brightness ring's +/- are not listed.
const buttons = () =>
  state.widgets.filter((w) => w.type === "BUTTON" && w.props.text !== "+" && w.props.text !== MINUS).map((w) => w.props.text);
const sent = (method) => state.requests.filter((r) => r.method === method);
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};

// ---------- light ----------

const LIGHT_ID = "light.kitchen";
const LIGHT = {
  entity_id: LIGHT_ID, name: "Kitchen", state: "on",
  attributes: { brightness_pct: 50, supported_color_modes: ["brightness"], effect: "rainbow", effect_list: ["rainbow", "pulse", "candle"] },
};
const lightPage = (entity = LIGHT, extra = {}) => {
  respond({ GET_ENTITY: entity, CALL_SERVICE: { ok: true }, ...extra });
  return openPage("page/light/index.js", { entity_id: LIGHT_ID });
};

test("light: a failed entity load shows the error and no controls", async () => {
  reset();
  respond({ GET_ENTITY: new Error("offline") });
  await openPage("page/light/index.js", { entity_id: LIGHT_ID });
  assert.deepEqual(texts(), ["Error: offline"]);
  assert.deepEqual(buttons(), []);
});

test("light: typical attributes draw title, power, effect and brightness ring", async () => {
  reset();
  await lightPage();
  assert.ok(findText("Kitchen"));
  assert.equal(button("on").props.normal_color, DOMAINS.light.color);
  assert.equal(button("on").props.x, CX - 170);
  assert.equal(button("rainbow").props.x, CX + 10);
  assert.ok(findText("50%"));
});

test("light: power button sends light.toggle as CALL_SERVICE", async () => {
  reset();
  await lightPage();
  await click(button("on"));
  assert.deepEqual(sent("CALL_SERVICE").map((r) => r.params), [
    { domain: "light", service: "toggle", entity_id: LIGHT_ID, data: {} },
  ]);
});

test("light: tapping the effect button opens the effect picker for this light", async () => {
  reset();
  await lightPage();
  await click(button("rainbow"));
  assert.deepEqual(state.routes, [{ type: "push", url: "page/light/effect", params: JSON.stringify({ entity_id: LIGHT_ID }) }]);
});

test("light: an off light has a grey power button, centred, and no effect or ring", async () => {
  reset();
  await lightPage({ ...LIGHT, state: "off", attributes: { supported_color_modes: ["onoff"] } });
  assert.equal(button("off").props.normal_color, COLOR.card);
  assert.equal(button("off").props.x, CX - 80);
  assert.deepEqual(buttons(), ["off"]);
});

test("light: brightness ring sends one change after the debounce, none before", async () => {
  reset();
  await lightPage();
  await click(button("+"));
  await click(button("+"));
  await click(button(MINUS));
  await sleep(300);
  assert.equal(sent("CALL_SERVICE").length, 0, "nothing before the debounce");
  await sleep(500);
  assert.equal(sent("CALL_SERVICE").length, 1, "one send for the final value");
});

test("light: brightness ring sends the final brightness_pct in CALL_SERVICE turn_on", async () => {
  reset();
  await lightPage();
  await click(button("+"));
  await click(button("+"));
  await click(button(MINUS));
  await sleep(800);
  assert.deepEqual(sent("CALL_SERVICE").map((r) => r.params), [
    { domain: "light", service: "turn_on", entity_id: LIGHT_ID, data: { brightness_pct: 60 } },
  ]);
});

test("light: an entity reload does not redraw the brightness ring while it is being turned", async () => {
  reset();
  const page = await lightPage();
  await click(button("+"));
  assert.ok(findText("60%"));
  page.load();
  await flush();
  assert.ok(findText("60%"), "the ring keeps the value the user is setting");
  assert.equal(findText("50%"), undefined);
  await sleep(700);
  assert.equal(sent("CALL_SERVICE").length, 1);
});

test("light: destroying the page sends a pending brightness change", async () => {
  reset();
  const page = await lightPage();
  await click(button("+"));
  page.onDestroy();
  await sleep(700);
  // A change still waiting when the page closes is sent, not lost.
  assert.equal(sent("CALL_SERVICE").length, 1);
});

test("light: onResume reloads the entity once it has been loaded", async () => {
  reset();
  const page = await lightPage();
  const before = sent("GET_ENTITY").length;
  page.onResume();
  await flush();
  assert.equal(sent("GET_ENTITY").length, before + 1);
});

test("light: onResume retries the entity after a failed first load", async () => {
  reset();
  respond({ GET_ENTITY: new Error("offline") });
  const page = await openPage("page/light/index.js", { entity_id: LIGHT_ID });
  page.onResume();
  await flush();
  assert.equal(sent("GET_ENTITY").length, 2);
});

test("light: a successful command reloads the entity 1 s later", async () => {
  reset();
  await lightPage();
  await click(button("on"));
  await sleep(1100);
  assert.equal(sent("GET_ENTITY").length, 2);
});

test("light: a failed command shows the error toast", async () => {
  reset();
  await lightPage(LIGHT, { CALL_SERVICE: new Error("boom") });
  await click(button("on"));
  assert.deepEqual(state.toasts, ["Error: boom"]);
});

test("light: an entity reply that arrives after onDestroy draws nothing", async () => {
  reset();
  const reply = deferred();
  respond({ GET_ENTITY: () => reply.promise });
  const page = await openPage("page/light/index.js", { entity_id: LIGHT_ID });
  page.onDestroy();
  reply.resolve(LIGHT);
  await flush();
  assert.equal(findText("Kitchen"), undefined);
});

// ---------- light effect picker ----------

const EFFECTS = {
  entity_id: LIGHT_ID, name: "Kitchen", state: "on",
  attributes: { effect: "pulse", effect_list: ["rainbow", "pulse", "candle"] },
};
const effectPage = (entity = EFFECTS, extra = {}) => {
  respond({ GET_ENTITY: entity, CALL_SERVICE: { ok: true }, ...extra });
  return openPage("page/light/effect.js", { entity_id: LIGHT_ID });
};

test("effect picker: one row per effect with the current one highlighted", async () => {
  reset();
  await effectPage();
  assert.ok(findText("effect"));
  const cards = state.widgets.filter((w) => w.type === "FILL_RECT");
  assert.deepEqual(cards.map((w) => w.props.color), [COLOR.card, DOMAINS.light.color, COLOR.card]);
  assert.deepEqual(cards.map((w) => w.props.y), [84, 158, 232]);
  assert.equal(findText("pulse").props.color, COLOR.bg);
  assert.equal(findText("rainbow").props.color, COLOR.text);
});

test("effect picker: tapping a label applies the effect, toasts and goes back", async () => {
  reset();
  await effectPage();
  await click(findText("candle"));
  assert.deepEqual(sent("CALL_SERVICE").map((r) => r.params), [
    { domain: "light", service: "turn_on", entity_id: LIGHT_ID, data: { effect: "candle" } },
  ]);
  assert.deepEqual(state.toasts, ["done"]);
  assert.deepEqual(state.routes, [{ type: "back" }]);
});

test("effect picker: tapping the row background also applies the effect", async () => {
  reset();
  await effectPage();
  await click(state.widgets.find((w) => w.type === "FILL_RECT" && w.props.y === 84));
  assert.equal(sent("CALL_SERVICE")[0].params.data.effect, "rainbow");
  assert.deepEqual(state.routes, [{ type: "back" }]);
});

test("effect picker: a failed apply shows the error and stays on the list", async () => {
  reset();
  await effectPage(EFFECTS, { CALL_SERVICE: new Error("nope") });
  await click(findText("candle"));
  assert.deepEqual(state.toasts, ["Error: nope"]);
  assert.deepEqual(state.routes, []);
});

test("effect picker: a failed load shows the error", async () => {
  reset();
  await effectPage(new Error("offline"));
  assert.deepEqual(texts(), ["Error: offline"]);
});

test("effect picker: an entity without effects draws only the title", async () => {
  reset();
  await effectPage({ ...EFFECTS, attributes: {} });
  assert.deepEqual(texts(), ["effect"]);
});

test("effect picker: draws at most 40 effects", async () => {
  reset();
  const many = Array.from({ length: 45 }, (_, i) => `fx${i}`);
  await effectPage({ ...EFFECTS, attributes: { effect_list: many } });
  assert.equal(state.widgets.filter((w) => w.type === "FILL_RECT").length, 40);
  assert.ok(findText("fx39"));
  assert.equal(findText("fx40"), undefined);
});

// ---------- media player ----------

const MEDIA_ID = "media_player.tv";
// PAUSE | VOLUME_SET | PREVIOUS_TRACK | NEXT_TRACK | TURN_ON | TURN_OFF
const ALL_FEATURES = 1 | 4 | 16 | 32 | 128 | 256;
const PLAYER = {
  entity_id: MEDIA_ID, name: "Living TV", state: "playing",
  attributes: { media_title: "Song", media_artist: "Artist", volume_level: 0.4, supported_features: ALL_FEATURES },
};
const playerPage = (entity = PLAYER, extra = {}) => {
  respond({ GET_ENTITY: entity, CALL_SERVICE: { ok: true }, ...extra });
  return openPage("page/media_player/index.js", { entity_id: MEDIA_ID });
};
const withFeatures = (supported_features, state = "playing") => ({
  ...PLAYER, state, attributes: { ...PLAYER.attributes, supported_features },
});

test("media: a failed entity load shows the error", async () => {
  reset();
  respond({ GET_ENTITY: new Error("offline") });
  await openPage("page/media_player/index.js", { entity_id: MEDIA_ID });
  assert.deepEqual(texts(), ["Error: offline"]);
});

test("media: typical attributes draw title, track, transport buttons and volume ring", async () => {
  reset();
  await playerPage();
  assert.ok(findText("Living TV"));
  assert.ok(findText("Song"));
  assert.ok(findText("Artist"));
  assert.deepEqual(buttons(), ["prev", "pause", "next", "power"]);
  assert.equal(button("prev").props.x, 28);
  assert.equal(button("power").props.x, 352);
  assert.ok(findText("40%"));
});

test("media: the play/pause label follows the state", async () => {
  reset();
  await playerPage(withFeatures(1, "paused"));
  assert.deepEqual(buttons(), ["play"]);
  assert.equal(button("play").props.x, 190, "a single button is centred");
  assert.equal(findText("%"), undefined, "no volume ring without VOLUME_SET");
});

test("media: each button needs its supported_features bit", async () => {
  const cases = [
    [16 | 32, ["prev", "next"]],
    [1, ["play"]],
    [128, []],
    [128 | 256, ["power"]],
    [4, []],
  ];
  for (const [features, expected] of cases) {
    reset();
    await playerPage(withFeatures(features, "paused"));
    assert.deepEqual(buttons(), expected, `supported_features ${features}`);
  }
});

test("media: no volume ring without the VOLUME_SET bit or a numeric level", async () => {
  reset();
  await playerPage(withFeatures(ALL_FEATURES & ~4));
  assert.equal(findText("%"), undefined);
  reset();
  await playerPage({ ...PLAYER, attributes: { ...PLAYER.attributes, volume_level: undefined } });
  assert.equal(findText("%"), undefined);
});

test("media: transport and power buttons send their media_player services as CALL_SERVICE", async () => {
  reset();
  await playerPage();
  await click(button("prev"));
  await click(button("pause"));
  await click(button("next"));
  await click(button("power"));
  assert.deepEqual(sent("CALL_SERVICE").map((r) => r.params), [
    { domain: "media_player", service: "media_previous_track", entity_id: MEDIA_ID, data: {} },
    { domain: "media_player", service: "media_play_pause", entity_id: MEDIA_ID, data: {} },
    { domain: "media_player", service: "media_next_track", entity_id: MEDIA_ID, data: {} },
    { domain: "media_player", service: "toggle", entity_id: MEDIA_ID, data: {} },
  ]);
});

test("media: volume ring sends one change after the debounce, none before", async () => {
  reset();
  await playerPage();
  await click(button("+"));
  await click(button("+"));
  await sleep(300);
  assert.equal(sent("CALL_SERVICE").length, 0, "nothing before the debounce");
  await sleep(500);
  assert.equal(sent("CALL_SERVICE").length, 1, "one send for the final level");
});

test("media: volume ring sends volume_set with the final level in CALL_SERVICE", async () => {
  reset();
  await playerPage();
  await click(button("+"));
  await click(button("+"));
  await sleep(800);
  assert.deepEqual(sent("CALL_SERVICE").map((r) => r.params), [
    { domain: "media_player", service: "volume_set", entity_id: MEDIA_ID, data: { volume_level: 0.6 } },
  ]);
});

test("media: an entity reload does not redraw the volume ring while it is being turned", async () => {
  reset();
  const page = await playerPage();
  await click(button("+"));
  assert.ok(findText("50%"));
  page.load();
  await flush();
  assert.ok(findText("50%"), "the ring keeps the value the user is setting");
  await sleep(700);
  assert.equal(sent("CALL_SERVICE").length, 1);
});

test("media: polls the entity every 10 s and stops polling on destroy", async (t) => {
  reset();
  respond({ GET_ENTITY: PLAYER });
  t.mock.timers.enable({ apis: ["setInterval"] });
  const page = await openPage("page/media_player/index.js", { entity_id: MEDIA_ID });
  assert.equal(sent("GET_ENTITY").length, 1);
  t.mock.timers.tick(10000);
  await flush();
  assert.equal(sent("GET_ENTITY").length, 2);
  t.mock.timers.tick(10000);
  await flush();
  assert.equal(sent("GET_ENTITY").length, 3);
  page.onDestroy();
  t.mock.timers.tick(30000);
  await flush();
  assert.equal(sent("GET_ENTITY").length, 3);
});

test("media: destroying the page sends a pending volume change", async () => {
  reset();
  const page = await playerPage();
  await click(button("+"));
  page.onDestroy();
  await sleep(700);
  // A change still waiting when the page closes is sent, not lost.
  assert.equal(sent("CALL_SERVICE").length, 1);
});

test("media: a successful command reloads the entity 1 s later", async () => {
  reset();
  await playerPage();
  await click(button("next"));
  await sleep(1100);
  assert.equal(sent("GET_ENTITY").length, 2);
});

test("media: a failed command shows the error toast", async () => {
  reset();
  await playerPage(PLAYER, { CALL_SERVICE: new Error("nope") });
  await click(button("prev"));
  assert.deepEqual(state.toasts, ["Error: nope"]);
});

test("media: an entity reply that arrives after onDestroy draws nothing", async () => {
  reset();
  const reply = deferred();
  respond({ GET_ENTITY: () => reply.promise });
  const page = await openPage("page/media_player/index.js", { entity_id: MEDIA_ID });
  page.onDestroy();
  reply.resolve(PLAYER);
  await flush();
  assert.equal(findText("Living TV"), undefined);
});

// ---------- defaults for missing attributes ----------

test("light: no active effect shows the effect label, and no colour modes means no ring", async () => {
  reset();
  await lightPage({ ...LIGHT, attributes: { effect_list: ["rainbow"] } });
  assert.ok(button("effect"));
  assert.equal(findText("%"), undefined);
});

test("light: a missing brightness reads as 0%", async () => {
  reset();
  await lightPage({ ...LIGHT, attributes: { supported_color_modes: ["brightness"] } });
  assert.ok(findText("0%"));
});

test("media: missing track info and feature bits draw empty lines and no buttons", async () => {
  reset();
  await playerPage({ ...PLAYER, attributes: {} });
  assert.deepEqual(buttons(), []);
  assert.equal(texts().filter((t) => t === "").length, 2, "empty title and artist lines");
  assert.equal(findText("%"), undefined);
});

// ---------- multi-mode light controls ----------

const FULL_LIGHT = {
  entity_id: LIGHT_ID,
  name: "Living Lamp",
  state: "on",
  attributes: {
    brightness_pct: 50,
    color_temp_kelvin: 3000,
    min_color_temp_kelvin: 2000,
    max_color_temp_kelvin: 6500,
    hs_color: [120, 100],
    supported_color_modes: ["color_temp", "hs"],
  },
};

test("light: 3-mode lateral swipe cycles Brightness -> Color Temp -> Color -> Brightness", async () => {
  reset();
  const page = await lightPage(FULL_LIGHT);
  // Mode 1: Brightness
  assert.ok(findText("Potência (1/3)"));
  assert.ok(findText("50%"));

  // Lateral swipe left: advances to Mode 2: Color Temp
  emitGesture(GESTURE_LEFT);
  await flush();
  assert.ok(findText("Tonalidade (2/3)"));
  assert.ok(findText("3000K"));

  // Lateral swipe left: advances to Mode 3: Color
  emitGesture(GESTURE_LEFT);
  await flush();
  assert.ok(findText("Coloração (3/3)"));
  assert.ok(findText("120°"));

  // Lateral swipe left: wraps around to Mode 1: Brightness
  emitGesture(GESTURE_LEFT);
  await flush();
  assert.ok(findText("Potência (1/3)"));

  // Lateral swipe right from Brightness mode (modeIndex 0) returns false for native back
  assert.equal(emitGesture(GESTURE_RIGHT), false);

  // Swipe to Mode 2, then swipe right goes back to Mode 1
  emitGesture(GESTURE_LEFT);
  await flush();
  assert.ok(findText("Tonalidade (2/3)"));
  assert.equal(emitGesture(GESTURE_RIGHT), true);
  await flush();
  assert.ok(findText("Potência (1/3)"));

  page.onDestroy();
});

test("light: color_temp mode sends color_temp_kelvin in turn_on with 250K steps", async () => {
  reset();
  const page = await lightPage(FULL_LIGHT);
  emitGesture(GESTURE_LEFT); // Go to color_temp mode
  await flush();
  assert.ok(findText("3000K"));

  // Press + button to jump by step
  await click(button("+"));
  assert.ok(findText("3250K"));
  await sleep(800);

  const calls = sent("CALL_SERVICE");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, {
    domain: "light",
    service: "turn_on",
    entity_id: LIGHT_ID,
    data: { color_temp_kelvin: 3250 },
  });
  page.onDestroy();
});

test("light: color mode sends hs_color and updates arc color dynamically from hue", async () => {
  reset();
  const page = await lightPage(FULL_LIGHT);
  emitGesture(GESTURE_LEFT); // color_temp
  emitGesture(GESTURE_LEFT); // color
  await flush();
  assert.ok(findText("Coloração (3/3)"));
  assert.ok(findText("120°"));

  // Initial arc color corresponds to hue 120 (Green)
  const fg = state.widgets.find((w) => w.type === "ARC" && w.props.end_angle !== 45);
  assert.ok(fg);
  assert.equal(fg.props.color, hsvToHex(120, 100, 100));

  // Press + button: hue jumps from 120 to 150
  await click(button("+"));
  assert.ok(findText("150°"));
  await sleep(800);

  const calls = sent("CALL_SERVICE");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, {
    domain: "light",
    service: "turn_on",
    entity_id: LIGHT_ID,
    data: { hs_color: [150, 100] },
  });
  assert.equal(fg.props.color, hsvToHex(150, 100, 100));

  page.onDestroy();
});

test("light: tapping outside advances to the next mode in queue", async () => {
  reset();
  const page = await lightPage(FULL_LIGHT);
  assert.ok(findText("Potência (1/3)"));

  // The outside widget is a full-screen FILL_RECT
  const outside = state.widgets.find((w) => w.type === "FILL_RECT" && w.props.w === 480);
  assert.ok(outside);
  await click(outside);
  assert.ok(findText("Tonalidade (2/3)"), "outside click switched to next mode");

  page.onDestroy();
});

test("light: center click toggles light", async () => {
  reset();
  const page = await lightPage(FULL_LIGHT);
  const label = findText("50%");
  assert.ok(label);
  await click(label);
  const calls = sent("CALL_SERVICE");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, {
    domain: "light",
    service: "toggle",
    entity_id: LIGHT_ID,
    data: {},
  });
  page.onDestroy();
});

test("light: crown scroll adjusts active mode value", async () => {
  reset();
  const page = await lightPage(FULL_LIGHT);
  assert.ok(findText("50%"));

  emitDigitalCrown(1);
  await flush();
  assert.ok(findText("60%"));

  page.onDestroy();
});

