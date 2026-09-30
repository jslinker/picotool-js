'use strict';

// Direct ports of prefix-expression fragment methods from the pinned parser.
// Each source line includes the newline added by upstream get_tokens().
const assert = require('node:assert/strict');
const test = require('node:test');
const { AstParser } = require('../src/lua-ast-model');

function parser(source) { return new AstParser(`${source}\n`); }
// AstParser.i counts significant tokens. Upstream _pos counts through trivia.
function sourceCursor(p) { return p.i ? p.tokens[p.i - 1].tokenPos + 1 : 0; }

test('tests.pico8.lua.parser_test.TestParser.testPrefixExpParenExp', () => {
  const p = parser('(2 + 3)'); const node = p.prefix();
  assert.equal(node.type, 'ExpValue'); assert.equal(node.value.type, 'ExpBinOp');
  assert.equal(sourceCursor(p), 7);
  assert.equal(node.value.exp1.value.type, 'number'); assert.equal(node.value.exp1.value.code, '2');
  assert.equal(node.value.binop.type, 'symbol'); assert.equal(node.value.binop.code, '+');
  assert.equal(node.value.exp2.value.type, 'number'); assert.equal(node.value.exp2.value.code, '3');
});

test('tests.pico8.lua.parser_test.TestParser.testPrefixExpIndex', () => {
  const p = parser('foo[4 + 5]'); const node = p.prefix();
  assert.equal(node.value.type, 'VarIndex'); assert.equal(sourceCursor(p), 8);
  assert.equal(node.value.exp_prefix.name.type, 'name'); assert.equal(node.value.exp_prefix.name.code, 'foo');
  assert.equal(node.value.exp_index.exp1.value.type, 'number'); assert.equal(node.value.exp_index.exp1.value.code, '4');
  assert.equal(node.value.exp_index.binop.type, 'symbol'); assert.equal(node.value.exp_index.binop.code, '+');
  assert.equal(node.value.exp_index.exp2.value.type, 'number'); assert.equal(node.value.exp_index.exp2.value.code, '5');
});

test('tests.pico8.lua.parser_test.TestParser.testPrefixExpAttribute', () => {
  const p = parser('foo.bar'); const node = p.prefix();
  assert.equal(node.value.type, 'VarAttribute'); assert.equal(sourceCursor(p), 3);
  assert.equal(node.value.exp_prefix.name.type, 'name'); assert.equal(node.value.exp_prefix.name.code, 'foo');
  assert.equal(node.value.attr_name.type, 'name'); assert.equal(node.value.attr_name.code, 'bar');
});

test('tests.pico8.lua.parser_test.TestParser.testPrefixExpFunctionCallNoArgs', () => {
  const p = parser('fname()'); const node = p.prefix();
  assert.equal(node.value.type, 'FunctionCall'); assert.equal(sourceCursor(p), 3);
  assert.equal(node.value.exp_prefix.name.type, 'name'); assert.equal(node.value.exp_prefix.name.code, 'fname');
  assert.equal(node.value.args.explist, null);
});

test('tests.pico8.lua.parser_test.TestParser.testPrefixExpFunctionCallValueArgs', () => {
  const p = parser('fname(1, 2, 3)'); const node = p.prefix();
  assert.equal(node.value.type, 'FunctionCall'); assert.equal(sourceCursor(p), 10);
  const args = node.value.args.explist.exps;
  assert.equal(args.length, 3);
  assert.deepEqual(args.map((arg) => [arg.value.type, arg.value.code]), [['number', '1'], ['number', '2'], ['number', '3']]);
});

test('tests.pico8.lua.parser_test.TestParser.testPrefixExpFunctionCallMethod', () => {
  const p = parser('obj:method(foo, bar, baz)'); const node = p.prefix();
  assert.equal(node.value.type, 'FunctionCallMethod'); assert.equal(sourceCursor(p), 12);
  assert.equal(node.value.exp_prefix.name.type, 'name'); assert.equal(node.value.exp_prefix.name.code, 'obj');
  assert.equal(node.value.methodname.type, 'name'); assert.equal(node.value.methodname.code, 'method');
  assert.equal(node.value.args.explist.exps.length, 3);
});

test('tests.pico8.lua.parser_test.TestParser.testExpValuePrefixExp', () => {
  const p = parser('foo.bar'); const node = p.expression();
  assert.equal(node.type, 'ExpValue'); assert.equal(sourceCursor(p), 3);
  assert.equal(node.value.type, 'VarAttribute');
  assert.equal(node.value.exp_prefix.name.type, 'name'); assert.equal(node.value.exp_prefix.name.code, 'foo');
  assert.equal(node.value.attr_name.type, 'name'); assert.equal(node.value.attr_name.code, 'bar');
});

test('tests.pico8.lua.parser_test.TestParser.testPrefixExpChain', () => {
  const p = parser('(1+2)[foo].bar.baz'); const wrapped = p.prefix();
  const node = wrapped.value;
  assert.equal(node.type, 'VarAttribute'); assert.equal(sourceCursor(p), 12);
  assert.equal(node.attr_name.type, 'name'); assert.equal(node.attr_name.code, 'baz');
  assert.equal(node.exp_prefix.type, 'VarAttribute');
  assert.equal(node.exp_prefix.attr_name.type, 'name'); assert.equal(node.exp_prefix.attr_name.code, 'bar');
  assert.equal(node.exp_prefix.exp_prefix.type, 'VarIndex');
  assert.equal(node.exp_prefix.exp_prefix.exp_index.value.name.type, 'name');
  assert.equal(node.exp_prefix.exp_prefix.exp_index.value.name.code, 'foo');
  const inner = node.exp_prefix.exp_prefix.exp_prefix;
  assert.equal(inner.type, 'ExpBinOp');
  assert.equal(inner.exp1.value.type, 'number'); assert.equal(inner.exp1.value.code, '1');
  assert.equal(inner.binop.type, 'symbol'); assert.equal(inner.binop.code, '+');
  assert.equal(inner.exp2.value.type, 'number'); assert.equal(inner.exp2.value.code, '2');
});

test('tests.pico8.lua.parser_test.TestParser.testExpList', () => {
  const p = parser('1, 2, 3 - 4, a..b^7, foo'); const exps = p.explist();
  assert.equal(sourceCursor(p), 21); assert.equal(exps.length, 5);
  assert.equal(exps[0].value.type, 'number'); assert.equal(exps[0].value.code, '1');
  assert.equal(exps[1].value.type, 'number'); assert.equal(exps[1].value.code, '2');
  assert.equal(exps[2].exp1.value.type, 'number'); assert.equal(exps[2].exp1.value.code, '3');
  assert.equal(exps[2].binop.type, 'symbol'); assert.equal(exps[2].binop.code, '-');
  assert.equal(exps[2].exp2.value.type, 'number'); assert.equal(exps[2].exp2.value.code, '4');
  assert.equal(exps[3].exp1.exp1.value.name.type, 'name'); assert.equal(exps[3].exp1.exp1.value.name.code, 'a');
  assert.equal(exps[3].exp1.binop.type, 'symbol'); assert.equal(exps[3].exp1.binop.code, '..');
  assert.equal(exps[3].exp1.exp2.value.name.type, 'name'); assert.equal(exps[3].exp1.exp2.value.name.code, 'b');
  assert.equal(exps[3].binop.type, 'symbol'); assert.equal(exps[3].binop.code, '^');
  assert.equal(exps[3].exp2.value.code, '7');
  assert.equal(exps[4].value.name.type, 'name'); assert.equal(exps[4].value.name.code, 'foo');
});

