#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const p = require('../src');

const tokens = p.tokenizeLua(Buffer.from('local answer=0x10.8\nprint("a\\n")', 'latin1'));
assert(tokens[0] instanceof p.TokKeyword);
assert(tokens[0].matches(p.TokKeyword));
assert(tokens[0].equals(new p.TokKeyword('LOCAL', 99, 99)));
assert.equal(tokens[0].lineno, 0);
assert.equal(tokens[0].charno, 0);

const number = tokens.find((token) => token instanceof p.TokNumber);
assert.equal(number.code, '0x10.8');
assert.equal(number.value, 16.5);

const string = tokens.find((token) => token instanceof p.TokString);
assert.equal(string.code, '"a\\n"');
assert.equal(string.value, 'a\n');
assert.equal(string.length, 5);
string.code = 'changed';
assert.equal(string.value, 'changed');
assert.equal(string.code, '"changed"');

assert(!new p.TokName('x').equals(new p.TokSymbol('x')));
assert(new p.TokSymbol('+').matches(new p.TokSymbol('+')));
assert(!new p.TokSymbol('+').matches('+'));
