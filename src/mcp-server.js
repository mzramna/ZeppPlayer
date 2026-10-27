/**
 * Model Context Protocol (MCP) Server for Zepp OS Emulator
 * 
 * Implements JSON-RPC 2.0 over stdio with line-by-line & Content-Length framing.
 * Provides full emulator control & Playwright-style automation tools.
 */

import { pathToFileURL } from 'url';
import { resolve } from 'path';
import { getActiveEngine, ZeppRuntimeEngine } from './runtime.js';
import { WatchSession, expect, flushAsync } from './playwright.js';
import { runSuite, formatSummaryTable } from './test-runner.js';
import { STANDARD_MODELS } from './devices.js';

// Redirect non-JSON stdout logs to stderr to preserve stdio JSON-RPC framing integrity
const origConsoleLog = console.log;
const origConsoleInfo = console.info;
const origConsoleDebug = console.debug;
console.log = (...args) => console.error(...args);
console.info = (...args) => console.error(...args);
console.debug = (...args) => console.error(...args);

export const MCP_TOOLS = [
  {
    name: 'emulator_load_app',
    description: 'Loads and boots a Zepp OS app or watchface into the emulator instance',
    inputSchema: {
      type: 'object',
      properties: {
        projectPath: {
          type: 'string',
          description: 'Absolute or relative filesystem path to the Zepp OS app project'
        },
        route: {
          type: 'string',
          description: 'Optional initial route/page to load (e.g. "pages/index" or "watchface/index")'
        },
        settings: {
          type: 'object',
          description: 'Initial companion settings key-value dictionary'
        },
        apiLevel: {
          type: 'string',
          enum: ['1.0.0', '2.0.0', '3.0.0', '3.6.0', '4.0.0'],
          description: 'Target Zepp OS API level to emulate'
        },
        device: {
          type: 'string',
          enum: [
            'amazfit-balance',
            'amazfit-balance-2',
            'amazfit-active',
            'amazfit-gtr-4',
            'amazfit-gts-4-mini',
            'amazfit-band-7',
            'mi-band-7'
          ],
          description: 'Target smartwatch device model'
        }
      },
      required: ['projectPath']
    }
  },
  {
    name: 'emulator_select_device',
    description: 'Switches the active watch profile (screen resolution, shape, hardware specs)',
    inputSchema: {
      type: 'object',
      properties: {
        device: {
          type: 'string',
          enum: [
            'amazfit-balance',
            'amazfit-balance-2',
            'amazfit-active',
            'amazfit-gtr-4',
            'amazfit-gts-4-mini',
            'amazfit-band-7',
            'mi-band-7'
          ],
          description: 'Smartwatch device identifier'
        }
      },
      required: ['device']
    }
  },
  {
    name: 'emulator_set_api_version',
    description: 'Sets the active Zepp OS API version runtime compatibility level',
    inputSchema: {
      type: 'object',
      properties: {
        apiLevel: {
          type: 'string',
          enum: ['1.0.0', '2.0.0', '3.0.0', '3.6.0', '4.0.0'],
          description: 'Zepp OS API Level'
        }
      },
      required: ['apiLevel']
    }
  },
  {
    name: 'emulator_set_sensors',
    description: 'Updates simulated biometric and hardware sensor mock values with reactive listener updates',
    inputSchema: {
      type: 'object',
      properties: {
        steps: { type: 'number', description: 'Step counter' },
        stepTarget: { type: 'number', description: 'Daily step goal' },
        heartRate: {
          description: 'Heart rate BPM (number or object with current/resting)',
          oneOf: [{ type: 'number' }, { type: 'object' }]
        },
        calories: {
          description: 'Burned calories (number or object with burned/target)',
          oneOf: [{ type: 'number' }, { type: 'object' }]
        },
        sleep: {
          description: 'Sleep metrics (object with totalMinutes, score, deep, light, rem)',
          oneOf: [{ type: 'number' }, { type: 'object' }, { type: 'string' }]
        },
        spo2: { type: 'number', description: 'Blood oxygen saturation percentage (0-100)' },
        stress: { type: 'number', description: 'Stress level score (0-100)' },
        bodyTemp: { type: 'number', description: 'Body temperature in Celsius' },
        distance: { type: 'number', description: 'Distance walked in kilometers' },
        pai: {
          description: 'PAI score (number or object with total/daily)',
          oneOf: [{ type: 'number' }, { type: 'object' }]
        },
        stand: {
          description: 'Standing hours (number or object with current/target)',
          oneOf: [{ type: 'number' }, { type: 'object' }]
        },
        battery: {
          description: 'Battery percentage (number or object with level/charging)',
          oneOf: [{ type: 'number' }, { type: 'object' }]
        },
        bleConnected: { type: 'boolean', description: 'Bluetooth connection state with phone' }
      }
    }
  },
  {
    name: 'emulator_get_screen',
    description: 'Inspects watch screen: returns route, visible widgets (text, bounds, colors), active toasts, ASCII snapshot, and SVG representation',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'emulator_click',
    description: 'Simulates a touch tap on the watch screen by widget text, coordinate (x,y), or index and awaits asynchronous microtasks',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text or substring of the widget/button to click' },
        x: { type: 'number', description: 'X pixel coordinate on screen' },
        y: { type: 'number', description: 'Y pixel coordinate on screen' },
        widgetIndex: { type: 'number', description: 'Zero-based index of the widget in the screen widget list' }
      }
    }
  },
  {
    name: 'emulator_navigate',
    description: 'Navigates to an app page route or goes back in navigation history',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target page route (e.g. "pages/detail")' },
        params: { type: 'object', description: 'Navigation parameters passed to page onInit' },
        back: { type: 'boolean', description: 'If true, navigates back to previous page in history' }
      }
    }
  },
  {
    name: 'emulator_get_settings_ui',
    description: 'Returns the virtual DOM tree of the phone companion settings page (AppSettingsPage DSL components)',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'emulator_update_setting',
    description: 'Updates a phone companion setting storage value or clicks a button on the settings page',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Setting storage key name' },
        value: { description: 'New value to store' },
        buttonLabel: { type: 'string', description: 'Label of the settings button to click' }
      }
    }
  },
  {
    name: 'emulator_trigger_service',
    description: 'Loads and executes a background Zepp OS app-service script',
    inputSchema: {
      type: 'object',
      properties: {
        servicePath: { type: 'string', description: 'Path to app-service script (defaults to app-service/index.js)' },
        param: { description: 'Parameter passed to service onInit' }
      }
    }
  },
  {
    name: 'zepp_pw_goto',
    description: 'Playwright-style navigation to a watch app route with optional parameters',
    inputSchema: {
      type: 'object',
      properties: {
        route: { type: 'string', description: 'Target route path' },
        params: { type: 'object', description: 'Optional route parameters' }
      },
      required: ['route']
    }
  },
  {
    name: 'zepp_pw_locator_click',
    description: 'Playwright-style widget locator click by text, role (button, input), icon, or index',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Widget text or label' },
        role: { type: 'string', description: 'Widget role ("button", "text", etc.)' },
        icon: { type: 'string', description: 'Icon asset filename' },
        index: { type: 'number', description: 'Occurrence index if multiple widgets match (defaults to 0)' }
      }
    }
  },
  {
    name: 'zepp_pw_settings_fill',
    description: 'Playwright-style fill input control in phone companion settings page',
    inputSchema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Settings field label or key' },
        value: { description: 'Value to fill' }
      },
      required: ['label', 'value']
    }
  },
  {
    name: 'zepp_pw_settings_click',
    description: 'Playwright-style click button in phone companion settings page',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Settings button label or name' }
      },
      required: ['name']
    }
  },
  {
    name: 'zepp_pw_expect',
    description: 'Playwright-style assertions verifying widget visibility, current route, or active toast',
    inputSchema: {
      type: 'object',
      properties: {
        toBeVisible: { type: 'string', description: 'Text or selector of widget that must be visible' },
        toHaveRoute: { type: 'string', description: 'Expected route path' },
        toHaveToast: { type: 'string', description: 'Expected active toast message' }
      }
    }
  },
  {
    name: 'zepp_pw_run_suite',
    description: 'Runs a parameterized test suite file across a device and API matrix and returns a formatted report with coverage',
    inputSchema: {
      type: 'object',
      properties: {
        suitePath: { type: 'string', description: 'Path to JavaScript test suite file' },
        devices: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override matrix devices list'
        },
        apiLevels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Override matrix API levels list'
        },
        collectCoverage: {
          type: 'boolean',
          description: 'Whether to collect API invocation coverage metrics (default: true)'
        }
      },
      required: ['suitePath']
    }
  }
];

export class McpServer {
  constructor(options = {}) {
    this.options = options;
    this.engine = getActiveEngine();
    this.watchSession = new WatchSession(this.engine, {
      projectPath: this.engine.projectPath,
      device: this.engine.device,
      apiLevel: this.engine.apiLevel
    });
    this.inputBuffer = '';
  }

  start() {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => this._handleData(chunk));
    process.stdin.on('end', () => {
      this.close();
    });
  }

  _send(response) {
    const jsonStr = JSON.stringify(response);
    process.stdout.write(jsonStr + '\n');
  }

  _handleData(chunk) {
    this.inputBuffer += chunk;

    while (this.inputBuffer.length > 0) {
      // Check for Content-Length framing (LSP / HTTP style)
      if (this.inputBuffer.startsWith('Content-Length:')) {
        const headerEnd = this.inputBuffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
          // Waiting for complete header
          break;
        }
        const headerLine = this.inputBuffer.slice(0, headerEnd);
        const match = headerLine.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          this.inputBuffer = this.inputBuffer.slice(headerEnd + 4);
          continue;
        }
        const contentLength = parseInt(match[1], 10);
        const totalExpectedLength = headerEnd + 4 + contentLength;
        if (this.inputBuffer.length < totalExpectedLength) {
          // Waiting for full body payload
          break;
        }
        const body = this.inputBuffer.slice(headerEnd + 4, totalExpectedLength);
        this.inputBuffer = this.inputBuffer.slice(totalExpectedLength);
        this._processJsonString(body);
        continue;
      }

      // Check for Newline-delimited JSON framing
      const newlineIdx = this.inputBuffer.indexOf('\n');
      if (newlineIdx !== -1) {
        const line = this.inputBuffer.slice(0, newlineIdx).trim();
        this.inputBuffer = this.inputBuffer.slice(newlineIdx + 1);
        if (line.length > 0) {
          this._processJsonString(line);
        }
        continue;
      }

      // Buffer contains incomplete line/message
      break;
    }
  }

  _processJsonString(str) {
    try {
      const msg = JSON.parse(str);
      this.handleMessage(msg);
    } catch (err) {
      console.error(`[MCP] Failed to parse JSON message: ${err.message}`, str);
      this._send({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${err.message}`
        }
      });
    }
  }

  async handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    const { id, method, params } = msg;

    // Handle notifications (no response needed)
    if (id === undefined || id === null) {
      if (method === 'notifications/initialized') {
        console.error('[MCP] Client initialized notification received.');
      }
      return;
    }

    try {
      switch (method) {
        case 'initialize': {
          this._send({
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: params?.protocolVersion || '2024-11-05',
              capabilities: {
                tools: {
                  listChanged: false
                }
              },
              serverInfo: {
                name: 'zeppos-emulator',
                version: '2.0.0'
              }
            }
          });
          break;
        }

        case 'ping': {
          this._send({
            jsonrpc: '2.0',
            id,
            result: {}
          });
          break;
        }

        case 'tools/list': {
          this._send({
            jsonrpc: '2.0',
            id,
            result: {
              tools: MCP_TOOLS
            }
          });
          break;
        }

        case 'tools/call': {
          const toolName = params?.name;
          const args = params?.arguments || {};
          const result = await this.executeTool(toolName, args);
          this._send({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                }
              ],
              isError: false
            }
          });
          break;
        }

        default: {
          this._send({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`
            }
          });
          break;
        }
      }
    } catch (err) {
      console.error(`[MCP] Error executing method "${method}":`, err);
      // For tools/call, standard MCP returns { content: [...], isError: true }
      if (method === 'tools/call') {
        this._send({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Error: ${err.message}`
              }
            ],
            isError: true
          }
        });
      } else {
        this._send({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: err.message
          }
        });
      }
    }
  }

  async executeTool(name, args = {}) {
    switch (name) {
      case 'emulator_load_app': {
        const res = await this.engine.loadApp(args);
        this.watchSession = new WatchSession(this.engine, {
          projectPath: this.engine.projectPath,
          device: this.engine.device,
          apiLevel: this.engine.apiLevel
        });
        return res;
      }

      case 'emulator_select_device': {
        return this.engine.selectDevice(args.device);
      }

      case 'emulator_set_api_version': {
        return this.engine.setApiVersion(args.apiLevel);
      }

      case 'emulator_set_sensors': {
        return this.engine.setSensors(args);
      }

      case 'emulator_get_screen': {
        return this.engine.getScreen();
      }

      case 'emulator_click': {
        return await this.engine.click(args);
      }

      case 'emulator_navigate': {
        if (args.back) {
          return await this.engine.back();
        }
        return await this.engine.navigate(args.url, args.params);
      }

      case 'emulator_get_settings_ui': {
        return this.engine.getSettingsUI();
      }

      case 'emulator_update_setting': {
        return this.engine.updateSetting(args);
      }

      case 'emulator_trigger_service': {
        return await this.engine.triggerService(args);
      }

      // Playwright-style MCP Tools
      case 'zepp_pw_goto': {
        await this.watchSession.navigate(args.route, args.params);
        return {
          route: this.watchSession.getRoute(),
          widgetsCount: this.watchSession.getWidgets().length
        };
      }

      case 'zepp_pw_locator_click': {
        let loc = null;
        if (args.text) {
          loc = this.watchSession.getByText(args.text);
        } else if (args.role) {
          loc = this.watchSession.getByRole(args.role);
        } else if (args.icon) {
          loc = this.watchSession.getByIcon(args.icon);
        } else {
          loc = this.watchSession.locator({});
        }

        if (args.index !== undefined) {
          loc = loc.nth(args.index);
        }

        await loc.click();
        return {
          success: true,
          route: this.watchSession.getRoute()
        };
      }

      case 'zepp_pw_settings_fill': {
        await this.watchSession.settingsPage.fill(args.label, args.value);
        return {
          success: true,
          label: args.label,
          value: args.value,
          currentValue: this.watchSession.settingsPage.getSettingValue(args.label)
        };
      }

      case 'zepp_pw_settings_click': {
        await this.watchSession.settingsPage.click(args.name);
        return {
          success: true,
          name: args.name
        };
      }

      case 'zepp_pw_expect': {
        const results = {};
        if (args.toBeVisible) {
          await expect(this.watchSession.locator(args.toBeVisible)).toBeVisible();
          results.toBeVisible = 'PASS';
        }
        if (args.toHaveRoute) {
          await expect(this.watchSession).toHaveRoute(args.toHaveRoute);
          results.toHaveRoute = 'PASS';
        }
        if (args.toHaveToast) {
          await expect(this.watchSession).toHaveToast(args.toHaveToast);
          results.toHaveToast = 'PASS';
        }
        return { status: 'PASS', assertions: results };
      }

      case 'zepp_pw_run_suite': {
        const suitePath = resolve(args.suitePath);
        const mod = await import(pathToFileURL(suitePath).href);
        const suite = mod.default || mod.suite || mod;
        if (args.devices) suite.matrix = suite.matrix || [];
        const results = await runSuite(suite, { verbose: true });
        const summary = formatSummaryTable(results);
        const allPassed = results.every((r) => r.status === 'PASS');
        return {
          passed: allPassed,
          results,
          summary
        };
      }

      default:
        throw new Error(`Unknown tool: "${name}"`);
    }
  }

  close() {
    if (this.engine) {
      this.engine.close();
    }
  }
}

export function startMcpServer() {
  const server = new McpServer();
  server.start();
  return server;
}

// Auto-run when executed directly as script
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  startMcpServer();
}

export default McpServer;
