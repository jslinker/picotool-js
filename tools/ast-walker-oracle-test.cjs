'use strict';
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { parseLua, VarName } = require('../src/lua-ast-model');
const { BaseASTWalker } = require('../src/lua-ast-walker');
const { TokName, TokNumber } = require('../src/lua-token');

const python = String.raw`import json,sys
from pico8.lua import lexer,parser,lua
s=sys.stdin.buffer.read(); lex=lexer.Lexer(4); lex.process_lines([s]); p=parser.Parser(4); p.process_tokens(lex.tokens)
class Trace(lua.BaseASTWalker):
  def _walk(self,node):
    if isinstance(node,parser.Node): yield ['node',node._name]
    for item in super()._walk(node): yield item
  def _walk_token(self,token):
    yield ['token',type(token).__name__,token.code.decode('latin1')]
  def _walk_value(self,value):
    if value is None: yield ['value','null','']
    elif type(value)==bool: yield ['value','boolean','true' if value else 'false']
    elif type(value)==int: yield ['value','number',str(value)]
    else: yield ['value',type(value).__name__,str(value)]
print(json.dumps(list(Trace(lex.tokens,p.root).walk())))`;
function pythonTrace(source) {
  const result = cp.spawnSync('python3', ['-c', python], { input: Buffer.from(source, 'latin1'), env: { ...process.env, PYTHONPATH: '../../vendor/picotool' } });
  assert.equal(result.status, 0, result.stderr.toString());
  return JSON.parse(result.stdout.toString());
}
class TraceWalker extends BaseASTWalker {
  *_walk(node) {
    if (node && Array.isArray(node._fields)) yield ['node', node.type];
    yield* super._walk(node);
  }
  *_walk_token(token) { yield ['token', token.constructor.name, token.code]; }
  *_walk_value(value) {
    if (value == null) yield ['value', 'null', ''];
    else yield ['value', typeof value, String(value)];
  }
}
function javascriptTrace(source) {
  const tree = parseLua(source);
  return [...new TraceWalker([...tree.tokens], tree).walk()];
}
const mutationPython = String.raw`import json,sys
from pico8.lua import lexer,parser,lua
s=sys.stdin.buffer.read(); lex=lexer.Lexer(4); lex.process_lines([s]); p=parser.Parser(4); p.process_tokens(lex.tokens)
class Mutate(lua.BaseASTWalker):
  def _walk_token(self,token):
    if isinstance(token,lexer.TokName) and token.code==b'x': token.code=b'y'
    if isinstance(token,lexer.TokNumber) and token.code==b'1': token.code=b'2'
    if False: yield
list(Mutate(lex.tokens,p.root).walk())
print(json.dumps([t.code.decode('latin1') for t in p.root.tokens]))`;
function pythonMutation(source) {
  const result = cp.spawnSync('python3', ['-c', mutationPython], { input: Buffer.from(source, 'latin1'), env: { ...process.env, PYTHONPATH: '../../vendor/picotool' } });
  assert.equal(result.status, 0, result.stderr.toString()); return JSON.parse(result.stdout.toString());
}
class MutatingWalker extends BaseASTWalker {
  *_walk_token(token) {
    if (token instanceof TokName && token.code === 'x') token.code = 'y';
    if (token instanceof TokNumber && token.code === '1') token.code = '2';
  }
}
function javascriptMutation(source) {
  const tree = parseLua(source);
  [...new MutatingWalker([...tree.tokens], tree).walk()];
  return [...tree.tokens].map(token => token.code);
}
const replacementPython = String.raw`import json,sys
from pico8.lua import lexer,parser,lua
def parse(s):
  lex=lexer.Lexer(4); lex.process_lines([s]); p=parser.Parser(4); p.process_tokens(lex.tokens); return lex,p
lex,p=parse(sys.stdin.buffer.read()); _,other=parse(b'y=2'); replacement=other.root.stats[0].varlist.vars[0]
class Replace(lua.BaseASTWalker):
  def _walk_ExpValue(self,node):
    if isinstance(node.value,parser.VarName): node.value=replacement
    for item in super()._walk_ExpValue(node): yield item
list(Replace(lex.tokens,p.root).walk())
print(json.dumps([t.code.decode('latin1') for t in p.root.tokens]))`;
function pythonReplacement(source) {
  const result = cp.spawnSync('python3', ['-c', replacementPython], { input: Buffer.from(source, 'latin1'), env: { ...process.env, PYTHONPATH: '../../vendor/picotool' } });
  assert.equal(result.status, 0, result.stderr.toString()); return JSON.parse(result.stdout.toString());
}
class ReplacingWalker extends BaseASTWalker {
  constructor(tokens, root) { super(tokens, root); this.replacement = parseLua('y=2').stats[0].varlist.vars[0]; }
  *_walk_ExpValue(node) {
    if (node.value instanceof VarName) node.value = this.replacement;
    yield* super._walk_ExpValue(node);
  }
}
function javascriptReplacement(source) {
  const tree = parseLua(source);
  [...new ReplacingWalker([...tree.tokens], tree).walk()];
  return [...tree.tokens].map(token => token.code);
}
const variedReplacementPython = String.raw`import json,sys
from pico8.lua import lexer,parser,lua
def parse(s):
  lex=lexer.Lexer(4); lex.process_lines([s]); p=parser.Parser(4); p.process_tokens(lex.tokens); return lex,p
lex,p=parse(sys.stdin.buffer.read()); _,valuep=parse(b'y=2'); _,fieldp=parse(b't={q=2}'); _,blockp=parse(b'do y=2 end')
value=valuep.root.stats[0].explist.exps[0]; field=fieldp.root.stats[0].explist.exps[0].value.fields[0]; block=blockp.root.stats[0].block
class Replace(lua.BaseASTWalker):
  def _walk_ExpBinOp(self,node):
    node.exp2=value
    for item in super()._walk_ExpBinOp(node): yield item
  def _walk_TableConstructor(self,node):
    if node.fields: node.fields[0]=field
    for item in super()._walk_TableConstructor(node): yield item
  def _walk_StatIf(self,node):
    if node.exp_block_pairs: node.exp_block_pairs[0]=(node.exp_block_pairs[0][0],block)
    for item in super()._walk_StatIf(node): yield item
list(Replace(lex.tokens,p.root).walk())
print(json.dumps([t.code.decode('latin1') for t in p.root.tokens]))`;
function pythonVariedReplacement(source) {
  const result = cp.spawnSync('python3', ['-c', variedReplacementPython], { input: Buffer.from(source, 'latin1'), env: { ...process.env, PYTHONPATH: '../../vendor/picotool' } });
  assert.equal(result.status, 0, result.stderr.toString()); return JSON.parse(result.stdout.toString());
}
class VariedReplacingWalker extends BaseASTWalker {
  constructor(tokens, root) {
    super(tokens, root);
    this.value = parseLua('y=2').stats[0].explist.exps[0];
    this.field = parseLua('t={q=2}').stats[0].explist.exps[0].value.fields[0];
    this.block = parseLua('do y=2 end').stats[0].block;
  }
  *_walk_ExpBinOp(node) { node.exp2 = this.value; yield* super._walk_ExpBinOp(node); }
  *_walk_TableConstructor(node) { if (node.fields.length) node.fields[0] = this.field; yield* super._walk_TableConstructor(node); }
  *_walk_StatIf(node) { if (node.exp_block_pairs.length) node.exp_block_pairs[0] = [node.exp_block_pairs[0][0], this.block]; yield* super._walk_StatIf(node); }
}
function javascriptVariedReplacement(source) {
  const tree = parseLua(source);
  [...new VariedReplacingWalker([...tree.tokens], tree).walk()];
  return [...tree.tokens].map(token => token.code);
}

const focused = [
  'x=1', 'local x,y=1,2', 'if x then print(1) else print(2) end',
  'for i=1,3 do print(i) end', 'function f(a,...) return a end',
  'goto foobar', '::foobar::', 'x={a=1,[2]=3}',
];
for (const source of focused) {
  assert.deepEqual(javascriptTrace(source), pythonTrace(source), `AST walker trace mismatch: ${source}`);
  assert.deepEqual(javascriptMutation(source), pythonMutation(source), `AST walker mutation mismatch: ${source}`);
  assert.deepEqual(javascriptReplacement(source), pythonReplacement(source), `AST walker replacement mismatch: ${source}`);
  assert.deepEqual(javascriptVariedReplacement(source), pythonVariedReplacement(source), `AST walker varied replacement mismatch: ${source}`);
}

const corpusPython = String.raw`import ast,base64,json,pathlib
from pico8.lua import lexer,parser
tree=ast.parse(pathlib.Path('../../vendor/picotool/tests/pico8/lua/parser_test.py').read_text()); seen=set(); sources=[]
for node in ast.walk(tree):
  if not isinstance(node,ast.Call) or not isinstance(node.func,ast.Name) or node.func.id!='get_parser' or not node.args: continue
  try: source=ast.literal_eval(node.args[0])
  except Exception: continue
  if not isinstance(source,bytes) or source in seen: continue
  seen.add(source); lex=lexer.Lexer(4); lex.process_lines([source]); p=parser.Parser(4)
  try: p.process_tokens(lex.tokens); sources.append(base64.b64encode(source).decode())
  except Exception: pass
print(json.dumps(sources))`;
const corpusResult = cp.spawnSync('python3', ['-c', corpusPython], { cwd: process.cwd(), env: { ...process.env, PYTHONPATH: '../../vendor/picotool' } });
assert.equal(corpusResult.status, 0, corpusResult.stderr.toString());
const acceptedSources = JSON.parse(corpusResult.stdout.toString());
assert.equal(acceptedSources.length, 72);
for (const encoded of acceptedSources) {
  const source = Buffer.from(encoded, 'base64').toString('latin1');
  assert.deepEqual(javascriptTrace(source), pythonTrace(source), `AST walker corpus trace mismatch: ${source.slice(0, 100)}`);
  assert.deepEqual(javascriptMutation(source), pythonMutation(source), `AST walker corpus mutation mismatch: ${source.slice(0, 100)}`);
  assert.deepEqual(javascriptReplacement(source), pythonReplacement(source), `AST walker corpus replacement mismatch: ${source.slice(0, 100)}`);
  assert.deepEqual(javascriptVariedReplacement(source), pythonVariedReplacement(source), `AST walker corpus varied replacement mismatch: ${source.slice(0, 100)}`);
}

const fixtureDirectory = path.join(__dirname, '../../../vendor/picotool/tests/testdata');
for (const file of fs.readdirSync(fixtureDirectory).filter(name => name.endsWith('.p8') && name !== 'test_cart_memdump.p8')) {
  const text = fs.readFileSync(path.join(fixtureDirectory, file), 'latin1');
  const match = /__lua__\n([\s\S]*?)(?=\n__\w+__|$)/.exec(text);
  const source = match ? match[1] : '';
  assert.deepEqual(javascriptTrace(source), pythonTrace(source), `AST walker trace mismatch: ${file}`);
  assert.deepEqual(javascriptMutation(source), pythonMutation(source), `AST walker mutation mismatch: ${file}`);
  assert.deepEqual(javascriptReplacement(source), pythonReplacement(source), `AST walker replacement mismatch: ${file}`);
  assert.deepEqual(javascriptVariedReplacement(source), pythonVariedReplacement(source), `AST walker varied replacement mismatch: ${file}`);
}
console.log(`AST walker Python traces, token mutations, and varied child replacements passed: ${acceptedSources.length} parser inputs plus focused and text-cart fixtures`);
