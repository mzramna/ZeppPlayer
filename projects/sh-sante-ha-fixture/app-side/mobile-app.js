// Home Assistant mobile_app integration (the API the HA Companion app uses): registers the
// watch as a device, then pushes sensor states through the registration's webhook.
import { SETTING } from "../shared/protocol.js";
import { SENSOR_DEFS, getPath } from "../shared/zepp2hass.js";
import { request, haRequest, joinUrl, baseUrls, HttpError, errorText } from "./http.js";

const get = (key) => settings.settingsStorage.getItem(key);

function load() {
  try {
    return JSON.parse(get(SETTING.MOBILE_APP));
  } catch (e) {
    return null;
  }
}

// Random, and kept in the stored registration so Home Assistant sees the same device again.
const newDeviceId = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

function sensorRegistration(def) {
  const data = {
    unique_id: def.unique_id,
    name: def.name,
    type: def.type,
    // HA needs a state at registration; the first update replaces it.
    state: def.type === "binary_sensor" ? false : "unknown",
    device_class: def.device_class,
    unit_of_measurement: def.unit,
    state_class: def.state_class,
    icon: def.icon,
    entity_category: def.entity_category,
  };
  for (const key of Object.keys(data)) {
    if (data[key] == null) delete data[key];
  }
  return data;
}

export async function register() {
  const deviceId = (load() || {}).device_id || newDeviceId();
  const reg = await haRequest("/api/mobile_app/registrations", {
    method: "POST",
    body: {
      device_id: deviceId,
      app_id: "ha_zepp",
      app_name: "HA Zepp",
      app_version: "2.0.0",
      // The phone side cannot read the watch model; users can rename the device in HA.
      device_name: "Zepp watch",
      manufacturer: "Amazfit",
      model: "Zepp OS watch",
      os_name: "Zepp OS",
      os_version: "",
      supports_encryption: false,
      app_data: {},
    },
  });
  if (!reg || !reg.webhook_id) throw new Error("Unexpected response from Home Assistant");
  settings.settingsStorage.setItem(
    SETTING.MOBILE_APP,
    JSON.stringify({
      device_id: deviceId,
      webhook_id: reg.webhook_id,
      secret: reg.secret,
      cloudhook_url: reg.cloudhook_url,
      remote_ui_url: reg.remote_ui_url,
    })
  );
  for (const def of SENSOR_DEFS) await webhook("register_sensor", sensorRegistration(def));
  return "Registered";
}

// Cloud hook first, then Nabu Casa remote UI, then the LAN and external addresses.
function webhookUrls(reg) {
  const path = `api/webhook/${reg.webhook_id}`;
  return [
    reg.cloudhook_url,
    reg.remote_ui_url && joinUrl(reg.remote_ui_url, path),
    ...baseUrls().map((base) => joinUrl(base, path)),
  ].filter(Boolean);
}

// Webhooks need no token. Network errors try the next URL; an HTTP error is final.
export async function webhook(type, data) {
  const reg = load();
  if (!reg || !reg.webhook_id) throw new Error("Not registered: press Register in the settings");
  const urls = webhookUrls(reg);
  if (!urls.length) throw new Error("Home Assistant address not set");
  let lastError;
  for (const url of urls) {
    try {
      return await request(url, { method: "POST", body: { type, data } });
    } catch (e) {
      if (!(e instanceof HttpError)) {
        lastError = e;
        continue;
      }
      // Home Assistant deleted the integration entry; the stored registration is dead.
      if (e.status === 410) {
        settings.settingsStorage.removeItem(SETTING.MOBILE_APP);
        throw new Error("Home Assistant removed this watch: press Register in the settings again");
      }
      throw e;
    }
  }
  throw new Error(`Connection error: ${errorText(lastError)}`);
}

// Pushes every payload value that a SENSOR_DEFS path resolves to. Binary sensors take truthiness.
// HA answers per sensor; ones it reports as not_registered (added in a later app version)
// are registered and sent again.
export async function updateSensors(payload) {
  const states = [];
  for (const def of SENSOR_DEFS) {
    const value = getPath(payload, def.path);
    if (value === undefined) continue;
    states.push({
      unique_id: def.unique_id,
      type: def.type,
      state: def.type === "binary_sensor" ? Boolean(value) : value,
    });
  }
  const result = await webhook("update_sensor_states", states);
  const missing = SENSOR_DEFS.filter(
    (def) => result && result[def.unique_id] && result[def.unique_id].error && result[def.unique_id].error.code === "not_registered"
  );
  for (const def of missing) await webhook("register_sensor", sensorRegistration(def));
  if (missing.length) {
    const ids = new Set(missing.map((d) => d.unique_id));
    await webhook("update_sensor_states", states.filter((s) => ids.has(s.unique_id)));
  }
  return result;
}
