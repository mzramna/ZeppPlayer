import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineSuite } from '../../src/test-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_PATH = '/home/mzramna/Documentos/sparkyfitness-zeppos';
const FIXTURE_PATH = path.resolve(__dirname, '../../projects/sparkyfitness-fixture');
const projectPath = fs.existsSync(LOCAL_PATH) ? LOCAL_PATH : FIXTURE_PATH;

export default defineSuite({
  name: 'SparkyFitness ZeppOS E2E',
  projectPath,
  matrix: ['amazfit-balance', 'amazfit-active', 'mi-band-7'],
  async fn({ session, device, apiLevel, expect }) {
    // 1. Initial State Setup with Mock 'today' Data
    const initialData = {
      water: { ml: 1250, goal_ml: 2000 },
      containers: [{ id: 'c1', label: 'Copo', volume_ml: 250, is_primary: true }],
      calories: { eaten: 1500, burned: 400, goal: 2000, remaining: 100 },
      macros: {
        protein: { value: 90, goal: 120 },
        carbs: { value: 160, goal: 200 },
        fat: { value: 40, goal: 60 },
        fiber: { value: 20, goal: 30 }
      },
      doses: []
    };

    session.engine.setStorageItem('today', JSON.stringify(initialData));
    await session.engine.reloadPage();

    // 2. Verify Home Page Route & Water Display
    await expect(session).toHaveRoute('page/index');
    const waterText = session.getByText(/1250\/2000\s*ml/);
    await expect(waterText).toBeVisible();

    // 3. Log Water Intake by Clicking '+' Button
    const plusBtn = session.getByText('+');
    await expect(plusBtn).toBeVisible();
    await plusBtn.click();

    // 4. Verify Screen Updates to 1500/2000 ml
    const updatedWaterText = session.getByText(/1500\/2000\s*ml/);
    await expect(updatedWaterText).toBeVisible();

    // 5. Verify Settings Page Fill & Storage Sync
    await session.settingsPage.fill('URL do servidor', 'https://sparky.local:8000');
    const serverVal = session.settingsPage.getSettingValue('server');
    if (serverVal !== 'https://sparky.local:8000') {
      throw new Error(`Expected server setting to be 'https://sparky.local:8000', got '${serverVal}'`);
    }

    // 6. Test Settings API key fill
    await session.settingsPage.fill('API key', 'secret-key-123');
    const keyVal = session.settingsPage.getSettingValue('apiKey');
    if (keyVal !== 'secret-key-123') {
      throw new Error(`Expected apiKey setting to be 'secret-key-123', got '${keyVal}'`);
    }
  }
});
