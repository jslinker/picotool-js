'use strict';

// Python-shaped Lua/PICO-8 AST nodes for callers that need the parsed structure.
// The parser skips trivia while recognizing grammar, then stores token groups
// on nodes so whitespace and comments survive token traversal and mutation.
const { tokenizeLua, TokName, TokSymbol, TokKeyword } = require('./lua-lexer');

class LuaAstError extends SyntaxError {}
const NODE_CLASS_BY_TYPE = Object.create(null);

class Node {
  constructor(type, fields = {}, first = null, last = null, source = '') {
    const named = NODE_CLASS_BY_TYPE[type];
    if (named && Object.getPrototypeOf(this) !== named.prototype) Object.setPrototypeOf(this, named.prototype);
    this.type = type; this._name = type; this._fields = Object.keys(fields); Object.assign(this, fields);
    this._start_token_pos = first?.tokenPos ?? null; this._end_token_pos = last ? (last.tokenPos + 1) : null;
    this._token_groups = [];
    this.range = makeRange(first, last, source);
    this.start = this.range.start; this.end = this.range.end;
  }
  get start_pos() { return this._start_token_pos; }
  get end_pos() { return this._end_token_pos; }
  storeTokenGroups(tokenlist) {
    let position = this.start_pos ?? 0;
    this._token_groups = [];
    const add = (field, value) => {
      if (value instanceof Node) {
        this._token_groups.push([field, tokenlist.slice(position, value.start_pos)]);
        value.storeTokenGroups(tokenlist);
        position = value.end_pos;
      } else if (field === 'exp_block_pairs' && Array.isArray(value)) {
        value.forEach((pair, index) => {
          if (pair[0] != null) add([field, index, 0], pair[0]);
          add([field, index, 1], pair[1]);
        });
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => add(Array.isArray(field) ? [...field, index] : [field, index], item));
      } else if (typeof value === 'string') {
        // Python treats a bytes/string-valued AST field as an iterable here.
        // Goto and label names therefore create one literal group per byte.
        for (let index = 0; index < value.length; index += 1) {
          this._token_groups.push(tokenlist.slice(position, position + 1));
          position += 1;
        }
      } else {
        this._token_groups.push(tokenlist.slice(position, position + 1));
        position += 1;
      }
    };
    for (const field of this._fields) add(field, this[field]);
    this._token_groups.push(tokenlist.slice(position, this.end_pos));
    return this;
  }
  store_token_groups(tokenlist) { return this.storeTokenGroups(tokenlist); }
  *iterTokens() {
    for (const group of this._token_groups) {
      const isFieldGroup = group.length === 2 && Array.isArray(group[1]) && (typeof group[0] === 'string' || Array.isArray(group[0]));
      if (!isFieldGroup) yield* group;
      else {
        yield* group[1];
        const path = Array.isArray(group[0]) ? group[0] : [group[0]];
        const child = path.reduce((value, key) => value[key], this);
        yield* child.iterTokens();
      }
    }
  }
  get tokens() { return this.iterTokens(); }
  children() {
    const out = [];
    for (const value of Object.values(this)) {
      if (value instanceof Node) out.push(value);
      else if (Array.isArray(value)) {
        const collect = item => { if (item instanceof Node) out.push(item); else if (Array.isArray(item)) for (const nested of item) collect(nested); };
        for (const item of value) collect(item);
      }
    }
    return out;
  }
  walk(visitor) {
    const fn = typeof visitor === 'function' ? visitor : visitor?.visit;
    if (fn) fn(this);
    for (const child of this.children()) child.walk(visitor);
    return this;
  }
  toJSON() {
    const result = { type: this.type, range: this.range };
    for (const [key, value] of Object.entries(this)) if (!['type', 'range', 'start', 'end'].includes(key)) result[key] = value;
    return result;
  }
}

const PYTHON_FIELDS = {
  Chunk: { body: 'stats' }, AssignmentStatement: { targets: 'varlist', operator: 'assignop', values: 'explist' },
  CallStatement: { expression: 'functioncall' }, DoStatement: { body: 'block' }, WhileStatement: { condition: 'exp', body: 'block' },
  RepeatStatement: { body: 'block', condition: 'exp' }, ReturnStatement: { values: 'explist' },
  LocalAssignmentStatement: { names: 'namelist', values: 'explist' }, LocalFunctionStatement: { name: 'funcname' }, ExpUnOp: { operator: 'unop', argument: 'exp' }, ForNumericStatement: { name: 'name', start: 'exp_init', finish: 'exp_end', step: 'exp_step', body: 'block' },
  ForInStatement: { names: 'namelist', values: 'explist', body: 'block' }, FunctionStatement: { name: 'funcname', body: 'funcbody' },
  LocalFunctionStatement: { name: 'funcname', body: 'funcbody' }, BinaryExpression: { left: 'exp1', operator: 'binop', right: 'exp2' }, UnaryExpression: { operator: 'unop', argument: 'exp' },
  NameExpression: { name: 'name' }, NumberLiteral: { value: 'value' }, StringLiteral: { value: 'value' }, TableExpression: { fields: 'fields' }, Function: { body: 'funcbody' }, FunctionExpression: { body: 'funcbody' }, CallExpression: { callee: 'exp_prefix' },
  IndexExpression: { object: 'exp_prefix', index: 'exp_index' }, MemberExpression: { object: 'exp_prefix', name: 'attr_name' },
  LabelStatement: { name: 'label' },
};
const PYTHON_NAMES = { AssignmentStatement: 'StatAssignment', CallStatement: 'StatFunctionCall', DoStatement: 'StatDo', WhileStatement: 'StatWhile', RepeatStatement: 'StatRepeat', IfStatement: 'StatIf', CallStatement: 'StatFunctionCall', BreakStatement: 'StatBreak', ReturnStatement: 'StatReturn', GotoStatement: 'StatGoto', LabelStatement: 'StatLabel', ForNumericStatement: 'StatForStep', ForInStatement: 'StatForIn', FunctionStatement: 'StatFunction', LocalFunctionStatement: 'StatLocalFunction', LocalAssignmentStatement: 'StatLocalAssignment', BinaryExpression: 'ExpBinOp', UnaryExpression: 'ExpUnOp', NameExpression: 'VarName', NumberLiteral: 'ExpValue', StringLiteral: 'ExpValue', TableExpression: 'TableConstructor', CallExpression: 'FunctionCall', FunctionExpression: 'Function', IndexExpression: 'VarIndex', MemberExpression: 'VarAttribute', Chunk: 'Chunk' };
const node = (type, fields, first, last, source) => {
  const mapped = {}; const renames = PYTHON_FIELDS[type] || {};
  for (const [key, value] of Object.entries(fields)) mapped[renames[key] || key] = value;
  if (type === 'AssignmentStatement') {
    const vf = fields.targets[0], vl = fields.targets.at(-1), ef = fields.values[0], el = fields.values.at(-1);
    mapped.varlist = wrapNode('VarList', { vars: fields.targets }, tokenFromNode(vf, source), tokenFromNode(vl, source, true), source);
    mapped.explist = wrapNode('ExpList', { exps: fields.values }, tokenFromNode(ef, source), tokenFromNode(el, source, true), source);
  }
  if (type === 'LocalAssignmentStatement') { const vals = fields.values.map(v => ['CallExpression', 'FunctionCall'].includes(v?.type) ? node('ExpValue', { value: v }, tokenFromNode(v, source), tokenFromNode(v, source, true), source) : v); mapped.namelist = wrapNode('NameList', { names: fields.names }, first, first, source); mapped.explist = vals.length ? wrapNode('ExpList', { exps: vals }, first, last, source) : null; }
  if (type === 'ReturnStatement') { const ef = fields.values[0], el = fields.values.at(-1); mapped.explist = fields.values.length ? wrapNode('ExpList', { exps: fields.values }, tokenFromNode(ef, source), tokenFromNode(el, source, true), source) : null; if (mapped.explist) mapped.explist._start_token_pos = (first.actualTokenPos ?? first.tokenPos) + 1; if (mapped.explist && ef?.type === 'VarargDots') ef._start_token_pos -= 1; }
  if (type === 'CallExpression' && fields.method !== undefined) { mapped.methodname = mapped.method; delete mapped.method; }
  if (type === 'CallExpression' && mapped.args?.type === 'ExpList') { const inner = mapped.args; const wrapperFirst = tokenFromNode(inner, source); inner._start_token_pos += 1; const closePos = inner._end_token_pos; inner._end_token_pos -= 1; mapped.args = wrapNode('FunctionArgs', { explist: inner }, wrapperFirst, tokenFromNode(inner, source, true), source); mapped.args._end_token_pos = closePos; inner.exps.forEach((v, i) => { mapped.args[i] = v?.decoded !== undefined ? { value: v.decoded } : v; }); Object.defineProperty(mapped.args, 'length', { value: inner.exps.length, enumerable: false }); }
  if (type === 'CallExpression' && mapped.args === null) mapped.args = wrapNode('FunctionArgs', { explist: null }, first ? { ...first, tokenPos: first.tokenPos + 1 } : first, last, source);
  if (type === 'ForInStatement') { mapped.namelist = wrapNode('NameList', { names: fields.names }, first, last, source); mapped.explist = wrapNode('ExpList', { exps: fields.values }, first, last, source); }
  const pythonType = type === 'CallExpression' && fields.method !== undefined ? 'FunctionCallMethod' : (PYTHON_NAMES[type] || type);
  const n = new Node(pythonType, mapped, first, last, source); n.type = pythonType;
  if ((type === 'IndexExpression' || type === 'MemberExpression') && fields.object?.end_pos !== undefined) n._start_token_pos = fields.object.end_pos;
  if (type === 'AssignmentStatement' && n.varlist) n.varlist._start_token_pos = first.tokenPos;
  if (pythonType === 'FunctionCallMethod') { n._fields = ['exp_prefix', 'methodname', 'args']; n._start_token_pos = first.tokenPos + 1; }
  const fieldOrder = { AssignmentStatement: ['varlist', 'assignop', 'explist'], LocalAssignmentStatement: ['namelist', 'explist'], ReturnStatement: ['explist'], ForInStatement: ['namelist', 'explist', 'block'] };
  if (fieldOrder[type]) n._fields = fieldOrder[type];
  for (const [key, value] of Object.entries(fields)) if (!(key in n)) n[key] = value;
  if (type === 'NumberLiteral' || type === 'StringLiteral' || type === 'ExpValue') {
    if (Object.prototype.hasOwnProperty.call(n, 'raw')) { const raw = n.raw; delete n.raw; Object.defineProperty(n, 'raw', { value: raw, enumerable: false }); }
    n._fields = n._fields.filter(f => f !== 'raw');
    if (Object.prototype.hasOwnProperty.call(n, 'decoded')) { const decoded = n.decoded; delete n.decoded; Object.defineProperty(n, 'decoded', { value: decoded, enumerable: false }); n._fields = n._fields.filter(f => f !== 'decoded'); }
    if (Object.prototype.hasOwnProperty.call(n, 'numberValue')) { const numberValue = n.numberValue; delete n.numberValue; Object.defineProperty(n, 'numberValue', { value: numberValue, enumerable: false }); n._fields = n._fields.filter(f => f !== 'numberValue'); }
  }
  if (type === 'FunctionStatement' || type === 'LocalFunctionStatement') {
    const funcname = n.funcname;
    Object.defineProperty(n, 'name', { value: typeof funcname === 'string' ? funcname : funcname?.name, enumerable: false });
    Object.defineProperty(n, 'body', { value: n.funcbody, enumerable: false });
  }
  if (type === 'LocalAssignmentStatement' && Array.isArray(fields.values)) Object.defineProperty(n, 'values', { value: fields.values.map(v => v?.numberValue !== undefined ? { ...v, value: v.numberValue } : v), enumerable: false });
  // Python AST stores lexer tokens for names/operators. Keep a scalar alias
  // only where the JS API historically exposed one.
  if ((type === 'NameExpression' || type === 'VarName') && typeof n.name === 'string') n.name = new TokName(n.name, n.start.line, n.start.column);
  if (type === 'AssignmentStatement' && typeof n.assignop === 'string') { const p = findCodePosition(source, n.assignop, n.start.offset); n.assignop = new TokSymbol(n.assignop, p.line, p.column); }
  if (type === 'ExpBinOp' && typeof n.binop === 'string') { const p = findCodePosition(source, n.binop, n.start.offset); n.binop = ['and','or'].includes(n.binop) ? new TokKeyword(n.binop, p.line, p.column) : new TokSymbol(n.binop, p.line, p.column); }
  if ((type === 'ExpBinOp' || type === 'BinaryExpression') && n.binop?.code) { n.operator = n.binop.code; }
  if (type === 'ExpUnOp' && typeof n.unop === 'string') { const p = findCodePosition(source, n.unop, n.start.offset); n.unop = n.unop === 'not' ? new TokKeyword('not', p.line, p.column) : new TokSymbol(n.unop, p.line, p.column); }
  if (type === 'ExpUnOp' && n.unop?.code) { n.operator = n.unop.code; }
  if (type === 'NameList' && Array.isArray(n.names) && typeof n.names[0] === 'string') n.names = tokenizedNames(n.names, source, n.start.offset);
  if (type === 'FunctionName') { if (typeof n.namepath?.[0] === 'string') n.namepath = tokenizedNames(n.namepath, source, n.start.offset); if (typeof n.methodname === 'string') n.methodname = tokenizedNames([n.methodname], source, n.start.offset).at(-1); }
  if (type === 'ForNumericStatement' && typeof n.name === 'string') n.name = tokenAtText(n.name, source, n.start.offset, TokName);
  if (type === 'FunctionCallMethod' && typeof n.methodname === 'string') n.methodname = tokenAtText(n.methodname, source, n.start.offset, TokName);
  if (type === 'FieldNamedKey' && typeof n.key_name === 'string') n.key_name = tokenAtText(n.key_name, source, n.start.offset, TokName);
  if (type === 'MemberExpression' && typeof n.attr_name === 'string') n.attr_name = tokenAtText(n.attr_name, source, n.start.offset, TokName);
  if ((type === 'StatGoto' || type === 'StatLabel') && typeof n.label === 'string') n.label = tokenAtText(n.label, source, n.start.offset, type === 'StatLabel' ? require('./lua-token').TokLabel : TokName);
  return n;
};
function wrapNode(type, fields, first, last, source) { const n = new Node(type, fields, first, last, source); n.type = type; n._name = type; if (type === 'NameList' && Array.isArray(n.names) && typeof n.names[0] === 'string') n.names = tokenizedNames(n.names, source, n.start.offset); if (type === 'FunctionName' && Array.isArray(n.namepath) && typeof n.namepath[0] === 'string') n.namepath = tokenizedNames(n.namepath, source, n.start.offset); return n; }
function makeExpList(values, first, last, source) {
  const n = wrapNode('ExpList', { exps: values }, first, last, source);
  // Keep the historical JS indexing convenience while exposing Python's
  // ExpList node as the actual `args` field.
  values.forEach((v, i) => { n[i] = v; }); Object.defineProperty(n, 'length', { value: values.length, enumerable: false });
  return n;
}
function tokenFromNode(n, source, end = false) {
  if (!n) return null;
  const p = end ? n.range.end : n.range.start;
  return { tokenPos: end ? n.end_pos - 1 : n.start_pos, line: p.line, column: p.column, code: end ? '' : source.slice(n.range.start.offset, n.range.end.offset) };
}
function findCodePosition(source, code, offset = 0) { const at = String(source).indexOf(code, Math.max(0, offset)); const before = String(source).slice(0, at < 0 ? offset : at); const lines = before.split(/\n/); return { line: lines.length - 1, column: lines.at(-1).length }; }
function tokenAtText(text, source, offset, Klass) { const p = findCodePosition(source, text, offset); return new Klass(text, p.line, p.column); }
function tokenizedNames(names, source, offset) { let at = offset; return names.map(name => { const token = tokenAtText(name, source, at, TokName); at = source.indexOf(name, at) + String(name).length; return token; }); }
function makeRange(first, last, source) {
  if (!first || !last) return { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } };
  const start = point(first, source), end = point(last, source, true);
  return { start, end };
}
function point(token, source, end = false) {
  const line = token.line ?? 0, column = token.column ?? 0;
  const lines = String(source).split(/\n/); let offset = 0;
  for (let i = 0; i < line; i++) offset += lines[i].length + 1;
  offset += column;
  if (end) offset += token.code.length;
  return { line, column: end ? column + token.code.length : column, offset };
}

class AstParser {
  constructor(source) {
    this.source = typeof source === 'string' ? source : Buffer.from(source).toString('latin1');
    // Python's parser reports positions in its complete token stream (trivia
    // included).  Keep the parser convenient by skipping trivia, but retain
    // the original token position on every significant token.
    const allTokens = tokenizeLua(this.source);
    this.allTokens = allTokens;
    this.tokens = allTokens.filter((t, pos) => {
      if (['space', 'newline', 'comment'].includes(t.type)) return false;
      t.tokenPos = pos;
      return true;
    });
    this.i = 0;
  }
  peek(n = 0) { return this.tokens[this.i + n]; }
  at(type, code) { const t = this.peek(); return !!t && t.type === type && (code === undefined || t.code === code); }
  take(type, code) { if (!this.at(type, code)) return null; return this.tokens[this.i++]; }
  expect(type, code) { const t = this.take(type, code); if (!t) throw new LuaAstError(`Expected ${code || type}`); return t; }
  keyword(code) { return this.take('keyword', code); }
  symbol(code) { return this.take('symbol', code); }
  parse() {
    const first = this.peek(); const body = [];
    while (this.peek()) {
      if (this.symbol(';')) continue;
      const start = this.i;
      try { body.push(this.statement()); }
      catch (error) {
        // Python's _chunk stops at a token that cannot begin a statement and
        // leaves the residual stream for callers using parser fragments.
        const initial = this.tokens[start];
        if (!(error instanceof LuaAstError) || (error.message !== 'Expected statement' && (initial?.type === 'name' || (initial?.type === 'keyword' && !['nil', 'true', 'false'].includes(initial.code))))) throw error;
        this.i = start; break;
      }
    }
    const result = node('Chunk', { body }, first, this.tokens[this.i - 1], this.source);
    result._start_token_pos = 0;
    result._end_token_pos = this.i ? this.tokens[this.i - 1].tokenPos + 1 : 0;
    if (!Object.prototype.hasOwnProperty.call(result, 'body')) Object.defineProperty(result, 'body', { value: body, enumerable: false });
    result.storeTokenGroups(this.allTokens); return result;
  }
  statement() {
    let first = this.peek(); const prior = this.tokens[this.i - 1];
    if (first && !prior && first.tokenPos > 0) first = { ...first, actualTokenPos: first.tokenPos, tokenPos: 0 };
    else if (first && prior && first.tokenPos - prior.tokenPos > 1) first = { ...first, actualTokenPos: first.tokenPos, tokenPos: prior.tokenPos + 1 };
    if (this.keyword('return')) return node('ReturnStatement', { values: this.peek() && !this.at('symbol', ';') && !this.at('keyword', 'end') && !this.at('keyword', 'else') && !this.at('keyword', 'elseif') ? this.explist() : [] }, first, this.tokens[this.i - 1], this.source);
    if (this.keyword('break')) return node('BreakStatement', {}, first, this.tokens[this.i - 1], this.source);
    if (this.keyword('goto')) { const label = this.expect('name'); return node('GotoStatement', { label: label.code }, first, label, this.source); }
    if (this.at('label')) { const t = this.take('label'); return node('LabelStatement', { name: t.code.slice(2, -2) }, first, t, this.source); }
    if (this.keyword('do')) { const body = this.block('end'); const end = this.expect('keyword', 'end'); return node('DoStatement', { body }, first, end, this.source); }
    if (this.keyword('while')) { const condition = this.expression(); this.expect('keyword', 'do'); const body = this.block('end'); const end = this.expect('keyword', 'end'); return node('WhileStatement', { condition, body }, first, end, this.source); }
    if (this.keyword('repeat')) { const body = this.block('until'); this.expect('keyword', 'until'); const condition = this.expression(); return node('RepeatStatement', { body, condition }, first, this.tokens[this.i - 1], this.source); }
    if (this.keyword('if')) return this.ifStatement(first);
    if (this.keyword('for')) return this.forStatement(first);
    if (this.keyword('local')) return this.localStatement(first);
    if (this.keyword('function')) { const name = this.funcName(); const body = this.functionBody(); return node('FunctionStatement', { name, body }, first, this.tokens[this.i - 1], this.source); }
    let expr = this.expression();
    const targets = [expr.value && expr.type === 'ExpValue' ? expr.value : expr]; const mark = this.i;
    while (this.symbol(',')) { const target = this.expression(); targets.push(target?.type === 'ExpValue' ? target.value : target); }
    if (this.at('symbol') && ['=', '+=', '-=', '*=', '/=', '%=', '..='].includes(this.peek().code)) {
      const opToken = this.take('symbol'); const op = opToken.code;
      const values = this.explist(); const result = node('AssignmentStatement', { targets, values, operator: op }, first, this.tokens[this.i - 1], this.source); result.explist._start_token_pos = opToken.tokenPos + 1; return result;
    }
    this.i = mark;
    const call = expr.type === 'ExpValue' && expr.value instanceof Node ? expr.value : expr;
    if (!['CallExpression', 'FunctionCall', 'FunctionCallMethod'].includes(call.type)) throw new LuaAstError('Expected statement');
    const statement = node('CallStatement', { expression: call }, first, this.tokens[this.i - 1], this.source);
    return statement;
  }
  block(until) {
    let first = this.peek(); const before = this.tokens[this.i - 1]; if (first && before && first.tokenPos - before.tokenPos > 1) first = { ...first, tokenPos: before.tokenPos + 1 }; const body = [];
    while (this.peek() && !this.at('keyword', until) && !this.at('keyword', 'elseif') && !this.at('keyword', 'else')) {
      if (this.symbol(';')) continue; body.push(this.statement());
    }
    const last = this.tokens[this.i - 1] || first;
    const result = node('Chunk', { body }, first, last, this.source);
    if (!Object.prototype.hasOwnProperty.call(result, 'body')) Object.defineProperty(result, 'body', { value: body, enumerable: false });
    return result;
  }
  ifStatement(first) {
    const pairs = []; let condition = this.expression();
    // PICO-8 accepts a short form: `if (condition) statement [else
    // statement]`, with the line ending delimiting the statement.  Trivia is
    // omitted from the parser stream, so one statement is the unambiguous
    // boundary here (the upstream grammar applies the same restriction).
    const gotThen = this.keyword('then'); const gotDo = !gotThen && this.keyword('do');
    if (!gotThen && !gotDo) {
      const shortBody = this.statement();
      const body = node('Chunk', { body: [shortBody] }, { ...this.tokens[this.i - 1], tokenPos: Math.max(0, this.tokens[this.i - 1].tokenPos - 1) }, this.tokens[this.i - 1], this.source);
      Object.defineProperty(body, 'body', { value: body.stats, enumerable: false });
      pairs.push([condition, body]);
      const elseToken = this.keyword('else');
      if (elseToken) {
        const sameLine = this.peek() && this.peek().line === elseToken.line;
        const elseStat = sameLine ? this.statement() : null;
        if (elseStat) { const elseBody = node('Chunk', { body: [elseStat] }, { ...this.tokens[this.i - 1], tokenPos: Math.max(0, this.tokens[this.i - 1].tokenPos - 1) }, this.tokens[this.i - 1], this.source); Object.defineProperty(elseBody, 'body', { value: elseBody.stats, enumerable: false }); pairs.push([null, elseBody]); }
      }
      const result = node('IfStatement', { exp_block_pairs: pairs }, first, this.tokens[this.i - 1], this.source);
      Object.defineProperty(result, 'clauses', { value: pairs.filter(p => p[0]).map(p => wrapNode('IfClause', { condition: p[0], body: p[1] }, first, this.tokens[this.i - 1], this.source)), enumerable: false });
      Object.defineProperty(result, 'elseBody', { value: pairs.at(-1)?.[0] === null ? pairs.at(-1)[1] : null, enumerable: false }); return result;
    }
    if (gotDo) { const inner = condition; const outer = node('ExpValue', { value: inner }, first, this.tokens[this.i - 1], this.source); outer._start_token_pos = first.tokenPos + 1; outer._end_token_pos = inner.end_pos + 1; condition = outer; }
    let body = this.block('end'); pairs.push([condition, body]);
    while (this.keyword('elseif')) { condition = this.expression(); this.expect('keyword', 'then'); body = this.block('end'); pairs.push([condition, body]); }
    let elseBody = null; if (this.keyword('else')) { elseBody = this.block('end'); pairs.push([null, elseBody]); }
    const end = this.expect('keyword', 'end');
    const result = node('IfStatement', { exp_block_pairs: pairs }, first, end, this.source);
    // Compatibility aliases for the original JS-facing shape.
    Object.defineProperty(result, 'clauses', { value: pairs.filter(p => p[0]).map(p => wrapNode('IfClause', { condition: p[0], body: p[1] }, tokenAtOffset(this.tokens, p[0].range.start.offset, this.source), tokenAtOffset(this.tokens, p[1].range.end.offset, this.source), this.source)), enumerable: false });
    Object.defineProperty(result, 'elseBody', { value: elseBody, enumerable: false });
    return result;
  }
  forStatement(first) {
    const name = this.expect('name');
    if (this.symbol('=')) { const start = this.expression(); this.expect('symbol', ','); const finish = this.expression(); const step = this.symbol(',') ? this.expression() : null; this.expect('keyword', 'do'); const body = this.block('end'); const end = this.expect('keyword', 'end'); return node('ForNumericStatement', { name, start, finish, step, body }, first, end, this.source); }
    const names = [name]; while (this.symbol(',')) names.push(this.expect('name')); this.expect('keyword', 'in'); const values = this.explist(); this.expect('keyword', 'do'); const body = this.block('end'); const end = this.expect('keyword', 'end'); const result = node('ForInStatement', { names, values, body }, first, end, this.source); result.namelist = wrapNode('NameList', { names }, names[0], names.at(-1), this.source); result.namelist._start_token_pos = names[0].tokenPos - 1; if (result.explist) { result.explist._start_token_pos = values[0]?.start_pos ?? result.explist.start_pos; result.explist._end_token_pos = values.at(-1)?.end_pos ?? result.explist.end_pos; } return result;
  }
  localStatement(first) { if (this.keyword('function')) { const name = this.expect('name'); const body = this.functionBody(); return node('LocalFunctionStatement', { name, body }, first, this.tokens[this.i - 1], this.source); } const names = [this.expect('name')]; while (this.symbol(',')) names.push(this.expect('name')); const eq = this.symbol('=') ? this.tokens[this.i - 1] : null; const values = eq ? this.explist() : []; const result = node('LocalAssignmentStatement', { names, values }, first, this.tokens[this.i - 1], this.source); result.namelist = wrapNode('NameList', { names }, names[0], names.at(-1), this.source); result.namelist._start_token_pos = names[0].tokenPos - 1; if (eq && result.explist) result.explist._start_token_pos = eq.tokenPos + 1; return result; }
  funcName() {
    const first = this.expect('name'); const path = [first];
    while (this.symbol('.')) path.push(this.expect('name'));
    let methodname = null; if (this.symbol(':')) methodname = this.expect('name');
    const fn = node('FunctionName', { namepath: path, methodname }, first, this.tokens[this.i - 1], this.source); if (first.tokenPos > 0) fn._start_token_pos = first.tokenPos - 1;
    Object.defineProperty(fn, 'name', { value: path.map(token => token.code).join('.') + (methodname ? `:${methodname.code}` : ''), enumerable: false });
    return fn;
  }
  functionBody() {
    const first = this.expect('symbol', '('); const params = []; const paramTokens = []; let dots = null;
    if (!this.at('symbol', ')')) { if (this.symbol('...')) dots = node('VarargDots', {}, this.tokens[this.i - 1], this.tokens[this.i - 1], this.source); else { let pt = this.expect('name'); params.push(pt.code); paramTokens.push(pt); while (this.symbol(',')) { if (this.symbol('...')) { dots = node('VarargDots', {}, this.tokens[this.i - 1], this.tokens[this.i - 1], this.source); break; } pt = this.expect('name'); params.push(pt.code); paramTokens.push(pt); } } }
    this.expect('symbol', ')'); const body = this.block('end'); const end = this.expect('keyword', 'end');
    const parlist = params.length ? wrapNode('NameList', { names: paramTokens }, paramTokens[0], paramTokens.at(-1), this.source) : null;
    const result = node('FunctionBody', { parlist, dots, block: body }, first, end, this.source);
    Object.defineProperty(result, 'params', { value: params, enumerable: false }); Object.defineProperty(result, 'vararg', { value: !!dots, enumerable: false }); Object.defineProperty(result, 'body', { value: body, enumerable: false });
    return result;
  }
  explist() { const values = [this.expression()]; while (this.symbol(',')) values.push(this.expression()); return values; }
  expression(min = 0) {
    let left = this.prefix();
    const binops = new Set(['or', 'and', '==', '~=', '!=', '<', '>', '<=', '>=', '|', '^^', '&', '<<', '>>', '..', '+', '-', '*', '/', '%', '^']);
    while (this.peek() && (this.at('symbol') || this.at('keyword')) && binops.has(this.peek().code)) {
      const opToken = this.take(this.peek().type);
      const right = this.prefix();
      const binary = node('BinaryExpression', { left, operator: opToken, right }, tokenAtOffset(this.tokens, left.range.start.offset, this.source), tokenAtOffset(this.tokens, right.range.end.offset - 1, this.source), this.source);
      binary._start_token_pos = left.end_pos;
      left = binary;
    }
    return left;
  }
  prefix() {
    const first = this.peek(); const preceding = this.tokens[this.i - 1]; let value; let parenthesizedAtomic = false;
    if (this.keyword('nil')) value = node('ExpValue', { value: null }, first, first, this.source); else if (this.keyword('true') || this.keyword('false')) value = node('ExpValue', { value: this.tokens[this.i - 1].code === 'true' }, first, this.tokens[this.i - 1], this.source); else if (this.at('number')) { const t = this.take('number'); value = node('ExpValue', { value: t, numberValue: Number(t.value) }, t, t, this.source); } else if (this.at('string')) { const t = this.take('string'); value = node('ExpValue', { value: t, decoded: t.value }, t, t, this.source); } else if (this.symbol('...')) value = node('VarargDots', {}, first, first, this.source); else if (this.at('symbol') && ['-', '#', '~', '@', '%', '$'].includes(this.peek().code)) { const op = this.take('symbol'); value = node('ExpUnOp', { operator: op.code, argument: this.expression(0) }, op, this.tokens[this.i - 1], this.source); } else if (this.keyword('not')) { const op = this.tokens[this.i - 1]; value = node('ExpUnOp', { operator: 'not', argument: this.expression(10) }, op, this.tokens[this.i - 1], this.source); } else if (this.keyword('function')) value = node('ExpValue', { value: node('Function', { body: this.functionBody() }, first, this.tokens[this.i - 1], this.source) }, first, this.tokens[this.i - 1], this.source); else if (this.symbol('{')) value = node('ExpValue', { value: this.table(first) }, first, this.tokens[this.i - 1], this.source); else { if (this.symbol('(')) { const inner = this.expression(); const close = this.expect('symbol', ')'); parenthesizedAtomic = inner.type === 'ExpValue'; value = parenthesizedAtomic ? inner : node('ExpValue', { value: inner }, first, close, this.source); } else { const t = this.expect('name'); value = node('ExpValue', { value: node('NameExpression', { name: t }, t, t, this.source) }, t, t, this.source); } }
    if (value?.type === 'ExpValue' && !preceding && first.tokenPos > 0) value._start_token_pos = 0;
    else if (value?.type === 'ExpValue' && !parenthesizedAtomic && preceding && first.tokenPos - preceding.tokenPos > 1) value._start_token_pos = preceding.tokenPos + 1;
    else if (value?.type === 'ExpValue' && first?.tokenPos != null && this.tokens[this.i - 2]?.tokenPos != null && first.tokenPos - this.tokens[this.i - 2].tokenPos > 1) value._start_token_pos = this.tokens[this.i - 2].tokenPos + 1;
    if (value?.type === 'ExpUnOp' && first?.tokenPos > 0) value._start_token_pos = first.tokenPos - 1;
    if (value?.type === 'ExpValue' && value.value instanceof Node && value.value.type === 'VarName') value.value._start_token_pos = value._start_token_pos;
    const wrapped = value; let hadSuffix = false; if (value.type === 'ExpValue' && value.value instanceof Node) value = value.value;
    while (true) { if (this.symbol('[')) { hadSuffix = true; const index = this.expression(); const end = this.expect('symbol', ']'); value = node('IndexExpression', { object: value, index }, first, end, this.source); } else if (this.symbol('.')) { hadSuffix = true; const name = this.expect('name'); value = node('MemberExpression', { object: value, name }, first, name, this.source); } else if (this.symbol(':')) { hadSuffix = true; const method = this.expect('name'); const args = this.arguments(); value = node('CallExpression', { callee: value, method, args }, first, this.tokens[this.i - 1], this.source); } else if (this.at('symbol', '(') || this.at('string') || this.at('symbol', '{')) { hadSuffix = true; const args = this.arguments(); value = node('CallExpression', { callee: value, args }, first, this.tokens[this.i - 1], this.source); } else break; }
    if (!hadSuffix) value = wrapped;
    else if (['CallExpression', 'FunctionCall'].includes(value.type)) { value._start_token_pos += 1; const startPos = preceding && first.tokenPos - preceding.tokenPos > 1 ? preceding.tokenPos + 1 : first.tokenPos; value = node('ExpValue', { value }, { ...first, tokenPos: startPos }, this.tokens[this.i - 1], this.source); }
    else { const startPos = preceding && first.tokenPos - preceding.tokenPos > 1 ? preceding.tokenPos + 1 : first.tokenPos; value = node('ExpValue', { value }, { ...first, tokenPos: startPos }, this.tokens[this.i - 1], this.source); }
    return value;
  }
  arguments() {
    if (this.symbol('(')) { const open = this.tokens[this.i - 1]; const empty = this.at('symbol', ')'); const values = empty ? [] : this.explist(); const close = this.expect('symbol', ')'); return empty ? null : makeExpList(values, open, close, this.source); }
    if (this.at('symbol', '{')) { const first = this.take('symbol', '{'); return node('TableConstructor', { fields: this.table(first).fields }, first, this.tokens[this.i - 1], this.source); }
    const t = this.take('string'); return node('StringLiteral', { value: t.code, decoded: t.value }, t, t, this.source);
  }
  table(first) { const prior = this.tokens[this.i - 2]; const fields = []; while (!this.at('symbol', '}')) { let key = null, value, explicit = false, fieldStart = this.peek(); if (this.symbol('[')) { explicit = true; fieldStart = { ...this.tokens[this.i - 1], tokenPos: this.tokens[this.i - 1].tokenPos - 1 }; key = this.expression(); this.expect('symbol', ']'); this.expect('symbol', '='); value = this.expression(); } else { const f = this.expression(); fieldStart = tokenFromNode(f, this.source); value = f; if (this.symbol('=')) { key = f; value = this.expression(); } } const fieldType = key == null ? 'FieldExp' : (explicit ? 'FieldExpKey' : 'FieldNamedKey'); const fieldFields = key == null ? { exp: value } : (explicit ? { key_exp: key, exp: value } : { key_name: key?.value?.name ?? key?.name, exp: value }); fields.push(node(fieldType, fieldFields, fieldStart, this.tokens[this.i - 1], this.source)); if (!this.symbol(',') && !this.symbol(';')) break; } const end = this.expect('symbol', '}'); const result = node('TableExpression', { fields }, first, end, this.source); if (prior && first.tokenPos - prior.tokenPos > 1) result._start_token_pos = prior.tokenPos + 1; return result; }
}

function parseLua(source) { return new AstParser(source).parse(); }

function tokenAtOffset(tokens, offset, source) {
  let candidate = tokens[0];
  const lines = String(source).split(/\n/);
  for (const token of tokens) {
    let point = token.column;
    for (let i = 0; i < token.line; i++) point += lines[i].length + 1;
    if (point <= offset) candidate = token;
  }
  return candidate;
}

const PYTHON_NODE_TYPES = ['Chunk', 'StatAssignment', 'StatFunctionCall', 'StatDo', 'StatWhile', 'StatRepeat', 'StatIf', 'StatForStep', 'StatForIn', 'StatFunction', 'StatLocalFunction', 'StatLocalAssignment', 'StatGoto', 'StatLabel', 'StatBreak', 'StatReturn', 'FunctionName', 'FunctionArgs', 'VarList', 'VarName', 'VarIndex', 'VarAttribute', 'NameList', 'ExpList', 'ExpValue', 'VarargDots', 'ExpBinOp', 'ExpUnOp', 'FunctionCall', 'FunctionCallMethod', 'Function', 'FunctionBody', 'TableConstructor', 'FieldOtherThing', 'FieldNamed', 'FieldExp', 'FieldExpKey', 'FieldNamedKey'];
const NAMED_FIELDS = { Chunk:['stats'], StatAssignment:['varlist','assignop','explist'], StatFunctionCall:['functioncall'], StatDo:['block'], StatWhile:['exp','block'], StatRepeat:['block','exp'], StatIf:['exp_block_pairs'], StatForStep:['name','exp_init','exp_end','exp_step','block'], StatForIn:['namelist','explist','block'], StatFunction:['funcname','funcbody'], StatLocalFunction:['funcname','funcbody'], StatLocalAssignment:['namelist','explist'], StatGoto:['label'], StatLabel:['label'], StatReturn:['explist'], FunctionName:['namepath','methodname'], FunctionArgs:['explist'], VarList:['vars'], VarName:['name'], VarIndex:['exp_prefix','exp_index'], VarAttribute:['exp_prefix','attr_name'], NameList:['names'], ExpList:['exps'], ExpValue:['value'], VarargDots:[], ExpBinOp:['exp1','binop','exp2'], ExpUnOp:['unop','exp'], FunctionCall:['exp_prefix','args'], FunctionCallMethod:['exp_prefix','methodname','args'], Function:['funcbody'], FunctionBody:['parlist','dots','block'], TableConstructor:['fields'], FieldExp:['exp'], FieldExpKey:['key_exp','exp'], FieldNamedKey:['key_name','exp'] };
const exportsMap = { Node, LuaNode: Node, LuaAstError, parseLua, parseLuaAst: parseLua, AstParser };
for (const name of PYTHON_NODE_TYPES) {
  const Named = class extends Node {
    constructor(...args) {
      const names = NAMED_FIELDS[name] || [];
      const options = args.length === names.length + 1 && args.at(-1) && typeof args.at(-1) === 'object' && !Array.isArray(args.at(-1)) ? args.pop() : {};
      if (args.length !== names.length) throw new TypeError(`Initializer for ${name} requires ${names.length} fields, saw ${args.length}`);
      const fields = {};
      names.forEach((field, i) => { fields[field] = args[i]; });
      super(name, fields, null, null, '');
      this._start_token_pos = options.start ?? null;
      this._end_token_pos = options.end ?? null;
      for (const [key, value] of Object.entries(options)) if (key !== 'start' && key !== 'end') this[key] = value;
    }
  };
  Object.defineProperty(Named, 'name', { value: name });
  NODE_CLASS_BY_TYPE[name] = Named; exportsMap[name] = Named;
}
module.exports = Object.freeze(exportsMap);
