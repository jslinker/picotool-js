'use strict';

const path = require('node:path');
const base = require('./picotool');
const { echoLua } = require('./lua-lexer');
const { readP8Png } = require('./png-transport');

class P8IncludeNotFound extends Error { constructor() { super(''); this.name = 'P8IncludeNotFound'; } }
class P8IncludeOutsideOfAllowedDirectory extends Error { constructor() { super(''); this.name = 'P8IncludeOutsideOfAllowedDirectory'; } }

function linesForTab(lines, tab) {
  if (tab === null) return lines;
  let current = 0;
  return lines.filter((line) => {
    if (line.startsWith('-->8')) { current += 1; return false; }
    return current === tab;
  });
}

/** Expand .lua and .p8 include directives using the same single-level rule as Python picotool. */
function processP8Includes(source, { filename, readFile, rootPath = path.dirname(filename) }) {
  const parsed = base.parseP8(source), output = [];
  for (const line of parsed.sections.lua || []) {
    const match = /^\s*#include\s+(\S+)(\.p8\.png|\.p8|\.lua)(:\d+)?/.exec(line);
    if (!match) { output.push(line); continue; }
    const [, stem, extension, tabText] = match;
    const included = path.resolve(path.dirname(filename), stem + extension);
    if (!included.startsWith(rootPath)) throw new P8IncludeOutsideOfAllowedDirectory();
    const bytes = readFile(included);
    if (bytes === undefined || bytes === null) throw new P8IncludeNotFound();
    if (extension === '.p8.png') throw new Error('PNG include decoding requires a separate transport');
    if (extension === '.lua') {
      output.push(base.decodeP8scii(bytes));
      continue;
    }
    const child = base.parseP8(bytes);
    const raw = (child.sections.lua || []).join('');
    const canonical = base.decodeP8scii(echoLua(base.encodeP8scii(raw)));
    const lines = canonical.match(/[^\n]*\n|[^\n]+$/g) || [];
    output.push(...linesForTab(lines, tabText ? Number(tabText.slice(1)) : null));
  }
  return output.join('');
}

/** Async include expansion with .p8.png support. readFile may return bytes or a Promise of bytes. */
async function processP8IncludesAsync(source, { filename, readFile, rootPath = path.dirname(filename) }) {
  const parsed = base.parseP8(source), output = [];
  for (const line of parsed.sections.lua || []) {
    const match = /^\s*#include\s+(\S+)(\.p8\.png|\.p8|\.lua)(:\d+)?/.exec(line);
    if (!match) { output.push(line); continue; }
    const [, stem, extension, tabText] = match;
    const included = path.resolve(path.dirname(filename), stem + extension);
    if (!included.startsWith(rootPath)) throw new P8IncludeOutsideOfAllowedDirectory();
    const bytes = await readFile(included);
    if (bytes === undefined || bytes === null) throw new P8IncludeNotFound();
    if (extension === '.lua') { output.push(base.decodeP8scii(bytes)); continue; }
    let raw;
    if (extension === '.p8.png') raw = base.decodeP8scii((await readP8Png(bytes)).cartridge.code.code);
    else raw = (base.parseP8(bytes).sections.lua || []).join('');
    const canonical = base.decodeP8scii(echoLua(base.encodeP8scii(raw)));
    const lines = canonical.match(/[^\n]*\n|[^\n]+$/g) || [];
    output.push(...linesForTab(lines, tabText ? Number(tabText.slice(1)) : null));
  }
  return output.join('');
}

module.exports = Object.freeze({ processP8Includes, processP8IncludesAsync,
  P8IncludeNotFound, P8IncludeOutsideOfAllowedDirectory });
