#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const p = require('../src');

// Upstream constructs Lexer(version=4); tokenizeLua exposes no version option.
test('tests.pico8.lua.lexer_test.TestLexer.testOneKeyword', () => {
  const tokens = p.tokenizeLua(Buffer.from('and\n', 'latin1'));
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0].equals(new p.TokKeyword(Buffer.from('and', 'latin1'))));
});

test('tests.pico8.lua.lexer_test.TestLexer.testOneLabel', () => {
  const tokens = p.tokenizeLua(Buffer.from('::foobar::\n', 'latin1'));
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0].equals(new p.TokLabel(Buffer.from('::foobar::', 'latin1'))));
});

test('tests.pico8.lua.lexer_test.TestLexer.testOneName', () => {
  const tokens = p.tokenizeLua(Buffer.from('android\n', 'latin1'));
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0].equals(new p.TokName(Buffer.from('android', 'latin1'))));
});

test('tests.pico8.lua.lexer_test.TestLexer.testQuestionMarkPrint', () => {
  const tokens = p.tokenizeLua(Buffer.from('?\n', 'latin1'));
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0].equals(new p.TokName(Buffer.from('?', 'latin1'))));
});

test('tests.pico8.lua.lexer_test.TestLexer.testThreeDots', () => {
  const tokens = p.tokenizeLua(Buffer.from('...\n', 'latin1'));
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0].equals(new p.TokSymbol(Buffer.from('...', 'latin1'))));
});

test('tests.pico8.lua.lexer_test.TestLexer.testTokenLength', () => {
  const tokens = p.tokenizeLua(Buffer.from('break', 'latin1'));
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].length, 5);
});

test('tests.pico8.lua.lexer_test.TestLexer.testTokenRepr', () => {
  const tokens = p.tokenizeLua(Buffer.from('break', 'latin1'));
  assert.equal(tokens.length, 1);
  assert.ok(tokens[0].toPythonRepr().includes('line 0'));
});

test('tests.pico8.lua.lexer_test.TestLexer.testWhitespace', () => {
  const tokens = p.tokenizeLua(Buffer.from('    \n', 'latin1'));
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0].length, 4);
});

test('tests.pico8.lua.lexer_test.TestLexer.testTokenMatches', () => {
  const tokens = p.tokenizeLua(Buffer.from('break', 'latin1'));
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].matches(new p.TokKeyword(Buffer.from('break', 'latin1'))), true);
  assert.equal(tokens[0].matches(p.TokKeyword), true);
  assert.equal(tokens[0].matches(new p.TokKeyword(Buffer.from('and', 'latin1'))), false);
  assert.equal(tokens[0].matches(p.TokSpace), false);
});

test('tests.pico8.lua.lexer_test.TestLexer.testNumberBinary', () => {
  const tokens = p.tokenizeLua(Buffer.from('0b01101101\n', 'latin1'));
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0].equals(new p.TokNumber(Buffer.from('0b01101101', 'latin1'))));
});

test('tests.pico8.lua.lexer_test.TestLexer.testNumberBinaryWithFrac', () => {
  const tokens = p.tokenizeLua(Buffer.from('0b01101101.0011\n', 'latin1'));
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0].equals(new p.TokNumber(Buffer.from('0b01101101.0011', 'latin1'))));
});

test('tests.pico8.lua.lexer_test.TestLexer.testNumberDecimal', () => {
  const tokens = p.tokenizeLua(Buffer.from('1.234567890\n', 'latin1'));
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0].equals(new p.TokNumber(Buffer.from('1.234567890', 'latin1'))));
});

test('tests.pico8.lua.lexer_test.TestLexer.testNumberDecimalNoRightPart', () => {
  const tokens = p.tokenizeLua(Buffer.from('1.\n', 'latin1'));
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0].equals(new p.TokNumber(Buffer.from('1.', 'latin1'))));
});

test('tests.pico8.lua.lexer_test.TestLexer.testNumberDecimalWithExp', () => {
  const tokens = p.tokenizeLua(Buffer.from('1.234567890e-6\n', 'latin1'));
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0].equals(new p.TokNumber(Buffer.from('1.234567890e-6', 'latin1'))));
});

test('tests.pico8.lua.lexer_test.TestLexer.testNumberHex', () => {
  const tokens = p.tokenizeLua(Buffer.from('0x1234567890abcdef\n', 'latin1'));
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0].equals(new p.TokNumber(Buffer.from('0x1234567890abcdef', 'latin1'))));
});

test('tests.pico8.lua.lexer_test.TestLexer.testNumberHexWithFrac', () => {
  const tokens = p.tokenizeLua(Buffer.from('0x1234567890abcdef.1bbf\n', 'latin1'));
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0].equals(new p.TokNumber(Buffer.from('0x1234567890abcdef.1bbf', 'latin1'))));
});

test('tests.pico8.lua.lexer_test.TestLexer.testNumberInteger', () => {
  const tokens = p.tokenizeLua(Buffer.from('1234567890\n', 'latin1'));
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0].equals(new p.TokNumber(Buffer.from('1234567890', 'latin1'))));
});
