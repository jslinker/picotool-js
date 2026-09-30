'use strict';

const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { picotoolRoot, fixturesRoot, python } = require('./test-env.cjs');

// Run outside the repository so accidental cwd-relative oracle paths cannot
// make this check pass in the monorepo while failing in a cloned package.
const cwd = mkdtempSync(join(tmpdir(), 'picotool-standalone-'));
try {
  const script = "const e=require(process.argv[1]); if(e.picotoolRoot!==process.argv[2]||e.fixturesRoot!==process.argv[3]) process.exit(1)";
  const result = spawnSync(process.execPath, ['-e', script, require.resolve('./test-env.cjs'), picotoolRoot, fixturesRoot], {
    cwd,
    env: { ...process.env, PICOTOOL_ROOT: picotoolRoot, PICOTOOL_FIXTURES_ROOT: fixturesRoot, PYTHON: python },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
console.log('test-env: standalone cwd resolution passed');
