'use strict';

const base = { ...require('./picotool'), ...require('./sections'), ...require('./p8png') };

let codecPromise;
function codec() { return codecPromise ??= import('fast-png'); }

async function decodePng(input) {
  const { decode, convertIndexedToRgb } = await codec();
  let image = decode(input instanceof Uint8Array ? input : new Uint8Array(input), { checkCrc: true });
  if (image.palette) image = convertIndexedToRgb(image);
  if (image.depth !== 8) throw new Error(`Unsupported PNG bit depth ${image.depth}; expected 8`);
  if (image.channels !== 4) throw new Error(`Unsupported PNG channel count ${image.channels}; expected RGBA`);
  return { width: image.width, height: image.height, rgba: Uint8Array.from(image.data) };
}

async function encodePng({ width, height, rgba }) {
  const { encode } = await codec();
  return encode({ width, height, data: rgba, depth: 8, channels: 4 });
}

async function readP8Png(input) {
  const image = await decodePng(input);
  const picodata = base.getPicodataFromRgba(image.width, image.height, image.rgba);
  return { ...image, picodata, cartridge: base.parseP8PngPicodata(picodata) };
}

async function writeP8Png(cartridge, labelPng, luaBytes) {
  const label = await decodePng(labelPng);
  const picodata = base.serializeP8PngPicodata(cartridge, luaBytes);
  if (label.width * label.height < picodata.length) throw new RangeError('PNG label is too small for PICO-8 cartridge data');
  const rgba = base.getRgbaFromPicodata(picodata, label.rgba);
  return encodePng({ width: label.width, height: label.height, rgba });
}

/** Write a text/parsed .p8 cartridge through the normal writer pipeline into a PNG label. */
async function writeP8PngFromP8(source, labelPng, options = {}) {
  const { writeP8 } = require('./p8writer');
  const parsed = base.parseP8(writeP8(source, options));
  const version = parsed.version, sections = parsed.sections;
  const gfx = sections.gfx ? base.Gfx.fromLines(sections.gfx, version) : base.Gfx.empty(version);
  const cartridge = {
    version, gfx,
    map: sections.map ? base.MapSection.fromLines(sections.map, version, gfx) : base.MapSection.empty(version, gfx),
    gff: sections.gff ? base.Gff.fromLines(sections.gff, version) : base.Gff.empty(version),
    music: sections.music ? base.Music.fromLines(sections.music, version) : base.Music.empty(version),
    sfx: sections.sfx ? base.Sfx.fromLines(sections.sfx, version) : base.Sfx.empty(version),
  };
  return writeP8Png(cartridge, labelPng, base.encodeP8scii((sections.lua || []).join('')));
}

module.exports = Object.freeze({ decodePng, encodePng, readP8Png, writeP8Png, writeP8PngFromP8 });
