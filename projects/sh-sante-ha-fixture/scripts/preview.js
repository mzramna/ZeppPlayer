#!/usr/bin/env node
// Prepares root files (app.json and config/build.js) for Zepp OS preview, then
// launches `zeus preview` with any forwarded arguments.
//
//   node scripts/preview.js [--target <name>] [--select] ...

const path = require("path");
const childProcess = require("child_process");
const config = require(path.join(__dirname, "../build.config.js"));
const { prepareRoot, resolveZeusBin, ROOT } = require(path.join(__dirname, "./build.js"));

const DEVICE_MAP = {
  "amazfit-balance": "Amazfit Balance",
  "amazfit-active": "Amazfit Active",
  "amazfit-active-edge": "Amazfit Active Edge",
  "amazfit-cheetah-pro": "Amazfit Cheetah Pro",
  "amazfit-cheetah-round": "Amazfit Cheetah (Round)",
  "amazfit-cheetah-square": "Amazfit Cheetah (Square)",
  "amazfit-falcon": "Amazfit Falcon",
  "amazfit-t-rex-ultra": "Amazfit T-Rex Ultra",
  "amazfit-t-rex-3": "Amazfit T-Rex 3",
  "amazfit-gtr-4": "Amazfit GTR 4",
  "amazfit-gts-4": "Amazfit GTS 4",
};

function normalizeDeviceTarget(target) {
  if (!target || typeof target !== "string") return target;
  const slug = target.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return DEVICE_MAP[slug] || target;
}

function normalizePreviewArgs(args) {
  const normalized = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--target" || a === "-t") {
      normalized.push(a);
      if (i + 1 < args.length) {
        normalized.push(normalizeDeviceTarget(args[++i]));
      }
    } else if (a.startsWith("--target=")) {
      const val = a.slice("--target=".length);
      normalized.push(`--target=${normalizeDeviceTarget(val)}`);
    } else if (a.startsWith("-t=")) {
      const val = a.slice("-t=".length);
      normalized.push(`-t=${normalizeDeviceTarget(val)}`);
    } else {
      normalized.push(a);
    }
  }
  return normalized;
}

function runPreview(cliArgs = process.argv.slice(2), opts = {}) {
  const root = opts.root || ROOT;
  const level = opts.level || process.env.ZEPP_API || config.default;
  prepareRoot(level, opts);

  const zeusBin = opts.zeusBin || resolveZeusBin();
  const args = ["preview", ...normalizePreviewArgs(cliArgs)];
  const spawnFn = opts.spawnSync || childProcess.spawnSync;
  return spawnFn(zeusBin, args, {
    cwd: root,
    stdio: opts.stdio || "inherit",
  });
}

function main(argv = process.argv.slice(2), opts = {}) {
  const res = runPreview(argv, opts);
  if (res.error) {
    console.error(res.error.message);
    process.exit(1);
  }
  process.exit(res.status ?? 0);
}

if (require.main === module) {
  main();
}

module.exports = {
  DEVICE_MAP,
  normalizeDeviceTarget,
  normalizePreviewArgs,
  runPreview,
  main,
};
