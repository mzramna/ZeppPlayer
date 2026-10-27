/**
 * Test Suite for Zepp OS MCP Server over stdio pipe
 * Verifies standard MCP protocol lifecycle: initialize, ping, tools/list,
 * line-by-line framing, Content-Length framing, and tool execution.
 */

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const mcpBinary = resolve(rootDir, 'bin', 'mcp.js');

class McpClient {
  constructor() {
    this.process = spawn('node', [mcpBinary], {
      cwd: rootDir,
      stdio: ['pipe', 'pipe', 'inherit']
    });
    this.buffer = '';
    this.pendingRequests = new Map();
    this.nextId = 1;

    this.process.stdout.on('data', (data) => {
      this.buffer += data.toString('utf8');
      this._parseBuffer();
    });
  }

  _parseBuffer() {
    while (true) {
      const idx = this.buffer.indexOf('\n');
      if (idx === -1) break;
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (line.length === 0) continue;

      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          const { resolve, reject } = this.pendingRequests.get(msg.id);
          this.pendingRequests.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      } catch (err) {
        console.error('Failed to parse line from MCP server:', line, err);
      }
    }
  }

  sendRequest(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      const req = { jsonrpc: '2.0', id, method, params };
      this.process.stdin.write(JSON.stringify(req) + '\n');
    });
  }

  sendContentLengthRequest(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      const req = { jsonrpc: '2.0', id, method, params };
      const body = JSON.stringify(req);
      const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;
      this.process.stdin.write(header + body);
    });
  }

  sendNotification(method, params = {}) {
    const notif = { jsonrpc: '2.0', method, params };
    this.process.stdin.write(JSON.stringify(notif) + '\n');
  }

  close() {
    this.process.stdin.end();
    this.process.kill();
  }
}

async function runTests() {
  console.log('--- Starting Zepp OS MCP Server Protocol Tests ---');
  const client = new McpClient();

  try {
    // 1. Test initialize
    console.log('[Test 1] Testing initialize lifecycle...');
    const initRes = await client.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-runner', version: '1.0.0' }
    });
    console.log('Initialize response:', initRes);
    assert.strictEqual(initRes.serverInfo.name, 'zeppos-emulator', 'Server name must be zeppos-emulator');
    assert.strictEqual(initRes.serverInfo.version, '2.0.0', 'Server version must be 2.0.0');
    assert.ok(initRes.capabilities.tools, 'Server must declare tools capability');
    console.log('✓ Test 1 passed: initialize succeeded');

    // 2. Test notifications/initialized
    console.log('[Test 2] Sending notifications/initialized...');
    client.sendNotification('notifications/initialized');
    console.log('✓ Test 2 passed: notification sent');

    // 3. Test ping
    console.log('[Test 3] Testing ping...');
    const pingRes = await client.sendRequest('ping');
    assert.deepStrictEqual(pingRes, {}, 'Ping response must be empty object');
    console.log('✓ Test 3 passed: ping succeeded');

    // 4. Test tools/list
    console.log('[Test 4] Testing tools/list...');
    const listRes = await client.sendRequest('tools/list');
    const toolNames = listRes.tools.map((t) => t.name);
    console.log(`Discovered ${toolNames.length} MCP tools:`, toolNames);

    const expectedTools = [
      'emulator_load_app',
      'emulator_select_device',
      'emulator_set_api_version',
      'emulator_set_sensors',
      'emulator_get_screen',
      'emulator_click',
      'emulator_navigate',
      'emulator_get_settings_ui',
      'emulator_update_setting',
      'emulator_trigger_service',
      'zepp_pw_goto',
      'zepp_pw_locator_click',
      'zepp_pw_settings_fill',
      'zepp_pw_settings_click',
      'zepp_pw_expect',
      'zepp_pw_run_suite'
    ];

    for (const exp of expectedTools) {
      assert.ok(toolNames.includes(exp), `Expected tool "${exp}" in tools/list`);
    }
    console.log('✓ Test 4 passed: all 16 tools present in tools/list');

    // 5. Test emulator_select_device
    console.log('[Test 5] Calling emulator_select_device...');
    const devRes = await client.sendRequest('tools/call', {
      name: 'emulator_select_device',
      arguments: { device: 'amazfit-balance' }
    });
    const devData = JSON.parse(devRes.content[0].text);
    assert.strictEqual(devData.deviceName, 'Amazfit Balance', 'Device name should be Amazfit Balance');
    console.log('✓ Test 5 passed: emulator_select_device succeeded');

    // 6. Test emulator_set_api_version
    console.log('[Test 6] Calling emulator_set_api_version...');
    const apiRes = await client.sendRequest('tools/call', {
      name: 'emulator_set_api_version',
      arguments: { apiLevel: '3.6.0' }
    });
    const apiData = JSON.parse(apiRes.content[0].text);
    assert.strictEqual(apiData.apiLevel, '3.6.0');
    console.log('✓ Test 6 passed: emulator_set_api_version succeeded');

    // 7. Test emulator_set_sensors
    console.log('[Test 7] Calling emulator_set_sensors...');
    const sensorRes = await client.sendRequest('tools/call', {
      name: 'emulator_set_sensors',
      arguments: {
        steps: 12500,
        heartRate: 85,
        spo2: 99,
        battery: 95,
        bleConnected: true
      }
    });
    const sensorData = JSON.parse(sensorRes.content[0].text);
    assert.strictEqual(sensorData.steps, 12500);
    assert.strictEqual(sensorData.spo2, 99);
    console.log('✓ Test 7 passed: emulator_set_sensors succeeded');

    // 8. Test emulator_load_app on projects/demo
    console.log('[Test 8] Calling emulator_load_app on projects/demo...');
    const loadRes = await client.sendRequest('tools/call', {
      name: 'emulator_load_app',
      arguments: {
        projectPath: resolve(rootDir, 'projects', 'demo'),
        device: 'amazfit-balance',
        apiLevel: '1.0.0'
      }
    });
    const loadData = JSON.parse(loadRes.content[0].text);
    console.log('App load result:', loadData);
    assert.strictEqual(loadData.success, true);
    assert.strictEqual(loadData.route, 'watchface/index');
    assert.ok(loadData.widgetsCount > 0, 'Should have loaded widgets');
    console.log(`✓ Test 8 passed: emulator_load_app loaded ${loadData.widgetsCount} widgets`);

    // 9. Test emulator_get_screen
    console.log('[Test 9] Calling emulator_get_screen...');
    const screenRes = await client.sendRequest('tools/call', {
      name: 'emulator_get_screen',
      arguments: {}
    });
    const screenData = JSON.parse(screenRes.content[0].text);
    assert.strictEqual(screenData.route, 'watchface/index');
    assert.ok(Array.isArray(screenData.widgets), 'widgets should be an array');
    assert.ok(typeof screenData.ascii === 'string' && screenData.ascii.length > 0, 'ascii should be non-empty string');
    assert.ok(typeof screenData.svg === 'string' && screenData.svg.includes('<svg'), 'svg should contain <svg');
    console.log('Screen ASCII snapshot preview:\n' + screenData.ascii);
    console.log('✓ Test 9 passed: emulator_get_screen returned ASCII & SVG snapshots');

    // 10. Test emulator_click
    console.log('[Test 10] Calling emulator_click...');
    const clickRes = await client.sendRequest('tools/call', {
      name: 'emulator_click',
      arguments: { widgetIndex: 0 }
    });
    const clickData = JSON.parse(clickRes.content[0].text);
    assert.strictEqual(clickData.success, true);
    console.log('✓ Test 10 passed: emulator_click succeeded');

    // 11. Test Playwright MCP tools: zepp_pw_goto & zepp_pw_expect
    console.log('[Test 11] Testing Playwright tools (zepp_pw_goto, zepp_pw_expect)...');
    const gotoRes = await client.sendRequest('tools/call', {
      name: 'zepp_pw_goto',
      arguments: { route: 'watchface/index' }
    });
    const gotoData = JSON.parse(gotoRes.content[0].text);
    assert.strictEqual(gotoData.route, 'watchface/index');

    const expectRes = await client.sendRequest('tools/call', {
      name: 'zepp_pw_expect',
      arguments: { toHaveRoute: 'watchface/index' }
    });
    const expectData = JSON.parse(expectRes.content[0].text);
    assert.strictEqual(expectData.status, 'PASS');
    console.log('✓ Test 11 passed: zepp_pw_goto and zepp_pw_expect succeeded');

    // 12. Test Content-Length Framing
    console.log('[Test 12] Testing Content-Length framing...');
    const clRes = await client.sendContentLengthRequest('ping');
    assert.deepStrictEqual(clRes, {});
    console.log('✓ Test 12 passed: Content-Length framing parsed and executed properly');

    console.log('\n======================================================');
    console.log('🎉 ALL MCP PROTOCOL & TOOL INTEGRATION TESTS PASSED! 🎉');
    console.log('======================================================');
  } finally {
    client.close();
  }
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
