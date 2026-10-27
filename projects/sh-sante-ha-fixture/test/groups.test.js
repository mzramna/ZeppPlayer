import { test } from "node:test";
import assert from "node:assert/strict";
import { filterGroup, tapAction } from "../utils/groups.js";

const e = (entity_id) => ({ entity_id, name: entity_id, state: "on" });

test("filterGroup keeps only the group's domains, in received order", () => {
  const list = [e("sensor.a"), e("light.x"), e("script.s"), e("binary_sensor.b"), e("switch.y")];
  assert.deepEqual(filterGroup(list, "sensors").map((x) => x.entity_id), ["sensor.a", "binary_sensor.b"]);
  assert.deepEqual(filterGroup(list, "devices").map((x) => x.entity_id), ["light.x", "switch.y"]);
  assert.deepEqual(filterGroup(list, "unknown"), []);
});

test("tapAction opens a page, calls a service, or does nothing", () => {
  assert.deepEqual(tapAction(e("light.x")), { page: "page/light/index" });
  assert.deepEqual(tapAction(e("switch.y")), { domain: "switch", service: "toggle" });
  assert.deepEqual(tapAction(e("button.b")), { domain: "button", service: "press" });
  assert.deepEqual(tapAction(e("automation.a")), { domain: "automation", service: "trigger" });
  assert.equal(tapAction(e("sensor.a")), null);
  assert.equal(tapAction(e("unknown_domain.x")), null);
});
