'use strict';

const { tokenizeLua } = require('./lua-lexer');
const BINOPS = new Set('& | ^^ << >> >>> <<> >>< \\ < > <= >= ~= != == .. + - * / % ^ and or'.split(' '));
const UNOPS = new Set('- # ~ @ % $ not'.split(' '));
const ASSIGNOPS = new Set('= += -= *= /= %= ..='.split(' '));

class ParserError extends SyntaxError {
  constructor(message, token) {
    super(token ? `${message} at line ${token.line + 1} char ${token.column}` : `${message} at end of file`);
    this.name = 'ParserError';
  }
}

class Parser {
  constructor(tokens) { this.tokens = tokens; this.pos = 0; this.maxPos = null; }
  peek() { return this.tokens[this.pos]; }
  accept(type, value) {
    const start = this.pos;
    while (this.peek() && ['space', 'newline', 'comment'].includes(this.peek().type)
      && !(this.peek().type === type && (value === undefined || this.peek().value === value))) this.pos += 1;
    const token = this.peek();
    if (token && (this.maxPos === null || this.pos < this.maxPos)
      && token.type === type && (value === undefined || token.value === value)) {
      this.pos += 1; return token;
    }
    this.pos = start; return null;
  }
  symbol(value) { return this.accept('symbol', value); }
  keyword(value) { return this.accept('keyword', value); }
  expect(type, value) {
    const token = this.accept(type, value);
    if (token) return token;
    throw new ParserError(value === undefined ? `Expected ${type}` : `Expected b'${value}'`, this.peek());
  }
  require(value, message) {
    if (value !== null && value !== undefined && value !== false) return value;
    throw new ParserError(message, this.peek());
  }
  chunk() {
    while (true) {
      while (this.symbol(';')) { /* separators */ }
      if (!this.stat()) break;
    }
    while (this.symbol(';')) { /* separators */ }
    if (this.keyword('break')) { /* laststat */ }
    else if (this.keyword('return')) this.explist();
    while (this.symbol(';')) { /* separators */ }
    return true;
  }
  stat() {
    const start = this.pos;
    if (this.varlist()) {
      const op = this.accept('symbol');
      if (op && ASSIGNOPS.has(op.value)) {
        this.require(this.explist(), 'Expected expression in assignment'); return true;
      }
    }
    this.pos = start;
    if (this.functioncall()) return true;
    this.pos = start;
    if (this.keyword('do')) { this.chunk(); this.expect('keyword', 'end'); return true; }
    if (this.keyword('while')) {
      this.require(this.exp(), 'exp in while'); this.expect('keyword', 'do'); this.chunk(); this.expect('keyword', 'end'); return true;
    }
    if (this.keyword('repeat')) {
      this.chunk(); this.expect('keyword', 'until'); this.require(this.exp(), 'expression in repeat'); return true;
    }
    if (this.keyword('if')) {
      this.exp();
      const afterCondition = this.pos;
      if (!this.keyword('then') && !this.keyword('do') && this.tokens[afterCondition - 1]?.value === ')') {
        let lineEnd = afterCondition;
        while (lineEnd < this.tokens.length && this.tokens[lineEnd].type !== 'newline') lineEnd += 1;
        this.maxPos = lineEnd;
        try {
          this.chunk();
          if (this.keyword('else')) this.chunk();
        } finally { this.maxPos = null; }
        return true;
      }
      this.pos = afterCondition;
      if (!this.keyword('do')) this.expect('keyword', 'then');
      this.chunk();
      while (this.keyword('elseif')) { this.exp(); this.expect('keyword', 'then'); this.chunk(); }
      if (this.keyword('else')) this.chunk();
      this.expect('keyword', 'end'); return true;
    }
    if (this.keyword('for')) {
      const forStart = this.pos;
      this.accept('name');
      if (this.symbol('=')) {
        this.require(this.exp(), 'exp-init in for'); this.expect('symbol', ',');
        this.require(this.exp(), 'exp-end in for');
        if (this.symbol(',')) this.require(this.exp(), 'exp-step in for');
      } else {
        this.pos = forStart;
        this.require(this.namelist(), 'namelist in for-in');
        this.expect('keyword', 'in'); this.require(this.explist(), 'explist in for-in');
      }
      this.expect('keyword', 'do'); this.chunk(); this.expect('keyword', 'end'); return true;
    }
    if (this.keyword('function')) {
      this.require(this.funcname(), 'funcname in function'); this.require(this.funcbody(), 'funcbody in function'); return true;
    }
    if (this.keyword('local')) {
      if (this.keyword('function')) {
        this.expect('name'); this.require(this.funcbody(), 'funcbody in local function'); return true;
      }
      this.require(this.namelist(), 'namelist in local assignment');
      if (this.symbol('=')) this.require(this.explist(), 'explist in local assignment');
      return true;
    }
    if (this.keyword('goto')) { this.expect('name'); return true; }
    if (this.accept('label')) return true;
    this.pos = start; return null;
  }
  funcname() {
    if (!this.accept('name')) return null;
    while (this.symbol('.')) this.expect('name');
    if (this.symbol(':')) this.expect('name');
    return true;
  }
  namelist() {
    if (!this.accept('name')) return null;
    let last = this.pos;
    while (this.symbol(',')) {
      if (!this.accept('name')) { this.pos = last; break; }
      last = this.pos;
    }
    return true;
  }
  varlist() {
    if (!this.variable()) return null;
    while (this.symbol(',')) this.require(this.variable(), 'var in varlist');
    return true;
  }
  variable() {
    const start = this.pos, prefix = this.prefixexp();
    if (prefix && prefix.variable) return true;
    this.pos = start; return null;
  }
  explist() {
    const start = this.pos;
    if (!this.exp()) { this.pos = start; return null; }
    while (this.symbol(',')) this.require(this.exp(), 'exp after comma');
    return true;
  }
  exp() {
    if (!this.term()) return null;
    while (true) {
      const start = this.pos, op = this.accept('symbol') || this.accept('keyword');
      if (!op || !BINOPS.has(op.value)) { this.pos = start; break; }
      this.require(this.term(), 'exp2 in binop');
    }
    return true;
  }
  term() {
    for (const value of ['nil', 'false', 'true']) if (this.keyword(value)) return true;
    if (this.accept('number') || this.accept('string') || this.symbol('...')) return true;
    if (this.keyword('function')) { this.require(this.funcbody(), 'funcbody in function'); return true; }
    if (this.prefixexp() || this.table()) return true;
    const start = this.pos, op = this.accept('symbol') || this.accept('keyword');
    if (op && UNOPS.has(op.value)) { this.require(this.exp(), 'exp after unary op'); return true; }
    this.pos = start; return null;
  }
  prefixexp() {
    let variable = false;
    if (this.accept('name')) variable = true;
    else if (this.symbol('(')) { this.exp(); this.expect('symbol', ')'); }
    else return null;
    while (true) {
      if (this.symbol('[')) { this.require(this.exp(), 'exp in prefixexp index'); this.expect('symbol', ']'); variable = true; }
      else if (this.symbol('.')) { this.expect('name'); variable = true; }
      else if (this.args()) variable = false;
      else if (this.symbol(':')) { this.expect('name'); this.require(this.args(), 'args for method call'); variable = false; }
      else break;
    }
    return { variable };
  }
  functioncall() {
    const start = this.pos, result = this.prefixexp();
    if (result && !result.variable) return true;
    this.pos = start; return null;
  }
  args() {
    if (this.symbol('(')) { this.explist(); this.expect('symbol', ')'); return true; }
    return this.table() || Boolean(this.accept('string'));
  }
  funcbody() {
    if (!this.symbol('(')) return null;
    const names = this.namelist();
    if (names) { if (this.symbol(',')) this.expect('symbol', '...'); }
    else this.symbol('...');
    this.expect('symbol', ')'); this.chunk(); this.expect('keyword', 'end'); return true;
  }
  table() {
    if (!this.symbol('{')) return null;
    this.field();
    while (this.symbol(',') || this.symbol(';')) if (!this.field()) break;
    this.expect('symbol', '}'); return true;
  }
  field() {
    const start = this.pos;
    if (this.symbol('[')) {
      this.require(this.exp(), 'exp key in field'); this.expect('symbol', ']'); this.expect('symbol', '=');
      this.require(this.exp(), 'exp value in field'); return true;
    }
    if (this.accept('name') && this.symbol('=')) { this.require(this.exp(), 'exp value in field'); return true; }
    this.pos = start; return this.exp();
  }
}

function validateLua(source) { new Parser(tokenizeLua(source)).chunk(); }

module.exports = Object.freeze({ ParserError, validateLua });
