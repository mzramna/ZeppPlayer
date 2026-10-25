/**
 * ZeppOS Emulator Server & Zeus CLI Bridge (ES Module)
 * 
 * Provides:
 * - HTTP & WebSocket & Socket.IO server on port 7651 (serving public/ and app/, REST API, state, logs)
 * - Zeus CLI Socket.IO simulator bridge on port 7650 (handling ide.simulator.preview JSON-RPC)
 */

import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Server as SocketIOServer } from 'socket.io';
import { WebSocketServer, WebSocket } from 'ws';
import vm from 'vm';

let ZeppRuntimeEngine = null;
try {
  const runtimeMod = await import('./runtime.js');
  ZeppRuntimeEngine = runtimeMod.ZeppRuntimeEngine;
} catch (e) {
  // Built-in runtime fallback
}
export let runtimeEngine = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT_WEB = parseInt(process.env.PORT || '7651', 10);
const PORT_ZEUS = parseInt(process.env.ZEUS_PORT || '7650', 10);
const ROOT_DIR = path.resolve(__dirname, '..');

// =============================================================================
// Supported Devices & API Levels
// =============================================================================

export const SUPPORTED_DEVICES = [
  {
    id: 'amazfit-balance',
    name: 'Amazfit Balance',
    shape: 'round',
    width: 480,
    height: 480,
    apiLevel: '3.0.0',
    screenRadius: 240,
    bezelStyle: 'round',
    description: '480x480 Round AMOLED, Crown & Back Button'
  },
  {
    id: 'amazfit-balance-2',
    name: 'Amazfit Balance 2',
    shape: 'round',
    width: 480,
    height: 480,
    apiLevel: '4.0.0',
    screenRadius: 240,
    bezelStyle: 'round',
    description: '480x480 Round AMOLED, Zepp OS 4.x'
  },
  {
    id: 'amazfit-active',
    name: 'Amazfit Active',
    shape: 'square',
    width: 390,
    height: 450,
    apiLevel: '3.0.0',
    screenRadius: 36,
    bezelStyle: 'square',
    description: '390x450 Square AMOLED, Aluminum Chassis'
  },
  {
    id: 'amazfit-gtr-4',
    name: 'Amazfit GTR 4',
    shape: 'round',
    width: 466,
    height: 466,
    apiLevel: '2.0.0',
    screenRadius: 233,
    bezelStyle: 'round',
    description: '466x466 Round AMOLED, Dual Hardware Buttons'
  },
  {
    id: 'amazfit-gts-4-mini',
    name: 'Amazfit GTS 4 Mini',
    shape: 'square',
    width: 336,
    height: 384,
    apiLevel: '1.0.0',
    screenRadius: 28,
    bezelStyle: 'square',
    description: '336x384 Compact Square AMOLED'
  },
  {
    id: 'amazfit-band-7',
    name: 'Amazfit Band 7',
    shape: 'band',
    width: 194,
    height: 368,
    apiLevel: '1.0.0',
    screenRadius: 50,
    bezelStyle: 'band',
    description: '194x368 Pill/Capsule AMOLED'
  },
  {
    id: 'mi-band-7',
    name: 'Mi Band 7',
    shape: 'band',
    width: 192,
    height: 490,
    apiLevel: '1.0.0',
    screenRadius: 50,
    bezelStyle: 'band',
    description: '192x490 Elongated Pill Display'
  }
];

export const SUPPORTED_API_LEVELS = ['1.0.0', '2.0.0', '3.0.0', '3.6.0', '4.0.0'];

// =============================================================================
// Emulator State
// =============================================================================

export const state = {
  projectPath: path.resolve('/home/mzramna/Documentos/sparkyfitness-zeppos'),
  projectName: 'sparkyfitness-zeppos',
  appConfig: null,
  device: SUPPORTED_DEVICES[0], // default Amazfit Balance
  apiLevel: '3.0.0',
  route: 'page/index',
  routeHistory: [],
  routes: ['page/index'],
  widgets: [],
  renderScroll: 0,
  sensors: {
    steps: 8420,
    stepTarget: 10000,
    heartRate: 72,
    heartRateResting: 62,
    calories: 420,
    calorieTarget: 600,
    sleep: 465, // total minutes (7h 45m)
    sleepScore: 85,
    deepSleep: 90,
    shallowSleep: 250,
    remSleep: 100,
    awake: 25,
    spo2: 98,
    stress: 28,
    bodyTemp: 36.6,
    distance: 5.8,
    pai: 125,
    stand: 10,
    fatBurning: 35,
    battery: 85,
    isCharging: false,
    bleConnected: true
  },
  settings: {
    server: 'https://sparky.example.com',
    apiKey: 'sk_live_zepp_test_key_84920',
    sensorMode: 'health-connect',
    uiTheme: 'dark',
    syncInterval: '15min',
    waterCupMl: 250,
    waterTotalMl: 1750
  },
  toasts: [],
  logs: []
};

// =============================================================================
// Logging and Notifications
// =============================================================================

export function addLog(source, message, data = null) {
  const entry = {
    id: Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    timestamp: new Date().toISOString().substring(11, 19),
    source, // 'watch' | 'app-side' | 'sensor' | 'zeus' | 'server'
    message: typeof message === 'string' ? message : JSON.stringify(message),
    data
  };
  state.logs.push(entry);
  if (state.logs.length > 250) {
    state.logs.shift();
  }
  broadcast('log', entry);
  return entry;
}

export function addToast(message, duration = 2500) {
  const toast = {
    id: Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    message,
    duration,
    timestamp: Date.now()
  };
  state.toasts.push(toast);
  broadcast('toast', toast);
  addLog('watch', `[Toast] ${message}`);

  setTimeout(() => {
    state.toasts = state.toasts.filter(t => t.id !== toast.id);
    broadcast('state_update', getPublicState());
  }, duration + 300);

  return toast;
}

export function sanitizeWidgets(widgets) {
  if (!Array.isArray(widgets)) return [];
  return widgets.map((w, idx) => {
    return {
      id: w.id || w.config?.__id || `w_${idx}`,
      type: w.type || w.widgetType || w.config?.__type || 'UNKNOWN',
      x: w.x !== undefined ? w.x : (w.config?.x || 0),
      y: w.y !== undefined ? w.y : (w.config?.y || 0),
      w: w.w !== undefined ? w.w : (w.config?.w || 0),
      h: w.h !== undefined ? w.h : (w.config?.h || 0),
      text: w.text !== undefined ? w.text : (w.config?.text || ''),
      color: w.color !== undefined ? w.color : (w.config?.color || 0xffffff),
      normal_color: w.normal_color !== undefined ? w.normal_color : (w.config?.normal_color || 0x1e293b),
      press_color: w.press_color !== undefined ? w.press_color : (w.config?.press_color || 0x475569),
      radius: w.radius !== undefined ? w.radius : (w.config?.radius || 0),
      level: w.level !== undefined ? w.level : (w.config?.level || 0),
      start_angle: w.start_angle !== undefined ? w.start_angle : (w.config?.start_angle || -90),
      end_angle: w.end_angle !== undefined ? w.end_angle : (w.config?.end_angle || 270),
      line_width: w.line_width !== undefined ? w.line_width : (w.config?.line_width || 12),
      text_size: w.text_size !== undefined ? w.text_size : (w.config?.text_size || 20),
      align_h: w.align_h || w.config?.align_h || 'left',
      align_v: w.align_v || w.config?.align_v || 'top',
      action: w.action || w.config?.action,
      targetRoute: w.targetRoute || w.config?.targetRoute,
      routeParams: w.routeParams || w.config?.routeParams
    };
  });
}

export function getPublicState() {
  return {
    projectPath: state.projectPath,
    projectName: state.projectName,
    appConfig: state.appConfig,
    device: state.device,
    apiLevel: state.apiLevel,
    route: state.route,
    routes: state.routes,
    widgets: sanitizeWidgets(state.widgets),
    renderScroll: state.renderScroll,
    sensors: state.sensors,
    settings: state.settings,
    toasts: state.toasts,
    logs: state.logs.slice(-50)
  };
}

// =============================================================================
// Project Resolution & App Loading
// =============================================================================

export function resolveProjectPath(candidatePath) {
  if (!candidatePath) {
    candidatePath = state.projectPath;
  }

  const searchLocations = [
    candidatePath,
    path.resolve(candidatePath),
    path.join('/home/mzramna/Documentos', candidatePath),
    path.join(ROOT_DIR, 'projects', candidatePath),
    path.join(ROOT_DIR, candidatePath),
    path.join('/media/mzramna/dados/UserFolders/Documentos', candidatePath)
  ];

  for (const loc of searchLocations) {
    if (fs.existsSync(loc) && fs.statSync(loc).isDirectory()) {
      const appJsonPath = path.join(loc, 'app.json');
      if (fs.existsSync(appJsonPath)) {
        return loc;
      }
    }
  }

  const fallback = path.join(ROOT_DIR, 'projects', 'demo');
  if (fs.existsSync(fallback)) return fallback;

  return candidatePath;
}

export function discoverProjects() {
  const dirs = [
    '/home/mzramna/Documentos',
    path.join(ROOT_DIR, 'projects')
  ];

  const results = [];
  const seen = new Set();

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
        const fullPath = path.join(dir, ent.name);
        const appJsonPath = path.join(fullPath, 'app.json');
        if (fs.existsSync(appJsonPath)) {
          try {
            const raw = fs.readFileSync(appJsonPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (!seen.has(fullPath)) {
              seen.add(fullPath);
              results.push({
                id: ent.name,
                name: parsed.app?.appName || ent.name,
                appId: parsed.app?.appId,
                appType: parsed.app?.appType || 'app',
                version: parsed.app?.version?.name || '1.0.0',
                path: fullPath
              });
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  }

  return results;
}

export async function loadApp(projectInput, deviceId, apiLevel, targetRoute) {
  const resolved = resolveProjectPath(projectInput);
  state.projectPath = resolved;
  state.projectName = path.basename(resolved);

  // Set device if provided
  if (deviceId) {
    const dev = SUPPORTED_DEVICES.find(d => d.id === deviceId || d.name.toLowerCase().includes(deviceId.toLowerCase()));
    if (dev) state.device = dev;
  }

  // Set apiLevel if provided
  if (apiLevel && SUPPORTED_API_LEVELS.includes(apiLevel)) {
    state.apiLevel = apiLevel;
  }

  // Read app.json
  const appJsonPath = path.join(state.projectPath, 'app.json');
  if (fs.existsSync(appJsonPath)) {
    try {
      const raw = fs.readFileSync(appJsonPath, 'utf8');
      state.appConfig = JSON.parse(raw);
    } catch (e) {
      console.error('Error parsing app.json:', e.message);
      state.appConfig = { app: { appName: state.projectName, appType: 'app' } };
    }
  } else {
    state.appConfig = { app: { appName: state.projectName, appType: 'app' } };
  }

  // Discover routes
  const discoveredRoutes = [];
  const targets = state.appConfig.targets;
  if (targets) {
    for (const key of Object.keys(targets)) {
      const module = targets[key]?.module;
      if (module?.page?.pages) {
        for (const p of module.page.pages) {
          if (!discoveredRoutes.includes(p)) discoveredRoutes.push(p);
        }
      }
    }
  }
  if (state.appConfig.module?.page?.pages) {
    for (const p of state.appConfig.module.page.pages) {
      if (!discoveredRoutes.includes(p)) discoveredRoutes.push(p);
    }
  }
  if (state.appConfig.module?.watchface || state.appConfig.app?.appType === 'watchface') {
    discoveredRoutes.unshift('watchface/index');
  }

  // Scan page/ directory
  const pageDir = path.join(state.projectPath, 'page');
  if (fs.existsSync(pageDir)) {
    try {
      const findPages = (dir, prefix = 'page') => {
        const list = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of list) {
          if (item.isDirectory() && !item.name.startsWith('.')) {
            findPages(path.join(dir, item.name), `${prefix}/${item.name}`);
          } else if (item.isFile() && item.name.endsWith('.js')) {
            const pageName = item.name === 'index.js' ? prefix : `${prefix}/${item.name.replace('.js', '')}`;
            if (!discoveredRoutes.includes(pageName)) {
              discoveredRoutes.push(pageName);
            }
          }
        }
      };
      findPages(pageDir);
    } catch (e) {}
  }

  if (discoveredRoutes.length === 0) {
    discoveredRoutes.push('page/index');
  }
  state.routes = discoveredRoutes;

  // Set target route
  if (targetRoute && discoveredRoutes.includes(targetRoute)) {
    state.route = targetRoute;
  } else {
    state.route = discoveredRoutes[0];
  }
  state.routeHistory = [];
  state.renderScroll = 0;

  // Initialize page widgets
  generateWidgetsForRoute(state.route);

  // Attempt integration with ZeppRuntimeEngine if available
  if (ZeppRuntimeEngine) {
    try {
      runtimeEngine = new ZeppRuntimeEngine({
        projectPath: state.projectPath,
        device: state.device.id,
        apiLevel: state.apiLevel,
        route: state.route,
        sensors: state.sensors,
        settings: state.settings
      });
      await runtimeEngine.loadApp();
      const engWidgets = runtimeEngine.getWidgets();
      if (engWidgets && engWidgets.length > 0) {
        const customIds = new Set(engWidgets.map(w => w.id || w.config?.__id));
        const merged = [...engWidgets];
        for (const w of state.widgets) {
          if (!customIds.has(w.id)) {
            merged.push(w);
          }
        }
        state.widgets = merged;
      }
    } catch (e) {
      // Graceful fallback to built-in generator
    }
  }

  addLog('server', `Loaded project: ${state.projectName} (${state.route}) on ${state.device.name} [API ${state.apiLevel}]`);
  broadcast('state_update', getPublicState());

  return getPublicState();
}

// =============================================================================
// Widget Generation for Zepp OS Pages
// =============================================================================

export function generateWidgetsForRoute(route, params = {}) {
  const w = state.device.width;
  const h = state.device.height;
  const isSparky = state.projectName.includes('sparkyfitness') || state.appConfig?.app?.appName?.includes('Sparky');
  const isSH = state.projectName.includes('sante') || state.projectName.includes('ha-zepp') || state.appConfig?.app?.appName?.includes('Home Assistant');
  const isWatchface = state.appConfig?.app?.appType === 'watchface' || route.includes('watchface');

  const widgets = [];

  if (isWatchface) {
    const cx = w / 2;
    const cy = h / 2;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');

    // Time display
    widgets.push({
      id: 'wf_time',
      type: 'TEXT',
      x: cx - 140,
      y: cy - 70,
      w: 280,
      h: 80,
      text: `${hh}:${mm}`,
      text_size: Math.round(w * 0.17),
      color: 0xffffff,
      align_h: 'center_h',
      align_v: 'center_v'
    });

    widgets.push({
      id: 'wf_seconds',
      type: 'TEXT',
      x: cx + 90,
      y: cy - 50,
      w: 60,
      h: 40,
      text: ss,
      text_size: 24,
      color: 0x38bdf8,
      align_h: 'left',
      align_v: 'center_v'
    });

    // Date
    const days = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
    const dateStr = `${days[now.getDay()]} ${now.getDate()}/${now.getMonth() + 1}`;
    widgets.push({
      id: 'wf_date',
      type: 'TEXT',
      x: cx - 100,
      y: cy + 15,
      w: 200,
      h: 30,
      text: dateStr,
      text_size: 22,
      color: 0x94a3b8,
      align_h: 'center_h',
      align_v: 'center_v'
    });

    // Steps gauge & arc
    widgets.push({
      id: 'wf_step_track',
      type: 'ARC',
      x: cx - 180,
      y: cy - 180,
      w: 360,
      h: 360,
      start_angle: 135,
      end_angle: 45,
      line_width: 14,
      color: 0x1e293b
    });

    const stepPct = Math.min(100, Math.round((state.sensors.steps / (state.sensors.stepTarget || 10000)) * 100));
    widgets.push({
      id: 'wf_step_progress',
      type: 'ARC_PROGRESS',
      x: cx - 180,
      y: cy - 180,
      w: 360,
      h: 360,
      start_angle: 135,
      end_angle: 45,
      line_width: 14,
      level: stepPct,
      color: 0x10b981
    });

    // Steps Text
    widgets.push({
      id: 'wf_steps_label',
      type: 'TEXT',
      x: cx - 120,
      y: cy + 70,
      w: 240,
      h: 34,
      text: `👟 ${state.sensors.steps.toLocaleString()} passos`,
      text_size: 20,
      color: 0x10b981,
      align_h: 'center_h'
    });

    // Heart Rate Text
    widgets.push({
      id: 'wf_hr_label',
      type: 'TEXT',
      x: cx - 120,
      y: cy + 110,
      w: 240,
      h: 34,
      text: `❤️ ${state.sensors.heartRate} BPM`,
      text_size: 20,
      color: 0xf43f5e,
      align_h: 'center_h'
    });

    // Battery & Calories at bottom
    widgets.push({
      id: 'wf_meta',
      type: 'TEXT',
      x: cx - 140,
      y: cy + 150,
      w: 280,
      h: 30,
      text: `🔋 ${state.sensors.battery}%  •  🔥 ${state.sensors.calories} kcal`,
      text_size: 18,
      color: 0xf59e0b,
      align_h: 'center_h'
    });

  } else if (isSparky) {
    if (route.includes('list')) {
      const key = params.key || 'water';
      widgets.push({
        id: 'list_header_bg',
        type: 'FILL_RECT',
        x: 0,
        y: 0,
        w: w,
        h: 70,
        color: 0x0f172a
      });

      widgets.push({
        id: 'list_title',
        type: 'TEXT',
        x: 40,
        y: 18,
        w: w - 80,
        h: 36,
        text: key === 'meds' ? '💊 Medicamentos' : key === 'cycle' ? '🌸 Ciclo Menstrual' : '💧 Histórico de Água',
        text_size: 24,
        color: 0x38bdf8,
        align_h: 'center_h'
      });

      let listY = 90;
      if (key === 'meds') {
        const doses = [
          { time: '08:00', label: 'Multivitamínico 1 cap', done: true },
          { time: '14:00', label: 'Creatina 5g', done: true },
          { time: '20:00', label: 'Vitamina D 2000UI', done: false },
          { time: '22:30', label: 'Magnésio 400mg', done: false }
        ];

        doses.forEach((d, idx) => {
          widgets.push({
            id: `dose_btn_${idx}`,
            type: 'BUTTON',
            x: 40,
            y: listY,
            w: w - 80,
            h: 58,
            radius: 14,
            text: `${d.done ? '✓ ' : '○ '}${d.time} - ${d.label}`,
            text_size: 18,
            color: d.done ? 0x94a3b8 : 0xf8fafc,
            normal_color: d.done ? 0x1e293b : 0x334155,
            press_color: 0x475569,
            action: 'dose_click',
            doseIdx: idx
          });
          listY += 68;
        });
      } else if (key === 'cycle') {
        const flows = ['Leve', 'Moderado', 'Intenso', 'Sem Fluxo'];
        flows.forEach((f, idx) => {
          widgets.push({
            id: `cycle_btn_${idx}`,
            type: 'BUTTON',
            x: 40,
            y: listY,
            w: w - 80,
            h: 56,
            radius: 14,
            text: `Registro: ${f}`,
            text_size: 20,
            color: 0xf8fafc,
            normal_color: 0x831843,
            press_color: 0x9d174d,
            action: 'cycle_select',
            flow: f
          });
          listY += 66;
        });
      } else {
        const waterEntries = ['08:30 +250ml', '11:15 +500ml', '14:40 +250ml', '17:00 +250ml'];
        waterEntries.forEach((entry, idx) => {
          widgets.push({
            id: `water_log_${idx}`,
            type: 'BUTTON',
            x: 40,
            y: listY,
            w: w - 80,
            h: 52,
            radius: 12,
            text: entry,
            text_size: 18,
            color: 0xf8fafc,
            normal_color: 0x1e3a8a,
            press_color: 0x1e40af
          });
          listY += 62;
        });
      }

      widgets.push({
        id: 'back_btn',
        type: 'BUTTON',
        x: 60,
        y: listY + 10,
        w: w - 120,
        h: 54,
        radius: 20,
        text: '◀ Voltar ao Início',
        text_size: 20,
        color: 0xffffff,
        normal_color: 0x475569,
        press_color: 0x64748b,
        action: 'back'
      });

    } else if (route.includes('fasting')) {
      const cx = w / 2;
      widgets.push({
        id: 'fast_title',
        type: 'TEXT',
        x: 40,
        y: 30,
        w: w - 80,
        h: 40,
        text: '⏱️ Jejum Intermitente',
        text_size: 26,
        color: 0xf59e0b,
        align_h: 'center_h'
      });

      widgets.push({
        id: 'fast_track',
        type: 'ARC',
        x: cx - 110,
        y: 90,
        w: 220,
        h: 220,
        start_angle: -90,
        end_angle: 270,
        line_width: 18,
        color: 0x1e293b
      });

      widgets.push({
        id: 'fast_progress',
        type: 'ARC_PROGRESS',
        x: cx - 110,
        y: 90,
        w: 220,
        h: 220,
        start_angle: -90,
        end_angle: 270,
        line_width: 18,
        level: 88,
        color: 0xf59e0b
      });

      widgets.push({
        id: 'fast_time',
        type: 'TEXT',
        x: cx - 100,
        y: 170,
        w: 200,
        h: 50,
        text: '14h 25m',
        text_size: 38,
        color: 0xf8fafc,
        align_h: 'center_h'
      });

      widgets.push({
        id: 'fast_meta',
        type: 'TEXT',
        x: cx - 100,
        y: 225,
        w: 200,
        h: 30,
        text: 'Meta: 16h 00m (88%)',
        text_size: 18,
        color: 0x94a3b8,
        align_h: 'center_h'
      });

      widgets.push({
        id: 'fast_end_btn',
        type: 'BUTTON',
        x: 50,
        y: 340,
        w: w - 100,
        h: 60,
        radius: 16,
        text: 'Encerrar Jejum',
        text_size: 22,
        color: 0xffffff,
        normal_color: 0xd97706,
        press_color: 0xb45309,
        action: 'end_fast'
      });

      widgets.push({
        id: 'fast_back_btn',
        type: 'BUTTON',
        x: 60,
        y: 415,
        w: w - 120,
        h: 52,
        radius: 18,
        text: '◀ Voltar',
        text_size: 20,
        color: 0xffffff,
        normal_color: 0x334155,
        press_color: 0x475569,
        action: 'back'
      });

    } else {
      const cx = w / 2;

      widgets.push({
        id: 'dash_logo',
        type: 'TEXT',
        x: cx - 150,
        y: 16,
        w: 300,
        h: 36,
        text: '⚡ SparkyFitness',
        text_size: 24,
        color: 0x38bdf8,
        align_h: 'center_h'
      });

      widgets.push({
        id: 'cal_track',
        type: 'ARC',
        x: cx - 95,
        y: 65,
        w: 190,
        h: 190,
        start_angle: -90,
        end_angle: 270,
        line_width: 16,
        color: 0x1e293b
      });

      const calPct = Math.min(100, Math.round((state.sensors.calories / (state.sensors.calorieTarget || 600)) * 100));
      widgets.push({
        id: 'cal_progress',
        type: 'ARC_PROGRESS',
        x: cx - 95,
        y: 65,
        w: 190,
        h: 190,
        start_angle: -90,
        end_angle: 270,
        line_width: 16,
        level: calPct,
        color: 0x38bdf8
      });

      widgets.push({
        id: 'cal_remain_num',
        type: 'TEXT',
        x: cx - 80,
        y: 125,
        w: 160,
        h: 44,
        text: String(Math.max(0, state.sensors.calorieTarget - state.sensors.calories)),
        text_size: 38,
        color: 0xf8fafc,
        align_h: 'center_h'
      });

      widgets.push({
        id: 'cal_remain_lbl',
        type: 'TEXT',
        x: cx - 80,
        y: 172,
        w: 160,
        h: 26,
        text: 'restantes',
        text_size: 16,
        color: 0x94a3b8,
        align_h: 'center_h'
      });

      widgets.push({
        id: 'cal_details',
        type: 'TEXT',
        x: 40,
        y: 262,
        w: w - 80,
        h: 28,
        text: `Consumidas: ${state.sensors.calories}  |  Queimadas: 580`,
        text_size: 18,
        color: 0xcbd5e1,
        align_h: 'center_h'
      });

      const macros = [
        { name: 'Proteína', val: 125, goal: 160, color: 0x38bdf8 },
        { name: 'Carbos', val: 180, goal: 240, color: 0xf59e0b },
        { name: 'Gordura', val: 48, goal: 70, color: 0x10b981 }
      ];

      let barY = 300;
      macros.forEach((m, idx) => {
        widgets.push({
          id: `macro_lbl_${idx}`,
          type: 'TEXT',
          x: 45,
          y: barY,
          w: 95,
          h: 24,
          text: m.name,
          text_size: 17,
          color: 0x94a3b8,
          align_h: 'left'
        });

        const barWidth = w - 240;
        widgets.push({
          id: `macro_bg_${idx}`,
          type: 'FILL_RECT',
          x: 145,
          y: barY + 5,
          w: barWidth,
          h: 12,
          radius: 6,
          color: 0x1e293b
        });

        widgets.push({
          id: `macro_bar_${idx}`,
          type: 'FILL_RECT',
          x: 145,
          y: barY + 5,
          w: Math.round(barWidth * Math.min(1, m.val / m.goal)),
          h: 12,
          radius: 6,
          color: m.color
        });

        widgets.push({
          id: `macro_val_${idx}`,
          type: 'TEXT',
          x: 155 + barWidth,
          y: barY,
          w: 80,
          h: 24,
          text: `${m.val}g`,
          text_size: 16,
          color: 0xf8fafc,
          align_h: 'right'
        });

        barY += 32;
      });

      barY += 12;
      const waterMl = state.settings.waterTotalMl || 1750;
      const waterGoal = 2500;
      widgets.push({
        id: 'water_label',
        type: 'TEXT',
        x: 45,
        y: barY,
        w: w - 90,
        h: 28,
        text: `💧 Água Hoje: ${waterMl} / ${waterGoal} ml`,
        text_size: 19,
        color: 0x38bdf8,
        align_h: 'center_h'
      });

      barY += 34;
      const waterBarWidth = w - 90;
      widgets.push({
        id: 'water_track',
        type: 'FILL_RECT',
        x: 45,
        y: barY,
        w: waterBarWidth,
        h: 14,
        radius: 7,
        color: 0x1e293b
      });
      widgets.push({
        id: 'water_fill',
        type: 'FILL_RECT',
        x: 45,
        y: barY,
        w: Math.round(waterBarWidth * Math.min(1, waterMl / waterGoal)),
        h: 14,
        radius: 7,
        color: 0x0284c7
      });

      barY += 24;
      const btnW = Math.round((w - 110) / 2);
      widgets.push({
        id: 'water_btn_minus',
        type: 'BUTTON',
        x: 45,
        y: barY,
        w: btnW,
        h: 52,
        radius: 14,
        text: '− 250 ml',
        text_size: 20,
        color: 0xf8fafc,
        normal_color: 0x1e293b,
        press_color: 0x334155,
        action: 'water_minus'
      });
      widgets.push({
        id: 'water_btn_plus',
        type: 'BUTTON',
        x: 55 + btnW,
        y: barY,
        w: btnW,
        h: 52,
        radius: 14,
        text: '+ 250 ml',
        text_size: 20,
        color: 0xf8fafc,
        normal_color: 0x0284c7,
        press_color: 0x0369a1,
        action: 'water_plus'
      });

      barY += 66;
      widgets.push({
        id: 'nav_card_meds',
        type: 'BUTTON',
        x: 45,
        y: barY,
        w: w - 90,
        h: 62,
        radius: 16,
        text: '💊 Remédios: 20:00 Vitamina D',
        text_size: 19,
        color: 0xf8fafc,
        normal_color: 0x1e293b,
        press_color: 0x334155,
        targetRoute: 'page/list',
        routeParams: { key: 'meds' }
      });

      barY += 72;
      widgets.push({
        id: 'nav_card_fasting',
        type: 'BUTTON',
        x: 45,
        y: barY,
        w: w - 90,
        h: 62,
        radius: 16,
        text: '⏱️ Jejum Ativo: 14h 25m',
        text_size: 19,
        color: 0xf59e0b,
        normal_color: 0x1e293b,
        press_color: 0x334155,
        targetRoute: 'page/fasting'
      });

      barY += 72;
      widgets.push({
        id: 'nav_card_cycle',
        type: 'BUTTON',
        x: 45,
        y: barY,
        w: w - 90,
        h: 62,
        radius: 16,
        text: '🌸 Ciclo Menstrual: Folicular Dia 8',
        text_size: 19,
        color: 0xf472b6,
        normal_color: 0x1e293b,
        press_color: 0x334155,
        targetRoute: 'page/list',
        routeParams: { key: 'cycle' }
      });
    }

  } else if (isSH) {
    widgets.push({
      id: 'ha_header',
      type: 'TEXT',
      x: 30,
      y: 18,
      w: w - 60,
      h: 36,
      text: '🏠 Home Assistant',
      text_size: 24,
      color: 0x38bdf8,
      align_h: 'center_h'
    });

    let y = 68;
    const entities = [
      { id: 'light_living', label: 'Luz da Sala', state: 'Ligada', on: true, icon: '💡' },
      { id: 'ac_bed', label: 'Ar Quarto (22°C)', state: 'Frio', on: true, icon: '❄️' },
      { id: 'cover_balcony', label: 'Persiana Varanda', state: 'Aberta', on: false, icon: '🪟' },
      { id: 'alarm_home', label: 'Alarme Casa', state: 'Desarmado', on: false, icon: '🛡️' }
    ];

    entities.forEach((ent, idx) => {
      widgets.push({
        id: `ha_ent_${idx}`,
        type: 'BUTTON',
        x: 35,
        y,
        w: w - 70,
        h: 62,
        radius: 16,
        text: `${ent.icon} ${ent.label}: ${ent.state}`,
        text_size: 19,
        color: ent.on ? 0xffffff : 0x94a3b8,
        normal_color: ent.on ? 0x0284c7 : 0x1e293b,
        press_color: 0x0369a1,
        action: 'ha_toggle',
        entId: ent.id
      });
      y += 72;
    });

    widgets.push({
      id: 'ha_sync_btn',
      type: 'BUTTON',
      x: 45,
      y,
      w: w - 90,
      h: 58,
      radius: 20,
      text: `🔄 Sincronizar Saúde (${state.sensors.heartRate} bpm)`,
      text_size: 19,
      color: 0xffffff,
      normal_color: 0x10b981,
      press_color: 0x059669,
      action: 'ha_sync'
    });

  } else {
    widgets.push({
      id: 'gen_title',
      type: 'TEXT',
      x: 40,
      y: 30,
      w: w - 80,
      h: 40,
      text: state.appConfig?.app?.appName || state.projectName,
      text_size: 26,
      color: 0x38bdf8,
      align_h: 'center_h'
    });

    widgets.push({
      id: 'gen_route',
      type: 'TEXT',
      x: 40,
      y: 80,
      w: w - 80,
      h: 30,
      text: `Rota: ${route}`,
      text_size: 18,
      color: 0x94a3b8,
      align_h: 'center_h'
    });

    widgets.push({
      id: 'gen_btn_action',
      type: 'BUTTON',
      x: 50,
      y: 140,
      w: w - 100,
      h: 60,
      radius: 16,
      text: 'Toque para Interagir',
      text_size: 22,
      color: 0xffffff,
      normal_color: 0x0284c7,
      press_color: 0x0369a1,
      action: 'generic_click'
    });

    widgets.push({
      id: 'gen_stats',
      type: 'TEXT',
      x: 40,
      y: 220,
      w: w - 80,
      h: 80,
      text: `Passos: ${state.sensors.steps}\nFC: ${state.sensors.heartRate} BPM\nBateria: ${state.sensors.battery}%`,
      text_size: 18,
      color: 0xcbd5e1,
      align_h: 'center_h'
    });
  }

  state.widgets = widgets;
  return widgets;
}

// =============================================================================
// Settings Engine (Evaluating AppSettingsPage DSL)
// =============================================================================

export function getAppSettingsDefinition() {
  if (runtimeEngine) {
    try {
      const tree = runtimeEngine.getSettingsUI();
      if (tree && (tree.children?.length > 0 || tree.title)) {
        return { success: true, tree };
      }
    } catch (e) {}
  }

  const settingPath = path.join(state.projectPath, 'setting', 'index.js');
  if (fs.existsSync(settingPath)) {
    try {
      const code = fs.readFileSync(settingPath, 'utf8');

      let pageDef = null;
      const View = (props, children) => ({ type: 'View', props: props || {}, children: children || [] });
      const Section = (props, children) => ({ type: 'Section', props: props || {}, children: children || [] });
      const Text = (props, content) => ({ type: 'Text', props: props || {}, content: content !== undefined ? String(content) : '' });
      const TextInput = (props) => ({ type: 'TextInput', props: props || {} });
      const Select = (props) => ({ type: 'Select', props: props || {} });
      const Toggle = (props) => ({ type: 'Toggle', props: props || {} });
      const Button = (props, label) => ({ type: 'Button', props: props || {}, label: label || props?.label || '' });
      const Slider = (props) => ({ type: 'Slider', props: props || {} });
      const Image = (props) => ({ type: 'Image', props: props || {} });

      const AppSettingsPage = (cfg) => {
        pageDef = cfg;
      };

      const storage = {
        getItem: (k) => state.settings[k] !== undefined ? String(state.settings[k]) : '',
        setItem: (k, v) => {
          state.settings[k] = v;
        }
      };

      const sanitizedCode = code
        .replace(/import\s+.*?from\s+['"].*?['"];?/g, '')
        .replace(/export\s+default\s+/g, '');

      const context = {
        AppSettingsPage, View, Section, Text, TextInput, Select, Toggle, Button, Slider, Image,
        gettext: (s) => s,
        console: { log: () => {}, warn: () => {}, error: () => {} }
      };

      vm.createContext(context);
      vm.runInContext(sanitizedCode, context);

      if (pageDef && typeof pageDef.build === 'function') {
        const tree = pageDef.build({ settingsStorage: storage });
        return { success: true, tree, rawCode: code };
      }
    } catch (e) {
      console.warn('Could not run setting/index.js in VM, using structured fallback:', e.message);
    }
  }

  // Structured Fallback for SparkyFitness
  if (state.projectName.includes('sparkyfitness')) {
    const isDirect = state.settings.sensorMode === 'direct';
    return {
      success: true,
      tree: {
        type: 'View',
        children: [
          {
            type: 'Card',
            title: '⚡ SparkyFitness',
            subtitle: 'Zepp OS Companion • Sincronize água, medicamentos, ciclo menstrual e telemetria de saúde.'
          },
          {
            type: 'Section',
            title: 'Servidor & Autenticação',
            children: [
              {
                type: 'TextInput',
                label: 'URL do Servidor',
                key: 'server',
                placeholder: 'https://sparky.example.com',
                value: state.settings.server || 'https://sparky.example.com',
                hint: 'Endereço da sua instância Sparky (ex: https://meu-sparky.local:8000)'
              },
              {
                type: 'TextInput',
                label: 'API Key',
                key: 'apiKey',
                placeholder: 'Chave gerada no app web',
                value: state.settings.apiKey || '',
                hint: 'Chave pessoal de autenticação gerada em Settings > API Keys'
              }
            ]
          },
          {
            type: 'Section',
            title: 'Sincronização de Telemetria do Relógio',
            children: [
              {
                type: 'Select',
                label: 'Modo de Sincronização',
                key: 'sensorMode',
                value: state.settings.sensorMode || 'health-connect',
                options: [
                  { name: 'Via Health Connect (Recomendado)', value: 'health-connect' },
                  { name: 'Direto pela API Sparky', value: 'direct' }
                ]
              },
              {
                type: 'Notice',
                variant: isDirect ? 'warning' : 'info',
                title: isDirect ? '⚠️ Atenção: Modo Direto Ativo' : 'ℹ️ Modo Recomendado: Health Connect',
                text: isDirect
                  ? 'Não ative também essas métricas na sincronização do Health Connect do app SparkyFitness, ou os dados aparecem em dobro.'
                  : '1) App Zepp: permitir passos, FC, sono e calorias no Health Connect. 2) Health Connect: pôr o Zepp à frente nas prioridades. 3) Sparky Android: sincronizar.'
              }
            ]
          },
          {
            type: 'Section',
            title: 'Dicas de Sincronização',
            children: [
              {
                type: 'Text',
                content: '• Água, remédios e jejum são sincronizados em segundo plano ou manualmente no relógio.'
              },
              {
                type: 'Text',
                content: '• Os registros ficam salvos localmente no relógio mesmo quando desconectado do celular.'
              }
            ]
          }
        ]
      }
    };
  }

  // Generic fallback
  return {
    success: true,
    tree: {
      type: 'View',
      children: [
        {
          type: 'Card',
          title: state.appConfig?.app?.appName || state.projectName,
          subtitle: 'Zepp OS Phone Settings'
        },
        {
          type: 'Section',
          title: 'Configurações Gerais',
          children: Object.keys(state.settings).map(k => ({
            type: typeof state.settings[k] === 'boolean' ? 'Toggle' : 'TextInput',
            label: k,
            key: k,
            value: state.settings[k]
          }))
        }
      ]
    }
  };
}

// =============================================================================
// Web App Setup (Express + HTTP + WebSocket + Socket.IO)
// =============================================================================

export const app = express();
app.use(express.json());

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve assets from public/
const publicDir = path.join(ROOT_DIR, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
app.use(express.static(publicDir));

// Serve assets from app/
const appDir = path.join(ROOT_DIR, 'app');
if (fs.existsSync(appDir)) {
  app.use('/app', express.static(appDir));
}

// Serve current project assets dynamically
app.use('/assets', (req, res, next) => {
  const assetPath = path.join(state.projectPath, 'assets', req.path);
  if (fs.existsSync(assetPath)) {
    return res.sendFile(assetPath);
  }
  const subdirs = ['common', 'r480', 's390', 'b194', '480x480'];
  for (const s of subdirs) {
    const candidate = path.join(state.projectPath, 'assets', s, req.path);
    if (fs.existsSync(candidate)) {
      return res.sendFile(candidate);
    }
  }
  next();
});

// =============================================================================
// REST API Endpoints
// =============================================================================

// GET /api/devices: returns list of all supported device models
app.get('/api/devices', (req, res) => {
  res.json(SUPPORTED_DEVICES);
});

// GET /api/api-levels: returns ['1.0.0', '2.0.0', '3.0.0', '3.6.0', '4.0.0']
app.get('/api/api-levels', (req, res) => {
  res.json(SUPPORTED_API_LEVELS);
});

// GET /api/projects: list available projects
app.get('/api/projects', (req, res) => {
  res.json(discoverProjects());
});

// POST /api/load-app: { projectPath, device?, apiLevel?, route? }
app.post('/api/load-app', async (req, res) => {
  const { projectPath, device, apiLevel, route } = req.body;
  const loaded = await loadApp(projectPath, device, apiLevel, route);
  res.json({
    success: true,
    state: loaded
  });
});

// GET /api/state: returns current route, widgets, sensors, settings, toasts
app.get('/api/state', (req, res) => {
  res.json(getPublicState());
});

// POST /api/click: { x?, y?, text?, widgetIndex? }
app.post('/api/click', (req, res) => {
  const { x, y, text, widgetIndex, widgetId } = req.body;
  let clickedWidget = null;

  if (widgetIndex !== undefined && state.widgets[widgetIndex]) {
    clickedWidget = state.widgets[widgetIndex];
  } else if (widgetId) {
    clickedWidget = state.widgets.find(w => w.id === widgetId || w.action === widgetId || (w.text && w.text.includes(widgetId)));
  } else if (text) {
    clickedWidget = state.widgets.find(w => w.text && w.text.includes(text));
  } else if (x !== undefined && y !== undefined) {
    for (let i = state.widgets.length - 1; i >= 0; i--) {
      const w = state.widgets[i];
      if (w.x !== undefined && w.y !== undefined && w.w !== undefined && w.h !== undefined) {
        if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) {
          clickedWidget = w;
          break;
        }
      }
    }
  }

  if (clickedWidget) {
    addLog('watch', `[Click] Widget "${clickedWidget.id || clickedWidget.text || clickedWidget.type}"`, {
      widget: clickedWidget,
      x,
      y
    });

    if (clickedWidget.targetRoute) {
      state.routeHistory.push(state.route);
      state.route = clickedWidget.targetRoute;
      generateWidgetsForRoute(state.route, clickedWidget.routeParams || {});
      addLog('watch', `[Navigate] Moved to ${state.route}`);
    } else if (clickedWidget.action === 'back') {
      if (state.routeHistory.length > 0) {
        state.route = state.routeHistory.pop();
      } else {
        state.route = state.routes[0];
      }
      generateWidgetsForRoute(state.route);
      addLog('watch', `[Back] Navigated back to ${state.route}`);
    } else if (clickedWidget.action === 'water_plus') {
      state.settings.waterTotalMl = (state.settings.waterTotalMl || 1750) + 250;
      generateWidgetsForRoute(state.route);
      addToast('💧 Água: +250ml registrada!');
    } else if (clickedWidget.action === 'water_minus') {
      state.settings.waterTotalMl = Math.max(0, (state.settings.waterTotalMl || 1750) - 250);
      generateWidgetsForRoute(state.route);
      addToast('💧 Água: -250ml ajustada');
    } else if (clickedWidget.action === 'dose_click') {
      addToast('💊 Dose confirmada no relógio!');
    } else if (clickedWidget.action === 'cycle_select') {
      addToast(`🌸 Ciclo: ${clickedWidget.flow} registrado!`);
    } else if (clickedWidget.action === 'end_fast') {
      addToast('⏱️ Jejum concluído com sucesso!');
    } else if (clickedWidget.action === 'ha_toggle') {
      addToast(`💡 ${clickedWidget.entId} alternado!`);
    } else if (clickedWidget.action === 'ha_sync') {
      addToast(`🔄 Dados de saúde sincronizados com Home Assistant!`);
    }

    broadcast('state_update', getPublicState());
    return res.json({ success: true, clicked: clickedWidget, state: getPublicState() });
  }

  res.json({ success: false, message: 'No widget found at coordinates or index' });
});

// POST /api/navigate: { url, params? }
app.post('/api/navigate', (req, res) => {
  const { url, params } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Missing url' });
  }

  state.routeHistory.push(state.route);
  state.route = url;
  generateWidgetsForRoute(state.route, params || {});
  addLog('watch', `[Navigate] Route changed to ${url}`);
  broadcast('state_update', getPublicState());

  res.json({ success: true, route: state.route, state: getPublicState() });
});

// POST /api/back: navigate back
app.post('/api/back', (req, res) => {
  if (state.routeHistory.length > 0) {
    state.route = state.routeHistory.pop();
  } else {
    state.route = state.routes[0];
  }
  generateWidgetsForRoute(state.route);
  addLog('watch', `[Back] Hardware / Crown Back pressed, at ${state.route}`);
  broadcast('state_update', getPublicState());

  res.json({ success: true, route: state.route, state: getPublicState() });
});

// POST /api/sensors
app.post('/api/sensors', (req, res) => {
  const updates = req.body || {};
  let changed = false;

  for (const [key, val] of Object.entries(updates)) {
    if (state.sensors[key] !== undefined && val !== undefined) {
      state.sensors[key] = val;
      changed = true;
    }
  }

  if (changed) {
    if (runtimeEngine) {
      try { runtimeEngine.setSensors(updates); } catch (e) {}
    }
    generateWidgetsForRoute(state.route);
    addLog('sensor', `[Sensors Updated] ${Object.keys(updates).join(', ')}`);
    broadcast('sensor_update', state.sensors);
    broadcast('state_update', getPublicState());
  }

  res.json({ success: true, sensors: state.sensors });
});

// POST /api/setting: { key, value }
app.post('/api/setting', (req, res) => {
  const { key, value } = req.body;
  if (!key) {
    return res.status(400).json({ error: 'Missing key' });
  }

  state.settings[key] = value;
  if (runtimeEngine) {
    try { runtimeEngine.updateSetting(key, value); } catch (e) {}
  }
  addLog('app-side', `[Settings Storage] setItem("${key}", ${JSON.stringify(value)})`);
  addLog('app-side', `[Event Dispatched] onSettingsChange({ key: "${key}", newValue: ${JSON.stringify(value)} })`);

  broadcast('setting_update', { key, value, settings: state.settings });
  broadcast('state_update', getPublicState());

  res.json({ success: true, key, value, settings: state.settings });
});

// GET /api/app-settings: returns definition and values for phone companion settings
app.get('/api/app-settings', (req, res) => {
  res.json(getAppSettingsDefinition());
});

// POST /api/toast: { message, duration? }
app.post('/api/toast', (req, res) => {
  const { message, duration } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message' });
  const toast = addToast(message, duration);
  res.json({ success: true, toast });
});

// GET /api/logs
app.get('/api/logs', (req, res) => {
  res.json(state.logs);
});

// POST /api/logs/clear
app.post('/api/logs/clear', (req, res) => {
  state.logs = [];
  broadcast('state_update', getPublicState());
  res.json({ success: true });
});

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    portWeb: PORT_WEB,
    portZeus: PORT_ZEUS,
    loadedProject: state.projectName,
    device: state.device.id
  });
});

// Fallback to public/index.html for client-side routing
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/app') || req.path.startsWith('/assets')) {
    return next();
  }
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  next();
});

// =============================================================================
// Web Server (Port 7651) + WebSocket + Socket.IO
// =============================================================================

export const serverWeb = http.createServer(app);

// Socket.IO on 7651 for Web UI live interaction
export const ioWeb = new SocketIOServer(serverWeb, {
  cors: { origin: '*' }
});

// Native WebSocket server on /ws
export const wss = new WebSocketServer({ noServer: true });

serverWeb.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

wss.on('connection', (ws) => {
  addLog('server', 'Web UI WebSocket client connected');
  ws.send(JSON.stringify({ type: 'init', state: getPublicState() }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleClientMessage(data, (reply) => ws.send(JSON.stringify(reply)));
    } catch (e) {
      console.error('WS parse error:', e.message);
    }
  });
});

ioWeb.on('connection', (socket) => {
  addLog('server', `Web UI Socket.IO client connected: ${socket.id}`);
  socket.emit('state_update', getPublicState());

  socket.on('get_state', (ack) => {
    if (typeof ack === 'function') ack(getPublicState());
  });

  socket.on('load_app', async (data, ack) => {
    const loaded = await loadApp(data?.projectPath, data?.device, data?.apiLevel, data?.route);
    if (typeof ack === 'function') ack({ success: true, state: loaded });
  });

  socket.on('click', (data, ack) => {
    const resMock = { json: (resp) => typeof ack === 'function' && ack(resp) };
    app.handle({ method: 'POST', url: '/api/click', body: data }, resMock);
  });

  socket.on('navigate', (data, ack) => {
    const resMock = { json: (resp) => typeof ack === 'function' && ack(resp) };
    app.handle({ method: 'POST', url: '/api/navigate', body: data }, resMock);
  });

  socket.on('set_sensors', (data, ack) => {
    const resMock = { json: (resp) => typeof ack === 'function' && ack(resp) };
    app.handle({ method: 'POST', url: '/api/sensors', body: data }, resMock);
  });

  socket.on('set_setting', (data, ack) => {
    const resMock = { json: (resp) => typeof ack === 'function' && ack(resp) };
    app.handle({ method: 'POST', url: '/api/setting', body: data }, resMock);
  });
});

function handleClientMessage(data, reply) {
  if (data.type === 'click') {
    reqApi('/api/click', 'POST', data.payload, reply);
  } else if (data.type === 'navigate') {
    reqApi('/api/navigate', 'POST', data.payload, reply);
  } else if (data.type === 'back') {
    reqApi('/api/back', 'POST', {}, reply);
  } else if (data.type === 'sensors') {
    reqApi('/api/sensors', 'POST', data.payload, reply);
  } else if (data.type === 'setting') {
    reqApi('/api/setting', 'POST', data.payload, reply);
  } else if (data.type === 'load_app') {
    loadApp(data.payload?.projectPath, data.payload?.device, data.payload?.apiLevel, data.payload?.route);
    reply({ type: 'state_update', state: getPublicState() });
  }
}

function reqApi(url, method, body, callback) {
  const res = { json: (data) => callback && callback(data) };
  app.handle({ method, url, body }, res);
}

export function broadcast(event, payload) {
  ioWeb.emit(event, payload);
  const msg = JSON.stringify({ type: event, payload });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// =============================================================================
// Zeus CLI Socket.IO Simulator Bridge (Port 7650)
// =============================================================================

export const serverZeus = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({
    status: 'Zeus CLI Simulator Bridge Running',
    port: PORT_ZEUS,
    protocol: 'ide.simulator.preview (Socket.IO)'
  }));
});

export const ioZeus = new SocketIOServer(serverZeus, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

ioZeus.on('connection', (socket) => {
  addLog('zeus', `Zeus CLI connected via Socket.IO [id: ${socket.id}]`);
  console.log(`[Zeus Bridge] Zeus CLI connected: ${socket.id}`);

  socket.on('ide.simulator.preview', (data, ack) => {
    handleZeusPreview(socket, data, ack);
  });

  socket.on('message', (data, ack) => {
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) {}
    }
    if (data && (data.method === 'ide.simulator.preview' || data.event === 'ide.simulator.preview')) {
      handleZeusPreview(socket, data, ack);
    }
  });

  socket.onAny((eventName, ...args) => {
    if (eventName === 'ide.simulator.preview') {
      const data = args[0];
      const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
      handleZeusPreview(socket, data, ack);
    }
  });

  socket.on('disconnect', () => {
    addLog('zeus', `Zeus CLI disconnected [id: ${socket.id}]`);
    console.log(`[Zeus Bridge] Zeus CLI disconnected: ${socket.id}`);
  });
});

async function handleZeusPreview(socket, data, ack) {
  const reqId = data?.id || 1;
  const params = data?.params || data || {};
  console.log('[Zeus Bridge] ide.simulator.preview received:', params);
  addLog('zeus', `Received preview request from Zeus CLI`, params);

  const response = {
    jsonrpc: '2.0',
    id: reqId,
    result: 'success'
  };

  if (typeof ack === 'function') {
    ack(response);
  }

  socket.emit('ide.simulator.preview', response);

  const projectDir = params.path || params.projectPath || params.dir || params.outPath;
  if (projectDir) {
    await loadApp(projectDir);
  } else {
    await loadApp(state.projectPath);
  }

  addToast('⚡ Zeus CLI: Projeto atualizado no simulador!');
  broadcast('zeus_refresh', { success: true, timestamp: Date.now() });
}

// =============================================================================
// Initialize and Start Servers
// =============================================================================

export async function start() {
  await loadApp(state.projectPath);

  serverWeb.listen(PORT_WEB, '0.0.0.0', () => {
    console.log(`================================================================`);
    console.log(`  Zepp OS Web UI & Emulator running at: http://localhost:${PORT_WEB}`);
    console.log(`  Web REST & WebSocket API active on port ${PORT_WEB}`);
    console.log(`================================================================`);
  });

  serverZeus.listen(PORT_ZEUS, '0.0.0.0', () => {
    console.log(`  Zeus CLI Simulator Bridge listening on port ${PORT_ZEUS} (Socket.IO)`);
    console.log(`  Ready for "zeus preview" connections`);
    console.log(`================================================================`);
  });
}

// Auto-run if executed as main process
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  start();
}
