'use strict';

const { encodeP8scii } = require('./picotool');
const { tokenizeLua } = require('./lua-lexer');
const { validateLua } = require('./lua-parser');

function pureLua(source) {
  const bytes = typeof source === 'string' ? encodeP8scii(source) : Buffer.from(source);
  validateLua(bytes);
  const output = [];
  let line = [];
  function emit(tokens) {
    if (!tokens.length) return '';
    const ended = tokens.at(-1).type === 'newline';
    if (ended) tokens = tokens.slice(0, -1);
    if (!tokens.length) return '\n';
    tokens = tokens.map((token) => ({ type: token.type, code: token.code }));
    const find = (type, value, start = 0) => tokens.findIndex((token, index) => index >= start && token.type === type && token.code === value);
    const nextNonspace = (start = 0) => {
      let index = start;
      while (tokens[index]?.type === 'space') index += 1;
      return index < tokens.length ? index : -1;
    };
    if (tokens.at(-1).type === 'comment' && tokens.at(-1).code.startsWith('//')) {
      tokens.at(-1).code = `--${tokens.at(-1).code.slice(2)}`;
    }
    const printAt = find('name', '?');
    if (printAt >= 0) {
      tokens[printAt].code = 'print';
      tokens.splice(printAt + 1, 0, { type: 'symbol', code: '(' });
      tokens.push({ type: 'symbol', code: ')' });
    }
    const ifAt = find('keyword', 'if');
    if (ifAt >= 0) {
      const left = find('symbol', '(', ifAt + 1);
      const right = left < 0 ? -1 : find('symbol', ')', left + 1);
      const thenAt = right < 0 ? -1 : nextNonspace(right + 1);
      if (thenAt >= 0 && !['then', 'and', 'or'].includes(tokens[thenAt].code)) {
        tokens.splice(right + 1, 0, { type: 'space', code: ' ' },
          { type: 'keyword', code: 'then' }, { type: 'space', code: ' ' });
        tokens.push({ type: 'space', code: ' ' }, { type: 'keyword', code: 'end' });
      }
    }
    const first = nextNonspace();
    if (first >= 0 && tokens[first].type === 'name') {
      const assign = nextNonspace(first + 1);
      const symbol = tokens[assign]?.code;
      if (['+=', '-=', '*=', '/=', '%='].includes(symbol)) {
        tokens.splice(assign, 1, { type: 'symbol', code: '=' }, { type: 'space', code: ' ' },
          { type: 'name', code: tokens[first].code }, { type: 'space', code: ' ' },
          { type: 'symbol', code: symbol[0] }, { type: 'space', code: ' ' });
      }
    }
    const notEqual = find('symbol', '!=');
    if (notEqual >= 0) tokens[notEqual].code = '~=';
    return `${tokens.map((token) => token.code).join('')}\n`;
  }
  for (const token of tokenizeLua(bytes)) {
    line.push(token);
    if (token.type === 'newline') { output.push(emit(line)); line = []; }
  }
  if (line.length) output.push(emit(line));
  return Buffer.from(output.join(''), 'latin1');
}

module.exports = Object.freeze({ pureLua });
