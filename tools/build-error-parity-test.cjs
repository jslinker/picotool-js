#!/usr/bin/env node
'use strict';

// Focused ports of three TestDoBuild cases from the pinned build_test.py.
// The JS CLI is the supported adapter for Python do_build's status return;
// The JS helper uses an in-memory file map and returns a normalized key or null.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { locateRequireFile } = require('../src/require-build');
const cli = join(__dirname, 'p8tool.cjs');

function buildInEmptyDirectory(argv) {
  const directory = mkdtempSync(join(tmpdir(), 'p8-build-error-test-'));
  try {
    const result = spawnSync(process.execPath, [cli, 'build', ...argv], {
      cwd: directory, encoding: 'utf8',
    });
    assert.ifError(result.error);
    assert.equal(result.stdout, '');
    return { status: result.status, diagnostic: result.stderr };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('tests.pico8.build.build_test.TestDoBuild.testErrorInputFileDoesNotExist', () => {
  const result = buildInEmptyDirectory(['--lua', 'doesnotexist.p8', 'foo.p8']);
  assert.equal(result.status, 1);
  assert.match(result.diagnostic, /doesnotexist\.p8.*does not exist/);
});

test('tests.pico8.build.build_test.TestDoBuild.testErrorOutputFilenameHasWrongExtension', () => {
  const result = buildInEmptyDirectory(['foo.xxx']);
  assert.equal(result.status, 1);
  assert.match(result.diagnostic, /Output filename must end with \.p8 or \.p8\.png/);
});

test('tests.pico8.build.build_test.TestDoBuild.testLocateRequireFileNotFound', () => {
  const directory = mkdtempSync(join(tmpdir(), 'p8-require-lookup-test-'));
  try {
    const srcpath = join(directory, 'src.lua');
    assert.equal(locateRequireFile('foo', srcpath, { files: {} }), null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
