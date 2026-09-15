'use strict';

const base = require('./picotool');
const sections = require('./sections');
const p8png = require('./p8png');
const p8writer = require('./p8writer');
const build = require('./build');
const includes = require('./includes');
const minify = require('./lua-minify');
const formatToken = require('./lua-format-token');
const requireBuild = require('./require-build');
const astWriters = require('./lua-ast-writers');
const pure = require('./lua-pure');
const stats = require('./stats');
const listing = require('./listing');
const pngTransport = require('./png-transport');
const cartridge = require('./cartridge');
const fileApi = require('./file-api');
const game = require('./game');
const lexer = require('./lua-lexer');
const find = require('./lua-find');
const walker = require('./lua-ast-walker');
const astModel = require('./lua-ast-model');
const astPrint = require('./ast-print');

module.exports = Object.freeze({ ...base, ...sections, ...p8png, ...p8writer, ...build, ...includes, ...minify, ...formatToken, ...requireBuild, ...astWriters, ...pure, ...stats, ...listing, ...pngTransport, ...cartridge, ...fileApi, ...game, ...lexer, ...find, ...walker, ...astModel, ...astPrint });
