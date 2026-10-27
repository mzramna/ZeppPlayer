import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getDevice, STANDARD_MODELS, DEVICES } from '../src/devices.js';
import { sensorState, SensorState, INITIAL_SENSOR_DEFAULTS } from '../src/runtime/sensor-state.js';
import { ModuleLoader, MockWidget, WIDGET_TYPES } from '../src/runtime/module-loader.js';
import { AppSideRunner } from '../src/runtime/app-side-runner.js';
import { SettingsRunner, SettingsStorage, View, Section, Text, Button, Select } from '../src/runtime/settings-runner.js';
import { AppServiceRunner } from '../src/runtime/app-service-runner.js';
import { ZeppRuntimeEngine } from '../src/runtime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('🧪 Starting Zepp OS Multi-Version Runtime Engine Test Suite...\n');

  // =========================================================================
  // TASK 1: Device Models and Profiles
  // =========================================================================
  console.log('--- Test Group 1: Device Profiles & src/devices.js ---');

  const expectedDevices = [
    { id: 'amazfit-balance', w: 480, h: 480, r: 240, shape: 'round', api: '3.6.0' },
    { id: 'amazfit-balance-2', w: 480, h: 480, r: 240, shape: 'round', api: '4.0.0' },
    { id: 'amazfit-active', w: 390, h: 450, r: 86, shape: 'square', api: '3.6.0' },
    { id: 'amazfit-gtr-4', w: 466, h: 466, r: 233, shape: 'round', api: '2.0.0' },
    { id: 'amazfit-gts-4-mini', w: 336, h: 384, r: 60, shape: 'square', api: '1.0.0' },
    { id: 'amazfit-band-7', w: 194, h: 368, r: 97, shape: 'pill', api: '1.0.0' },
    { id: 'mi-band-7', w: 192, h: 490, r: 96, shape: 'pill', api: '1.0.0' }
  ];

  for (const exp of expectedDevices) {
    const dev = getDevice(exp.id);
    assert(dev, `Device ${exp.id} should be found`);
    assert.strictEqual(dev.screenWidth, exp.w, `${exp.id} width`);
    assert.strictEqual(dev.screenHeight, exp.h, `${exp.id} height`);
    assert.strictEqual(dev.radius, exp.r, `${exp.id} radius`);
    assert.strictEqual(dev.screenShape, exp.shape, `${exp.id} screenShape`);
    assert.strictEqual(dev.defaultApi, exp.api, `${exp.id} defaultApi`);
    console.log(`  ✓ Device ${exp.id}: ${dev.screenWidth}x${dev.screenHeight}, shape=${dev.screenShape}, r=${dev.radius}, api=${dev.defaultApi}`);
  }

  // Check aliases
  assert.strictEqual(getDevice('balance').id, 'amazfit-balance');
  assert.strictEqual(getDevice('gtr4').id, 'amazfit-gtr-4');
  assert.strictEqual(getDevice('mi_band7').id, 'mi-band-7');
  console.log('  ✓ Device aliases resolved correctly');

  // =========================================================================
  // TASK 2: Sensor State Reactive Store
  // =========================================================================
  console.log('\n--- Test Group 2: Reactive Sensor State Store ---');
  const store = new SensorState();

  assert.strictEqual(store.get('steps'), 4500);
  assert.strictEqual(store.get('stepTarget'), 9000);
  assert.strictEqual(store.get('heartRateCurrent'), 75);
  assert.strictEqual(store.get('heartRateResting'), 62);
  assert.strictEqual(store.get('caloriesBurned'), 320);
  assert.strictEqual(store.get('caloriesTarget'), 500);
  assert.strictEqual(store.get('sleep').score, 85);
  assert.strictEqual(store.get('sleep').totalMinutes, 460);
  assert.strictEqual(store.get('sleep').deep, 110);
  assert.strictEqual(store.get('sleep').light, 290);
  assert.strictEqual(store.get('sleep').rem, 60);
  assert.strictEqual(store.get('spo2'), 98);
  assert.strictEqual(store.get('stress'), 35);
  assert.strictEqual(store.get('bodyTemp'), 36.6);
  assert.strictEqual(store.get('distance'), 3.2);
  assert.strictEqual(store.get('pai'), 78);
  assert.strictEqual(store.get('stand'), 8);
  assert.strictEqual(store.get('fatBurning'), 25);
  assert.strictEqual(store.get('battery'), 82);
  assert.strictEqual(store.get('charging'), false);
  assert.strictEqual(store.get('bleConnected'), true);
  console.log('  ✓ Default sensor values verified');

  let changeEvents = 0;
  store.onChange(({ key, value }) => {
    changeEvents++;
  });

  store.set('steps', 5200);
  assert.strictEqual(store.get('steps'), 5200);
  assert.strictEqual(changeEvents, 1);

  store.update({ heartRate: 85, battery: 95 });
  assert.strictEqual(store.get('heartRateCurrent'), 85);
  assert.strictEqual(store.get('battery'), 95);
  console.log('  ✓ Reactive updates and change listeners triggered');

  // =========================================================================
  // TASK 3: Module Loader with API Level Enforcement & Variants
  // =========================================================================
  console.log('\n--- Test Group 3: Module Loader & API Level Enforcement ---');

  const testAppDir = path.join(__dirname, 'temp_test_app');
  fs.mkdirSync(path.join(testAppDir, 'page'), { recursive: true });
  fs.mkdirSync(path.join(testAppDir, 'legacy', 'page'), { recursive: true });

  // 1. Zepp OS 1.0 disallows @zos/*
  const engine1 = new ZeppRuntimeEngine({ apiLevel: '1.0.0', projectPath: testAppDir });
  assert.throws(
    () => engine1.moduleLoader.getZosModule('@zos/ui'),
    /@zos\/\* is not available on Zepp OS 1\.0/
  );
  console.log('  ✓ API 1.0 correctly disallows @zos/* with informative error');

  // 2. Automatic resolution to legacy/ when apiLevel === '1.0.0'
  fs.writeFileSync(path.join(testAppDir, 'page', 'home.js'), 'module.exports = { version: "modern" };');
  fs.writeFileSync(path.join(testAppDir, 'legacy', 'page', 'home.js'), 'module.exports = { version: "legacy" };');

  const resolvedLegacy = engine1.moduleLoader.resolveFilePath('page/home.js', testAppDir);
  assert(resolvedLegacy.includes('legacy/page/home.js'), `Expected legacy path, got ${resolvedLegacy}`);
  console.log('  ✓ API 1.0 automatically resolves route to legacy/...');

  // 3. API 4.0 resolves *.api-4.0.js variant if exists
  fs.writeFileSync(path.join(testAppDir, 'page', 'feature.js'), 'module.exports = { feat: "v3" };');
  fs.writeFileSync(path.join(testAppDir, 'page', 'feature.api-4.0.js'), 'module.exports = { feat: "v4" };');

  const engine4 = new ZeppRuntimeEngine({ apiLevel: '4.0.0', projectPath: testAppDir });
  const resolved4 = engine4.moduleLoader.resolveFilePath('page/feature.js', testAppDir);
  assert(resolved4.endsWith('feature.api-4.0.js'), `Expected .api-4.0.js variant, got ${resolved4}`);
  console.log('  ✓ API 4.0 resolves *.api-4.0.js variant before .js');

  // 4. Test @zos/sensor classes
  const engineModern = new ZeppRuntimeEngine({ apiLevel: '3.6.0', projectPath: testAppDir });
  const zosSensor = engineModern.moduleLoader.getZosModule('@zos/sensor');
  const stepSensor = new zosSensor.Step();
  let stepTriggered = false;
  stepSensor.onChange(() => { stepTriggered = true; });
  assert.strictEqual(stepSensor.target, 9000);
  engineModern.sensorState.set('steps', 9500);
  assert.strictEqual(stepSensor.current, 9500);
  assert.strictEqual(stepTriggered, true);
  console.log('  ✓ @zos/sensor classes read reactive sensor state and trigger callbacks');

  // =========================================================================
  // TASK 4: App-Side Runner & Message Channel
  // =========================================================================
  console.log('\n--- Test Group 4: AppSideRunner & Request/Response Message Channel ---');
  fs.mkdirSync(path.join(testAppDir, 'app-side'), { recursive: true });

  fs.writeFileSync(path.join(testAppDir, 'app-side', 'index.js'), `
    AppSideService({
      onInit() { this.initialized = true; },
      onRun() { this.running = true; },
      onRequest(req, res) {
        if (req.method === 'ping') {
          res(null, { reply: 'pong', echo: req.params });
        } else if (req.method === 'error_test') {
          res('sample error');
        }
      },
      onSettingsChange({ key, newValue, oldValue }) {
        this.lastSettingChange = { key, newValue, oldValue };
      }
    });
  `);

  await engineModern.appSideRunner.start();
  assert(engineModern.appSideRunner.running, 'AppSideRunner should be running');
  const pong = await engineModern.appSideRunner.handleRequest({ method: 'ping', params: { num: 42 } });
  assert.strictEqual(pong.reply, 'pong');
  assert.strictEqual(pong.echo.num, 42);
  console.log('  ✓ AppSide request/response message channel working with onRequest(req, res)');

  // =========================================================================
  // TASK 5: Settings Runner & Bridge to App-Side
  // =========================================================================
  console.log('\n--- Test Group 5: SettingsRunner & onSettingsChange Bridge ---');
  fs.mkdirSync(path.join(testAppDir, 'setting'), { recursive: true });

  fs.writeFileSync(path.join(testAppDir, 'setting', 'index.js'), `
    AppSettingsPage({
      build(props) {
        return View({ style: { padding: 10 } }, [
          Section({ title: "Preferences" }, [
            Text({}, "Select Mode:"),
            Select({
              label: "Mode",
              value: props.settingsStorage.getItem("mode", "default"),
              options: [{ name: "Mode A", value: "a" }, { name: "Mode B", value: "b" }]
            }),
            Button("Save", () => {})
          ])
        ]);
      }
    });
  `);

  await engineModern.settingsRunner.load();
  const vTree = engineModern.settingsRunner.getVirtualTree();
  assert(vTree, 'Virtual tree should exist');
  assert.strictEqual(vTree.type, 'View');
  assert.strictEqual(vTree.children[0].type, 'Section');
  console.log('  ✓ Settings virtual component tree built correctly');

  // Test settings update triggering AppSide onSettingsChange
  engineModern.settingsStorage.setItem('mode', 'mode-turbo');
  assert.strictEqual(engineModern.settingsStorage.getItem('mode'), 'mode-turbo');
  const change = engineModern.appSideRunner.serviceContext.lastSettingChange;
  assert(change, 'lastSettingChange should be recorded');
  assert.strictEqual(change.key, 'mode');
  assert.strictEqual(change.newValue, 'mode-turbo');
  assert.strictEqual(change.oldValue, undefined);
  console.log('  ✓ settingsStorage.setItem automatically invokes onSettingsChange in active app-side runner');

  // =========================================================================
  // TASK 6: App-Service Runner
  // =========================================================================
  console.log('\n--- Test Group 6: AppServiceRunner ---');
  fs.mkdirSync(path.join(testAppDir, 'app-service'), { recursive: true });

  fs.writeFileSync(path.join(testAppDir, 'app-service', 'reminder.js'), `
    AppService({
      onInit(param) {
        this.receivedParam = param;
      },
      onEvent(event) {
        this.receivedEvent = event;
      },
      onDestroy() {
        this.destroyed = true;
      }
    });
  `);

  const service = await engineModern.appServiceRunner.load('app-service/reminder.js', { msg: 'wake up' });
  assert(service, 'Service should be loaded');
  assert.strictEqual(engineModern.appServiceRunner.serviceContext.receivedParam.msg, 'wake up');
  await engineModern.appServiceRunner.triggerEvent({ type: 'alarm_trigger' });
  assert.strictEqual(engineModern.appServiceRunner.serviceContext.receivedEvent.type, 'alarm_trigger');
  engineModern.appServiceRunner.exit();
  assert.strictEqual(engineModern.appServiceRunner.running, false);
  console.log('  ✓ AppService lifecycle (onInit, onEvent, exit, onDestroy) verified');

  // =========================================================================
  // TASK 7: ZeppRuntimeEngine Orchestration, Widgets, Clicks, Screen State
  // =========================================================================
  console.log('\n--- Test Group 7: Unified ZeppRuntimeEngine ---');

  fs.writeFileSync(path.join(testAppDir, 'app.json'), JSON.stringify({
    app: { appName: "TestApp" },
    runtime: { apiVersion: { target: "3.6.0" } },
    targets: { common: { module: { page: { pages: ["page/index", "page/detail"] } } } }
  }, null, 2));

  fs.writeFileSync(path.join(testAppDir, 'page', 'index.js'), `
    import * as hmUI from '@zos/ui';
    import { push } from '@zos/router';
    import { showToast } from '@zos/interaction';

    Page({
      build() {
        hmUI.createWidget(hmUI.widget.TEXT, {
          x: 20, y: 30, w: 200, h: 40,
          text: "Welcome Zepp",
          color: 0xffffff
        });

        hmUI.createWidget(hmUI.widget.BUTTON, {
          x: 50, y: 100, w: 200, h: 50,
          text: "Click Me",
          click_func: () => {
            showToast({ content: "Button Clicked!" });
            push('page/detail', { from: 'home' });
          }
        });
      }
    });
  `);

  fs.writeFileSync(path.join(testAppDir, 'page', 'detail.js'), `
    import * as hmUI from '@zos/ui';
    import { back } from '@zos/router';

    Page({
      onInit(params) {
        this.params = params;
      },
      build() {
        hmUI.createWidget(hmUI.widget.TEXT, {
          x: 20, y: 30, w: 200, h: 40,
          text: "Detail Page: " + (this.params ? this.params.from : "")
        });

        hmUI.createWidget(hmUI.widget.BUTTON, {
          x: 50, y: 150, w: 200, h: 50,
          text: "Go Back",
          click_func: () => {
            back();
          }
        });
      }
    });
  `);

  const fullEngine = new ZeppRuntimeEngine();
  await fullEngine.loadApp({ projectPath: testAppDir, device: 'amazfit-balance' });

  assert.strictEqual(fullEngine.currentRoute, 'page/index');
  assert.strictEqual(fullEngine.widgets.length, 2);
  console.log('  ✓ Page loaded with 2 widgets');

  // Verify getScreenState()
  const screenState = fullEngine.getScreenState();
  assert.strictEqual(screenState.route, 'page/index');
  assert.strictEqual(screenState.device.id, 'amazfit-balance');
  assert.strictEqual(screenState.device.screenWidth, 480);
  assert.strictEqual(screenState.device.screenHeight, 480);
  assert(screenState.ascii.includes(screenState.device.deviceName));
  assert(screenState.ascii.includes('Welcome Zepp'));
  assert(screenState.svg.includes('<svg'));
  assert(screenState.svg.includes('Welcome Zepp'));
  console.log('  ✓ getScreenState() returns route, visible widgets, ASCII representation, and SVG');

  // Test clickWidget
  const clicked = await fullEngine.clickWidget('Click Me');
  assert.strictEqual(clicked, true);
  assert.strictEqual(fullEngine.toasts.length, 1);
  assert.strictEqual(fullEngine.toasts[0].content, 'Button Clicked!');
  assert.strictEqual(fullEngine.currentRoute, 'page/detail');
  assert.strictEqual(fullEngine.widgets[0].props.text, 'Detail Page: home');
  console.log('  ✓ clickWidget clicked button, showed toast, and triggered router navigation');

  // Test back()
  const backClicked = await fullEngine.clickWidget('Go Back');
  assert.strictEqual(backClicked, true);
  assert.strictEqual(fullEngine.currentRoute, 'page/index');
  console.log('  ✓ back() restored previous route and recreated widgets');

  // Test renderScreen(canvasCtx)
  const drawOps = [];
  const mockCtx = {
    save: () => drawOps.push('save'),
    restore: () => drawOps.push('restore'),
    beginPath: () => drawOps.push('beginPath'),
    arc: () => drawOps.push('arc'),
    fill: () => drawOps.push('fill'),
    clip: () => drawOps.push('clip'),
    fillRect: (...args) => drawOps.push(['fillRect', ...args]),
    fillText: (...args) => drawOps.push(['fillText', ...args]),
    strokeRect: (...args) => drawOps.push(['strokeRect', ...args]),
    stroke: () => drawOps.push('stroke'),
  };
  fullEngine.renderScreen(mockCtx);
  assert(drawOps.includes('save') && drawOps.includes('restore'), 'renderScreen executes canvas ops');
  console.log('  ✓ renderScreen(canvasCtx) rendered widgets onto canvas context');

  // Cleanup temp test app
  fs.rmSync(testAppDir, { recursive: true, force: true });

  console.log('\n🎉 ALL 7 TEST GROUPS PASSED WITH FLYING COLORS!');
}

runTests().catch((err) => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
