// Phone side of SYNC_SENSORS: sends the watch's payload to Home Assistant in the mode the user picked.
import { SETTING } from "../shared/protocol.js";
import { SENSOR_DEFS, getPath } from "../shared/zepp2hass.js";
import { request, haRequest } from "./http.js";
import { updateSensors } from "./mobile-app.js";

const get = (key) => settings.settingsStorage.getItem(key);
const saveLast = (value) => settings.settingsStorage.setItem(SETTING.LAST_SYNC, JSON.stringify(value));

// The full webhook URL is in the settings, so no token is sent.
async function sendZepp2hass(payload) {
  const url = get(SETTING.ZEPP2HASS_URL);
  if (!url) throw new Error("zepp2hass webhook URL not set");
  const res = await request(url, { method: "POST", body: payload });
  if (!res || res.status !== "ok") throw new Error("Unexpected response from zepp2hass");
}

const REST_SENSORS = ["heart_rate", "heart_rate_resting", "battery", "steps", "calories", "distance", "pai"];

// shortcut: REST states live only in HA memory and vanish on HA restart until the next sync, use zepp2hass or mobile_app to keep them.
async function sendRest(payload) {
  const device = String((payload.device && payload.device.deviceName) || "zepp")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    // HA entity ids cannot start/end with "_" or contain "__".
    .replace(/^_+|_+$/g, "") || "zepp";
  for (const def of SENSOR_DEFS) {
    const value = getPath(payload, def.path);
    if (value === undefined || !REST_SENSORS.includes(def.unique_id)) continue;
    await haRequest(`/api/states/sensor.${device}_${def.unique_id}`, {
      method: "POST",
      body: {
        state: value,
        attributes: {
          friendly_name: def.name,
          unit_of_measurement: def.unit,
          icon: def.icon,
          state_class: def.state_class,
        },
      },
    });
  }
}

const SENDERS = new Map([
  ["zepp2hass", sendZepp2hass],
  ["mobile_app", updateSensors],
  ["rest", sendRest],
]);

export async function syncSensors({ payload }) {
  const send = SENDERS.get(get(SETTING.SENSOR_MODE));
  // "none" or unset: not an error, the watch stops its background sync on this answer.
  if (!send) return { disabled: true };
  try {
    if (!payload || typeof payload !== "object") throw new Error("No sensor payload");
    await send(payload);
    saveLast({ time: Date.now(), ok: true });
  } catch (e) {
    saveLast({ time: Date.now(), ok: false, error: (e && e.message) || String(e) });
    throw e;
  }
  return { interval: Number(get(SETTING.SYNC_INTERVAL)) || 5 };
}
