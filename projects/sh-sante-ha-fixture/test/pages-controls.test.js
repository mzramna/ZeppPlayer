import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { state, reset, respond, texts, findText, click, flush, sleep } from "./helpers/watch.js";
import { COLOR, DOMAINS } from "../utils/theme.js";

// Each page module is imported once per file (so coverage counts it). A test opens a shallow copy
// of the definition with a fresh state, and every page a test opens is destroyed afterwards.
const definitions = new Map();
const opened = [];
async function openPage(path, params) {
  if (!definitions.has(path)) {
    await import(new URL(`../${path}`, import.meta.url).href);
    definitions.set(path, globalThis.__zepp.page);
  }
  const pristine = definitions.get(path);
  const page = { ...pristine, state: structuredClone(pristine.state || {}) };
  page.onInit(JSON.stringify(params));
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
// Option buttons only; a ring's +/- are not listed.
const buttons = () =>
  state.widgets.filter((w) => w.type === "BUTTON" && w.props.text !== "+" && w.props.text !== MINUS).map((w) => w.props.text);
// Plain text widgets only (a button can carry the same label as a status line).
const label = (text) => state.widgets.find((w) => w.type === "TEXT" && w.props.text === text);
const sent = (method) => state.requests.filter((r) => r.method === method);
const params = (method) => sent(method).map((r) => r.params);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
// Presses a button synchronously (for tests that run under mock timers, where flush() would hang).
const press = (w) => w.props.click_func(w);

// ---------- climate ----------

const CLIMATE_ID = "climate.hall";
const CLIMATE = {
  entity_id: CLIMATE_ID, name: "Hall", state: "heat",
  attributes: { hvac_modes: ["off", "heat", "cool", "auto", "dry"], temperature: 21, current_temperature: 19.5, min_temp: 7, max_temp: 30, target_temp_step: 0.5 },
};
const climatePage = (entity = CLIMATE, extra = {}) => {
  respond({ GET_ENTITY: entity, CALL_SERVICE: { ok: true }, ...extra });
  return openPage("page/climate/index.js", { entity_id: CLIMATE_ID });
};

test("climate: a failed load shows the error in the danger colour", async () => {
  reset();
  await climatePage(CLIMATE, { GET_ENTITY: new Error("offline") });
  assert.equal(findText("Error: offline").props.color, COLOR.danger);
  assert.deepEqual(buttons(), []);
});

test("climate: typical attributes draw four coloured modes, the target and current temperature", async () => {
  reset();
  await climatePage();
  assert.ok(findText("Hall"));
  assert.deepEqual(buttons(), ["state_off", "state_heat", "state_cool", "state_auto"]);
  assert.equal(button("state_heat").props.normal_color, DOMAINS.climate.color);
  assert.equal(button("state_off").props.normal_color, COLOR.card);
  assert.equal(button("state_off").props.x, 84);
  assert.equal(button("state_auto").props.x, 324);
  assert.ok(label("21°"));
  assert.ok(label("current 19.5°"));
});

test("climate: the current mode stays visible when it is not among the first four", async () => {
  reset();
  await climatePage({ ...CLIMATE, state: "dry" });
  assert.deepEqual(buttons(), ["state_off", "state_heat", "state_cool", "state_dry"]);
  assert.equal(button("state_dry").props.normal_color, DOMAINS.climate.color);
});

test("climate: a mode button sends set_hvac_mode, toasts done and reloads", async () => {
  reset();
  await climatePage();
  await click(button("state_cool"));
  assert.deepEqual(params("CALL_SERVICE"), [
    { domain: "climate", service: "set_hvac_mode", entity_id: CLIMATE_ID, data: { hvac_mode: "cool" } },
  ]);
  assert.deepEqual(state.toasts, ["done"]);
  await sleep(1100);
  assert.equal(sent("GET_ENTITY").length, 2);
});

test("climate: a failed mode change toasts the error", async () => {
  reset();
  await climatePage(CLIMATE, { CALL_SERVICE: new Error("busy") });
  await click(button("state_cool"));
  assert.deepEqual(state.toasts, ["Error: busy"]);
});

test("climate: the temperature ring sends one set_temperature after the debounce", async () => {
  reset();
  await climatePage();
  await click(button("+"));
  await click(button("+"));
  assert.equal(label("22°") !== undefined, true, "the ring shows the value being set");
  await sleep(300);
  assert.equal(sent("CALL_SERVICE").length, 0, "nothing before the debounce");
  await sleep(500);
  assert.deepEqual(params("CALL_SERVICE"), [
    { domain: "climate", service: "set_temperature", entity_id: CLIMATE_ID, data: { temperature: 22 } },
  ]);
  await sleep(1100);
});

test("climate: the temperature ring clamps to the HA max", async () => {
  reset();
  await climatePage({ ...CLIMATE, attributes: { ...CLIMATE.attributes, temperature: 29.8 } });
  await click(button("+"));
  assert.ok(label("30°"));
  await sleep(700);
  assert.equal(params("CALL_SERVICE")[0].data.temperature, 30);
  await sleep(1100);
});

test("climate: without HA's range the ring uses 7-35 and clamps to 7", async () => {
  reset();
  await climatePage({ ...CLIMATE, attributes: { temperature: 7.2 } });
  await click(button(MINUS));
  assert.ok(label("7°"));
  await sleep(700);
  assert.equal(params("CALL_SERVICE")[0].data.temperature, 7);
  await sleep(1100);
});

test("climate: no ring or current line when HA omits the temperatures", async () => {
  reset();
  await climatePage({ ...CLIMATE, attributes: { hvac_modes: ["off", "heat"] } });
  assert.deepEqual(buttons(), ["state_off", "state_heat"]);
  assert.equal(findText("°"), undefined);
});

test("climate: destroying the page sends a pending temperature change", async () => {
  reset();
  const page = await climatePage();
  await click(button("+"));
  page.onDestroy();
  await sleep(700);
  // A change still waiting when the page closes is sent, not lost.
  assert.equal(sent("CALL_SERVICE").length, 1);
});

test("climate: destroying the page during a mode change stops the reload", async () => {
  reset();
  const page = await climatePage();
  await click(button("state_cool"));
  page.onDestroy();
  await sleep(1100);
  assert.equal(sent("GET_ENTITY").length, 1);
});

test("climate: an entity reply that arrives after onDestroy is not drawn", async () => {
  reset();
  const reply = deferred();
  respond({ GET_ENTITY: () => reply.promise });
  const page = await openPage("page/climate/index.js", { entity_id: CLIMATE_ID });
  page.onDestroy();
  reply.resolve(CLIMATE);
  await flush();
  assert.equal(findText("Hall"), undefined);
});

test("climate: a failed reply that arrives after onDestroy is not drawn", async () => {
  reset();
  const reply = deferred();
  respond({ GET_ENTITY: () => reply.promise });
  const page = await openPage("page/climate/index.js", { entity_id: CLIMATE_ID });
  page.onDestroy();
  reply.reject(new Error("late"));
  await flush();
  assert.equal(findText("Error: late"), undefined);
});

test("climate: a reload does not redraw the ring while the user is still turning it", async () => {
  reset();
  await climatePage();
  await click(button("+")); // 21.5, sent after 600 ms; its reload is due at ~1600 ms
  await sleep(1200);
  await click(button("+")); // 22, pending until ~1800 ms
  await sleep(500); // the reload lands at ~1600 ms, while 22 is pending; HA still reports 21
  assert.ok(label("22°"), "the ring keeps the user's value");
});

// ---------- cover ----------

const COVER_ID = "cover.garage";
// OPEN | CLOSE | SET_POSITION | STOP
const COVER_ALL = 1 | 2 | 4 | 8;
const COVER = {
  entity_id: COVER_ID, name: "Garage", state: "open",
  attributes: { current_position: 70, supported_features: COVER_ALL },
};
const coverPage = (entity = COVER, extra = {}) => {
  respond({ GET_ENTITY: entity, CALL_SERVICE: { ok: true }, ...extra });
  return openPage("page/cover/index.js", { entity_id: COVER_ID });
};

test("cover: a failed load shows the error", async () => {
  reset();
  await coverPage(COVER, { GET_ENTITY: new Error("offline") });
  assert.deepEqual(texts(), ["Error: offline"]);
});

test("cover: typical attributes draw open/stop/close, the position ring and the status line", async () => {
  reset();
  await coverPage();
  assert.ok(findText("Garage"));
  assert.deepEqual(buttons(), ["open", "stop", "close"]);
  assert.ok(findText("70%"));
  assert.equal(label("open").props.y, 296, "status sits under the ring");
});

test("cover: buttons send open_cover, stop_cover and close_cover", async () => {
  reset();
  await coverPage();
  await click(button("open"));
  await click(button("stop"));
  await click(button("close"));
  assert.deepEqual(params("CALL_SERVICE"), [
    { domain: "cover", service: "open_cover", entity_id: COVER_ID, data: {} },
    { domain: "cover", service: "stop_cover", entity_id: COVER_ID, data: {} },
    { domain: "cover", service: "close_cover", entity_id: COVER_ID, data: {} },
  ]);
  assert.deepEqual(state.toasts, ["done", "done", "done"]);
  await sleep(1100);
});

test("cover: each control needs its supported_features bit", async () => {
  const cases = [
    [2, ["close"], false],
    [8, ["stop"], false],
    [4, [], true],
    [0, [], false],
  ];
  for (const [features, expected, ring] of cases) {
    reset();
    await coverPage({ ...COVER, attributes: { current_position: 70, supported_features: features } });
    assert.deepEqual(buttons(), expected, `supported_features ${features}`);
    assert.equal(findText("70%") !== undefined, ring, `ring for ${features}`);
    assert.equal(label("open").props.y, ring ? 296 : 216, `status line for ${features}`);
  }
});

test("cover: the position ring sends one set_cover_position after the debounce", async () => {
  reset();
  await coverPage();
  await click(button("+"));
  await click(button("+"));
  await click(button(MINUS));
  await sleep(300);
  assert.equal(sent("CALL_SERVICE").length, 0, "nothing before the debounce");
  await sleep(500);
  assert.deepEqual(params("CALL_SERVICE"), [
    { domain: "cover", service: "set_cover_position", entity_id: COVER_ID, data: { position: 80 } },
  ]);
  await sleep(1100);
});

test("cover: a command reloads the entity 1 s after it succeeds", async () => {
  reset();
  await coverPage();
  await click(button("open"));
  await sleep(1100);
  assert.equal(sent("GET_ENTITY").length, 2);
});

test("cover: a failed command toasts the error", async () => {
  reset();
  await coverPage(COVER, { CALL_SERVICE: new Error("jammed") });
  await click(button("close"));
  assert.deepEqual(state.toasts, ["Error: jammed"]);
});

test("cover: destroying the page sends a pending position change", async () => {
  reset();
  const page = await coverPage();
  await click(button("+"));
  page.onDestroy();
  await sleep(700);
  // A change still waiting when the page closes is sent, not lost.
  assert.equal(sent("CALL_SERVICE").length, 1);
});

test("cover: a reply that arrives after onDestroy is not drawn", async () => {
  reset();
  const reply = deferred();
  respond({ GET_ENTITY: () => reply.promise });
  const page = await openPage("page/cover/index.js", { entity_id: COVER_ID });
  page.onDestroy();
  reply.resolve(COVER);
  await flush();
  assert.equal(findText("Garage"), undefined);
});

test("cover: a failed reply that arrives after onDestroy is not shown", async () => {
  reset();
  const reply = deferred();
  respond({ GET_ENTITY: () => reply.promise });
  const page = await openPage("page/cover/index.js", { entity_id: COVER_ID });
  page.onDestroy();
  reply.reject(new Error("late"));
  await flush();
  assert.equal(findText("Error: late"), undefined);
});

test("cover: a reload does not redraw the ring while the user is still turning it", async () => {
  reset();
  await coverPage();
  await click(button("+")); // 80, sent after 600 ms; its reload is due at ~1600 ms
  await sleep(1200);
  await click(button("+")); // 90, pending until ~1800 ms
  await sleep(500); // the reload lands while 90 is pending; HA still reports 70
  assert.ok(findText("90%"), "the ring keeps the user's value");
});

// ---------- fan ----------

const FAN_ID = "fan.bed";
const FAN = {
  entity_id: FAN_ID, name: "Bedroom fan", state: "on",
  attributes: { percentage: 40, percentage_step: 20, oscillating: false },
};
const fanPage = (entity = FAN, extra = {}) => {
  respond({ GET_ENTITY: entity, CALL_SERVICE: { ok: true }, ...extra });
  return openPage("page/fan/index.js", { entity_id: FAN_ID });
};

test("fan: a failed load shows the error", async () => {
  reset();
  await fanPage(FAN, { GET_ENTITY: new Error("offline") });
  assert.deepEqual(texts(), ["Error: offline"]);
});

test("fan: typical attributes draw power and oscillate, the speed ring and the status line", async () => {
  reset();
  await fanPage();
  assert.ok(findText("Bedroom fan"));
  assert.deepEqual(buttons(), ["power", "oscillate"]);
  assert.equal(button("power").props.normal_color, DOMAINS.fan.color);
  assert.equal(button("oscillate").props.normal_color, COLOR.card);
  assert.equal(button("power").props.x, 116);
  assert.equal(button("oscillate").props.x, 244);
  assert.ok(findText("40%"));
  assert.equal(label("on").props.y, 296);
});

test("fan: power sends toggle and oscillate flips the oscillating flag", async () => {
  reset();
  await fanPage({ ...FAN, attributes: { ...FAN.attributes, oscillating: true } });
  assert.equal(button("oscillate").props.normal_color, DOMAINS.fan.color, "lit while oscillating");
  await click(button("power"));
  await click(button("oscillate"));
  assert.deepEqual(params("CALL_SERVICE"), [
    { domain: "fan", service: "toggle", entity_id: FAN_ID, data: {} },
    { domain: "fan", service: "oscillate", entity_id: FAN_ID, data: { oscillating: false } },
  ]);
  await sleep(1100);
});

test("fan: an off fan without oscillation or speed shows only a grey, centred power button", async () => {
  reset();
  await fanPage({ ...FAN, state: "off", attributes: {} });
  assert.deepEqual(buttons(), ["power"]);
  assert.equal(button("power").props.normal_color, COLOR.card);
  assert.equal(button("power").props.x, 180);
  assert.equal(findText("%"), undefined, "no speed ring");
  assert.equal(label("off").props.y, 216);
});

test("fan: the speed ring sends one set_percentage after the debounce, with the entity's step", async () => {
  reset();
  await fanPage();
  await click(button("+"));
  await click(button("+"));
  await sleep(300);
  assert.equal(sent("CALL_SERVICE").length, 0, "nothing before the debounce");
  await sleep(500);
  assert.deepEqual(params("CALL_SERVICE"), [
    { domain: "fan", service: "set_percentage", entity_id: FAN_ID, data: { percentage: 80 } },
  ]);
  await sleep(1100);
});

test("fan: the speed ring defaults to a step of 10 and clamps at 100", async () => {
  reset();
  await fanPage({ ...FAN, attributes: { percentage: 95 } });
  await click(button("+"));
  assert.ok(findText("100%"));
  await sleep(700);
  assert.equal(params("CALL_SERVICE")[0].data.percentage, 100);
  await sleep(1100);
});

test("fan: a failed command toasts the error", async () => {
  reset();
  await fanPage(FAN, { CALL_SERVICE: new Error("stuck") });
  await click(button("power"));
  assert.deepEqual(state.toasts, ["Error: stuck"]);
});

test("fan: destroying the page sends a pending speed change", async () => {
  reset();
  const page = await fanPage();
  await click(button("+"));
  page.onDestroy();
  await sleep(700);
  // A change still waiting when the page closes is sent, not lost.
  assert.equal(sent("CALL_SERVICE").length, 1);
});

test("fan: a reply that arrives after onDestroy is not drawn", async () => {
  reset();
  const reply = deferred();
  respond({ GET_ENTITY: () => reply.promise });
  const page = await openPage("page/fan/index.js", { entity_id: FAN_ID });
  page.onDestroy();
  reply.resolve(FAN);
  await flush();
  assert.equal(findText("Bedroom fan"), undefined);
});

test("fan: a failed reply that arrives after onDestroy is not shown", async () => {
  reset();
  const reply = deferred();
  respond({ GET_ENTITY: () => reply.promise });
  const page = await openPage("page/fan/index.js", { entity_id: FAN_ID });
  page.onDestroy();
  reply.reject(new Error("late"));
  await flush();
  assert.equal(findText("Error: late"), undefined);
});

test("fan: a reload does not redraw the ring while the user is still turning it", async () => {
  reset();
  await fanPage();
  await click(button("+")); // 60, sent after 600 ms; its reload is due at ~1600 ms
  await sleep(1200);
  await click(button("+")); // 80, pending until ~1800 ms
  await sleep(500); // the reload lands while 80 is pending; HA still reports 40
  assert.ok(findText("80%"), "the ring keeps the user's value");
});

// ---------- lock ----------

const LOCK_ID = "lock.front";
const LOCKED = { entity_id: LOCK_ID, name: "Front door", state: "locked", attributes: {} };
const UNLOCKED = { ...LOCKED, state: "unlocked" };
const lockPage = (entity = LOCKED, extra = {}) => {
  respond({ GET_ENTITY: entity, CALL_SERVICE: { ok: true }, ...extra });
  return openPage("page/lock/index.js", { entity_id: LOCK_ID });
};

test("lock: a failed load shows the error in the danger colour", async () => {
  reset();
  await lockPage(LOCKED, { GET_ENTITY: new Error("offline") });
  assert.equal(findText("Error: offline").props.color, COLOR.danger);
});

test("lock: a locked door shows its state and an unlock button", async () => {
  reset();
  await lockPage();
  assert.ok(findText("Front door"));
  assert.ok(label("locked"));
  assert.deepEqual(buttons(), ["unlock_action"]);
  assert.equal(button("unlock_action").props.normal_color, DOMAINS.lock.color);
});

test("lock: the first tap on a locked door only arms the unlock, with no request", async () => {
  reset();
  await lockPage();
  await click(button("unlock_action"));
  assert.equal(sent("CALL_SERVICE").length, 0);
  assert.equal(button("tap_again_to_confirm").props.normal_color, COLOR.danger);
});

test("lock: a second tap within the window unlocks exactly once", async () => {
  reset();
  await lockPage();
  await click(button("unlock_action"));
  await click(button("tap_again_to_confirm"));
  assert.deepEqual(params("CALL_SERVICE"), [{ domain: "lock", service: "unlock", entity_id: LOCK_ID, data: {} }]);
  assert.deepEqual(state.toasts, ["done"]);
  await sleep(1100);
});

test("lock: locking an unlocked door takes one tap", async () => {
  reset();
  await lockPage(UNLOCKED);
  assert.deepEqual(buttons(), ["lock_action"]);
  await click(button("lock_action"));
  assert.deepEqual(params("CALL_SERVICE"), [{ domain: "lock", service: "lock", entity_id: LOCK_ID, data: {} }]);
  await sleep(1100);
});

test("lock: the confirm window closes after 3 s, and a later tap arms again", async (t) => {
  reset();
  await lockPage();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  press(button("unlock_action"));
  assert.ok(button("tap_again_to_confirm"));
  t.mock.timers.tick(2999);
  assert.ok(button("tap_again_to_confirm"), "still armed inside the window");
  t.mock.timers.tick(2);
  assert.ok(button("unlock_action"), "disarmed when the window closes");
  press(button("unlock_action"));
  assert.equal(sent("CALL_SERVICE").length, 0, "re-arming sends nothing");
  press(button("tap_again_to_confirm"));
  assert.equal(sent("CALL_SERVICE").length, 1);
});

test("lock: a tap at exactly 3 s is a new first tap, not a confirmation", async (t) => {
  reset();
  await lockPage();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  press(button("unlock_action"));
  t.mock.timers.tick(3000);
  assert.ok(button("unlock_action"), "the prompt has reset");
  press(button("unlock_action"));
  assert.equal(sent("CALL_SERVICE").length, 0, "one tap must not unlock");
  assert.ok(button("tap_again_to_confirm"));
});

test("lock: destroying the page cancels the confirm timer", async (t) => {
  reset();
  const page = await lockPage();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  press(button("unlock_action"));
  const drawn = state.deleted.length;
  page.onDestroy();
  t.mock.timers.tick(3000);
  assert.equal(state.deleted.length, drawn, "no redraw after destroy");
  assert.equal(page.state.timers.size, 0);
});

test("lock: a failed command toasts the error", async () => {
  reset();
  await lockPage(LOCKED, { CALL_SERVICE: new Error("jammed") });
  await click(button("unlock_action"));
  await click(button("tap_again_to_confirm"));
  assert.deepEqual(state.toasts, ["Error: jammed"]);
});

test("lock: a reply that arrives after onDestroy is not drawn", async () => {
  reset();
  const reply = deferred();
  respond({ GET_ENTITY: () => reply.promise });
  const page = await openPage("page/lock/index.js", { entity_id: LOCK_ID });
  page.onDestroy();
  reply.resolve(LOCKED);
  await flush();
  assert.equal(findText("Front door"), undefined);
});

// ---------- vacuum ----------

const VAC_ID = "vacuum.robot";
const VAC = { entity_id: VAC_ID, name: "Robot", state: "docked", attributes: { battery_level: 88 } };
const vacPage = (entity = VAC, extra = {}) => {
  respond({ GET_ENTITY: entity, CALL_SERVICE: { ok: true }, ...extra });
  return openPage("page/vacuum/index.js", { entity_id: VAC_ID });
};

test("vacuum: a failed load shows the error", async () => {
  reset();
  await vacPage(VAC, { GET_ENTITY: new Error("offline") });
  assert.deepEqual(texts(), ["Error: offline"]);
});

test("vacuum: typical attributes draw state, battery and a 2x2 grid of commands", async () => {
  reset();
  await vacPage();
  assert.ok(findText("Robot"));
  assert.ok(label("docked"));
  assert.ok(label("battery 88%"));
  assert.deepEqual(buttons(), ["start", "pause", "dock", "locate"]);
  assert.deepEqual(
    buttons().map((_, i) => [button(["start", "pause", "dock", "locate"][i]).props.x, button(["start", "pause", "dock", "locate"][i]).props.y]),
    [[72, 168], [248, 168], [72, 256], [248, 256]]
  );
});

test("vacuum: each command is shown only when supported_features has its bit", async () => {
  const cases = [
    [8192, ["start"]],
    [4 | 16 | 512 | 8192, ["start", "pause", "dock", "locate"]],
    [16, ["dock"]],
    [512 | 4, ["pause", "locate"]],
    [0, []],
  ];
  for (const [features, expected] of cases) {
    reset();
    await vacPage({ ...VAC, attributes: { supported_features: features } });
    assert.deepEqual(buttons(), expected, `supported_features ${features}`);
  }
});

test("vacuum: the shown commands fill the grid from the top left", async () => {
  reset();
  await vacPage({ ...VAC, attributes: { supported_features: 4 | 512 } });
  assert.deepEqual([button("pause").props.x, button("pause").props.y], [72, 168]);
  assert.deepEqual([button("locate").props.x, button("locate").props.y], [248, 168]);
});

test("vacuum: a missing supported_features (old integration) shows every command", async () => {
  reset();
  await vacPage({ ...VAC, attributes: { battery_level: 50 } });
  assert.deepEqual(buttons(), ["start", "pause", "dock", "locate"]);
});

test("vacuum: each button sends its vacuum service", async () => {
  reset();
  await vacPage();
  await click(button("start"));
  await click(button("pause"));
  await click(button("dock"));
  await click(button("locate"));
  assert.deepEqual(params("CALL_SERVICE").map((p) => [p.domain, p.service, p.entity_id]), [
    ["vacuum", "start", VAC_ID],
    ["vacuum", "pause", VAC_ID],
    ["vacuum", "return_to_base", VAC_ID],
    ["vacuum", "locate", VAC_ID],
  ]);
  assert.deepEqual(params("CALL_SERVICE")[2].data, {});
  await sleep(1100);
});

test("vacuum: no battery line when HA omits the level", async () => {
  reset();
  await vacPage({ ...VAC, attributes: {} });
  assert.equal(findText("battery"), undefined);
});

test("vacuum: a failed command toasts the error and does not reload", async () => {
  reset();
  await vacPage(VAC, { CALL_SERVICE: new Error("offline") });
  await click(button("start"));
  assert.deepEqual(state.toasts, ["Error: offline"]);
  await sleep(1100);
  assert.equal(sent("GET_ENTITY").length, 1);
});

test("vacuum: a command reloads the entity 1 s after it succeeds", async () => {
  reset();
  await vacPage();
  await click(button("locate"));
  await sleep(1100);
  assert.equal(sent("GET_ENTITY").length, 2);
});

test("vacuum: destroyed during a command stops the reload", async () => {
  reset();
  const page = await vacPage();
  await click(button("locate"));
  page.onDestroy();
  await sleep(1100);
  assert.equal(sent("GET_ENTITY").length, 1);
});

test("vacuum: a reply that arrives after onDestroy is not drawn", async () => {
  reset();
  const reply = deferred();
  respond({ GET_ENTITY: () => reply.promise });
  const page = await openPage("page/vacuum/index.js", { entity_id: VAC_ID });
  page.onDestroy();
  reply.resolve(VAC);
  await flush();
  assert.equal(findText("Robot"), undefined);
});

// ---------- alarm ----------

const ALARM_ID = "alarm_control_panel.home";
const ALARM = { entity_id: ALARM_ID, name: "Home alarm", state: "disarmed", attributes: {} };
const alarmPage = (entity = ALARM, extra = {}) => {
  respond({ GET_ENTITY: entity, CALL_SERVICE: { ok: true }, ...extra });
  return openPage("page/alarm/index.js", { entity_id: ALARM_ID });
};
const NOTE = "alarm_code_required";

test("alarm: a failed load shows the error", async () => {
  reset();
  await alarmPage(ALARM, { GET_ENTITY: new Error("offline") });
  assert.deepEqual(texts(), ["Error: offline"]);
});

test("alarm: without a code, arm home, arm away and disarm are stacked and colour-coded", async () => {
  reset();
  await alarmPage();
  assert.ok(findText("Home alarm"));
  assert.deepEqual(buttons(), ["arm_home", "arm_away", "disarm"]);
  assert.deepEqual(
    ["arm_home", "arm_away", "disarm"].map((t) => [button(t).props.x, button(t).props.y]),
    [[100, 168], [100, 244], [100, 320]]
  );
  assert.equal(button("arm_home").props.normal_color, DOMAINS.alarm_control_panel.color);
  assert.equal(button("disarm").props.normal_color, COLOR.card);
  assert.equal(findText(NOTE), undefined, "no code note");
});

test("alarm: arm buttons send the arm services", async () => {
  reset();
  await alarmPage();
  await click(button("arm_home"));
  await click(button("arm_away"));
  assert.deepEqual(params("CALL_SERVICE"), [
    { domain: "alarm_control_panel", service: "alarm_arm_home", entity_id: ALARM_ID, data: {} },
    { domain: "alarm_control_panel", service: "alarm_arm_away", entity_id: ALARM_ID, data: {} },
  ]);
  await sleep(1100);
});

test("alarm: disarm takes two taps, and the second sends alarm_disarm once", async () => {
  reset();
  await alarmPage();
  await click(button("disarm"));
  assert.equal(sent("CALL_SERVICE").length, 0);
  assert.equal(button("tap_again_to_confirm").props.normal_color, COLOR.danger);
  await click(button("tap_again_to_confirm"));
  assert.deepEqual(params("CALL_SERVICE"), [
    { domain: "alarm_control_panel", service: "alarm_disarm", entity_id: ALARM_ID, data: {} },
  ]);
  await sleep(1100);
});

test("alarm: a code that arms without a code keeps arming and hides disarm", async () => {
  reset();
  await alarmPage({ ...ALARM, attributes: { code_format: "number", code_arm_required: false } });
  assert.deepEqual(buttons(), ["arm_home", "arm_away"]);
  assert.ok(label(NOTE));
});

test("alarm: a code required to arm hides every button", async () => {
  reset();
  await alarmPage({ ...ALARM, attributes: { code_format: "number", code_arm_required: true } });
  assert.deepEqual(buttons(), []);
  assert.ok(label(NOTE));
});

test("alarm: the disarm confirm window closes after 3 s, and a later tap re-arms", async (t) => {
  reset();
  await alarmPage();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  press(button("disarm"));
  t.mock.timers.tick(3001);
  assert.ok(button("disarm"), "back to the plain label");
  press(button("disarm"));
  assert.equal(sent("CALL_SERVICE").length, 0, "re-arming sends nothing");
  press(button("tap_again_to_confirm"));
  assert.equal(sent("CALL_SERVICE").length, 1);
});

test("alarm: a tap at exactly 3 s is a new first tap, not a disarm", async (t) => {
  reset();
  await alarmPage();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  press(button("disarm"));
  t.mock.timers.tick(3000);
  press(button("disarm"));
  assert.equal(sent("CALL_SERVICE").length, 0, "one tap must not disarm");
  assert.ok(button("tap_again_to_confirm"));
});

test("alarm: destroying the page cancels the confirm timer", async (t) => {
  reset();
  const page = await alarmPage();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  press(button("disarm"));
  const drawn = state.deleted.length;
  page.onDestroy();
  t.mock.timers.tick(3000);
  assert.equal(state.deleted.length, drawn, "no redraw after destroy");
  assert.equal(page.state.timers.size, 0);
});

test("alarm: a failed command toasts the error", async () => {
  reset();
  await alarmPage(ALARM, { CALL_SERVICE: new Error("wrong state") });
  await click(button("arm_away"));
  assert.deepEqual(state.toasts, ["Error: wrong state"]);
});

test("alarm: a reply that arrives after onDestroy is not drawn", async () => {
  reset();
  const reply = deferred();
  respond({ GET_ENTITY: () => reply.promise });
  const page = await openPage("page/alarm/index.js", { entity_id: ALARM_ID });
  page.onDestroy();
  reply.resolve(ALARM);
  await flush();
  assert.equal(findText("Home alarm"), undefined);
});

// ---------- defaults and late replies ----------

test("climate: an entity without attributes draws its title and no controls", async () => {
  reset();
  await climatePage({ entity_id: CLIMATE_ID, name: "Hall", state: "heat" });
  assert.ok(findText("Hall"));
  assert.deepEqual(buttons(), []);
});

test("cover: an entity without attributes draws the status line only", async () => {
  reset();
  await coverPage({ entity_id: COVER_ID, name: "Garage", state: "open" });
  assert.deepEqual(buttons(), []);
  assert.equal(label("open").props.y, 216);
});

test("cover: a position ring without a reported position starts at 0", async () => {
  reset();
  await coverPage({ ...COVER, attributes: { supported_features: 4 } });
  assert.ok(findText("0%"));
});

test("fan: an entity without attributes draws the power button only", async () => {
  reset();
  await fanPage({ entity_id: FAN_ID, name: "Bedroom fan", state: "on" });
  assert.deepEqual(buttons(), ["power"]);
});

test("vacuum: an entity without attributes draws the four commands and no battery", async () => {
  reset();
  await vacPage({ entity_id: VAC_ID, name: "Robot", state: "docked" });
  assert.deepEqual(buttons(), ["start", "pause", "dock", "locate"]);
  assert.equal(findText("battery"), undefined);
});

test("lock: a failed reply that arrives after onDestroy is not shown", async () => {
  reset();
  const reply = deferred();
  respond({ GET_ENTITY: () => reply.promise });
  const page = await openPage("page/lock/index.js", { entity_id: LOCK_ID });
  page.onDestroy();
  reply.reject(new Error("late"));
  await flush();
  assert.equal(findText("Error: late"), undefined);
});

test("vacuum: a failed reply that arrives after onDestroy is not shown", async () => {
  reset();
  const reply = deferred();
  respond({ GET_ENTITY: () => reply.promise });
  const page = await openPage("page/vacuum/index.js", { entity_id: VAC_ID });
  page.onDestroy();
  reply.reject(new Error("late"));
  await flush();
  assert.equal(findText("Error: late"), undefined);
});

test("alarm: a failed reply that arrives after onDestroy is not shown", async () => {
  reset();
  const reply = deferred();
  respond({ GET_ENTITY: () => reply.promise });
  const page = await openPage("page/alarm/index.js", { entity_id: ALARM_ID });
  page.onDestroy();
  reply.reject(new Error("late"));
  await flush();
  assert.equal(findText("Error: late"), undefined);
});
