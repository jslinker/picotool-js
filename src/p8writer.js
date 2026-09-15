'use strict';

const base = { ...require('./picotool'), ...require('./sections') };
const { analyzeLua, echoLua } = require('./lua-lexer');
const { validateLua } = require('./lua-parser');
const { minifyLua } = require('./lua-minify');
const { formatLuaTokens } = require('./lua-format-token');
const { echoLuaAst, minifyLuaAst, formatLuaAst } = require('./lua-ast-writers');

  /** Serialize a parsed text cartridge using picotool's default echo writer layout. */
  function writeP8WithDiagnostics(source, options = {}) {
    const parsed = source?.format === 'p8' ? source : base.parseP8(source);
    const sections = parsed.sections;
    const version = parsed.version;
    const gfx = sections.gfx ? base.Gfx.fromLines(sections.gfx, version) : base.Gfx.empty(version);
    const gff = sections.gff ? base.Gff.fromLines(sections.gff, version) : base.Gff.empty(version);
    const map = sections.map ? base.MapSection.fromLines(sections.map, version, gfx) : base.MapSection.empty(version, gfx);
    const sfx = sections.sfx ? base.Sfx.fromLines(sections.sfx, version) : base.Sfx.empty(version);
    const music = sections.music ? base.Music.fromLines(sections.music, version) : base.Music.empty(version);
    const label = sections.label ? base.Gfx.fromLines(sections.label, version) : null;
    const sourceLua = base.encodeP8scii((sections.lua || []).join(''));
    const luaBytes = options.luaWriter === 'minify'
      ? minifyLua(sourceLua, options.minifyOptions)
      : options.luaWriter === 'format-token'
        ? formatLuaTokens(sourceLua, options.formatOptions)
        : options.luaWriter === 'ast-minify'
          ? minifyLuaAst(sourceLua)
          : options.luaWriter === 'ast-format'
            ? formatLuaAst(sourceLua, options.formatOptions)
            : options.luaWriter === 'ast-echo'
              ? echoLuaAst(sourceLua)
        : sourceLua;
    const diagnostics = analyzeLua(luaBytes, options.filename);
    validateLua(luaBytes);
    const lua = base.decodeP8scii(echoLua(luaBytes));
    let output = `${base.HEADER}\nversion ${version}\n__lua__\n${lua}`;
    if (!lua.endsWith('\n')) output += '\n';
    output += `__gfx__\n${gfx.toLines().join('')}`;
    if (label && label._data.length) output += `__label__\n${label.toLines().join('')}`;
    output += `\n__gff__\n${gff.toLines().join('')}`;
    output += `__map__\n${map.toLines().join('')}`;
    output += `__sfx__\n${sfx.toLines().join('')}`;
    output += `__music__\n${music.toLines().join('')}\n`;
    return { bytes: base.encodeUtf8(output), ...diagnostics };
  }

  function writeP8(source, options) { return writeP8WithDiagnostics(source, options).bytes; }

module.exports = Object.freeze({ writeP8, writeP8WithDiagnostics });
