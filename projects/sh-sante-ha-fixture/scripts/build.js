#!/usr/bin/env node
// Builds one .zab per Zepp OS API profile from build.config.js.
//
//   node scripts/build.js [--api <level>|all] [--debug] [--shape r,s]
//                         [--feature name=true|false]... [--dry-run] [--verify]
//   node scripts/build.js --list    (JSON array of the API profiles, used by CI)
//
// Env: ZEPP_API is used when --api is not given. Each profile is staged in
// build/api-<level>/ (tree copy + generated app.json and config/build.js, with
// *.api-X.Y.js variants resolved), then `zeus build` runs there and the
// package is copied to dist/ha-zepp-api<level>.zab.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const config = require(path.join(__dirname, "../build.config.js"));

const ROOT = path.resolve(__dirname, "..");
// Never copied into a modern stage.
const SKIP = new Set([
  ".git", ".github", ".claude", "build", "dist", "node_modules", "legacy",
  "scripts", "test", "docs", "images", "types", "i18n-src", "jsconfig.json", "build.config.js", "app.template.json",
  "app.json", "package.json", "package-lock.json", "README.md",
]);
const SHAPES = { r: { st: "r", dw: 480 }, s: { st: "s", dw: 390 } };
const VARIANT = /\.api-(\d+(?:\.\d+)?)\.js$/;

function parseArgs(argv) {
  const args = { api: process.env.ZEPP_API || config.default, debug: false, dryRun: false, shape: null, features: {} };
  const known = new Set(Object.values(config.profiles).flatMap((p) => Object.keys(p.features || {})));
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--api") args.api = value();
    else if (a === "--debug") args.debug = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--verify") args.verify = args.dryRun = true;
    else if (a === "--list") args.list = true;
    else if (a === "--prepare") args.prepare = true;
    else if (a === "--shape") {
      args.shape = value().split(",");
      const bad = args.shape.filter((s) => !SHAPES[s]);
      if (bad.length) throw new Error(`Unknown shape ${bad.join(",")}; use ${Object.keys(SHAPES).join(",")}`);
    } else if (a === "--feature") {
      const [k, v] = value().split("=");
      if (!known.has(k)) throw new Error(`Unknown feature ${k}; known: ${[...known].join(", ")}`);
      if (v !== "true" && v !== "false") throw new Error(`--feature ${k} needs =true or =false`);
      args.features[k] = v === "true";
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

const versionNum = (v) => v.split(".").map(Number).reduce((acc, n, i) => acc + n / 1000 ** i, 0);

function copyTree(src, dest, skip) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (skip && skip.has(name)) continue;
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) copyTree(from, to, null);
    else fs.copyFileSync(from, to);
  }
}

// foo.api-4.0.js replaces foo.js when level >= 4.0; the highest match wins.
function resolveVariants(dir, level) {
  const variants = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const file = path.join(d, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else if (VARIANT.test(name)) variants.push({ file, base: file.replace(VARIANT, ".js"), v: versionNum(name.match(VARIANT)[1]) });
    }
  };
  walk(dir);
  const best = new Map();
  for (const x of variants) {
    if (x.v <= versionNum(level) && !(best.get(x.base)?.v >= x.v)) best.set(x.base, x);
  }
  for (const x of variants) {
    if (best.get(x.base) === x) fs.renameSync(x.file, x.base);
    else fs.rmSync(x.file);
  }
  return [...best.keys()].map((f) => path.relative(dir, f));
}

function appJson(profile, args, features) {
  const json = JSON.parse(fs.readFileSync(path.join(ROOT, "app.template.json"), "utf8"));
  json.configVersion = profile.configVersion;
  json.permissions = profile.permissions;
  json.runtime.apiVersion = profile.apiVersion;
  json.debug = args.debug;
  const target = json.targets.common;
  target.platforms = args.shape ? args.shape.map((s) => SHAPES[s]) : profile.platforms;
  if (!features.appService) delete target.module["app-service"];
  // Every page the home screen can open stays registered; the camera page shows camera_disabled itself.
  if (!features.sleepAsAndroid) target.module.page.pages = target.module.page.pages.filter((p) => !p.startsWith("page/sleep/"));
  return json;
}

function stage(level, args) {
  const profile = config.profiles[level];
  if (!profile) throw new Error(`Unknown API profile "${level}". Known: ${Object.keys(config.profiles).join(", ")}`);
  const dir = path.join(ROOT, "build", `api-${level}`);
  fs.rmSync(dir, { recursive: true, force: true });

  if (profile.tree === "legacy") {
    copyTree(path.join(ROOT, "legacy"), dir, null);
    return { dir, report: { level, tree: "legacy" } };
  }

  const features = { ...profile.features, ...args.features };
  copyTree(ROOT, dir, SKIP);
  const variants = resolveVariants(dir, level);
  fs.mkdirSync(path.join(dir, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "config", "build.js"),
    `// Generated by scripts/build.js. Do not edit.\nexport const API_LEVEL = ${JSON.stringify(level)};\nexport const FEATURES = ${JSON.stringify(features, null, 2)};\n`
  );
  fs.writeFileSync(path.join(dir, "app.json"), JSON.stringify(appJson(profile, args, features), null, 2) + "\n");
  return { dir, report: { level, tree: "modern", features, variants } };
}

const MIN_APP_ICON = 124;

// Width/height from a PNG's IHDR chunk; null when the file is not a PNG.
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.toString("ascii", 12, 16) !== "IHDR") return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// Preliminary pre-compilation check of a staged tree: everything app.json points
// to must exist, so a broken package fails here instead of on the watch.
// Returns the list of problems (empty = ok).
function verifyStage(dir) {
  const problems = [];
  const has = (rel) => fs.existsSync(path.join(dir, rel));
  const need = (rel, why) => {
    if (has(rel)) return true;
    problems.push(`missing ${rel} (${why})`);
    return false;
  };
  let json;
  try {
    json = JSON.parse(fs.readFileSync(path.join(dir, "app.json"), "utf8"));
  } catch (e) {
    return [`app.json unreadable: ${e.message}`];
  }
  if (!json.configVersion) problems.push("app.json: configVersion missing");
  if (!json.app || !json.app.appId) problems.push("app.json: app.appId missing");
  if (!json.runtime || !json.runtime.apiVersion) problems.push("app.json: runtime.apiVersion missing");
  for (const [name, target] of Object.entries(json.targets || {})) {
    const m = target.module || {};
    for (const page of (m.page && m.page.pages) || []) need(`${page}.js`, `page of target ${name}`);
    for (const svc of (m["app-service"] && m["app-service"].services) || []) need(`${svc}.js`, `app-service of target ${name}`);
    if (m["app-side"]) need(`${m["app-side"].path}.js`, `app-side of target ${name}`);
    if (m.setting) need(`${m.setting.path}.js`, `settings of target ${name}`);
    if (!target.platforms || !target.platforms.length) problems.push(`app.json: target ${name} has no platforms`);
    // v3 targets use assets/<target>.<shape>/, v2 (legacy) assets/<target>/.
    const assetDirs = json.configVersion === "v3" ? target.platforms.map((p) => `assets/${name}.${p.st}`) : [`assets/${name}`];
    for (const a of assetDirs) {
      const icon = `${a}/${json.app.icon || "icon.png"}`;
      if (!need(icon, `app icon of target ${name}`)) continue;
      // zeus warns below this and the store icon looks blurry (Zepp OS design guide).
      const size = pngSize(path.join(dir, icon));
      if (json.configVersion === "v3" && size && Math.min(size.w, size.h) < MIN_APP_ICON) {
        problems.push(`${icon} is ${size.w}x${size.h}, Zepp OS needs at least ${MIN_APP_ICON}x${MIN_APP_ICON}`);
      }
    }
  }
  if (json.configVersion === "v3") {
    const theme = has("utils/theme.js") ? fs.readFileSync(path.join(dir, "utils/theme.js"), "utf8") : "";
    const icons = new Set([...theme.matchAll(/icon: "([\w.-]+\.png)"/g)].map((m) => m[1]));
    for (const icon of icons) need(`assets/common.r/icons/${icon}`, "domain icon in utils/theme.js");
    need("page/i18n/en-US.po", "default watch translations");
  }
  const walk = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (e.name === "node_modules" ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]
    );
  for (const f of walk(dir)) if (VARIANT.test(f)) problems.push(`unresolved API variant ${path.relative(dir, f)}`);
  return problems;
}

// configVersion v2 apps (legacy) with several targets make `zeus build` ask
// which targets to build, which fails without a terminal (CI). Passing every
// target with --target skips that prompt. v3 apps must not get --target: it
// switches zeus to interactive device selection.
function zeusArgs(dir) {
  const json = JSON.parse(fs.readFileSync(path.join(dir, "app.json"), "utf8"));
  if (json.configVersion === "v3") return ["build"];
  return ["build", "--target", Object.keys(json.targets || {}).join(",")];
}

function resolveZeusBin() {
  if (process.env.ZEUS_BIN) return process.env.ZEUS_BIN;

  const pathDirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    const candidate = path.join(dir, "zeus");
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      }
    } catch (_) {}
  }

  try {
    const nodeDir = path.dirname(process.execPath);
    const candidate = path.join(nodeDir, "zeus");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  } catch (_) {}

  if (process.env.NVM_BIN) {
    const candidate = path.join(process.env.NVM_BIN, "zeus");
    if (fs.existsSync(candidate)) return candidate;
  }

  const knownPaths = [
    "/home/mzramna/.nvm/versions/node/v24.16.0/bin/zeus",
    path.join(process.env.HOME || "", ".nvm/versions/node/v24.16.0/bin/zeus"),
    "/media/mzramna/dados/AppData/.nvm/versions/node/v24.16.0/bin/zeus",
    path.join(process.env.HOME || "", ".npm-global/bin/zeus"),
    "/usr/local/bin/zeus",
    "/usr/bin/zeus",
  ];
  for (const candidate of knownPaths) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch (_) {}
  }

  try {
    const nvmNodeDir = path.join(process.env.HOME || "", ".nvm/versions/node");
    if (fs.existsSync(nvmNodeDir)) {
      const versions = fs.readdirSync(nvmNodeDir);
      for (const v of versions) {
        const candidate = path.join(nvmNodeDir, v, "bin", "zeus");
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch (_) {}

  return "zeus";
}

function prepareRoot(level = config.default, args = {}) {
  const profile = config.profiles[level];
  if (!profile) throw new Error(`Unknown API profile "${level}". Known: ${Object.keys(config.profiles).join(", ")}`);
  const features = { ...profile.features, ...(args.features || {}) };
  const json = appJson(profile, args, features);
  fs.writeFileSync(path.join(ROOT, "app.json"), JSON.stringify(json, null, 2) + "\n");
  fs.mkdirSync(path.join(ROOT, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, "config", "build.js"),
    `// Generated by scripts/build.js. Do not edit.\nexport const API_LEVEL = ${JSON.stringify(level)};\nexport const FEATURES = ${JSON.stringify(features, null, 2)};\n`
  );
  return { level, features };
}

function zeusBuild(dir, level) {
  // zeus resolves @zeppos/zml from the stage dir.
  const nm = path.join(dir, "node_modules");
  if (!fs.existsSync(nm)) fs.symlinkSync(path.join(ROOT, "node_modules"), nm, "dir");
  // zeus-cli only works installed globally (`npm i -g @zeppos/zeus-cli`): its
  // module-alias setup breaks as a project dependency. ZEUS_BIN overrides the path.
  const zeusBin = resolveZeusBin();
  execFileSync(zeusBin, zeusArgs(dir), { cwd: dir, stdio: "inherit" });
  const zab = fs.readdirSync(path.join(dir, "dist")).find((f) => f.endsWith(".zab"));
  if (!zab) throw new Error(`zeus produced no .zab for API ${level}`);
  fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
  const out = path.join(ROOT, "dist", `ha-zepp-api${level}.zab`);
  fs.copyFileSync(path.join(dir, "dist", zab), out);
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.prepare) {
    const res = prepareRoot(args.api, args);
    console.log(`prepared root for API ${res.level}`);
    return;
  }
  // CI builds one job per profile from this list, so a new profile gets its own build.
  if (args.list) return console.log(JSON.stringify(Object.keys(config.profiles)));
  const levels = args.api === "all" ? Object.keys(config.profiles) : [args.api];
  for (const level of levels) {
    const { dir, report } = stage(level, args);
    console.log(JSON.stringify(report));
    if (args.verify) {
      const problems = verifyStage(dir);
      if (problems.length) throw new Error(`API ${level}: pre-compilation check failed:\n  ${problems.join("\n  ")}`);
      console.log(`verified API ${level}`);
    }
    if (!args.dryRun) console.log(`built ${zeusBuild(dir, level)}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = {
  ROOT,
  SKIP,
  SHAPES,
  parseArgs,
  resolveVariants,
  appJson,
  stage,
  versionNum,
  verifyStage,
  zeusArgs,
  resolveZeusBin,
  prepareRoot,
  zeusBuild,
};
