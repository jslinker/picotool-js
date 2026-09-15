(function initializeP8Png(root, factory) {
  const base = root?.PicotoolJS || (typeof require === 'function' ? { ...require('./picotool'), ...require('./sections') } : undefined);
  const api = factory(base);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.PicotoolJSPng = api;
    root.PicotoolJS = Object.freeze({ ...base, ...api });
  }
}(typeof globalThis === 'object' ? globalThis : this, function createP8Png(base) {
  'use strict';

  if (!base) throw new Error('picotool.js and sections.js must load before p8png.js');

  const CODE_OFFSET = 0x4300;
  const CODE_END = 0x8000;
  const VERSION_OFFSET = 0x8000;
  const COMPRESSED_LUA_CHAR_TABLE = base.encodeUtf8('#\n 0123456789abcdefghijklmnopqrstuvwxyz!#%(){}[]<>+=/*:;.,~_');
  const FUTURE_CODE_1 = base.encodeUtf8('if(_update60)_update=function()_update60()_update60()end');
  const FUTURE_CODE_2 = base.encodeUtf8('if(_update60)_update=function()_update60()_update_buttons()_update60()end');

  function asBytes(value) {
    if (typeof value === 'string') return base.encodeUtf8(value);
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return Uint8Array.from(value);
  }

  function endsWithBytes(value, suffix) {
    if (suffix.length > value.length) return false;
    for (let index = 0; index < suffix.length; index += 1) if (value[value.length - suffix.length + index] !== suffix[index]) return false;
    return true;
  }

  function containsBytes(value, search) {
    outer: for (let start = 0; start <= value.length - search.length; start += 1) {
      for (let index = 0; index < search.length; index += 1) if (value[start + index] !== search[index]) continue outer;
      return true;
    }
    return false;
  }

  function findRepeatableBlock(data, position) {
    const maximumLength = Math.min(17, data.length - position);
    const maximumHistory = Math.min((255 - COMPRESSED_LUA_CHAR_TABLE.length) * 16, position);
    let bestLength = 0, bestIndex = -100000;
    for (let index = position - maximumHistory; index < position; index += 1) {
      let cursor = index;
      while (cursor - index < maximumLength && cursor < position && data[cursor] === data[position + cursor - index]) cursor += 1;
      if (cursor - index > bestLength) { bestLength = cursor - index; bestIndex = index; }
    }
    return [bestLength, position - bestIndex];
  }

  function compressCode(input) {
    let data = asBytes(input);
    const update60 = base.encodeUtf8('_update60');
    if (containsBytes(data, update60) && data.length < 0x10001 - FUTURE_CODE_2.length - 1) {
      const separator = data.at(-1) === 32 || data.at(-1) === 10 ? new Uint8Array() : Uint8Array.of(10);
      const expanded = new Uint8Array(data.length + separator.length + FUTURE_CODE_2.length);
      expanded.set(data); expanded.set(separator, data.length); expanded.set(FUTURE_CODE_2, data.length + separator.length); data = expanded;
    }
    const literalIndex = new Uint8Array(256);
    for (let index = 1; index < COMPRESSED_LUA_CHAR_TABLE.length; index += 1) literalIndex[COMPRESSED_LUA_CHAR_TABLE[index]] = index;
    const output = [];
    for (let position = 0; position < data.length;) {
      const [length, offset] = findRepeatableBlock(data, position);
      if (length >= 3) {
        output.push(Math.floor(offset / 16) + COMPRESSED_LUA_CHAR_TABLE.length, offset % 16 + (length - 2) * 16);
        position += length;
      } else {
        const literal = literalIndex[data[position]];
        output.push(literal);
        if (literal === 0) output.push(data[position]);
        position += 1;
      }
    }
    return Uint8Array.from(output);
  }

  function decompressCode(input) {
    const data = asBytes(input), codeLength = data[4] << 8 | data[5];
    if (data[6] !== 0 || data[7] !== 0) throw new Error('Invalid compressed Lua header');
    const output = new Uint8Array(codeLength);
    let inputIndex = 8, outputIndex = 0;
    while (outputIndex < codeLength && inputIndex < data.length) {
      const command = data[inputIndex];
      if (command === 0) { inputIndex += 1; output[outputIndex] = data[inputIndex]; outputIndex += 1; }
      else if (command <= 0x3b) { output[outputIndex] = COMPRESSED_LUA_CHAR_TABLE[command]; outputIndex += 1; }
      else {
        inputIndex += 1;
        const offset = (command - 0x3c) * 16 + (data[inputIndex] & 15), length = (data[inputIndex] >> 4) + 2;
        output.set(output.slice(outputIndex - offset, outputIndex - offset + length), outputIndex);
        outputIndex += length;
      }
      inputIndex += 1;
    }
    let start = 0, end = output.length;
    while (start < end && output[start] === 0) start += 1;
    while (end > start && output[end - 1] === 0) end -= 1;
    let code = output.slice(start, end);
    for (const suffix of [FUTURE_CODE_1, FUTURE_CODE_2]) if (endsWithBytes(code, suffix)) {
      code = code.slice(0, code.length - suffix.length);
      if (code.at(-1) === 10) code = code.slice(0, -1);
      break;
    }
    return { codeLength, code, compressedSize: inputIndex };
  }

  function getCodeFromBytes(input, version) {
    const data = asBytes(input);
    let result;
    if (version === 0 || data[0] !== 0x3a || data[1] !== 0x63 || data[2] !== 0x3a || data[3] !== 0) {
      const zero = data.indexOf(0), codeLength = zero < 0 ? CODE_END - CODE_OFFSET : zero;
      const code = new Uint8Array(codeLength + 1); code.set(data.slice(0, codeLength)); code[codeLength] = 10;
      result = { codeLength, code, compressedSize: null };
    } else result = decompressCode(data);
    result.code = result.code.map((byte) => byte === 13 ? 32 : byte);
    return result;
  }

  function getBytesFromCode(input) {
    const code = asBytes(input), compressed = compressCode(code);
    if (code.length > 0xffff) throw new RangeError('PICO-8 Lua code is too large for the PNG code-length header');
    let encoded;
    if (compressed.length < code.length) {
      encoded = new Uint8Array(8 + compressed.length);
      encoded.set([0x3a, 0x63, 0x3a, 0, code.length >> 8, code.length & 255, 0, 0]);
      encoded.set(compressed, 8);
    } else encoded = code;
    const output = new Uint8Array(CODE_END - CODE_OFFSET);
    if (encoded.length > output.length) throw new RangeError('PICO-8 Lua code does not fit in the PNG code region');
    output.set(encoded);
    return output;
  }

  function getPicodataFromRgba(width, height, rgba) {
    const pixels = asBytes(rgba);
    if (pixels.length !== width * height * 4) throw new RangeError('RGBA data length does not match the image dimensions');
    const picodata = new Uint8Array(width * height);
    for (let pixel = 0; pixel < picodata.length; pixel += 1) {
      const offset = pixel * 4;
      picodata[pixel] = (pixels[offset + 2] & 3) | ((pixels[offset + 1] & 3) << 2) | ((pixels[offset] & 3) << 4) | ((pixels[offset + 3] & 3) << 6);
    }
    return picodata;
  }

  function getRgbaFromPicodata(picodataInput, rgbaInput) {
    const picodata = asBytes(picodataInput), rgba = asBytes(rgbaInput).slice();
    const count = Math.min(picodata.length, Math.floor(rgba.length / 4));
    for (let pixel = 0; pixel < count; pixel += 1) {
      const offset = pixel * 4, byte = picodata[pixel];
      rgba[offset + 2] = (rgba[offset + 2] & 252) | (byte & 3);
      rgba[offset + 1] = (rgba[offset + 1] & 252) | ((byte >> 2) & 3);
      rgba[offset] = (rgba[offset] & 252) | ((byte >> 4) & 3);
      rgba[offset + 3] = (rgba[offset + 3] & 252) | ((byte >> 6) & 3);
    }
    return rgba;
  }

  function parseP8PngPicodata(input) {
    const data = asBytes(input);
    if (data.length <= VERSION_OFFSET) throw new RangeError('P8 PNG data must contain at least 0x8001 hidden bytes');
    const version = data[VERSION_OFFSET], code = getCodeFromBytes(data.slice(CODE_OFFSET, CODE_END), version);
    const gfx = base.Gfx.fromBytes(data.slice(0, 0x2000), version);
    return Object.freeze({
      format: 'p8.png', version, code,
      gfx,
      map: base.MapSection.fromBytes(data.slice(0x2000, 0x3000), version, gfx),
      gff: base.Gff.fromBytes(data.slice(0x3000, 0x3100), version),
      music: base.Music.fromBytes(data.slice(0x3100, 0x3200), version),
      sfx: base.Sfx.fromBytes(data.slice(0x3200, 0x4300), version),
    });
  }

  function serializeP8PngPicodata(cartridge, luaBytes) {
    const output = new Uint8Array(VERSION_OFFSET + 1);
    output.set(cartridge.gfx.toBytes(), 0x0000);
    output.set(cartridge.map.toBytes(), 0x2000);
    output.set(cartridge.gff.toBytes(), 0x3000);
    output.set(cartridge.music.toBytes(), 0x3100);
    output.set(cartridge.sfx.toBytes(), 0x3200);
    output.set(getBytesFromCode(luaBytes ?? cartridge.code?.code ?? new Uint8Array()), CODE_OFFSET);
    output[VERSION_OFFSET] = cartridge.version;
    return output;
  }

  function snapshotP8PngPicodata(input, name) {
    const parsed = parseP8PngPicodata(input);
    const domains = ['gfx', 'gff', 'map', 'sfx', 'music'].map((domain) => ({ name: domain, byteLength: parsed[domain]._data.length, fnv1a32: base.fnv1a32(parsed[domain]._data) }));
    return {
      name, version: parsed.version,
      code: { byteLength: parsed.code.code.length, codeLength: parsed.code.codeLength, compressedSize: parsed.code.compressedSize, fnv1a32: base.fnv1a32(parsed.code.code) },
      domainMemory: domains,
    };
  }

  return Object.freeze({ CODE_END, CODE_OFFSET, VERSION_OFFSET, compressCode, decompressCode, getCodeFromBytes,
    getBytesFromCode, getPicodataFromRgba, getRgbaFromPicodata, parseP8PngPicodata,
    serializeP8PngPicodata, snapshotP8PngPicodata });
}));
