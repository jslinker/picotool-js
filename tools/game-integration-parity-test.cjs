#!/usr/bin/env node
'use strict';

// Tier-3 ports of integration cases from the pinned upstream game_test.py.
const test = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { fromFile, linesForTab } = require('../src');

const fixture = (name) => join(__dirname, '../tests/fixtures/tier3-game', name);

test('tests.pico8.game.game_test.TestP8PNGGame.testFromP8PNGFile', async () => {
  // Upstream parses this PNG fixture without asserting on the returned game.
  await fromFile(fixture('test_gol.p8.png'));
});

test('tests.pico8.game.game_test.TestP8Include.testLinesForTabYieldsAll', () => {
  const codeWithTabs = Buffer.from(`
print('zero')
-->8
print('one')
-- some other comment
-->8
print('two')

if (btnp(8)) mode=2
-->8
print('three')
`);
  const lines = codeWithTabs.toString('ascii').split('\n');
  assert.deepEqual(linesForTab(lines, null), lines);
});
