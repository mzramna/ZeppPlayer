import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshotUrl, cameraSnapshot } from "../app-side/camera.js";

const settingsStore = { HAToken: "tok", localHAIP: "http://ha.local:8123/", externalHAIP: "" };
globalThis.settings = {
  settingsStorage: { getItem: (k) => settingsStore[k] ?? null },
};

// Stands in for the ZML side service: download() answers with the status and path given,
// convert() and sendFile() are recorded in order.
function service({ statusCode = 200, fail = false, convertError } = {}) {
  const calls = [];
  return {
    calls,
    download(url, opts) {
      calls.push({ download: url, opts });
      const task = {};
      queueMicrotask(() =>
        fail
          ? task.onFail({ message: "net" })
          : task.onSuccess({ filePath: `data://download/${opts.filePath}`, statusCode })
      );
      return task;
    },
    convert(opts) {
      calls.push({ convert: opts });
      return convertError ? Promise.reject(convertError) : Promise.resolve({});
    },
    sendFile(path, opts) {
      calls.push({ sendFile: path, opts });
    },
  };
}

test("snapshotUrl joins the base path and adds the size", () => {
  assert.equal(
    snapshotUrl("https://host/ha/", "camera.front_door", 400, 300),
    "https://host/ha/api/camera_proxy/camera.front_door?width=400&height=300"
  );
});

test("cameraSnapshot rejects a bad entity id before any download", async () => {
  const svc = service();
  await assert.rejects(cameraSnapshot({ entity_id: "light.x", width: 400, height: 300 }, svc), /Invalid camera entity/);
  assert.deepEqual(svc.calls, []);
});

test("cameraSnapshot downloads with the bearer token, converts to PNG and queues the converted file", async () => {
  const svc = service();
  const result = await cameraSnapshot({ entity_id: "camera.front", width: 400, height: 300 }, svc);
  const [dl, convert, sent] = svc.calls;
  assert.equal(dl.download, "http://ha.local:8123/api/camera_proxy/camera.front?width=400&height=300");
  assert.equal(dl.opts.headers.Authorization, "Bearer tok");
  assert.match(result.file, /^camera_\d+\.png$/);
  assert.deepEqual(convert.convert, { filePath: `data://download/${result.file}`, targetFilePath: `data://download/${result.file}` });
  assert.deepEqual(sent, { sendFile: `data://download/${result.file}`, opts: { type: "image", name: result.file } });
  assert.equal(svc.calls.length, 3, "converted before it is sent");
});

test("cameraSnapshot does not treat a non-200 answer as an image", async () => {
  const svc = service({ statusCode: 401 });
  await assert.rejects(cameraSnapshot({ entity_id: "camera.front", width: 400, height: 300 }, svc), /HTTP 401/);
  assert.deepEqual(svc.calls.map((c) => Object.keys(c)[0]), ["download"], "nothing converted or sent");
});

test("cameraSnapshot reports a failed download and a missing download task", async () => {
  await assert.rejects(
    cameraSnapshot({ entity_id: "camera.front", width: 400, height: 300 }, service({ fail: true })),
    /download failed/
  );
  const noTask = { download: () => undefined };
  await assert.rejects(cameraSnapshot({ entity_id: "camera.front", width: 400, height: 300 }, noTask), /download unavailable/);
});

test("cameraSnapshot sends nothing when the conversion fails", async () => {
  const svc = service({ convertError: new Error("bad jpeg") });
  await assert.rejects(cameraSnapshot({ entity_id: "camera.front", width: 400, height: 300 }, svc), /bad jpeg/);
  assert.equal(svc.calls.some((c) => "sendFile" in c), false);
});
