/**
 * ZeppPlaywright - Playwright-style Testing Framework for Zepp OS
 * Unofficial ZeppOS testing & automation layer
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Helper to flush asynchronous event loop ticks and microtasks
export async function flushAsync(ticks = 5, delayMs = 15) {
  for (let i = 0; i < ticks; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

/**
 * Resolves properties from widget object across different runtime representations
 */
export function getWidgetProperty(widget, prop) {
  if (!widget) return undefined;
  if (typeof widget.getProperty === 'function') {
    const val = widget.getProperty(prop);
    if (val !== undefined && val !== null) return val;
  }
  if (widget.props && widget.props[prop] !== undefined) return widget.props[prop];
  if (widget._props && widget._props[prop] !== undefined) return widget._props[prop];
  if (widget.param && widget.param[prop] !== undefined) return widget.param[prop];
  if (widget.config && widget.config[prop] !== undefined) return widget.config[prop];
  if (widget.options && widget.options[prop] !== undefined) return widget.options[prop];
  if (widget[prop] !== undefined) return widget[prop];
  return undefined;
}

export function getWidgetText(widget) {
  if (!widget) return '';
  const text =
    getWidgetProperty(widget, 'text') ??
    getWidgetProperty(widget, 'title') ??
    getWidgetProperty(widget, 'label') ??
    getWidgetProperty(widget, 'content');
  if (text !== undefined && text !== null) return String(text);
  if (typeof widget.getText === 'function') return String(widget.getText());
  return '';
}

export function getWidgetIcon(widget) {
  if (!widget) return '';
  const icon =
    getWidgetProperty(widget, 'src') ??
    getWidgetProperty(widget, 'icon') ??
    getWidgetProperty(widget, 'image');
  if (icon !== undefined && icon !== null) return String(icon);
  return '';
}

export function getWidgetType(widget) {
  if (!widget) return '';
  if (widget.typeName) return String(widget.typeName);
  if (typeof widget.type === 'string') return widget.type;
  if (widget.props && typeof widget.props.type === 'string') return widget.props.type;
  if (widget.constructor && widget.constructor.name) {
    const name = widget.constructor.name.replace(/Widget$/, '').toUpperCase();
    if (name && name !== 'OBJECT') return name;
  }
  return '';
}

export function isWidgetVisible(widget) {
  if (!widget) return false;
  const hidden = getWidgetProperty(widget, 'hidden');
  if (hidden === true) return false;
  const visible = getWidgetProperty(widget, 'visible');
  if (visible === false) return false;
  const display = getWidgetProperty(widget, 'display');
  if (display === false || display === 'none') return false;
  return true;
}

export function matchWidget(widget, query = {}) {
  if (!widget) return false;

  // Match by id
  if (query.id !== undefined) {
    const customId = getWidgetProperty(widget, 'id');
    const autoId = widget.id ?? widget._id;
    if (String(customId) !== String(query.id) && String(autoId) !== String(query.id)) return false;
  }

  // Match by type
  if (query.type !== undefined) {
    const wtype = getWidgetType(widget).toUpperCase();
    const qtype = String(query.type).toUpperCase();
    if (!wtype.includes(qtype) && !qtype.includes(wtype)) return false;
  }

  // Match by icon / src
  if (query.icon !== undefined) {
    const icon = getWidgetIcon(widget);
    if (query.icon instanceof RegExp) {
      if (!query.icon.test(icon)) return false;
    } else {
      if (!icon.includes(String(query.icon))) return false;
    }
  }

  // Match by role
  if (query.role !== undefined) {
    const role = String(query.role).toLowerCase();
    const wtype = getWidgetType(widget).toLowerCase();
    let matchesRole = false;

    if (role === 'button') {
      matchesRole =
        wtype.includes('button') ||
        typeof getWidgetProperty(widget, 'click_func') === 'function' ||
        getWidgetProperty(widget, 'type') === 'button';
    } else if (role === 'toggle' || role === 'switch' || role === 'checkbox') {
      matchesRole =
        wtype.includes('toggle') ||
        wtype.includes('switch') ||
        wtype.includes('checkbox') ||
        getWidgetProperty(widget, 'checked') !== undefined;
    } else if (role === 'image' || role === 'img') {
      matchesRole = wtype.includes('img') || wtype.includes('image') || Boolean(getWidgetIcon(widget));
    } else if (role === 'text') {
      matchesRole = wtype.includes('text');
    } else {
      matchesRole = wtype.includes(role);
    }

    if (!matchesRole) return false;

    if (query.name !== undefined) {
      const text = getWidgetText(widget);
      if (query.name instanceof RegExp) {
        if (!query.name.test(text)) return false;
      } else {
        if (!text.includes(String(query.name))) return false;
      }
    }
  }

  // Match by text
  if (query.text !== undefined) {
    const text = getWidgetText(widget);
    if (query.text instanceof RegExp) {
      if (!query.text.test(text)) return false;
    } else {
      if (!text.includes(String(query.text))) return false;
    }
  }

  return true;
}

/**
 * Locator represents one or more widgets on the watch screen
 */
export class Locator {
  constructor(session, query = {}, options = {}) {
    this.session = session;
    this.query = query;
    this.options = { index: options.index ?? null };
  }

  _describe() {
    return JSON.stringify({ ...this.query, index: this.options.index });
  }

  _getAllElements() {
    const widgets = this.session.getWidgets();
    return widgets.filter((w) => matchWidget(w, this.query));
  }

  _resolveElement() {
    const matched = this._getAllElements();
    if (this.options.index !== null) {
      const idx =
        this.options.index < 0 ? matched.length + this.options.index : this.options.index;
      return matched[idx] || null;
    }
    return matched[0] || null;
  }

  async click() {
    const widget = this._resolveElement();
    if (!widget) {
      throw new Error(`Locator.click(): Widget not found matching query ${this._describe()}`);
    }

    // Use engine's clickWidget if available
    if (this.session.engine && typeof this.session.engine.clickWidget === 'function') {
      await this.session.engine.clickWidget(widget);
    } else {
      // Trigger click_func, on_CLICK_UP, or event listener
      const clickFunc =
        getWidgetProperty(widget, 'click_func') ??
        getWidgetProperty(widget, 'onClick') ??
        widget.click_func;
      if (typeof clickFunc === 'function') {
        await clickFunc(widget);
      } else if (typeof widget.trigger === 'function') {
        await widget.trigger('click');
      } else if (typeof widget.fireEvent === 'function') {
        await widget.fireEvent('click');
      }
    }

    // Record interaction in session for coverage metrics
    this.session._recordInteraction({
      type: 'click',
      widgetType: getWidgetType(widget),
      text: getWidgetText(widget),
      icon: getWidgetIcon(widget)
    });

    // Await async microtasks, network mock requests, and message passing
    await flushAsync(6, 20);
  }

  async setChecked(val) {
    const widget = this._resolveElement();
    if (!widget) {
      throw new Error(`Locator.setChecked(): Widget not found matching query ${this._describe()}`);
    }
    const boolVal = Boolean(val);

    if (typeof widget.setProperty === 'function') {
      widget.setProperty('checked', boolVal);
    }
    if (widget.props) widget.props.checked = boolVal;
    if (widget._props) widget._props.checked = boolVal;

    const changeFunc =
      getWidgetProperty(widget, 'change_func') ??
      getWidgetProperty(widget, 'onChange') ??
      getWidgetProperty(widget, 'click_func');
    if (typeof changeFunc === 'function') {
      await changeFunc(widget, boolVal);
    }

    this.session._recordInteraction({
      type: 'setChecked',
      widgetType: getWidgetType(widget),
      value: boolVal
    });

    await flushAsync(4, 15);
  }

  async scrollIntoView() {
    const widget = this._resolveElement();
    if (widget && widget.parent && typeof widget.parent.scrollTo === 'function') {
      const y = getWidgetProperty(widget, 'y') || 0;
      widget.parent.scrollTo(y);
    }
    await flushAsync(1, 10);
  }

  async textContent() {
    const widget = this._resolveElement();
    return widget ? getWidgetText(widget) : '';
  }

  async getAttribute(prop) {
    const widget = this._resolveElement();
    return widget ? getWidgetProperty(widget, prop) : undefined;
  }

  async count() {
    return this._getAllElements().length;
  }

  first() {
    return new Locator(this.session, this.query, { index: 0 });
  }

  last() {
    return new Locator(this.session, this.query, { index: -1 });
  }

  nth(i) {
    return new Locator(this.session, this.query, { index: i });
  }

  async isVisible() {
    const widget = this._resolveElement();
    return Boolean(widget && isWidgetVisible(widget));
  }
}

/**
 * SettingsLocator represents setting controls on the companion settings page
 */
export class SettingsLocator {
  constructor(settingsSession, query = {}) {
    this.settingsSession = settingsSession;
    this.session = settingsSession.session;
    this.query = query;
  }

  _resolveItem() {
    return this.settingsSession._findSettingItem(this.query);
  }

  async fill(value) {
    const item = this._resolveItem();
    const strVal = String(value);

    // Update settingsStorage or engine setting
    const key = item?.key || item?.props?.key || (typeof this.query.label === 'string' ? this.query.label : null);
    if (key) {
      this.session.updateSetting(key, strVal);
    }

    // Trigger item onChange callback if present
    if (item && typeof item.onChange === 'function') {
      await item.onChange(strVal);
    } else if (item?.props && typeof item.props.onChange === 'function') {
      await item.props.onChange(strVal);
    }

    this.session._recordInteraction({
      type: 'settings_fill',
      key: key || 'unknown',
      value: strVal
    });

    await flushAsync(6, 20);
  }

  async click() {
    const item = this._resolveItem();
    if (item && typeof item.onClick === 'function') {
      await item.onClick();
    } else if (item?.props && typeof item.props.onClick === 'function') {
      await item.props.onClick();
    } else if (item && typeof item.click_func === 'function') {
      await item.click_func();
    } else if (item?.props && typeof item.props.click_func === 'function') {
      await item.props.click_func();
    }

    this.session._recordInteraction({
      type: 'settings_click',
      name: this.query.name || this.query.label || 'unknown'
    });

    await flushAsync(5, 15);
  }

  async setChecked(value) {
    const boolVal = Boolean(value);
    const item = this._resolveItem();
    const key = item?.key || item?.props?.key || (typeof this.query.label === 'string' ? this.query.label : null);

    if (key) {
      this.session.updateSetting(key, boolVal);
    }

    if (item && typeof item.onChange === 'function') {
      await item.onChange(boolVal);
    } else if (item?.props && typeof item.props.onChange === 'function') {
      await item.props.onChange(boolVal);
    }

    this.session._recordInteraction({
      type: 'settings_setChecked',
      key: key || 'unknown',
      value: boolVal
    });

    await flushAsync(5, 15);
  }

  async value() {
    const item = this._resolveItem();
    if (item && item.value !== undefined) return item.value;
    const key = item?.key || (typeof this.query.label === 'string' ? this.query.label : null);
    if (key) {
      return this.settingsSession.getSettingValue(key);
    }
    return undefined;
  }
}

/**
 * SettingsPageSession represents the companion settings page session
 */
export class SettingsPageSession {
  constructor(session) {
    this.session = session;
  }

  _getStorage() {
    const engine = this.session.engine;
    if (engine.settingsRunner && engine.settingsRunner.storage) {
      return engine.settingsRunner.storage;
    }
    if (engine.settingsStorage) return engine.settingsStorage;
    if (engine.settings) return engine.settings;
    return null;
  }

  getSettingValue(key) {
    const storage = this._getStorage();
    if (!storage) return undefined;
    if (typeof storage.getItem === 'function') return storage.getItem(key);
    return storage[key];
  }

  _findSettingItem(query = {}) {
    const engine = this.session.engine;
    const tree =
      engine.settingsRunner?.tree ||
      engine.settingsRunner?.virtualTree ||
      engine.settingsRunner?.getVirtualTree?.() ||
      engine.settingsPageTree ||
      engine.settingsTree ||
      [];

    const search = (nodeOrList) => {
      if (!nodeOrList) return null;
      const nodes = Array.isArray(nodeOrList) ? nodeOrList : [nodeOrList];
      for (const node of nodes) {
        if (!node) continue;
        let matched = true;

        if (query.label !== undefined) {
          const lbl = node.label || node.title || node.name || node.props?.label || node.props?.title || '';
          if (query.label instanceof RegExp) {
            matched = query.label.test(lbl);
          } else {
            matched = lbl.toLowerCase().includes(String(query.label).toLowerCase());
          }
        }

        if (matched && query.role !== undefined) {
          const role = String(query.role).toLowerCase();
          const nodeType = (node.type || node.component || '').toLowerCase();
          if (role === 'button') matched = nodeType.includes('button');
          else if (role === 'toggle' || role === 'switch') matched = nodeType.includes('toggle') || nodeType.includes('switch');
          else if (role === 'input' || role === 'textinput') matched = nodeType.includes('input');
          else if (role === 'select') matched = nodeType.includes('select');
        }

        if (matched && query.name !== undefined) {
          const name = node.name || node.label || node.text || node.props?.label || node.props?.name || '';
          if (query.name instanceof RegExp) {
            matched = query.name.test(name);
          } else {
            matched = name.includes(String(query.name));
          }
        }

        if (matched && (query.label !== undefined || query.role !== undefined || query.name !== undefined)) {
          return node;
        }

        if (node.children) {
          const found = search(node.children);
          if (found) return found;
        }
      }
      return null;
    };

    const found = search(tree);
    if (found) return found;

    // Fallback: create synthesized item linked directly to storage
    const key = query.label || query.name;
    if (key && typeof key === 'string') {
      return {
        key,
        label: key,
        value: this.getSettingValue(key)
      };
    }
    return null;
  }

  getByLabel(labelOrRegExp) {
    return new SettingsLocator(this, { label: labelOrRegExp });
  }

  getByRole(role, { name } = {}) {
    return new SettingsLocator(this, { role, name });
  }

  async fill(label, value) {
    await this.getByLabel(label).fill(value);
  }

  async click(name) {
    await this.getByRole('button', { name }).click();
  }
}

/**
 * WatchSession provides fluent Playwright-style APIs for Zepp OS testing
 */
export class WatchSession {
  constructor(engine, options = {}) {
    this.engine = engine;
    this.options = options;
    this._settingsPage = new SettingsPageSession(this);
    this._interactedWidgets = [];
    this._visitedRoutes = new Set();

    const initialRoute = this.getRoute();
    if (initialRoute) this._visitedRoutes.add(initialRoute);
  }

  get settingsPage() {
    return this._settingsPage;
  }

  _recordInteraction(info) {
    this._interactedWidgets.push({
      ...info,
      route: this.getRoute(),
      time: Date.now()
    });
  }

  getByText(textOrRegExp) {
    return new Locator(this, { text: textOrRegExp });
  }

  getByRole(role, { name } = {}) {
    return new Locator(this, { role, name });
  }

  getByIcon(iconPathOrRegExp) {
    return new Locator(this, { icon: iconPathOrRegExp });
  }

  locator(selector) {
    if (typeof selector === 'string') {
      if (selector.startsWith('#')) {
        return new Locator(this, { id: selector.slice(1) });
      }
      return new Locator(this, { text: selector });
    }
    return new Locator(this, selector || {});
  }

  async click(locatorOrText) {
    if (locatorOrText instanceof Locator) {
      return await locatorOrText.click();
    }
    return await this.getByText(locatorOrText).click();
  }

  async navigate(url, params) {
    if (typeof this.engine.navigate === 'function') {
      await this.engine.navigate(url, params);
    } else if (this.engine.router && typeof this.engine.router.push === 'function') {
      await this.engine.router.push({ url, params });
    }
    const currentRoute = this.getRoute();
    if (currentRoute) this._visitedRoutes.add(currentRoute);
    await flushAsync(5, 20);
  }

  async back() {
    if (typeof this.engine.back === 'function') {
      await this.engine.back();
    } else if (this.engine.router && typeof this.engine.router.back === 'function') {
      await this.engine.router.back();
    }
    const currentRoute = this.getRoute();
    if (currentRoute) this._visitedRoutes.add(currentRoute);
    await flushAsync(4, 15);
  }

  async setSensors(sensors) {
    if (typeof this.engine.setSensors === 'function') {
      this.engine.setSensors(sensors);
    } else if (this.engine.sensorState && typeof this.engine.sensorState.set === 'function') {
      for (const [k, v] of Object.entries(sensors)) {
        this.engine.sensorState.set(k, v);
      }
    }
    await flushAsync(2, 10);
  }

  updateSetting(key, value) {
    if (typeof this.engine.updateSetting === 'function') {
      this.engine.updateSetting(key, value);
    } else if (this.engine.settingsStorage && typeof this.engine.settingsStorage.setItem === 'function') {
      this.engine.settingsStorage.setItem(key, value);
    } else if (this.engine.settings) {
      this.engine.settings[key] = value;
    }
  }

  getRoute() {
    if (typeof this.engine.getRoute === 'function') {
      return this.engine.getRoute();
    }
    return this.engine.currentRoute || this.engine.route || '';
  }

  getToasts() {
    if (typeof this.engine.getToasts === 'function') {
      return this.engine.getToasts();
    }
    if (Array.isArray(this.engine.toasts)) {
      return [...this.engine.toasts];
    }
    return [];
  }

  getWidgets() {
    if (typeof this.engine.getWidgets === 'function') {
      return this.engine.getWidgets();
    }
    if (Array.isArray(this.engine.widgets)) {
      return this.engine.widgets;
    }
    if (typeof this.engine.getScreenState === 'function') {
      const state = this.engine.getScreenState();
      if (state && Array.isArray(state.widgets)) return state.widgets;
    }
    return [];
  }

  async close() {
    if (typeof this.engine.close === 'function') {
      await this.engine.close();
    } else if (typeof this.engine.destroy === 'function') {
      await this.engine.destroy();
    }
  }

  getMetrics() {
    return {
      visitedRoutes: Array.from(this._visitedRoutes),
      interactedWidgets: [...this._interactedWidgets]
    };
  }
}

/**
 * Polling assertion helper
 */
async function pollCondition(fn, { timeout = 2000, interval = 25 } = {}) {
  const start = Date.now();
  let lastError = null;

  while (Date.now() - start < timeout) {
    try {
      const res = await fn();
      if (res) return true;
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  if (lastError) throw lastError;
  return false;
}

/**
 * Playwright-style expect assertions
 */
export function expect(target) {
  const createAssertionObj = (isNot = false) => ({
    get not() {
      return createAssertionObj(!isNot);
    },

    // Locator assertions
    async toBeVisible({ timeout = 2000 } = {}) {
      if (!(target instanceof Locator)) {
        throw new Error('toBeVisible() must be called on a Locator');
      }
      const passed = await pollCondition(
        async () => {
          const visible = await target.isVisible();
          return isNot ? !visible : visible;
        },
        { timeout }
      );
      if (!passed) {
        throw new Error(
          `Expected locator ${target._describe()} ${isNot ? 'NOT to be visible' : 'to be visible'}`
        );
      }
    },

    async toHaveText(expected, { timeout = 2000 } = {}) {
      if (!(target instanceof Locator)) {
        throw new Error('toHaveText() must be called on a Locator');
      }
      let actualText = '';
      const passed = await pollCondition(
        async () => {
          actualText = await target.textContent();
          const matches =
            expected instanceof RegExp
              ? expected.test(actualText)
              : actualText === String(expected);
          return isNot ? !matches : matches;
        },
        { timeout }
      );
      if (!passed) {
        throw new Error(
          `Expected locator ${target._describe()} ${isNot ? 'NOT to have text' : 'to have text'} "${expected}", but found "${actualText}"`
        );
      }
    },

    async toContainText(expected, { timeout = 2000 } = {}) {
      if (!(target instanceof Locator)) {
        throw new Error('toContainText() must be called on a Locator');
      }
      let actualText = '';
      const passed = await pollCondition(
        async () => {
          actualText = await target.textContent();
          const matches =
            expected instanceof RegExp
              ? expected.test(actualText)
              : actualText.includes(String(expected));
          return isNot ? !matches : matches;
        },
        { timeout }
      );
      if (!passed) {
        throw new Error(
          `Expected locator ${target._describe()} ${isNot ? 'NOT to contain text' : 'to contain text'} "${expected}", but found "${actualText}"`
        );
      }
    },

    async toBeChecked({ timeout = 2000 } = {}) {
      if (!(target instanceof Locator)) {
        throw new Error('toBeChecked() must be called on a Locator');
      }
      let actualVal = false;
      const passed = await pollCondition(
        async () => {
          actualVal = Boolean(await target.getAttribute('checked'));
          return isNot ? !actualVal : actualVal;
        },
        { timeout }
      );
      if (!passed) {
        throw new Error(
          `Expected locator ${target._describe()} ${isNot ? 'NOT to be checked' : 'to be checked'}`
        );
      }
    },

    // WatchSession assertions
    async toHaveRoute(expectedRoute, { timeout = 2000 } = {}) {
      if (!(target instanceof WatchSession)) {
        throw new Error('toHaveRoute() must be called on a WatchSession');
      }
      let currentRoute = '';
      const passed = await pollCondition(
        async () => {
          currentRoute = target.getRoute();
          const matches =
            expectedRoute instanceof RegExp
              ? expectedRoute.test(currentRoute)
              : currentRoute.includes(String(expectedRoute));
          return isNot ? !matches : matches;
        },
        { timeout }
      );
      if (!passed) {
        throw new Error(
          `Expected WatchSession ${isNot ? 'NOT to have route' : 'to have route'} "${expectedRoute}", but currently on "${currentRoute}"`
        );
      }
    },

    async toHaveToast(expectedToastTextOrRegExp, { timeout = 2000 } = {}) {
      if (!(target instanceof WatchSession)) {
        throw new Error('toHaveToast() must be called on a WatchSession');
      }
      let currentToasts = [];
      const passed = await pollCondition(
        async () => {
          currentToasts = target.getToasts();
          const hasMatch = currentToasts.some((t) => {
            const content = typeof t === 'string' ? t : t?.content || t?.text || '';
            return expectedToastTextOrRegExp instanceof RegExp
              ? expectedToastTextOrRegExp.test(content)
              : content.includes(String(expectedToastTextOrRegExp));
          });
          return isNot ? !hasMatch : hasMatch;
        },
        { timeout }
      );
      if (!passed) {
        const toastStrs = currentToasts
          .map((t) => (typeof t === 'string' ? t : t?.content || t?.text || JSON.stringify(t)))
          .join(', ');
        throw new Error(
          `Expected WatchSession ${isNot ? 'NOT to have toast' : 'to have toast'} matching "${expectedToastTextOrRegExp}", but toasts were: [${toastStrs}]`
        );
      }
    }
  });

  return createAssertionObj(false);
}

/**
 * Dynamically resolves ZeppRuntimeEngine from ./runtime.js
 */
let cachedEngineClass = null;

export async function getRuntimeEngineClass() {
  if (cachedEngineClass) return cachedEngineClass;
  try {
    const mod = await import('./runtime.js');
    cachedEngineClass = mod.ZeppRuntimeEngine || mod.default || mod;
    return cachedEngineClass;
  } catch (err) {
    throw new Error(
      `Could not load ZeppRuntimeEngine from ./runtime.js: ${err.message}`
    );
  }
}

/**
 * Initializes a new Playwright WatchSession
 */
export async function createWatchSession({
  projectPath,
  device = 'amazfit-balance',
  apiLevel = '3.6.0',
  sensors = {},
  settings = {},
  routes = {}
} = {}) {
  const absPath = resolve(projectPath);
  const EngineClass = await getRuntimeEngineClass();
  const engine = new EngineClass({
    projectPath: absPath,
    device,
    apiLevel,
    sensors,
    settings,
    routes
  });

  if (typeof engine.loadApp === 'function') {
    await engine.loadApp({
      projectPath: absPath,
      device,
      apiLevel,
      sensors,
      settings,
      routes
    });
  } else if (typeof engine.start === 'function') {
    await engine.start();
  }

  await flushAsync(5, 20);
  return new WatchSession(engine, { projectPath: absPath, device, apiLevel });
}
