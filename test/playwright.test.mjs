import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createWatchSession,
  WatchSession,
  Locator,
  SettingsPageSession,
  SettingsLocator,
  expect,
  flushAsync,
  getWidgetText,
  getWidgetIcon,
  getWidgetType,
  isWidgetVisible,
  matchWidget
} from '../src/playwright.js';
import {
  expandMatrix,
  defineSuite,
  formatSummaryTable
} from '../src/test-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempAppDir = path.join(__dirname, 'temp_playwright_app');

describe('ZeppPlaywright Testing Framework', () => {
  before(() => {
    // Scaffold minimal test Zepp OS app
    fs.mkdirSync(path.join(tempAppDir, 'page'), { recursive: true });
    fs.mkdirSync(path.join(tempAppDir, 'setting'), { recursive: true });

    // app.json
    fs.writeFileSync(
      path.join(tempAppDir, 'app.json'),
      JSON.stringify(
        {
          app: { appName: 'PlaywrightTestApp' },
          runtime: { apiVersion: { target: '3.6.0' } },
          targets: {
            common: {
              module: {
                page: { pages: ['page/index', 'page/details'] },
                setting: { path: 'setting/index' }
              }
            }
          }
        },
        null,
        2
      )
    );

    // page/index.js
    fs.writeFileSync(
      path.join(tempAppDir, 'page', 'index.js'),
      `
      import * as hmUI from '@zos/ui';
      import { push } from '@zos/router';
      import { showToast } from '@zos/interaction';

      Page({
        build() {
          hmUI.createWidget(hmUI.widget.TEXT, {
            x: 20, y: 20, w: 200, h: 40,
            text: "Hello Playwright",
            id: "title-header"
          });

          hmUI.createWidget(hmUI.widget.IMG, {
            x: 20, y: 70, w: 48, h: 48,
            src: "assets/badge.png"
          });

          hmUI.createWidget(hmUI.widget.BUTTON, {
            x: 50, y: 130, w: 180, h: 50,
            text: "Continue",
            id: "btn-continue",
            click_func: () => {
              showToast({ content: "Navigating..." });
              push('page/details', { step: 1 });
            }
          });

          hmUI.createWidget(hmUI.widget.CHECKBOX, {
            x: 50, y: 200, w: 180, h: 40,
            text: "Accept Terms",
            checked: false,
            change_func: (w, checked) => {
              w.props.checked = checked;
            }
          });
        }
      });
      `
    );

    // page/details.js
    fs.writeFileSync(
      path.join(tempAppDir, 'page', 'details.js'),
      `
      import * as hmUI from '@zos/ui';
      import { back } from '@zos/router';

      Page({
        build() {
          hmUI.createWidget(hmUI.widget.TEXT, {
            x: 20, y: 30, w: 200, h: 40,
            text: "Details Page"
          });

          hmUI.createWidget(hmUI.widget.BUTTON, {
            x: 50, y: 100, w: 180, h: 50,
            text: "Go Back",
            click_func: () => {
              back();
            }
          });
        }
      });
      `
    );

    // setting/index.js
    fs.writeFileSync(
      path.join(tempAppDir, 'setting', 'index.js'),
      `
      AppSettingsPage({
        build({ settingsStorage }) {
          return View({}, [
            TextInput({
              label: "Server Host",
              value: settingsStorage.getItem("host", "default.local"),
              onChange: (v) => settingsStorage.setItem("host", v)
            }),
            Toggle({
              label: "Enable SSL",
              value: settingsStorage.getItem("ssl", false),
              onChange: (v) => settingsStorage.setItem("ssl", v)
            }),
            Button({
              label: "Reset Defaults",
              onClick: () => {
                settingsStorage.setItem("host", "default.local");
                settingsStorage.setItem("ssl", false);
              }
            })
          ]);
        }
      });
      `
    );
  });

  after(() => {
    fs.rmSync(tempAppDir, { recursive: true, force: true });
  });

  it('createWatchSession initializes session and loads app', async () => {
    const session = await createWatchSession({
      projectPath: tempAppDir,
      device: 'amazfit-balance',
      apiLevel: '3.6.0'
    });

    assert.ok(session instanceof WatchSession);
    assert.strictEqual(session.getRoute(), 'page/index');
    assert.ok(session.getWidgets().length >= 4);

    await session.close();
  });

  it('Locators: getByText, getByRole, getByIcon, locator', async () => {
    const session = await createWatchSession({
      projectPath: tempAppDir,
      device: 'amazfit-balance'
    });

    // getByText string
    const textLoc = session.getByText('Hello Playwright');
    assert.ok(await textLoc.isVisible());
    assert.strictEqual(await textLoc.textContent(), 'Hello Playwright');

    // getByText RegExp
    const textRegExp = session.getByText(/Hello/);
    assert.ok(await textRegExp.isVisible());

    // getByRole button
    const btnLoc = session.getByRole('button', { name: 'Continue' });
    assert.ok(await btnLoc.isVisible());

    // getByIcon
    const iconLoc = session.getByIcon('assets/badge.png');
    assert.ok(await iconLoc.isVisible());
    assert.strictEqual(await iconLoc.getAttribute('src'), 'assets/badge.png');

    // locator by ID
    const idLoc = session.locator('#btn-continue');
    assert.ok(await idLoc.isVisible());
    assert.strictEqual(await idLoc.textContent(), 'Continue');

    // first, last, count
    const allButtons = session.getByRole('button');
    assert.strictEqual(await allButtons.count(), 1);
    assert.strictEqual(await allButtons.first().textContent(), 'Continue');

    await session.close();
  });

  it('Actions: click, setChecked, navigation, back, and toasts', async () => {
    const session = await createWatchSession({
      projectPath: tempAppDir,
      device: 'amazfit-balance'
    });

    // setChecked
    const checkLoc = session.getByText('Accept Terms');
    assert.strictEqual(await checkLoc.getAttribute('checked'), false);
    await checkLoc.setChecked(true);
    assert.strictEqual(await checkLoc.getAttribute('checked'), true);

    // click button -> show toast & push route
    const continueBtn = session.getByRole('button', { name: 'Continue' });
    await continueBtn.click();

    // Verify Toast assertion
    await expect(session).toHaveToast('Navigating...');
    await expect(session).toHaveRoute('page/details');

    // Details page widget
    const detailsText = session.getByText('Details Page');
    await expect(detailsText).toBeVisible();

    // Go Back
    await session.getByRole('button', { name: 'Go Back' }).click();
    await expect(session).toHaveRoute('page/index');

    await session.close();
  });

  it('Sensors: setSensors updates sensor state', async () => {
    const session = await createWatchSession({
      projectPath: tempAppDir,
      device: 'amazfit-balance'
    });

    await session.setSensors({ steps: 8400, heartRate: 92 });
    assert.strictEqual(session.engine.sensorState.get('steps'), 8400);
    assert.strictEqual(session.engine.sensorState.get('heartRateCurrent'), 92);

    await session.close();
  });

  it('Settings: settingsPage session, getByLabel, fill, click', async () => {
    const session = await createWatchSession({
      projectPath: tempAppDir,
      device: 'amazfit-balance'
    });

    // Fill Host
    const hostField = session.settingsPage.getByLabel('Server Host');
    await hostField.fill('api.myproduction.com');
    assert.strictEqual(session.settingsPage.getSettingValue('host'), 'api.myproduction.com');

    // Set Checked Toggle
    const sslToggle = session.settingsPage.getByLabel('Enable SSL');
    await sslToggle.setChecked(true);
    assert.strictEqual(session.settingsPage.getSettingValue('ssl'), true);

    // Click Reset Button
    await session.settingsPage.click('Reset Defaults');
    assert.strictEqual(session.settingsPage.getSettingValue('host'), 'default.local');
    assert.strictEqual(session.settingsPage.getSettingValue('ssl'), false);

    await session.close();
  });

  it('Assertions: expect assertions with auto-polling and .not modifier', async () => {
    const session = await createWatchSession({
      projectPath: tempAppDir,
      device: 'amazfit-balance'
    });

    const header = session.getByText('Hello Playwright');
    await expect(header).toBeVisible();
    await expect(header).toHaveText('Hello Playwright');
    await expect(header).toContainText('Playwright');
    await expect(header).not.toHaveText('Non Existent');

    const check = session.getByText('Accept Terms');
    await expect(check).not.toBeChecked();
    await check.setChecked(true);
    await expect(check).toBeChecked();

    await expect(session).toHaveRoute('page/index');
    await expect(session).not.toHaveRoute('page/details');

    const ghost = session.getByText('Ghost Widget');
    await expect(ghost).not.toBeVisible();

    await session.close();
  });

  it('Test Runner Matrix expansion and Summary Table', () => {
    // expandMatrix with string array
    const m1 = expandMatrix(['amazfit-balance', 'mi-band-7']);
    assert.strictEqual(m1.length, 2);
    assert.strictEqual(m1[0].device, 'amazfit-balance');
    assert.strictEqual(m1[0].apiLevel, '3.6.0');
    assert.strictEqual(m1[1].device, 'mi-band-7');
    assert.strictEqual(m1[1].apiLevel, '1.0.0');

    // expandMatrix paired
    const m2 = expandMatrix({
      devices: ['amazfit-balance', 'amazfit-gtr-4'],
      apiLevels: ['3.6.0', '2.0.0']
    });
    assert.strictEqual(m2.length, 2);
    assert.strictEqual(m2[1].device, 'amazfit-gtr-4');
    assert.strictEqual(m2[1].apiLevel, '2.0.0');

    // expandMatrix cartesian
    const m3 = expandMatrix({
      devices: ['amazfit-balance', 'amazfit-active'],
      apiLevels: ['3.0.0', '3.6.0', '4.0.0']
    });
    assert.strictEqual(m3.length, 6);

    // formatSummaryTable
    const table = formatSummaryTable([
      {
        suite: 'Sample Suite',
        device: 'amazfit-balance',
        apiLevel: '3.6.0',
        status: 'PASS',
        durationMs: 120,
        metrics: {
          visitedRoutes: ['page/index'],
          interactedWidgets: [{ type: 'click' }],
          apiCalls: { 'ui.click': 1 }
        }
      }
    ]);

    assert.ok(table.includes('ZEPP OS TEST EXECUTION REPORT'));
    assert.ok(table.includes('amazfit-balance'));
    assert.ok(table.includes('PASS'));
    assert.ok(table.includes('Zepp OS API Level Invocation Coverage'));
  });
});
