#!/usr/bin/env node
'use strict';

// Direct ports of parser fragments from the pinned pico8 parser_test.py.
const assert = require('node:assert/strict');
const test = require('node:test');
const { AstParser } = require('../src/lua-ast-model');
const { TokNumber } = require('../src/lua-token');

function parser(source) {
  return new AstParser(source.split('\n').map((line) => `${line}\n`).join(''));
}
function cursor(p) { return p.i === 0 ? 0 : p.tokens[p.i - 1].tokenPos + 1; }

test('tests.pico8.lua.parser_test.TestParser.testNameListOneOK', () => {
  const p = parser('name1'); const node = p.namelist();
  assert.ok(node); assert.equal(cursor(p), 1); assert.equal(node.type, 'NameList');
  assert.equal(node.names[0].value, 'name1'); assert.equal(node.names.length, 1);
});

test('tests.pico8.lua.parser_test.TestParser.testNameListOneWithMoreOK', () => {
  const p = parser('name1 + name2'); const node = p.namelist();
  assert.ok(node); assert.equal(cursor(p), 1); assert.equal(node.type, 'NameList');
  assert.equal(node.names[0].value, 'name1'); assert.equal(node.names.length, 1);
});

test('tests.pico8.lua.parser_test.TestParser.testNameListMultipleOK', () => {
  const p = parser('name1,name2,   name3, name4'); const node = p.namelist();
  assert.ok(node); assert.equal(node.type, 'NameList'); assert.equal(cursor(p), 9);
  assert.deepEqual(node.names.map((name) => name.value), ['name1', 'name2', 'name3', 'name4']);
});

test('tests.pico8.lua.parser_test.TestParser.testNameListErr', () => {
  const p = parser('123.45 name1'); const node = p.namelist();
  assert.equal(node, null); assert.equal(cursor(p), 0);
});

test('tests.pico8.lua.parser_test.TestParser.testVarName', () => {
  const p = parser('foo'); const node = p.variable();
  assert.ok(node); assert.equal(cursor(p), 1); assert.equal(node.name.value, 'foo');
});

test('tests.pico8.lua.parser_test.TestParser.testVarIndex', () => {
  const p = parser('bar[7]'); const node = p.variable();
  assert.ok(node); assert.equal(cursor(p), 4);
  assert.equal(node.exp_prefix.name.value, 'bar');
  assert.ok(node.exp_index.value.matches(new TokNumber('7')));
});

test('tests.pico8.lua.parser_test.TestParser.testVarAttribute', () => {
  const p = parser('baz.bat'); const node = p.variable();
  assert.ok(node); assert.equal(cursor(p), 3);
  assert.equal(node.exp_prefix.name.value, 'baz'); assert.equal(node.attr_name.value, 'bat');
});

test('tests.pico8.lua.parser_test.TestParser.testVarList', () => {
  const p = parser('foo, bar[7], baz.bat'); const node = p.varlist();
  assert.ok(node); assert.equal(cursor(p), 12); assert.equal(node.vars.length, 3);
  assert.equal(node.vars[0].name.value, 'foo');
  assert.equal(node.vars[1].exp_prefix.name.value, 'bar');
  assert.ok(node.vars[1].exp_index.value.matches(new TokNumber('7')));
  assert.equal(node.vars[2].exp_prefix.name.value, 'baz');
  assert.equal(node.vars[2].attr_name.value, 'bat');
});

test('tests.pico8.lua.parser_test.TestParser.testFieldExpKey', () => {
  const p = parser('[1] = 2'); const node = p.field();
  assert.ok(node); assert.equal(cursor(p), 7); assert.equal(node.type, 'FieldExpKey');
  assert.ok(node.key_exp.value.matches(new TokNumber('1')));
  assert.ok(node.exp.value.matches(new TokNumber('2')));
});

test('tests.pico8.lua.parser_test.TestParser.testFieldNamedKey', () => {
  const p = parser('foo = 3'); const node = p.field();
  assert.ok(node); assert.equal(cursor(p), 5); assert.equal(node.type, 'FieldNamedKey');
  assert.equal(node.key_name.value, 'foo'); assert.ok(node.exp.value.matches(new TokNumber('3')));
});

test('tests.pico8.lua.parser_test.TestParser.testFieldExp', () => {
  const p = parser('foo'); const node = p.field();
  assert.ok(node); assert.equal(cursor(p), 1); assert.equal(node.type, 'FieldExp');
  assert.equal(node.exp.value.name.value, 'foo');
});
