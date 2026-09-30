#!/usr/bin/env node
'use strict';

// Tier-3 integration ports from the pinned game, parser, and SFX tests.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const p = require('../src');

const fixture = (name) => path.join(__dirname, '../tests/fixtures/tier3-final', name);
const sample = fs.readFile(fixture('lua-sample.lua'));
const includeCode = Buffer.from(`
print('before include')
#include subdir/inc.lua
print('after include')
`);
const includedCode = Buffer.from(`
print('zero')
-->8
print('one')
-- some other comment
-->8
print('two')

if (btnp(8)) mode=2
-->8
print('three')
`);

test('tests.pico8.game.game_test.TestP8Include.testIncludeLuaSubdir', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'p8-include-subdir-'));
  try {
    await fs.mkdir(path.join(dir, 'subdir'));
    await fs.writeFile(path.join(dir, 'subdir', 'inc.lua'), Buffer.concat([Buffer.from(includedCode.toString('ascii').trim()), Buffer.from('\n')]));
    const source = Buffer.from(`${p.HEADER}\nversion 33\n__lua__\n${includeCode.toString('ascii').trim()}\n`);
    const cart = path.join(dir, 't.p8');
    await fs.writeFile(cart, p.writeP8(source));
    const result = await p.processP8IncludesAsync(await fs.readFile(cart), {
      filename: cart, rootPath: dir,
      readFile: (filename) => fs.readFile(filename).catch((error) => error.code === 'ENOENT' ? undefined : Promise.reject(error)),
    });
    assert.deepEqual(Buffer.from(result), Buffer.from(`print('before include')\n${includedCode.toString('ascii').trim()}\nprint('after include')\n`));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('tests.pico8.game.game_test.TestP8PNGGame.testPngToPicodataFromFile', async () => {
  const png = await fs.readFile(fixture('test_gol.p8.png'));
  const image = await p.decodePng(png);
  const picodata = p.getPicodataFromRgba(image.width, image.height, image.rgba);
  assert.equal(picodata.length, 32800);
  assert.deepEqual(Array.from(picodata.slice(0x4300, 0x4300 + 24)), [
    58, 99, 58, 0, 4, 194, 0, 0, 0, 45, 0, 45, 2, 19, 13, 25, 17, 2, 27, 18, 2, 24, 21, 18,
  ]);
});

test('tests.pico8.game.game_test.TestP8PNGGame.testFromP8PNGFileV0', async () => {
  const cart = await p.fromFile(fixture('test_cart_memdump.p8.png'));
  const ast = p.parseLua(cart.code.code);
  assert.equal(ast.stats[0].constructor.name, 'StatFunctionCall');
  const tokens = p.tokenizeLua(cart.code.code);
  assert.deepEqual(tokens.slice(0, 4).map((token) => [token.constructor.name, token.value]), [
    ['TokComment', '-- memory dump'], ['TokNewline', '\n'],
    ['TokComment', '-- by dddaaannn'], ['TokNewline', '\n'],
  ]);
});

test('tests.pico8.lua.parser_test.TestParser.testProcessTokens', async () => {
  // Python get_tokens appends a newline to every split line, including the
  // final empty one. JS's public parser accepts source rather than tokens.
  const source = Buffer.concat([await sample, Buffer.from('\n')]);
  const ast = p.parseLua(source);
  assert.ok(ast);
  assert.equal(ast.stats.length, 14);
});

test('tests.pico8.sfx.sfx_test.TestHelloWorld.testGame', async () => {
  const cart = await p.fromFile(fixture('test_cart_memdump.p8.png'));
  const dataline = Buffer.from('d83e245118373931bc5b393158396b39183f393118373931bc5bb05139313931183f393118353931bc5b3931183b2137183f3931183f3931bc5b39313931393101100000', 'hex');
  assert.deepEqual(Buffer.from(cart.sfx._data.slice(68, 136)), dataline);
  assert.equal(cart.sfx.toLines()[1], '01100000183732440518433394033c65539403185432b543184733940318433394033c655306053940339403184733940318423394033c655394031845321433184733940318473394033c655394033940339403\n');
});
