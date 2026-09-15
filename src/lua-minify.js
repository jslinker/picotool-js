'use strict';

const base = require('./picotool');
const { tokenizeLua } = require('./lua-lexer');
const { validateLua } = require('./lua-parser');
const BUILTINS = require('./lua-builtins');

const KEYWORDS = new Set('and break do else elseif end false for function goto if in local nil not or repeat return then true until while'.split(' '));
const PRESERVED = new Set([...KEYWORDS, ...BUILTINS]);

function minifyLua(source, options = {}) {
  const bytes = typeof source === 'string' ? base.encodeP8scii(source) : source;
  validateLua(bytes);
  const tokens = tokenizeLua(bytes), names = new Map();
  let nextNameId = 0, lastWasNameKeywordNumber = false, lastWasNewline = true;
  let seenHeaderComments = 0, seenNonComment = false, output = '';
  const kept = new Set(options.keepNames || []);
  function nameForId(id) { return (id >= 26 ? nameForId(Math.floor(id / 26)) : '') + String.fromCharCode(97 + id % 26); }
  function shortName(name) {
    if (options.keepAllNames || PRESERVED.has(name) || kept.has(name)) return name;
    if (!names.has(name)) {
      let candidate;
      do { candidate = nameForId(nextNameId); nextNameId += 1; } while (PRESERVED.has(candidate));
      names.set(name, candidate);
    }
    return names.get(name);
  }
  for (const token of tokens) {
    if (!seenNonComment && !['comment', 'space', 'newline'].includes(token.type)) seenNonComment = true;
    if (!seenNonComment && seenHeaderComments < 2 && token.type === 'comment') {
      seenHeaderComments += 1; output += `${token.code}\n`; continue;
    }
    if (token.type === 'comment' || token.type === 'space') continue;
    if (token.type === 'newline') {
      lastWasNameKeywordNumber = false;
      if (!lastWasNewline) output += '\n';
      lastWasNewline = true;
    } else if (token.type === 'name' || token.type === 'keyword' || token.type === 'number') {
      if (lastWasNameKeywordNumber) output += ' ';
      lastWasNameKeywordNumber = true; lastWasNewline = false;
      output += token.type === 'name' ? shortName(token.code) : token.code;
    } else if (token.type === 'label') {
      lastWasNameKeywordNumber = false; lastWasNewline = false;
      output += `::${shortName(token.code.slice(2, -2))}::`;
    } else {
      lastWasNameKeywordNumber = [')', ']', '}'].includes(token.code);
      lastWasNewline = false; output += token.code;
    }
  }
  return Buffer.from(output, 'latin1');
}

module.exports = Object.freeze({ minifyLua });
