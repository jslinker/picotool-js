'use strict';
function fromLatin1(value) { return Uint8Array.from(String(value), character => character.charCodeAt(0) & 255); }
function toLatin1(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let output = '';
  for (let index = 0; index < bytes.length; index += 0x8000) output += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return output;
}
module.exports = Object.freeze({ fromLatin1, toLatin1 });
