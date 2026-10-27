import fs from 'fs';
import path from 'path';
import vm from 'vm';
import esbuild from 'esbuild';
import { sensorState } from './sensor-state.js';
import { getDevice } from '../devices.js';
import {
  View,
  Section,
  Text,
  TextInput,
  Select,
  Toggle,
  Button,
  Slider,
  Radio
} from './settings-runner.js';

export const WIDGET_TYPES = {
  TEXT: 1,
  BUTTON: 2,
  IMG: 3,
  ARC: 4,
  ARC_PROGRESS: 5,
  FILL_RECT: 6,
  STROKE_RECT: 7,
  VIEW_CONTAINER: 8,
  CYCLE_LIST: 9,
  CYCLE_IMAGE_TEXT_LIST: 10,
  RADIO_GROUP: 11,
  STATE_BUTTON: 12,
  CHECKBOX: 13,
  SLIDER: 14,
  SWITCH: 15,
  PAGE_INDICATOR: 16,
  PICKER: 17,
  DIALOG: 18,
  QRCODE: 19,
  CANVAS: 20,
  HISTOGRAM: 21,
  IMG_ANIM: 22,
  IMG_POINTER: 23,
  IMG_STATUS: 24,
  TEXT_IMG: 25,
  IMG_PROGRESS: 26,
  IMG_LEVEL: 27,
  IMG_WEEK: 28,
  IMG_TIME: 29,
  IMG_DATE: 30,
  GROUP: 31,
  SCROLL_LIST: 32
};

export const PROP_TYPES = {
  X: 1,
  Y: 2,
  W: 3,
  H: 4,
  TEXT: 5,
  COLOR: 6,
  MORE: 7,
  SRC: 8,
  VISIBLE: 9,
  ENABLE: 10,
  CHECKED: 11,
  ALPHA: 12,
  RADIUS: 13,
  LINE_WIDTH: 14,
  CENTER_X: 15,
  CENTER_Y: 16
};

export const ALIGN_TYPES = {
  LEFT: 1,
  CENTER_H: 2,
  RIGHT: 3,
  TOP: 4,
  CENTER_V: 5,
  BOTTOM: 6
};

export const TEXT_STYLE_TYPES = {
  WRAP: 1,
  ELLIPSIS: 2,
  NONE: 0
};

export const EVENT_TYPES = {
  CLICK_DOWN: 1,
  CLICK_UP: 2,
  MOVE: 3,
  MOVE_IN: 4,
  MOVE_OUT: 5
};

export const HM_SENSOR_IDS = {
  STEP: 1,
  HEART: 2,
  CALORIE: 3,
  SLEEP: 4,
  BATTERY: 5,
  SPO2: 6,
  STRESS: 7,
  BODY_TEMP: 8,
  DISTANCE: 9,
  PAI: 10,
  STAND: 11,
  FAT_BURNING: 12,
  TIME: 13
};

export class MockWidget {
  constructor(type, props = {}, runtime = null) {
    this._id = ++MockWidget._counter;
    this.type = type;
    this.props = { ...props };
    this.runtime = runtime;
    this.eventListeners = new Map();
    this.visible = props.visible !== undefined ? Boolean(props.visible) : true;
  }

  setProperty(prop, val) {
    if (typeof prop === 'number') {
      const propMap = {
        [PROP_TYPES.X]: 'x',
        [PROP_TYPES.Y]: 'y',
        [PROP_TYPES.W]: 'w',
        [PROP_TYPES.H]: 'h',
        [PROP_TYPES.TEXT]: 'text',
        [PROP_TYPES.COLOR]: 'color',
        [PROP_TYPES.SRC]: 'src',
        [PROP_TYPES.VISIBLE]: 'visible',
        [PROP_TYPES.ENABLE]: 'enable',
        [PROP_TYPES.MORE]: 'more'
      };
      const key = propMap[prop] || `prop_${prop}`;
      if (key === 'more' && typeof val === 'object') {
        Object.assign(this.props, val);
      } else {
        this.props[key] = val;
      }
    } else if (typeof prop === 'string') {
      this.props[prop] = val;
    } else if (typeof prop === 'object') {
      Object.assign(this.props, prop);
    }
    if (this.props.visible !== undefined) {
      this.visible = Boolean(this.props.visible);
    }
  }

  getProperty(prop) {
    if (typeof prop === 'number') {
      const propMap = {
        [PROP_TYPES.X]: 'x',
        [PROP_TYPES.Y]: 'y',
        [PROP_TYPES.W]: 'w',
        [PROP_TYPES.H]: 'h',
        [PROP_TYPES.TEXT]: 'text',
        [PROP_TYPES.COLOR]: 'color',
        [PROP_TYPES.SRC]: 'src',
        [PROP_TYPES.VISIBLE]: 'visible'
      };
      return this.props[propMap[prop]];
    }
    return this.props[prop];
  }

  addEventListener(event, cb) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event).add(cb);
  }

  removeEventListener(event, cb) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).delete(cb);
    }
  }

  async click() {
    let handled = false;
    // 1. Check click_func in props
    if (typeof this.props.click_func === 'function') {
      await this.props.click_func(this);
      handled = true;
    }
    // 2. Check event listeners
    const upListeners = this.eventListeners.get(EVENT_TYPES.CLICK_UP);
    if (upListeners) {
      for (const cb of upListeners) {
        await cb({ type: EVENT_TYPES.CLICK_UP, target: this });
        handled = true;
      }
    }
    const downListeners = this.eventListeners.get(EVENT_TYPES.CLICK_DOWN);
    if (downListeners) {
      for (const cb of downListeners) {
        await cb({ type: EVENT_TYPES.CLICK_DOWN, target: this });
        handled = true;
      }
    }
    return handled;
  }

  createWidget(type, props) {
    if (this.runtime) {
      const w = this.runtime.createWidget(type, props);
      w.parent = this;
      return w;
    }
    return new MockWidget(type, props, null);
  }
}
MockWidget._counter = 0;

/**
 * Creates Mock Sensor classes bound to the reactive sensorState
 */
export function createSensorClasses(sState = sensorState) {
  class BaseSensor {
    constructor(sensorType) {
      this._sensorType = sensorType;
      this._callbacks = new Set();
      this._unregister = sState.registerSensorInstance(sensorType, this);
    }
    onChange(cb) {
      if (typeof cb === 'function') this._callbacks.add(cb);
    }
    addEventListener(event, cb) {
      this.onChange(cb);
    }
    removeEventListener(event, cb) {
      this._callbacks.delete(cb);
    }
    _triggerChange() {
      for (const cb of this._callbacks) {
        try { cb(); } catch (err) { console.error(`Error in ${this._sensorType} sensor callback:`, err); }
      }
    }
    destroy() {
      if (this._unregister) this._unregister();
    }
  }

  class Step extends BaseSensor {
    constructor() {
      super('step');
    }
    get current() { return sState.get('steps'); }
    get target() { return sState.get('stepTarget'); }
  }

  class HeartRate extends BaseSensor {
    constructor() {
      super('heartRate');
    }
    get current() { return sState.get('heartRateCurrent'); }
    get last() { return sState.get('heartRateCurrent'); }
    get resting() { return sState.get('heartRateResting'); }
    get today() { return sState.get('heartRate').today || [75]; }
  }

  class Calorie extends BaseSensor {
    constructor() {
      super('calorie');
    }
    get current() { return sState.get('caloriesBurned'); }
    get target() { return sState.get('caloriesTarget'); }
  }

  class Sleep extends BaseSensor {
    constructor() {
      super('sleep');
    }
    get score() { return sState.get('sleep').score; }
    get totalMinutes() { return sState.get('sleep').totalMinutes; }
    get deep() { return sState.get('sleep').deep; }
    get light() { return sState.get('sleep').light; }
    get rem() { return sState.get('sleep').rem; }
    getBasicInfo() {
      return { score: this.score, totalMinutes: this.totalMinutes };
    }
    getStageConstant() {
      return { WAKE: 0, REM: 1, LIGHT: 2, DEEP: 3 };
    }
    getStageInfo() {
      return [
        { model: 3, start: 0, stop: this.deep },
        { model: 2, start: this.deep, stop: this.deep + this.light },
        { model: 1, start: this.deep + this.light, stop: this.totalMinutes }
      ];
    }
  }

  class Battery extends BaseSensor {
    constructor() {
      super('battery');
    }
    get current() { return sState.get('battery'); }
    get charging() { return sState.get('charging'); }
  }

  class Spo2 extends BaseSensor {
    constructor() {
      super('spo2');
    }
    get current() { return sState.get('spo2'); }
  }

  class Stress extends BaseSensor {
    constructor() {
      super('stress');
    }
    get current() { return sState.get('stress'); }
  }

  class BodyTemp extends BaseSensor {
    constructor() {
      super('bodyTemp');
    }
    get current() { return sState.get('bodyTemp'); }
  }

  class Distance extends BaseSensor {
    constructor() {
      super('distance');
    }
    get current() { return sState.get('distance'); }
  }

  class Pai extends BaseSensor {
    constructor() {
      super('pai');
    }
    get total() { return sState.get('pai'); }
    get current() { return sState.get('pai'); }
    get daily() { return 12; }
    get today() { return 12; }
  }

  class Stand extends BaseSensor {
    constructor() {
      super('stand');
    }
    get current() { return sState.get('stand'); }
    get target() { return 12; }
  }

  class FatBurning extends BaseSensor {
    constructor() {
      super('fatBurning');
    }
    get current() { return sState.get('fatBurning'); }
    get target() { return 30; }
  }

  return {
    Step,
    HeartRate,
    Calorie,
    Sleep,
    Battery,
    Spo2,
    Stress,
    BodyTemp,
    Distance,
    Pai,
    Stand,
    FatBurning
  };
}

export function createHmFsMock(runtime) {
  const files = runtime.virtualFiles || (runtime.virtualFiles = new Map());
  let fdCounter = 0;
  const openHandles = new Map();

  return {
    O_RDONLY: 1,
    O_WRONLY: 2,
    O_RDWR: 3,
    O_APPEND: 4,
    O_CREAT: 8,
    O_TRUNC: 16,
    SEEK_SET: 0,
    SEEK_CUR: 1,
    SEEK_END: 2,

    open: (filename, flags) => {
      const fd = ++fdCounter;
      openHandles.set(fd, { filename, position: 0 });
      return fd;
    },
    close: (fd) => {
      openHandles.delete(fd);
      return 0;
    },
    seek: (fd, offset, whence) => {
      const handle = openHandles.get(fd);
      if (handle) {
        handle.position = offset;
      }
      return 0;
    },
    stat: (filename) => {
      if (!files.has(filename)) {
        const base = filename.replace(/\.json$/, '');
        const storageVal = runtime.getStorageItem ? runtime.getStorageItem(base) : null;
        if (storageVal) {
          const buf = Buffer.alloc(storageVal.length * 2);
          for (let i = 0; i < storageVal.length; i++) {
            buf.writeUInt16LE(storageVal.charCodeAt(i), i * 2);
          }
          files.set(filename, buf);
        }
      }

      if (files.has(filename)) {
        const buf = files.get(filename);
        return [{ size: buf.length }, 0];
      }
      return [null, -1];
    },
    stat_asset: (path) => [{ size: 0 }, 0],
    write: (fd, buffer, offset, length) => {
      const handle = openHandles.get(fd);
      if (!handle) return -1;
      const data = Buffer.from(buffer).slice(offset, offset + length);
      files.set(handle.filename, data);

      try {
        const u16 = new Uint16Array(data.buffer, data.byteOffset, data.byteLength / 2);
        let str = '';
        for (let i = 0; i < u16.length; i++) str += String.fromCharCode(u16[i]);
        const base = handle.filename.replace(/\.json$/, '');
        if (runtime.setStorageItem) runtime.setStorageItem(base, str);
      } catch (_) {}

      return length;
    },
    read: (fd, buffer, offset, length) => {
      const handle = openHandles.get(fd);
      if (!handle) return -1;
      const fileData = files.get(handle.filename);
      if (!fileData) return 0;
      const src = fileData.slice(handle.position, handle.position + length);
      const dest = Buffer.from(buffer);
      src.copy(dest, offset);
      handle.position += src.length;
      return src.length;
    },
    remove: (filename) => {
      files.delete(filename);
      return 0;
    },
    rename: (oldF, newF) => {
      if (files.has(oldF)) {
        files.set(newF, files.get(oldF));
        files.delete(oldF);
      }
      return 0;
    }
  };
}

/**
 * Creates legacy hmSensor mock
 */
export function createHmSensorMock(sState = sensorState) {
  return {
    id: HM_SENSOR_IDS,
    event: { CHANGE: 1 },
    createSensor(sensorId) {
      const callbacks = new Set();
      let typeKey = 'step';
      let obj = {};

      switch (sensorId) {
        case HM_SENSOR_IDS.STEP:
          typeKey = 'step';
          Object.defineProperties(obj, {
            current: { get: () => sState.get('steps'), enumerable: true },
            target: { get: () => sState.get('stepTarget'), enumerable: true }
          });
          break;
        case HM_SENSOR_IDS.HEART:
          typeKey = 'heartRate';
          Object.defineProperties(obj, {
            current: { get: () => sState.get('heartRateCurrent'), enumerable: true },
            last: { get: () => sState.get('heartRateCurrent'), enumerable: true },
            resting: { get: () => sState.get('heartRateResting'), enumerable: true }
          });
          break;
        case HM_SENSOR_IDS.CALORIE:
          typeKey = 'calorie';
          Object.defineProperties(obj, {
            current: { get: () => sState.get('caloriesBurned'), enumerable: true },
            target: { get: () => sState.get('caloriesTarget'), enumerable: true }
          });
          break;
        case HM_SENSOR_IDS.BATTERY:
          typeKey = 'battery';
          Object.defineProperties(obj, {
            current: { get: () => sState.get('battery'), enumerable: true },
            charging: { get: () => sState.get('charging'), enumerable: true }
          });
          break;
        case HM_SENSOR_IDS.SLEEP:
          typeKey = 'sleep';
          Object.defineProperties(obj, {
            score: { get: () => sState.get('sleep').score, enumerable: true },
            totalMinutes: { get: () => sState.get('sleep').totalMinutes, enumerable: true }
          });
          obj.getBasicInfo = () => ({ score: sState.get('sleep').score, totalMinutes: sState.get('sleep').totalMinutes });
          break;
        case HM_SENSOR_IDS.SPO2:
          typeKey = 'spo2';
          Object.defineProperties(obj, {
            current: { get: () => sState.get('spo2'), enumerable: true }
          });
          break;
        case HM_SENSOR_IDS.TIME:
          typeKey = 'time';
          Object.defineProperties(obj, {
            year: { get: () => new Date().getFullYear(), enumerable: true },
            month: { get: () => new Date().getMonth() + 1, enumerable: true },
            day: { get: () => new Date().getDate(), enumerable: true },
            hour: { get: () => new Date().getHours(), enumerable: true },
            minute: { get: () => new Date().getMinutes(), enumerable: true },
            second: { get: () => new Date().getSeconds(), enumerable: true },
            utc: { get: () => Date.now(), enumerable: true }
          });
          break;
        default:
          typeKey = 'step';
          break;
      }

      obj._triggerChange = () => {
        for (const cb of callbacks) cb();
      };
      obj.addEventListener = (event, cb) => {
        callbacks.add(cb);
      };
      obj.removeEventListener = (event, cb) => {
        callbacks.delete(cb);
      };

      sState.registerSensorInstance(typeKey, obj);
      return obj;
    }
  };
}

/**
 * Module Loader with apiLevel enforcement, file variant resolution, and @zos mocks
 */
export class ModuleLoader {
  constructor(runtimeContext) {
    this.runtime = runtimeContext;
    this.cache = new Map();
    this.sensorClasses = createSensorClasses(runtimeContext.sensorState || sensorState);
  }

  resolveFilePath(targetPath, baseDir) {
    const projectPath = this.runtime.projectPath || baseDir;
    const apiLevel = this.runtime.apiLevel || '3.6.0';

    let resolved = path.isAbsolute(targetPath) ? targetPath : path.resolve(baseDir, targetPath);

    // 1. If apiLevel === '1.0.0' and project has legacy/ folder:
    // If not already in legacy/, check if legacy/<path> exists
    if (apiLevel === '1.0.0' && projectPath) {
      const legacyDir = path.join(projectPath, 'legacy');
      if (fs.existsSync(legacyDir)) {
        const relToProject = path.relative(projectPath, resolved);
        if (!relToProject.startsWith('legacy') && !relToProject.startsWith('..')) {
          const candidateLegacy = path.join(legacyDir, relToProject);
          if (fs.existsSync(candidateLegacy) || fs.existsSync(candidateLegacy + '.js') || fs.existsSync(path.join(candidateLegacy, 'index.js'))) {
            resolved = candidateLegacy;
          }
        }
      }
    }

    // 2. If apiLevel === '4.0.0', check for *.api-4.0.js variant
    if (apiLevel === '4.0.0') {
      const candidate4 = resolved.endsWith('.js')
        ? resolved.replace(/\.js$/, '.api-4.0.js')
        : resolved + '.api-4.0.js';
      if (fs.existsSync(candidate4)) {
        return candidate4;
      }
    }

    // Standard extensions
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
    if (fs.existsSync(resolved + '.js')) {
      return resolved + '.js';
    }
    if (fs.existsSync(resolved + '.json')) {
      return resolved + '.json';
    }
    if (fs.existsSync(path.join(resolved, 'index.js'))) {
      return path.join(resolved, 'index.js');
    }

    return resolved;
  }

  getZosModule(specifier) {
    const apiLevel = this.runtime.apiLevel || '3.6.0';
    if (apiLevel === '1.0.0') {
      throw new Error(`@zos/* is not available on Zepp OS 1.0; use legacy hmUI/hmApp/DeviceRuntimeCore (attempted import of "${specifier}")`);
    }

    const device = getDevice(this.runtime.device);

    switch (specifier) {
      case '@zos/ui':
        return {
          createWidget: (type, props) => this.runtime.createWidget(type, props),
          deleteWidget: (w) => this.runtime.deleteWidget(w),
          widget: WIDGET_TYPES,
          prop: PROP_TYPES,
          align: ALIGN_TYPES,
          text_style: TEXT_STYLE_TYPES,
          event: EVENT_TYPES,
          showToast: (opts) => this.runtime.showToast(opts)
        };

      case '@zos/router':
        return {
          push: (opts, params) => this.runtime.navigate(typeof opts === 'object' ? opts.url : opts, typeof opts === 'object' ? opts.params : params),
          replace: (opts, params) => this.runtime.replace(typeof opts === 'object' ? opts.url : opts, typeof opts === 'object' ? opts.params : params),
          back: () => this.runtime.back(),
          exit: () => this.runtime.exit(),
          getRoute: () => ({ url: this.runtime.currentRoute, params: this.runtime.currentParams || {} })
        };

      case '@zos/storage':
        return {
          localStorage: {
            getItem: (k, d) => this.runtime.getStorageItem(k, d),
            setItem: (k, v) => this.runtime.setStorageItem(k, v),
            removeItem: (k) => this.runtime.removeStorageItem(k),
            clear: () => this.runtime.clearStorage()
          }
        };

      case '@zos/sensor':
        return this.sensorClasses;

      case '@zos/alarm':
        return {
          set: (opts) => this.runtime.setAlarm(opts),
          cancel: (id) => this.runtime.cancelAlarm(id),
          get: (id) => this.runtime.getAlarm(id)
        };

      case '@zos/notification':
        return {
          notify: (opts) => this.runtime.notify(opts),
          cancel: (id) => this.runtime.cancelNotification(id)
        };

      case '@zos/interaction':
        return {
          showToast: (opts) => this.runtime.showToast(opts)
        };

      case '@zos/app-service':
        return {
          exit: () => this.runtime.exitAppService()
        };

      case '@zos/i18n':
        return {
          getText: (key) => this.runtime.getText(key)
        };

      case '@zos/device':
        return {
          getDeviceInfo: () => ({
            screenWidth: device.screenWidth,
            screenHeight: device.screenHeight,
            screenShape: device.screenShape,
            apiLevel: this.runtime.apiLevel || device.apiLevel || '3.6.0',
            deviceName: device.deviceName
          })
        };

      case '@zos/display':
        return {
          getBrightness: () => 80,
          setBrightness: () => {},
          wakeUp: () => {},
          resetPageSleep: () => {},
          getPageSleep: () => 15
        };

      case '@zos/fs':
        return {
          statSync: (p) => ({ size: 0, mtime: Date.now() }),
          readFileSync: (p) => Buffer.from(''),
          writeFileSync: (p, d) => {},
          rmSync: (p) => {},
          openSync: (p) => 1,
          readSync: () => 0,
          writeSync: () => 0,
          closeSync: () => {}
        };

      case '@zos/ble':
        return {
          createConnect: () => ({}),
          disConnect: () => {},
          mstOnPrepare: () => {},
          mstSend: () => {},
          mstReceive: () => {}
        };

      case '@zos/utils':
        return {
          px: (n) => n,
          log: {
            getLogger: (name) => ({
              log: (...args) => console.log(`[${name}]`, ...args),
              debug: (...args) => console.debug(`[${name}]`, ...args),
              error: (...args) => console.error(`[${name}]`, ...args),
              warn: (...args) => console.warn(`[${name}]`, ...args)
            })
          }
        };

      default:
        return {};
    }
  }

  getZmlModule(specifier) {
    const runtime = this.runtime;

    if (specifier === '@zeppos/zml/base-page') {
      const BasePage = (def) => {
        const pageObj = {
          ...def,
          async request(req, options) {
            if (runtime && runtime.appSideRunner) {
              return runtime.appSideRunner.handleRequest(req);
            }
            throw new Error('No active AppSideRunner connected to message channel');
          },
          async httpRequest(options) {
            const fetchFn = (runtime && runtime.fetch) || globalThis.fetch;
            if (!fetchFn) throw new Error('No fetch implementation available');
            const url = options.url;
            const res = await fetchFn(url, options);
            const text = await res.text();
            let body = text;
            try { body = JSON.parse(text); } catch (_) {}
            return { status: res.status, statusText: res.statusText, headers: Object.fromEntries(res.headers.entries()), body };
          },
          call(data) {
            if (runtime && runtime.appSideRunner) {
              runtime.appSideRunner.handleWatchMessage(data);
            }
          }
        };
        return pageObj;
      };
      return { BasePage, merge: Object.assign };
    }

    if (specifier === '@zeppos/zml/base-app') {
      const BaseApp = (def) => ({ ...def });
      return { BaseApp, merge: Object.assign };
    }

    if (specifier === '@zeppos/zml/base-side') {
      const settingsLib = {
        onChange: (cb) => {
          if (runtime && runtime.settingsStorage) {
            runtime.settingsStorage.addListener('change', cb);
          }
          return settingsLib;
        },
        offChange: (cb) => {
          if (runtime && runtime.settingsStorage) {
            runtime.settingsStorage.removeListener('change', cb);
          }
          return settingsLib;
        },
        getItem: (k) => runtime && runtime.settingsStorage ? runtime.settingsStorage.getItem(k) : null,
        setItem: (k, v) => runtime && runtime.settingsStorage ? runtime.settingsStorage.setItem(k, v) : null,
        clear: () => runtime && runtime.settingsStorage ? runtime.settingsStorage.clear() : null,
        removeItem: (k) => runtime && runtime.settingsStorage ? runtime.settingsStorage.removeItem(k) : null,
        getAll: () => runtime && runtime.settingsStorage ? runtime.settingsStorage.toObject() : {}
      };

      const BaseSideService = (def) => {
        return {
          settings: settingsLib,
          ...def,
          call(data) {
            if (runtime) {
              runtime.handleSidePushMessage(data);
            }
          }
        };
      };

      return { BaseSideService, settingsLib, merge: Object.assign };
    }

    return {};
  }

  loadFile(filePath) {
    const resolved = this.resolveFilePath(filePath, this.runtime.projectPath || process.cwd());
    if (this.cache.has(resolved)) {
      return this.cache.get(resolved);
    }

    if (resolved.endsWith('.json')) {
      const content = JSON.parse(fs.readFileSync(resolved, 'utf8'));
      this.cache.set(resolved, content);
      return content;
    }

    const code = fs.readFileSync(resolved, 'utf8');
    const transformed = esbuild.transformSync(code, {
      format: 'cjs',
      loader: 'js',
      target: 'node18'
    });

    const exports = {};
    const module = { exports };
    const dir = path.dirname(resolved);

    const customRequire = (specifier) => {
      if (specifier.startsWith('@zos/')) {
        return this.getZosModule(specifier);
      }
      if (specifier.startsWith('@zeppos/zml/')) {
        return this.getZmlModule(specifier);
      }
      if (specifier === 'i18n') {
        return {
          gettext: (k) => this.runtime.getText(k),
          getText: (k) => this.runtime.getText(k)
        };
      }
      if (specifier.startsWith('.') || specifier.startsWith('/')) {
        return this.loadFile(this.resolveFilePath(specifier, dir));
      }
      // Node built-in fallback
      try {
        return require(specifier);
      } catch (_) {
        return {};
      }
    };

    const device = getDevice(this.runtime.device);
    const hmSensorMock = createHmSensorMock(this.runtime.sensorState || sensorState);

    const self = this;
    const contextGlobals = {
      // Common JS
      module,
      exports,
      require: customRequire,
      __filename: resolved,
      __dirname: dir,
      console,
      Buffer,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      fetch: (this.runtime && this.runtime.fetch) || globalThis.fetch,

      timer: {
        createTimer: (delay, period, callback, option) => {
          let handle;
          if (!period) {
            handle = setTimeout(() => callback(option), delay);
          } else {
            handle = setInterval(() => callback(option), period);
          }
          if (handle && handle.unref) handle.unref();
          if (self.runtime && self.runtime._activeTimers) {
            self.runtime._activeTimers.add(handle);
          }
          return handle;
        },
        stopTimer: (id) => {
          clearTimeout(id);
          clearInterval(id);
          if (self.runtime && self.runtime._activeTimers) {
            self.runtime._activeTimers.delete(id);
          }
        }
      },

      // Zepp OS Standard Globals
      Page: (def) => {
        this.runtime._pageDefinition = def;
        return def;
      },
      WatchFace: (def) => {
        this.runtime._pageDefinition = def;
        return def;
      },
      App: (def) => {
        this.runtime._appDefinition = def;
        return def;
      },
      AppSideService: (def) => {
        this.runtime._appSideDefinition = def;
        return def;
      },
      AppService: (def) => {
        this.runtime._appServiceDefinition = def;
        return def;
      },
      AppSettingsPage: (builder) => {
        this.runtime._settingsDefinition = builder;
        return builder;
      },
      View,
      Section,
      Text,
      TextInput,
      Select,
      Toggle,
      Button,
      Slider,
      Radio,
      getApp: () => ({
        _options: this.runtime._appDefinition || {},
        globalData: (this.runtime._appDefinition && this.runtime._appDefinition.globalData) || {}
      }),

      // Legacy Zepp OS 1.0 Globals
      __$$hmAppManager$$__: {
        currentApp: {
          app: (this.runtime._appDefinition && this.runtime._appDefinition.app) || {},
          current: {
            get module() { return self.runtime._pageDefinition; },
            set module(m) { self.runtime._pageDefinition = m; }
          }
        }
      },
      hmUI: {
        createWidget: (type, props) => this.runtime.createWidget(type, props),
        deleteWidget: (w) => this.runtime.deleteWidget(w),
        widget: WIDGET_TYPES,
        prop: PROP_TYPES,
        align: ALIGN_TYPES,
        text_style: TEXT_STYLE_TYPES,
        event: EVENT_TYPES,
        data_type: {
          BATTERY: 'BATTERY',
          STEP: 'STEP',
          HEART: 'HEART',
          CALORIE: 'CALORIE',
          DISTANCE: 'DISTANCE',
          PAI: 'PAI'
        },
        show_level: {
          ONLY_NORMAL: 1,
          ONLY_AOD: 2,
          ONLY_EDIT: 4,
          ALL: 7
        },
        edit_type: {
          STEP: 1,
          HEART: 2,
          CALORIE: 3,
          DISTANCE: 4,
          PAI: 5,
          WEATHER: 6,
          ALTIMETER: 7,
          SUN_RISE: 8,
          SUN_SET: 9,
          AQI: 10,
          UVI: 11,
          HUMIDITY: 12,
          WIND: 13,
          FAT_BURRING: 14,
          STRESS: 15,
          SPO2: 16
        },
        anim_status: {
          START: 1,
          STOP: 2,
          PAUSE: 3,
          RESUME: 4
        },
        status_type: {
          DISTURB: 'DISTURB',
          DISCONNECT: 'DISCONNECT',
          LOCK: 'LOCK'
        },
        system_status: {
          DISTURB: 'DISTURB',
          DISCONNECT: 'DISCONNECT',
          LOCK: 'LOCK'
        },
        showToast: (opts) => this.runtime.showToast(opts),
        setStatusBarVisible: (v) => { this.runtime.statusBarVisible = v; },
        setLayerScrolling: (v) => { this.runtime.layerScrolling = v; }
      },
      hmApp: {
        gotoPage: (opts, param) => this.runtime.navigate(typeof opts === 'object' ? opts.url : opts, typeof opts === 'object' ? opts.param : param),
        reloadPage: () => this.runtime.reloadPage(),
        packageInfo: () => ({ name: 'App', version: '1.0.0' }),
        startApp: () => {},
        exit: () => this.runtime.exit()
      },
      hmSensor: hmSensorMock,
      hmSetting: {
        getDeviceInfo: () => ({
          screenWidth: device.screenWidth,
          screenHeight: device.screenHeight,
          screenShape: device.screenShape,
          apiLevel: this.runtime.apiLevel || device.apiLevel || '1.0.0',
          deviceName: device.deviceName
        }),
        getLanguage: () => 'pt-BR',
        getBrightness: () => 80,
        getDateFormat: () => 0,
        getTimeFormat: () => 0,
        getWeightUnit: () => 0,
        getDistanceUnit: () => 0
      },
      hmFS: createHmFsMock(this.runtime),
      hmBle: {
        createConnect: () => ({}),
        disConnect: () => {},
        send: () => {},
        addListener: () => {},
        removeListener: () => {},
        mstSend: () => {},
        mstOnPrepare: () => {},
        mstReceive: () => {}
      },
      DeviceRuntimeCore: {
        App: (def) => {
          self.runtime._appDefinition = def;
          return def;
        },
        WatchFace: (def) => {
          self.runtime._pageDefinition = def;
          return def;
        },
        Page: (def) => {
          self.runtime._pageDefinition = def;
          return def;
        },
        HmLogger: {
          getLogger: (name) => ({
            log: (...args) => console.log(`[${name}]`, ...args),
            debug: (...args) => console.debug(`[${name}]`, ...args),
            error: (...args) => console.error(`[${name}]`, ...args),
            warn: (...args) => console.warn(`[${name}]`, ...args)
          })
        }
      },
      Logger: {
        getLogger: (name) => ({
          log: (...args) => console.log(`[${name}]`, ...args),
          debug: (...args) => console.debug(`[${name}]`, ...args),
          error: (...args) => console.error(`[${name}]`, ...args),
          warn: (...args) => console.warn(`[${name}]`, ...args)
        })
      },
      messaging: {
        peerSocket: {
          addListener: () => {},
          removeListener: () => {},
          send: () => {}
        }
      },
      settings: {
        settingsStorage: this.runtime.settingsStorage
      }
    };

    const script = new vm.Script(transformed.code, { filename: resolved });
    const context = vm.createContext(contextGlobals);
    script.runInContext(context);

    this.cache.set(resolved, module.exports);
    return module.exports;
  }
}

export default ModuleLoader;
