#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const picotool = require('../src');

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'picotool-file-api-'));
  try {
    const textPath = join(directory, 'game.p8');
    const pngPath = join(directory, 'game.p8.png');
    const source = picotool.encodeUtf8(`${picotool.HEADER}\nversion 33\n__lua__\nprint(42)\n`);

    await picotool.toFile(picotool.parseP8(source), textPath);
    assert.equal((await picotool.fromFile(textPath)).format, 'p8');

    await picotool.toFile(await picotool.fromFile(textPath), pngPath);
    const firstImage = await picotool.decodePng(await readFile(pngPath));
    const highBits = Uint8Array.from(firstImage.rgba, (byte) => byte & 0xfc);
    const pngCart = await picotool.fromFile(pngPath);
    assert.equal(pngCart.format, 'p8.png');
    assert.equal(picotool.decodeP8scii(pngCart.code.code), 'print(42)\n\n');

    pngCart.gff._data[0] = 123;
    await picotool.toFile(pngCart, pngPath);
    const secondImage = await picotool.decodePng(await readFile(pngPath));
    assert.deepEqual(Uint8Array.from(secondImage.rgba, (byte) => byte & 0xfc), highBits);
    assert.equal((await picotool.fromFile(pngPath)).gff._data[0], 123);

    await picotool.toFile(await picotool.fromFile(pngPath), textPath);
    assert.equal((await picotool.fromFile(textPath)).sections.lua.join(''), 'print(42)\n');
    assert.throws(() => picotool.formatForFilename('game.txt'), (error) =>
      error instanceof picotool.UnrecognizedFileType && error.filename === 'game.txt');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
