/**
 * App Side Service Runner
 * Runs app-side companion scripts for Zepp OS with request/response messaging and settings bridge
 */

import fs from 'fs';
import path from 'path';

export class AppSideRunner {
  constructor(engine, options = {}) {
    this.engine = engine;
    this.options = options;
    this.serviceInstance = null;
    this.serviceContext = null;
    this.running = false;

    // Push message listeners on watch
    this.watchMessageListeners = new Set();
  }

  async start() {
    const projectPath = this.engine.projectPath;
    if (!projectPath) return;

    let appSideFile = this.options.appSidePath;
    if (!appSideFile) {
      const candidates = [
        path.join(projectPath, 'app-side', 'index.js'),
        path.join(projectPath, 'app-side.js')
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          appSideFile = c;
          break;
        }
      }
    }

    if (!appSideFile || !fs.existsSync(appSideFile)) {
      return;
    }

    // Set up side service environment
    const self = this;
    const settingsLib = {
      getItem: (k) => self.engine.settingsStorage.getItem(k),
      setItem: (k, v) => self.engine.settingsStorage.setItem(k, v),
      removeItem: (k) => self.engine.settingsStorage.removeItem(k),
      clear: () => self.engine.settingsStorage.clear(),
      getAll: () => self.engine.settingsStorage.toObject(),
      onChange: (cb) => {
        self.engine.settingsStorage.addListener('change', cb);
        return settingsLib;
      },
      offChange: (cb) => {
        self.engine.settingsStorage.removeListener('change', cb);
        return settingsLib;
      }
    };

    const sideContext = {
      settings: settingsLib,
      call(data) {
        self.engine.handleSidePushMessage(data);
      }
    };
    this.serviceContext = sideContext;

    // Load module via engine's module loader
    this.engine._appSideDefinition = null;
    this.engine.moduleLoader.loadFile(appSideFile);

    const def = this.engine._appSideDefinition;
    if (def) {
      this.serviceInstance = typeof def === 'function' ? def(sideContext) : def;
      Object.assign(sideContext, this.serviceInstance);

      if (typeof this.serviceInstance.onInit === 'function') {
        await this.serviceInstance.onInit.call(sideContext);
      }
      if (typeof this.serviceInstance.onRun === 'function') {
        await this.serviceInstance.onRun.call(sideContext);
      }
      this.running = true;
    }
  }

  handleRequest(req) {
    return new Promise((resolve, reject) => {
      if (!this.serviceInstance) {
        return reject(new Error('AppSideService not running or no onRequest defined'));
      }
      if (typeof this.serviceInstance.onRequest !== 'function') {
        return reject(new Error('AppSideService does not define onRequest handler'));
      }

      let responded = false;
      const res = (err, data) => {
        if (responded) return;
        responded = true;
        if (err) {
          reject(typeof err === 'string' ? new Error(err) : err);
        } else {
          resolve(data);
        }
      };

      try {
        const ret = this.serviceInstance.onRequest.call(this.serviceContext, req, res);
        if (ret && typeof ret.then === 'function') {
          ret.catch((e) => {
            if (!responded) {
              responded = true;
              reject(e);
            }
          });
        }
      } catch (err) {
        if (!responded) {
          responded = true;
          reject(err);
        }
      }
    });
  }

  handleWatchMessage(data) {
    if (this.serviceInstance && typeof this.serviceInstance.onReceived === 'function') {
      try {
        this.serviceInstance.onReceived.call(this.serviceContext, data);
      } catch (err) {
        console.error('Error in AppSide onReceived:', err);
      }
    }
  }

  notifySettingsChange({ key, newValue, oldValue }) {
    if (this.serviceInstance) {
      if (typeof this.serviceInstance.onSettingsChange === 'function') {
        try {
          this.serviceInstance.onSettingsChange.call(this.serviceContext, { key, newValue, oldValue });
        } catch (err) {
          console.error('Error calling onSettingsChange on AppSideService:', err);
        }
      }
    }
  }

  destroy() {
    if (this.serviceInstance && typeof this.serviceInstance.onDestroy === 'function') {
      try {
        this.serviceInstance.onDestroy.call(this.serviceContext);
      } catch (err) {
        console.error('Error in AppSide onDestroy:', err);
      }
    }
    this.running = false;
    this.serviceInstance = null;
  }
}

export default AppSideRunner;
