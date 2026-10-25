import { test } from "node:test";
import assert from "node:assert/strict";
import { load, reset } from "./helpers/watch.js";

test("app.js registers an app whose lifecycle hooks run without a phone", async () => {
  reset();
  const app = await load("app.js", "app");
  assert.equal(typeof app.onCreate, "function");
  assert.equal(typeof app.onDestroy, "function");
  assert.doesNotThrow(() => app.onCreate());
  assert.doesNotThrow(() => app.onDestroy());
});
