/**
 * Integration Tests for Web UI Server, REST API, & Zeus CLI Bridge
 */

import { start, serverWeb, serverZeus } from '../src/server.js';
import { WebSocket } from 'ws';

async function runTests() {
  console.log('🚀 Starting Zepp OS Server & Bridge Integration Tests...');
  await start();
  await new Promise(r => setTimeout(r, 600));

  const baseWeb = 'http://localhost:7651';
  const baseZeus = 'http://localhost:7650';
  let passed = 0;
  let failed = 0;

  function assert(condition, desc) {
    if (condition) {
      console.log(`  ✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${desc}`);
      failed++;
    }
  }

  try {
    // 1. Health Endpoint
    const health = await (await fetch(`${baseWeb}/api/health`)).json();
    assert(health.status === 'ok' && health.portWeb === 7651 && health.portZeus === 7650, 'Health endpoint returns ok on ports 7651 & 7650');

    // 2. Devices Endpoint
    const devices = await (await fetch(`${baseWeb}/api/devices`)).json();
    const ids = devices.map(d => d.id);
    assert(ids.includes('amazfit-balance') && ids.includes('amazfit-active') && ids.includes('amazfit-band-7'), 'Devices list includes balance, active, and band-7');

    // 3. API Levels
    const levels = await (await fetch(`${baseWeb}/api/api-levels`)).json();
    assert(levels.length === 5 && levels.includes('3.0.0') && levels.includes('4.0.0'), 'API levels returns expected versions');

    // 4. Load App (SparkyFitness)
    const load1 = await (await fetch(`${baseWeb}/api/load-app`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath: 'sparkyfitness-fixture', device: 'amazfit-balance', apiLevel: '3.6.0' })
    })).json();
    assert(load1.success && load1.state.projectName.includes('sparkyfitness'), 'Load SparkyFitness succeeds');

    // 5. State inspection
    const state = await (await fetch(`${baseWeb}/api/state`)).json();
    assert(state.widgets.length > 0 && state.device.id === 'amazfit-balance', 'State returns widgets and active device');

    // 6. Sensor modification
    const sensorsRes = await (await fetch(`${baseWeb}/api/sensors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps: 14250, heartRate: 88, spo2: 99, stress: 30 })
    })).json();
    assert(sensorsRes.sensors.steps === 14250 && sensorsRes.sensors.heartRate === 88, 'Sensors updated accurately');

    // 7. Settings update
    const settingRes = await (await fetch(`${baseWeb}/api/setting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'sensorMode', value: 'direct' })
    })).json();
    assert(settingRes.success && settingRes.settings.sensorMode === 'direct', 'SettingsStorage setItem updates state');

    // 8. Navigation & Back
    const navRes = await (await fetch(`${baseWeb}/api/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'page/list', params: { key: 'meds' } })
    })).json();
    assert(navRes.success && navRes.route === 'page/list', 'Navigate changes active route');

    const backRes = await (await fetch(`${baseWeb}/api/back`, { method: 'POST' })).json();
    assert(backRes.success && backRes.route === 'page/index', 'Back pops route history');

    // 9. Toast Creation
    const toastRes = await (await fetch(`${baseWeb}/api/toast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Alerta Teste!' })
    })).json();
    assert(toastRes.success && toastRes.toast.message === 'Alerta Teste!', 'Toast notification created');

    // 10. Web Assets Serving
    const html = await (await fetch(`${baseWeb}/`)).text();
    assert(html.includes('Zepp OS Visual Studio') && html.includes('watchCanvas'), 'public/index.html served correctly at root');

    const appHtml = await (await fetch(`${baseWeb}/app/`)).text();
    assert(appHtml.includes('ZeppPlayer'), 'app/index.html served at /app/');

    // 11. Zeus CLI Bridge Socket.IO Protocol on Port 7650
    const zeusStatus = await (await fetch(`${baseZeus}/`)).json();
    assert(zeusStatus.port === 7650, 'Zeus HTTP server listening on port 7650');

    // 12. Socket.IO ide.simulator.preview RPC Handshake
    const ws = new WebSocket('ws://localhost:7650/socket.io/?EIO=4&transport=websocket');
    await new Promise((resolve, reject) => {
      ws.on('message', (raw) => {
        const msg = raw.toString();
        if (msg.startsWith('0')) {
          ws.send('40'); // connect packet
        } else if (msg.startsWith('40')) {
          // send ide.simulator.preview JSON-RPC
          ws.send('42["ide.simulator.preview",{"jsonrpc":"2.0","id":777,"params":{"path":"sparkyfitness-zeppos"}}]');
        } else if (msg.includes('"id":777') && msg.includes('success')) {
          assert(true, 'Zeus Bridge responded with JSON-RPC 2.0 success to ide.simulator.preview');
          ws.close();
          resolve();
        }
      });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Zeus bridge timeout')), 3000);
    });

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    serverWeb.close();
    serverZeus.close();
    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
