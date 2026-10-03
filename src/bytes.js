'use strict';

/** Portable byte helpers shared by Node and browser entry points. */
function bytesFrom(value) {
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (ArrayBuffer.isView(value)) {
    return Uint8Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  if (typeof value === 'string') return latin1Bytes(value);
  return Uint8Array.from(value || []);
}

function latin1Bytes(value) {
  const text = String(value);
  const bytes = new Uint8Array(text.length);
  // Match Buffer.from(text, 'latin1'): it truncates each UTF-16 code unit,
  // including both halves of supplementary characters.
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff;
  }
  return bytes;
}

function latin1Text(value) {
  const bytes = value instanceof Uint8Array ? value : bytesFrom(value);
  let output = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return output;
}

module.exports = Object.freeze({ bytesFrom, latin1Bytes, latin1Text });
