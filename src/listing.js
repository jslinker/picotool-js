'use strict';

const base = require('./picotool');
const { echoLua, tokenizeLua } = require('./lua-lexer');
const { pureLua } = require('./lua-pure');

function friendly(bytes) {
  return Buffer.from(bytes).toString('latin1').replace(/[\x80-\xff]/g, '_');
}

function lines(bytes) {
  return Buffer.from(bytes).toString('latin1').match(/[^\n]*\n|[^\n]+$/g) || [];
}

function listLua(source, { pure = false, showLineNumbers = false } = {}) {
  const parsed = source?.format === 'p8' ? source : base.parseP8(source);
  const lua = base.encodeP8scii((parsed.sections.lua || []).join(''));
  const output = pure ? pureLua(lua) : echoLua(lua);
  return lines(output).map((line, index) => `${showLineNumbers ? `${index}: ` : ''}${friendly(Buffer.from(line, 'latin1'))}`).join('') + '\n';
}

function pythonFloat(value) {
  const number = Number(value);
  return Number.isInteger(number) ? `${number}.0` : String(number);
}

function stringValue(value) {
  const multiline = /^\[(=*)\[([\s\S]*)\]\1\]$/.exec(value);
  if (multiline) return multiline[2];
  if (value[0] !== '"' && value[0] !== "'") return value;
  let result = '';
  for (let index = 1; index < value.length - 1; index += 1) {
    if (value[index] !== '\\') { result += value[index]; continue; }
    const digits = /^\d{1,3}/.exec(value.slice(index + 1));
    if (digits) { result += String.fromCharCode(Number(digits[0])); index += digits[0].length; continue; }
    const escapes = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '*': 1, '#': 2, '-': 3, '|': 4, '+': 5, '^': 6 };
    const escaped = value[++index];
    result += String.fromCharCode(escapes[escaped] ?? escaped.charCodeAt(0));
  }
  return result;
}

function pythonBytesRepr(value) {
  const bytes = Buffer.from(value, 'latin1');
  const hasSingle = bytes.includes(39), hasDouble = bytes.includes(34);
  const quote = hasSingle && !hasDouble ? '"' : "'";
  let output = 'b' + quote;
  for (const byte of bytes) {
    if (byte === 92) output += '\\\\';
    else if (byte === quote.charCodeAt(0)) output += `\\${quote}`;
    else if (byte === 9) output += '\\t';
    else if (byte === 10) output += '\\n';
    else if (byte === 13) output += '\\r';
    else if (byte >= 32 && byte <= 126) output += String.fromCharCode(byte);
    else output += `\\x${byte.toString(16).padStart(2, '0')}`;
  }
  return output + quote;
}

/** Reproduce picotool's listtokens presentation for a single cartridge. */
function listTokens(source) {
  const parsed = source?.format === 'p8' ? source : base.parseP8(source);
  const lua = base.encodeP8scii((parsed.sections.lua || []).join(''));
  let position = 0, output = '';
  for (const token of tokenizeLua(lua)) {
    if (token.type === 'newline') output += '\n';
    else if (token.type === 'space' || token.type === 'comment') output += `<${pythonBytesRepr(token.value)}>`;
    else {
      const value = token.type === 'number' ? pythonFloat(token.value)
        : token.type === 'string' ? stringValue(token.value) : token.value;
      output += `<${position}:${token.type === 'number' ? value : pythonBytesRepr(value)}>`;
      position += 1;
    }
  }
  return `${output}\n`;
}

module.exports = Object.freeze({ listLua, listTokens });
