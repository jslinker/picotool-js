#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const p = require('../src');

// The JS tokenizer has no version option; these inputs are from upstream's
// Lexer(version=4) tests and need no version-specific setup in the JS API.
test('tests.pico8.lua.lexer_test.TestLexer.testNumberValueBinaryInteger', () => {
  const tokens = p.tokenizeLua(Buffer.from('0b01101101\n', 'latin1'));
  assert.equal(tokens[0].value, 109);
});

test('tests.pico8.lua.lexer_test.TestLexer.testNUmberValueBinaryFraction', () => {
  const tokens = p.tokenizeLua(Buffer.from('0b01101101.0011\n', 'latin1'));
  // Python's assertAlmostEqual(expected, actual, 3) rounds the difference to
  // three decimal places and expects zero.
  assert.ok(Math.abs(109.1875 - tokens[0].value) < 0.0005);
});
