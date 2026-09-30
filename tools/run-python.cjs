'use strict';
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { packageRoot, python, pythonOptions } = require('./test-env.cjs');
const [script, ...args] = process.argv.slice(2);
if (!script) throw new Error('A Python script path is required');
const result = spawnSync(python, [resolve(packageRoot, script), ...args], pythonOptions({ stdio: 'inherit' }));
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
