#!/usr/bin/env node
'use strict';

// Deterministic generated parser differential cases. Re-run a failing case with
// SEED=<decimal> and CASES=<count>; the seed is printed on every run.
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const { python, pythonOptions } = require('./test-env.cjs');
const { parseLua } = require('../src/lua-ast-model');
const { validateLua } = require('../src/lua-parser');

const seed = Number(process.env.SEED || 0x51c0ffee) >>> 0;
const count = Number(process.env.CASES || 64);
function rng(initial) { let state = initial >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; }; }
const random = rng(seed);
const pick = (items) => items[Math.floor(random() * items.length)];
const names = ['a', 'b', 'x', 'y', 'score', 'n'];
const atoms = ['0', '1', '2', 'true', 'false', 'nil', 'x', '"hi"'];
function expression(depth = 0) {
  if (depth > 2 || random() < 0.55) return pick(atoms);
  return `${expression(depth + 1)} ${pick(['+', '-', '*', '==', 'and', 'or'])} ${expression(depth + 1)}`;
}
function statement() {
  const name = pick(names);
  switch (Math.floor(random() * 6)) {
    case 0: return `${name} = ${expression()}`;
    case 1: return `local ${name} = ${expression()}`;
    case 2: return `print(${expression()})`;
    case 3: return `if x then ${name} = ${expression()} end`;
    case 4: return `while x do ${name} = ${name} - 1 end`;
    default: return `return ${expression()}`;
  }
}
function generatedSource() { const lines = []; for (let i = 0, n = 1 + Math.floor(random() * 4); i < n; i++) lines.push(statement()); return `${lines.join('\n')}\n`; }
const malformed = ['print(', 'if true then', 'local =', 'x = {', 'function f() return 1', 'for i=1,3 do print(i)'];
assert.ok(Number.isInteger(count) && count > 0 && count <= 10000, 'CASES must be 1..10000');
const regressions = [
  'while x do n = n - 1 end\nwhile x do y = y - 1 end\nlocal x = nil\n',
  'return 1; x=2\n', 'break; x=2\n', 'do return 1; end\n',
  'if x then n = false end\nscore = true and nil\n',
];
const cases = regressions.concat(Array.from({ length: count }, generatedSource), malformed);
const oraclePy = String.raw`import json,sys
from pico8.lua import lexer,parser
s=sys.stdin.buffer.read(); l=lexer.Lexer(4); l.process_lines([s]); p=parser.Parser(4)
try:
 p.process_tokens(l.tokens)
 def shape(x):
  if isinstance(x,parser.Node): return [x._name,[[f,shape(getattr(x,f))] for f in x._fields],[x.start_pos,x.end_pos]]
  if isinstance(x,(list,tuple)): return [shape(y) for y in x]
  if hasattr(x,'code'): return ['token',type(x).__name__,x.code.decode('latin1')]
  if x is None: return None
  if isinstance(x,bool): return ['value','bool',x]
  if isinstance(x,(int,float)): return ['value','number',str(x)]
  return ['value',type(x).__name__,str(x)]
 print(json.dumps({'status':'ok','shape':shape(p.root),'stats':len(p.root.stats),'tokens':[[type(t).__name__,t.code.decode('latin1')] for t in p.root.tokens],'span':[p.root.start_pos,p.root.end_pos]}))
except Exception as e: print(json.dumps({'status':'error','kind':type(e).__name__,'message':str(e)}))`;
let compared = 0;
function jsShape(x) {
  if (x && Array.isArray(x._fields)) return [x.type, x._fields.map((field) => [field, jsShape(x[field])]), [x.start_pos, x.end_pos]];
  if (Array.isArray(x)) return x.map(jsShape);
  if (x && typeof x.code === 'string') return ['token', x.constructor.name, x.code];
  if (x === null || x === undefined) return null;
  if (typeof x === 'boolean') return ['value', 'bool', x];
  if (typeof x === 'number') return ['value', 'number', String(x)];
  return ['value', typeof x, String(x)];
}
function jsResult(source) { try { const tree = parseLua(source); return { status: 'ok', shape: jsShape(tree), stats: tree.stats.length, tokens: [...tree.tokens].map(t => [t.constructor.name, t.code]), span: [tree.start_pos, tree.end_pos] }; } catch (error) { return { status: 'error', kind: 'ParserError', message: error.message || String(error) }; } }
for (const source of cases) {
  const result = cp.spawnSync(python, ['-c', oraclePy], pythonOptions({ input: Buffer.from(source, 'latin1'), encoding: 'utf8' }));
  if (result.status !== 0) throw new Error(`Python oracle failed (seed=${seed}): ${result.stderr || result.error || 'unknown error'}`);
  const expected = JSON.parse(result.stdout); const actual = jsResult(source); compared++;
  assert.equal(actual.status, expected.status, `seed=${seed} source=${JSON.stringify(source)}`);
  if (actual.status === 'ok') {
    assert.deepEqual(actual.shape, expected.shape, `seed=${seed} source=${JSON.stringify(source)}`);
    assert.equal(actual.stats, expected.stats, source);
    assert.deepEqual(actual.tokens, expected.tokens, `seed=${seed} tokens: ${JSON.stringify(source)}`);
    assert.deepEqual(actual.span, expected.span, `seed=${seed} span: ${JSON.stringify(source)}`);
  } else {
    // Public AST errors use LuaAstError; the validation/writer path carries
    // the Python-compatible diagnostic class and message.
    let validationError;
    try { validateLua(source); } catch (error) { validationError = error; }
    assert.ok(validationError, `seed=${seed} validator unexpectedly accepted ${JSON.stringify(source)}`);
    assert.equal(validationError.name, expected.kind, source);
    assert.equal(validationError.message, expected.message, source);
  }
}
console.log(`generated differential parser cases: seed=${seed}, cases=${cases.length}, compared=${compared}`);
