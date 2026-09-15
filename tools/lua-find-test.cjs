#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { findLua } = require('../src/lua-find');

const cart = 'pico-8 cartridge // http://www.pico-8.com\nversion 33\n__lua__\nprint("one")\nprint("two")\n';
assert.equal(findLua(cart, 'print', { filename: 'game.p8' }),
  'game.p8:1:print("one")\ngame.p8:2:print("two")\n');
assert.equal(findLua(cart, 'two', { filename: 'game.p8' }), 'game.p8:2:print("two")\n');
assert.equal(findLua(cart, 'print', { filename: 'game.p8', listFiles: true }), 'game.p8\n');
assert.equal(findLua(cart, 'missing', { filename: 'game.p8' }), '');
assert.throws(() => findLua(cart, '['), SyntaxError);
