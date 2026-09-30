#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const p = require('../src');

// Upstream constructs Lexer(version=4); tokenizeLua exposes no version option.
test('tests.pico8.lua.lexer_test.TestLexer.testNumberValueHexInteger', () => {
  const tokens = p.tokenizeLua(Buffer.from('0xae\n', 'latin1'));
  assert.equal(tokens[0].value, 174);
});

// Python's assertAlmostEqual(expected, actual, 3) rounds the difference to
// three decimal places and expects zero.
test('tests.pico8.lua.lexer_test.TestLexer.testNumberValueHexFraction', () => {
  const tokens = p.tokenizeLua(Buffer.from('0xae.bc\n', 'latin1'));
  assert.ok(Math.abs(174.734 - tokens[0].value) < 0.0005);
});
