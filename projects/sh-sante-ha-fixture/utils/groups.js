// Pure helpers for the navigation pages (no @zos imports, so tests can run in Node).
import { DOMAINS, domainOf } from "./theme.js";

// Home categories -> domains listed under each (page/entities gets it as `group`).
export const GROUP_DOMAINS = {
  devices: ["light", "switch", "input_boolean", "fan", "climate", "cover", "lock", "vacuum", "media_player", "alarm_control_panel", "camera"],
  scripts: ["script", "scene", "automation", "button", "input_button"],
  sensors: ["sensor", "binary_sensor"],
};

// Entities of one group, in the order they were received.
export const filterGroup = (entities, group) => {
  const domains = GROUP_DOMAINS[group] || [];
  return entities.filter((e) => domains.includes(domainOf(e.entity_id)));
};

// Tap behaviour: open the entity's page, run its service in place, or nothing (sensors).
export function tapAction(entity) {
  const domain = domainOf(entity.entity_id);
  const meta = DOMAINS[domain];
  if (!meta) return null;
  if (meta.page) return { page: meta.page };
  if (meta.tap) return { domain, service: meta.tap };
  return null;
}

export const INTERACTIVE_DOMAINS = [
  "light",
  "switch",
  "input_boolean",
  "fan",
  "climate",
  "cover",
  "lock",
  "vacuum",
  "media_player",
  "alarm_control_panel",
  "script",
  "scene",
  "automation",
  "button",
  "input_button",
];

export const SENSOR_DOMAINS = ["sensor", "binary_sensor", "camera"];

const domainOfEntity = (entity) => {
  if (!entity) return "";
  if (typeof entity === "string") return domainOf(entity);
  if (entity.domain) return entity.domain;
  const id = entity.entity_id || entity.key || "";
  return domainOf(id);
};

export function isInteractive(entity) {
  return INTERACTIVE_DOMAINS.includes(domainOfEntity(entity));
}

export function isSensor(entity) {
  return SENSOR_DOMAINS.includes(domainOfEntity(entity));
}

export function energyCategory(entity) {
  if (!entity) return null;
  const domain = domainOfEntity(entity);
  if (domain !== "sensor") return null;

  const attrs = entity.attributes || {};
  const deviceClass = String(entity.device_class || attrs.device_class || "").toLowerCase().trim();
  const stateClass = String(entity.state_class || attrs.state_class || "").toLowerCase().trim();
  const unit = String(entity.unit || attrs.unit_of_measurement || "").toLowerCase().trim();
  const text = `${entity.entity_id || entity.key || ""} ${entity.name || entity.title || ""}`.toLowerCase();

  // 1. Electricity: kWh, Wh, W, kW, V, A, device_class energy, power, voltage, current
  const ELEC_CLASSES = ["energy", "power", "voltage", "current"];
  const ELEC_UNITS = ["kwh", "wh", "w", "kw", "v", "a", "mwh", "mw", "va", "kva", "var", "kvar", "kvarh"];
  if (ELEC_CLASSES.includes(deviceClass) || ELEC_UNITS.includes(unit)) {
    return "electricity";
  }

  // 2. Gas & Water
  if (deviceClass === "gas") return "gas";
  if (deviceClass === "water") return "water";

  const GAS_UNITS = ["ft³", "ft3", "ccf"];
  if (GAS_UNITS.includes(unit)) return "gas";

  const WATER_UNITS = ["l", "gal", "gal/m", "l/min", "l/h", "gal/h"];
  if (WATER_UNITS.includes(unit)) return "water";

  if (unit === "m³" || unit === "m3") {
    if (text.includes("gas")) return "gas";
    return "water";
  }

  // Heuristics for entity list items without full attributes
  if (/\b(power|energy|watt|kwh|voltage|current|electric)\b/i.test(text)) {
    return "electricity";
  }
  if (/\b(gas)\b/i.test(text)) {
    return "gas";
  }
  if (/\b(water|hidro|agua|água)\b/i.test(text)) {
    return "water";
  }

  // 3. Other cumulative / measurement sensors
  if (stateClass === "total" || stateClass === "total_increasing" || stateClass === "measurement" || attrs.state_class || entity.state_class) {
    return "other";
  }

  return null;
}

export function filterEnergy(entities) {
  if (!Array.isArray(entities)) return [];
  return entities.filter((e) => energyCategory(e) !== null);
}

