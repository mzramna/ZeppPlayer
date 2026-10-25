import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const jsonPath = join(__dirname, 'data', 'zepp_devices.json');
const rawData = JSON.parse(readFileSync(jsonPath, 'utf8'));

export const STANDARD_MODELS = {
  'amazfit-balance': {
    id: 'amazfit-balance',
    deviceName: 'Amazfit Balance',
    screenWidth: 480,
    screenHeight: 480,
    screenRadius: 240,
    radius: 240,
    screenShape: 'round',
    defaultApi: '3.6.0',
    apiLevel: '3.6.0',
    chipset: 'nxp',
    deviceSource: 8519936
  },
  'amazfit-balance-2': {
    id: 'amazfit-balance-2',
    deviceName: 'Amazfit Balance 2',
    screenWidth: 480,
    screenHeight: 480,
    screenRadius: 240,
    radius: 240,
    screenShape: 'round',
    defaultApi: '4.0.0',
    apiLevel: '4.0.0',
    chipset: 'nxp',
    deviceSource: 8519940
  },
  'amazfit-active': {
    id: 'amazfit-active',
    deviceName: 'Amazfit Active',
    screenWidth: 390,
    screenHeight: 450,
    screenRadius: 86,
    radius: 86,
    screenShape: 'square',
    defaultApi: '3.6.0',
    apiLevel: '3.6.0',
    chipset: 'apollo',
    deviceSource: 8323328
  },
  'amazfit-gtr-4': {
    id: 'amazfit-gtr-4',
    deviceName: 'Amazfit GTR 4',
    screenWidth: 466,
    screenHeight: 466,
    screenRadius: 233,
    radius: 233,
    screenShape: 'round',
    defaultApi: '2.0.0',
    apiLevel: '2.0.0',
    chipset: 'nxp',
    deviceSource: 7930112
  },
  'amazfit-gts-4-mini': {
    id: 'amazfit-gts-4-mini',
    deviceName: 'Amazfit GTS 4 mini',
    screenWidth: 336,
    screenHeight: 384,
    screenRadius: 60,
    radius: 60,
    screenShape: 'square',
    defaultApi: '1.0.0',
    apiLevel: '1.0.0',
    chipset: 'dialog',
    deviceSource: 246
  },
  'amazfit-band-7': {
    id: 'amazfit-band-7',
    deviceName: 'Amazfit Band 7',
    screenWidth: 194,
    screenHeight: 368,
    screenRadius: 97,
    radius: 97,
    screenShape: 'pill',
    defaultApi: '1.0.0',
    apiLevel: '1.0.0',
    chipset: 'dialog',
    deviceSource: 252
  },
  'mi-band-7': {
    id: 'mi-band-7',
    deviceName: 'Mi Band 7',
    screenWidth: 192,
    screenHeight: 490,
    screenRadius: 96,
    radius: 96,
    screenShape: 'pill',
    defaultApi: '1.0.0',
    apiLevel: '1.0.0',
    chipset: 'dialog',
    deviceSource: 260
  }
};

export const DEVICES = {};

function normalizeDevice(raw) {
  const shape = raw.screenShape || (raw.circleScreen ? 'round' : 'square');
  const radius = raw.radius ?? raw.screenRadius ?? (shape === 'round' || shape === 'pill' ? Math.round(raw.screenWidth / 2) : 0);
  const api = raw.defaultApi || raw.apiLevel || raw.osVersion || '1.0.0';

  return {
    id: raw.id,
    deviceName: raw.deviceName,
    screenWidth: raw.screenWidth,
    screenHeight: raw.screenHeight,
    screenShape: shape,
    screenRadius: radius,
    radius: radius,
    circleScreen: shape === 'round',
    defaultApi: api,
    apiLevel: api,
    chipset: raw.chipset || 'unknown',
    deviceSource: Array.isArray(raw.deviceSource) ? raw.deviceSource[0] : (raw.deviceSource || 0),
    hasOverlay: ['mi_band7', 'mi-band-7', 'band7', 'amazfit-band-7', 'gts4', 'gts4mini', 'amazfit-gts-4-mini'].includes(raw.id),
    swapRedAndBlueTGA: !['mi_band7', 'mi-band-7', 'band7', 'amazfit-band-7', 'gts4mini', 'amazfit-gts-4-mini'].includes(raw.id),
    defaultFontSize: (raw.id === 'gts4mini' || raw.id === 'amazfit-gts-4-mini') ? 12 : null,
    enablePropBanList: raw.id === 'mi_band7' || raw.id === 'mi-band-7',
    useAbsolutePathsInHuamiFS: raw.id === 'mi_band7' || raw.id === 'mi-band-7'
  };
}

// Populate from JSON
for (const item of rawData) {
  const norm = normalizeDevice(item);
  DEVICES[item.id] = norm;
  if (Array.isArray(item.alternativeDeviceNames)) {
    for (const alt of item.alternativeDeviceNames) {
      if (!DEVICES[alt]) DEVICES[alt] = norm;
    }
  }
}

// Ensure the 7 standard models are explicitly set
for (const [id, def] of Object.entries(STANDARD_MODELS)) {
  DEVICES[id] = { ...normalizeDevice(def), ...def };
}

// Aliases
DEVICES['balance'] = DEVICES['amazfit-balance'];
DEVICES['balance-2'] = DEVICES['amazfit-balance-2'];
DEVICES['active'] = DEVICES['amazfit-active'];
DEVICES['gtr4'] = DEVICES['amazfit-gtr-4'];
DEVICES['gtr-4'] = DEVICES['amazfit-gtr-4'];
DEVICES['gts4mini'] = DEVICES['amazfit-gts-4-mini'];
DEVICES['gts-4-mini'] = DEVICES['amazfit-gts-4-mini'];
DEVICES['band7'] = DEVICES['amazfit-band-7'];
DEVICES['mi_band7'] = DEVICES['mi-band-7'];
DEVICES['miband7'] = DEVICES['mi-band-7'];

export const DEVICE_LIST = Object.values(STANDARD_MODELS);

export function normalizeKey(str) {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase().replace(/[\s_]+/g, '-').trim();
}

export function getDevice(nameOrId) {
  if (!nameOrId) return DEVICES['amazfit-balance'];
  if (typeof nameOrId === 'object' && nameOrId.screenWidth && nameOrId.screenHeight) {
    return normalizeDevice(nameOrId);
  }

  const key = String(nameOrId).trim();
  if (DEVICES[key]) return DEVICES[key];

  const normKey = normalizeKey(key);
  if (DEVICES[normKey]) return DEVICES[normKey];

  // Try matching deviceName
  for (const dev of Object.values(DEVICES)) {
    if (dev.deviceName && normalizeKey(dev.deviceName) === normKey) {
      return dev;
    }
  }

  // Fallback to default
  return DEVICES['amazfit-balance'];
}

export function getAllDevices() {
  return { ...DEVICES };
}

export function resolveDeviceProfile(deviceInput) {
  return getDevice(deviceInput);
}

export default {
  STANDARD_MODELS,
  DEVICES,
  DEVICE_LIST,
  getDevice,
  getAllDevices,
  resolveDeviceProfile,
  normalizeKey
};
