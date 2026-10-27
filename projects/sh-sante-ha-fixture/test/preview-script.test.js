// test/preview-script.test.js
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const preview = require("../scripts/preview.js");
const { runPreview, main } = preview;

class ExitSignal extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
  }
}

test("runPreview prepares root and invokes zeus preview with forwarded arguments", () => {
  const spawnCalls = [];
  const fakeSpawn = (cmd, args, opts) => {
    spawnCalls.push({ cmd, args, opts });
    return { status: 0 };
  };

  const res = runPreview(["--target", "amazfit-balance", "--select"], {
    spawnSync: fakeSpawn,
  });

  assert.equal(res.status, 0);
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].args[0], "preview");
  assert.equal(spawnCalls[0].args[1], "--target");
  assert.equal(spawnCalls[0].args[2], "Amazfit Balance");
  assert.equal(spawnCalls[0].args[3], "--select");
  assert.equal(spawnCalls[0].opts.cwd, ROOT);
  assert.equal(spawnCalls[0].opts.stdio, "inherit");

  // Verify app.json and config/build.js exist in root
  assert.ok(fs.existsSync(path.join(ROOT, "app.json")));
  assert.ok(fs.existsSync(path.join(ROOT, "config", "build.js")));
});

test("runPreview respects custom zeusBin and custom API level", () => {
  const spawnCalls = [];
  const fakeSpawn = (cmd, args, opts) => {
    spawnCalls.push({ cmd, args, opts });
    return { status: 0 };
  };

  runPreview(["--help"], {
    spawnSync: fakeSpawn,
    zeusBin: "/custom/bin/zeus",
    level: "3.6",
  });

  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].cmd, "/custom/bin/zeus");
  assert.deepEqual(spawnCalls[0].args, ["preview", "--help"]);

  const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8"));
  assert.equal(parsed.runtime.apiVersion.target, "3.6");
});

test("main exits with child status when runPreview succeeds", () => {
  const exitCalls = [];
  const exit = mock.method(process, "exit", (code) => {
    exitCalls.push(code);
    throw new ExitSignal(code);
  });

  try {
    assert.throws(
      () => main(["--help"], { spawnSync: () => ({ status: 0 }) }),
      ExitSignal
    );
    assert.deepEqual(exitCalls, [0]);
  } finally {
    exit.mock.restore();
  }
});

test("main handles spawn errors and exits 1", () => {
  const exitCalls = [];
  const errors = [];
  const exit = mock.method(process, "exit", (code) => {
    exitCalls.push(code);
    throw new ExitSignal(code);
  });
  const error = mock.method(console, "error", (...args) => errors.push(args.join(" ")));

  try {
    assert.throws(
      () =>
        main(["--help"], {
          spawnSync: () => ({
            error: new Error("spawn ENOENT"),
            status: null,
          }),
        }),
      ExitSignal
    );
    assert.deepEqual(exitCalls, [1]);
    assert.ok(errors.some((e) => e.includes("spawn ENOENT")));
  } finally {
    exit.mock.restore();
    error.mock.restore();
  }
});

test("main exits with non-zero child status code", () => {
  const exitCalls = [];
  const exit = mock.method(process, "exit", (code) => {
    exitCalls.push(code);
    throw new ExitSignal(code);
  });

  try {
    assert.throws(
      () => main(["--help"], { spawnSync: () => ({ status: 2 }) }),
      ExitSignal
    );
    assert.deepEqual(exitCalls, [2]);
  } finally {
    exit.mock.restore();
  }
});
