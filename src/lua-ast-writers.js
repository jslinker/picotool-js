'use strict';

const { encodeP8scii } = require('./picotool');
const { tokenizeLua, echoLua } = require('./lua-lexer');
const { validateLua } = require('./lua-parser');
const BUILTINS = require('./lua-builtins');

const KEYWORDS = new Set('and break do else elseif end false for function goto if in local nil not or repeat return then true until while'.split(' '));
const PRESERVED = new Set([...KEYWORDS, ...BUILTINS]);
const asBytes = (source) => typeof source === 'string' ? encodeP8scii(source) : Buffer.from(source);

function checkAstInput(bytes) {
  if (bytes.length && bytes.at(-1) !== 10) {
    const error = new Error('list index out of range'); error.name = 'IndexError'; throw error;
  }
}

function echoLuaAst(source) {
  const bytes = asBytes(source);
  validateLua(bytes);
  checkAstInput(bytes);
  return echoLua(bytes);
}

function minifyLuaAst(source) {
  const bytes = asBytes(source);
  validateLua(bytes);
  checkAstInput(bytes);
  const tokens = tokenizeLua(bytes), names = new Map();
  let nextId = 0, output = '', spacing = '', tableDepth = 0;
  function nameForId(id) { return (id >= 26 ? nameForId(Math.floor(id / 26)) : '') + String.fromCharCode(97 + id % 26); }
  function shortName(name) {
    if (PRESERVED.has(name)) return name;
    if (!names.has(name)) {
      let candidate;
      do { candidate = nameForId(nextId++); } while (PRESERVED.has(candidate));
      names.set(name, candidate);
    }
    return names.get(name);
  }
  function flushSpace() {
    if (!output) { spacing = ''; return; }
    let value = spacing.replace(/\t/g, ' ').replace(/\n +/g, '\n').replace(/ +\n/g, '\n')
      .replace(/ {2,}/g, ' ').replace(/\n{2,}/g, '\n');
    output += value; spacing = '';
  }
  for (const token of tokens) {
    if (token.type === 'comment') continue;
    if (token.type === 'space' || token.type === 'newline') { spacing += token.value; continue; }
    flushSpace();
    if (token.value === '{') tableDepth += 1;
    if (token.value === '}') tableDepth -= 1;
    if (token.value === ';' && tableDepth === 0) { output += ' '; continue; }
    output += token.type === 'name' ? shortName(token.value)
      : token.type === 'label' ? `::${shortName(token.value.slice(2, -2))}::` : token.value;
  }
  return Buffer.from(output.trimEnd(), 'latin1');
}

function formatLuaAst(source, { indentwidth = 2 } = {}) {
  const bytes = asBytes(source);
  validateLua(bytes);
  checkAstInput(bytes);
  const tokens = tokenizeLua(bytes);
  let output = '', spacing = '', level = 0, functionParams = false;
  const sym = (token, value) => token.type === 'symbol' && token.value === value;
  const key = (token, value) => token.type === 'keyword' && token.value === value;
  for (const token of tokens) {
    if (token.type === 'space' || token.type === 'newline') { spacing += token.value; continue; }
    if (token.type === 'comment' && output && !spacing.includes('\n')) spacing = '  ';
    if (key(token, 'end') || key(token, 'until') || key(token, 'else') || key(token, 'elseif')
      || sym(token, ')') || sym(token, '}')) level -= 1;
    if (spacing) {
      let value = spacing.replace(/\t/g, ' ').replace(/\r\n|\n\r|\r/g, '\n').replace(/ +\n/g, '\n');
      if (output) value = value.replace(/^ *--/, '  --');
      value = value.replace(/\n *--/g, `\n${' '.repeat(Math.max(0, level * indentwidth))}--`);
      if (!output) value = value.replace(/^ *--/, '--');
      value = value.replace(/\n *$/, `\n${' '.repeat(Math.max(0, level * indentwidth))}`);
      if (!output) value = value.replace(/^ *$/, '');
      output += value.replace(/\n{3,}/g, '\n\n');
      spacing = '';
    }
    output += token.value;
    if (functionParams && sym(token, ')')) { functionParams = false; level += 1; }
    if (key(token, 'function')) functionParams = true;
    if (key(token, 'then') || key(token, 'do') || key(token, 'repeat') || key(token, 'else')
      || sym(token, '(') || sym(token, '{')) level += 1;
  }
  output += spacing.replace(/\t/g, ' ').replace(/\r\n|\n\r|\r/g, '\n').replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n').replace(/[ \n]+$/, '\n');
  if (!output.endsWith('\n')) output += '\n';
  return Buffer.from(output, 'latin1');
}

module.exports = Object.freeze({ echoLuaAst, minifyLuaAst, formatLuaAst });
