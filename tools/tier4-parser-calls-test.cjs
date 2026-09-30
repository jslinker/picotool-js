'use strict';

// Successful call and final-statement fragment ports from parser_test.py.
// Each source line includes get_tokens()'s appended newline.
const assert = require('node:assert/strict');
const test = require('node:test');
const { AstParser } = require('../src/lua-ast-model');

function parser(source) { return new AstParser(`${source}\n`); }
function sourceCursor(p) { return p.i ? p.tokens[p.i - 1].tokenPos + 1 : 0; }

// The parser exposes calls as a value inside prefix(); unwrapping it preserves
// the upstream successful _functioncall node fields and source cursor.
test('tests.pico8.lua.parser_test.TestParser.testFunctionCall', () => {
  const p = parser('fname(foo, bar, baz)'); const wrapped = p.prefix(); const node = wrapped.value;
  assert.equal(node.type, 'FunctionCall'); assert.equal(sourceCursor(p), 10);
  assert.equal(node.exp_prefix.name.type, 'name'); assert.equal(node.exp_prefix.name.code, 'fname');
  assert.equal(node.args.explist.exps.length, 3);
});

test('tests.pico8.lua.parser_test.TestParser.testFunctionCallValueArgs', () => {
  const p = parser('foo(1, 2, 3)'); const node = p.prefix().value;
  assert.equal(node.type, 'FunctionCall'); assert.equal(sourceCursor(p), 10);
});

test('tests.pico8.lua.parser_test.TestParser.testFunctionCallNoArgs', () => {
  const p = parser('foo()'); const node = p.prefix().value;
  assert.equal(node.type, 'FunctionCall'); assert.equal(sourceCursor(p), 3);
});

test('tests.pico8.lua.parser_test.TestParser.testFunctionCallMethod', () => {
  const p = parser('obj:method(foo, bar, baz)'); const node = p.prefix().value;
  assert.equal(node.type, 'FunctionCallMethod'); assert.equal(sourceCursor(p), 12);
  assert.equal(node.exp_prefix.name.type, 'name'); assert.equal(node.exp_prefix.name.code, 'obj');
  assert.equal(node.methodname.type, 'name'); assert.equal(node.methodname.code, 'method');
  assert.equal(node.args.explist.exps.length, 3);
});

// AstParser has statement(), not Python's _laststat(). These source fragments
// produce the same StatBreak/StatReturn nodes and preserve the tested cursor.
test('tests.pico8.lua.parser_test.TestParser.testLastStatBreak', () => {
  const p = parser('break'); const node = p.statement();
  assert.equal(node.type, 'StatBreak'); assert.equal(sourceCursor(p), 1);
  assert.equal(node.start_pos, 0); assert.equal(node.end_pos, 1);
});

test('tests.pico8.lua.parser_test.TestParser.testLastStatReturnNoExp', () => {
  const p = parser('return'); const node = p.statement();
  assert.equal(node.type, 'StatReturn'); assert.equal(sourceCursor(p), 1);
  assert.equal(node.explist, null);
});

test('tests.pico8.lua.parser_test.TestParser.testLastStatReturnExps', () => {
  const p = parser('return 1, 2, 3'); const node = p.statement();
  assert.equal(node.type, 'StatReturn'); assert.equal(sourceCursor(p), 9);
  assert.equal(node.explist.exps.length, 3);
});

