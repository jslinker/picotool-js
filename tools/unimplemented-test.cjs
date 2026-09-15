#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const api = require('../src');

assert.throws(() => api.minifyLua('print(1)\n', { keepPropertyNames: true }),
  (error) => error.name === 'NotImplementedError');
assert.throws(() => api.buildP8({ optimizeTokens: true,
  sources: { lua: { format: 'lua', data: 'print(1)\n' } } }),
  (error) => error.name === 'NotImplementedError' &&
    error.message === '--optimize_tokens not yet implemented, sorry');
assert.doesNotThrow(() => api.buildP8({ sources: { lua: { format: 'lua', data: 'print(1)\n' } } }));
