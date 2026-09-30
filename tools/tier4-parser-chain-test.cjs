#!/usr/bin/env node
'use strict';

// Exact fragment port of TestParser.testExpBinOpChain from the pinned
// parser_test.py. The upstream get_tokens helper appends LF to every line.
const assert = require('node:assert/strict');
const test = require('node:test');
const { AstParser } = require('../src/lua-ast-model');
const { TokNumber } = require('../src/lua-token');

test('tests.pico8.lua.parser_test.TestParser.testExpBinOpChain', () => {
  const source = '1 + 2 * 3 - 4 / 5..b^7 > 8 != foo';
  const withLinefeeds = source.split('\n').map((line) => `${line}\n`).join('');
  const parser = new AstParser(withLinefeeds);
  const node = parser.expression();
  const cursor = parser.i === 0 ? 0 : parser.tokens[parser.i - 1].tokenPos + 1;

  assert.ok(node); assert.equal(cursor, 29);
  assert.equal(node.exp2.value.name.value, 'foo'); assert.equal(node.binop.value, '!=');
  assert.ok(node.exp1.exp2.value.matches(new TokNumber('8')));
  assert.equal(node.exp1.binop.value, '>');
  assert.ok(node.exp1.exp1.exp2.value.matches(new TokNumber('7')));
  assert.equal(node.exp1.exp1.binop.value, '^');
  assert.equal(node.exp1.exp1.exp1.exp2.value.name.value, 'b');
  assert.equal(node.exp1.exp1.exp1.binop.value, '..');
  assert.ok(node.exp1.exp1.exp1.exp1.exp2.value.matches(new TokNumber('5')));
  assert.equal(node.exp1.exp1.exp1.exp1.binop.value, '/');
  assert.ok(node.exp1.exp1.exp1.exp1.exp1.exp2.value.matches(new TokNumber('4')));
  assert.equal(node.exp1.exp1.exp1.exp1.exp1.binop.value, '-');
  assert.ok(node.exp1.exp1.exp1.exp1.exp1.exp1.exp2.value.matches(new TokNumber('3')));
  assert.equal(node.exp1.exp1.exp1.exp1.exp1.exp1.binop.value, '*');
  assert.ok(node.exp1.exp1.exp1.exp1.exp1.exp1.exp1.exp2.value.matches(new TokNumber('2')));
  assert.equal(node.exp1.exp1.exp1.exp1.exp1.exp1.exp1.binop.value, '+');
  assert.ok(node.exp1.exp1.exp1.exp1.exp1.exp1.exp1.exp1.value.matches(new TokNumber('1')));
});
