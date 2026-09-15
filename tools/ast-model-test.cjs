'use strict';

const assert = require('node:assert/strict');
const { parseLua, Node } = require('../src/lua-ast-model');

const tree = parseLua('local x = 1\nif x > 0 then\n  print("yes")\nend\n');
assert.equal(tree.type, 'Chunk');
assert.equal(tree.body[0].type, 'StatLocalAssignment');
assert.equal(tree.body[0].names[0].code, 'x');
assert.equal(tree.body[0].values[0].value, 1);
assert.equal(tree.body[1].type, 'StatIf');
assert.equal(tree.body[1].clauses[0].condition.type, 'ExpBinOp');
assert.equal(tree.body[1].clauses[0].body.body[0].expression.args[0].value, 'yes');
assert.ok(tree.range.start && tree.range.end);

const types = [];
tree.walk(n => types.push(n.type));
assert.ok(types.includes('ExpBinOp'));
assert.ok(types.includes('ExpValue'));
assert.ok(tree instanceof Node);
assert.equal(tree.toJSON().type, 'Chunk');

const fn = parseLua('function add(a,b) return a+b end\n');
assert.equal(fn.body[0].name, 'add');
assert.deepEqual(fn.body[0].body.params, ['a', 'b']);
assert.equal(fn.body[0].body.body.body[0].values[0].operator, '+');

console.log('ast model tests passed');
