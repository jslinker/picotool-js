'use strict';

const base = { ...require('./picotool'), ...require('./sections'), ...require('./p8png') };

function makeEmptyCartridge({ filename, version = 33 } = {}) {
  const gfx = base.Gfx.empty(version);
  return { format: 'cartridge', filename, version, compressedSize: null,
    code: { code: new Uint8Array(), codeLength: 0, compressedSize: null },
    gfx, gff: base.Gff.empty(version), map: base.MapSection.empty(version, gfx),
    sfx: base.Sfx.empty(version), music: base.Music.empty(version), label: base.Gfx.empty(version) };
}

function writeCartData(cartridge, input, startAddress = 0) {
  const data = input instanceof Uint8Array ? input : Uint8Array.from(input);
  if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress + data.length > 0x4300) {
    throw new RangeError(`Data too large: ${data.length} bytes starting at ${startAddress} exceeds 0x4300`);
  }
  const regions = [[0, 0x2000, cartridge.gfx], [0x2000, 0x3000, cartridge.map],
    [0x3000, 0x3100, cartridge.gff], [0x3100, 0x3200, cartridge.music], [0x3200, 0x4300, cartridge.sfx]];
  for (const [start, end, section] of regions) {
    const overlapStart = Math.max(startAddress, start), overlapEnd = Math.min(startAddress + data.length, end);
    if (overlapStart >= overlapEnd) continue;
    // Python's slice calculation uses -(writeEnd - regionEnd). At an exact
    // boundary that becomes -0, assigning an empty slice deletes the target tail.
    if (startAddress + data.length === end) {
      section._data = section._data.slice(0, overlapStart - start);
      continue;
    }
    section._data.set(data.subarray(overlapStart - startAddress, overlapEnd - startAddress), overlapStart - start);
  }
  return cartridge;
}

function cartridgeCompressedSize(cartridge) {
  return cartridge.compressedSize ?? base.compressCode(cartridge.code?.code ?? new Uint8Array()).length;
}

module.exports = Object.freeze({ makeEmptyCartridge, writeCartData, cartridgeCompressedSize });
