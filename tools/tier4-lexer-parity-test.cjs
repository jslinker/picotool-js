#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const p = require('../src');

function tokensForLines(lines) {
  // Python's Lexer.process_lines accepts an iterable; JS tokenizeLua accepts
  // one complete source buffer. Join the original line bytes verbatim.
  return p.tokenizeLua(Buffer.from(lines.join(''), 'latin1'));
}

test('tests.pico8.lua.lexer_test.TestLexer.testProcessLines', () => {
  const tokens = tokensForLines([
    'function foo()\n',
    '  return 999\n',
    'end\n',
  ]);
  assert.equal(tokens.length, 13);
});

test('tests.pico8.lua.lexer_test.TestLexer.testProcessLinesErrorOnOpenString', () => {
  assert.throws(() => tokensForLines(['"one']), p.LexerError);
});

test('tests.pico8.lua.lexer_test.TestLexer.testProcessLinesErrorOnOpenMultilineComment', () => {
  assert.throws(() => tokensForLines(['--[[one\n', 'two\n']), p.LexerError);
});

test('tests.pico8.lua.lexer_test.TestLexer.testProcessLinesErrorOnOpenMultilineString', () => {
  assert.throws(() => tokensForLines(['[[one\n', 'two\n']), p.LexerError);
});

test('tests.pico8.lua.lexer_test.TestLexer.testTokensProperty', () => {
  const tokens = tokensForLines([
    'function foo()\n',
    '  return 999\n',
    'end\n',
  ]);
  // `tokens` is tokenizeLua's public result, corresponding to Python's
  // read-only Lexer.tokens property.
  assert.equal(tokens.length, 13);
});

test('tests.pico8.lua.lexer_test.TestLexer.testMultilineCommentMultipleCalls', () => {
  const tokens = tokensForLines(['--[[comment text\n', 'and "stuff\n', ']]\n']);
  assert.equal(tokens.length, 2);
  assert.ok(tokens[0].equals(new p.TokComment('--[[comment text\nand "stuff\n]]')));
});

test('tests.pico8.lua.lua_test.TestLua.testFromLines', () => {
  const lines = [
    '-- short test\n',
    '-- by dan\n',
    'function foo()\n',
    '  return 999\n',
    'end\n',
  ];
  const lua = p.LuaSource.fromLines(lines, 4);
  const tokens = p.tokenizeLua(lua.toBytes());
  assert.equal(tokens.length, 17);
});
