/**
 * Settings Runner
 * Renders Zepp OS companion settings page, building virtual DOM tree and bridging settingsStorage to AppSideService
 */

import fs from 'fs';
import path from 'path';

export class SettingsStorage {
  constructor(initialData = {}, onValueChange = null) {
    this._store = new Map(Object.entries(initialData || {}));
    this._listeners = new Map();
    this.onValueChange = onValueChange;
  }

  getItem(key, defaultVal = null) {
    const val = this._store.get(key);
    return val !== undefined ? val : defaultVal;
  }

  setItem(key, value) {
    const oldValue = this._store.get(key);
    this._store.set(key, value);
    this.emit('change', { key, newValue: value, oldValue });
    if (typeof this.onValueChange === 'function') {
      this.onValueChange({ key, newValue: value, oldValue });
    }
  }

  removeItem(key) {
    const oldValue = this._store.get(key);
    this._store.delete(key);
    this.emit('change', { key, newValue: undefined, oldValue });
    if (typeof this.onValueChange === 'function') {
      this.onValueChange({ key, newValue: undefined, oldValue });
    }
  }

  clear() {
    this._store.clear();
    this.emit('change', { key: '*', newValue: null, oldValue: null });
  }

  addListener(event, cb) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(cb);
  }

  removeListener(event, cb) {
    if (this._listeners.has(event)) {
      this._listeners.get(event).delete(cb);
    }
  }

  emit(event, data) {
    const cbs = this._listeners.get(event);
    if (cbs) {
      for (const cb of cbs) {
        try { cb(data); } catch (e) { console.error('SettingsStorage listener error:', e); }
      }
    }
  }

  toObject() {
    return Object.fromEntries(this._store.entries());
  }
}

// UI Component Builders for AppSettingsPage
export function View(props = {}, children = []) {
  return {
    type: 'View',
    props: { ...props },
    children: Array.isArray(children) ? children.flat().filter(Boolean) : (children ? [children] : [])
  };
}

export function Section(props = {}, children = []) {
  return {
    type: 'Section',
    props: { ...props },
    children: Array.isArray(children) ? children.flat().filter(Boolean) : (children ? [children] : [])
  };
}

export function Text(props = {}, textContent = '') {
  let text = '';
  let finalProps = {};
  if (typeof props === 'string') {
    text = props;
  } else {
    finalProps = { ...props };
    text = textContent || finalProps.text || finalProps.value || '';
  }
  return {
    type: 'Text',
    props: finalProps,
    text: String(text)
  };
}

export function TextInput(props = {}) {
  return {
    type: 'TextInput',
    props: { ...props },
    value: props.value || ''
  };
}

export function Select(props = {}) {
  return {
    type: 'Select',
    props: { ...props },
    value: props.value,
    options: Array.isArray(props.options) ? props.options : []
  };
}

export function Toggle(props = {}) {
  return {
    type: 'Toggle',
    props: { ...props },
    value: Boolean(props.value)
  };
}

export function Button(props = {}, label = '') {
  let lbl = '';
  let finalProps = {};
  if (typeof props === 'string') {
    lbl = props;
  } else {
    finalProps = { ...props };
    lbl = label || finalProps.label || finalProps.text || '';
  }
  return {
    type: 'Button',
    props: finalProps,
    label: String(lbl)
  };
}

export function Slider(props = {}) {
  return {
    type: 'Slider',
    props: { ...props },
    value: props.value
  };
}

export function Radio(props = {}) {
  return {
    type: 'Radio',
    props: { ...props },
    value: props.value
  };
}

export class SettingsRunner {
  constructor(engine, options = {}) {
    this.engine = engine;
    this.options = options;
    this.builder = null;
    this.virtualTree = null;

    this.storage = (engine && engine.settingsStorage) || new SettingsStorage(options.initialSettings || {}, (change) => {
      if (this.engine && this.engine.appSideRunner) {
        this.engine.appSideRunner.notifySettingsChange(change);
      }
    });
  }

  get tree() {
    return this.virtualTree;
  }

  async load() {
    const projectPath = this.engine.projectPath;
    if (!projectPath) return null;

    let settingFile = this.options.settingPath;
    if (!settingFile) {
      const candidates = [
        path.join(projectPath, 'setting', 'index.js'),
        path.join(projectPath, 'setting.js')
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          settingFile = c;
          break;
        }
      }
    }

    if (!settingFile || !fs.existsSync(settingFile)) {
      return null;
    }

    // Prepare global builders
    this.engine._settingsDefinition = null;

    // Load file through module loader
    this.engine.moduleLoader.loadFile(settingFile);

    this.builder = this.engine._settingsDefinition;
    return this.render();
  }

  render() {
    if (!this.builder) return null;

    const props = {
      settingsStorage: this.storage,
      settings: this.storage
    };

    if (typeof this.builder === 'function') {
      this.virtualTree = this.builder(props);
    } else if (this.builder && typeof this.builder.build === 'function') {
      this.virtualTree = this.builder.build(props);
    }
    return this.virtualTree;
  }

  getVirtualTree() {
    return this.virtualTree;
  }

  updateSetting(key, value) {
    this.storage.setItem(key, value);
    return this.render();
  }
}

export default SettingsRunner;
