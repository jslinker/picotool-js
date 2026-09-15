(function initializePicotool(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PicotoolJS = api;
}(typeof globalThis === 'object' ? globalThis : this, function createPicotool() {
  'use strict';

  const P8SCII = typeof globalThis === 'object' && globalThis.PicotoolP8SCII
    ? globalThis.PicotoolP8SCII
    : (typeof require === 'function' ? require('./p8scii-map') : undefined);
  if (!P8SCII) throw new Error('p8scii-map.js must load before picotool.js');
  const UNICODE_TO_P8SCII = new Map(P8SCII.map((value, code) => [value, code]));
  const UNICODE_WIDTHS = new Map([...UNICODE_TO_P8SCII.keys()].map((value) => [value[0], value.length]));

  const REPORT_SCHEMA = 'picotool-parity/1';
  const HEADER = 'pico-8 cartridge // http://www.pico-8.com';
  const SECTION_NAMES = Object.freeze(['lua', 'gfx', 'gff', 'map', 'sfx', 'music', 'label']);
  const SECTION_NAME_SET = new Set(SECTION_NAMES);

  class P8Error extends Error {
    constructor(code, message, details) {
      super(message);
      this.name = 'P8Error';
      this.code = code;
      if (details !== undefined) this.details = details;
    }
  }

  function decodeUtf8(bytes) {
    if (typeof TextDecoder === 'function') return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const encoded = Array.from(bytes, (byte) => `%${byte.toString(16).padStart(2, '0')}`).join('');
    return decodeURIComponent(encoded);
  }

  function encodeUtf8(value) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(value);
    const encoded = unescape(encodeURIComponent(value));
    return Uint8Array.from(encoded, (character) => character.charCodeAt(0));
  }

  function encodeP8scii(value) {
    const result = [];
    for (let index = 0; index < value.length;) {
      const width = UNICODE_WIDTHS.get(value[index]);
      if (width === undefined) throw new TypeError(`Character is not in P8SCII: ${value[index]}`);
      const symbol = value.slice(index, index + width);
      const code = UNICODE_TO_P8SCII.get(symbol);
      if (code === undefined) throw new TypeError(`Character is not in P8SCII: ${symbol}`);
      result.push(code);
      index += width;
    }
    return Uint8Array.from(result);
  }

  function decodeP8scii(value) { return Array.from(value, (byte) => P8SCII[byte]).join(''); }

  function toText(source) {
    if (typeof source === 'string') return source;
    if (source instanceof Uint8Array || source instanceof ArrayBuffer) {
      const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
      return decodeUtf8(bytes);
    }
    throw new TypeError('PICO-8 cartridge input must be a string, Uint8Array, or ArrayBuffer');
  }

  function linesWithEndings(source) {
    return source.match(/[^\n]*\n|[^\n]+$/g) || [];
  }

  function withoutEnding(line) {
    return line.endsWith('\n') ? line.slice(0, -1) : line;
  }

  function parseP8(source) {
    const normalized = toText(source).replace(/\r\n?/g, '\n');
    const lines = linesWithEndings(normalized);
    if (withoutEnding(lines[0] || '') !== HEADER) {
      throw new P8Error('INVALID_HEADER', 'Invalid .p8: missing or corrupt header');
    }
    const versionMatch = /^version (\d+)$/.exec(withoutEnding(lines[1] || ''));
    if (!versionMatch) throw new P8Error('INVALID_HEADER', 'Invalid .p8: missing or corrupt header');

    const sections = Object.create(null);
    const sectionOrder = [];
    let current;
    for (let index = 2; index < lines.length; index += 1) {
      const line = lines[index];
      const delimiter = /^__(\w+)__$/.exec(withoutEnding(line));
      if (delimiter) {
        const name = delimiter[1];
        if (!SECTION_NAME_SET.has(name)) {
          throw new P8Error('INVALID_SECTION', `Invalid .p8: bad section delimiter ${name}`, name);
        }
        if (!Object.prototype.hasOwnProperty.call(sections, name)) sectionOrder.push(name);
        sections[name] = [];
        current = name;
      } else if (current !== undefined) {
        sections[current].push(line);
      }
    }

    return Object.freeze({
      format: 'p8',
      version: Number(versionMatch[1]),
      sectionOrder: Object.freeze(sectionOrder),
      sections: Object.freeze(sections),
    });
  }

  function fnv1a32(bytes) {
    let hash = 0x811c9dc5;
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  function snapshotP8(source, name) {
    const parsed = parseP8(source);
    return {
      name,
      version: parsed.version,
      sectionOrder: [...parsed.sectionOrder],
      sections: parsed.sectionOrder.map((sectionName) => {
        const lines = parsed.sections[sectionName];
        const bytes = encodeP8scii(lines.join(''));
        return {
          name: sectionName,
          lineCount: lines.length,
          byteLength: bytes.length,
          fnv1a32: fnv1a32(bytes),
        };
      }),
    };
  }

  function normalizedResult(action) {
    try {
      return { status: 'ok', value: action() };
    } catch (error) {
      if (error instanceof P8Error) return { status: 'error', value: error.code };
      throw error;
    }
  }

  return Object.freeze({
    HEADER,
    P8Error,
    REPORT_SCHEMA,
    SECTION_NAMES,
    encodeUtf8,
    encodeP8scii,
    decodeP8scii,
    fnv1a32,
    normalizedResult,
    parseP8,
    snapshotP8,
  });
}));
