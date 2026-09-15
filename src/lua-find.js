'use strict';

const base = require('./picotool');
const { echoLua } = require('./lua-lexer');
const { validateLua } = require('./lua-parser');

function friendly(value) {
  return Buffer.from(value, 'latin1').toString('latin1').replace(/[\x80-\xff]/g, '_');
}

/** Search validated Lua lines using the behavior luafind was intended to have. */
function findLua(source, pattern, { filename = '<cartridge>', listFiles = false } = {}) {
  const parsed = source?.format === 'p8' ? source : base.parseP8(source);
  const lua = base.encodeP8scii((parsed.sections.lua || []).join(''));
  validateLua(lua);
  const code = Buffer.from(echoLua(lua)).toString('latin1');
  const lines = code.match(/[^\n]*\n|[^\n]+$/g) || [];
  const expression = pattern instanceof RegExp
    ? new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ''))
    : new RegExp(pattern);
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!expression.test(lines[index])) continue;
    if (listFiles) return `${filename}\n`;
    matches.push(`${filename}:${index + 1}:${friendly(lines[index])}`);
  }
  return matches.join('');
}

module.exports = Object.freeze({ findLua });
