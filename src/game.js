'use strict';

const core = require('./game-browser');
const { Game: BrowserGame } = core;

class Game extends BrowserGame {
  static async fromFile(filename) {
    const { fromFile } = require('./file-api');
    return this.fromCartridge(await fromFile(filename), filename);
  }
  static from_file(filename) { return this.fromFile(filename); }
  static fromP8File(filename) { return this.fromFile(filename); }
  static from_p8_file(filename) { return this.fromP8File(filename); }
  async toFile(filename, options = {}) {
    const { formatForFilename, toFile } = require('./file-api');
    return toFile(this.toCartridge(formatForFilename(filename)), filename, options);
  }
  to_file(filename, options = {}) { return this.toFile(filename, options); }
  toP8File(filename, options = {}) { return this.toFile(filename, options); }
  to_p8_file(filename, options = {}) { return this.toP8File(filename, options); }
}

module.exports = Object.freeze({ Game, LuaSource: core.LuaSource });
