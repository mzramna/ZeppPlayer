// Pure helpers of the phone settings page (setting/index.js), kept apart so Node can test them.
import { DOMAINS } from "../utils/theme.js";
import { ENTITY_ID, NAME, readList } from "../shared/validate.js";
import { isInteractive, isSensor, energyCategory } from "../utils/groups.js";

export const SETTINGS_TABS = ["access", "favorites", "entities", "areas", "energy"];

export function normalizeTab(tab) {
  return SETTINGS_TABS.includes(tab) ? tab : "access";
}

export const ENTITY_FILTER_TYPES = ["interactive", "sensors", "all"];

export const SENSOR_MODES = ["none", "zepp2hass", "mobile_app", "rest"];
export const SYNC_INTERVALS = [1, 5, 10, 15, 30, 60];

export const isHttpUrl = (s) => /^https?:\/\/\S/.test(s);

// The HA notify service without its "notify." prefix; "" clears it; null when invalid.
export function normalizeNotifyService(raw) {
  const value = String(raw).trim().replace(/^notify\./, "");
  if (value === "") return "";
  return NAME.test(value) ? value : null;
}

// Entity id of the Sleep as Android status; "" clears it; null when invalid.
export function normalizeStatusEntity(raw) {
  const value = String(raw).trim();
  if (value === "") return "";
  return ENTITY_ID.test(value) ? value : null;
}

// Entries of the stored entity list that have a key; the order is kept.
export const readEntities = (text) => readList(text).filter((item) => item && typeof item.key === "string");

// Filter entities by text, type (interactive, sensors, all), and optional favorite constraint.
export function filterEntities(list, { search = "", type = "all", onlyFavorites = false, favorites = [] } = {}) {
  const safeList = Array.isArray(list) ? list : [];
  const query = (search || "").toLowerCase().trim();
  return safeList.filter((item) => {
    if (!item || typeof item.key !== "string") return false;
    const domain = item.key.split(".")[0];
    if (!Object.prototype.hasOwnProperty.call(DOMAINS, domain)) return false;

    if (query) {
      const keyMatch = item.key.toLowerCase().includes(query);
      const titleMatch = item.title && item.title.toLowerCase().includes(query);
      if (!keyMatch && !titleMatch) return false;
    }

    if (type === "interactive" && !isInteractive(item)) return false;
    if (type === "sensors" && !isSensor(item)) return false;

    if (onlyFavorites && !favorites.includes(item.key)) return false;

    return true;
  });
}

// Entities the page lists: a supported domain, and the id contains the search text.
export function visibleEntities(list, filter, type = "all") {
  return filterEntities(list, { search: filter, type });
}

export const setEnabled = (list, key, on) => list.map((item) => (item.key === key ? { ...item, value: on } : item));

// Favourites keep the order they were marked in.
export function setFavorite(favorites, id, on) {
  if (!on) return favorites.filter((f) => f !== id);
  return favorites.includes(id) ? favorites.slice() : [...favorites, id];
}

// Moves the entity with this key to the front; the others keep their order.
export function moveToTop(list, key) {
  const index = list.findIndex((item) => item.key === key);
  if (index <= 0) return list.slice();
  return [list[index], ...list.slice(0, index), ...list.slice(index + 1)];
}

// Moves a favorite entity id up (-1), down (+1), or to the top (0) of the favorites list.
export function moveFavorite(favorites, id, step) {
  const index = favorites.indexOf(id);
  if (index < 0) return favorites.slice();
  if (step === 0) {
    if (index === 0) return favorites.slice();
    return [id, ...favorites.slice(0, index), ...favorites.slice(index + 1)];
  }
  const target = index + step;
  if (target < 0 || target >= favorites.length) return favorites.slice();
  const next = favorites.slice();
  next[index] = next[target];
  next[target] = id;
  return next;
}

export const PAGE_SIZE = 25;

// Slices a list into pages and clamps the page index.
export function paginate(list, page = 0, pageSize = PAGE_SIZE) {
  const safeList = Array.isArray(list) ? list : [];
  const total = safeList.length;
  const size = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.max(0, Math.min(Number(page) || 0, totalPages - 1));
  const start = currentPage * size;
  const items = safeList.slice(start, start + size);
  return { items, page: currentPage, totalPages, total };
}

// Groups entities by their area_id. Unassigned entities are put into 'unassigned' group at the end.
export function groupByArea(entities) {
  const safeList = Array.isArray(entities) ? entities : [];
  const groups = new Map();

  for (const item of safeList) {
    if (!item || typeof item.key !== "string") continue;
    const domain = item.key.split(".")[0];
    if (!Object.prototype.hasOwnProperty.call(DOMAINS, domain)) continue;

    const areaId = (item.area_id || "unassigned").trim();
    const areaName = (item.area_name || (areaId === "unassigned" ? "No Area" : areaId)).trim();

    if (!groups.has(areaId)) {
      groups.set(areaId, {
        area_id: areaId,
        name: areaName,
        entities: [],
      });
    }
    groups.get(areaId).entities.push(item);
  }

  const result = Array.from(groups.values());
  result.sort((a, b) => {
    if (a.area_id === "unassigned") return 1;
    if (b.area_id === "unassigned") return -1;
    return a.name.localeCompare(b.name);
  });
  return result;
}

// Groups sensors by energy categories: electricity, water, gas, other.
export function groupByEnergy(entities) {
  const safeList = Array.isArray(entities) ? entities : [];
  const groups = {
    electricity: [],
    water: [],
    gas: [],
    other: [],
  };

  for (const item of safeList) {
    if (!item || typeof item.key !== "string") continue;
    const cat = energyCategory(item);
    if (cat && groups[cat]) {
      groups[cat].push(item);
    }
  }
  return groups;
}

export const groupByEnergyCategory = groupByEnergy;
