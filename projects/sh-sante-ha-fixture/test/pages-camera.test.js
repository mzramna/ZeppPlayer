import { test, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { state, reset, respond, texts, findText, click, open } from "./helpers/watch.js";
import { removed } from "./mocks/zos/fs.js";
import { FEATURES } from "../config/build.js";
import { CX, TOP } from "../utils/theme.js";

const CAMERA_ID = "camera.front";
const ENTITY = { entity_id: CAMERA_ID, name: "Front door" };
const savedCamera = FEATURES.camera;
const realGetApp = globalThis.getApp;
const settle = () => new Promise((r) => setImmediate(r));

// Stands in for ZML's app-wide file transfer object (globalData.fileTransferLib). Like ZML, offFile()
// removes the inbox listeners and every handler, so a page has to init() again on each visit.
let lib;
let opened = [];
function fakeInbox() {
  return {
    listening: false,
    handlers: [],
    init() {
      this.listening = true;
    },
    offFile() {
      this.listening = false;
      this.handlers = [];
    },
    onFile(cb) {
      this.handlers.push(cb);
    },
    deliver(file) {
      if (this.listening) this.handlers.forEach((cb) => cb(file));
    },
  };
}

// Opens the camera page; `leave` does what ZML does on the way out (page onDestroy, then offFile).
async function openCamera(params) {
  const page = await open("page/camera/index.js", params);
  opened.push(page);
  return page;
}
function leave(page) {
  page.onDestroy();
  lib.offFile();
  opened = opened.filter((p) => p !== page);
}

beforeEach(() => {
  reset();
  removed.length = 0;
  lib = fakeInbox();
  globalThis.getApp = () => ({ _options: { globalData: { fileTransferLib: lib } } });
});
afterEach(() => {
  mock.timers.reset();
  FEATURES.camera = savedCamera;
  globalThis.getApp = realGetApp;
  for (const page of opened.splice(0)) leave(page);
});

const button = (text) => {
  const w = state.widgets.find((x) => x.type === "BUTTON" && x.props.text === text);
  if (!w) throw new Error(`no button "${text}"`);
  return w;
};
const images = () => state.widgets.filter((w) => w.type === "IMG");
const snapshots = () => state.requests.filter((r) => r.method === "CAMERA_SNAPSHOT");

// Stands in for the file a transfer delivers: the page listens for "change" events on it.
function fakeFile(params, filePath) {
  const handlers = {};
  return {
    params,
    filePath,
    on: (event, cb) => (handlers[event] = cb),
    emit: (data) => handlers.change({ data }),
  };
}
const transferred = (filePath) => fakeFile({ type: "image" }, filePath);

test("camera: with the camera feature off the page says so and asks for nothing", async () => {
  FEATURES.camera = false;
  respond({});
  await openCamera({ entity_id: CAMERA_ID });
  assert.deepEqual(texts(), ["camera_disabled"]);
  assert.deepEqual(state.widgets.filter((w) => w.type === "BUTTON"), []);
  assert.deepEqual(state.requests, []);
});

test("camera: the disabled page also opens without parameters", async () => {
  FEATURES.camera = false;
  respond({});
  await openCamera(undefined);
  assert.deepEqual(texts(), ["camera_disabled"]);
  assert.deepEqual(state.requests, []);
});

test("camera: enabled, the page loads the entity, titles itself and asks for a 400x300 snapshot", async () => {
  FEATURES.camera = true;
  respond({ GET_ENTITY: ENTITY, CAMERA_SNAPSHOT: { file: "front.jpg" } });
  await openCamera({ entity_id: CAMERA_ID });
  assert.deepEqual(state.requests.map((r) => r.method), ["GET_ENTITY", "CAMERA_SNAPSHOT"]);
  assert.deepEqual(state.requests[1].params, { entity_id: CAMERA_ID, width: 400, height: 300 });
  assert.ok(findText("Front door"));
  assert.ok(findText("loading"), "waiting for the image");
  assert.ok(button("camera_refresh"));
});

test("camera: enabled, a failed entity lookup falls back to the entity id as the title", async () => {
  FEATURES.camera = true;
  respond({ GET_ENTITY: new Error("not found"), CAMERA_SNAPSHOT: { file: "front.jpg" } });
  await openCamera({ entity_id: CAMERA_ID });
  assert.ok(findText(CAMERA_ID));
  assert.equal(snapshots().length, 1, "the snapshot is still requested");
});

test("camera: enabled, a failed snapshot request shows the error and a refresh button", async () => {
  FEATURES.camera = true;
  respond({ GET_ENTITY: ENTITY, CAMERA_SNAPSHOT: new Error("camera offline") });
  await openCamera({ entity_id: CAMERA_ID });
  assert.ok(findText("Error: camera offline"));
  assert.ok(button("camera_refresh"));
});

test("camera: enabled, the image is shown once the transfer has finished, scaled to fit", async () => {
  FEATURES.camera = true;
  respond({ GET_ENTITY: ENTITY, CAMERA_SNAPSHOT: { file: "front.jpg" } });
  const page = await openCamera({ entity_id: CAMERA_ID });
  const file = transferred("data://download/front.jpg");
  page.onReceivedFile(file);

  file.emit({ readyState: "transferring" });
  assert.deepEqual(images(), [], "nothing before the transfer is done");
  assert.ok(findText("loading"));

  file.emit({ readyState: "transferred" });
  assert.equal(images().length, 1);
  assert.equal(images()[0].props.src, "data://download/front.jpg");
  assert.equal(images()[0].props.auto_scale, true);
  assert.deepEqual([images()[0].props.x, images()[0].props.y, images()[0].props.w, images()[0].props.h], [CX - 180, TOP + 16, 360, 270]);
  assert.ok(findText("Front door"));
  assert.equal(findText("loading"), undefined);
  assert.ok(button("camera_refresh"));
});

test("camera: enabled, files that are not images are ignored", async () => {
  FEATURES.camera = true;
  respond({ GET_ENTITY: ENTITY, CAMERA_SNAPSHOT: { file: "front.jpg" } });
  const page = await openCamera({ entity_id: CAMERA_ID });
  let listeners = 0;
  page.onReceivedFile({ params: { type: "video" }, on: () => listeners++ });
  page.onReceivedFile({ on: () => listeners++ });
  assert.equal(listeners, 0);
  assert.deepEqual(images(), []);
});

test("camera: enabled, the refresh button asks for a new snapshot and shows loading again", async () => {
  FEATURES.camera = true;
  respond({ GET_ENTITY: ENTITY, CAMERA_SNAPSHOT: { file: "front.jpg" } });
  const page = await openCamera({ entity_id: CAMERA_ID });
  const file = transferred("data://download/front.jpg");
  page.onReceivedFile(file);
  file.emit({ readyState: "transferred" });
  assert.equal(images().length, 1);

  await click(button("camera_refresh"));
  assert.equal(snapshots().length, 2);
  assert.deepEqual(snapshots()[1].params, { entity_id: CAMERA_ID, width: 400, height: 300 });
  assert.ok(findText("loading"));
  assert.deepEqual(images(), [], "the old image is cleared");
});

test("camera: a second visit gets the files again (ZML drops the inbox listeners on leaving)", async () => {
  FEATURES.camera = true;
  respond({ GET_ENTITY: ENTITY, CAMERA_SNAPSHOT: { file: "front.jpg" } });
  leave(await openCamera({ entity_id: CAMERA_ID }));

  await openCamera({ entity_id: CAMERA_ID });
  assert.equal(lib.listening, true);
  assert.equal(lib.handlers.length, 1, "one handler, not one per visit");
  const file = transferred("data://download/again.jpg");
  lib.deliver(file); // what the app-wide inbox does for each arriving file
  file.emit({ readyState: "transferred" });
  assert.equal(images()[0].props.src, "data://download/again.jpg");
});

test("camera: the previous snapshot is deleted when a new one is shown, not before", async () => {
  FEATURES.camera = true;
  respond({ GET_ENTITY: ENTITY, CAMERA_SNAPSHOT: { file: "front.jpg" } });
  const page = await openCamera({ entity_id: CAMERA_ID });
  const first = transferred("data://download/first.jpg");
  page.onReceivedFile(first);
  first.emit({ readyState: "transferred" });
  assert.deepEqual(removed, [], "nothing to delete for the first image");

  await click(button("camera_refresh"));
  const second = transferred("data://download/second.jpg");
  page.onReceivedFile(second);
  second.emit({ readyState: "transferred" });
  assert.deepEqual(removed, ["data://download/first.jpg"]);
  assert.equal(images()[0].props.src, "data://download/second.jpg");
});

test("camera: leaving the page deletes the snapshot it showed", async () => {
  FEATURES.camera = true;
  respond({ GET_ENTITY: ENTITY, CAMERA_SNAPSHOT: { file: "front.jpg" } });
  const page = await openCamera({ entity_id: CAMERA_ID });
  const file = transferred("data://download/front.jpg");
  page.onReceivedFile(file);
  file.emit({ readyState: "transferred" });
  leave(page);
  assert.deepEqual(removed, ["data://download/front.jpg"]);
});

test("camera: no image within 20 seconds shows the error, and a late image is not drawn", async () => {
  FEATURES.camera = true;
  respond({ GET_ENTITY: ENTITY, CAMERA_SNAPSHOT: { file: "front.jpg" } });
  const page = await openCamera({ entity_id: CAMERA_ID });
  page.stopWait(); // the real timer from open(); the mocked one below replaces it
  mock.timers.enable({ apis: ["setTimeout"] });
  page.refresh();
  await settle();
  mock.timers.tick(19999);
  assert.equal(findText("camera_no_file"), undefined);
  mock.timers.tick(1);
  assert.ok(findText("camera_no_file"));
  assert.ok(button("camera_refresh"));

  const late = transferred("data://download/late.jpg");
  page.onReceivedFile(late);
  late.emit({ readyState: "transferred" });
  assert.equal(images().length, 1, "a file that arrives after the wait still shows");
});

test("camera: a file that arrives in time cancels the wait", async () => {
  FEATURES.camera = true;
  respond({ GET_ENTITY: ENTITY, CAMERA_SNAPSHOT: { file: "front.jpg" } });
  const page = await openCamera({ entity_id: CAMERA_ID });
  page.stopWait();
  mock.timers.enable({ apis: ["setTimeout"] });
  page.refresh();
  await settle();
  const file = transferred("data://download/front.jpg");
  page.onReceivedFile(file);
  file.emit({ readyState: "transferred" });
  mock.timers.tick(20000);
  assert.equal(findText("camera_no_file"), undefined);
  assert.equal(images().length, 1);
});

test("camera: a snapshot answer that comes back after leaving draws nothing", async () => {
  FEATURES.camera = true;
  let fail;
  respond({
    GET_ENTITY: ENTITY,
    CAMERA_SNAPSHOT: () => new Promise((_, reject) => (fail = reject)),
  });
  const page = await openCamera({ entity_id: CAMERA_ID });
  const before = state.widgets.length;
  leave(page);
  fail(new Error("late"));
  await settle();
  assert.equal(findText("Error: late"), undefined);
  assert.equal(state.widgets.length, before, "nothing drawn after leaving");
});
