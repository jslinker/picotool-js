'use strict';

// Synchronous, Node-oriented command-line helpers.  The public library stays
// browser-safe; consumers that need a CLI can call main() from a small bin
// wrapper without duplicating picotool's argument and stats semantics.
const fs = require('fs');
const path = require('path');
const { cartridgeStats } = require('./stats');
const { listLua, listTokens } = require('./listing');
const { findLua } = require('./lua-find');
const { readP8Png, writeP8Png } = require('./png-transport');
const { writeP8 } = require('./p8writer');
const { buildP8 } = require('./build');
const fileApi = require('./file-api');
const { Game } = require('./game');
const { printAst } = require('./ast-print');

function parseArgs(argv = []) {
  const args = Array.from(argv);
  const result = { quiet: false, debug: false, command: null, csv: false, filename: [] };
  let optionsEnded = false;
  while (args.length) {
    let arg = args.shift();
    if (!optionsEnded && /^--(?:indentwidth|keep-names-from-file|lua-path|lua|gfx|gff|map|sfx|music)=/.test(arg)) {
      const separator = arg.indexOf('=');
      args.unshift(arg.slice(separator + 1));
      arg = arg.slice(0, separator);
    }
    if (arg === '--' && !optionsEnded) {
      optionsEnded = true;
    } else if (!optionsEnded && (arg === '-h' || arg === '--help')) {
      result.help = true;
      args.length = 0;
    } else if (!optionsEnded && result.command === null && (arg === '-q' || arg === '--quiet')) {
      result.quiet = true;
    } else if (!optionsEnded && result.command === null && arg === '--debug') {
      result.debug = true;
    } else if (!optionsEnded && result.command === null && arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}`);
    } else if (result.command === null) {
      result.command = arg;
      if (!['stats', 'listlua', 'listtokens', 'listrawlua', 'writep8', 'luamin', 'luafmt', 'luafind', 'build', 'printast'].includes(arg)) throw new Error(`unknown command: ${arg}`);
    } else if (!optionsEnded && arg === '--csv' && result.command === 'stats') {
      result.csv = true;
    } else if (!optionsEnded && arg === '--show-line-numbers' && result.command === 'listlua') {
      result.showLineNumbers = true;
    } else if (!optionsEnded && arg === '--pure-lua' && result.command === 'listlua') {
      result.pureLua = true;
    } else if (!optionsEnded && arg === '--show-line-numbers' && result.command === 'listrawlua') {
      result.showLineNumbers = true;
    } else if (!optionsEnded && arg === '--overwrite' && result.command === 'luafmt') {
      result.overwrite = true;
    } else if (!optionsEnded && arg === '--indentwidth' && result.command === 'luafmt') {
      result.indentwidth = Number(args.shift());
      if (!Number.isInteger(result.indentwidth)) throw new Error('--indentwidth must be an integer');
    } else if (!optionsEnded && arg === '--keep-all-names' && result.command === 'luamin') {
      result.keepAllNames = true;
    } else if (!optionsEnded && arg === '--keep-names-from-file' && result.command === 'luamin') {
      result.keepNamesFromFile = args.shift();
      if (result.keepNamesFromFile === undefined) throw new Error('--keep-names-from-file requires a filename');
    } else if (!optionsEnded && arg === '--listfiles' && result.command === 'luafind') {
      result.listFiles = true;
    } else if (!optionsEnded && result.command === 'build' && /^--(?:empty-)?(?:lua|gfx|gff|map|sfx|music)$/.test(arg)) {
      const match = arg.match(/^--(empty-)?(lua|gfx|gff|map|sfx|music)$/);
      const key = match[1] ? `empty_${match[2]}` : match[2];
      result[key] = match[1] ? true : args.shift();
      if (!match[1] && result[key] === undefined) throw new Error(`${arg} requires a filename`);
    } else if (!optionsEnded && result.command === 'build' && arg === '--lua-path') {
      result.luaPath = args.shift();
      if (result.luaPath === undefined) throw new Error('--lua-path requires a value');
    } else if (!optionsEnded && result.command === 'build' && arg === '--optimize-tokens') {
      result.optimizeTokens = true;
    } else if (!optionsEnded && result.command === 'build' && arg === '--lua-format') {
      result.luaFormat = true;
    } else if (!optionsEnded && result.command === 'build' && arg === '--lua-minify') {
      result.luaMinify = true;
    } else if (!optionsEnded && result.command === 'build' && arg === '--keep-all-names') {
      result.keepAllNames = true;
    } else if (!optionsEnded && result.command === 'build' && arg === '--keep-names-from-file') {
      result.keepNamesFromFile = args.shift();
      if (result.keepNamesFromFile === undefined) throw new Error('--keep-names-from-file requires a filename');
    } else if (!optionsEnded && arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      result.filename.push(arg);
    }
  }
  if (result.command && result.filename.length === 0 && !result.help) {
    throw new Error(`${result.command}: the following arguments are required: filename`);
  }
  if (result.command === 'build' && result.filename.length > 1) throw new Error(`build: unrecognized arguments: ${result.filename.slice(1).join(' ')}`);
  return result;
}

const COMMAND_HELP = {
  stats: '[--csv] filename [filename ...]',
  listlua: '[--show-line-numbers] [--pure-lua] filename [filename ...]',
  listrawlua: '[--show-line-numbers] filename [filename ...]',
  writep8: 'filename [filename ...]',
  luamin: '[--keep-all-names] [--keep-names-from-file FILE] filename [filename ...]',
  luafmt: '[--indentwidth N] [--overwrite] filename [filename ...]',
  luafind: '[--listfiles] filename [filename ...]',
  listtokens: 'filename [filename ...]', printast: 'filename [filename ...]',
  build: '[--lua FILE] [--empty-lua] [--lua-path PATH] [--lua-format | --lua-minify] [section options] filename',
};

function formatHelp(command = null) {
  if (command) return `usage: p8tool ${command} [-h] ${COMMAND_HELP[command]}\n\noptions:\n  -h, --help  show this help message and exit\n`;
  return 'usage: p8tool [-h] [-q] [--debug] {stats,listlua,listrawlua,writep8,luamin,luafmt,luafind,listtokens,printast,build} ...\n\n' +
    'PICO-8 cartridge processing and build tools\n\noptions:\n  -h, --help   show this help message and exit\n  -q, --quiet  suppress normal output\n  --debug      write extra debugging messages\n';
}

function friendly(value) {
  if (value === null || value === undefined) return '';
  // Python's _as_friendly_string censors bytes above ASCII rather than
  // attempting to interpret them as Unicode.
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString('latin1').replace(/[\x80-\xff]/g, '_');
  }
  return String(value);
}

function csvField(value) {
  const text = friendly(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function statsRows(filenames, readFile = fs.readFileSync) {
  const rows = [];
  const errors = [];
  const sequence = [];
  for (const filename of filenames) {
    if (!filename.endsWith('.p8') && !filename.endsWith('.p8.png')) {
      errors.push({ filename, error: new Error('filename must end in .p8 or .p8.png'), unsupported: true });
      sequence.push({ filename, unsupported: true });
      continue;
    }
    try {
      // Python's stats accepts .p8 and .p8.png.  PNG transport is deliberately
      // left to the async file API for now; this sync CLI slice handles .p8.
      if (!filename.endsWith('.p8')) throw new Error('filename must end in .p8 (use mainAsync for .p8.png)');
      const source = readFile(filename);
      const row = { filename, source, stats: cartridgeStats(source) };
      rows.push(row); sequence.push({ row });
    } catch (error) {
      const failure = { filename, error };
      errors.push(failure); sequence.push({ failure });
    }
  }
  return { rows, errors, sequence };
}

function formatStats(rows, csv = false) {
  if (csv) {
    const output = [['Filename', 'Title', 'Byline', 'Code Version', 'Char Count',
      'Token Count', 'Line Count', 'Compressed Code Size']];
    for (const { filename, stats } of rows) {
      output.push([path.basename(filename), stats.title, stats.byline, stats.version,
        stats.characterCount, stats.tokenCount, stats.lineCount, stats.compressedSize]);
    }
    return `${output.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`;
  }
  return rows.map(({ filename, stats }) => {
    const title = friendly(stats.title);
    const byline = friendly(stats.byline);
    const heading = title ? `${title} (${path.basename(filename)})` : path.basename(filename);
    return `${heading}\n${byline ? `${byline}\n` : ''}- version: ${stats.version}\n` +
      `- lines: ${stats.lineCount}\n- chars: ${stats.characterCount}\n` +
      `- tokens: ${stats.tokenCount}\n- compressed chars: ${stats.compressedSize}\n`;
  }).join('\n') + (rows.length ? '\n' : '');
}

function runStats(args, io = {}) {
  const write = io.write || ((text) => process.stdout.write(text));
  const error = io.error || ((text) => process.stderr.write(text));
  const { errors, sequence } = statsRows(args.filename, io.readFile || fs.readFileSync);
  if (args.csv) write(formatStats([], true));
  for (const item of sequence) {
    if (item.unsupported) error(`${item.filename}: filename must end in .p8 or .p8.png\n`);
    else if (item.failure) error(`${item.failure.filename}: ${item.failure.error.message}\n${item.failure.filename}: could not load cart\n`);
    else if (args.csv) {
      const all = formatStats([item.row], true);
      write(all.slice(all.indexOf('\r\n') + 2));
    } else write(formatStats([item.row], false));
  }
  return errors.some((item) => !item.unsupported) && args.filename.length === 1 ? 1 : 0;
}

function runListing(args, io = {}) {
  const write = io.write || ((text) => process.stdout.write(text));
  const error = io.error || ((text) => process.stderr.write(text));
  const read = io.readFile || fs.readFileSync;
  const { rows, errors, sequence } = args.command === 'listrawlua'
    ? (() => {
      const rawRows = [], rawErrors = [], rawSequence = [];
      for (const filename of args.filename) {
        if (!filename.endsWith('.p8') && !filename.endsWith('.p8.png')) { rawSequence.push({ filename, unsupported: true }); continue; }
        try {
          if (!filename.endsWith('.p8')) throw new Error('filename must end in .p8 (PNG raw listing is async)');
          const row = { filename, source: read(filename) }; rawRows.push(row); rawSequence.push({ row });
        } catch (exception) { const failure = { filename, error: exception }; rawErrors.push(failure); rawSequence.push({ failure }); }
      }
      return { rows: rawRows, errors: rawErrors, sequence: rawSequence };
    })()
    : statsRows(args.filename, read);
  for (const item of sequence) {
    if (item.unsupported) {
      error(args.command === 'listrawlua' ? `${item.filename}: must be .p8 or .p8.png\n` : `${item.filename}: filename must end in .p8 or .p8.png\n`);
      continue;
    }
    if (item.failure) { error(`${item.failure.filename}: ${item.failure.error.message}\n${item.failure.filename}: could not load cart\n`); continue; }
    const { filename, source } = item.row;
    if (args.command === 'listlua') write((args.filename.length > 1 ? `=== ${filename} ===\n` : '') +
      listLua(source, { pure: args.pureLua, showLineNumbers: args.showLineNumbers }));
    else if (args.command === 'listrawlua') {
      const parsed = require('./picotool').parseP8(source);
      const lines = (parsed.sections.lua || []).join('').match(/[^\n]*\n|[^\n]+$/g) || [];
      write((args.filename.length > 1 ? `=== ${filename} ===\n` : '') + lines.map((line, index) =>
        `${args.showLineNumbers ? `${index}: ` : ''}${friendly(Buffer.from(line, 'latin1'))}`).join('') + '\n');
    } else write((args.filename.length > 1 ? `=== ${filename} ===\n` : '') + listTokens(source));
  }
  if (args.command === 'listrawlua' && sequence.length === 1 && sequence[0].unsupported) return 1;
  return errors.some((item) => !item.unsupported) && args.filename.length === 1 ? 1 : 0;
}

function runLuaFind(args, io = {}) {
  const write = io.write || ((text) => process.stdout.write(text));
  const error = io.error || ((text) => process.stderr.write(text));
  const [pattern, ...filenames] = args.filename;
  if (!pattern || filenames.length === 0) {
    error('Usage: p8tool luafind <pattern> <filename> [<filename>...]\n');
    return 1;
  }
  let expression;
  try { expression = new RegExp(pattern); } catch (exception) {
    error(`luafind: ${exception.message}\n`);
    return 1;
  }
  let failed = false;
  for (const filename of filenames) {
    if (!filename.endsWith('.p8') && !filename.endsWith('.p8.png')) { error(`${filename}: filename must end in .p8 or .p8.png\n`); continue; }
    try {
      if (!filename.endsWith('.p8')) throw new Error('filename must end in .p8 (PNG search is async)');
      const source = require('./picotool').parseP8((io.readFile || fs.readFileSync)(filename));
      write(findLua(source, expression, { filename, listFiles: args.listFiles }));
    } catch (exception) {
      failed = true;
      error(`${filename}: ${exception.message}\n${filename}: could not load cart\n`);
    }
  }
  return failed && filenames.length === 1 ? 1 : 0;
}

function outputName(filename, command, overwrite) {
  if (command === 'luafmt' && overwrite && filename.endsWith('.p8')) return filename;
  if (filename.endsWith('.p8.png')) return filename.slice(0, -7) + '_fmt.p8.png';
  if (filename.endsWith('.p8')) return filename.slice(0, -3) + '_fmt.p8';
  throw new Error('filename must end in .p8 or .p8.png');
}

function namesFromFileContents(contents) {
  return Buffer.from(contents).toString('latin1').split(/\n/)
    .map((line) => line.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g, ''))
    .filter((line) => line && !line.startsWith('#'));
}

function keepNamesFor(args, read) {
  return args.keepNamesFromFile ? namesFromFileContents(read(args.keepNamesFromFile)) : [];
}

function runWrite(args, io = {}) {
  const write = io.write || ((text) => process.stdout.write(text));
  const error = io.error || ((text) => process.stderr.write(text));
  let failed = false;
  for (const filename of args.filename) {
    if (!filename.endsWith('.p8') && !filename.endsWith('.p8.png')) { error(`${filename}: filename must end in .p8 or .p8.png\n`); continue; }
    let writeStarted = false;
    try {
      if (!filename.endsWith('.p8')) throw new Error('filename must end in .p8 (PNG writing is async)');
      const output = outputName(filename, args.command, args.overwrite);
      const source = require('./picotool').parseP8((io.readFile || fs.readFileSync)(filename));
      write(`${filename} -> ${output}\n`);
      writeStarted = true;
      const luaWriter = args.command === 'luamin' ? 'minify' : args.command === 'luafmt' ? 'ast-format' : undefined;
      const bytes = writeP8(source, { luaWriter, minifyOptions: { keepAllNames: args.keepAllNames, keepNames: keepNamesFor(args, io.readFile || fs.readFileSync) }, formatOptions: { indentwidth: args.indentwidth ?? 2 } });
      (io.writeFile || fs.writeFileSync)(output, bytes);
    } catch (exception) {
      failed = true;
      error(`${filename}: ${exception.message}\n`);
      if (writeStarted) return 1;
    }
  }
  return failed ? 1 : 0;
}

const BUILD_DOMAINS = ['lua', 'gfx', 'gff', 'map', 'sfx', 'music'];

// buildP8's require bundler accepts an in-memory file map. Mirror the Python
// tool's filesystem lookup by making Lua files beside the entry file visible
// under their absolute, leading-slash-free paths.
function luaFilesFor(filename, luaPath) {
  const entryDirectory = path.dirname(path.resolve(filename));
  const roots = new Set([entryDirectory]);
  for (const pattern of (luaPath || '').split(';')) {
    if (!pattern) continue;
    const marker = pattern.indexOf('?');
    const directory = marker < 0 ? pattern : pattern.slice(0, marker);
    // A load-path pattern names a bounded directory (e.g. modules/?.lua).
    // Do not walk arbitrary ancestors or the whole project tree.
    roots.add(path.resolve(entryDirectory, directory || '.'));
  }
  const files = {};
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name.endsWith('.lua')) {
        files[full.replace(/^[/\\]/, '')] = fs.readFileSync(full);
      }
    }
  }
  for (const root of roots) if (fs.existsSync(root) && fs.statSync(root).isDirectory()) visit(root);
  return files;
}

function buildOptions(args, sources, existing, keepNames = []) {
  const empty = BUILD_DOMAINS.filter((domain) => args[`empty_${domain}`]);
  return {
    existing, sources, empty,
    luaMinify: args.luaMinify, luaFormat: args.luaFormat,
    luaPath: args.luaPath, optimizeTokens: args.optimizeTokens,
    keepAllNames: args.keepAllNames, keepNames,
    indentwidth: args.indentwidth || 2,
  };
}

function runBuild(args, io = {}) {
  const write = io.write || ((text) => process.stdout.write(text));
  const error = io.error || ((text) => process.stderr.write(text));
  const read = io.readFile || fs.readFileSync;
  const output = args.filename[0];
  if (!output || (!output.endsWith('.p8') && !output.endsWith('.p8.png'))) {
    error('Output filename must end with .p8 or .p8.png.\n'); return 1;
  }
  try {
    if (output.endsWith('.p8.png')) throw new Error('build .p8.png requires mainAsync');
    const existing = fs.existsSync(output) ? read(output) : undefined;
    const sources = {};
    for (const domain of BUILD_DOMAINS) if (args[domain] !== undefined) {
      const filename = args[domain];
      if (!fs.existsSync(filename)) throw new Error(`File "${filename}" given for --${domain} arg does not exist.`);
      if (domain === 'lua' && filename.endsWith('.lua')) sources.lua = {
        format: 'lua', data: read(filename, 'utf8'), filename,
        files: luaFilesFor(filename, args.luaPath), luaPath: args.luaPath,
      };
      else if (filename.endsWith('.p8')) sources[domain] = { format: 'p8', data: read(filename) };
      else throw new Error(`Unsupported file type for --${domain} arg.`);
    }
    const bytes = buildP8(buildOptions(args, sources, existing, keepNamesFor(args, read)));
    (io.writeFile || fs.writeFileSync)(output, bytes);
    if (!args.quiet) write(`${output}\n`);
    return 0;
  } catch (exception) { error(`${exception.message}\n`); return 1; }
}

function p8LuaSource(input) {
  const parsed = require('./picotool').parseP8(input);
  return (parsed.sections.lua || []).join('');
}

function runPrintAst(args, io = {}) {
  const write = io.write || ((text) => process.stdout.write(text));
  const error = io.error || ((text) => process.stderr.write(text));
  let failed = false;
  for (const filename of args.filename) {
    if (!filename.endsWith('.p8') && !filename.endsWith('.p8.png')) { error(`${filename}: filename must end in .p8 or .p8.png\n`); continue; }
    try {
      if (!filename.endsWith('.p8')) throw new Error('filename must end in .p8 or .p8.png');
      const source = p8LuaSource((io.readFile || fs.readFileSync)(filename));
      if (args.filename.length > 1) write(`=== ${filename} ===\n`);
      write(printAst(source));
    } catch (exception) { failed = true; error(`${filename}: ${exception.message}\n${filename}: could not load cart\n`); }
  }
  return failed && args.filename.length === 1 ? 1 : 0;
}

async function asyncPrintAst(args, io = {}) {
  const write = io.write || ((text) => process.stdout.write(text));
  const error = io.error || ((text) => process.stderr.write(text));
  let failed = false;
  for (const filename of args.filename) {
    if (!filename.endsWith('.p8') && !filename.endsWith('.p8.png')) { error(`${filename}: filename must end in .p8 or .p8.png\n`); continue; }
    try {
      const input = await (io.readFile || fs.promises.readFile)(filename);
      let source;
      if (filename.endsWith('.p8')) source = p8LuaSource(input);
      else if (filename.endsWith('.p8.png')) {
        const cartridge = (await fileApi.fromBytes(input, filename));
        source = require('./game').Game.fromCartridge(cartridge, filename).lua.toLines().join('');
      } else throw new Error('filename must end in .p8 or .p8.png');
      if (args.filename.length > 1) write(`=== ${filename} ===\n`);
      write(printAst(source));
    } catch (exception) { failed = true; error(`${filename}: ${exception.message}\n${filename}: could not load cart\n`); }
  }
  return failed && args.filename.length === 1 ? 1 : 0;
}

async function asyncBuild(args, io = {}) {
  const write = io.write || ((text) => process.stdout.write(text));
  const error = io.error || ((text) => process.stderr.write(text));
  const read = io.readFile || fs.promises.readFile;
  const writeFile = io.writeFile || fs.promises.writeFile;
  const output = args.filename[0];
  if (!output || (!output.endsWith('.p8') && !output.endsWith('.p8.png'))) {
    error('Output filename must end with .p8 or .p8.png.\n'); return 1;
  }
  try {
    let existing;
    if (fs.existsSync(output)) {
      existing = output.endsWith('.p8.png')
        ? writeP8(Game.fromCartridge((await fileApi.fromFile(output)), output).toCartridge('p8'))
        : await read(output);
    }
    const sources = {};
    for (const domain of BUILD_DOMAINS) if (args[domain] !== undefined) {
      const filename = args[domain];
      let input;
      try { input = await read(filename); } catch { throw new Error(`File "${filename}" given for --${domain} arg does not exist.`); }
      if (domain === 'lua' && filename.endsWith('.lua')) sources.lua = {
        format: 'lua', data: Buffer.from(input).toString('utf8'), filename,
        files: luaFilesFor(filename, args.luaPath), luaPath: args.luaPath,
      };
      else if (filename.endsWith('.p8')) sources[domain] = { format: 'p8', data: input };
      else if (filename.endsWith('.p8.png')) sources[domain] = {
        format: 'p8', data: writeP8(Game.fromCartridge((await fileApi.fromFile(filename)), filename).toCartridge('p8')),
      };
      else throw new Error(`Unsupported file type for --${domain} arg.`);
    }
    const keepNames = args.keepNamesFromFile ? namesFromFileContents(await read(args.keepNamesFromFile)) : [];
    const bytes = buildP8(buildOptions(args, sources, existing, keepNames));
    if (output.endsWith('.p8')) await writeFile(output, bytes);
    else await fileApi.toFile(require('./picotool').parseP8(bytes), output);
    if (!args.quiet) write(`${output}\n`);
    return 0;
  } catch (exception) { error(`${exception.message}\n`); return 1; }
}

async function asyncStatsRows(filenames, readFile = fs.promises.readFile) {
  const rows = [], errors = [], sequence = [];
  for (const filename of filenames) {
    if (!filename.endsWith('.p8') && !filename.endsWith('.p8.png')) {
      errors.push({ filename, error: new Error('filename must end in .p8 or .p8.png'), unsupported: true });
      sequence.push({ filename, unsupported: true }); continue;
    }
    try {
      const bytes = await readFile(filename);
      let stats;
      if (filename.endsWith('.p8')) stats = cartridgeStats(bytes);
      else if (filename.endsWith('.p8.png')) {
        const { cartridge } = await readP8Png(bytes);
        const lua = require('./picotool').decodeP8scii(cartridge.code.code.slice(0, cartridge.code.codeLength));
        stats = cartridgeStats({ format: 'p8', version: cartridge.version, sections: { lua: [lua] } });
      } else throw new Error('filename must end in .p8 or .p8.png');
      const row = { filename, stats }; rows.push(row); sequence.push({ row });
    } catch (error) { const failure = { filename, error }; errors.push(failure); sequence.push({ failure }); }
  }
  return { rows, errors, sequence };
}

function p8FromPngCartridge(cartridge) {
  const luaBytes = cartridge.code.code.slice(0, cartridge.code.codeLength);
  const lua = require('./picotool').decodeP8scii(luaBytes);
  return {
    format: 'p8', version: cartridge.version,
    sections: {
      lua: lua.match(/[^\n]*\n|[^\n]+$/g) || [],
      gfx: cartridge.gfx.toLines(), gff: cartridge.gff.toLines(),
      map: cartridge.map.toLines(), sfx: cartridge.sfx.toLines(),
      music: cartridge.music.toLines(),
    },
  };
}

async function asyncListing(args, io = {}) {
  const write = io.write || ((text) => process.stdout.write(text));
  const error = io.error || ((text) => process.stderr.write(text));
  const read = io.readFile || fs.promises.readFile;
  let failures = 0;
  for (const filename of args.filename) {
    if (!filename.endsWith('.p8') && !filename.endsWith('.p8.png')) { error(`${filename}: filename must end in .p8 or .p8.png\n`); continue; }
    try {
      let source;
      if (filename.endsWith('.p8')) source = await read(filename);
      else if (filename.endsWith('.p8.png')) {
        const { cartridge } = await readP8Png(await read(filename));
        source = p8FromPngCartridge(cartridge);
      }
      const prefix = args.filename.length > 1 ? `=== ${filename} ===\n` : '';
      write(prefix + (args.command === 'listlua'
        ? listLua(source, { pure: args.pureLua, showLineNumbers: args.showLineNumbers })
        : listTokens(source)));
    } catch (exception) {
      failures += 1;
      error(`${filename}: ${exception.message}\n${filename}: could not load cart\n`);
    }
  }
  return failures && args.filename.length === 1 ? 1 : 0;
}

async function asyncWrite(args, io = {}) {
  const write = io.write || ((text) => process.stdout.write(text));
  const error = io.error || ((text) => process.stderr.write(text));
  const read = io.readFile || fs.promises.readFile;
  const writeFile = io.writeFile || fs.promises.writeFile;
  let failed = false;
  for (const filename of args.filename) {
    if (!filename.endsWith('.p8') && !filename.endsWith('.p8.png')) { error(`${filename}: filename must end in .p8 or .p8.png\n`); continue; }
    let writeStarted = false;
    try {
      const input = await read(filename);
      const output = outputName(filename, args.command, args.overwrite);
      if (filename.endsWith('.p8')) {
        const parsed = require('./picotool').parseP8(input);
        write(`${filename} -> ${output}\n`);
        writeStarted = true;
        const luaWriter = args.command === 'luamin' ? 'minify' : args.command === 'luafmt' ? 'ast-format' : undefined;
        const keepNames = args.keepNamesFromFile ? namesFromFileContents(await read(args.keepNamesFromFile)) : [];
        await writeFile(output, writeP8(parsed, { luaWriter, minifyOptions: { keepAllNames: args.keepAllNames, keepNames }, formatOptions: { indentwidth: args.indentwidth ?? 2 } }));
      } else if (filename.endsWith('.p8.png')) {
        const { cartridge } = await readP8Png(input);
        write(`${filename} -> ${output}\n`);
        writeStarted = true;
        let luaBytes = cartridge.code.code.slice(0, cartridge.code.codeLength);
        if (args.command !== 'writep8') {
          const parsed = p8FromPngCartridge(cartridge);
          const luaWriter = args.command === 'luamin' ? 'minify' : 'ast-format';
          const keepNames = args.keepNamesFromFile ? namesFromFileContents(await read(args.keepNamesFromFile)) : [];
          const rewritten = require('./picotool').parseP8(writeP8(parsed, { luaWriter, minifyOptions: { keepAllNames: args.keepAllNames, keepNames }, formatOptions: { indentwidth: args.indentwidth ?? 2 } }));
          luaBytes = require('./picotool').encodeP8scii((rewritten.sections.lua || []).join(''));
        }
        await writeFile(output, await writeP8Png(cartridge, input, luaBytes));
      } else throw new Error('filename must end in .p8 or .p8.png');
    } catch (exception) {
      failed = true; error(`${filename}: ${exception.message}\n`);
      if (writeStarted) return 1;
    }
  }
  return failed ? 1 : 0;
}

async function asyncLuaFind(args, io = {}) {
  const write = io.write || ((text) => process.stdout.write(text));
  const error = io.error || ((text) => process.stderr.write(text));
  const [pattern, ...filenames] = args.filename;
  if (!pattern || filenames.length === 0) {
    error('Usage: p8tool luafind <pattern> <filename> [<filename>...]\n');
    return 1;
  }
  let expression;
  try { expression = new RegExp(pattern); } catch (exception) {
    error(`luafind: ${exception.message}\n`);
    return 1;
  }
  let failed = false;
  const read = io.readFile || fs.promises.readFile;
  for (const filename of filenames) {
    if (!filename.endsWith('.p8') && !filename.endsWith('.p8.png')) { error(`${filename}: filename must end in .p8 or .p8.png\n`); continue; }
    try {
      const input = await read(filename);
      const source = filename.endsWith('.p8.png')
        ? p8FromPngCartridge((await readP8Png(input)).cartridge)
        : require('./picotool').parseP8(input);
      write(findLua(source, expression, { filename, listFiles: args.listFiles }));
    } catch (exception) {
      failed = true;
      error(`${filename}: ${exception.message}\n${filename}: could not load cart\n`);
    }
  }
  return failed && filenames.length === 1 ? 1 : 0;
}

async function mainAsync(argv = process.argv.slice(2), io = {}) {
  try {
    const args = parseArgs(argv);
    if (args.help) { (io.write || ((text) => process.stdout.write(text)))(formatHelp(args.command)); return 0; }
    if (!args.command) { (io.write || ((text) => process.stdout.write(text)))(formatHelp()); return 1; }
    if (['listlua', 'listtokens'].includes(args.command) && args.filename.some((filename) => filename.endsWith('.p8.png'))) return asyncListing(args, io);
    if (['writep8', 'luamin', 'luafmt'].includes(args.command) && args.filename.some((filename) => filename.endsWith('.p8.png'))) return asyncWrite(args, io);
    if (args.command === 'luafind' && args.filename.slice(1).some((filename) => filename.endsWith('.p8.png'))) return asyncLuaFind(args, io);
    if (args.command === 'build') return asyncBuild(args, io);
    if (args.command === 'printast') return asyncPrintAst(args, io);
    if (args.command !== 'stats') return main(argv, io);
    const write = io.write || ((text) => process.stdout.write(text));
    const error = io.error || ((text) => process.stderr.write(text));
    const { errors, sequence } = await asyncStatsRows(args.filename, io.readFile || fs.promises.readFile);
    if (args.csv) write(formatStats([], true));
    for (const item of sequence) {
      if (item.unsupported) error(`${item.filename}: filename must end in .p8 or .p8.png\n`);
      else if (item.failure) error(`${item.failure.filename}: ${item.failure.error.message}\n${item.failure.filename}: could not load cart\n`);
      else if (args.csv) {
        const all = formatStats([item.row], true);
        write(all.slice(all.indexOf('\r\n') + 2));
      } else write(formatStats([item.row], false));
    }
    return errors.some((item) => !item.unsupported) && args.filename.length === 1 ? 1 : 0;
  } catch (error) {
    (io.error || ((text) => process.stderr.write(text)))(`picotool: ${error.message}\n`);
    return 2;
  }
}

function main(argv = process.argv.slice(2), io = {}) {
  try {
    const args = parseArgs(argv);
    if (args.help) { (io.write || ((text) => process.stdout.write(text)))(formatHelp(args.command)); return 0; }
    if (!args.command) { (io.write || ((text) => process.stdout.write(text)))(formatHelp()); return 1; }
    if (args.command === 'stats') return runStats(args, io);
    if (['listlua', 'listtokens', 'listrawlua'].includes(args.command)) return runListing(args, io);
    if (args.command === 'luafind') return runLuaFind(args, io);
    if (args.command === 'build') return runBuild(args, io);
    if (args.command === 'printast') return runPrintAst(args, io);
    if (['writep8', 'luamin', 'luafmt'].includes(args.command)) return runWrite(args, io);
    return 1;
  } catch (error) {
    (io.error || ((text) => process.stderr.write(text)))(`picotool: ${error.message}\n`);
    return 2;
  }
}

module.exports = Object.freeze({ asyncBuild, asyncPrintAst, asyncStatsRows, buildOptions, formatHelp, friendly, formatStats, main, mainAsync, parseArgs, runBuild, runListing, runPrintAst, runStats, statsRows });
