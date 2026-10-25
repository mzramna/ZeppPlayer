// Build profiles, one per Zepp OS API level. `node scripts/build.js --api <level>`
// (or ZEPP_API=<level>) picks one; `--api all` builds every profile.
// To support a new API level, add a block here (and *.api-X.Y.js variants if a
// module only exists from that level on).

const MODERN_PERMISSIONS = [
  "data:os.device.info",
  "device:os.local_storage",
  "device:os.ble",
  "device:os.alarm",
  "device:os.bg_service",
  "device:os.notification",
  "data:user.info",
  "data:user.hd.heart_rate",
  "data:user.hd.sleep",
  "data:user.hd.spo2",
  "data:user.hd.stress",
  "data:user.hd.body_temp",
  "data:user.hd.step",
  "data:user.hd.calorie",
  "data:user.hd.distance",
  "data:user.hd.pai",
  "data:user.hd.stand",
  "data:user.hd.fat_burning",
];

// 3.6 and 4.0 currently ship the same features; only the declared API differs.
const MODERN = {
  tree: "modern",
  configVersion: "v3",
  permissions: MODERN_PERMISSIONS,
  platforms: [{ st: "r", dw: 480 }],
  features: {
    appService: true,
    zepp2hass: true,
    mobileApp: true,
    camera: false, // experimental: watch-side JPEG rendering is unverified
    sleepAsAndroid: true,
    notification: true,
    toast: true,
  },
};

module.exports = {
  default: "4.0",
  profiles: {
    // Frozen Zepp OS 1.0 app (legacy/ tree, its own app.json), for old watches.
    "1.0": {
      tree: "legacy",
    },
    // Lowest level the modern tree supports: ZML >= 0.0.28 needs API 3.6 (includes Amazfit Balance 1).
    "3.6": {
      apiVersion: { compatible: "3.6", target: "3.6", minVersion: "3.6" },
      ...MODERN,
    },
    "4.0": {
      apiVersion: { compatible: "3.6", target: "4.0", minVersion: "3.6" },
      ...MODERN,
    },
  },
};
