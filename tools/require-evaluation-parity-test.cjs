#!/usr/bin/env node
'use strict';

// Focused ports of TestEvaluateRequire's successful module-evaluation cases.
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { bundleRequiredLua } = require('../src/require-build');

function withRequireFixture(callback) {
  const directory = mkdtempSync(join(tmpdir(), 'p8-require-evaluation-test-'));
  try {
    const filename = join(directory, 'bar', 'foo.lua');
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

function bundledText(source, options) {
  return Buffer.from(bundleRequiredLua(source, options)).toString('latin1');
}

function moduleBody(output, moduleName) {
  const escaped = moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = output.match(new RegExp(`package\\._c\\["${escaped}"\\]=function\\(\\)\\n([\\s\\S]*?)\\nend\\n`));
  assert.ok(match, `bundle contains module ${moduleName}`);
  return match[1];
}

test('tests.pico8.build.build_test.TestEvaluateRequire.testRequiresFile', () => {
  withRequireFixture(({ filename, files }) => {
    const output = bundledText('require("lib1")\n', { filename, files });
    assert.match(moduleBody(output, 'lib1'), /x=1/);
  });
});

test('tests.pico8.build.build_test.TestEvaluateRequire.testRequiresInnerFile', () => {
  withRequireFixture(({ filename, files }) => {
    const output = bundledText('require("lib2")\n', { filename, files });
    assert.match(moduleBody(output, 'lib1'), /x=1/);
    assert.match(moduleBody(output, 'lib2'), /x=2/);
  });
});

test('tests.pico8.build.build_test.TestEvaluateRequire.testStripsGameLoop', () => {
  withRequireFixture(({ filename, files }) => {
    const output = bundledText('require("lib3")\n', { filename, files });
    const module = moduleBody(output, 'lib3');
    assert.match(module, /x=3/);
    assert.doesNotMatch(module, /_update60/);
  });
});

test('tests.pico8.build.build_test.TestEvaluateRequire.testDoesntStripGameLoopOption', () => {
  withRequireFixture(({ filename, files }) => {
    const output = bundledText('require("lib3", {use_game_loop=true})\n', { filename, files });
    const module = moduleBody(output, 'lib3');
    assert.match(module, /x=3/);
    assert.match(module, /_update60/);
  });
});
