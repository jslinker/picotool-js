#!/usr/bin/env node
'use strict';

// Literal integration ports of the upstream TestP8Include cases. Each case
// writes the same cart/include files the Python test creates, then exercises
// the asynchronous include transport against those real paths.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { encodePng, processP8IncludesAsync, writeP8, writeP8PngFromP8, linesForTab,
  P8IncludeOutsideOfAllowedDirectory } = require('../src');

const codeWithTabs = Buffer.from(`
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
const codeWithTabsTabTwo = Buffer.from(`
print('two')

if (btnp(8)) mode=2
`);
const includeSources = {
  lua: Buffer.from(`
print('before include')
#include inc.lua
print('after include')
`),
  p8: Buffer.from(`
print('before include')
#include inc.p8
print('after include')
`),
  p8Tab: Buffer.from(`
print('before include')
#include inc.p8:2
print('after include')
`),
  png: Buffer.from(`
print('before include')
#include inc.p8.png
print('after include')
`),
  pngTab: Buffer.from(`
print('before include')
#include inc.p8.png:2
print('after include')
`),
  parent: Buffer.from(`
print('before include')
#include ../inc.lua
print('after include')
`),
};
// Upstream make_test_cart_from_code uses make_empty_game's default version 33.
const p8Header = 'pico-8 cartridge // http://www.pico-8.com\nversion 33\n__lua__\n';
const asP8 = (lua) => writeP8(Buffer.from(p8Header + Buffer.from(lua).toString('latin1').trim() + '\n'));
async function inTempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'picotool-include-'));
  try { await run(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
async function putP8(dir, name, lua) {
  const filename = path.join(dir, name);
  await fs.writeFile(filename, asP8(lua));
  return filename;
}
async function putP8Png(dir, name, lua) {
  const filename = path.join(dir, name);
  const p8 = asP8(lua);
  const label = await encodePng({ width: 160, height: 205, rgba: new Uint8Array(160 * 205 * 4).fill(255) });
  await fs.writeFile(filename, await writeP8PngFromP8(p8, label));
  return filename;
}
async function expanded(dir, cartPath) {
  const source = await fs.readFile(cartPath);
  return Buffer.from(await processP8IncludesAsync(source, {
    filename: cartPath,
    rootPath: dir,
    readFile: (filename) => fs.readFile(filename).catch((error) => error.code === 'ENOENT' ? undefined : Promise.reject(error)),
  }));
}
function expected(inner) {
  return Buffer.from(`print('before include')\n${Buffer.from(inner).toString('latin1').trim()}\nprint('after include')\n`);
}

test('tests.pico8.game.game_test.TestP8Include.testLinesForTabYieldsOneTab', () => {
  const lines = codeWithTabs.toString('latin1').split('\n');
  assert.deepEqual(linesForTab(lines, 2), codeWithTabsTabTwo.toString('latin1').trim().split('\n'));
});

test('tests.pico8.game.game_test.TestP8Include.testIncludeLua', async () => inTempDir(async (dir) => {
  await fs.writeFile(path.join(dir, 'inc.lua'), Buffer.from(`${codeWithTabs.toString('latin1').trim()}\n`));
  const cart = await putP8(dir, 't.p8', includeSources.lua);
  assert.deepEqual(await expanded(dir, cart), expected(codeWithTabs));
}));

test('tests.pico8.game.game_test.TestP8Include.testIncludeLuaParentDirFails', async () => inTempDir(async (dir) => {
  const cart = await putP8(dir, 't.p8', includeSources.parent);
  await assert.rejects(expanded(dir, cart), P8IncludeOutsideOfAllowedDirectory);
}));

test('tests.pico8.game.game_test.TestP8Include.testIncludeP8', async () => inTempDir(async (dir) => {
  await putP8(dir, 'inc.p8', codeWithTabs);
  const cart = await putP8(dir, 't.p8', includeSources.p8);
  assert.deepEqual(await expanded(dir, cart), expected(codeWithTabs));
}));

test('tests.pico8.game.game_test.TestP8Include.testIncludeP8Tab', async () => inTempDir(async (dir) => {
  await putP8(dir, 'inc.p8', codeWithTabs);
  const cart = await putP8(dir, 't.p8', includeSources.p8Tab);
  assert.deepEqual(await expanded(dir, cart), expected(codeWithTabsTabTwo));
}));

test('tests.pico8.game.game_test.TestP8Include.testIncludeP8PNG', async () => inTempDir(async (dir) => {
  await putP8Png(dir, 'inc.p8.png', codeWithTabs);
  const cart = await putP8(dir, 't.p8', includeSources.png);
  assert.deepEqual(await expanded(dir, cart), expected(codeWithTabs));
}));

test('tests.pico8.game.game_test.TestP8Include.testIncludeP8PNGTab', async () => inTempDir(async (dir) => {
  await putP8Png(dir, 'inc.p8.png', codeWithTabs);
  const cart = await putP8(dir, 't.p8', includeSources.pngTab);
  assert.deepEqual(await expanded(dir, cart), expected(codeWithTabsTabTwo));
}));
