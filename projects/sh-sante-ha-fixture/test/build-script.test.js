// scripts/build.js: flag parsing, variant resolution, app.json profiles and the staging of
// build/api-<level>. The CLI entry is run in-process (for coverage) with execFileSync mocked,
// and once as a real child process for the exit codes.
import { test, mock, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import Module from "node:module";
import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const SCRIPT = path.join(ROOT, "scripts", "build.js");
const build = require("../scripts/build.js");
const config = require("../build.config.js");
const { parseArgs, resolveVariants, appJson, stage, versionNum, resolveZeusBin, prepareRoot } = build;

const DEFAULT_ARGS = { api: "4.0", debug: false, dryRun: false, shape: null, features: {} };

// Sets an environment variable for one call and restores it afterwards.
function withEnv(name, value, fn) {
  const saved = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
}

const tempDirs = [];
after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// Fresh temp directory with the given relative files (content = the file name).
function tempTree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "build-variants-"));
  tempDirs.push(dir);
  for (const rel of files) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), rel);
  }
  return dir;
}

const read = (file) => fs.readFileSync(file, "utf8");

class ExitSignal extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
  }
}

// Runs scripts/build.js as the main module, in this process, so its CLI code is measured.
// execFileSync is replaced; `zab` decides whether the fake `zeus build` leaves a .zab behind.
function runCli(argv, { zab = true, dist = true } = {}) {
  const logs = [];
  const errors = [];
  const execCalls = [];
  const exec = mock.method(childProcess, "execFileSync", (cmd, args, opts) => {
    execCalls.push({ cmd, args, cwd: opts.cwd });
    if (dist) {
      fs.mkdirSync(path.join(opts.cwd, "dist"), { recursive: true });
      if (zab) fs.writeFileSync(path.join(opts.cwd, "dist", "app.zab"), "zab");
    }
  });
  const log = mock.method(console, "log", (...a) => logs.push(a.join(" ")));
  const error = mock.method(console, "error", (...a) => errors.push(a.join(" ")));
  const exit = mock.method(process, "exit", (code) => {
    throw new ExitSignal(code);
  });

  const savedMain = process.mainModule;
  const savedArgv = process.argv;
  const mod = new Module(SCRIPT, null);
  mod.filename = SCRIPT;
  mod.paths = Module._nodeModulePaths(path.dirname(SCRIPT));
  process.mainModule = mod;
  process.argv = [process.execPath, SCRIPT, ...argv];
  let exitCode = null;
  try {
    mod._compile(read(SCRIPT), SCRIPT);
  } catch (e) {
    if (!(e instanceof ExitSignal)) throw e;
    exitCode = e.code;
  } finally {
    process.mainModule = savedMain;
    process.argv = savedArgv;
    exec.mock.restore();
    log.mock.restore();
    error.mock.restore();
    exit.mock.restore();
  }
  return { logs, errors, execCalls, exitCode };
}

// Real process: the same entry point a developer runs.
function runProcess(argv, env = {}) {
  return childProcess.spawnSync(process.execPath, [SCRIPT, ...argv], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

// Leftovers of the zeus step: the fake dist/ output copied into the repo's dist/.
let distBefore;
beforeEach(() => {
  distBefore = fs.existsSync(path.join(ROOT, "dist"));
});
afterEach(() => {
  const out = path.join(ROOT, "dist", "ha-zepp-api3.6.zab");
  if (fs.existsSync(out)) fs.rmSync(out);
  if (!distBefore && fs.existsSync(path.join(ROOT, "dist"))) fs.rmSync(path.join(ROOT, "dist"), { recursive: true });
});

// ---- parseArgs ----

test("parseArgs with no flags uses the configured default API and nothing else", () => {
  withEnv("ZEPP_API", undefined, () => {
    assert.deepEqual(parseArgs([]), DEFAULT_ARGS);
  });
});

test("parseArgs takes the API from ZEPP_API, and --api wins over it", () => {
  withEnv("ZEPP_API", "3.6", () => {
    assert.equal(parseArgs([]).api, "3.6");
    assert.equal(parseArgs(["--api", "4.0"]).api, "4.0");
  });
});

test("parseArgs reads every flag", () => {
  const args = withEnv("ZEPP_API", undefined, () =>
    parseArgs(["--api", "3.6", "--debug", "--dry-run", "--shape", "r,s", "--feature", "camera=true", "--feature", "sleepAsAndroid=false"])
  );
  assert.deepEqual(args, {
    api: "3.6",
    debug: true,
    dryRun: true,
    shape: ["r", "s"],
    features: { camera: true, sleepAsAndroid: false },
  });
});

test("parseArgs accepts --feature=false", () => {
  assert.deepEqual(parseArgs(["--feature", "camera=false"]).features, { camera: false });
});

test("parseArgs rejects a --feature value that is not true or false", () => {
  assert.throws(() => parseArgs(["--feature", "camera=yes"]), /--feature camera needs =true or =false/);
});

test("parseArgs rejects a --feature without a value", () => {
  assert.throws(() => parseArgs(["--feature", "camera"]), /--feature camera needs =true or =false/);
});

test("parseArgs rejects an unknown argument", () => {
  assert.throws(() => parseArgs(["--bogus"]), /Unknown argument: --bogus/);
  assert.throws(() => parseArgs(["3.6"]), /Unknown argument: 3\.6/);
});

test("a flag at the end without its value fails with a readable message", () => {
  assert.throws(() => parseArgs(["--shape"]), /--shape needs a value/);
  assert.throws(() => parseArgs(["--api"]), /--api needs a value/);
});

test("an unknown --feature name is rejected instead of silently ignored", () => {
  assert.throws(() => parseArgs(["--feature", "cmaera=true"]), /Unknown feature/);
});

// ---- versionNum ----

test("versionNum orders API levels numerically, not as strings", () => {
  assert.equal(versionNum("4.0"), 4);
  assert.ok(versionNum("3.6") < versionNum("4.0"));
  assert.ok(versionNum("3.10") > versionNum("3.9"));
  assert.ok(versionNum("1.0") < versionNum("3.6"));
});

// ---- resolveVariants ----

test("resolveVariants picks the highest variant at or below the level and removes the rest", () => {
  const dir = tempTree(["foo.js", "foo.api-3.6.js", "foo.api-4.0.js", "foo.api-9.0.js"]);
  assert.deepEqual(resolveVariants(dir, "3.6"), ["foo.js"]);
  assert.equal(read(path.join(dir, "foo.js")), "foo.api-3.6.js");
  assert.deepEqual(fs.readdirSync(dir).sort(), ["foo.js"]);
});

test("resolveVariants at level 4.0 takes the 4.0 variant", () => {
  const dir = tempTree(["foo.js", "foo.api-3.6.js", "foo.api-4.0.js", "foo.api-9.0.js"]);
  resolveVariants(dir, "4.0");
  assert.equal(read(path.join(dir, "foo.js")), "foo.api-4.0.js");
  assert.deepEqual(fs.readdirSync(dir).sort(), ["foo.js"]);
});

test("resolveVariants at level 9.0 takes the 9.0 variant", () => {
  const dir = tempTree(["foo.js", "foo.api-3.6.js", "foo.api-4.0.js", "foo.api-9.0.js"]);
  resolveVariants(dir, "9.0");
  assert.equal(read(path.join(dir, "foo.js")), "foo.api-9.0.js");
});

test("resolveVariants keeps the highest of several variants whatever the directory order", () => {
  const dir = tempTree(["foo.api-9.0.js", "foo.api-10.0.js", "foo.api-4.0.js", "foo.api-3.6.js"]);
  resolveVariants(dir, "10.0");
  assert.equal(read(path.join(dir, "foo.js")), "foo.api-10.0.js");
  assert.deepEqual(fs.readdirSync(dir).sort(), ["foo.js"]);
});

test("resolveVariants leaves a base file alone when no variant applies, and drops the variants", () => {
  const dir = tempTree(["foo.js", "foo.api-4.0.js"]);
  assert.deepEqual(resolveVariants(dir, "3.6"), []);
  assert.equal(read(path.join(dir, "foo.js")), "foo.js");
  assert.deepEqual(fs.readdirSync(dir).sort(), ["foo.js"]);
});

test("resolveVariants creates the base file from a variant that has none, in a subfolder", () => {
  const dir = tempTree(["sub/bar.api-3.6.js", "plain.js"]);
  assert.deepEqual(resolveVariants(dir, "4.0"), ["sub/bar.js"]);
  assert.equal(read(path.join(dir, "sub", "bar.js")), "sub/bar.api-3.6.js");
  assert.equal(fs.existsSync(path.join(dir, "sub", "bar.api-3.6.js")), false);
  assert.equal(read(path.join(dir, "plain.js")), "plain.js");
});

// ---- appJson ----

function profileJson(level, args = {}, features = {}) {
  const profile = config.profiles[level];
  const merged = { ...DEFAULT_ARGS, ...args };
  return appJson(profile, merged, { ...profile.features, ...features });
}

test("appJson for 3.6 sets the profile's config, API version, permissions and default platform", () => {
  const json = profileJson("3.6");
  assert.equal(json.configVersion, "v3");
  assert.deepEqual(json.runtime.apiVersion, { compatible: "3.6", target: "3.6", minVersion: "3.6" });
  assert.equal(json.permissions.includes("data:user.hd.heart_rate"), true);
  assert.equal(json.debug, false);
  assert.deepEqual(json.targets.common.platforms, [{ st: "r", dw: 480 }]);
  assert.ok(json.targets.common.module["app-service"]);
});

test("appJson for 4.0 declares the 4.0 API level", () => {
  assert.equal(profileJson("4.0").runtime.apiVersion.target, "4.0");
});

test("appJson keeps the camera page with the camera feature off: the home tap opens it and it says camera_disabled", () => {
  const pages = profileJson("4.0").targets.common.module.page.pages;
  assert.ok(pages.includes("page/camera/index"));
  assert.ok(pages.includes("page/sleep/index"));
  assert.ok(pages.includes("page/home/index"));
});

test("appJson keeps the camera page when the camera feature is on", () => {
  const pages = profileJson("4.0", {}, { camera: true }).targets.common.module.page.pages;
  assert.ok(pages.includes("page/camera/index"));
});

test("appJson drops the sleep page when Sleep as Android is off", () => {
  const pages = profileJson("4.0", {}, { sleepAsAndroid: false }).targets.common.module.page.pages;
  assert.equal(pages.includes("page/sleep/index"), false);
});

test("appJson drops the app-service module when that feature is off", () => {
  const json = profileJson("3.6", {}, { appService: false });
  assert.equal("app-service" in json.targets.common.module, false);
});

test("appJson uses the --shape platforms and the debug flag", () => {
  const json = profileJson("3.6", { shape: ["r", "s"], debug: true });
  assert.deepEqual(json.targets.common.platforms, [
    { st: "r", dw: 480 },
    { st: "s", dw: 390 },
  ]);
  assert.equal(json.debug, true);
});

test("an unknown --shape letter is rejected instead of written as a null platform", () => {
  assert.throws(() => parseArgs(["--shape", "r,x"]), /Unknown shape x/);
});

// ---- stage (writes build/api-<level>) ----

const stageDir = (level) => path.join(ROOT, "build", `api-${level}`);

test("stage for 4.0 writes a modern tree with generated app.json and config/build.js", () => {
  const report = stage("4.0", DEFAULT_ARGS).report;
  assert.equal(report.level, "4.0");
  assert.equal(report.tree, "modern");
  assert.deepEqual(report.features, config.profiles["4.0"].features);
  assert.ok(Array.isArray(report.variants));

  const dir = stageDir("4.0");
  const json = JSON.parse(read(path.join(dir, "app.json")));
  assert.equal(json.runtime.apiVersion.target, "4.0");
  assert.equal(json.targets.common.module.page.pages.includes("page/camera/index"), true);

  const cfg = read(path.join(dir, "config", "build.js"));
  assert.match(cfg, /^\/\/ Generated by scripts\/build\.js/);
  assert.match(cfg, /export const API_LEVEL = "4\.0";/);
  const features = JSON.parse(cfg.match(/export const FEATURES = (\{[\s\S]*\});/)[1]);
  assert.equal(features.camera, false);
  assert.equal(features.mobileApp, true);
});

test("stage copies the app but not the build tooling, tests or legacy tree", () => {
  stage("4.0", DEFAULT_ARGS);
  const dir = stageDir("4.0");
  for (const name of ["app-side", "page", "shared", "utils", "app.js"]) {
    assert.ok(fs.existsSync(path.join(dir, name)), name);
  }
  for (const name of ["scripts", "test", "legacy", "build", "dist", "node_modules", "build.config.js", "app.template.json", "package.json"]) {
    assert.equal(fs.existsSync(path.join(dir, name)), false, name);
  }
});

test("stage leaves no *.api-X.Y.js variant file in the staged tree", () => {
  stage("3.6", DEFAULT_ARGS);
  const leftovers = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const file = path.join(d, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else if (/\.api-\d/.test(name)) leftovers.push(file);
    }
  };
  walk(stageDir("3.6"));
  assert.deepEqual(leftovers, []);
});

test("stage replaces an earlier build of the same level", () => {
  const dir = stageDir("4.0");
  stage("4.0", DEFAULT_ARGS);
  fs.writeFileSync(path.join(dir, "stale-marker.txt"), "old");
  stage("4.0", DEFAULT_ARGS);
  assert.equal(fs.existsSync(path.join(dir, "stale-marker.txt")), false);
});

test("stage applies --feature and --shape to the generated files", () => {
  const args = { ...DEFAULT_ARGS, api: "3.6", shape: ["s"], features: { camera: true } };
  stage("3.6", args);
  const dir = stageDir("3.6");
  const json = JSON.parse(read(path.join(dir, "app.json")));
  assert.deepEqual(json.targets.common.platforms, [{ st: "s", dw: 390 }]);
  assert.ok(json.targets.common.module.page.pages.includes("page/camera/index"));
  assert.match(read(path.join(dir, "config", "build.js")), /"camera": true/);
});

test("stage for 1.0 copies the frozen legacy tree as it is", () => {
  const report = stage("1.0", DEFAULT_ARGS).report;
  assert.deepEqual(report, { level: "1.0", tree: "legacy" });
  assert.equal(read(path.join(stageDir("1.0"), "app.json")), read(path.join(ROOT, "legacy", "app.json")));
  assert.equal(fs.existsSync(path.join(stageDir("1.0"), "config", "build.js")), false);
});

test("stage refuses an unknown profile before touching the build folder", () => {
  assert.throws(() => stage("9.9", DEFAULT_ARGS), /Unknown API profile "9\.9"\. Known: 1\.0, 3\.6, 4\.0/);
  assert.equal(fs.existsSync(stageDir("9.9")), false);
});

// ---- main (run in-process) ----

test("the CLI in dry-run mode prints one report per API level without calling zeus", () => {
  const { logs, execCalls, exitCode } = withEnv("ZEPP_API", undefined, () => runCli(["--api", "3.6", "--dry-run", "--shape", "s"]));
  assert.equal(exitCode, null);
  assert.equal(execCalls.length, 0);
  assert.deepEqual(logs.map((l) => JSON.parse(l).level), ["3.6"]);
});

test("the CLI with --api all stages every profile", () => {
  const { logs, execCalls } = runCli(["--api", "all", "--dry-run"]);
  assert.deepEqual(logs.map((l) => JSON.parse(l).level), ["1.0", "3.6", "4.0"]);
  assert.equal(execCalls.length, 0);
});

test("the CLI builds the zab: runs zeus in the stage folder and copies the output to dist/", () => {
  const { logs, execCalls, exitCode } = runCli(["--api", "3.6", "--feature", "camera=true"]);
  assert.equal(exitCode, null);
  assert.equal(execCalls.length, 1);
  assert.deepEqual([execCalls[0].cmd, execCalls[0].args], [resolveZeusBin(), ["build"]]);
  assert.equal(execCalls[0].cwd, stageDir("3.6"));
  const nm = path.join(stageDir("3.6"), "node_modules");
  assert.equal(fs.lstatSync(nm).isSymbolicLink(), true);
  assert.equal(fs.readlinkSync(nm), path.join(ROOT, "node_modules"));
  const out = path.join(ROOT, "dist", "ha-zepp-api3.6.zab");
  assert.equal(read(out), "zab");
  assert.equal(logs.at(-1), `built ${out}`);
});

test("the CLI fails when zeus leaves no .zab in dist/", () => {
  const { errors, exitCode } = runCli(["--api", "3.6"], { zab: false });
  assert.equal(exitCode, 1);
  assert.match(errors.at(-1), /zeus produced no \.zab for API 3\.6/);
});

test("the CLI reports an unknown API level and exits 1", () => {
  const { errors, exitCode } = runCli(["--api", "9.9", "--dry-run"]);
  assert.equal(exitCode, 1);
  assert.match(errors.at(-1), /Unknown API profile "9\.9"/);
});

test("the CLI reports a bad argument and exits 1", () => {
  const { errors, exitCode } = runCli(["--feature", "camera=maybe"]);
  assert.equal(exitCode, 1);
  assert.match(errors.at(-1), /needs =true or =false/);
});

// ---- real process ----

test("node scripts/build.js prints the dry-run report and exits 0", () => {
  const res = runProcess(["--api", "3.6", "--dry-run", "--feature", "camera=true"]);
  assert.equal(res.status, 0, res.stderr);
  const report = JSON.parse(res.stdout.trim());
  assert.equal(report.tree, "modern");
  assert.equal(report.features.camera, true);
});

test("node scripts/build.js with an unknown API level exits 1 with the message", () => {
  const res = runProcess(["--api", "9.9", "--dry-run"]);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /Unknown API profile "9\.9"/);
});

test("node scripts/build.js reads ZEPP_API when --api is not given", () => {
  const res = runProcess(["--dry-run"], { ZEPP_API: "3.6" });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(JSON.parse(res.stdout.trim()).level, "3.6");
});

// ---- --verify (preliminary pre-compilation check) ----

test("--verify implies --dry-run", () => {
  const args = parseArgs(["--verify"]);
  assert.equal(args.verify, true);
  assert.equal(args.dryRun, true);
});

test("verifyStage accepts every staged profile as it is in the repo", () => {
  for (const level of Object.keys(config.profiles)) {
    const { dir } = stage(level, parseArgs(["--dry-run"]));
    assert.deepEqual(build.verifyStage(dir), [], `profile ${level}`);
  }
});

test("verifyStage lists missing pages, icons, translations and unresolved variants", () => {
  const { dir } = stage("4.0", parseArgs(["--dry-run"]));
  fs.rmSync(path.join(dir, "page/fan/index.js"));
  fs.rmSync(path.join(dir, "assets/common.r/icons/lock.png"));
  fs.rmSync(path.join(dir, "page/i18n/en-US.po"));
  fs.writeFileSync(path.join(dir, "utils/x.api-9.0.js"), "");
  const problems = build.verifyStage(dir);
  assert.ok(problems.some((p) => p.startsWith("missing page/fan/index.js")), problems.join("\n"));
  assert.ok(problems.some((p) => p.startsWith("missing assets/common.r/icons/lock.png")));
  assert.ok(problems.some((p) => p.startsWith("missing page/i18n/en-US.po")));
  assert.ok(problems.includes("unresolved API variant utils/x.api-9.0.js"));
});

test("verifyStage checks app.json fields and the legacy per-target assets", () => {
  const legacy = stage("1.0", parseArgs(["--dry-run"])).dir;
  fs.rmSync(path.join(legacy, "assets/mi-band7/icon.png"));
  assert.deepEqual(build.verifyStage(legacy), ["missing assets/mi-band7/icon.png (app icon of target mi-band7)"]);

  const { dir } = stage("4.0", parseArgs(["--dry-run"]));
  const file = path.join(dir, "app.json");
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  delete json.configVersion;
  delete json.runtime;
  json.targets.common.platforms = [];
  fs.writeFileSync(file, JSON.stringify(json));
  const problems = build.verifyStage(dir);
  for (const p of ["app.json: configVersion missing", "app.json: runtime.apiVersion missing", "app.json: target common has no platforms"]) {
    assert.ok(problems.includes(p), problems.join("\n"));
  }
  fs.writeFileSync(file, "{");
  assert.match(build.verifyStage(dir)[0], /^app.json unreadable/);
});

test("the CLI verifies without running zeus, and exits 1 with the problem list on a broken package", () => {
  const ok = runCli(["--api", "4.0", "--verify"]);
  assert.equal(ok.exitCode, null);
  assert.equal(ok.execCalls.length, 0, "zeus must not run with --verify");
  assert.ok(ok.logs.includes("verified API 4.0"));

  const real = fs.existsSync;
  const exists = mock.method(fs, "existsSync", (p) => !String(p).endsWith(path.join("page", "fan", "index.js")) && real(p));
  try {
    const bad = runCli(["--api", "4.0", "--verify"]);
    assert.equal(bad.exitCode, 1);
    assert.match(bad.errors.join("\n"), /API 4\.0: pre-compilation check failed:\n  missing page\/fan\/index\.js/);
  } finally {
    exists.mock.restore();
  }
});

test("verifyStage rejects a modern app icon below the Zepp OS minimum of 124 px", () => {
  const { dir } = stage("4.0", parseArgs(["--dry-run"]));
  const icon = path.join(dir, "assets/common.r/icon.png");
  const png = fs.readFileSync(icon);
  png.writeUInt32BE(100, 16);
  png.writeUInt32BE(100, 20);
  fs.writeFileSync(icon, png);
  assert.deepEqual(build.verifyStage(dir), ["assets/common.r/icon.png is 100x100, Zepp OS needs at least 124x124"]);
  fs.writeFileSync(icon, "not a png");
  assert.deepEqual(build.verifyStage(dir), []);
});

test("verifyStage reports a missing app icon once, without reading it", () => {
  const { dir } = stage("4.0", parseArgs(["--dry-run"]));
  fs.rmSync(path.join(dir, "assets/common.r/icon.png"));
  assert.deepEqual(build.verifyStage(dir), ["missing assets/common.r/icon.png (app icon of target common)"]);
});

test("--list prints the API profiles as JSON for the CI build matrix, without staging", () => {
  const { logs, execCalls, exitCode } = runCli(["--list"]);
  assert.equal(exitCode, null);
  assert.equal(execCalls.length, 0);
  assert.deepEqual(JSON.parse(logs[0]), Object.keys(config.profiles));
  assert.equal(logs.length, 1);
});

test("zeus gets every legacy target with --target (no interactive prompt in CI) and nothing extra for v3", () => {
  const legacy = stage("1.0", parseArgs(["--dry-run"])).dir;
  const targets = Object.keys(JSON.parse(fs.readFileSync(path.join(legacy, "app.json"), "utf8")).targets);
  assert.ok(targets.length > 1);
  assert.deepEqual(build.zeusArgs(legacy), ["build", "--target", targets.join(",")]);
  const modern = stage("4.0", parseArgs(["--dry-run"])).dir;
  assert.deepEqual(build.zeusArgs(modern), ["build"]);
});

test("the CLI passes the legacy targets to zeus", () => {
  const { execCalls, exitCode } = runCli(["--api", "1.0"]);
  assert.equal(exitCode, null);
  assert.equal(execCalls[0].args[0], "build");
  assert.equal(execCalls[0].args[1], "--target");
  assert.match(execCalls[0].args[2], /^amazfit-active,amazfit-balance,/);
  fs.rmSync(path.join(ROOT, "dist", "ha-zepp-api1.0.zab"), { force: true });
});

test("resolveZeusBin returns ZEUS_BIN environment variable when set", () => {
  withEnv("ZEUS_BIN", "/custom/zeus/bin", () => {
    assert.equal(resolveZeusBin(), "/custom/zeus/bin");
  });
});

test("resolveZeusBin locates zeus from PATH when available", () => {
  withEnv("ZEUS_BIN", undefined, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zeus-bin-"));
    const fakeZeus = path.join(dir, "zeus");
    fs.writeFileSync(fakeZeus, "#!/bin/sh\n", { mode: 0o755 });
    try {
      withEnv("PATH", `${dir}:${process.env.PATH || ""}`, () => {
        assert.equal(resolveZeusBin(), fakeZeus);
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test("resolveZeusBin falls back to known location or zeus when PATH is minimal", () => {
  withEnv("ZEUS_BIN", undefined, () => {
    withEnv("PATH", "/nonexistent", () => {
      const bin = resolveZeusBin();
      assert.ok(typeof bin === "string" && bin.length > 0);
    });
  });
});

test("prepareRoot writes app.json and config/build.js for default API 4.0", () => {
  const res = prepareRoot("4.0");
  assert.equal(res.level, "4.0");
  const appJsonPath = path.join(ROOT, "app.json");
  const buildJsPath = path.join(ROOT, "config", "build.js");
  assert.ok(fs.existsSync(appJsonPath));
  assert.ok(fs.existsSync(buildJsPath));
  const parsed = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
  assert.equal(parsed.runtime.apiVersion.target, "4.0");
  const buildJs = fs.readFileSync(buildJsPath, "utf8");
  assert.match(buildJs, /API_LEVEL = "4\.0"/);
});

test("prepareRoot throws for unknown API profile", () => {
  assert.throws(() => prepareRoot("99.9"), /Unknown API profile "99\.9"/);
});

test("the CLI supports --prepare to stage root files without running build", () => {
  const { logs, execCalls, exitCode } = runCli(["--prepare"]);
  assert.equal(exitCode, null);
  assert.equal(execCalls.length, 0);
  assert.ok(logs.includes("prepared root for API 4.0"));
});

