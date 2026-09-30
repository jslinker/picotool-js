#!/usr/bin/env node
'use strict';

// Focused compatibility guards for the additive Python-shaped fragment API.
// Keep these on the production AstParser so changes to shared parsing paths
// and cursor handling remain visible.
const assert = require('node:assert/strict');
const test = require('node:test');
const { AstParser, LuaAstError, parseLua } = require('../src/lua-ast-model');

function parser(source) { return new AstParser(`${source}\n`); }
function cursor(parserInstance) {
  return parserInstance.i === 0 ? 0 : parserInstance.tokens[parserInstance.i - 1].tokenPos + 1;
}

test('legacy strict expression, explist, and funcName still throw on nonmatch', () => {
  assert.throws(() => parser(')').expression(), LuaAstError);
  assert.throws(() => parser(')').explist(), LuaAstError);
  assert.throws(() => parser(')').funcName(), LuaAstError);
});

test('fragment productions return null before matching and throw after malformed commitment', () => {
  assert.equal(parser(')').expressionFragment(), null);
  assert.equal(parser(')').explistFragment(), null);
  assert.equal(parser(')').funcNameFragment(), null);
  assert.equal(parser(')').functionCallFragment(), null);
  assert.equal(parser(')').lastStatFragment(), null);

  assert.throws(() => parser('a, ,').explistFragment(), LuaAstError);
  assert.throws(() => parser('a.').funcNameFragment(), LuaAstError);
  assert.throws(() => parser('f(').functionCallFragment(), LuaAstError);
  assert.throws(() => parser('return 1,').lastStatFragment(), LuaAstError);
});

test('namelist leaves a trailing comma for the caller', () => {
  const p = parser('one, two,');
  const names = p.namelist();
  assert.ok(names);
  assert.deepEqual(names.names.map((token) => token.code), ['one', 'two']);
  assert.equal(p.peek().code, ',');
  assert.equal(p.tokens[p.i].code, ',');
  assert.equal(cursor(p), p.tokens[p.i].tokenPos);
});

test('variable accepts an indexed call result', () => {
  const p = parser('factory()[key].value');
  const value = p.variable();
  assert.ok(value);
  assert.equal(value.type, 'VarAttribute');
  assert.equal(cursor(p), p.allTokens.length - 1);
});

test('max token position is scoped and unlimited parsing resumes after the cap is cleared', () => {
  const p = parser('alpha beta');
  p.maxTokenPos = 1;
  assert.equal(p.take('name')?.code, 'alpha');
  assert.equal(p.take('name'), null);
  assert.equal(cursor(p), 1);
  p.maxTokenPos = null;
  assert.equal(p.take('name')?.code, 'beta');
  assert.equal(cursor(p), p.allTokens.length - 1);
});

test('default table parsing retains field token spans', () => {
  const chunk = parseLua('local t = {a = 1, [2] = 3, 4}\n');
  const table = chunk.stats[0].explist.exps[0].value;
  assert.deepEqual(table.fields.map((field) => field.type), ['FieldNamedKey', 'FieldExpKey', 'FieldExp']);
  assert.deepEqual(table.fields.map((field) => [field.start_pos, field.end_pos]), [
    [7, 12], [13, 21], [22, 24],
  ]);
});


test('call and variable fragments stop before a following binary operator', () => {
  for (const [source, method, expected] of [['f() + 1', 'functionCallFragment', 'FunctionCall'], ['foo + 1', 'variable', 'VarName']]) {
    const p = parser(source);
    assert.equal(p[method]().type, expected);
    assert.equal(p.peek().code, '+');
  }
});

test('return may omit expressions and assertion helper preserves falsy values', () => {
  const p = parser('return ,');
  assert.equal(p.lastStatFragment().explist, null);
  assert.equal(p.peek().code, ',');
  for (const value of [false, 0, '']) assert.equal(p.assertNode(value, 'present'), value);
});
