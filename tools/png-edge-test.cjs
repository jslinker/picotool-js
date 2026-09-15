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
  console.log('png edge tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
