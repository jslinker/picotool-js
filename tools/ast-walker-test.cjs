#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { BaseASTWalker } = require('../src/lua-ast-walker');
const { TokName } = require('../src/lua-token');

const root = { type: 'Chunk', _fields: ['stats'], stats: [
  { type: 'VarName', _fields: ['name'], name: new TokName('x') },
  { type: 'ExpValue', _fields: ['value'], value: true },
] };
class RecordingWalker extends BaseASTWalker {
  *_walk_Chunk(node) { yield 'chunk'; yield* this._walk_node(node); }
  *_walk_token(token) { yield token.code; }
  *_walk_value(value) { yield value; }
}

const walker = new RecordingWalker([], root, { mode: 'test' });
assert.deepEqual([...walker.walk()], ['chunk', 'x', true]);
assert.equal(walker._args.mode, 'test');
