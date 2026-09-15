(function registerPngTests(root) {
  'use strict';

  const { test } = root.PicotoolBrowserTests;
  const api = root.PicotoolJS;
  const testRgba = [
    0xec, 0xdc, 0xcc, 0xfc, 0xac, 0x9c, 0x8d, 0xbc, 0x6c, 0x5c, 0x4e, 0x7c,
    0xec, 0xdc, 0xcf, 0xfc, 0xac, 0x9d, 0x8c, 0xbc, 0x6c, 0x5d, 0x4d, 0x7c,
    0xec, 0xdd, 0xce, 0xfc, 0xac, 0x9d, 0x8f, 0xbc, 0x6f, 0x5f, 0x4f, 0x7f,
  ];
  const blankRgba = [
    0xef, 0xdf, 0xcf, 0xff, 0xaf, 0x9f, 0x8f, 0xbf, 0x6f, 0x5f, 0x4f, 0x7f,
    0xef, 0xdf, 0xcf, 0xff, 0xaf, 0x9f, 0x8f, 0xbf, 0x6f, 0x5f, 0x4f, 0x7f,
    0xef, 0xdf, 0xcf, 0xff, 0xaf, 0x9f, 0x8f, 0xbf, 0x6f, 0x5f, 0x4f, 0x7f,
  ];
  const uncompressedCode = [102, 111, 114, 32, 105, 61, 49, 44, 49, 48, 32, 100, 111, 10, 32, 32, 112, 114, 105, 110, 116, 40, 34, 104, 105, 32, 34, 46, 46, 105, 41, 10, 101, 110, 100, 10];
  const compressedCode = [
    58, 99, 58, 0, 0, 142, 0, 0, 0, 45, 0, 45, 2, 31, 27, 25, 17, 2, 32, 21,
    32, 24, 17, 1, 60, 110, 13, 33, 32, 20, 27, 30, 1, 1, 18, 27, 30, 2, 21,
    51, 4, 57, 4, 3, 2, 16, 27, 1, 2, 2, 28, 30, 21, 26, 32, 42, 0, 34, 20,
    21, 2, 0, 34, 56, 56, 21, 43, 1, 0, 9, 2, 21, 18, 2, 21, 2, 41, 2, 6, 2,
    32, 20, 17, 26, 61, 16, 62, 116, 14, 33, 38, 38, 0, 34, 62, 34, 61, 242,
    62, 244, 0, 9, 2, 17, 26, 16, 1, 60, 36,
  ];
  const compressedText = '-- some title\n-- some author\n\nfor i=1,10 do\n  print("hi "..i)\n\t if i % 3 then\n\t   print("buzz")\n\t   print("buzz")\n\t   print("buzz")\n\t end\nend\n';

  test('pico8.game.game_test.TestP8PNGGame.testPngToPicodataSimple', ({ deepEqual }) => {
    deepEqual(Array.from(api.getPicodataFromRgba(3, 3, testRgba)), [0, 1, 2, 3, 4, 5, 6, 7, 255]);
  });

  test('pico8.game.game_test.TestP8PNGGame.testPicodataToPngSimple', ({ deepEqual }) => {
    deepEqual(Array.from(api.getRgbaFromPicodata([0, 1, 2, 3, 4, 5, 6, 7, 255], blankRgba)), testRgba);
  });

  test('pico8.game.game_test.TestP8PNGGame.testGetCodeFromBytesUncompressed', ({ deepEqual, equal }) => {
    const data = new Uint8Array(api.CODE_END - api.CODE_OFFSET); data.set(uncompressedCode);
    const result = api.getCodeFromBytes(data, 1);
    equal(result.codeLength, uncompressedCode.length); deepEqual(Array.from(result.code), [...uncompressedCode, 10]); equal(result.compressedSize, null);
  });

  test('pico8.game.game_test.TestP8PNGGame.testGetCodeFromBytesCompressed', ({ deepEqual, equal }) => {
    const data = new Uint8Array(api.CODE_END - api.CODE_OFFSET); data.set(compressedCode);
    const result = api.getCodeFromBytes(data, 1), expected = Array.from(api.encodeUtf8(compressedText));
    equal(result.codeLength, expected.length); deepEqual(Array.from(result.code), expected); equal(result.compressedSize, compressedCode.length);
  });

  test('pico8.game.game_test.TestP8PNGGame.testCompressCodeHelloExample', ({ deepEqual }) => {
    const source = 'a="hello"\nb="hello also"\nb="hello also"\nb="hello also"\nb="hello also"\nb="hello also"\nb="hello also"\n\n';
    const expected = [13, 51, 0, 34, 20, 17, 24, 24, 27, 0, 34, 1, 14, 60, 90, 2, 13, 24, 31, 60, 223, 61, 254, 62, 253, 63, 252, 64, 171, 1];
    const compressed = api.compressCode(source); deepEqual(Array.from(compressed), expected);
    const container = new Uint8Array(8 + compressed.length); container.set([58, 99, 58, 0, 0, api.encodeUtf8(source).length, 0, 0]); container.set(compressed, 8);
    deepEqual(Array.from(api.decompressCode(container).code), Array.from(api.encodeUtf8(source)));
  });

  test('picotool-js.p8png parses hidden cartridge memory into cohesive domains', ({ deepEqual, equal }) => {
    const data = new Uint8Array(0x8020); data[0] = 0x10; data[0x2000] = 42; data[0x3000] = 5; data[0x3100] = 0x41; data[0x3200 + 65] = 16; data[0x4300] = 112; data[0x4301] = 114; data[0x4302] = 105; data[0x4303] = 110; data[0x4304] = 116; data[0x8000] = 0;
    const cart = api.parseP8PngPicodata(data);
    equal(cart.gfx.getSprite(0)[0][0], 0); equal(cart.gfx.getSprite(0)[0][1], 1); equal(cart.map.getCell(0, 0), 42); equal(cart.gff.getFlags(0), 5); deepEqual(cart.sfx.getProperties(0), [0, 16, 0, 0]); deepEqual(Array.from(cart.code.code.slice(0, 6)), [112, 114, 105, 110, 116, 10]);
  });
}(globalThis));
