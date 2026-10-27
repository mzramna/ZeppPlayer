// Build profiles, one per Zepp OS API level. `node scripts/build.js --api <level>`
// (or ZEPP_API=<level>) picks one; `--api all` builds every profile.

const MODERN_PERMISSIONS = [
  "data:os.device.info",
  "device:os.local_storage",
  "data:user.hd.step",
  "data:user.hd.calorie",
  "data:user.hd.heart_rate",
  "data:user.hd.sleep",
  "device:os.alarm",
  "device:os.notification",
  "device:os.bg_service",
];

const MODERN = {
  tree: "modern",
  configVersion: "v3",
  permissions: MODERN_PERMISSIONS,
  platforms: [
    { st: "r", dw: 480 },
    { st: "s", dw: 390 },
  ],
  features: {
    appService: true,
  },
};

module.exports = {
  default: "3.6",
  profiles: {
    // Frozen Zepp OS 1.0 app (legacy/ tree, its own app.json), for old watches.
    "1.0": {
      tree: "legacy",
    },
    "3.0": {
      apiVersion: { compatible: "3.0.0", target: "3.7.0", minVersion: "3.0.0" },
      ...MODERN,
    },
    "3.6": {
      apiVersion: { compatible: "3.0.0", target: "3.7.0", minVersion: "3.0.0" },
      ...MODERN,
    },
    "4.0": {
      apiVersion: { compatible: "4.0", target: "4.0", minVersion: "4.0" },
      ...MODERN,
    },
  },
};
