'use strict';

const { readFile, writeFile, rename, unlink } = require('node:fs/promises');
const { dirname, basename, join } = require('node:path');
const base = { ...require('./picotool'), ...require('./sections'), ...require('./p8png') };
const { writeP8 } = require('./p8writer');
const { readP8Png, writeP8Png, writeP8PngFromP8, encodePng } = require('./png-transport');

class UnrecognizedFileType extends base.P8Error {
  constructor(filename) {
    super('UNRECOGNIZED_FILE_TYPE', `Filename ${filename} is not of a supported type`, filename);
    this.name = 'UnrecognizedFileType';
    this.filename = filename;
  }
}

function formatForFilename(filename) {
  if (filename.endsWith('.p8.png')) return 'p8.png';
  if (filename.endsWith('.p8')) return 'p8';
  throw new UnrecognizedFileType(filename);
}

async function fromBytes(input, filename) {
  const format = formatForFilename(filename);
  if (format === 'p8') return base.parseP8(input);
  return (await readP8Png(input)).cartridge;
}

async function fromFile(filename) {
  return fromBytes(await readFile(filename), filename);
}

function p8FromCartridge(cartridge) {
  const storedCode = cartridge.code?.code ?? new Uint8Array();
  const luaBytes = cartridge.code?.codeLength == null ? storedCode : storedCode.slice(0, cartridge.code.codeLength);
  const lua = base.decodeP8scii(luaBytes);
  const sections = Object.freeze({
    lua: Object.freeze(lua.match(/[^\n]*\n|[^\n]+$/g) || []),
    gfx: Object.freeze(cartridge.gfx.toLines()),
    gff: Object.freeze(cartridge.gff.toLines()),
    map: Object.freeze(cartridge.map.toLines()),
    sfx: Object.freeze(cartridge.sfx.toLines()),
    music: Object.freeze(cartridge.music.toLines()),
  });
  return Object.freeze({ format: 'p8', version: cartridge.version,
    sectionOrder: Object.freeze(['lua', 'gfx', 'gff', 'map', 'sfx', 'music']), sections });
}

async function emptyLabelPng() {
  return encodePng({ width: 160, height: 205, rgba: new Uint8Array(160 * 205 * 4).fill(255) });
}

async function labelBytesFor(filename, options) {
  if (options.labelPng !== undefined) return options.labelPng;
  if (options.labelFilename !== undefined) return readFile(options.labelFilename);
  try { return await readFile(filename); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return emptyLabelPng();
  }
}

async function toBytes(cartridge, filename, options = {}) {
  const format = formatForFilename(filename);
  if (typeof cartridge?.toCartridge === 'function') cartridge = cartridge.toCartridge(format);
  if (format === 'p8') return writeP8(cartridge?.format === 'p8' ? cartridge : p8FromCartridge(cartridge), options);
  const labelPng = await labelBytesFor(filename, options);
  if (cartridge?.format === 'p8') return writeP8PngFromP8(cartridge, labelPng, options);
  const storedCode = cartridge.code?.code;
  const luaBytes = options.luaBytes ?? (cartridge.code?.codeLength == null
    ? storedCode : storedCode.slice(0, cartridge.code.codeLength));
  return writeP8Png(cartridge, labelPng, luaBytes);
}

async function toFile(cartridge, filename, options = {}) {
  // Produce all output before replacing the destination, so an input PNG can
  // safely provide its own visible label and failed writes leave it intact.
  const output = await toBytes(cartridge, filename, options);
  const temporary = join(dirname(filename), `.${basename(filename)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await writeFile(temporary, output);
    await rename(temporary, filename);
  } catch (error) {
    try { await unlink(temporary); } catch {}
    throw error;
  }
}

module.exports = Object.freeze({ UnrecognizedFileType, formatForFilename, fromBytes, fromFile, toBytes, toFile });
