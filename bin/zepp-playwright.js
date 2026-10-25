#!/usr/bin/env node

/**
 * CLI Entrypoint for Zepp Playwright Test Runner
 */

import { readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { runSuites } from '../src/test-runner.js';

async function main() {
  const args = process.argv.slice(2);
  let suiteFiles = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--suite' || arg === '-s') {
      if (args[i + 1]) {
        suiteFiles.push(args[++i]);
      }
    } else if (!arg.startsWith('-')) {
      suiteFiles.push(arg);
    }
  }

  // If no suites provided, check test/suites/
  if (suiteFiles.length === 0) {
    const defaultDir = resolve('test/suites');
    if (existsSync(defaultDir)) {
      const files = readdirSync(defaultDir);
      suiteFiles = files
        .filter((f) => f.endsWith('.suite.mjs') || f.endsWith('.suite.js'))
        .map((f) => join(defaultDir, f));
    }
  }

  if (suiteFiles.length === 0) {
    console.error('No Zepp Playwright test suites found to run.');
    process.exit(1);
  }

  console.log(`Starting Zepp OS Playwright runner with ${suiteFiles.length} suite(s)...`);
  const results = await runSuites(suiteFiles);

  const hasFailures = results.some((r) => r.status === 'FAIL');
  process.exit(hasFailures ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
