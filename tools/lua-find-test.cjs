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
assert.equal(findLua(cart, '^print\\("(?:one|two)"\\)\\n?$', { filename: 'game.p8' }),
  'game.p8:1:print("one")\ngame.p8:2:print("two")\n');
assert.equal(findLua(cart, /PRINT\("TWO"\)/gi, { filename: 'game.p8' }),
  'game.p8:2:print("two")\n');
assert.equal(findLua(cart, /print/g, { filename: 'game.p8' }),
  'game.p8:1:print("one")\ngame.p8:2:print("two")\n');
const p8sciiCart = 'pico-8 cartridge // http://www.pico-8.com\nversion 33\n__lua__\nprint("█")\n';
assert.equal(findLua(p8sciiCart, 'print', { filename: 'glyph.p8' }),
  'glyph.p8:1:print("_")\n');
assert.throws(() => findLua(cart, '['), SyntaxError);
