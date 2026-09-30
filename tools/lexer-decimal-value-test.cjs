#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const p = require('../src');

// Upstream constructs Lexer(version=4); tokenizeLua exposes no version option.
test('tests.pico8.lua.lexer_test.TestLexer.testNumberValueDecimal', () => {
  const tokens = p.tokenizeLua(Buffer.from('123.456\n', 'latin1'));
  assert.equal(tokens[0].value, 123.456);
});

// Upstream constructs Lexer(version=4); tokenizeLua exposes no version option.
test('tests.pico8.lua.lexer_test.TestLexer.testNumberValueDecimalNoRightPart', () => {
  const tokens = p.tokenizeLua(Buffer.from('123.\n', 'latin1'));
  assert.equal(tokens[0].value, 123);
});

test('tests.pico8.lua.lexer_test.TestLexer.testNumberValueDecimalWithE', () => {
  const tokens = p.tokenizeLua(Buffer.from('1.234567890e-6\n', 'latin1'));
  assert.equal(tokens[0].value, 1.23456789e-6);
});
