'use strict';

const tokensApi = require('./lua-token');

const KEYWORDS = new Set('and break do else elseif end false for function goto if in local nil not or repeat return then true until while'.split(' '));
const EXEMPT_SYMBOLS = new Set([':', '.', ')', ']', '}']);
const ESCAPES = new Map(Object.entries({ a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11,
  '\\': 92, '"': 34, "'": 39, '*': 1, '#': 2, '-': 3, '|': 4, '+': 5, '^': 6 }));
const REVERSE_ESCAPES = new Map([...ESCAPES].map(([name, byte]) => [byte, name]));
for (const [byte, name] of [[0, '0'], [14, '14'], [15, '15']]) REVERSE_ESCAPES.set(byte, name);
REVERSE_ESCAPES.delete(34); REVERSE_ESCAPES.delete(39);
const SYMBOLS = ['+=', '-=', '*=', '/=', '%=', '..=', '==', '~=', '!=', '<=', '>=', '<<>', '>>>', '>><', '<<', '>>', '^^', '...', '..', '&', '|', '~', '\\', '+', '-', '*', '/', '%', '^', '#', '@', '$', '<', '>', '=', '(', ')', '{', '}', '[', ']', ';', ':', ',', '.'];
const NUMBER_PATTERNS = [
  /^0[xX][0-9a-fA-F]+(?:\.[0-9a-fA-F]+)?/,
  /^0[xX]\.[0-9a-fA-F]+/,
  /^0[bB][01]+(?:\.[01]+)?/,
  /^0[bB]\.[01]+/,
  /^[0-9]+(?:\.(?!\.)[0-9]*)?(?:[eE]-?[0-9]+)?/,
  /^\.[0-9]+(?:[eE]-?[0-9]+)?/,
];

class LexerError extends SyntaxError {
  constructor(message, line, column) {
    super(`${message} at line ${line} char ${column}`);
    this.name = 'LexerError';
  }
}

function position(code, index) {
  const before = code.slice(0, index), lines = before.split('\n');
  return [lines.length - 1, lines.at(-1).length];
}

function canonicalQuotedCode(code, start, end) {
  const quote = code[start]; let output = quote;
  for (let index = start + 1; index < end; index += 1) {
    let byte = code.charCodeAt(index);
    if (byte === 92 && index + 1 < end) {
      const digits = /^\d{1,3}/.exec(code.slice(index + 1, end));
      if (digits) { byte = Number(digits[0]); index += digits[0].length; }
      else if (code[index + 1] === '\n') { byte = 10; index += 1; }
      else if (ESCAPES.has(code[index + 1])) { byte = ESCAPES.get(code[index + 1]); index += 1; }
    }
    if (byte === quote.charCodeAt(0)) output += `\\${quote}`;
    else if (REVERSE_ESCAPES.has(byte)) output += `\\${REVERSE_ESCAPES.get(byte)}`;
    else output += String.fromCharCode(byte);
  }
  return `${output}${quote}`;
}

function scanLua(source, filename) {
  const bytes = Buffer.from(source);
  const code = bytes.toString('latin1');
  let tokenCount = 0;
  let characterCount = 0;
  let index = 0;
  const replacements = [];
  const tokens = [];
  function add(type, value, offset = index) {
    const [line, column] = position(code, offset);
    tokens.push(tokensApi.createToken(type, value, line, column));
  }
  while (index < code.length) {
    const rest = code.slice(index);
    let match;
    if ((match = /^(?:\r\n|[\r\n])/.exec(rest)) || (match = /^[ \t]+/.exec(rest))) {
      add(match[0][0] === '\r' || match[0][0] === '\n' ? 'newline' : 'space', match[0]);
      characterCount += match[0].length; index += match[0].length; continue;
    }
    if (rest.startsWith('--[[')) {
      const end = code.indexOf(']]', index + 4);
      if (end < 0) throw new LexerError('Unterminated multiline comment', ...position(code, index));
      add('comment', code.slice(index, end + 2));
      characterCount += end + 2 - index; index = end + 2; continue;
    }
    if ((match = /^\[(=*)\[/.exec(rest))) {
      const closing = `]${match[1]}]`, end = code.indexOf(closing, index + match[0].length);
      if (end < 0) throw new LexerError('Unterminated multiline string', ...position(code, index));
      add('string', code.slice(index, end + closing.length));
      characterCount += end + closing.length - index; index = end + closing.length; tokenCount += 1; continue;
    }
    if (rest[0] === '\'' || rest[0] === '"') {
      const quote = rest[0]; let end = index + 1;
      for (; end < code.length; end += 1) {
        if (code[end] === '\\') { end += 1; continue; }
        if (code[end] === quote) break;
      }
      if (end >= code.length) throw new LexerError('Unterminated string', ...position(code, index));
      const canonical = canonicalQuotedCode(code, index, end);
      add('string', canonical);
      replacements.push([index, end + 1, canonical]);
      characterCount += canonical.length; index = end + 1; tokenCount += 1; continue;
    }
    if ((match = /^(?:--|\/\/)[^\r\n]*/.exec(rest))) {
      add('comment', match[0]);
      characterCount += match[0].length; index += match[0].length; continue;
    }
    if ((match = /^::[a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*::/.exec(rest))) {
      add('label', match[0]);
      characterCount += match[0].length; index += match[0].length; tokenCount += 1; continue;
    }
    let number;
    for (const pattern of NUMBER_PATTERNS) if ((number = pattern.exec(rest))) break;
    if (number) {
      add('number', number[0]);
      characterCount += number[0].length; index += number[0].length;
      tokenCount += number[0].includes('e') ? 2 : 1; continue;
    }
    if ((match = /^[a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*/.exec(rest))) {
      add(KEYWORDS.has(match[0]) ? 'keyword' : 'name', match[0]);
      characterCount += match[0].length; index += match[0].length;
      if (!KEYWORDS.has(match[0]) || !new Set(['local', 'end']).has(match[0])) tokenCount += 1;
      continue;
    }
    const symbol = SYMBOLS.find((candidate) => rest.startsWith(candidate));
    if (symbol) {
      add('symbol', symbol);
      characterCount += symbol.length; index += symbol.length;
      if (!EXEMPT_SYMBOLS.has(symbol)) tokenCount += 1;
      continue;
    }
    if (rest[0] === '?') { add('name', '?'); characterCount += 1; index += 1; tokenCount += 1; continue; }
    const [line, column] = position(code, index);
    throw new LexerError(`Syntax error (remaining:b'${rest}')`, line + 1, column + 1);
  }
  const warnings = [];
  const prefix = filename ? `${filename}: ` : '';
  if (characterCount > 65535) warnings.push(`${prefix}warning: character count ${characterCount} exceeds the PICO-8 limit of 65535`);
  if (tokenCount > 8192) warnings.push(`${prefix}warning: token count ${tokenCount} exceeds the PICO-8 limit of 8192`);
  let cursor = 0, echo = '';
  for (const [start, end, replacement] of replacements) {
    echo += code.slice(cursor, start) + replacement;
    cursor = end;
  }
  echo += code.slice(cursor);
  return { characterCount, tokenCount, warnings, echo, tokens };
}

function analyzeLua(source, filename) {
  const { characterCount, tokenCount, warnings } = scanLua(source, filename);
  return { characterCount, tokenCount, warnings };
}

function echoLua(source) { return Buffer.from(scanLua(source).echo, 'latin1'); }
function tokenizeLua(source) { return scanLua(source).tokens; }

module.exports = Object.freeze({ analyzeLua, echoLua, tokenizeLua, LexerError, ...tokensApi });
