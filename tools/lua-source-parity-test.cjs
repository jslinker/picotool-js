'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { analyzeLua, cartridgeStats, echoLua, echoLuaAst, minifyLuaAst } = require('../src');
const { VALID_LUA_SHORT_LINES } = require('../tests/fixtures/tier2-lua/lua');

// LuaSource has no writer-class or metadata/count methods; these tests use the
// corresponding public cartridgeStats/analyzeLua and writer-function adapters.
const shortSource = VALID_LUA_SHORT_LINES.join('');
const toParsedP8 = (lines) => ({ format: 'p8', version: 4, sections: { lua: lines } });
const toLines = (bytes) => Buffer.from(bytes).toString('latin1').match(/[^\n]*\n|[^\n]+$/g) || [];

test('tests.pico8.lua.lua_test.TestLua.testGetByline', () => {
  assert.deepEqual(cartridgeStats(toParsedP8(VALID_LUA_SHORT_LINES)).byline, Buffer.from('by dan'));
});

test('tests.pico8.lua.lua_test.TestLua.testGetTitle', () => {
  assert.deepEqual(cartridgeStats(toParsedP8(VALID_LUA_SHORT_LINES)).title, Buffer.from('short test'));
});

test('tests.pico8.lua.lua_test.TestLua.testGetTokenCount', () => {
  assert.equal(analyzeLua(shortSource).tokenCount, 5);
});

test('tests.pico8.lua.lua_test.TestLua.testGetCharCount', () => {
  assert.equal(analyzeLua(shortSource).characterCount, [...VALID_LUA_SHORT_LINES].reduce((sum, line) => sum + Buffer.byteLength(line, 'latin1'), 0));
});

test('tests.pico8.lua.lua_test.TestLua.testGetTokenCountCarriageReturns', () => {
  assert.equal(analyzeLua('function foo()\r\n  return 999\r\nend\r\n').tokenCount, 5);
});

test('tests.pico8.lua.lua_test.TestLuaEchoWriter.testToLinesEchoWriter', () => {
  assert.deepEqual(toLines(echoLua(shortSource)), VALID_LUA_SHORT_LINES);
});

test('tests.pico8.lua.lua_test.TestLuaEchoWriter.testToLinesEchoWriterLastCharIsntNewline', () => {
  const source = `${shortSource}break`;
  assert.deepEqual(toLines(echoLua(source)), [...VALID_LUA_SHORT_LINES, 'break']);
});

test('tests.pico8.lua.lua_test.TestLuaASTEchoWriter.testToLinesASTEchoWriter', () => {
  assert.deepEqual(toLines(echoLuaAst(shortSource)), VALID_LUA_SHORT_LINES);
});

test('tests.pico8.lua.lua_test.TestLuaMinifyWriter.testMinifiesNames', () => {
  assert.ok(Buffer.from(minifyLuaAst(shortSource)).includes(Buffer.from('function a()')));
});

test('tests.pico8.lua.lua_test.TestLuaMinifyWriter.testMinifiesSpaces', () => {
  assert.deepEqual(Array.from(minifyLuaAst(shortSource)), Array.from(Buffer.from('function a()\nreturn 999\nend')));
});

// Open feature: Python supports custom writers by subclassing BaseLuaWriter
// and implementing to_lines(); the base method itself raises NotImplementedError.
// JS currently provides concrete writer functions, not that extension lifecycle.
// Deferred by the maintainer because custom writer subclasses are not needed
// for the current project. This is an open contribution opportunity, not a
// passing parity test. A PR should design/integrate the custom writer interface,
// test a working custom writer, and verify the abstract method rejects use.
// Upstream: tests/pico8/lua/lua_test.py:148 (pinned in the parity catalog).
test.todo('tests.pico8.lua.lua_test.TestLua.testBaseLuaWriterNotYetImplemented');
