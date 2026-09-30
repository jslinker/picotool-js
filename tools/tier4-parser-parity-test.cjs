'use strict';

// Focused ports of upstream parser fragments. These intentionally call the
// corresponding AstParser production and retain its node and cursor checks.
const assert = require('node:assert/strict');
const test = require('node:test');
const { AstParser } = require('../src/lua-ast-model');

function parser(source) { return new AstParser(`${source}\n`); }
// Python _pos counts trivia as tokens; AstParser.i counts only significant
// tokens. Map the consumed significant token back to its original stream slot.
function sourceCursor(p) { return p.i ? p.tokens[p.i - 1].tokenPos + 1 : 0; }

// Python Parser._args returns None for an empty token stream.
// Python: tests.pico8.lua.parser_test.TestParser.testArgsNone
test('tests.pico8.lua.parser_test.TestParser.testArgsNone', () => {
  const p = parser('');
  assert.equal(p.arguments(), null);
  assert.equal(sourceCursor(p), 0);
});

// JS arguments() returns the ExpList directly; compare the equivalent nested
// expression list and original token-stream cursor.
// Python: tests.pico8.lua.parser_test.TestParser.testArgsExpList
test('tests.pico8.lua.parser_test.TestParser.testArgsExpList', () => {
  const p = parser('(foo, bar, baz)'); const node = p.arguments();
  assert.equal(node.type, 'ExpList');
  assert.equal(node.exps.length, 3); assert.equal(sourceCursor(p), 9);
});

// Python's _args accepts a bare string token as a StringLiteral node.
// Python: tests.pico8.lua.parser_test.TestParser.testArgsString
test('tests.pico8.lua.parser_test.TestParser.testArgsString', () => {
  const p = parser('"string literal"');
  const node = p.arguments();
  assert.equal(node.type, 'ExpValue');
  assert.equal(node.value, '"string literal"');
  assert.equal(node.decoded, 'string literal');
  assert.equal(p.tokens[0].type, 'string');
  assert.equal(p.tokens[0].value, 'string literal');
  assert.equal(sourceCursor(p), 1);
});

// Python _exp accepts each literal as an ExpValue with a token-valued number
// or string; the JS model keeps decoded numeric/string metadata on the node.
// Python: tests.pico8.lua.parser_test.TestParser.testExpValueNil
test('tests.pico8.lua.parser_test.TestParser.testExpValueNil', () => {
  const p = parser('nil'); const node = p.expression();
  assert.equal(node.type, 'ExpValue'); assert.equal(node.value, null); assert.equal(sourceCursor(p), 1);
});
// Python: tests.pico8.lua.parser_test.TestParser.testExpValueFalse
test('tests.pico8.lua.parser_test.TestParser.testExpValueFalse', () => {
  const p = parser('false'); const node = p.expression();
  assert.equal(node.type, 'ExpValue'); assert.equal(node.value, false); assert.equal(sourceCursor(p), 1);
});
// Python: tests.pico8.lua.parser_test.TestParser.testExpValueTrue
test('tests.pico8.lua.parser_test.TestParser.testExpValueTrue', () => {
  const p = parser('true'); const node = p.expression();
  assert.equal(node.type, 'ExpValue'); assert.equal(node.value, true); assert.equal(sourceCursor(p), 1);
});
// Python: tests.pico8.lua.parser_test.TestParser.testExpValueNumber
test('tests.pico8.lua.parser_test.TestParser.testExpValueNumber', () => {
  const p = parser('123.45'); const node = p.expression();
  assert.equal(node.type, 'ExpValue'); assert.equal(node.value.type, 'number'); assert.equal(node.value.code, '123.45'); assert.equal(node.numberValue, 123.45); assert.equal(sourceCursor(p), 1);
});
// Python: tests.pico8.lua.parser_test.TestParser.testExpValueString
test('tests.pico8.lua.parser_test.TestParser.testExpValueString', () => {
  const p = parser('"string literal"'); const node = p.expression();
  assert.equal(node.type, 'ExpValue'); assert.equal(node.value.type, 'string'); assert.equal(node.value.code, '"string literal"'); assert.equal(node.decoded, 'string literal'); assert.equal(sourceCursor(p), 1);
});
// Python: tests.pico8.lua.parser_test.TestParser.testExpValueDots
test('tests.pico8.lua.parser_test.TestParser.testExpValueDots', () => {
  const p = parser('...'); const node = p.expression();
  assert.equal(node.type, 'VarargDots'); assert.equal(sourceCursor(p), 1);
});

// Python unary-expression tests inspect the operator token, operand node, and
// cursor. JS stores the same operator as a TokSymbol under `unop`.
// Python: tests.pico8.lua.parser_test.TestParser.testExpUnOpHash
test('tests.pico8.lua.parser_test.TestParser.testExpUnOpHash', () => {
  const p = parser('#foo'); const node = p.expression();
  assert.equal(node.type, 'ExpUnOp'); assert.equal(node.unop.type, 'symbol'); assert.equal(node.unop.code, '#');
  assert.equal(node.exp.value.type, 'VarName'); assert.equal(node.exp.value.name.type, 'name'); assert.equal(node.exp.value.name.code, 'foo'); assert.equal(sourceCursor(p), 2);
});
// Python: tests.pico8.lua.parser_test.TestParser.testExpUnOpMinus
test('tests.pico8.lua.parser_test.TestParser.testExpUnOpMinus', () => {
  const p = parser('-45'); const node = p.expression();
  assert.equal(node.type, 'ExpUnOp'); assert.equal(node.unop.type, 'symbol'); assert.equal(node.unop.code, '-');
  assert.equal(node.exp.type, 'ExpValue'); assert.equal(node.exp.value.type, 'number'); assert.equal(node.exp.value.code, '45'); assert.equal(sourceCursor(p), 2);
});
// Python: tests.pico8.lua.parser_test.TestParser.testExpUnOpAtPeek
test('tests.pico8.lua.parser_test.TestParser.testExpUnOpAtPeek', () => {
  const p = parser('@0x5200'); const node = p.expression();
  assert.equal(node.type, 'ExpUnOp'); assert.equal(node.unop.type, 'symbol'); assert.equal(node.unop.code, '@');
  assert.equal(node.exp.type, 'ExpValue'); assert.equal(node.exp.value.type, 'number'); assert.equal(node.exp.value.code, '0x5200'); assert.equal(sourceCursor(p), 2);
});

// Python _exp's simple binary case asserts consumption of the complete input.
// The original AST links exp1/binop/exp2 and checks source token values.
// Python: tests.pico8.lua.parser_test.TestParser.testExpBinOp
test('tests.pico8.lua.parser_test.TestParser.testExpBinOp', () => {
  const p = parser('1 + 2'); const node = p.expression();
  assert.equal(node.type, 'ExpBinOp'); assert.equal(sourceCursor(p), 5);
  assert.equal(node.binop.code, '+'); assert.equal(node.exp1.value.code, '1'); assert.equal(node.exp2.value.code, '2');
});

// Python _prefixexp returns the name expression without parsing a full chunk.
// Python: tests.pico8.lua.parser_test.TestParser.testPrefixExpName
test('tests.pico8.lua.parser_test.TestParser.testPrefixExpName', () => {
  const p = parser('foo'); const node = p.prefix();
  assert.equal(node.type, 'ExpValue'); assert.equal(node.value.type, 'VarName');
  assert.equal(node.value.name.code, 'foo'); assert.equal(sourceCursor(p), 1);
});

// Python _prefixexp tests the fragment root and nested argument list.
// Python: tests.pico8.lua.parser_test.TestParser.testPrefixExpFunctionCall
test('tests.pico8.lua.parser_test.TestParser.testPrefixExpFunctionCall', () => {
  const p = parser('fname(foo, bar, baz)'); const node = p.prefix();
  assert.equal(node.type, 'ExpValue'); assert.equal(node.value.type, 'FunctionCall');
  assert.equal(node.value.exp_prefix.name.code, 'fname');
  assert.equal(node.value.args.explist.exps.length, 3); assert.equal(sourceCursor(p), 10);
});

