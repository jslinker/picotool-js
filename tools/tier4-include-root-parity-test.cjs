#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const p = require('../src');

test('tests.pico8.game.game_test.TestP8Include.testGetRootIncludePathMacOSCartRoot', () => {
  const cartpath = path.resolve(os.homedir(), 'Library/Application Support/pico-8/carts/subdir/somecart.p8');
  const expected = path.resolve(os.homedir(), 'Library/Application Support/pico-8/carts');
  assert.equal(p.getRootIncludePath(cartpath), expected);
});

test('tests.pico8.game.game_test.TestP8Include.testGetRootIncludePathLinuxCartRoot', () => {
  const cartpath = path.resolve(os.homedir(), '.lexaloffle/pico-8/carts/subdir/somecart.p8');
  const expected = path.resolve(os.homedir(), '.lexaloffle/pico-8/carts');
  assert.equal(p.getRootIncludePath(cartpath), expected);
});

test('tests.pico8.game.game_test.TestP8Include.testGetRootIncludePathUnrecognizedRoot', () => {
  assert.equal(p.getRootIncludePath('/tmp/subdir/somecart.p8'), '/tmp/subdir');
});

test('getRootIncludePath returns null for no filename', () => {
  assert.equal(p.getRootIncludePath(null), null);
});
