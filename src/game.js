'use strict';

const base = { ...require('./picotool'), ...require('./sections'), ...require('./p8png') };
const { writeCartData } = require('./cartridge');

class LuaSource {
  constructor(code = new Uint8Array(), version = 33) {
    this.version = version;
    this.code = code instanceof Uint8Array ? code.slice() : base.encodeP8scii(String(code));
  }

  static fromLines(lines, version = 33) {
    return new LuaSource(base.encodeP8scii(Array.from(lines || []).join('')), version);
  }

  updateFromLines(lines) {
    this.code = base.encodeP8scii(Array.from(lines || []).join(''));
    return this;
  }

  update_from_lines(lines) { return this.updateFromLines(lines); }
  toBytes() { return this.code.slice(); }
  toLines() { return base.decodeP8scii(this.code).match(/[^\n]*\n|[^\n]+$/g) || []; }
  to_lines() { return this.toLines(); }
}

class Game {
  constructor(filename = null, compressedSize = null) {
    this.filename = filename;
    this.compressedSize = compressedSize;
    this.lua = null;
    this.gfx = null;
    this.gff = null;
    this.map = null;
    this.sfx = null;
    this.music = null;
    this.label = null;
    this.version = null;
  }

  get compressed_size() { return this.compressedSize; }
  set compressed_size(value) { this.compressedSize = value; }

  static makeEmptyGame(filename = null, version = 33) {
    const game = new Game(filename);
    game.version = version;
    game.lua = new LuaSource(new Uint8Array(), version);
    game.gfx = base.Gfx.empty(version);
    game.gff = base.Gff.empty(version);
    game.map = base.MapSection.empty(version, game.gfx);
    game.sfx = base.Sfx.empty(version);
    game.music = base.Music.empty(version);
    game.label = base.Gfx.empty(version);
    return game;
  }

  static make_empty_game(filename = null, version = 33) { return Game.makeEmptyGame(filename, version); }

  static fromCartridge(cartridge, filename = null) {
    if (cartridge instanceof Game) return cartridge;
    const game = new Game(filename, cartridge.code?.compressedSize ?? null);
    game.version = cartridge.version;
    if (cartridge.format === 'p8') {
      const sections = cartridge.sections;
      game.lua = LuaSource.fromLines(sections.lua, game.version);
      game.gfx = sections.gfx ? base.Gfx.fromLines(sections.gfx, game.version) : base.Gfx.empty(game.version);
      game.gff = sections.gff ? base.Gff.fromLines(sections.gff, game.version) : base.Gff.empty(game.version);
      game.map = sections.map ? base.MapSection.fromLines(sections.map, game.version, game.gfx) : base.MapSection.empty(game.version, game.gfx);
      game.sfx = sections.sfx ? base.Sfx.fromLines(sections.sfx, game.version) : base.Sfx.empty(game.version);
      game.music = sections.music ? base.Music.fromLines(sections.music, game.version) : base.Music.empty(game.version);
      game.label = sections.label ? base.Gfx.fromLines(sections.label, game.version) : null;
    } else {
      const stored = cartridge.code?.code ?? new Uint8Array();
      const length = cartridge.code?.codeLength;
      game.lua = new LuaSource(length == null ? stored : stored.slice(0, length), game.version);
      for (const domain of ['gfx', 'gff', 'map', 'sfx', 'music']) game[domain] = cartridge[domain];
    }
    return game;
  }

  static async fromFile(filename) {
    const { fromFile } = require('./file-api');
    return Game.fromCartridge(await fromFile(filename), filename);
  }

  static from_file(filename) { return Game.fromFile(filename); }
  static fromP8File(filename) { return Game.fromFile(filename); }
  static from_p8_file(filename) { return Game.fromP8File(filename); }

  getCompressedSize() {
    return this.compressedSize ?? base.compressCode(this.lua?.toBytes() ?? new Uint8Array()).length;
  }

  get_compressed_size() { return this.getCompressedSize(); }

  writeCartData(data, startAddress = 0) {
    writeCartData(this, data, startAddress);
    return this;
  }

  write_cart_data(data, startAddress = 0) { return this.writeCartData(data, startAddress); }

  toCartridge(format = 'p8.png') {
    if (format === 'p8') {
      const sections = { lua: this.lua?.toLines() ?? [], gfx: this.gfx.toLines(), gff: this.gff.toLines(),
        map: this.map.toLines(), sfx: this.sfx.toLines(), music: this.music.toLines() };
      if (this.label) sections.label = this.label.toLines();
      return { format: 'p8', version: this.version,
        sectionOrder: Object.freeze(Object.keys(sections)), sections: Object.freeze(sections) };
    }
    return { format: 'p8.png', version: this.version,
      code: { code: this.lua?.toBytes() ?? new Uint8Array(), codeLength: this.lua?.code.length ?? 0,
        compressedSize: this.compressedSize },
      gfx: this.gfx, gff: this.gff, map: this.map, sfx: this.sfx, music: this.music };
  }

  async toFile(filename, options = {}) {
    const { formatForFilename, toFile } = require('./file-api');
    return toFile(this.toCartridge(formatForFilename(filename)), filename, options);
  }

  to_file(filename, options = {}) { return this.toFile(filename, options); }
  toP8File(filename, options = {}) { return this.toFile(filename, options); }
  to_p8_file(filename, options = {}) { return this.toP8File(filename, options); }
}

module.exports = Object.freeze({ Game, LuaSource });
