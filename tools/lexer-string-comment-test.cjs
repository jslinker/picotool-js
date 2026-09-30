'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const p = require('../src');

function tokensFor(source) {
  return p.tokenizeLua(Buffer.from(source, 'latin1'));
}

function assertTokenEquals(actual, expected) {
  assert.equal(actual.equals(expected), true);
}

// The JS tokenizer accepts a complete source buffer, rather than Python's
// versioned, line-at-a-time Lexer. Multi-call upstream inputs are concatenated
// here with the same newline bytes; this checks batch tokenization only.
test('tests.pico8.lua.lexer_test.TestLexer.testComment', () => {
  const tokens = tokensFor('-- comment text and stuff\n');
  assert.equal(tokens.length, 2);
  assertTokenEquals(tokens[0], new p.TokComment('-- comment text and stuff'));
});

test('tests.pico8.lua.lexer_test.TestLexer.testCommentUnofficialDoubleSlash', () => {
  const tokens = tokensFor('// comment text and stuff\n');
  assert.equal(tokens.length, 2);
  assertTokenEquals(tokens[0], new p.TokComment('// comment text and stuff'));
});

test('tests.pico8.lua.lexer_test.TestLexer.testMultilineComment', () => {
  const tokens = tokensFor('--[[comment text\nand "stuff\n]]\n');
  assert.equal(tokens.length, 2);
  assertTokenEquals(tokens[0], new p.TokComment('--[[comment text\nand "stuff\n]]'));
});

test('tests.pico8.lua.lexer_test.TestLexer.testMultilineCommentNoLinebreaks', () => {
  const tokens = tokensFor('--[[comment text and "stuff]]\n');
  assert.equal(tokens.length, 2);
  assertTokenEquals(tokens[0], new p.TokComment('--[[comment text and "stuff]]'));
});

test('tests.pico8.lua.lexer_test.TestLexer.testStringDoubleQuotes', () => {
  const tokens = tokensFor('"abc def ghi and jkl"\n');
  assert.equal(tokens.length, 2);
  assertTokenEquals(tokens[0], new p.TokString('abc def ghi and jkl'));
});

test('tests.pico8.lua.lexer_test.TestLexer.testStringEscapes', () => {
  const tokens = tokensFor('"\\\n\\a\\b\\f\\n\\r\\t\\v\\\\\\"\\\'\\65"\n');
  assert.equal(tokens.length, 2);
  assertTokenEquals(tokens[0], new p.TokString(
    String.fromCharCode(10, 7, 8, 12, 10, 13, 9, 11, 92, 34, 39, 65),
  ));
});

test('tests.pico8.lua.lexer_test.TestLexer.testStringSingleQuotes', () => {
  const tokens = tokensFor("'abc def ghi and jkl'\n");
  assert.equal(tokens.length, 2);
  assertTokenEquals(tokens[0], new p.TokString('abc def ghi and jkl'));
});

test('tests.pico8.lua.lexer_test.TestLexer.testMultilineString', () => {
  // Upstream calls _process_line three times; their bytes are joined verbatim.
  const tokens = tokensFor('[[one\n"two"\n[[three]]\n');
  assert.equal(tokens.length, 2);
  assertTokenEquals(tokens[0], new p.TokString('one\n"two"\n[[three'));
});

test('tests.pico8.lua.lexer_test.TestLexer.testMultilineStringMatchedEquals', () => {
  // Upstream calls _process_line three times; their bytes are joined verbatim.
  const tokens = tokensFor('[===[one\n[[two]]\n[==[three]==]]===]\n');
  assert.equal(tokens.length, 2);
  assertTokenEquals(tokens[0], new p.TokString('one\n[[two]]\n[==[three]==]'));
});

test('tests.pico8.lua.lexer_test.TestLexer.testStringMultipleLines', () => {
  // Upstream calls _process_line twice; their bytes are joined verbatim.
  const tokens = tokensFor('"abc def ghi \nand jkl"\n');
  assert.equal(tokens.length, 2);
  assertTokenEquals(tokens[0], new p.TokString('abc def ghi \nand jkl'));
});

test('tests.pico8.lua.lexer_test.TestLexer.testStringMultipleLinesPlusAToken', () => {
  const tokens = tokensFor('"abc def ghi \nand jkl" and\n');
  assert.equal(tokens.length, 4);
  assertTokenEquals(tokens[0], new p.TokString('abc def ghi \nand jkl'));
  assertTokenEquals(tokens[2], new p.TokKeyword('and'));
});

test('tests.pico8.lua.lexer_test.TestLexer.testTokenAndComment', () => {
  const tokens = tokensFor('and-- comment text and stuff\n');
  assert.equal(tokens.length, 3);
  assertTokenEquals(tokens[0], new p.TokKeyword('and'));
  assertTokenEquals(tokens[1], new p.TokComment('-- comment text and stuff'));
});
