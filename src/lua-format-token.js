'use strict';

const { encodeP8scii } = require('./picotool');
const { tokenizeLua } = require('./lua-lexer');
const { validateLua } = require('./lua-parser');

function formatLuaTokens(source, { indentwidth = 2 } = {}) {
  const bytes = typeof source === 'string' ? encodeP8scii(source) : Buffer.from(source);
  validateLua(bytes);
  const tokens = tokenizeLua(bytes);
  let indentLevel = 0;
  let spaceBuffer = '';
  let inFunction = false;
  let previous = null;
  let output = '';
  const symbol = (token, ...codes) => token?.type === 'symbol' && codes.includes(token.code);
  const keyword = (token, ...codes) => token?.type === 'keyword' && codes.includes(token.code);
  for (const token of tokens) {
    if (token.type === 'newline' || token.type === 'space') { spaceBuffer += token.code; continue; }
    if (symbol(token, ')', '}', ']') || keyword(token, 'end', 'until', 'elseif', 'else')) indentLevel -= 1;
    const newlineCount = (spaceBuffer.match(/\n/g) || []).length;
    spaceBuffer = '';
    if (newlineCount) {
      if (newlineCount > 1) output += '\n';
      output += `\n${' '.repeat(Math.max(0, indentLevel * indentwidth))}`;
    } else if (token.type === 'comment') output += '  ';
    else if (!(symbol(token, ',', ';', ')', ']', '}', '..')
      || symbol(previous, '(', '[', '{', '..')
      || (keyword(previous, 'function') && symbol(token, '('))
      || previous === null)) output += ' ';
    previous = token;
    output += token.code;
    if (inFunction && symbol(token, ')')) { inFunction = false; indentLevel += 1; }
    if (keyword(token, 'function')) inFunction = true;
    if (symbol(token, '(', '{', '[') || keyword(token, 'do', 'repeat', 'then', 'else')) indentLevel += 1;
  }
  return Buffer.from(`${output}\n`, 'latin1');
}

module.exports = Object.freeze({ formatLuaTokens });
