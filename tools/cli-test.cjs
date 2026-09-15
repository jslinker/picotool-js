'use strict';

const assert = require('assert');
const { resolve } = require('node:path');
const { formatStats, main, mainAsync, parseArgs, statsRows } = require('../src/cli');

const cart = [
  'pico-8 cartridge // http://www.pico-8.com\n', 'version 33\n', '__lua__\n',
  '-- Title\n', '-- Byline\n', 'print("hello")\n',
].join('');
assert.deepStrictEqual(parseArgs(['--quiet', 'stats', '--csv', 'one.p8', 'two.p8']), {
  quiet: true, debug: false, command: 'stats', csv: true, filename: ['one.p8', 'two.p8'],
});
assert.throws(() => parseArgs(['stats']), /filename/);
assert.throws(() => parseArgs(['bogus']), /unknown command/);
assert.deepStrictEqual(parseArgs(['listlua', '--show-line-numbers', '--pure-lua', 'one.p8']), {
  quiet: false, debug: false, command: 'listlua', csv: false, showLineNumbers: true,
  pureLua: true, filename: ['one.p8'],
});

const files = new Map([['one.p8', Buffer.from(cart)], ['two.p8', Buffer.from(cart)]]);
const read = (filename) => files.get(filename) || (() => { throw new Error('missing'); })();
const loaded = statsRows(['one.p8', 'bad.txt', 'two.p8'], read);
assert.strictEqual(loaded.rows.length, 2);
assert.strictEqual(loaded.errors.length, 1);
assert.match(formatStats(loaded.rows), /Title \(one\.p8\)/);
assert.match(formatStats(loaded.rows, true), /^Filename,Title,Byline,Code Version/m);
assert.match(formatStats(loaded.rows, true), /\r\n/);

let out = '';
let err = '';
assert.strictEqual(main(['stats', 'one.p8', 'missing.p8'], {
  readFile: read, write: (text) => { out += text; }, error: (text) => { err += text; },
}), 0);
assert.match(out, /one\.p8/);
assert.match(err, /missing\.p8: could not load cart/);
assert.strictEqual(main(['stats', 'missing.p8'], {
  readFile: read, write: () => {}, error: (text) => { err += text; },
}), 1);
let listing = '';
assert.strictEqual(main(['listlua', 'one.p8'], { readFile: read, write: (text) => { listing += text; } }), 0);
assert.match(listing, /print/);
listing = '';
assert.strictEqual(main(['listtokens', 'one.p8'], { readFile: read, write: (text) => { listing += text; } }), 0);
assert.match(listing, /<0:/);

const png = resolve(__dirname, '../../../vendor/picotool/tests/testdata/test_cart.p8.png');
mainAsync(['stats', png], {
  write: (text) => { out += text; }, error: (text) => { err += text; },
}).then((status) => {
  assert.strictEqual(status, 0);
  assert.match(out, /test_cart\.p8\.png/);
  console.log('cli tests passed');
}).catch((error) => { throw error; });
