'use strict';
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { parseLua } = require('../src/lua-ast-model');
const astExports = require('../src/lua-ast-model');

const classOraclePy = String.raw`import json
from pico8.lua import parser
result={}
for name,cls in vars(parser).items():
  if isinstance(cls,type) and issubclass(cls,parser.Node) and cls is not parser.Node and name==cls.__name__:
    result[name]={'name':cls._name,'fields':list(cls._fields),'children':cls._children}
print(json.dumps(result))`;
const classResult = cp.spawnSync('python3', ['-c', classOraclePy], { env: { ...process.env, PYTHONPATH: '../../vendor/picotool' } });
assert.equal(classResult.status, 0, classResult.stderr.toString());
const pythonClasses = JSON.parse(classResult.stdout.toString());
const javascriptClasses = {};
for (const [name, constructor] of Object.entries(astExports)) {
  if (typeof constructor === 'function' && constructor.prototype instanceof astExports.Node) {
    javascriptClasses[name] = { name: constructor._name, fields: constructor._fields, children: constructor._children };
    assert.equal(constructor.prototype._name, constructor._name);
    assert.deepEqual(constructor.prototype._fields, constructor._fields);
    assert.equal(constructor.prototype._children, null);
  }
}
assert.deepEqual(javascriptClasses, pythonClasses, 'Python AST class inventory and metadata mismatch');

const py = String.raw`import json,sys
from pico8.lua import lexer,parser
s=sys.stdin.buffer.read(); l=lexer.Lexer(4); l.process_lines([s]); p=parser.Parser(4); p.process_tokens(l.tokens)
def out(x):
  if isinstance(x,(list,tuple)): return [out(y) for y in x]
  if isinstance(x, parser.Node):
    d={'type':x._name,'fields':list(x._fields),'start':x.start_pos,'end':x.end_pos}
    for f in x._fields:
      v=getattr(x,f)
      if isinstance(v,(list,tuple)): d[f]=out(v)
      else: d[f]=out(v)
    return d
  if x is None: return None
  if hasattr(x, '_data') and hasattr(x, '_lineno'):
    v=x.code; v=v.decode('latin1') if isinstance(v,bytes) else v
    return {'class': type(x).__name__, 'code': v, 'line': x._lineno, 'char': x._charno}
  v=getattr(x,'code',str(x,'latin1') if isinstance(x,bytes) else str(x))
  return v.decode('latin1') if isinstance(v,bytes) else v
print(json.dumps(out(p.root)))`;

function oracle(source) {
  const r = cp.spawnSync('python3', ['-c', py], { input: Buffer.from(source), env: { ...process.env, PYTHONPATH: '../../vendor/picotool' } });
  assert.equal(r.status, 0, r.stderr.toString()); return JSON.parse(r.stdout.toString());
}
const tokenOraclePy = String.raw`import json,sys
from pico8.lua import lexer,parser
s=sys.stdin.buffer.read(); l=lexer.Lexer(4); l.process_lines([s]); p=parser.Parser(4); p.process_tokens(l.tokens)
print(json.dumps([{'class':type(t).__name__,'code':t.code.decode('latin1'),'line':t._lineno,'char':t._charno} for t in p.root.tokens]))`;
function oracleTokens(source) {
  const result = cp.spawnSync('python3', ['-c', tokenOraclePy], { input: Buffer.from(source, 'latin1'), env: { ...process.env, PYTHONPATH: '../../vendor/picotool' } });
  assert.equal(result.status, 0, result.stderr.toString());
  return JSON.parse(result.stdout.toString());
}
const groupOraclePy = String.raw`import json,sys
from pico8.lua import lexer,parser
s=sys.stdin.buffer.read(); l=lexer.Lexer(4); l.process_lines([s]); p=parser.Parser(4); p.process_tokens(l.tokens)
def tok(t): return {'class':type(t).__name__,'code':t.code.decode('latin1'),'line':t._lineno,'char':t._charno}
def groups(n):
  result=[]
  for g in n._token_groups:
    if type(g)==tuple: result.append([list(g[0]) if type(g[0])==tuple else g[0],[tok(t) for t in g[1]]])
    else: result.append([tok(t) for t in g])
  return result
def shape(x):
  if isinstance(x,parser.Node): return {'type':x._name,'groups':groups(x),'fields':[shape(getattr(x,f)) for f in x._fields]}
  if isinstance(x,(list,tuple)): return [shape(y) for y in x]
  return None
print(json.dumps(shape(p.root)))`;
function oracleGroups(source) {
  const result = cp.spawnSync('python3', ['-c', groupOraclePy], { input: Buffer.from(source, 'latin1'), env: { ...process.env, PYTHONPATH: '../../vendor/picotool' } });
  assert.equal(result.status, 0, result.stderr.toString());
  return JSON.parse(result.stdout.toString());
}
function canonGroups(node) {
  return node._token_groups.map(group => {
    const field = group.length === 2 && Array.isArray(group[1]) && (typeof group[0] === 'string' || Array.isArray(group[0]));
    return field ? [group[0], group[1].map(canonJs)] : group.map(canonJs);
  });
}
function canonGroupTree(value) {
  if (value && typeof value === 'object' && Array.isArray(value._fields)) return { type: value.type, groups: canonGroups(value), fields: value._fields.map(field => canonGroupTree(value[field])) };
  if (Array.isArray(value)) return value.map(canonGroupTree);
  return null;
}
function canonJs(x) {
  if (x && typeof x === 'object' && typeof x.code === 'string' && typeof x.line === 'number') return { class: x.constructor.name, code: x.code, line: x.line, char: x.column };
  if (x && typeof x === 'object' && x.type && Array.isArray(x._fields)) {
    const d = { type: x.type, fields: x._fields.slice(), start: x.start_pos, end: x.end_pos };
    for (const f of x._fields) d[f] = canonJs(x[f]);
    return d;
  }
  if (Array.isArray(x)) return x.map(canonJs);
  if (x === null || x === undefined) return null;
  // Python stores names/operators/literals as lexer tokens; JS stores their
  // source spelling or a primitive. Normalize both to source spelling.
  if (typeof x === 'boolean') return x ? 'True' : 'False';
  if (typeof x === 'number') return String(x);
  return String(x);
}
function typeCounts(x, out = {}) {
  if (!x || typeof x !== 'object') return out;
  if (x.type) out[x.type] = (out[x.type] || 0) + 1;
  if (Array.isArray(x)) for (const v of x) typeCounts(v, out);
  else for (const v of Object.values(x)) typeCounts(v, out);
  return out;
}

const corpus = [
  'x = 1', 'a,b += 1, 2', 'local x, y = 1, f(2)',
  'if x > 0 then print("yes") elseif x == 0 then x=1 else x=2 end',
  'while x do x=x-1 end',
  'repeat x=x+1 until x>3', 'for i=1,10,2 do print(i) end',
  'for k,v in pairs(t) do print(k,v) end', 'function add(a,b) return a+b end',
  'function a.b:c(...) return ... end', 'local function f(x) return x end',
  'return {a=1, [x]=y, 3}', 'x = -a and not b', 'foo:bar(1, {x=2})',
  'x = x + x',
];
let exactPasses = 0; const exactFailures = [];
for (const source of corpus) {
  const jsTree = parseLua(source), pyTree = oracle(source), js = canonJs(jsTree);
  // Compare every field recursively, including token class/code/position.
  assert.equal(js.type, pyTree.type, source); assert.deepEqual(js.fields, pyTree.fields, source);
  assert.equal(js.start, pyTree.start, source); assert.equal(js.end, pyTree.end, source);
  try { assert.deepEqual(js, pyTree); exactPasses += 1; } catch (error) { exactFailures.push({ source, path: firstDiff(js, pyTree) }); if (process.env.PICOTOOL_AST_DIAGNOSTICS === '1') console.error(`${source}: ${error.message}`); }
  const jc = typeCounts(js), pc = typeCounts(pyTree);
  for (const t of ['Chunk', 'StatAssignment', 'StatLocalAssignment', 'StatIf', 'StatFunction', 'StatLocalFunction', 'StatWhile', 'StatRepeat', 'StatForStep', 'StatForIn', 'StatReturn', 'FunctionName', 'FunctionBody', 'NameList', 'VarList']) {
    assert.equal(jc[t] || 0, pc[t] || 0, `${source}: recursive ${t} count`);
  }
  for (const n of [jsTree, ...jsTree.stats]) {
    assert.ok(Number.isInteger(n.start_pos) && Number.isInteger(n.end_pos), `missing token span: ${source}`);
    assert.ok(Array.isArray(n._fields), `missing fields: ${source}`);
  }
}
console.log('AST Python oracle comparisons passed');
console.log(`recursive exact corpus: ${exactPasses}/${corpus.length} passed`);
if (exactFailures.length) console.log('recursive mismatches:', exactFailures);
assert.equal(exactFailures.length, 0, 'handwritten Python AST structural mismatches');

const wrapperTree = parseLua('local x = f(1, y)');
assert.equal(wrapperTree.stats[0].explist.exps[0].type, 'ExpValue');
assert.equal(wrapperTree.stats[0].explist.exps[0].value.type, 'FunctionCall');
assert.equal(wrapperTree.stats[0].explist.exps[0].value.args.type, 'FunctionArgs');
const tokenGroupSource = '--hi\nx = 1 --end\nprint(x)\n';
assert.deepEqual([...parseLua(tokenGroupSource).tokens].map(canonJs), oracleTokens(tokenGroupSource), 'AST token-group regeneration mismatch');
for (const source of ['x=1', 'if x then print(1) else print(2) end', tokenGroupSource]) {
  const tree = parseLua(source);
  assert.deepEqual(canonGroupTree(tree), oracleGroups(source), `AST token-group layout mismatch: ${source}`);
}
const replaceableTree = parseLua('x=1');
replaceableTree.stats[0] = parseLua('y=2').stats[0];
assert.equal([...replaceableTree.tokens].map(token => token.code).join(''), 'y=2', 'AST token groups must follow replaced child fields');
const mutableTree = parseLua('x=1');
mutableTree.stats[0].varlist.vars[0].name.code = 'y';
mutableTree.stats[0].explist.exps[0].value.code = '2';
assert.equal([...mutableTree.tokens].map(token => token.code).join(''), 'y=2', 'AST token fields must mutate the retained lexer tokens');
const mutableLocal = parseLua('local x=1');
mutableLocal.stats[0].namelist.names[0].code = 'y';
assert.equal([...mutableLocal.tokens].map(token => token.code).join(''), 'local y=1');
const mutableFunction = parseLua('function f(x) return x end');
mutableFunction.stats[0].funcname.namepath[0].code = 'g';
assert.equal([...mutableFunction.tokens].map(token => token.code).join(''), 'function g(x) return x end');
assert.equal(wrapperTree.stats[0].explist.exps[0].value.args.explist.exps.length, 2);
const namedTree = parseLua('function f(a) return a end');
assert.ok(namedTree instanceof require('../src/lua-ast-model').Chunk);
assert.ok(namedTree.stats[0] instanceof require('../src/lua-ast-model').StatFunction);
assert.ok(namedTree.stats[0].funcbody instanceof require('../src/lua-ast-model').FunctionBody);

// Parse every upstream text-cart Lua section.  These include shorthand-if
// syntax (notably test_cart_memdump.p8), which is a useful regression corpus
// beyond the small hand-written examples above.
const fixtureDir = path.join(process.cwd(), '../../vendor/picotool/tests/testdata');
const fixtureAstMismatches = [];
for (const file of fs.readdirSync(fixtureDir).filter(name => name.endsWith('.p8'))) {
  const text = fs.readFileSync(path.join(fixtureDir, file), 'latin1');
  const match = /__lua__\n([\s\S]*?)(?=\n__\w+__|$)/.exec(text);
  const source = match ? match[1] : '';
  const tree = parseLua(source);
  // The upstream parser's Python wrapper treats this cart's shorthand-if
  // section as an empty chunk when fed as a standalone stream; still retain
  // it as a JS acceptance regression, while oracle-comparing the fixtures it
  // exposes normally.
  if (file === 'test_cart_memdump.p8') continue;
  const pyTree = oracle(source);
  assert.equal(tree.type, pyTree.type, file);
  assert.equal(tree.stats.length, pyTree.stats.length, file);
  const jsCanonical = canonJs(tree);
  if (firstDiff(jsCanonical, pyTree)) fixtureAstMismatches.push({ file, paths: diffPaths(jsCanonical, pyTree, '$', [], 20) });
  assert.deepEqual([...tree.tokens].map(canonJs), oracleTokens(source), `upstream text-cart token groups mismatch: ${file}`);
  assert.deepEqual(canonGroupTree(tree), oracleGroups(source), `upstream text-cart token-group layout mismatch: ${file}`);
}
console.log('upstream text-cart fixture parse checks passed');
console.log('upstream text-cart recursive mismatches:', JSON.stringify(fixtureAstMismatches, null, 2));
assert.equal(fixtureAstMismatches.length, 0, 'upstream text-cart Python AST mismatches');

// Broader vendored parser corpus: mirror python_oracle.parser_corpus() by
// extracting every deduplicated get_parser(bytes) source and retaining only
// sources accepted by the upstream parser.
const corpusPy = String.raw`import ast,base64,json,pathlib
from pico8.lua import lexer,parser
p=pathlib.Path('../../vendor/picotool/tests/pico8/lua/parser_test.py'); t=ast.parse(p.read_text()); seen=set(); out=[]
for n in ast.walk(t):
  if not isinstance(n,ast.Call) or not isinstance(n.func,ast.Name) or n.func.id!='get_parser' or not n.args: continue
  try: s=ast.literal_eval(n.args[0])
  except Exception: continue
  if not isinstance(s,bytes) or s in seen: continue
  seen.add(s); l=lexer.Lexer(4); l.process_lines([s]); q=parser.Parser(4)
  try: q.process_tokens(l.tokens); out.append([base64.b64encode(s).decode(),True,q.root.end_pos,len(l.tokens)])
  except Exception: out.append([base64.b64encode(s).decode(),False,None,len(l.tokens)])
print(json.dumps(out))`;
const corpusResult = cp.spawnSync('python3', ['-c', corpusPy], { cwd: process.cwd(), env: { ...process.env, PYTHONPATH: '../../vendor/picotool' } });
assert.equal(corpusResult.status, 0, corpusResult.stderr.toString());
const parserCorpus = JSON.parse(corpusResult.stdout.toString());
let corpusAccepted = 0, corpusFullPrograms = 0, corpusFragments = 0, corpusExact = 0, corpusMismatched = 0, corpusJsFailures = 0; const corpusMismatchDetails = [], corpusFailureDetails = [];
let corpusGroupExact = 0; const corpusGroupMismatches = [];
function firstDiff(a, b, path = '$') {
  if (Object.is(a, b)) return null;
  if (typeof a !== typeof b || a === null || b === null) return path;
  if (Array.isArray(a) || Array.isArray(b)) { if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return path; for (let i = 0; i < a.length; i += 1) { const d = firstDiff(a[i], b[i], `${path}[${i}]`); if (d) return d; } return null; }
  if (typeof a === 'object') { const keys = new Set([...Object.keys(a), ...Object.keys(b)]); for (const k of keys) { const d = firstDiff(a[k], b[k], `${path}.${k}`); if (d) return d; } return null; }
  return path;
}
function diffPaths(a, b, current = '$', found = [], limit = 20) {
  if (found.length >= limit || Object.is(a, b)) return found;
  const record = () => found.push({ path: current, js: JSON.stringify(a)?.slice(0, 100), python: JSON.stringify(b)?.slice(0, 100) });
  if (typeof a !== typeof b || a === null || b === null) { record(); return found; }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) { record(); return found; }
    for (let i = 0; i < a.length && found.length < limit; i++) diffPaths(a[i], b[i], `${current}[${i}]`, found, limit);
  } else if (typeof a === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) { if (found.length >= limit) break; diffPaths(a[key], b[key], `${current}.${key}`, found, limit); }
  } else record();
  return found;
}
for (const [encoded, accepted, pyEnd, pyTokenCount] of parserCorpus) {
  if (!accepted) continue;
  corpusAccepted += 1; if (pyEnd === pyTokenCount) corpusFullPrograms += 1; else corpusFragments += 1; const source = Buffer.from(encoded, 'base64').toString('latin1');
  let jsTree; try { jsTree = parseLua(source); } catch (_) { corpusJsFailures += 1; corpusFailureDetails.push(source.slice(0, 80)); continue; }
  try { const jsCanon = canonJs(jsTree), pyCanon = oracle(source); assert.deepEqual(jsCanon, pyCanon); corpusExact += 1; } catch (_) { corpusMismatched += 1; corpusMismatchDetails.push({ source, pyEnd, pyTokenCount, jsEnd: jsTree.end_pos, paths: diffPaths(canonJs(jsTree), oracle(source), '$', [], 8) }); }
  try { assert.deepEqual(canonGroupTree(jsTree), oracleGroups(source)); corpusGroupExact += 1; }
  catch (_) { corpusGroupMismatches.push({ source: source.slice(0, 100), path: firstDiff(canonGroupTree(jsTree), oracleGroups(source)) }); }
}
console.log(`vendored parser corpus: ${parserCorpus.length} total, ${corpusAccepted} accepted (${corpusFullPrograms} full programs, ${corpusFragments} fragments/residual), ${corpusExact} exact, ${corpusMismatched} mismatched, ${corpusJsFailures} JS parse failures`);
console.log('corpus mismatch diagnostics:', JSON.stringify(corpusMismatchDetails, null, 2));
console.log('corpus JS parse-failure samples:', corpusFailureDetails);
console.log(`corpus token-group layouts: ${corpusGroupExact}/${corpusAccepted} exact`);
console.log('corpus token-group mismatch diagnostics:', corpusGroupMismatches);
assert.equal(corpusMismatched, 0, 'accepted-input Python AST structural mismatches');
assert.equal(corpusJsFailures, 0, 'accepted-input JavaScript AST parse failures');
assert.equal(corpusGroupMismatches.length, 0, 'accepted-input Python token-group layout mismatches');
