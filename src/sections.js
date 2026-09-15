(function initializeSections(root, factory) {
  const base = root?.PicotoolJS || (typeof require === 'function' ? require('./picotool') : undefined);
  const api = factory(base);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.PicotoolJSSections = api;
    root.PicotoolJS = Object.freeze({ ...base, ...api });
  }
}(typeof globalThis === 'object' ? globalThis : this, function createSections(base) {
  'use strict';

  if (!base) throw new Error('picotool.js must load before sections.js');

  const TRANSPARENT = 16;
  const GFF = Object.freeze({ RED: 1, ORANGE: 2, YELLOW: 4, GREEN: 8, BLUE: 16, PURPLE: 32, PINK: 64, PEACH: 128, ALL: 255 });

  function assertInteger(value, minimum, maximum, name) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) throw new RangeError(`${name} must be ${minimum}..${maximum}`);
  }

  function hexToBytes(value) {
    const compact = value.trim();
    if (compact.length % 2 || /[^0-9a-f]/i.test(compact)) throw new Error('Invalid hexadecimal data');
    return Uint8Array.from({ length: compact.length / 2 }, (_, index) => Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16));
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  class BaseSection {
    constructor(data, version = 4) {
      this._data = data instanceof Uint8Array ? data.slice() : Uint8Array.from(data || []);
      this._version = version;
    }

    static fromLines(lines, version = 4) {
      return new this(hexToBytes(lines.join('').replace(/\s/g, '')), version);
    }

    static fromBytes(data, version = 4) {
      return new this(data, version);
    }

    toBytes() { return this._data.slice(); }

    toLines() {
      const lineBytes = this.constructor.HEX_LINE_LENGTH_BYTES || 64;
      const result = [];
      for (let offset = 0; offset < this._data.length; offset += lineBytes) result.push(`${bytesToHex(this._data.subarray(offset, offset + lineBytes))}\n`);
      return result;
    }
  }

  class Gfx extends BaseSection {
    static HEX_LINE_LENGTH_BYTES = 64;
    static empty(version = 4) { return new Gfx(new Uint8Array(8192), version); }

    static fromLines(lines, version = 4) {
      const rows = [];
      for (const line of lines) {
        if (line.length !== 129) continue;
        const pixels = line.trim();
        let swapped = '';
        for (let index = 0; index < 128; index += 2) swapped += pixels[index + 1] + pixels[index];
        rows.push(hexToBytes(swapped));
      }
      const data = new Uint8Array(rows.length * 64);
      rows.forEach((row, index) => data.set(row, index * 64));
      return new Gfx(data, version);
    }

    toLines() {
      const result = [];
      for (let offset = 0; offset < this._data.length; offset += 64) {
        let line = '';
        for (const byte of this._data.subarray(offset, offset + 64)) line += ((byte & 15) << 4 | byte >> 4).toString(16).padStart(2, '0');
        result.push(`${line}\n`);
      }
      return result;
    }

    getSprite(id, tileWidth = 1, tileHeight = 1) {
      assertInteger(id, 0, 255, 'Sprite ID');
      if (!Number.isInteger(tileWidth) || tileWidth < 1 || !Number.isInteger(tileHeight) || tileHeight < 1) throw new RangeError('Sprite dimensions must be positive integers');
      const firstRow = Math.floor(id / 16), firstColumn = id % 16, result = [];
      for (let tileY = firstRow; tileY < firstRow + tileHeight; tileY += 1) {
        for (let pixelY = 0; pixelY < 8; pixelY += 1) {
          const row = [];
          for (let tileX = firstColumn; tileX < firstColumn + tileWidth; tileX += 1) {
            if (tileX > 15 || tileY > 15) { row.push(...Array(8).fill(0)); continue; }
            for (let pixelX = 0; pixelX < 8; pixelX += 1) {
              const byte = this._data[tileY * 512 + pixelY * 64 + tileX * 4 + Math.floor(pixelX / 2)];
              row.push(pixelX % 2 ? byte >> 4 : byte & 15);
            }
          }
          result.push(row);
        }
      }
      return result;
    }

    setSprite(id, sprite, tileXOffset = 0, tileYOffset = 0) {
      assertInteger(id, 0, 255, 'Sprite ID');
      const startX = (id % 16) * 8 + tileXOffset, startY = Math.floor(id / 16) * 8 + tileYOffset;
      sprite.forEach((row, y) => row.forEach((value, x) => {
        const targetX = startX + x, targetY = startY + y;
        if (value === TRANSPARENT || targetX < 0 || targetY < 0 || targetX >= 128 || targetY >= 128) return;
        assertInteger(value, 0, 15, 'Pixel');
        const offset = targetY * 64 + Math.floor(targetX / 2), byte = this._data[offset];
        this._data[offset] = targetX % 2 ? (byte & 15) | (value << 4) : (byte & 240) | value;
      }));
    }
  }

  class Gff extends BaseSection {
    static HEX_LINE_LENGTH_BYTES = 128;
    static empty(version = 4) { return new Gff(new Uint8Array(256), version); }
    getFlags(id, flags = GFF.ALL) { assertInteger(id, 0, 255, 'Sprite ID'); return this._data[id] & flags; }
    setFlags(id, flags) { assertInteger(id, 0, 255, 'Sprite ID'); this._data[id] |= flags & GFF.ALL; }
    clearFlags(id, flags) { assertInteger(id, 0, 255, 'Sprite ID'); this._data[id] &= ~flags & GFF.ALL; }
    resetFlags(id, flags) { assertInteger(id, 0, 255, 'Sprite ID'); this._data[id] = flags & GFF.ALL; }
  }

  class MapSection extends BaseSection {
    static HEX_LINE_LENGTH_BYTES = 128;
    constructor(data, version = 4, gfx = null) { super(data, version); this._gfx = gfx; }
    static empty(version = 4, gfx = null) { return new MapSection(new Uint8Array(4096), version, gfx); }
    static fromLines(lines, version = 4, gfx = null) { return new MapSection(hexToBytes(lines.join('').replace(/\s/g, '')), version, gfx); }
    static fromBytes(data, version = 4, gfx = null) { return new MapSection(data, version, gfx); }

    getCell(x, y) {
      assertInteger(x, 0, 127, 'Map x'); assertInteger(y, 0, this._gfx ? 63 : 31, 'Map y');
      return y < 32 ? this._data[y * 128 + x] : this._gfx._data[4096 + (y - 32) * 128 + x];
    }
    setCell(x, y, value) {
      assertInteger(x, 0, 127, 'Map x'); assertInteger(y, 0, this._gfx ? 63 : 31, 'Map y'); assertInteger(value, 0, 255, 'Tile');
      if (y < 32) this._data[y * 128 + x] = value;
      else this._gfx._data[4096 + (y - 32) * 128 + x] = value;
    }
    getRectTiles(x, y, width = 1, height = 1) {
      assertInteger(x, 0, 127, 'Map x');
      if (width < 1 || height < 1 || y < 0 || y + height > (this._gfx ? 64 : 32)) throw new RangeError('Invalid map rectangle');
      return Array.from({ length: height }, (_, dy) => Array.from({ length: width }, (_, dx) => x + dx > 127 ? 0 : this.getCell(x + dx, y + dy)));
    }
    setRectTiles(rect, x, y) {
      rect.forEach((row, dy) => row.forEach((value, dx) => {
        if (x + dx > 127 || y + dy > 63) return;
        this.setCell(x + dx, y + dy, value);
      }));
    }
    getRectPixels(x, y, width = 1, height = 1) {
      if (!this._gfx) throw new Error('Map needs graphics data');
      const result = [];
      for (const tileRow of this.getRectTiles(x, y, width, height)) {
        const pixelRows = Array.from({ length: 8 }, () => []);
        for (const id of tileRow) {
          const sprite = id === 0 ? Array.from({ length: 8 }, () => Array(8).fill(0)) : this._gfx.getSprite(id);
          for (let row = 0; row < 8; row += 1) pixelRows[row].push(...sprite[row]);
        }
        result.push(...pixelRows);
      }
      return result;
    }
  }

  class Music extends BaseSection {
    static empty(version = 4) { return new Music(Uint8Array.from(Array(64).fill([0x41, 0x42, 0x43, 0x44]).flat()), version); }
    static fromLines(lines, version = 4) {
      const data = [];
      for (const line of lines) {
        if (!line.includes(' ')) continue;
        const [flagText, channelText] = line.trim().split(' '), flags = Number.parseInt(flagText, 16);
        const channels = hexToBytes(channelText);
        data.push(channels[0] | ((flags & 1) << 7), channels[1] | ((flags & 2) << 6), channels[2] | ((flags & 4) << 5), channels[3]);
      }
      return new Music(data, version);
    }
    toLines() {
      const lines = [];
      for (let offset = 0; offset < this._data.length; offset += 4) {
        const flags = ((this._data[offset] & 128) >> 7) | ((this._data[offset + 1] & 128) >> 6) | ((this._data[offset + 2] & 128) >> 5);
        const channels = this._data.subarray(offset, offset + 4).map((value) => value & 127);
        lines.push(`${flags.toString(16).padStart(2, '0')} ${bytesToHex(channels)}\n`);
      }
      return lines;
    }
    getChannel(id, channel) { assertInteger(id, 0, 63, 'Music ID'); assertInteger(channel, 0, 3, 'Channel'); const value = this._data[id * 4 + channel] & 127; return value > 63 ? null : value; }
    setChannel(id, channel, pattern) {
      assertInteger(id, 0, 63, 'Music ID'); assertInteger(channel, 0, 3, 'Channel');
      if (pattern !== null) assertInteger(pattern, 0, 63, 'SFX ID');
      const value = pattern === null ? 0x41 + channel : pattern;
      this._data[id * 4 + channel] = (this._data[id * 4 + channel] & 128) | value;
    }
    getProperties(id) { assertInteger(id, 0, 63, 'Music ID'); return [0, 1, 2].map((channel) => Boolean(this._data[id * 4 + channel] & 128)); }
    setProperties(id, properties = {}) {
      assertInteger(id, 0, 63, 'Music ID');
      ['begin', 'end', 'stop'].forEach((name, channel) => {
        if (properties[name] === undefined || properties[name] === null) return;
        this._data[id * 4 + channel] = (this._data[id * 4 + channel] & 127) | (properties[name] ? 128 : 0);
      });
    }
  }

  class Sfx extends BaseSection {
    static empty(version = 4) {
      const result = new Sfx(new Uint8Array(4352), version);
      result.setProperties(0, { noteDuration: 1 });
      for (let id = 1; id < 64; id += 1) result.setProperties(id, { noteDuration: 16 });
      return result;
    }
    static fromLines(lines, version = 4) {
      const result = Sfx.empty(version); let id = 0;
      for (const line of lines) {
        if (line.length !== 169) continue;
        result.setProperties(id, { editorMode: Number.parseInt(line.slice(0, 2), 16), noteDuration: Number.parseInt(line.slice(2, 4), 16), loopStart: Number.parseInt(line.slice(4, 6), 16), loopEnd: Number.parseInt(line.slice(6, 8), 16) });
        for (let note = 0; note < 32; note += 1) {
          const offset = 8 + note * 5;
          result.setNote(id, note, { pitch: Number.parseInt(line.slice(offset, offset + 2), 16), waveform: Number.parseInt(line[offset + 2], 16), volume: Number.parseInt(line[offset + 3], 16), effect: Number.parseInt(line[offset + 4], 16) });
        }
        id += 1;
      }
      return result;
    }
    toLines() {
      const lines = [];
      for (let id = 0; id < 64; id += 1) {
        let line = bytesToHex(this.getProperties(id));
        for (let note = 0; note < 32; note += 1) {
          const [pitch, waveform, volume, effect] = this.getNote(id, note);
          line += `${pitch.toString(16).padStart(2, '0')}${waveform.toString(16)}${volume.toString(16)}${effect.toString(16)}`;
        }
        lines.push(`${line}\n`);
      }
      return lines;
    }
    getNote(id, note) {
      assertInteger(id, 0, 63, 'SFX ID'); assertInteger(note, 0, 31, 'Note');
      const lsb = this._data[id * 68 + note * 2], msb = this._data[id * 68 + note * 2 + 1];
      return [lsb & 63, ((msb & 128) >> 4) | ((msb & 1) << 2) | ((lsb & 192) >> 6), (msb & 14) >> 1, (msb & 112) >> 4];
    }
    setNote(id, note, values = {}) {
      assertInteger(id, 0, 63, 'SFX ID'); assertInteger(note, 0, 31, 'Note');
      const offset = id * 68 + note * 2; let lsb = this._data[offset], msb = this._data[offset + 1];
      if (values.pitch !== undefined) { assertInteger(values.pitch, 0, 63, 'Pitch'); lsb = (lsb & 192) | values.pitch; }
      if (values.waveform !== undefined) { assertInteger(values.waveform, 0, 15, 'Waveform'); lsb = (lsb & 63) | ((values.waveform & 3) << 6); msb = (msb & 126) | ((values.waveform & 4) >> 2) | ((values.waveform & 8) << 4); }
      if (values.volume !== undefined) { assertInteger(values.volume, 0, 7, 'Volume'); msb = (msb & 241) | (values.volume << 1); }
      if (values.effect !== undefined) { assertInteger(values.effect, 0, 7, 'Effect'); msb = (msb & 143) | (values.effect << 4); }
      this._data[offset] = lsb; this._data[offset + 1] = msb;
    }
    getProperties(id) { assertInteger(id, 0, 63, 'SFX ID'); return Array.from(this._data.subarray(id * 68 + 64, id * 68 + 68)); }
    setProperties(id, values = {}) {
      assertInteger(id, 0, 63, 'SFX ID');
      const fields = [['editorMode', 64], ['noteDuration', 65], ['loopStart', 66], ['loopEnd', 67]];
      for (const [name, offset] of fields) if (values[name] !== undefined && values[name] !== null) this._data[id * 68 + offset] = values[name];
    }
  }

  function snapshotDomainP8(source, name) {
    const parsed = base.parseP8(source), version = parsed.version, domains = [];
    const constructors = { gfx: Gfx, gff: Gff, map: MapSection, sfx: Sfx, music: Music };
    let graphics = null;
    for (const sectionName of ['gfx', 'gff', 'map', 'sfx', 'music']) {
      if (!parsed.sections[sectionName]) continue;
      const instance = sectionName === 'map'
        ? MapSection.fromLines(parsed.sections.map, version, graphics)
        : constructors[sectionName].fromLines(parsed.sections[sectionName], version);
      if (sectionName === 'gfx') graphics = instance;
      domains.push({ name: sectionName, byteLength: instance._data.length, fnv1a32: base.fnv1a32(instance._data) });
    }
    return { ...base.snapshotP8(source, name), domainMemory: domains };
  }

  return Object.freeze({ BaseSection, GFF, Gff, Gfx, MapSection, Music, Sfx, TRANSPARENT, bytesToHex, hexToBytes, snapshotDomainP8 });
}));
