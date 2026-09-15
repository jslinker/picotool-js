'use strict';

const assert = require('node:assert/strict');
const api = require('../src');

async function testTransportRejectsNonRgba() {
  const { encode } = await import('fast-png');
  for (const channels of [1, 2, 3]) {
    const png = encode({ width: 1, height: 1, data: new Uint8Array(channels), depth: 8, channels });
    await assert.rejects(
      () => api.decodePng(png),
      new RegExp(`Unsupported PNG channel count ${channels}`),
    );
  }
}

async function main() {
  await testTransportRejectsNonRgba();
  const { encode } = await import('fast-png');
  const { readFileSync } = require('node:fs');
  const { resolve } = require('node:path');
  const fixture = readFileSync(resolve(__dirname,
    '../../../vendor/picotool/tests/testdata/test_cart.p8.png'));
  const image = await api.decodePng(fixture);
  const interlaced = encode({ width: image.width, height: image.height,
    data: image.rgba, depth: 8, channels: 4, interlace: 'Adam7' });
  const decoded = await api.readP8Png(interlaced);
  assert.equal(decoded.cartridge.version,
    (await api.readP8Png(fixture)).cartridge.version);
  assert.deepEqual(decoded.rgba, image.rgba);
  const rewritten = await api.writeP8Png(decoded.cartridge, interlaced,
    decoded.cartridge.code.code.slice(0, decoded.cartridge.code.codeLength));
  const roundTrip = await api.readP8Png(rewritten);
  assert.equal(roundTrip.cartridge.version, decoded.cartridge.version);
  for (let index = 0; index < image.rgba.length; index += 1) {
    assert.equal(roundTrip.rgba[index] & 0xfc, image.rgba[index] & 0xfc);
  }
  assert.throws(() => api.getBytesFromCode(new Uint8Array(0x10000)),
    /too large for the PNG code-length header/);
  const incompressible = new Uint8Array(api.CODE_END - api.CODE_OFFSET + 1);
  let state = 0x12345678;
  for (let index = 0; index < incompressible.length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    incompressible[index] = state >>> 24;
  }
  assert.throws(() => api.getBytesFromCode(incompressible),
    /does not fit in the PNG code region/);
  console.log('png edge tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
