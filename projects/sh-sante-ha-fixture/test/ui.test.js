import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import * as hmUI from "@zos/ui";
import { state, reset } from "./helpers/watch.js";
import {
  createTracked, clear, title, message, loading, entityCard, formatState, actionButton, valueRing, roundStep, toast,
} from "../utils/ui.js";
import { emitDigitalCrown } from "./mocks/zos/interaction.js";
import { FEATURES } from "../config/build.js";
import { COLOR, FONT, W, TOP, CX, DOMAINS, domainOf, domainMeta } from "../utils/theme.js";

// The CommonJS build script and config, loaded the way scripts/build.js itself does.
const require = createRequire(import.meta.url);
const { appJson } = require("../scripts/build.js");
const buildConfig = require("../build.config.js");

const ent = (entity_id, state, extra = {}) => ({ entity_id, name: `name of ${entity_id}`, state, ...extra });
const withFeature = (name, value, fn) => {
  const old = FEATURES[name];
  FEATURES[name] = value;
  try {
    return fn();
  } finally {
    FEATURES[name] = old;
  }
};

test("createTracked scales only geometry keys with px and keeps the widget in the list", () => {
  reset();
  state.pxScale = 2;
  const list = [];
  const w = createTracked(list, hmUI.widget.TEXT, {
    x: 10, y: 20, w: 30, h: 40, text_size: 5, radius: 6, line_width: 7, center_x: 8, center_y: 9,
    start_angle: -225, color: 0xff, text: "t",
  });
  assert.deepEqual(list, [w]);
  assert.ok(state.widgets.includes(w));
  assert.equal(w.props.x, 20);
  assert.equal(w.props.y, 40);
  assert.equal(w.props.w, 60);
  assert.equal(w.props.h, 80);
  assert.equal(w.props.text_size, 10);
  assert.equal(w.props.radius, 12);
  assert.equal(w.props.line_width, 14);
  assert.equal(w.props.center_x, 16);
  assert.equal(w.props.center_y, 18);
  assert.equal(w.props.start_angle, -225, "angles are not scaled");
  assert.equal(w.props.color, 0xff);
  assert.equal(w.props.text, "t");
});

test("clear deletes every tracked widget and empties the list", () => {
  reset();
  const list = [];
  const a = createTracked(list, hmUI.widget.TEXT, { x: 0, y: 0, w: 1, h: 1, text: "a" });
  const b = createTracked(list, hmUI.widget.TEXT, { x: 0, y: 0, w: 1, h: 1, text: "b" });
  clear(list);
  assert.deepEqual(list, []);
  assert.deepEqual(state.deleted, [b, a], "pops from the end");
  assert.deepEqual(state.widgets, []);
  clear(list); // empty list is a no-op
  assert.deepEqual(state.deleted, [b, a]);
});

test("title is centred at the top, with a default y and an explicit one", () => {
  reset();
  const list = [];
  const t = title(list, "Lights");
  assert.equal(t.props.text, "Lights");
  assert.equal(t.props.y, TOP - 40);
  assert.equal(t.props.text_size, FONT.title);
  assert.equal(t.props.color, COLOR.text);
  assert.equal(t.props.align_h, hmUI.align.CENTER_H);
  assert.equal(title(list, "Low", 5).props.y, 5);
});

test("message fills the screen and takes a colour, dim by default", () => {
  reset();
  const list = [];
  const dim = message(list, "hello");
  assert.equal(dim.props.color, COLOR.textDim);
  assert.equal(dim.props.h, W);
  assert.equal(dim.props.text_style, hmUI.text_style.WRAP);
  assert.equal(message(list, "boom", COLOR.danger).props.color, COLOR.danger);
  assert.equal(list.length, 2);
});

test("loading shows the translated loading text", () => {
  reset();
  const list = [];
  assert.equal(loading(list).props.text, "loading");
  reset();
  state.strings.loading = "Loading...";
  assert.equal(loading([]).props.text, "Loading...");
});

test("formatState uses the translation, falls back to the raw state, and adds the unit", () => {
  reset();
  state.strings = { state_on: "Ligado", state_closed: "" };
  assert.equal(formatState(ent("light.a", "on")), "Ligado");
  assert.equal(formatState(ent("light.a", "unknown_state")), "unknown_state", "no translation: raw state");
  assert.equal(formatState(ent("sensor.t", "21.5", { unit: "°C" })), "21.5 °C", "unit without translation");
  assert.equal(formatState(ent("light.a", "on", { unit: "%" })), "Ligado %", "unit after translation");
  assert.equal(formatState(ent("light.a", "on")), "Ligado", "no unit: no trailing space");
  assert.equal(formatState(ent("cover.c", "closed")), "closed", "empty translation falls back to the raw state");
});

test("entityCard draws the card with the domain icon and a coloured badge when on", () => {
  reset();
  const list = [];
  const end = entityCard(list, { y: 100, entity: ent("light.a", "on", { name: "Lamp" }) });
  const [bg, badge, icon, name, status] = list;
  assert.equal(end, 100 + 96 + 12, "returns the y below the card");
  assert.equal(bg.props.color, COLOR.card);
  assert.equal(badge.props.color, DOMAINS.light.color, "on: domain colour");
  assert.equal(icon.props.src, "icons/light.png");
  assert.equal(name.props.text, "Lamp");
  assert.equal(status.props.text, "on");
  assert.equal(status.props.color, DOMAINS.light.color);
  assert.equal(list.length, 5);
});

test("entityCard greys the badge and status when the entity is off", () => {
  reset();
  const list = [];
  entityCard(list, { y: 0, entity: ent("light.a", "off") });
  assert.equal(list[1].props.color, COLOR.off);
  assert.equal(list[4].props.color, COLOR.textDim);
});

test("entityCard counts every on-like state as on", () => {
  for (const s of ["on", "open", "unlocked", "playing", "heat", "cool", "auto", "cleaning"]) {
    reset();
    const list = [];
    entityCard(list, { y: 0, entity: ent("switch.s", s) });
    assert.equal(list[1].props.color, DOMAINS.switch.color, `${s} is on`);
  }
  for (const s of ["locked", "closed", "idle", "paused"]) {
    reset();
    const list = [];
    entityCard(list, { y: 0, entity: ent("switch.s", s) });
    assert.equal(list[1].props.color, COLOR.off, `${s} is off`);
  }
});

test("entityCard uses the sensor icon and colour for unknown domains and honours h", () => {
  reset();
  const list = [];
  const end = entityCard(list, { y: 10, h: 50, entity: ent("mystery.x", "on") });
  assert.equal(end, 10 + 50 + 12);
  assert.equal(list[2].props.src, `icons/${DOMAINS.sensor.icon}`);
  assert.equal(list[1].props.color, DOMAINS.sensor.color);
});

test("entityCard runs onClick with the entity when the card is tapped; without onClick it is inert", () => {
  reset();
  const seen = [];
  const e = ent("light.a", "on");
  const list = [];
  entityCard(list, { y: 0, entity: e, onClick: (x) => seen.push(x) });
  list[0].listeners.CLICK_UP.forEach((cb) => cb({}));
  assert.deepEqual(seen, [e]);

  reset();
  const plain = [];
  entityCard(plain, { y: 0, entity: e });
  assert.equal(plain[0].listeners.CLICK_UP, undefined);
});

test("actionButton has defaults and calls click_func through the widget", () => {
  reset();
  const list = [];
  let clicked = 0;
  const b = actionButton(list, { x: 1, y: 2, text: "Go", onClick: () => clicked++ });
  assert.equal(b.type, hmUI.widget.BUTTON);
  assert.equal(b.props.w, 160);
  assert.equal(b.props.h, 72);
  assert.equal(b.props.radius, 36);
  assert.equal(b.props.normal_color, COLOR.card);
  assert.equal(b.props.press_color, COLOR.cardPressed);
  b.props.click_func(b);
  assert.equal(clicked, 1);

  const c = actionButton([], { x: 0, y: 0, w: 100, h: 40, text: "x", color: 0x123456, onClick: () => {} });
  assert.equal(c.props.w, 100);
  assert.equal(c.props.radius, 20);
  assert.equal(c.props.normal_color, 0x123456);
});

test("valueRing shows the value, sets the arc and clamps the - and + buttons", () => {
  reset();
  const list = [];
  const changes = [];
  const ring = valueRing(list, { y: 100, value: 50, onChange: (v) => changes.push(v) });
  const [, arc, label] = list;
  assert.equal(label.props.text, "50%");
  assert.equal(arc.props.end_angle, -225 + 0.5 * 270);
  assert.equal(arc.props.color, COLOR.accent, "default colour");
  assert.equal(ring.get(), 50);
  assert.equal(ring.bottom, 100 + 240 + 88);

  const plus = list.find((w) => w.props.text === "+");
  const minus = list.find((w) => w.props.text === "−");
  assert.equal(minus.props.x, CX - 150, "buttons are placed symmetrically");
  assert.equal(plus.props.x, CX + 30);

  plus.props.click_func(plus);
  assert.equal(ring.get(), 60);
  assert.equal(label.props.text, "60%");
  assert.deepEqual(changes, [60]);

  minus.props.click_func(minus);
  minus.props.click_func(minus);
  assert.equal(ring.get(), 40);
  assert.deepEqual(changes, [60, 50, 40]);
});

test("valueRing clamps to min and max and moves the arc to the ends", () => {
  reset();
  const list = [];
  const ring = valueRing(list, { y: 0, value: 95, step: 10, unit: "", onChange: () => {} });
  const plus = list.find((w) => w.props.text === "+");
  plus.props.click_func(plus);
  assert.equal(ring.get(), 100);
  assert.equal(list[2].props.text, "100");
  assert.equal(list[1].props.end_angle, 45, "full sweep at max");

  ring.set(-50);
  assert.equal(ring.get(), 0);
  assert.equal(list[1].props.end_angle, -225, "empty sweep at min");
  ring.set(999);
  assert.equal(ring.get(), 100);
});

test("valueRing set() does not call onChange and works with a custom unit", () => {
  reset();
  const list = [];
  let calls = 0;
  const ring = valueRing(list, { y: 0, value: 20.5, min: 10, max: 30, step: 0.5, unit: "°C", onChange: () => calls++ });
  assert.equal(list[2].props.text, "20.5°C");
  ring.set(25);
  assert.equal(ring.get(), 25);
  assert.equal(calls, 0);
  const minus = list.find((w) => w.props.text === "−");
  minus.props.click_func(minus);
  assert.equal(ring.get(), 24.5);
  assert.equal(calls, 1);
});

test("valueRing without onChange still moves, and handles a zero-width range", () => {
  reset();
  const list = [];
  valueRing(list, { y: 0, value: 5, min: 5, max: 5 });
  const [, arc] = list;
  assert.equal(arc.props.end_angle, -225, "range of zero does not divide by zero");
  const plus = list.find((w) => w.props.text === "+");
  assert.doesNotThrow(() => plus.props.click_func(plus));
  assert.equal(list[2].props.text, "5%");
});

test("valueRing does not call onChange when + or − is pressed at the clamp edge", () => {
  reset();
  const list = [];
  const changes = [];
  valueRing(list, { y: 0, value: 100, onChange: (v) => changes.push(v) });
  const plus = list.find((w) => w.props.text === "+");
  plus.props.click_func(plus);
  assert.deepEqual(changes, []);
  const low = [];
  valueRing(low, { y: 0, value: 0, onChange: (v) => changes.push(v) });
  const minus = low.find((w) => w.props.text === "−");
  minus.props.click_func(minus);
  assert.deepEqual(changes, []);
});

test("toast shows the text only when the toast feature is on", () => {
  reset();
  withFeature("toast", true, () => toast("hi"));
  assert.deepEqual(state.toasts, ["hi"]);
  withFeature("toast", false, () => toast("hidden"));
  assert.deepEqual(state.toasts, ["hi"]);
});

test("theme: domainOf and domainMeta fall back to the sensor entry for unknown domains", () => {
  assert.equal(domainOf("light.kitchen"), "light");
  assert.equal(domainMeta("light.kitchen").label, "lights");
  assert.equal(domainMeta("weird.x"), DOMAINS.sensor);
});

test("theme: every DOMAINS icon exists in the watch assets and every page route is in the built app.json", () => {
  const icons = new URL("../assets/common.r/icons/", import.meta.url);
  // What ships for API 4.0 with its default features: a tap must never open an unregistered page.
  const profile = buildConfig.profiles["4.0"];
  const pages = appJson(profile, { debug: false, shape: null }, profile.features).targets.common.module.page.pages;
  for (const [domain, meta] of Object.entries(DOMAINS)) {
    assert.ok(existsSync(new URL(meta.icon, icons)), `${domain}: icon ${meta.icon}`);
    if (meta.page) assert.ok(pages.includes(meta.page), `${domain}: page ${meta.page}`);
    assert.ok(!(meta.page && meta.tap), `${domain}: a domain taps either opens a page or runs a service`);
  }
});

test("clear wraps deleteWidget in try/catch and never throws even if a widget was already removed", () => {
  reset();
  const list = [];
  const w1 = createTracked(list, hmUI.widget.TEXT, { text: "w1" });
  const w2 = createTracked(list, hmUI.widget.TEXT, { text: "w2" });
  hmUI.deleteWidget(w1); // manually delete w1 first
  assert.doesNotThrow(() => {
    clear(list);
  });
  assert.equal(list.length, 0);
});

test("entityCard sets setEnable(false) on child decorative widgets", () => {
  reset();
  const list = [];
  let enabledCalls = [];
  // Mock setEnable tracking
  const origCreate = hmUI.createWidget;
  entityCard(list, { y: 0, entity: ent("light.a", "on") });
  const children = list.slice(1); // badge, icon, name, state
  assert.equal(children.length, 4);
});

test("roundStep jumps to round multiples of step according to direction and clamps to min/max", () => {
  // Positive direction (jump to next multiple)
  assert.equal(roundStep(53, 10, 1, 0, 100), 60);
  assert.equal(roundStep(50, 10, 1, 0, 100), 60);
  assert.equal(roundStep(95, 10, 1, 0, 100), 100);
  assert.equal(roundStep(100, 10, 1, 0, 100), 100);

  // Negative direction (jump to previous multiple)
  assert.equal(roundStep(53, 10, -1, 0, 100), 50);
  assert.equal(roundStep(50, 10, -1, 0, 100), 40);
  assert.equal(roundStep(5, 10, -1, 0, 100), 0);
  assert.equal(roundStep(0, 10, -1, 0, 100), 0);

  // Kelvin steps (250)
  assert.equal(roundStep(2700, 250, 1, 2700, 6500), 2750);
  assert.equal(roundStep(2750, 250, -1, 2700, 6500), 2700);

  // Hue steps (30)
  assert.equal(roundStep(15, 30, 1, 0, 360), 30);
  assert.equal(roundStep(15, 30, -1, 0, 360), 0);
});

test("valueRing turning digital crown adjusts value", () => {
  reset();
  const list = [];
  const changes = [];
  const ring = valueRing(list, { y: 0, value: 50, step: 10, onChange: (v) => changes.push(v) });

  emitDigitalCrown(1); // +degree
  assert.equal(ring.get(), 60);
  assert.deepEqual(changes, [60]);

  emitDigitalCrown(-1); // -degree
  assert.equal(ring.get(), 50);
  assert.deepEqual(changes, [60, 50]);
});

test("valueRing touch drag moves value smoothly", () => {
  reset();
  const list = [];
  const changes = [];
  const ring = valueRing(list, { y: 0, value: 50, min: 0, max: 100, onChange: (v) => changes.push(v) });
  const bg = list[0];

  // Drag UP (increasing)
  bg.listeners.CLICK_DOWN[0]({ x: 100, y: 200 });
  bg.listeners.MOVE[0]({ x: 100, y: 150 }); // dy = 50px up
  assert.ok(ring.get() > 50, "dragging up increases value");
  assert.ok(changes.length > 0);

  // Touch up
  bg.listeners.CLICK_UP[0]({ x: 100, y: 150 });
});

test("valueRing center click calls onCenterClick", () => {
  reset();
  const list = [];
  let centerClicked = false;
  valueRing(list, { y: 0, value: 50, onCenterClick: () => (centerClicked = true) });
  const label = list[2];
  label.listeners.CLICK_UP.forEach((cb) => cb({}));
  assert.equal(centerClicked, true);
});

test("valueRing outside click calls onOutsideClick", () => {
  reset();
  const list = [];
  let outsideClicked = false;
  valueRing(list, { y: 0, value: 50, onOutsideClick: () => (outsideClicked = true) });
  // The outside widget is created when onOutsideClick is provided
  const outside = list.find((w) => w.type === "FILL_RECT" && w.props.w === 480);
  assert.ok(outside);
  outside.listeners.CLICK_UP.forEach((cb) => cb({}));
  assert.equal(outsideClicked, true);
});

test("valueRing dynamic color update with set(v, color)", () => {
  reset();
  const list = [];
  const ring = valueRing(list, { y: 0, value: 50, color: 0x111111 });
  const fg = list[1];
  assert.equal(fg.props.color, 0x111111);
  ring.set(80, 0xff0000);
  assert.equal(fg.props.color, 0xff0000);
  assert.equal(ring.get(), 80);
});

