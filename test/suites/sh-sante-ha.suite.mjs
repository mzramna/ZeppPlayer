import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineSuite } from '../../src/test-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_PATH = '/media/mzramna/dados/UserFolders/Documentos/sh-sante-ha-zepp';
const FIXTURE_PATH = path.resolve(__dirname, '../../projects/sh-sante-ha-fixture');
const projectPath = fs.existsSync(LOCAL_PATH) ? LOCAL_PATH : FIXTURE_PATH;

export default defineSuite({
  name: 'Home Assistant Companion E2E',
  projectPath,
  matrix: ['amazfit-balance', 'amazfit-active', 'amazfit-gtr-4'],
  async fn({ session, device, apiLevel, expect }) {
    // 1. Verify Home Page Route & Title
    await expect(session).toHaveRoute('page/home/index');
    const title = session.getByText('Home Assistant');
    await expect(title).toBeVisible();

    // 2. Verify Category Buttons
    const devicesBtn = session.getByText('devices');
    await expect(devicesBtn).toBeVisible();

    const scriptsBtn = session.getByText('scripts');
    await expect(scriptsBtn).toBeVisible();

    // 3. Navigate to Entities page via Devices click
    await devicesBtn.click();
    await expect(session).toHaveRoute('page/entities/index');

    // 4. Go Back to Home Page
    await session.back();
    await expect(session).toHaveRoute('page/home/index');

    // 5. Test Settings Page Configuration (Local IP & External URL)
    await session.settingsPage.fill('localHAIP', 'http://192.168.1.50:8123');
    const localIP = session.settingsPage.getSettingValue('localHAIP');
    if (localIP !== 'http://192.168.1.50:8123') {
      throw new Error(`Expected localHAIP to be 'http://192.168.1.50:8123', got '${localIP}'`);
    }

    await session.settingsPage.fill('externalHAIP', 'https://ha.mydomain.duckdns.org');
    const extIP = session.settingsPage.getSettingValue('externalHAIP');
    if (extIP !== 'https://ha.mydomain.duckdns.org') {
      throw new Error(`Expected externalHAIP to be 'https://ha.mydomain.duckdns.org', got '${extIP}'`);
    }

    // 6. Test Settings Favorites Update
    session.updateSetting('favorites', JSON.stringify(['light.living_room']));
    const favs = session.settingsPage.getSettingValue('favorites');
    if (!favs || !favs.includes('light.living_room')) {
      throw new Error(`Expected favorites setting to include 'light.living_room'`);
    }
  }
});
