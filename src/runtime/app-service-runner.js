/**
 * App Service Runner
 * Runs background service scripts for Zepp OS (e.g. reminders, alarms, periodic tasks)
 */

import fs from 'fs';
import path from 'path';

export class AppServiceRunner {
  constructor(engine, options = {}) {
    this.engine = engine;
    this.options = options;
    this.serviceInstance = null;
    this.serviceContext = null;
    this.running = false;
  }

  async load(servicePath = null, initParam = null) {
    const projectPath = this.engine.projectPath;
    if (!projectPath) return null;

    let targetFile = servicePath || this.options.servicePath;
    if (!targetFile) {
      const candidates = [
        path.join(projectPath, 'app-service', 'index.js'),
        path.join(projectPath, 'app-service.js')
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          targetFile = c;
          break;
        }
      }
    } else if (!path.isAbsolute(targetFile)) {
      targetFile = path.resolve(projectPath, targetFile);
      if (!fs.existsSync(targetFile) && fs.existsSync(targetFile + '.js')) {
        targetFile = targetFile + '.js';
      }
    }

    if (!targetFile || !fs.existsSync(targetFile)) {
      return null;
    }

    this.engine._appServiceDefinition = null;

    const self = this;
    this.serviceContext = {
      exit() {
        self.exit();
      }
    };

    // Load module via engine's module loader
    this.engine.moduleLoader.loadFile(targetFile);

    const def = this.engine._appServiceDefinition;
    if (def) {
      this.serviceInstance = typeof def === 'function' ? def(this.serviceContext) : def;
      Object.assign(this.serviceContext, this.serviceInstance);
      this.running = true;

      if (typeof this.serviceInstance.onInit === 'function') {
        await this.serviceInstance.onInit.call(this.serviceContext, initParam);
      }
    }

    return this.serviceInstance;
  }

  async triggerEvent(event) {
    if (this.serviceInstance && typeof this.serviceInstance.onEvent === 'function') {
      return this.serviceInstance.onEvent.call(this.serviceContext, event);
    }
  }

  exit() {
    this.running = false;
    if (this.serviceInstance && typeof this.serviceInstance.onDestroy === 'function') {
      try {
        this.serviceInstance.onDestroy.call(this.serviceContext);
      } catch (err) {
        console.error('Error in AppService onDestroy:', err);
      }
    }
    this.serviceInstance = null;
  }

  destroy() {
    this.exit();
  }
}

export default AppServiceRunner;
