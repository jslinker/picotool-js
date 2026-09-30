'use strict';

// Resolve the optional Python oracle from the package location, never from the
// caller's current working directory. This keeps npm scripts and direct node
// invocations equivalent in a standalone clone and in the monorepo checkout.
const { existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

const packageRoot = resolve(__dirname, '..');
const candidates = process.env.PICOTOOL_ROOT
  ? [resolve(process.env.PICOTOOL_ROOT)]
  : [join(packageRoot, 'vendor', 'picotool'), join(packageRoot, '..', '..', 'vendor', 'picotool')];
const picotoolRoot = candidates.find((value) => existsSync(join(value, 'pico8')));
if (!picotoolRoot) {
  throw new Error('Python picotool oracle not found. Set PICOTOOL_ROOT to a picotool checkout or install vendor/picotool.');
}

const fixturesRoot = resolve(process.env.PICOTOOL_FIXTURES_ROOT || join(picotoolRoot, 'tests', 'testdata'));
if (!existsSync(fixturesRoot)) {
  throw new Error(`Python picotool fixtures not found: ${fixturesRoot}. Set PICOTOOL_FIXTURES_ROOT to the fixture directory.`);
}

const venvPython = join(packageRoot, '.oracle-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = process.env.PYTHON || (existsSync(venvPython) ? venvPython : process.platform === 'win32' ? 'python' : 'python3');
const pythonEnv = {
  ...process.env,
  PYTHON: python,
  PICOTOOL_ROOT: picotoolRoot,
  PICOTOOL_FIXTURES_ROOT: fixturesRoot,
  PYTHONPATH: [picotoolRoot, process.env.PYTHONPATH].filter(Boolean).join(require('node:path').delimiter),
};

function fixture(name) { return join(fixturesRoot, name); }
function pythonOptions(extra = {}) { return { ...extra, env: { ...pythonEnv, ...(extra.env || {}) } }; }

module.exports = { packageRoot, picotoolRoot, fixturesRoot, fixture, python, pythonEnv, pythonOptions };
