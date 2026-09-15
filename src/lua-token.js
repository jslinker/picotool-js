'use strict';

const TYPE_NAMES = Object.freeze({ space: 'whitespace', newline: 'newline', comment: 'comment',
  string: 'string literal', number: 'number', name: 'name', label: 'label', keyword: 'keyword', symbol: 'symbol' });

function asString(value) {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) return Buffer.from(value).toString('latin1');
  return String(value);
}

class Token {
  constructor(data, line = null, column = null) {
    this._data = asString(data);
    this.line = line;
    this.column = column;
  }

  get type() { return this.constructor.type; }
  get name() { return this.constructor.tokenName; }
  get lineno() { return this.line; }
  get charno() { return this.column; }
  get value() { return this._data; }
  get code() { return this._data; }
  set code(value) { this._data = asString(value); }
  get length() { return this.code.length; }

  equals(other) {
    if (!(other instanceof this.constructor) || other.constructor !== this.constructor) return false;
    if (this instanceof TokKeyword) return this._data.toLowerCase() === other._data.toLowerCase();
    return this._data === other._data;
  }

  matches(other) {
    if (typeof other === 'function') return this instanceof other;
    return other instanceof Token && this.equals(other);
  }

  toString() { return this.code; }
}

function tokenClass(type, tokenName) {
  return class extends Token {
    static type = type;
    static tokenName = tokenName;
  };
}

class TokSpace extends tokenClass('space', TYPE_NAMES.space) {}
class TokNewline extends tokenClass('newline', TYPE_NAMES.newline) {}
class TokComment extends tokenClass('comment', TYPE_NAMES.comment) {}

const ESCAPES = new Map(Object.entries({ a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11,
  '\\': 92, '"': 34, "'": 39, '*': 1, '#': 2, '-': 3, '|': 4, '+': 5, '^': 6 }));
const REVERSE_ESCAPES = new Map([...ESCAPES].map(([name, byte]) => [byte, name]));
for (const [byte, name] of [[0, '0'], [14, '14'], [15, '15']]) REVERSE_ESCAPES.set(byte, name);
REVERSE_ESCAPES.delete(34); REVERSE_ESCAPES.delete(39);

class TokString extends Token {
  static type = 'string';
  static tokenName = TYPE_NAMES.string;

  constructor(data, line = null, column = null, options = {}) {
    super(data, line, column);
    this.quote = options.quote ?? '"';
    this.multilineQuote = options.multilineQuote ?? null;
  }

  static fromCode(input, line = null, column = null) {
    const code = asString(input);
    const multiline = /^\[(=*)\[([\s\S]*)\]\1\]$/.exec(code);
    if (multiline) return new TokString(multiline[2], line, column, { multilineQuote: multiline[1] });
    const quote = code[0];
    let value = '';
    for (let index = 1; index < code.length - 1; index += 1) {
      if (code[index] !== '\\') { value += code[index]; continue; }
      const digits = /^\d{1,3}/.exec(code.slice(index + 1));
      if (digits) { value += String.fromCharCode(Number(digits[0])); index += digits[0].length; }
      else if (index + 1 < code.length - 1) {
        const escaped = code[++index];
        value += String.fromCharCode(ESCAPES.get(escaped) ?? escaped.charCodeAt(0));
      }
    }
    return new TokString(value, line, column, { quote });
  }

  get code() {
    if (this.multilineQuote !== null) return `[${this.multilineQuote}[${this._data}]${this.multilineQuote}]`;
    let escaped = '';
    for (const character of this._data) {
      const byte = character.charCodeAt(0);
      if (REVERSE_ESCAPES.has(byte)) escaped += `\\${REVERSE_ESCAPES.get(byte)}`;
      else if (character === this.quote) escaped += `\\${character}`;
      else escaped += character;
    }
    return `${this.quote}${escaped}${this.quote}`;
  }

  set code(value) { this._data = asString(value); }
}

class TokNumber extends tokenClass('number', TYPE_NAMES.number) {
  get value() {
    const data = this._data;
    const lower = data.toLowerCase();
    if (lower.includes('x') || lower.includes('b')) {
      const radix = lower.includes('x') ? 16 : 2;
      const [integer, fraction] = lower.split('.');
      const whole = Number.parseInt(integer.slice(2) || '0', radix);
      return fraction === undefined ? whole : whole + Number.parseInt(fraction, radix) / (radix ** fraction.length);
    }
    return Number(data);
  }
}
class TokName extends tokenClass('name', TYPE_NAMES.name) {}
class TokLabel extends tokenClass('label', TYPE_NAMES.label) {}
class TokKeyword extends tokenClass('keyword', TYPE_NAMES.keyword) {}
class TokSymbol extends tokenClass('symbol', TYPE_NAMES.symbol) {}

const TOKEN_CLASSES = Object.freeze({ space: TokSpace, newline: TokNewline, comment: TokComment,
  string: TokString, number: TokNumber, name: TokName, label: TokLabel, keyword: TokKeyword, symbol: TokSymbol });

function createToken(type, code, line, column) {
  const TokenType = TOKEN_CLASSES[type];
  if (!TokenType) throw new TypeError(`Unknown Lua token type: ${type}`);
  return type === 'string' ? TokString.fromCode(code, line, column) : new TokenType(code, line, column);
}

module.exports = Object.freeze({ Token, TokSpace, TokNewline, TokComment, TokString, TokNumber,
  TokName, TokLabel, TokKeyword, TokSymbol, TOKEN_CLASSES, createToken });
