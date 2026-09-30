#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const p = require('../src');

const HIGH_CHARS_UNICODE = 'xx \x00 \x07 🐱 ◝ ⬇️░✽●♥☉웃⌂⬅️😐♪🅾️◆…➡️★⧗⬆️ˇ∧❎▤▥';
const HIGH_CHARS_P8SCII = Uint8Array.from([
  0x78, 0x78, 0x20, 0x00, 0x20, 0x07, 0x20, 0x82, 0x20, 0xff,
  0x20, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b,
  0x8c, 0x8d, 0x8e, 0x8f, 0x90, 0x91, 0x92, 0x93, 0x94, 0x95,
  0x96, 0x97, 0x98, 0x99,
]);

test('tests.pico8.lua.lua_test.TestUnicodeConversion.testP8SCIIToUnicode', () => {
  assert.equal(p.decodeP8scii(HIGH_CHARS_P8SCII), HIGH_CHARS_UNICODE);
});

test('tests.pico8.lua.lua_test.TestUnicodeConversion.testUnicodeToP8SCII', () => {
  assert.deepEqual(p.encodeP8scii(HIGH_CHARS_UNICODE), HIGH_CHARS_P8SCII);
});
