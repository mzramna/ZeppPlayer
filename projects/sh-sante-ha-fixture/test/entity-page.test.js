import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { state, reset, respond, flush, sleep } from "./helpers/watch.js";
import { entityPage, CONFIRM_MS } from "../utils/entity-page.js";

const ENTITY = { entity_id: "fan.f", domain: "fan", name: "Fan", state: "on", attributes: { percentage: 40 } };

function make(extra = {}) {
  const draws = [];
  const page = entityPage({
    domain: "fan",
    draw(entity, list) {
      draws.push({ entity, armed: this.isArmed("off"), list });
    },
    ...extra,
  });
  page.state = {};
  return { page, draws };
}

const requestsOf = (m) => state.requests.filter((r) => r.method === m);

beforeEach(() => reset());

test("loads the entity from params and draws it", async () => {
  respond({ GET_ENTITY: ENTITY });
  const { page, draws } = make();
  page.onInit(JSON.stringify({ entity_id: "fan.f" }));
  await flush();
  assert.deepEqual(state.requests[0], { method: "GET_ENTITY", params: { entity_id: "fan.f" } });
  assert.equal(draws.length, 1);
  assert.equal(draws[0].entity.name, "Fan");
});

test("a load error is shown and nothing is drawn", async () => {
  respond({ GET_ENTITY: new Error("boom") });
  const { page, draws } = make();
  page.onInit(JSON.stringify({ entity_id: "fan.f" }));
  await flush();
  assert.equal(draws.length, 0);
  assert.ok(state.widgets.some((w) => String(w.props.text).includes("boom")));
});

test("a reply after onDestroy draws nothing", async () => {
  let release;
  respond({ GET_ENTITY: () => new Promise((r) => (release = r)) });
  const { page, draws } = make();
  page.onInit(JSON.stringify({ entity_id: "fan.f" }));
  await flush();
  page.onDestroy();
  release(ENTITY);
  await flush();
  assert.equal(draws.length, 0);
});

test("act calls the service, toasts and reloads after a second", async () => {
  respond({ GET_ENTITY: ENTITY, CALL_SERVICE: { ok: true } });
  const { page } = make();
  page.onInit(JSON.stringify({ entity_id: "fan.f" }));
  await flush();
  await page.act("toggle");
  assert.deepEqual(requestsOf("CALL_SERVICE")[0].params, { domain: "fan", service: "toggle", entity_id: "fan.f", data: {} });
  assert.equal(state.toasts.length, 1);
  assert.equal(requestsOf("GET_ENTITY").length, 1);
  await sleep(1050);
  assert.equal(requestsOf("GET_ENTITY").length, 2);
  page.onDestroy();
});

test("act on a destroyed page sends nothing; a failed act toasts the error and does not reload", async () => {
  respond({ GET_ENTITY: ENTITY, CALL_SERVICE: new Error("HTTP 500") });
  const { page } = make();
  page.onInit(JSON.stringify({ entity_id: "fan.f" }));
  await flush();
  await page.act("toggle");
  assert.deepEqual(state.toasts, ["Error: HTTP 500"]);
  await sleep(1050);
  assert.equal(requestsOf("GET_ENTITY").length, 1);
  page.onDestroy();
  await page.act("toggle");
  assert.equal(requestsOf("CALL_SERVICE").length, 1);
});

test("debounced sends once after the last change and holds redraws meanwhile", async () => {
  respond({ GET_ENTITY: ENTITY, CALL_SERVICE: { ok: true } });
  const { page, draws } = make();
  page.onInit(JSON.stringify({ entity_id: "fan.f" }));
  await flush();
  const sent = [];
  const set = page.debounced("pct", (v) => sent.push(v), 50);
  set(50);
  set(60);
  await page.load();
  assert.equal(draws.length, 1, "no redraw while a change is pending");
  await sleep(80);
  assert.deepEqual(sent, [60]);
  await page.load();
  assert.equal(draws.length, 2);
  page.onDestroy();
});

test("confirm needs two taps inside the window and resets after it", async (t) => {
  respond({ GET_ENTITY: ENTITY });
  const { page, draws } = make();
  page.onInit(JSON.stringify({ entity_id: "fan.f" }));
  await flush();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  assert.equal(page.confirm("off"), false);
  assert.equal(draws.at(-1).armed, true);
  assert.equal(page.confirm("off"), true);
  assert.equal(page.isArmed("off"), false);
  assert.equal(page.confirm("off"), false);
  t.mock.timers.tick(CONFIRM_MS);
  assert.equal(page.isArmed("off"), false);
  assert.equal(draws.at(-1).armed, false);
  page.onDestroy();
});

test("pollMs reloads periodically until destroyed", async () => {
  respond({ GET_ENTITY: ENTITY });
  const { page } = make({ pollMs: 30 });
  page.onInit(JSON.stringify({ entity_id: "fan.f" }));
  await sleep(75);
  const n = requestsOf("GET_ENTITY").length;
  assert.ok(n >= 3, `polled ${n} times`);
  page.onDestroy();
  await sleep(60);
  assert.equal(requestsOf("GET_ENTITY").length, n);
});

test("a debounced change still waiting when the page is left is sent, and its reply draws nothing", async () => {
  respond({ GET_ENTITY: ENTITY, CALL_SERVICE: { ok: true } });
  const { page } = make();
  page.onInit(JSON.stringify({ entity_id: "fan.f" }));
  await flush();
  const set = page.debounced("pct", (v) => page.act("set_percentage", { percentage: v }), 50);
  set(70);
  page.onDestroy();
  await flush();
  assert.deepEqual(requestsOf("CALL_SERVICE")[0].params, {
    domain: "fan", service: "set_percentage", entity_id: "fan.f", data: { percentage: 70 },
  });
  assert.deepEqual(state.toasts, [], "the reply skips the toast");
  await sleep(1050);
  assert.equal(requestsOf("GET_ENTITY").length, 1, "no reload once the page is gone");
});

test("every debounced key still waiting is sent, each with its last value, when the page is left", async () => {
  respond({ GET_ENTITY: ENTITY });
  const { page } = make();
  page.onInit(JSON.stringify({ entity_id: "fan.f" }));
  await flush();
  const sent = [];
  const a = page.debounced("a", (v) => sent.push(["a", v]), 50);
  const b = page.debounced("b", (v) => sent.push(["b", v]), 50);
  a(1);
  b(2);
  a(3);
  page.onDestroy();
  assert.deepEqual(sent, [["a", 3], ["b", 2]]);
  await sleep(80);
  assert.deepEqual(sent, [["a", 3], ["b", 2]], "nothing is sent twice");
});
