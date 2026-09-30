#!/usr/bin/env node
'use strict';

// Ports of the tier-2 game tests from the pinned upstream game_test.py.
// The upstream zero-assertion smoke cases remain zero-assertion smoke cases.
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const p = require('../src');

const fixture = (name) => join(__dirname, '../tests/fixtures/tier2-game', name);
const validP8 = Buffer.from(
  'pico-8 cartridge // http://www.pico-8.com\nversion 4\n__lua__\n' +
  '\n__gfx__\n' + ('0'.repeat(128) + '\n').repeat(128) +
  '__gff__\n' + ('0'.repeat(256) + '\n').repeat(2) +
  '__map__\n' + ('0'.repeat(256) + '\n').repeat(32) +
  '__sfx__\n' + '0001' + '0'.repeat(164) + '\n' + ('001' + '0'.repeat(165) + '\n').repeat(63) +
  '__music__\n' + '00 41424344\n'.repeat(64) + '\n\n', 'ascii');

function versions(cart) {
  // Python exposes each formatter domain's _version; JS exposes a LuaSource.version
  // and section _version, so inspect the corresponding six domain properties.
  const game = p.Game.fromCartridge(cart);
  assert.equal(game.lua.version, 4);
  assert.equal(game.gfx._version, 4);
  assert.equal(game.gff._version, 4);
  assert.equal(game.map._version, 4);
  assert.equal(game.sfx._version, 4);
  assert.equal(game.music._version, 4);
}

test('tests.pico8.game.game_test.TestFile.testFromP8File', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'p8-game-test-'));
  try {
    const filename = join(directory, 'test.p8');
    await require('node:fs/promises').writeFile(filename, validP8);
    versions(await p.fromFile(filename));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('tests.pico8.game.game_test.TestFile.testSelectsP8Formatter', () => {
  assert.equal(p.formatForFilename('foo.p8'), 'p8');
});

test('tests.pico8.game.game_test.TestFile.testSelectsP8PNGFormatter', () => {
  assert.equal(p.formatForFilename('foo.p8.png'), 'p8.png');
});

test('tests.pico8.game.game_test.TestFile.testToFile', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'p8-game-test-'));
  try {
    const filename = join(directory, 'test.p8');
    await p.toFile(await p.fromBytes(validP8, 'source.p8'), filename);
    versions(await p.fromFile(filename));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('tests.pico8.game.game_test.TestFile.testUnrecognizedFileType', () => {
  assert.throws(() => p.formatForFilename('foo.UNRECOGNIZED_FILE_TYPE'),
    (error) => error instanceof p.UnrecognizedFileType && error.filename === 'foo.UNRECOGNIZED_FILE_TYPE');
});

test('tests.pico8.game.game_test.TestGameToP8.testCharCountWarning', () => {
  const cart = p.parseP8(p.encodeUtf8(`${p.HEADER}\nversion 33\n__lua__\n${'-- 345678901234567890123456789012345678\n'.repeat(1640)}`));
  const result = p.writeP8WithDiagnostics(cart, { filename: 'test' });
  assert(result.warnings[0].startsWith('test: warning: character count'));
});

test('tests.pico8.game.game_test.TestGameToP8.testToP8FileFromP8', async () => {
  const source = await readFile(fixture('test_cart.p8'));
  assert.deepEqual(Buffer.from(p.writeP8(await p.fromBytes(source, 'test_cart.p8'))), source);
});

test('tests.pico8.game.game_test.TestGameToP8.testToP8FileFromP8PreservesLabel', async () => {
  const source = await readFile(fixture('test_cart_with_label.p8'));
  assert.deepEqual(Buffer.from(p.writeP8(await p.fromBytes(source, 'test_cart_with_label.p8'))), source);
});

test('tests.pico8.game.game_test.TestGameToP8.testTokenCountWarning', () => {
  const line = 'a=b=c=d=e=f=g=h=i=j=k=l=m=n=o=p=q=r=s=t=u';
  const cart = p.parseP8(p.encodeUtf8(`${p.HEADER}\nversion 33\n__lua__\n${(line + '\n').repeat(199)}${line}`));
  const result = p.writeP8WithDiagnostics(cart);
  assert(result.warnings[0].startsWith('warning: token count'));
});

test('tests.pico8.game.game_test.TestP8Game.testFromP8FileGoL', async () => {
  // Upstream intentionally parses the fixture without validating its contents.
  p.parseP8(await readFile(fixture('test_gol.p8')));
});

test('tests.pico8.game.game_test.TestP8Game.testInvalidP8HeaderErrorMsg', () => {
  // JS exposes the shared P8Error type; stringify the actual parser error.
  assert.throws(() => p.parseP8(p.encodeUtf8('INVALID HEADER\nversion 4\n__lua__\n')), (error) => {
    assert.equal(error.code, 'INVALID_HEADER');
    String(error);
    return true;
  });
});

test('tests.pico8.game.game_test.TestP8Game.testInvalidP8SectionErrorMsg', () => {
  // Use a valid header followed by the malformed section from the parser's error path.
  assert.throws(() => p.parseP8(p.encodeUtf8(`${p.HEADER}\nversion 4\n__lua__\n\n__bad__\n\n`)), (error) => {
    assert.equal(error.code, 'INVALID_SECTION');
    String(error);
    return true;
  });
});
