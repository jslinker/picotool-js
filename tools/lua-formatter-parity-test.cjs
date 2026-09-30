'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const cases = require('../tests/fixtures/tier2-formatters/cases.json');
const { formatLuaAst, formatLuaTokens } = require('../src');

const formatters = { ast: formatLuaAst, token: formatLuaTokens };
const byId = new Map(cases.map((fixture) => [fixture.id, fixture]));
function run(id) {
  const fixture = byId.get(id);
  assert.ok(fixture, `missing formatter fixture: ${id}`);
  const actual = formatters[fixture.writer](Buffer.from(fixture.source, 'latin1'), {
    indentwidth: fixture.indentwidth,
  });
  assert.deepEqual(Buffer.from(actual), Buffer.from(fixture.expected, 'latin1'));
}

test('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testNormalizesSpaceCharacters', () => run('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testNormalizesSpaceCharacters'));
test('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testTrailingWhitespace', () => run('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testTrailingWhitespace'));
test('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testCommentAtEndOfLine', () => run('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testCommentAtEndOfLine'));
test('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testCommentOnOwnLine', () => run('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testCommentOnOwnLine'));
test('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testIndentZero', () => run('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testIndentZero'));
test('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testIndentBlock', () => run('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testIndentBlock'));
test('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testIndentMulti', () => run('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testIndentMulti'));
test('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testIndentCommentsAndStatements', () => run('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testIndentCommentsAndStatements'));
test('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testIndentTableConstructor', () => run('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testIndentTableConstructor'));
test('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testTooManyNewlines', () => run('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testTooManyNewlines'));
test('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testAcceptsIndentWidthArg', () => run('tests.pico8.lua.lua_test.TestLuaFormatterWriter.testAcceptsIndentWidthArg'));
test('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testNormalizesSpaceCharacters', () => run('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testNormalizesSpaceCharacters'));
test('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testTrailingWhitespace', () => run('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testTrailingWhitespace'));
test('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testCommentAtEndOfLine', () => run('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testCommentAtEndOfLine'));
test('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testCommentOnOwnLine', () => run('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testCommentOnOwnLine'));
test('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testIndentZero', () => run('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testIndentZero'));
test('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testIndentBlock', () => run('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testIndentBlock'));
test('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testIndentMulti', () => run('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testIndentMulti'));
test('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testIndentCommentsAndStatements', () => run('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testIndentCommentsAndStatements'));
test('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testIndentTableConstructor', () => run('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testIndentTableConstructor'));
test('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testTooManyNewlines', () => run('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testTooManyNewlines'));
test('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testAcceptsIndentWidthArg', () => run('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testAcceptsIndentWidthArg'));
test('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testEliminateSpaceAroundSomePunctuation', () => run('tests.pico8.lua.lua_test.TestLuaFormatterTokenWriter.testEliminateSpaceAroundSomePunctuation'));
