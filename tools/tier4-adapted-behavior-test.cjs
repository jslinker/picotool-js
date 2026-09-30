'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { LuaSource, bundleRequiredLua } = require('../src');

// Approved behavior adaptation: Python inspects version 4 on private lexer
// and parser instances. JS stores version metadata on LuaSource instead;
// this assertion does not establish private-object or versioned grammar parity.
test('tests.pico8.lua.lua_test.TestLua.testInit', () => {
  const source = new LuaSource(new Uint8Array(), 4);
  assert.equal(source.version, 4);
});

// Approved behavior adaptation: Python returns the same Lua object when its
// package map is empty. JS returns bytes. Verify unchanged source bytes using
// the original fixture, without claiming AST identity or allocation parity.
test('tests.pico8.build.build_test.TestPrependPackageLua.testEmptyPackageLua', () => {
  const input = Buffer.from('x=1\n');
  const output = bundleRequiredLua(input, { files: {} });
  assert.deepEqual(Buffer.from(output), input);
});
