#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { BaseASTWalker } = require('../src/lua-ast-walker');
const { TokName } = require('../src/lua-token');
const { parseLua } = require('../src/lua-ast-model');

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

const parsed = parseLua('x=1');
assert.deepEqual([...new RecordingWalker([...parsed.tokens], parsed).walk()], ['chunk', 'x', '=', '1']);
class RenameWalker extends BaseASTWalker {
  *_walk_VarName(node) { node.name.code = 'y'; yield* this._walk_node(node); }
}
assert.deepEqual([...new RenameWalker([...parsed.tokens], parsed).walk()], []);
assert.equal([...parsed.tokens].map(token => token.code).join(''), 'y=1');
