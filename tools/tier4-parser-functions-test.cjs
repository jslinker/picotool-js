#!/usr/bin/env node
'use strict';

// Focused ports of parser fragments from the pinned parser_test.py. Python's
// get_tokens appends LF to every split line, including the final line; mirror
// that setup exactly. AstParser.i indexes significant tokens, so cursor()
// maps the last consumed token back to the full token stream used by Python.
const assert = require('node:assert/strict');
const test = require('node:test');
const { AstParser } = require('../src/lua-ast-model');
const { TokNumber } = require('../src/lua-token');

function parser(source) {
  const withLinefeeds = source.split('\n').map((line) => `${line}\n`).join('');
  return new AstParser(withLinefeeds);
}
function cursor(p) { return p.i === 0 ? 0 : p.tokens[p.i - 1].tokenPos + 1; }

test('tests.pico8.lua.parser_test.TestParser.testFuncname', () => {
  const p = parser('foo'); const node = p.funcName();
  assert.ok(node); assert.equal(cursor(p), 1);
  assert.equal(node.type, 'FunctionName');
  assert.equal(node.namepath[0].value, 'foo'); assert.equal(node.methodname, null);
});

test('tests.pico8.lua.parser_test.TestParser.testFuncnamePath', () => {
  const p = parser('foo.bar.baz'); const node = p.funcName();
  assert.ok(node); assert.equal(cursor(p), 5);
  assert.equal(node.type, 'FunctionName');
  assert.equal(node.namepath[0].value, 'foo'); assert.equal(node.namepath[1].value, 'bar');
  assert.equal(node.namepath[2].value, 'baz'); assert.equal(node.methodname, null);
});

test('tests.pico8.lua.parser_test.TestParser.testFuncnameMethod', () => {
  const p = parser('foo:method'); const node = p.funcName();
  assert.ok(node); assert.equal(cursor(p), 3);
  assert.equal(node.type, 'FunctionName');
  assert.equal(node.namepath[0].value, 'foo'); assert.equal(node.methodname.value, 'method');
});

test('tests.pico8.lua.parser_test.TestParser.testFuncnamePathAndMethod', () => {
  const p = parser('foo.bar.baz:method'); const node = p.funcName();
  assert.ok(node); assert.equal(cursor(p), 7);
  assert.equal(node.type, 'FunctionName');
  assert.equal(node.namepath[0].value, 'foo'); assert.equal(node.namepath[1].value, 'bar');
  assert.equal(node.namepath[2].value, 'baz'); assert.equal(node.methodname.value, 'method');
});

test('tests.pico8.lua.parser_test.TestParser.testFuncBodyEmptyParList', () => {
  const p = parser('() return end'); const node = p.functionBody();
  assert.ok(node); assert.equal(cursor(p), 6);
  assert.equal(node.parlist, null); assert.equal(node.dots, null);
  assert.equal(node.block.stats.length, 1); assert.equal(node.block.stats[0].type, 'StatReturn');
});

test('tests.pico8.lua.parser_test.TestParser.testFuncBodyParList', () => {
  const p = parser('(foo, bar) return end'); const node = p.functionBody();
  assert.ok(node); assert.equal(cursor(p), 10);
  assert.equal(node.parlist.names.length, 2);
  assert.equal(node.parlist.names[0].value, 'foo'); assert.equal(node.parlist.names[1].value, 'bar');
  assert.equal(node.dots, null); assert.equal(node.block.stats.length, 1);
  assert.equal(node.block.stats[0].type, 'StatReturn');
});

test('tests.pico8.lua.parser_test.TestParser.testFuncBodyParListWithDots', () => {
  const p = parser('(foo, bar, ...) return end'); const node = p.functionBody();
  assert.ok(node); assert.equal(cursor(p), 13);
  assert.equal(node.parlist.names.length, 2);
  assert.equal(node.parlist.names[0].value, 'foo'); assert.equal(node.parlist.names[1].value, 'bar');
  assert.equal(node.dots.type, 'VarargDots'); assert.equal(node.block.stats.length, 1);
  assert.equal(node.block.stats[0].type, 'StatReturn');
});

test('tests.pico8.lua.parser_test.TestParser.testFuncBodyParListOnlyDots', () => {
  const p = parser('(...) return end'); const node = p.functionBody();
  assert.ok(node); assert.equal(cursor(p), 7);
  assert.equal(node.parlist, null); assert.equal(node.dots.type, 'VarargDots');
  assert.equal(node.block.stats.length, 1); assert.equal(node.block.stats[0].type, 'StatReturn');
});

test('tests.pico8.lua.parser_test.TestParser.testFunctionNoArgs', () => {
  const source = 'function() return end'; const p = parser(source);
  // expression() wraps the same Function node in ExpValue. Unwrap that
  // grammar node to adapt Python's standalone `_function()` result shape.
  const expression = p.expression(); const node = expression.value;
  assert.ok(node); assert.equal(node.type, 'Function'); assert.equal(cursor(p), 7);
  assert.equal(node.funcbody.parlist, null); assert.equal(node.funcbody.dots, null);
  assert.equal(node.funcbody.block.stats.length, 1);
  assert.equal(node.funcbody.block.stats[0].type, 'StatReturn');
});

test('tests.pico8.lua.parser_test.TestParser.testFunctionFancyArgs', () => {
  const source = 'function(foo, bar, ...) return end'; const p = parser(source);
  const expression = p.expression(); const node = expression.value;
  assert.ok(node); assert.equal(node.type, 'Function'); assert.equal(cursor(p), 14);
  assert.equal(node.funcbody.parlist.names.length, 2);
  assert.equal(node.funcbody.parlist.names[0].value, 'foo');
  assert.equal(node.funcbody.parlist.names[1].value, 'bar');
  assert.equal(node.funcbody.dots.type, 'VarargDots');
  assert.equal(node.funcbody.block.stats.length, 1);
  assert.equal(node.funcbody.block.stats[0].type, 'StatReturn');
});

test('tests.pico8.lua.parser_test.TestParser.testTableConstructor', () => {
  const p = parser('{[1]=2,foo=3;4}'); const open = p.take('symbol', '{');
  const node = p.table(open);
  assert.ok(node); assert.equal(cursor(p), 13);
  assert.equal(node.type, 'TableConstructor'); assert.equal(node.fields.length, 3);
  assert.equal(node.fields[0].type, 'FieldExpKey');
  assert.ok(node.fields[0].key_exp.value.matches(new TokNumber('1')));
  assert.ok(node.fields[0].exp.value.matches(new TokNumber('2')));
  assert.equal(node.fields[1].type, 'FieldNamedKey');
  assert.equal(node.fields[1].key_name.value, 'foo');
  assert.ok(node.fields[1].exp.value.matches(new TokNumber('3')));
  assert.equal(node.fields[2].type, 'FieldExp');
  assert.ok(node.fields[2].exp.value.matches(new TokNumber('4')));
});

test('tests.pico8.lua.parser_test.TestParser.testTableConstructorTrailingSep', () => {
  const p = parser('{5,}'); const open = p.take('symbol', '{'); const node = p.table(open);
  assert.ok(node); assert.equal(cursor(p), 4); assert.equal(node.fields.length, 1);
  assert.ok(node.fields[0].exp.value.matches(new TokNumber('5')));
});

test('tests.pico8.lua.parser_test.TestParser.testTableConstructorEmpty', () => {
  const p = parser('{   }'); const open = p.take('symbol', '{'); const node = p.table(open);
  assert.ok(node); assert.equal(cursor(p), 3);
  assert.equal(node.type, 'TableConstructor'); assert.deepEqual(node.fields, []);
});

test('tests.pico8.lua.parser_test.TestParser.testExpValueTableConstructor', () => {
  const p = parser('{5,}'); const node = p.expression();
  assert.ok(node); assert.equal(cursor(p), 4); assert.equal(node.value.fields.length, 1);
  assert.ok(node.value.fields[0].exp.value.matches(new TokNumber('5')));
});

test('tests.pico8.lua.parser_test.TestParser.testArgsTableConstructor', () => {
  const p = parser('{5,}'); const node = p.arguments();
  assert.ok(node); assert.equal(cursor(p), 4); assert.equal(node.fields.length, 1);
  assert.ok(node.fields[0].exp.value.matches(new TokNumber('5')));
});

test('tests.pico8.lua.parser_test.TestParser.testExpValueFunction', () => {
  const p = parser('function() return end'); const node = p.expression();
  assert.ok(node); assert.equal(cursor(p), 7);
  assert.equal(node.value.funcbody.parlist, null); assert.equal(node.value.funcbody.dots, null);
  assert.equal(node.value.funcbody.block.stats.length, 1);
  assert.equal(node.value.funcbody.block.stats[0].type, 'StatReturn');
});
