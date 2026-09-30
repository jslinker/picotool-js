#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { AstParser, LuaAstError } = require('../src/lua-ast-model');

// Match upstream get_parser: append LF to every split line, including the last.
function parser(source) { return new AstParser(source.split('\n').map(line => `${line}\n`).join('')); }
function sourceCursor(p) { return p.i ? p.tokens[p.i - 1].tokenPos + 1 : 0; }

// Python: tests.pico8.lua.parser_test.TestParser.testCursorAcceptStopsAtMaxPos
test('tests.pico8.lua.parser_test.TestParser.testCursorAcceptStopsAtMaxPos', () => {
  const p = parser('break name 7.42 -- Comment text\n"string literal" ==');
  p.maxTokenPos = 4;
  assert.equal(sourceCursor(p), 0);
  assert.equal(p.take('name'), null);
  assert.equal(p.take('keyword', 'and'), null);
  assert.ok(p.take('keyword', 'break'));
  assert.equal(sourceCursor(p), 1);
  assert.ok(p.take('name'));
  assert.equal(p.take('number'), null);
  assert.equal(p.take('string'), null);
  assert.equal(p.take('symbol', '=='), null);
  assert.equal(sourceCursor(p), 3);
});

// Python: tests.pico8.lua.parser_test.TestParser.testAssert
test('tests.pico8.lua.parser_test.TestParser.testAssert', () => {
  const p = parser('break name 7.42 -- Comment text\n"string literal" ==');
  assert.equal(p.assertNode('DUMMY', 'test assert'), 'DUMMY');
  assert.throws(() => p.assertNode(null, 'test assert'), error => {
    assert.ok(error instanceof LuaAstError);
    assert.equal(error.msg, 'test assert');
    assert.equal(error.token.code, 'break');
    return true;
  });
});

// Python: tests.pico8.lua.parser_test.TestParser.testExpValueErr
test('tests.pico8.lua.parser_test.TestParser.testExpValueErr', () => {
  const p = parser('break');
  assert.equal(p.expressionFragment(), null);
  assert.equal(sourceCursor(p), 0);
});

// Python: tests.pico8.lua.parser_test.TestParser.testExpListErr
test('tests.pico8.lua.parser_test.TestParser.testExpListErr', () => {
  const p = parser('break');
  assert.equal(p.explistFragment(), null);
  assert.equal(sourceCursor(p), 0);
});

// Python: tests.pico8.lua.parser_test.TestParser.testExpListIncompleteErr
test('tests.pico8.lua.parser_test.TestParser.testExpListIncompleteErr', () => {
  const p = parser('1, 2,');
  assert.throws(() => p.explistFragment(), LuaAstError);
});

// Python: tests.pico8.lua.parser_test.TestParser.testFuncnameErr
test('tests.pico8.lua.parser_test.TestParser.testFuncnameErr', () => {
  const p = parser('123');
  assert.equal(p.funcNameFragment(), null);
  assert.equal(sourceCursor(p), 0);
});

// Python: tests.pico8.lua.parser_test.TestParser.testFunctionCallErr
test('tests.pico8.lua.parser_test.TestParser.testFunctionCallErr', () => {
  const p = parser('foo + 7');
  assert.equal(p.functionCallFragment(), null);
  assert.equal(sourceCursor(p), 0);
});

// Python: tests.pico8.lua.parser_test.TestParser.testLastStatErr
test('tests.pico8.lua.parser_test.TestParser.testLastStatErr', () => {
  const p = parser('name');
  assert.equal(p.lastStatFragment(), null);
  assert.equal(sourceCursor(p), 0);
});
