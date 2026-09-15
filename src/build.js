'use strict';

const base = { ...require('./picotool'), ...require('./sections') };
const { writeP8 } = require('./p8writer');
const { validateLua } = require('./lua-parser');
const { bundleRequiredLua } = require('./require-build');

const DEFAULT_VERSION = 33;
const DOMAINS = ['lua', 'gfx', 'gff', 'map', 'sfx', 'music'];
const EMPTY = {
  gfx: () => base.Gfx.empty(DEFAULT_VERSION).toLines(),
  gff: () => base.Gff.empty(DEFAULT_VERSION).toLines(),
  map: () => base.MapSection.empty(DEFAULT_VERSION).toLines(),
  sfx: () => base.Sfx.empty(DEFAULT_VERSION).toLines(),
  music: () => base.Music.empty(DEFAULT_VERSION).toLines(),
};

function emptySections() {
  const sections = { lua: [], label: base.Gfx.empty(DEFAULT_VERSION).toLines() };
  for (const [name, factory] of Object.entries(EMPTY)) sections[name] = factory();
  return sections;
}

/** Match picotool's section-source and empty-override build behavior for text carts. */
function buildP8({ existing, sources = {}, empty = [], luaMinify = false, luaFormat = false,
  indentwidth = 2, optimizeTokens = false } = {}) {
  const previous = existing ? base.parseP8(existing) : null;
  const version = previous?.version ?? DEFAULT_VERSION;
  const sections = previous ? { ...previous.sections } : emptySections();
  for (const domain of DOMAINS) {
    const source = sources[domain];
    if (source !== undefined && empty.includes(domain)) throw new Error(`Cannot specify --${domain} and --empty-${domain} args together.`);
    if (source !== undefined) {
      if (domain === 'lua' && source.format === 'lua') {
        if (optimizeTokens) {
          const error = new Error('--optimize_tokens not yet implemented, sorry');
          error.name = 'NotImplementedError'; throw error;
        }
        const text = typeof source.data === 'string' ? source.data : new TextDecoder().decode(source.data);
        validateLua(base.encodeP8scii(text));
        const bundled = bundleRequiredLua(text, {
          filename: source.filename || 'main.lua', files: source.files || {}, luaPath: source.luaPath,
        });
        sections.lua = base.decodeP8scii(bundled).match(/[^\n]*\n|[^\n]+$/g) || [];
      } else {
        const parsed = base.parseP8(source.data ?? source);
        sections[domain] = parsed.sections[domain] || [];
      }
    } else if (empty.includes(domain)) {
      sections[domain] = domain === 'lua' ? [] : EMPTY[domain]();
    }
  }
  const writer = luaFormat ? { luaWriter: 'ast-format', formatOptions: { indentwidth } }
    : luaMinify ? { luaWriter: 'minify' } : undefined;
  return writeP8({ format: 'p8', version, sections }, writer);
}

module.exports = Object.freeze({ buildP8, DEFAULT_VERSION });
