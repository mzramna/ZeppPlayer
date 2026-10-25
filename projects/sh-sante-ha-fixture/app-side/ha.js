// Home Assistant REST calls from the phone side service. Transport and LAN-first
// failover live in http.js; this file maps HA data to the watch contract.
import { SETTING, ENTITY_ATTRIBUTES } from "../shared/protocol.js";
import { DOMAINS } from "../utils/theme.js";
import { filterEnergy } from "../utils/groups.js";
import { ENTITY_ID, NAME, parseJson, readList } from "../shared/validate.js";
import { haRequest, HttpError } from "./http.js";

const get = (key) => settings.settingsStorage.getItem(key);
const set = (key, value) => settings.settingsStorage.setItem(key, value);

const isEntityId = (id) => typeof id === "string" && ENTITY_ID.test(id);
const isName = (s) => typeof s === "string" && NAME.test(s);
const validIds = (list) => (Array.isArray(list) ? list.filter(isEntityId) : []);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function enabledIds() {
  return validIds(readList(get(SETTING.ENTITY_LIST)).filter((item) => item && item.value === true).map((item) => item.key));
}

// Maps one HA state (plus its area name) to the watch's Entity shape (shared/protocol.js).
export function toEntity(raw) {
  const id = raw.entity_id;
  // The template sends attributes as [key, value] pairs; /api/states sends an object.
  const a = Array.isArray(raw.attributes) ? Object.fromEntries(raw.attributes) : raw.attributes || {};
  const domain = id.split(".")[0];
  const keys = hasOwn(ENTITY_ATTRIBUTES, domain) ? ENTITY_ATTRIBUTES[domain] : [];
  const attributes = {};
  for (const key of keys) {
    if (a[key] !== undefined) attributes[key] = a[key];
  }
  if (domain === "light") {
    if (typeof a.brightness === "number") {
      attributes.brightness_pct = Math.round((a.brightness / 255) * 100);
    }
    if (attributes.hs_color !== undefined && attributes.hs_color !== null) {
      attributes.hs_color = Array.isArray(attributes.hs_color) ? attributes.hs_color : Array.from(attributes.hs_color);
    }
    if (attributes.rgb_color !== undefined && attributes.rgb_color !== null) {
      attributes.rgb_color = Array.isArray(attributes.rgb_color) ? attributes.rgb_color : Array.from(attributes.rgb_color);
    }
  }
  return {
    entity_id: id,
    domain,
    name: a.friendly_name || id,
    state: raw.state,
    unit: a.unit_of_measurement || "",
    area: raw.area || "",
    attributes,
  };
}

// The rendered template is the text body; it is JSON by construction.
async function renderJson(template) {
  const body = await haRequest("/api/template", { method: "POST", body: { template } });
  return typeof body === "string" ? JSON.parse(body) : body;
}

// Attributes the watch reads. Copying only these keeps the reply small and avoids
// datetime attributes (last_triggered, media_position_updated_at) that break tojson.
const TEMPLATE_KEYS = [
  ...new Set(["friendly_name", "unit_of_measurement", "brightness", ...Object.values(ENTITY_ATTRIBUTES).flat()]),
].filter((k) => k !== "brightness_pct");

// One state per id, in id order; ids missing in HA are left out. Attributes come
// back as [key, value] pairs (no dict building in HA's sandboxed Jinja).
function entitiesTemplate(ids) {
  return (
    `{% set keys = ${JSON.stringify(TEMPLATE_KEYS)} %}{% set ns = namespace(out=[]) %}` +
    `{% for id in ${JSON.stringify(ids)} %}{% set s = states[id] %}{% if s is not none %}` +
    "{% set a = namespace(pairs=[]) %}{% for k in keys %}{% if k in s.attributes %}" +
    "{% set val = s.attributes[k] %}" +
    "{% if val is iterable and val is not string and val is not mapping %}{% set val = val | list %}{% endif %}" +
    "{% set a.pairs = a.pairs + [[k, val]] %}{% endif %}{% endfor %}" +
    '{% set ns.out = ns.out + [{"entity_id": id, "state": s.state, "attributes": a.pairs}] %}' +
    "{% endif %}{% endfor %}{{ ns.out | tojson }}"
  );
}

// Areas that hold at least one of the given entities, with those entities only.
function areasTemplate(ids) {
  return (
    `{% set enabled = ${JSON.stringify(ids)} %}{% set ns = namespace(out=[]) %}` +
    "{% for a in areas() %}{% set ents = namespace(list=[]) %}" +
    "{% for e in area_entities(a) %}{% if e in enabled %}{% set ents.list = ents.list + [e] %}{% endif %}{% endfor %}" +
    '{% if ents.list %}{% set ns.out = ns.out + [{"area_id": a, "name": area_name(a), "entity_ids": ents.list}] %}{% endif %}' +
    "{% endfor %}{{ ns.out | tojson }}"
  );
}

// Old HA without /api/template: read the full state list and filter it here (no areas).
async function statesFallback(ids) {
  const states = await haRequest("/api/states");
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  return ids.filter((id) => byId.has(id)).map((id) => byId.get(id));
}

/** @param {{ids?: string[]}} [params] */
export async function getEntities({ ids } = {}) {
  const wanted = validIds(ids === undefined ? enabledIds() : ids);
  if (!wanted.length) return [];
  let raws;
  try {
    raws = await renderJson(entitiesTemplate(wanted));
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    raws = await statesFallback(wanted);
  }
  return raws.map(toEntity);
}

/** @param {{entity_id?: string}} [params] */
export async function getEntity({ entity_id } = {}) {
  if (!isEntityId(entity_id)) throw new Error("Invalid entity_id");
  try {
    return toEntity(await haRequest(`/api/states/${entity_id}`));
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) throw new Error(`Entity not found: ${entity_id}`);
    throw e;
  }
}

/** @param {{domain?: string, service?: string, entity_id?: string, data?: Record<string, any>}} [params] */
export async function callService({ domain, service, entity_id, data = {} } = {}) {
  if (!isName(domain) || !isName(service)) throw new Error("Invalid service");
  await haRequest(`/api/services/${domain}/${service}`, {
    method: "POST",
    body: { entity_id, ...data },
  });
  return { ok: true };
}

export async function getAreas() {
  const ids = enabledIds();
  if (!ids.length) return [];
  try {
    return await renderJson(areasTemplate(ids));
  } catch (e) {
    // Like getEntities: an HA without /api/template still works, just without areas.
    if (e instanceof HttpError) return [];
    throw e;
  }
}

export function getConfig() {
  const favorites = parseJson(get(SETTING.FAVORITES), []);
  return {
    favorites: Array.isArray(favorites) ? favorites : [],
    sensorMode: get(SETTING.SENSOR_MODE) || "none",
    syncInterval: Number(get(SETTING.SYNC_INTERVAL)) || 5,
    saaNotifyService: get(SETTING.SAA_NOTIFY_SERVICE) || "",
    saaStatusEntity: get(SETTING.SAA_STATUS_ENTITY) || "",
  };
}

export async function getEnergy() {
  const states = await haRequest("/api/states");
  const sensorStates = states.filter((s) => s.entity_id && s.entity_id.startsWith("sensor."));
  const entities = sensorStates.map(toEntity);
  return filterEnergy(entities);
}

export function setEntityVisibility({ entity_id, visible } = {}) {
  if (!entity_id) throw new Error("Missing entity_id");
  const list = readList(get(SETTING.ENTITY_LIST));
  const isVisible = Boolean(visible);
  let found = false;
  const updated = list.map((item) => {
    if (item && item.key === entity_id) {
      found = true;
      return { ...item, value: isVisible };
    }
    return item;
  });
  if (!found) {
    updated.push({ key: entity_id, title: entity_id, value: isVisible, area_id: "", area_name: "" });
  }
  set(SETTING.ENTITY_LIST, JSON.stringify(updated));
  return { ok: true, entity_id, visible: isVisible };
}

function areaMappingTemplate() {
  return (
    '{% set ns = namespace(out=[]) %}{% for a in areas() %}' +
    '{% set ns.out = ns.out + [{"area_id": a, "name": area_name(a), "entities": area_entities(a)}] %}' +
    '{% endfor %}{{ ns.out | tojson }}'
  );
}

const SUPPORTED = new Set(Object.keys(DOMAINS));

// Rebuilds the settings entity list from HA: known entities keep their order and
// enabled flag, new supported entities are appended disabled, vanished ones dropped.
// Areas are fetched from HA and associated to entity items.
export async function refreshEntityList() {
  const states = await haRequest("/api/states");
  const live = new Map();
  for (const s of states) {
    if (SUPPORTED.has(s.entity_id.split(".")[0])) live.set(s.entity_id, s);
  }
  const titleOf = (s) => (s.attributes && s.attributes.friendly_name) || s.entity_id;

  const areaByEntity = new Map();
  try {
    const areas = await renderJson(areaMappingTemplate());
    if (Array.isArray(areas)) {
      for (const a of areas) {
        if (a && a.area_id && Array.isArray(a.entities)) {
          for (const eId of a.entities) {
            areaByEntity.set(eId, { area_id: a.area_id, area_name: a.name || a.area_id });
          }
        }
      }
    }
  } catch (e) {
    // If HA template fails or HA has no /api/template, area mapping stays empty
  }

  const merged = [];
  const seen = new Set();
  for (const item of readList(get(SETTING.ENTITY_LIST))) {
    if (!item || !live.has(item.key) || seen.has(item.key)) continue;
    seen.add(item.key);
    const area = areaByEntity.get(item.key) || {};
    merged.push({
      key: item.key,
      title: titleOf(live.get(item.key)),
      value: item.value === true,
      area_id: area.area_id || item.area_id || "",
      area_name: area.area_name || item.area_name || "",
    });
  }
  for (const [key, s] of live) {
    if (!seen.has(key)) {
      const area = areaByEntity.get(key) || {};
      merged.push({
        key,
        title: titleOf(s),
        value: false,
        area_id: area.area_id || "",
        area_name: area.area_name || "",
      });
    }
  }
  set(SETTING.ENTITY_LIST, JSON.stringify(merged));
  return `${merged.length} entities`;
}
