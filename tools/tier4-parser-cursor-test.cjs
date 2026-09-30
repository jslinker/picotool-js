#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { AstParser, LuaAstError } = require('../src/lua-ast-model');

// Match upstream get_parser: each input line receives an LF, including the
// final split component. AstParser omits trivia from `i`, so map that cursor
// to the original complete token stream via tokenPos.
const input = 'break name 7.42 -- Comment text\n"string literal" ==';
function makeParser() { return new AstParser(input.split('\n').map(line => `${line}\n`).join('')); }
function cursor(parser) { return parser.i ? parser.tokens[parser.i - 1].tokenPos + 1 : 0; }

test('tests.pico8.lua.parser_test.TestParser.testCursorPeek', () => {
  const parser = makeParser();
  assert.equal(cursor(parser), 0);
  const token = parser.peek();
  assert.equal(token.type, 'keyword');
  assert.equal(token.code, 'break');
  assert.equal(cursor(parser), 0);
});

test('tests.pico8.lua.parser_test.TestParser.testCursorAccept', () => {
  const parser = makeParser();
  assert.equal(cursor(parser), 0);
  assert.equal(parser.take('name'), null);
  assert.equal(cursor(parser), 0);
  assert.equal(parser.take('keyword', 'and'), null);
  assert.equal(cursor(parser), 0);
  let token = parser.take('keyword', 'break');
  assert.ok(token); assert.equal(token.type, 'keyword'); assert.equal(token.code, 'break');
  assert.equal(cursor(parser), 1);
  token = parser.take('name'); assert.ok(token); assert.equal(token.type, 'name'); assert.equal(token.code, 'name');
  token = parser.take('number'); assert.ok(token); assert.equal(token.type, 'number'); assert.equal(token.code, '7.42');
  token = parser.take('string'); assert.ok(token); assert.equal(token.type, 'string'); assert.equal(token.code, '"string literal"'); assert.equal(token.value, 'string literal');
  token = parser.take('symbol', '=='); assert.ok(token); assert.equal(token.type, 'symbol'); assert.equal(token.code, '==');
  assert.equal(cursor(parser), 11);
});

test('tests.pico8.lua.parser_test.TestParser.testCursorExpect', () => {
  const parser = makeParser();
  assert.equal(cursor(parser), 0);
  assert.throws(() => parser.expect('keyword', 'and'), LuaAstError);
  assert.equal(cursor(parser), 0);
  const tokenBreak = parser.expect('keyword', 'break');
  assert.equal(tokenBreak.type, 'keyword'); assert.equal(tokenBreak.code, 'break'); assert.equal(cursor(parser), 1);
  const tokenName = parser.expect('name');
  assert.equal(tokenName.type, 'name'); assert.equal(tokenName.code, 'name'); assert.equal(cursor(parser), 3);
});

