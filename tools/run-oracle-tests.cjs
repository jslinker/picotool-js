#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const tests = [
  'test-env-test.cjs', 'coverage-inventory-test.cjs', 'coverage-differential-test.cjs', 'generated-domain-test.cjs',
  'cli-test.cjs', 'png-edge-test.cjs', 'ast-walker-oracle-test.cjs',
  'ast-oracle-test.cjs', 'check-parity.cjs',
];
const { python, pythonOptions, packageRoot } = require('./test-env.cjs');
const baseline = spawnSync(python, [path.join(__dirname, 'python-suite-baseline-test.py')], pythonOptions({ stdio: 'inherit' }));
if (baseline.status !== 0) process.exit(baseline.status ?? 1);
for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
