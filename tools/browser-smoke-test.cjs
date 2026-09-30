#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const esbuild = require('esbuild');
const { chromium } = require('playwright');

(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'picotool-browser-'));
  let server;
  try {
    const bundle = join(dir, 'bundle.js');
    await esbuild.build({ entryPoints: ['src/browser.js'], bundle: true, platform: 'browser', format: 'iife', globalName: 'PicotoolBrowser', outfile: bundle, logLevel: 'error' });
    await writeFile(join(dir, 'index.html'), '<!doctype html><script src="/bundle.js"></script>');
    server = http.createServer((request, response) => {
      const file = request.url === '/bundle.js' ? bundle : join(dir, 'index.html');
      require('node:fs').createReadStream(file).pipe(response);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER || 'chrome', headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    const result = await page.evaluate(async () => {
      const api = PicotoolBrowser;
      const source = `${api.HEADER}\nversion 33\n__lua__\nprint(1)\n`;
      const parsed = api.parseP8(source);
      const game = api.Game.fromCartridge(parsed);
      const png = await api.encodePng({ width: 160, height: 205, rgba: new Uint8Array(160 * 205 * 4).fill(255) });
      const packed = await api.writeP8PngFromP8(source, png);
      const decoded = await api.readP8Png(packed);
      const token = api.tokenizeLua('x=1')[0]; token.code = 'y';
      return { format: decoded.cartridge.format, lua: api.decodeP8scii(decoded.cartridge.code.code), token: token.code, buffer: typeof globalThis.Buffer, gameFileMethod: typeof game.toFile };
    });
    assert.equal(result.format, 'p8.png');
    assert.match(result.lua, /print\(1\)/);
    assert.equal(result.token, 'y');
    assert.equal(result.buffer, 'undefined');
    assert.equal(result.gameFileMethod, 'undefined');
    await browser.close();
    console.log('browser smoke passed');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
