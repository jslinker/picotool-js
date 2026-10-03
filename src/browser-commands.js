'use strict';

const base = require('./picotool');
const { fromBytes, p8FromCartridge, toBytes } = require('./cartridge-io');
const { cartridgeStats } = require('./stats');
const { listLua, listTokens } = require('./listing');
const { findLua } = require('./lua-find');
const { printAst } = require('./ast-print');
const { writeP8 } = require('./p8writer');
const { buildP8 } = require('./build');
const { latin1Bytes, latin1Text } = require('./bytes');

const CART_EXTENSIONS = ['.p8', '.p8.png'];
const BUILD_DOMAINS = ['lua', 'gfx', 'gff', 'map', 'sfx', 'music'];

function fileName(file) {
  const name = typeof file === 'object' && file ? (file.name || file.filename) : null;
  if (!name) throw new TypeError('Each input file must provide a name.');
  return name;
}

async function fileBytes(file) {
  if (file instanceof Uint8Array) return file;
  if (file?.bytes !== undefined) return file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
  if (file?.data !== undefined) {
    if (typeof file.data === 'string') return new TextEncoder().encode(file.data);
    return file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
  }
  if (typeof file?.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  throw new TypeError(`${fileName(file)} does not provide bytes.`);
}

function requireCartridgeName(name) {
  if (!CART_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    throw new Error('filename must end in .p8 or .p8.png');
  }
}

async function loadCartridge(file) {
  const name = fileName(file);
  requireCartridgeName(name);
  const bytes = await fileBytes(file);
  const cartridge = await fromBytes(bytes, name);
  return { name, bytes, cartridge, p8: cartridge.format === 'p8' ? cartridge : p8FromCartridge(cartridge) };
}

function friendly(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Uint8Array || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return latin1Text(value).replace(/[\x80-\xff]/g, '_');
  }
  return String(value).replace(/[\x80-\xff]/g, '_');
}

function csvField(value) {
  const text = friendly(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function basename(name) {
  return String(name).split(/[\\/]/).pop();
}

function statsCsv(rows) {
  const values = [['Filename', 'Title', 'Byline', 'Code Version', 'Char Count',
    'Token Count', 'Line Count', 'Compressed Code Size']];
  for (const row of rows) values.push([basename(row.name), row.title, row.byline, row.version,
    row.characterCount, row.tokenCount, row.lineCount, row.compressedSize]);
  return `${values.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`;
}

async function mapCartridges(command, request, action) {
  const results = [], errors = [];
  const cartridges = request.cartridges || [];
  if (cartridges.length === 0) {
    return { ok: false, implemented: true, command, results, errors: [{
      name: '<input>', code: 'USAGE', message: `${command}: the following arguments are required: filename`,
    }] };
  }
  for (const file of cartridges) {
    let name = '<input>';
    try {
      name = fileName(file);
      results.push(await action(await loadCartridge(file), file));
    } catch (error) {
      errors.push({ name, code: error.code || error.name || 'ERROR', message: error.message });
    }
  }
  return { ok: errors.length === 0, implemented: true, command, results, errors };
}

function luaSource(p8) { return (p8.sections.lua || []).join(''); }

function formatRawLua(source, showLineNumbers) {
  return String(source).split('\n').map((line, index) =>
    `${showLineNumbers ? `${index}: ` : ''}${friendly(latin1Bytes(line))}\n`).join('') + '\n';
}

function outputName(name, suffix = '_fmt') {
  return name.endsWith('.p8.png') ? `${name.slice(0, -7)}${suffix}.p8.png`
    : `${name.slice(0, -3)}${suffix}.p8`;
}

function normalizeKeepNames(request) {
  if (Array.isArray(request.keepNames)) return request.keepNames;
  if (request.keepNamesBytes !== undefined) {
    return latin1Text(request.keepNamesBytes instanceof Uint8Array
      ? request.keepNamesBytes : new Uint8Array(request.keepNamesBytes))
      .split('\n').map((line) => line.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, ''))
      .filter((line) => line && !line.startsWith('#'));
  }
  const contents = request.keepNamesText;
  if (contents === undefined) return [];
  return String(contents).split('\n')
    .map((line) => line.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, ''))
    .filter((line) => line && !line.startsWith('#'));
}

function createBrowserCommands() {
  async function stats(request = {}) {
    const response = await mapCartridges('stats', request, async ({ name, p8 }) => {
      const values = cartridgeStats(p8);
      return { name, title: friendly(values.title), byline: friendly(values.byline),
        version: values.version, characterCount: values.characterCount,
        tokenCount: values.tokenCount, lineCount: values.lineCount,
        compressedSize: values.compressedSize };
    });
    if (request.csv) response.csv = statsCsv(response.results);
    return response;
  }

  function listing(command, request, render) {
    return mapCartridges(command, request, async ({ name, p8 }) => ({ name, text: render(p8, name) }));
  }

  function listlua(request = {}) {
    return listing('listlua', request, (p8) => listLua(p8, {
      pure: Boolean(request.pureLua), showLineNumbers: Boolean(request.showLineNumbers),
    }));
  }

  function listrawlua(request = {}) {
    return listing('listrawlua', request, (p8) => formatRawLua(luaSource(p8), request.showLineNumbers));
  }

  function listtokens(request = {}) {
    return listing('listtokens', request, (p8) => listTokens(p8));
  }

  function printast(request = {}) {
    return listing('printast', request, (p8) => printAst(base.encodeP8scii(luaSource(p8))));
  }

  async function luafind(request = {}) {
    if (!request.pattern) return { ok: false, implemented: true, command: 'luafind', results: [],
      errors: [{ name: '<pattern>', code: 'USAGE',
        message: 'Usage: p8tool luafind <pattern> <filename> [<filename>...]' }] };
    let expression;
    try { expression = request.pattern instanceof RegExp ? request.pattern : new RegExp(request.pattern || ''); }
    catch (error) {
      return { ok: false, implemented: true, command: 'luafind', results: [],
        errors: [{ name: '<pattern>', code: error.name, message: error.message }] };
    }
    return mapCartridges('luafind', request, async ({ name, p8 }) => ({
      name, text: findLua(p8, expression, { filename: name, listFiles: Boolean(request.listFiles) }),
    }));
  }

  function transform(command, request = {}) {
    if (command === 'luafmt' && request.indentwidth !== undefined && !Number.isInteger(request.indentwidth)) {
      return Promise.resolve({ ok: false, implemented: true, command, results: [], errors: [{
        name: '<options>', code: 'USAGE', message: '--indentwidth must be an integer',
      }] });
    }
    return mapCartridges(command, request, async ({ name, bytes, p8, cartridge }) => {
      const luaWriter = command === 'luamin' ? 'minify' : command === 'luafmt' ? 'ast-format' : undefined;
      const rewritten = base.parseP8(writeP8(p8, {
        luaWriter,
        minifyOptions: { keepAllNames: Boolean(request.keepAllNames), keepNames: normalizeKeepNames(request) },
        formatOptions: { indentwidth: request.indentwidth ?? 2 },
      }));
      const overwrite = command === 'luafmt' && Boolean(request.overwrite) && name.endsWith('.p8');
      const nameOut = request.outputName || (overwrite ? name : outputName(name, request.suffix || '_fmt'));
      const output = nameOut.endsWith('.p8.png')
        ? await toBytes(cartridge.format === 'p8' ? rewritten : cartridge, nameOut, {
          labelPng: name.endsWith('.p8.png') ? bytes : undefined,
          luaBytes: base.encodeP8scii(luaSource(rewritten)),
        })
        : await toBytes(rewritten, nameOut);
      return { name, output: { name: nameOut, bytes: output }, lua: luaSource(rewritten),
        stats: cartridgeStats(rewritten) };
    });
  }

  async function sourceFor(domain, file, modules, luaPath) {
    const name = fileName(file), bytes = await fileBytes(file);
    if (domain === 'lua' && name.endsWith('.lua')) {
      const files = {};
      for (const module of modules || []) files[fileName(module)] = await fileBytes(module);
      return { format: 'lua', data: new TextDecoder().decode(bytes), filename: name, files, luaPath };
    }
    const loaded = await loadCartridge(file);
    return { format: 'p8', data: writeP8(loaded.p8) };
  }

  async function build(request = {}) {
    try {
      if (!request.outputName) throw Object.assign(
        new Error('build: the following arguments are required: filename'), { code: 'USAGE' });
      const outputNameValue = request.outputName;
      requireCartridgeName(outputNameValue);
      const baseFile = request.base || request.existing;
      const loadedBase = baseFile ? await loadCartridge(baseFile) : null;
      const sources = {};
      for (const domain of BUILD_DOMAINS) {
        if (request.sources?.[domain]) {
          sources[domain] = await sourceFor(domain, request.sources[domain], request.modules, request.luaPath);
        }
      }
      const builtBytes = buildP8({
        existing: loadedBase ? writeP8(loadedBase.p8) : undefined,
        sources,
        empty: request.empty || [],
        luaMinify: request.luaMode === 'minify' || Boolean(request.luaMinify),
        luaFormat: request.luaMode === 'format' || Boolean(request.luaFormat),
        optimizeTokens: Boolean(request.optimizeTokens),
        keepAllNames: Boolean(request.keepAllNames),
        keepNames: normalizeKeepNames(request),
        indentwidth: 2,
      });
      const built = base.parseP8(builtBytes);
      const bytes = outputNameValue.endsWith('.p8.png')
        ? await toBytes(built, outputNameValue, {
          labelPng: loadedBase?.name.endsWith('.p8.png') ? loadedBase.bytes : undefined,
        })
        : builtBytes;
      return { ok: true, implemented: true, command: 'build', results: [{
        output: { name: outputNameValue, bytes }, lua: luaSource(built), stats: cartridgeStats(built),
      }], errors: [] };
    } catch (error) {
      return { ok: false, implemented: true, command: 'build', results: [],
        errors: [{ name: request.outputName || 'game.p8', code: error.code || error.name, message: error.message }] };
    }
  }

  return Object.freeze({ stats, listlua, listrawlua, listtokens, printast, luafind,
    writep8: (request) => transform('writep8', request),
    luamin: (request) => transform('luamin', request),
    luafmt: (request) => transform('luafmt', request), build });
}

module.exports = Object.freeze({ createBrowserCommands, statsCsv });
