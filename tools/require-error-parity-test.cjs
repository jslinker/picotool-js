#!/usr/bin/env node
'use strict';

// Focused ports of the two TestEvaluateRequire error cases from the pinned
// build_test.py. bundleRequiredLua evaluates require() calls and exposes the
// same LuaBuildError category as the upstream helper.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { bundleRequiredLua, LuaBuildError } = require('../src/require-build');

function withRequireFixture(callback) {
  const directory = mkdtempSync(join(tmpdir(), 'p8-require-error-test-'));
  try {
    const filename = join(directory, 'bar', 'foo.lua');
    // Match all three TestEvaluateRequire.setUp libraries. The resolver strips
    // the leading slash from absolute paths before looking them up in `files`.
    const files = {
      [join(directory, 'bar', 'lib1.lua').replace(/^\//, '')]: 'x=1\nreturn 111\n',
      [join(directory, 'bar', 'lib2.lua').replace(/^\//, '')]: 'require("lib1")\nx=2\nreturn 222\n',
      [join(directory, 'bar', 'lib3.lua').replace(/^\//, '')]: 'x=3\nfunction _update60() end\nfunction _draw() end\n',
    };
    callback({ filename, files });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('tests.pico8.build.build_test.TestEvaluateRequire.testErrorRelativePathChars', () => {
  withRequireFixture(({ filename, files }) => {
    assert.throws(
      () => bundleRequiredLua('require("../bar/lib1")\n', { filename, files }),
      (error) => error instanceof LuaBuildError && /filename cannot contain/.test(error.message),
    );
  });
});

test('tests.pico8.build.build_test.TestEvaluateRequire.testErrorRequireNotFound', () => {
  withRequireFixture(({ filename, files }) => {
    assert.throws(
      () => bundleRequiredLua('require("not_found")\n', { filename, files }),
      (error) => error instanceof LuaBuildError && /file not_found not found/.test(error.message),
    );
  });
});
