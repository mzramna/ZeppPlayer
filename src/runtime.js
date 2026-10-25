/**
 * Zepp OS Unified Runtime Engine
 * 
 * Coordinates module loading, sensor reactivity, settings bridge, 
 * page navigation, screen inspection, and event dispatch.
 */

import fs from 'fs';
import path from 'path';
import { sensorState, SensorState } from './runtime/sensor-state.js';
import { ModuleLoader, WIDGET_TYPES, PROP_TYPES, EVENT_TYPES, MockWidget } from './runtime/module-loader.js';
import { SettingsRunner, SettingsStorage } from './runtime/settings-runner.js';
import { AppSideRunner } from './runtime/app-side-runner.js';
import { AppServiceRunner } from './runtime/app-service-runner.js';
import { getDevice, STANDARD_MODELS } from './devices.js';

export class ZeppRuntimeEngine {
  constructor(options = {}) {
    this.options = options;
    this.projectPath = options.projectPath ? path.resolve(options.projectPath) : null;
    this.device = options.device || 'amazfit-balance';
    this.apiLevel = options.apiLevel || '3.6.0';
    this.currentRoute = options.route || '';
    this.currentParams = {};
    this.routeStack = [];
    this.widgets = [];
    this.toasts = [];
    this.alarms = new Map();
    this.notifications = new Map();
    this.storage = new Map();
    this._apiCalls = {};
    this._visitedRoutes = new Set();
    this._interactedWidgets = [];
    this._activeTimers = new Set();
    this._crownListeners = new Set();
    this._gestureListeners = new Set();

    this._pageDefinition = null;
    this._appDefinition = null;
    this._appSideDefinition = null;
    this._appServiceDefinition = null;
    this._settingsDefinition = null;
    this.pageInstance = null;
    this.appInstance = null;

    // Subsystems
    this.sensorState = new SensorState(options.sensors || {});
    this.settingsStorage = new SettingsStorage(options.settings || {}, (change) => {
      this._recordApiCall('settings.change');
      if (this.appSideRunner) {
        this.appSideRunner.notifySettingsChange(change);
      }
    });
    this.settingsRunner = new SettingsRunner(this, { storage: this.settingsStorage });
    this.appSideRunner = new AppSideRunner(this);
    this.appServiceRunner = new AppServiceRunner(this);
    this.moduleLoader = new ModuleLoader(this);

    // Track initial device info
    const dev = getDevice(this.device);
    if (dev && !options.apiLevel && dev.defaultApi) {
      this.apiLevel = dev.defaultApi;
    }
  }

  _recordApiCall(name) {
    this._apiCalls[name] = (this._apiCalls[name] || 0) + 1;
  }

  _recordInteraction(info) {
    this._interactedWidgets.push({
      ...info,
      route: this.currentRoute,
      time: Date.now()
    });
  }

  getApiCoverage() {
    return { ...this._apiCalls };
  }

  getDeviceInfo() {
    return getDevice(this.device);
  }

  get history() {
    return this.routeStack;
  }

  set history(val) {
    this.routeStack = val;
  }

  async clickWidget(widgetOrIndexOrQuery) {
    if (typeof widgetOrIndexOrQuery === 'number') {
      const res = await this.click({ widgetIndex: widgetOrIndexOrQuery });
      return res.handled || res.success;
    }
    if (typeof widgetOrIndexOrQuery === 'string') {
      const res = await this.click({ text: widgetOrIndexOrQuery });
      return res.handled || res.success;
    }
    if (typeof widgetOrIndexOrQuery === 'object' && widgetOrIndexOrQuery !== null) {
      if (typeof widgetOrIndexOrQuery.click === 'function') {
        const handled = await widgetOrIndexOrQuery.click();
        return Boolean(handled);
      }
      const res = await this.click(widgetOrIndexOrQuery);
      return res.handled || res.success;
    }
    return false;
  }

  selectDevice(deviceKey) {
    const dev = getDevice(deviceKey);
    if (!dev) {
      throw new Error(`Unsupported device: "${deviceKey}". Supported devices: ${Object.keys(STANDARD_MODELS).join(', ')}`);
    }
    this.device = dev.id || deviceKey;
    this._recordApiCall('device.select');
    return dev;
  }

  setApiVersion(apiLevel) {
    const validLevels = ['1.0.0', '2.0.0', '3.0.0', '3.6.0', '4.0.0'];
    if (!validLevels.includes(apiLevel)) {
      throw new Error(`Invalid API version "${apiLevel}". Valid versions: ${validLevels.join(', ')}`);
    }
    this.apiLevel = apiLevel;
    this._recordApiCall('apiVersion.set');
    return { success: true, apiLevel };
  }

  setSensors(sensors) {
    if (sensors && typeof sensors === 'object') {
      this.sensorState.update(sensors, true);
      this._recordApiCall('sensors.update');
    }
    return this.sensorState.getAll();
  }

  async loadApp(params = {}) {
    if (params.projectPath) {
      this.projectPath = path.resolve(params.projectPath);
    }
    if (!this.projectPath || !fs.existsSync(this.projectPath)) {
      throw new Error(`Project path does not exist: "${this.projectPath}"`);
    }

    if (params.device) this.selectDevice(params.device);
    if (params.apiLevel) this.setApiVersion(params.apiLevel);
    if (params.sensors) this.setSensors(params.sensors);
    if (params.settings) {
      for (const [k, v] of Object.entries(params.settings)) {
        this.settingsStorage.setItem(k, v);
      }
    }

    this._recordApiCall('app.load');

    // Read app.json config
    const appJsonPath = path.join(this.projectPath, 'app.json');
    let appConfig = {};
    if (fs.existsSync(appJsonPath)) {
      try {
        appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
      } catch (err) {
        console.warn(`Could not parse app.json: ${err.message}`);
      }
    }
    this.appConfig = appConfig;

    // Load companion runners
    await this.appSideRunner.start();
    await this.settingsRunner.load();

    // Execute app.js if present
    const appJsCandidates = [
      path.join(this.projectPath, 'app.js'),
      path.join(this.projectPath, 'app', 'index.js')
    ];
    for (const c of appJsCandidates) {
      if (fs.existsSync(c)) {
        try {
          this.moduleLoader.loadFile(c);
          if (this._appDefinition) {
            this.appInstance = typeof this._appDefinition === 'function' ? this._appDefinition() : { ...this._appDefinition };
            if (typeof this.appInstance.onCreate === 'function') {
              this.appInstance.onCreate();
            }
          }
        } catch (e) {
          console.warn(`Error running app.js: ${e.message}`);
        }
        break;
      }
    }

    // Determine initial route
    let initialRoute = params.route;
    if (!initialRoute) {
      if (appConfig.app?.appType === 'watchface' && appConfig.module?.watchface?.path) {
        initialRoute = appConfig.module.watchface.path;
      } else if (appConfig.targets?.common?.module?.page?.pages?.[0]) {
        initialRoute = appConfig.targets.common.module.page.pages[0];
      } else if (appConfig.module?.page?.pages?.[0] && (fs.existsSync(path.join(this.projectPath, appConfig.module.page.pages[0] + '.js')) || fs.existsSync(path.join(this.projectPath, appConfig.module.page.pages[0], 'index.js')))) {
        initialRoute = appConfig.module.page.pages[0];
      } else if (appConfig.module?.watchface?.path) {
        initialRoute = appConfig.module.watchface.path;
      } else if (appConfig.module?.page?.pages?.[0]) {
        initialRoute = appConfig.module.page.pages[0];
      } else if (fs.existsSync(path.join(this.projectPath, 'watchface', 'index.js'))) {
        initialRoute = 'watchface/index';
      } else if (fs.existsSync(path.join(this.projectPath, 'pages', 'index.js'))) {
        initialRoute = 'pages/index';
      } else {
        initialRoute = 'pages/index';
      }
    }

    await this.navigate(initialRoute, params.params || {});

    return {
      success: true,
      projectPath: this.projectPath,
      device: this.device,
      apiLevel: this.apiLevel,
      route: this.currentRoute,
      widgetsCount: this.widgets.length,
      appName: appConfig.app?.appName || 'Zepp OS App'
    };
  }

  async navigate(url, params = {}) {
    if (!url) return;
    this._recordApiCall('router.navigate');

    // Clean up previous page
    if (this.pageInstance && typeof this.pageInstance.onDestroy === 'function') {
      try {
        await this.pageInstance.onDestroy();
      } catch (err) {
        console.warn(`Page onDestroy error: ${err.message}`);
      }
    }

    if (this.currentRoute && this.currentRoute !== url) {
      this.routeStack.push({ route: this.currentRoute, params: this.currentParams });
    }

    this.currentRoute = url;
    this.currentParams = params || {};
    this._visitedRoutes.add(url);
    this.widgets = [];
    this._pageDefinition = null;

    // Resolve target script file
    const projectPath = this.projectPath || process.cwd();
    const resolved = this.moduleLoader.resolveFilePath(url, projectPath);

    if (fs.existsSync(resolved)) {
      try {
        this.moduleLoader.cache.delete(resolved);
        this.moduleLoader.loadFile(resolved);
      } catch (err) {
        console.warn(`Failed to execute route "${url}": ${err.message}`);
      }
    }

    // Execute Page / Watchface lifecycle
    const def = this._pageDefinition;
    if (def) {
      this.pageInstance = typeof def === 'function' ? def() : { ...def };
      if (typeof this.pageInstance.onInit === 'function') {
        try {
          await this.pageInstance.onInit(this.currentParams);
        } catch (err) {
          console.warn(`Page onInit error: ${err.message}`);
        }
      }
      if (typeof this.pageInstance.build === 'function') {
        try {
          await this.pageInstance.build();
        } catch (err) {
          console.warn(`Page build error: ${err.message}`);
        }
      }
    }

    await new Promise((r) => setTimeout(r, 20));
    return { success: true, route: this.currentRoute, widgetsCount: this.widgets.length };
  }

  async back() {
    this._recordApiCall('router.back');
    if (this.routeStack.length === 0) {
      return { success: false, message: 'Route history stack is empty' };
    }
    const prev = this.routeStack.pop();
    return await this.navigate(prev.route, prev.params);
  }

  replace(url, params = {}) {
    this._recordApiCall('router.replace');
    this.currentRoute = '';
    return this.navigate(url, params);
  }

  reloadPage() {
    return this.navigate(this.currentRoute, this.currentParams);
  }

  exit() {
    this._recordApiCall('app.exit');
    if (this.pageInstance && typeof this.pageInstance.onDestroy === 'function') {
      try { this.pageInstance.onDestroy(); } catch (_) {}
    }
    this.widgets = [];
  }

  exitAppService() {
    this.appServiceRunner.exit();
  }

  createWidget(type, props = {}) {
    this._recordApiCall('ui.createWidget');
    const widget = new MockWidget(type, props, this);
    this.widgets.push(widget);
    return widget;
  }

  deleteWidget(widget) {
    this._recordApiCall('ui.deleteWidget');
    const idx = this.widgets.indexOf(widget);
    if (idx !== -1) {
      this.widgets.splice(idx, 1);
      return true;
    }
    return false;
  }

  showToast(options) {
    this._recordApiCall('interaction.showToast');
    const text = typeof options === 'object'
      ? options.content || options.text || JSON.stringify(options)
      : String(options);
    const toast = { text, content: text, timestamp: Date.now() };
    this.toasts.push(toast);
    setTimeout(() => {
      const idx = this.toasts.indexOf(toast);
      if (idx !== -1) this.toasts.splice(idx, 1);
    }, (typeof options === 'object' && options.duration) ? options.duration : 2500);
    return toast;
  }

  getRoute() {
    return this.currentRoute;
  }

  getToasts() {
    return [...this.toasts];
  }

  getWidgets() {
    return this.widgets;
  }

  async click(query = {}) {
    this._recordApiCall('ui.click');
    let target = null;
    let targetIndex = -1;

    if (query.widgetIndex !== undefined && this.widgets[query.widgetIndex]) {
      targetIndex = query.widgetIndex;
      target = this.widgets[targetIndex];
    } else if (query.text) {
      const qText = String(query.text).toLowerCase();
      targetIndex = this.widgets.findIndex((w) => {
        const txt = (w.props?.text ?? w.props?.title ?? w.props?.label ?? w.config?.text ?? '').toLowerCase();
        return txt.includes(qText);
      });
      if (targetIndex !== -1) target = this.widgets[targetIndex];
    } else if (query.x !== undefined && query.y !== undefined) {
      // Find top-most widget containing (x, y)
      for (let i = this.widgets.length - 1; i >= 0; i--) {
        const w = this.widgets[i];
        const bx = w.props?.x ?? w.config?.x ?? 0;
        const by = w.props?.y ?? w.config?.y ?? 0;
        const bw = w.props?.w ?? w.config?.w ?? 0;
        const bh = w.props?.h ?? w.config?.h ?? 0;
        if (query.x >= bx && query.x <= bx + bw && query.y >= by && query.y <= by + bh) {
          target = w;
          targetIndex = i;
          break;
        }
      }
    }

    let clicked = false;
    if (target) {
      clicked = target.click();
      if (!clicked && typeof target.props?.click_func === 'function') {
        target.props.click_func(target);
        clicked = true;
      }
      this._recordInteraction({
        type: 'widget_click',
        widgetIndex: targetIndex,
        text: target.props?.text || '',
        widgetType: target.type
      });
    }

    await new Promise((r) => setTimeout(r, 25));

    return {
      success: Boolean(target),
      handled: clicked,
      clickedWidget: target
        ? {
            index: targetIndex,
            type: target.type,
            text: target.props?.text || target.props?.title || '',
            bounds: {
              x: target.props?.x || 0,
              y: target.props?.y || 0,
              w: target.props?.w || 0,
              h: target.props?.h || 0
            }
          }
        : null,
      currentRoute: this.currentRoute
    };
  }

  getSettingsUI() {
    this._recordApiCall('settings.getUI');
    this.settingsRunner.render();
    return this.settingsRunner.getVirtualTree();
  }

  updateSetting(queryOrKey, val) {
    this._recordApiCall('settings.update');
    if (typeof queryOrKey === 'string') {
      this.settingsRunner.updateSetting(queryOrKey, val);
      return { success: true, key: queryOrKey, value: val };
    }

    const { key, value, buttonLabel } = queryOrKey || {};
    if (key !== undefined) {
      this.settingsRunner.updateSetting(key, value);
    }

    if (buttonLabel) {
      const tree = this.settingsRunner.getVirtualTree();
      const findBtn = (nodes) => {
        if (!Array.isArray(nodes)) return null;
        for (const n of nodes) {
          if (!n) continue;
          const label = n.label || n.title || n.name || n.text || '';
          if (label.includes(buttonLabel) && (typeof n.onClick === 'function' || typeof n.click_func === 'function')) {
            return n;
          }
          if (n.children) {
            const f = findBtn(n.children);
            if (f) return f;
          }
        }
        return null;
      };
      const btn = findBtn(tree);
      if (btn) {
        if (typeof btn.onClick === 'function') btn.onClick();
        else if (typeof btn.click_func === 'function') btn.click_func();
      }
    }

    return {
      success: true,
      tree: this.settingsRunner.getVirtualTree(),
      storage: this.settingsStorage.toObject()
    };
  }

  async triggerService(options = {}) {
    this._recordApiCall('appService.trigger');
    const { servicePath, param } = options;
    const res = await this.appServiceRunner.load(servicePath, param);
    return {
      success: true,
      running: this.appServiceRunner.running,
      service: Boolean(res)
    };
  }

  handleSidePushMessage(data) {
    this._recordApiCall('zml.sidePush');
    // Dispatch to page if it has onMessage
    if (this.pageInstance && typeof this.pageInstance.onMessage === 'function') {
      this.pageInstance.onMessage(data);
    }
  }

  getStorageItem(k, d = null) {
    return this.storage.has(k) ? this.storage.get(k) : d;
  }

  setStorageItem(k, v) {
    this.storage.set(k, v);
  }

  removeStorageItem(k) {
    this.storage.delete(k);
  }

  clearStorage() {
    this.storage.clear();
  }

  setAlarm(opts) {
    const id = Date.now();
    this.alarms.set(id, opts);
    return id;
  }

  cancelAlarm(id) {
    return this.alarms.delete(id);
  }

  getAlarm(id) {
    return this.alarms.get(id);
  }

  notify(opts) {
    const id = Date.now();
    this.notifications.set(id, opts);
    this.showToast(opts?.title || opts?.content || 'Notification');
    return id;
  }

  cancelNotification(id) {
    return this.notifications.delete(id);
  }

  getText(key) {
    if (this.appConfig?.i18n) {
      const lang = this.appConfig.defaultLanguage || 'en-US';
      const map = this.appConfig.i18n[lang] || {};
      if (map[key]) return map[key];
    }
    return key;
  }

  getScreenState() {
    return this.getScreen();
  }

  getScreen() {
    const dev = this.getDeviceInfo();
    const width = dev.screenWidth || 480;
    const height = dev.screenHeight || 480;
    const isRound = dev.screenShape === 'round' || dev.shape === 'round';

    const widgetsList = this.widgets.map((w, index) => {
      let typeStr = 'UNKNOWN';
      if (typeof w.type === 'number') {
        typeStr = Object.keys(WIDGET_TYPES).find((k) => WIDGET_TYPES[k] === w.type) || `WIDGET_${w.type}`;
      } else {
        typeStr = String(w.type || w.constructor?.name?.replace(/Widget$/, '').toUpperCase() || 'WIDGET');
      }

      const text = w.props?.text ?? w.props?.title ?? w.props?.label ?? w.config?.text ?? '';
      const bounds = {
        x: w.props?.x ?? w.config?.x ?? 0,
        y: w.props?.y ?? w.config?.y ?? 0,
        w: w.props?.w ?? w.config?.w ?? 0,
        h: w.props?.h ?? w.config?.h ?? 0
      };

      return {
        index,
        id: w._id || index,
        type: typeStr,
        text: String(text),
        bounds,
        colors: {
          color: w.props?.color ?? w.config?.color,
          press_color: w.props?.press_color ?? w.config?.press_color,
          normal_color: w.props?.normal_color ?? w.config?.normal_color
        },
        icon: w.props?.src || w.props?.icon || w.config?.src || '',
        visible: w.visible !== false
      };
    });

    const toastsList = this.toasts.map((t) => t.text || t.content || String(t));

    // Generate ASCII snapshot
    const ascii = this._renderAscii(dev, this.currentRoute, widgetsList, toastsList);

    // Generate SVG string
    const svg = this._renderSvg(dev, width, height, isRound, widgetsList, toastsList);

    return {
      route: this.currentRoute,
      device: dev,
      apiLevel: this.apiLevel,
      widgets: widgetsList,
      toasts: toastsList,
      ascii,
      svg
    };
  }

  _renderAscii(dev, route, widgets, toasts) {
    const W = 46;
    const isRound = dev.screenShape === 'round' || dev.shape === 'round';
    const lines = [];

    const padCenter = (str, len) => {
      if (str.length >= len) return str.slice(0, len);
      const left = Math.floor((len - str.length) / 2);
      const right = len - str.length - left;
      return ' '.repeat(left) + str + ' '.repeat(right);
    };

    lines.push(`╭${'─'.repeat(W)}╮`);
    lines.push(`│${padCenter(`⌚ ${dev.deviceName} [API ${this.apiLevel}]`, W)}│`);
    lines.push(`│${padCenter(`📍 Route: ${route || 'None'}`, W)}│`);
    lines.push(`├${'─'.repeat(W)}┤`);

    if (toasts.length > 0) {
      for (const t of toasts) {
        lines.push(`│${padCenter(`🔔 [TOAST] ${t}`, W)}│`);
      }
      lines.push(`├${'─'.repeat(W)}┤`);
    }

    if (widgets.length === 0) {
      lines.push(`│${' '.repeat(W)}│`);
      lines.push(`│${padCenter('(Empty Screen - No Widgets)', W)}│`);
      lines.push(`│${' '.repeat(W)}│`);
    } else {
      for (const w of widgets) {
        if (!w.visible) continue;
        let lineContent = '';
        if (w.text) {
          if (w.type === 'BUTTON') {
            lineContent = `[ ${w.text} ]`;
          } else {
            lineContent = `${w.text}`;
          }
        } else if (w.icon) {
          lineContent = `🖼️ [${w.type}: ${w.icon}]`;
        } else {
          lineContent = `• ${w.type} (${w.bounds.w}x${w.bounds.h})`;
        }
        lines.push(`│ ${lineContent.padEnd(W - 2).slice(0, W - 2)} │`);
      }
    }

    lines.push(`╰${'─'.repeat(W)}╯`);
    return lines.join('\n');
  }

  _renderSvg(dev, width, height, isRound, widgets, toasts) {
    const radius = isRound ? Math.floor(width / 2) : 24;
    const clipId = `screen-clip-${Date.now()}`;
    const svgParts = [];

    svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
    svgParts.push(`  <defs>`);
    svgParts.push(`    <clipPath id="${clipId}">`);
    if (isRound) {
      svgParts.push(`      <circle cx="${width / 2}" cy="${height / 2}" r="${radius}" />`);
    } else {
      svgParts.push(`      <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" />`);
    }
    svgParts.push(`    </clipPath>`);
    svgParts.push(`  </defs>`);

    // Outer bezel
    if (isRound) {
      svgParts.push(`  <circle cx="${width / 2}" cy="${height / 2}" r="${width / 2}" fill="#111111" stroke="#333333" stroke-width="4" />`);
    } else {
      svgParts.push(`  <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#111111" stroke="#333333" stroke-width="4" />`);
    }

    // Screen Content
    svgParts.push(`  <g clip-path="url(#${clipId})">`);
    svgParts.push(`    <rect x="0" y="0" width="${width}" height="${height}" fill="#000000" />`);

    for (const w of widgets) {
      if (!w.visible) continue;
      const x = w.bounds.x;
      const y = w.bounds.y;
      const bw = w.bounds.w || 100;
      const bh = w.bounds.h || 40;
      const text = (w.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      if (w.type === 'BUTTON') {
        const fill = '#222222';
        svgParts.push(`    <rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="12" fill="${fill}" stroke="#444444" stroke-width="1.5" />`);
        if (text) {
          svgParts.push(`    <text x="${x + bw / 2}" y="${y + bh / 2 + 5}" fill="#ffffff" font-size="18" font-family="sans-serif" text-anchor="middle">${text}</text>`);
        }
      } else if (text) {
        const color = typeof w.colors.color === 'number' ? `#${w.colors.color.toString(16).padStart(6, '0')}` : '#ffffff';
        svgParts.push(`    <text x="${x}" y="${y + 20}" fill="${color}" font-size="20" font-family="sans-serif">${text}</text>`);
      } else if (w.type === 'FILL_RECT' || w.type === 'STROKE_RECT') {
        const fill = typeof w.colors.color === 'number' ? `#${w.colors.color.toString(16).padStart(6, '0')}` : '#333333';
        svgParts.push(`    <rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${fill}" />`);
      } else if (w.type === 'ARC' || w.type === 'ARC_PROGRESS') {
        svgParts.push(`    <circle cx="${x + bw / 2}" cy="${y + bh / 2}" r="${Math.min(bw, bh) / 2}" fill="none" stroke="#00d1b2" stroke-width="6" />`);
      }
    }

    // Toast overlay
    if (toasts.length > 0) {
      const toastText = toasts[toasts.length - 1].replace(/&/g, '&amp;').replace(/</g, '&lt;');
      const tw = Math.min(width - 40, 320);
      const tx = Math.floor((width - tw) / 2);
      svgParts.push(`    <g transform="translate(0, 40)">`);
      svgParts.push(`      <rect x="${tx}" y="0" width="${tw}" height="44" rx="22" fill="#2c2c2c" stroke="#555555" stroke-width="1.5" opacity="0.95" />`);
      svgParts.push(`      <text x="${width / 2}" y="27" fill="#ffffff" font-size="16" font-family="sans-serif" text-anchor="middle">🔔 ${toastText}</text>`);
      svgParts.push(`    </g>`);
    }

    svgParts.push(`  </g>`);
    svgParts.push(`</svg>`);

    return svgParts.join('\n');
  }

  renderScreen(canvasCtx) {
    if (!canvasCtx) return;
    const dev = this.getDeviceInfo();
    const width = dev.screenWidth || 480;
    const height = dev.screenHeight || 480;
    const shape = dev.screenShape || 'round';
    const radius = dev.radius || 0;

    canvasCtx.save();

    // Clear background
    canvasCtx.fillStyle = '#0a0a0a';
    if (shape === 'round') {
      canvasCtx.beginPath();
      canvasCtx.arc(width / 2, height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
      canvasCtx.fill();
      canvasCtx.clip();
    } else {
      canvasCtx.beginPath();
      if (typeof canvasCtx.roundRect === 'function') {
        canvasCtx.roundRect(0, 0, width, height, radius);
      } else {
        canvasCtx.rect(0, 0, width, height);
      }
      canvasCtx.fill();
      canvasCtx.clip();
    }

    const formatColor = (c, fallback = '#ffffff') => {
      if (c === undefined || c === null) return fallback;
      if (typeof c === 'string') return c.startsWith('#') || c.startsWith('rgb') ? c : `#${c}`;
      if (typeof c === 'number') return `#${c.toString(16).padStart(6, '0')}`;
      return fallback;
    };

    // Draw widgets
    for (const w of this.widgets) {
      if (w.visible === false) continue;

      const x = w.props?.x ?? w.config?.x ?? 0;
      const y = w.props?.y ?? w.config?.y ?? 0;
      const bw = w.props?.w ?? w.config?.w ?? 0;
      const bh = w.props?.h ?? w.config?.h ?? 0;
      const rad = w.props?.radius ?? 0;

      const typeCode = typeof w.type === 'number' ? w.type : WIDGET_TYPES[w.type];

      switch (typeCode) {
        case WIDGET_TYPES.FILL_RECT: {
          canvasCtx.fillStyle = formatColor(w.props?.color, '#333333');
          if (rad > 0 && typeof canvasCtx.roundRect === 'function') {
            canvasCtx.beginPath();
            canvasCtx.roundRect(x, y, bw, bh, rad);
            canvasCtx.fill();
          } else {
            canvasCtx.fillRect(x, y, bw, bh);
          }
          break;
        }
        case WIDGET_TYPES.STROKE_RECT: {
          canvasCtx.strokeStyle = formatColor(w.props?.color, '#666666');
          canvasCtx.lineWidth = w.props?.line_width || 1;
          if (rad > 0 && typeof canvasCtx.roundRect === 'function') {
            canvasCtx.beginPath();
            canvasCtx.roundRect(x, y, bw, bh, rad);
            canvasCtx.stroke();
          } else {
            canvasCtx.strokeRect(x, y, bw, bh);
          }
          break;
        }
        case WIDGET_TYPES.BUTTON: {
          canvasCtx.fillStyle = formatColor(w.props?.normal_color || w.props?.color, '#2563eb');
          if (rad > 0 && typeof canvasCtx.roundRect === 'function') {
            canvasCtx.beginPath();
            canvasCtx.roundRect(x, y, bw, bh, rad);
            canvasCtx.fill();
          } else {
            canvasCtx.fillRect(x, y, bw, bh);
          }
          const label = w.props?.text || w.props?.label || '';
          const fontSize = w.props?.text_size || 20;
          canvasCtx.fillStyle = formatColor(w.props?.text_color, '#ffffff');
          canvasCtx.font = `${fontSize}px sans-serif`;
          canvasCtx.textAlign = 'center';
          canvasCtx.textBaseline = 'middle';
          canvasCtx.fillText(label, x + bw / 2, y + bh / 2);
          break;
        }
        case WIDGET_TYPES.TEXT: {
          const text = w.props?.text !== undefined ? String(w.props.text) : '';
          const fontSize = w.props?.text_size || 20;
          canvasCtx.fillStyle = formatColor(w.props?.color, '#ffffff');
          canvasCtx.font = `${fontSize}px sans-serif`;
          if (w.props?.align_h === 2) {
            canvasCtx.textAlign = 'center';
            canvasCtx.fillText(text, x + bw / 2, y + fontSize);
          } else if (w.props?.align_h === 3) {
            canvasCtx.textAlign = 'right';
            canvasCtx.fillText(text, x + bw, y + fontSize);
          } else {
            canvasCtx.textAlign = 'left';
            canvasCtx.fillText(text, x, y + fontSize);
          }
          break;
        }
        case WIDGET_TYPES.ARC:
        case WIDGET_TYPES.ARC_PROGRESS: {
          const cx = x + bw / 2;
          const cy = y + bh / 2;
          const r = Math.min(bw, bh) / 2;
          const lw = w.props?.line_width || 8;
          canvasCtx.strokeStyle = formatColor(w.props?.color, '#38bdf8');
          canvasCtx.lineWidth = lw;
          canvasCtx.beginPath();
          canvasCtx.arc(cx, cy, Math.max(1, r - lw / 2), 0, Math.PI * 2);
          canvasCtx.stroke();
          break;
        }
        default:
          break;
      }
    }

    canvasCtx.restore();
  }

  async close() {
    if (this._activeTimers) {
      for (const t of this._activeTimers) {
        clearTimeout(t);
        clearInterval(t);
      }
      this._activeTimers.clear();
    }
    this.exit();
    this.appServiceRunner.exit();
  }

  destroy() {
    return this.close();
  }
}

// Global active instance for single-session emulator operations
let activeEngine = null;

export function getActiveEngine() {
  if (!activeEngine) {
    activeEngine = new ZeppRuntimeEngine();
  }
  return activeEngine;
}

export function setActiveEngine(engine) {
  activeEngine = engine;
}

export default ZeppRuntimeEngine;
