'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { parseLua, Node } = require('../src/lua-ast-model');
const { Chunk, StatAssignment, VarargDots } = require('../src/lua-ast-model');
const astExports = require('../src/lua-ast-model');

const declarations = fs.readFileSync(require('node:path').join(__dirname, '../src/index.d.ts'), 'utf8');
function topLevelParams(text) {
  if (!text.trim()) return [];
  const out = []; let depth = 0, start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if ('<[('.includes(text[index])) depth += 1;
    else if ('>])'.includes(text[index])) depth -= 1;
    else if (text[index] === ',' && depth === 0) { out.push(text.slice(start, index).trim()); start = index + 1; }
  }
  out.push(text.slice(start).trim()); return out;
}
for (const [name, constructor] of Object.entries(astExports)) {
  if (typeof constructor !== 'function' || !(constructor.prototype instanceof Node)) continue;
  const declaration = new RegExp(`export class ${name} extends Node \\{ constructor\\(([^)]*)\\);`).exec(declarations);
  assert.ok(declaration, `missing named constructor typing: ${name}`);
  const parameters = topLevelParams(declaration[1]);
  assert.match(parameters.at(-1), /^options\?: AstNodeOptions$/);
  assert.equal(parameters.length - 1, constructor.prototype._fields?.length ?? new constructor(...Array(parameters.length - 1).fill(null))._fields.length, `constructor typing arity mismatch: ${name}`);
}

assert.throws(() => new Chunk(), /Initializer for Chunk requires 1 fields, saw 0/);
assert.throws(() => new StatAssignment([], '='), /Initializer for StatAssignment requires 3 fields, saw 2/);
const constructed = new Chunk([], { start: 4, end: 9, note: 'test' });
assert.deepEqual(constructed.stats, []);
assert.equal(constructed.start_pos, 4);
assert.equal(constructed.end_pos, 9);
assert.equal(constructed.note, 'test');
assert.equal(new Chunk([], { note: 'metadata-only' }).note, 'metadata-only');
assert.equal(new VarargDots({ start: 2, end: 3 }).start_pos, 2);
for (const fragment of ['nil', 'name1', '123+', 'x y']) {
  assert.equal(parseLua(fragment).end_pos, 0, fragment);
}
assert.equal(parseLua('break name').end_pos, 1);
for (const malformed of ['x=', 'foo(']) assert.throws(() => parseLua(malformed), malformed);

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
