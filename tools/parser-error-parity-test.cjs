'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ParserError } = require('../src/lua-parser');
const { Token } = require('../src/lua-token');

// Python: tests/pico8/lua/parser_test.py:91
// The upstream method only constructs ParserError and calls str() for coverage;
// this checks observable stringification with the original token line and
// column values. JS Error.toString prefixes the error name, unlike Python's
// ParserError.__str__.
test('tests.pico8.lua.parser_test.TestParser.testParserErrorMsg', () => {
  const error = new ParserError('msg', new Token('x', 1, 2));
  assert.equal(String(error), 'ParserError: msg at line 2 char 2');
});
