'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { formatForFilename } = require('../src');

// Python compares the selected formatter class. JS exposes the selected
// format name, so this checks routing for the same filename without testing
// ROM parsing or serialization.
test('tests.pico8.game.game_test.TestFile.testSelectsROMFormatter', () => {
  assert.equal(formatForFilename('foo.rom'), 'rom');
});
