// Visual tokens and per-domain metadata. All sizes are design units for a
// 480 px wide round screen; utils/ui.js converts them with px().

export const W = 480;
export const H = 480;
export const CX = W / 2;

export const COLOR = {
  bg: 0x000000,
  card: 0x1c1c1e,
  cardPressed: 0x2c2c2e,
  text: 0xffffff,
  textDim: 0x8e8e93,
  accent: 0x18bcf2, // Home Assistant blue
  on: 0xffc107,
  off: 0x3a3a3c,
  danger: 0xff453a,
  ok: 0x30d158,
};

export const FONT = { title: 32, body: 28, small: 22, big: 56 };

export const RADIUS = 24;
// Side margin keeps cards inside the round bezel at mid height.
export const MARGIN = 48;
export const TOP = 72;

// page: route opened when the card is tapped; tap: service run in place instead.
// label: getText() key of the domain name.
export const DOMAINS = {
  light: { color: 0xffc107, icon: "light.png", label: "lights", page: "page/light/index" },
  switch: { color: 0x30d158, icon: "power_icon.png", label: "switches", tap: "toggle" },
  input_boolean: { color: 0x30d158, icon: "power_icon.png", label: "switches", tap: "toggle" },
  fan: { color: 0x64d2ff, icon: "fan.png", label: "fans", page: "page/fan/index" },
  climate: { color: 0xff9f0a, icon: "climate.png", label: "climate", page: "page/climate/index" },
  cover: { color: 0xbf5af2, icon: "cover.png", label: "covers", page: "page/cover/index" },
  lock: { color: 0xff453a, icon: "lock.png", label: "locks", page: "page/lock/index" },
  vacuum: { color: 0x5ac8fa, icon: "vacuum.png", label: "vacuums", page: "page/vacuum/index" },
  media_player: { color: 0xff375f, icon: "media.png", label: "media", page: "page/media_player/index" },
  alarm_control_panel: { color: 0xff453a, icon: "alarm.png", label: "alarm", page: "page/alarm/index" },
  camera: { color: 0x8e8e93, icon: "camera.png", label: "cameras", page: "page/camera/index" },
  scene: { color: 0xbf5af2, icon: "scene.png", label: "scenes", tap: "turn_on" },
  script: { color: 0x18bcf2, icon: "scripts_icon.png", label: "scripts", tap: "turn_on" },
  automation: { color: 0x18bcf2, icon: "scripts_icon.png", label: "automations", tap: "trigger" },
  button: { color: 0x18bcf2, icon: "button.png", label: "buttons", tap: "press" },
  input_button: { color: 0x18bcf2, icon: "button.png", label: "buttons", tap: "press" },
  sensor: { color: 0x8e8e93, icon: "sensor.png", label: "sensors" },
  binary_sensor: { color: 0x8e8e93, icon: "sensor.png", label: "sensors" },
};

export const domainOf = (entityId) => entityId.split(".")[0];
export const domainMeta = (entityId) => DOMAINS[domainOf(entityId)] || DOMAINS.sensor;

export function hsvToHex(h, s = 100, v = 100) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  v = Math.max(0, Math.min(100, v)) / 100;

  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0, g = 0, b = 0;
  if (h < 60) {
    r = c; g = x; b = 0;
  } else if (h < 120) {
    r = x; g = c; b = 0;
  } else if (h < 180) {
    r = 0; g = c; b = x;
  } else if (h < 240) {
    r = 0; g = x; b = c;
  } else if (h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  const r255 = Math.round((r + m) * 255);
  const g255 = Math.round((g + m) * 255);
  const b255 = Math.round((b + m) * 255);

  return (r255 << 16) | (g255 << 8) | b255;
}

