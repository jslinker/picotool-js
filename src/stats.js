'use strict';

const base = { ...require('./picotool'), ...require('./sections'), ...require('./p8png') };
const { analyzeLua, tokenizeLua, echoLua } = require('./lua-lexer');
const { validateLua } = require('./lua-parser');

function cartridgeStats(source) {
  const parsed = source?.format === 'p8' ? source : base.parseP8(source);
  const lua = base.encodeP8scii((parsed.sections.lua || []).join(''));
  const diagnostics = analyzeLua(lua);
  validateLua(lua);
  const tokens = tokenizeLua(lua);
  const comment = (index) => tokens[index]?.type === 'comment'
    ? Buffer.from(tokens[index].code.slice(2).replace(/^[\x09-\x0d\x20]+|[\x09-\x0d\x20]+$/g, ''), 'latin1') : null;
  return {
    title: comment(0), byline: comment(2), version: parsed.version,
    characterCount: diagnostics.characterCount, tokenCount: diagnostics.tokenCount,
    lineCount: tokens.filter((token) => token.type === 'newline').length,
    compressedSize: base.compressCode(echoLua(lua)).length,
  };
}

module.exports = Object.freeze({ cartridgeStats });
