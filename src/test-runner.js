/**
 * ZeppPlaywright Test Runner
 * Parameterized matrix test runner with coverage metrics & reporting
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createWatchSession, expect, flushAsync } from './playwright.js';
import { getDevice } from './devices.js';

/**
 * Expands various matrix configurations into an array of { device, apiLevel } combinations
 */
export function expandMatrix(matrix) {
  if (!matrix) {
    return [{ device: 'amazfit-balance', apiLevel: '3.6.0' }];
  }

  if (Array.isArray(matrix)) {
    return matrix.map((entry) => {
      if (typeof entry === 'string') {
        const dev = getDevice(entry);
        return {
          device: entry,
          apiLevel: dev?.defaultApi || dev?.apiLevel || '3.6.0'
        };
      }
      const dev = getDevice(entry.device);
      return {
        device: entry.device || 'amazfit-balance',
        apiLevel: entry.apiLevel || dev?.defaultApi || dev?.apiLevel || '3.6.0'
      };
    });
  }

  const devices = Array.isArray(matrix.device)
    ? matrix.device
    : Array.isArray(matrix.devices)
    ? matrix.devices
    : ['amazfit-balance'];

  const apiLevels = Array.isArray(matrix.apiLevel)
    ? matrix.apiLevel
    : Array.isArray(matrix.apiLevels)
    ? matrix.apiLevels
    : null;

  // If apiLevels provided and has exact same length as devices, treat as paired 1:1
  if (apiLevels && apiLevels.length === devices.length) {
    return devices.map((d, i) => ({
      device: d,
      apiLevel: apiLevels[i]
    }));
  }

  // If apiLevels provided with different length, compute cartesian product
  if (apiLevels && apiLevels.length > 0) {
    const res = [];
    for (const d of devices) {
      for (const a of apiLevels) {
        res.push({ device: d, apiLevel: a });
      }
    }
    return res;
  }

  // Default: infer apiLevel per device
  return devices.map((d) => {
    const dev = getDevice(d);
    return {
      device: d,
      apiLevel: dev?.defaultApi || dev?.apiLevel || '3.6.0'
    };
  });
}

/**
 * Defines a parameterized test suite
 */
export function defineSuite(config) {
  const {
    name = 'Unnamed Zepp Suite',
    projectPath,
    matrix = ['amazfit-balance'],
    sensors = {},
    settings = {},
    routes = {},
    fn
  } = config;

  if (typeof fn !== 'function') {
    throw new Error(`defineSuite("${name}") requires a test function 'fn'`);
  }

  return {
    name,
    projectPath: resolve(projectPath),
    matrix: expandMatrix(matrix),
    sensors,
    settings,
    routes,
    fn
  };
}

/**
 * Executes a single suite across all its matrix combinations
 */
export async function runSuite(suite, options = {}) {
  const { verbose = false, onProgress = null } = options;
  const results = [];
  const suiteName = suite.name;

  for (const combo of suite.matrix) {
    const { device, apiLevel } = combo;
    const testTitle = `${suiteName} [${device} | API ${apiLevel}]`;
    const start = Date.now();
    let session = null;
    let error = null;
    let metrics = { visitedRoutes: [], interactedWidgets: [], apiCalls: {} };

    try {
      if (typeof onProgress === 'function') {
        onProgress({ type: 'start', title: testTitle, device, apiLevel });
      }

      session = await createWatchSession({
        projectPath: suite.projectPath,
        device,
        apiLevel,
        sensors: suite.sensors,
        settings: suite.settings,
        routes: suite.routes
      });

      // Run user test logic
      await suite.fn({
        session,
        device,
        apiLevel,
        expect,
        context: { device, apiLevel, projectPath: suite.projectPath }
      });

      // Gather metrics
      const sessMetrics = session.getMetrics();
      const apiCalls =
        session.engine?.getApiCoverage?.() ||
        session.engine?._apiCalls ||
        session.engine?.apiCoverage ||
        {};

      metrics = {
        visitedRoutes: sessMetrics.visitedRoutes,
        interactedWidgets: sessMetrics.interactedWidgets,
        apiCalls
      };
    } catch (err) {
      error = err;
    } finally {
      if (session) {
        try {
          await session.close();
        } catch (_) {}
      }
    }

    const durationMs = Date.now() - start;
    const result = {
      suite: suiteName,
      device,
      apiLevel,
      status: error ? 'FAIL' : 'PASS',
      durationMs,
      error,
      metrics
    };

    results.push(result);

    if (typeof onProgress === 'function') {
      onProgress({ type: 'end', result });
    }
  }

  return results;
}

/**
 * Formats a clean, readable ASCII summary table of test results
 */
export function formatSummaryTable(allResults, options = {}) {
  const lines = [];
  const hr = '═'.repeat(102);
  const thinHr = '─'.repeat(102);

  lines.push('');
  lines.push(hr);
  lines.push('                             ZEPP OS TEST EXECUTION REPORT                                ');
  lines.push(hr);

  // Group by suite
  const suites = new Map();
  for (const r of allResults) {
    if (!suites.has(r.suite)) suites.set(r.suite, []);
    suites.get(r.suite).push(r);
  }

  // Aggregate API calls across all tests
  const aggregatedApi = { '1.0': new Map(), '2.0': new Map(), '3.0/3.6': new Map(), '4.0': new Map(), 'General': new Map() };

  for (const [suiteName, testList] of suites.entries()) {
    lines.push(`\nSuite: ${suiteName}`);
    lines.push('┌───────────────────┬──────────┬────────┬──────────┬─────────────────┬───────────────────┐');
    lines.push('│ Device            │ API Lvl  │ Status │ Time     │ Routes Visited  │ Interacted Widgets│');
    lines.push('├───────────────────┼──────────┼────────┼──────────┼─────────────────┼───────────────────┤');

    for (const res of testList) {
      const dev = res.device.padEnd(17).slice(0, 17);
      const api = res.apiLevel.padEnd(8).slice(0, 8);
      const st = res.status === 'PASS' ? ' PASS ' : ' FAIL ';
      const time = `${res.durationMs}ms`.padStart(8).slice(-8);

      const routesCount = res.metrics.visitedRoutes.length;
      const routesStr = `${routesCount} page(s)`.padEnd(15).slice(0, 15);

      const widgetCount = res.metrics.interactedWidgets.length;
      const widgetStr = `${widgetCount} action(s)`.padEnd(17).slice(0, 17);

      lines.push(`│ ${dev} │ ${api} │ ${st} │ ${time} │ ${routesStr} │ ${widgetStr} │`);

      // Tally API calls
      if (res.metrics.apiCalls) {
        for (const [apiName, count] of Object.entries(res.metrics.apiCalls)) {
          let bucket = 'General';
          if (apiName.startsWith('hmUI') || apiName.startsWith('hmApp') || apiName.startsWith('hmSensor') || res.apiLevel === '1.0.0') {
            bucket = '1.0';
          } else if (res.apiLevel === '2.0.0') {
            bucket = '2.0';
          } else if (res.apiLevel === '4.0.0') {
            bucket = '4.0';
          } else if (res.apiLevel.startsWith('3.')) {
            bucket = '3.0/3.6';
          }
          const m = aggregatedApi[bucket];
          m.set(apiName, (m.get(apiName) || 0) + Number(count));
        }
      }
    }
    lines.push('└───────────────────┴──────────┴────────┴──────────┴─────────────────┴───────────────────┘');
  }

  // API Level Coverage breakdown
  lines.push('\nZepp OS API Level Invocation Coverage:');
  for (const [level, m] of Object.entries(aggregatedApi)) {
    if (m.size > 0) {
      const topCalls = Array.from(m.entries())
        .slice(0, 8)
        .map(([name, count]) => `${name} (${count})`)
        .join(', ');
      lines.push(`  • Level [${level}]: ${topCalls}`);
    }
  }

  // Final summary stats
  const total = allResults.length;
  const passed = allResults.filter((r) => r.status === 'PASS').length;
  const failed = allResults.filter((r) => r.status === 'FAIL').length;
  const totalDuration = allResults.reduce((acc, r) => acc + r.durationMs, 0);

  lines.push('\n' + thinHr);
  lines.push(
    `Total: ${total} | Passed: ${passed} (${Math.round((passed / (total || 1)) * 100)}%) | Failed: ${failed} | Duration: ${totalDuration}ms`
  );
  lines.push(hr);

  if (failed > 0) {
    lines.push('\nFailures:');
    for (const r of allResults) {
      if (r.error) {
        lines.push(`\n❌ [${r.suite}] ${r.device} (API ${r.apiLevel}):`);
        lines.push(r.error.stack || r.error.message || String(r.error));
      }
    }
  }

  return lines.join('\n');
}

/**
 * Loads and runs multiple test suites from file paths
 */
export async function runSuites(suitePaths, options = {}) {
  const allResults = [];

  for (const suitePath of suitePaths) {
    const absPath = resolve(suitePath);
    const fileUrl = pathToFileURL(absPath).href;

    try {
      const mod = await import(fileUrl);
      const suite = mod.default || mod.suite;

      if (!suite || typeof suite !== 'object') {
        throw new Error(`File ${suitePath} does not export a default test suite`);
      }

      console.log(`\n▶ Running Suite: ${suite.name || suitePath}`);
      const suiteResults = await runSuite(suite, {
        onProgress: ({ type, title, result }) => {
          if (type === 'start') {
            process.stdout.write(`  • ${title} ... `);
          } else if (type === 'end') {
            const symbol = result.status === 'PASS' ? '✓' : '✗';
            console.log(`${symbol} (${result.durationMs}ms)`);
          }
        }
      });

      allResults.push(...suiteResults);
    } catch (err) {
      console.error(`Error loading or executing suite ${suitePath}:`, err);
      allResults.push({
        suite: suitePath,
        device: 'unknown',
        apiLevel: 'unknown',
        status: 'FAIL',
        durationMs: 0,
        error: err,
        metrics: { visitedRoutes: [], interactedWidgets: [], apiCalls: {} }
      });
    }
  }

  const summary = formatSummaryTable(allResults);
  console.log(summary);

  return allResults;
}

export default {
  defineSuite,
  expandMatrix,
  runSuite,
  runSuites,
  formatSummaryTable
};
