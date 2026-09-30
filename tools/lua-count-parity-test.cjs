'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { analyzeLua, parseP8 } = require('../src');
const cases = require('../tests/fixtures/tier2-lua/counts.json');
const HEADER = 'pico-8 cartridge // http://www.pico-8.com\nversion 4\n__lua__\n';
const FOOTER = '__gfx__\n' + ('0'.repeat(128) + '\n').repeat(128)
  + '__gff__\n' + ('0'.repeat(256) + '\n').repeat(2)
  + '__map__\n' + ('0'.repeat(256) + '\n').repeat(32)
  + '__sfx__\n' + '0001' + '0'.repeat(164) + '\n'
  + ('001' + '0'.repeat(165) + '\n').repeat(63)
  + '__music__\n' + '00 41424344\n'.repeat(64) + '\n\n';
function luaForCountFixture(code) {
  const parsed = parseP8(Buffer.from(HEADER + code + FOOTER, 'ascii'));
  const luaBytes = Buffer.from((parsed.sections.lua || []).join(''), 'ascii');
  return analyzeLua(luaBytes);
}

test('tests.pico8.lua.count_test.TestCounts.testCharCounts', () => {
  for (const scenario of cases) {
    assert.equal(luaForCountFixture(scenario.code).characterCount, scenario.chars, `Mismatched char count: ${JSON.stringify(scenario.code)}`);
  }
});

test('tests.pico8.lua.count_test.TestCounts.testTokenCounts', () => {
  for (const scenario of cases) {
    assert.equal(luaForCountFixture(scenario.code).tokenCount, scenario.tokens, `Mismatched token count: ${JSON.stringify(scenario.code)}`);
  }
});
