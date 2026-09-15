#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { BaseASTWalker } = require('../src/lua-ast-walker');
const { TokName } = require('../src/lua-token');
const { parseLua } = require('../src/lua-ast-model');
const ast = require('../src/lua-ast-model');

assert.equal(typeof BaseASTWalker.prototype._walk_Node, 'function');
for (const [name, constructor] of Object.entries(ast)) {
  if (typeof constructor === 'function' && constructor.prototype instanceof ast.Node) {
    assert.equal(typeof BaseASTWalker.prototype[`_walk_${name}`], 'function', `missing ${name} handler`);
  }
}

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

const nested = parseLua('local x=1\nif x then print(x) end');
class TraceWalker extends BaseASTWalker {
  *_walk(node) {
    if (node instanceof ast.Node) yield `node:${node.type}`;
    yield* super._walk(node);
  }
  *_walk_token(token) { yield `token:${token.code}`; }
  *_walk_value(value) { yield `value:${String(value)}`; }
}
const trace = [...new TraceWalker([...nested.tokens], nested).walk()];
assert.equal(trace[0], 'node:Chunk');
assert.ok(trace.includes('node:StatLocalAssignment'));
assert.ok(trace.includes('node:StatIf'));
assert.ok(trace.includes('node:FunctionCall'));
assert.ok(trace.includes('token:x'));
assert.ok(trace.includes('token:1'));
