(function initializeBrowserPng(root) {
  'use strict';

  function readUint32(data, offset) {
    return data[offset] * 0x1000000 + (data[offset + 1] << 16) + (data[offset + 2] << 8) + data[offset + 3];
  }

  async function imageDataFromBlob(blob) {
    const data = new Uint8Array(await blob.arrayBuffer());
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!signature.every((value, index) => data[index] === value)) throw new Error('Invalid PNG signature');
    let offset = 8, width, height, interlace, colorType, bitDepth;
    const compressed = [];
    while (offset + 12 <= data.length) {
      const length = readUint32(data, offset), type = String.fromCharCode(...data.slice(offset + 4, offset + 8));
      const payload = data.slice(offset + 8, offset + 8 + length);
      if (type === 'IHDR') { width = readUint32(payload, 0); height = readUint32(payload, 4); bitDepth = payload[8]; colorType = payload[9]; interlace = payload[12]; }
      else if (type === 'IDAT') compressed.push(payload);
      else if (type === 'IEND') break;
      offset += length + 12;
    }
    if (!width || !height || bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
      throw new Error('Only non-interlaced 8-bit RGBA PNGs are supported');
    }
    const encoded = new Uint8Array(compressed.reduce((total, chunk) => total + chunk.length, 0));
    let encodedOffset = 0; for (const chunk of compressed) { encoded.set(chunk, encodedOffset); encodedOffset += chunk.length; }
    const stream = new Blob([encoded]).stream().pipeThrough(new DecompressionStream('deflate'));
    const filtered = new Uint8Array(await new Response(stream).arrayBuffer());
    const rowLength = width * 4, expected = height * (rowLength + 1);
    if (filtered.length !== expected) throw new Error('PNG decompressed data has an unexpected length');
    const pixels = new Uint8Array(width * height * 4), previous = new Uint8Array(rowLength);
    for (let y = 0; y < height; y += 1) {
      const row = filtered.subarray(y * (rowLength + 1) + 1, (y + 1) * (rowLength + 1));
      const filter = filtered[y * (rowLength + 1)];
      for (let x = 0; x < rowLength; x += 1) {
        const left = x >= 4 ? row[x - 4] : 0, up = previous[x];
        const upperLeft = x >= 4 ? previous[x - 4] : 0;
        if (filter === 1) row[x] = (row[x] + left) & 255;
        else if (filter === 2) row[x] = (row[x] + up) & 255;
        else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
        else if (filter === 4) { const p = left + up - upperLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upperLeft); row[x] = (row[x] + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upperLeft)) & 255; }
        else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
      }
      pixels.set(row, y * rowLength); previous.set(row);
    }
    return { width, height, data: pixels };
  }

  async function decodeP8PngBlob(blob) {
    const image = await imageDataFromBlob(blob);
    const picodata = root.PicotoolJS.getPicodataFromRgba(image.width, image.height, image.data);
    return { width: image.width, height: image.height, picodata, cartridge: root.PicotoolJS.parseP8PngPicodata(picodata) };
  }

  root.PicotoolBrowserPng = Object.freeze({ decodeP8PngBlob, imageDataFromBlob });
}(globalThis));
