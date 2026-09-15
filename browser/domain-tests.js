(function registerDomainTests(root) {
  'use strict';

  const { GFF, Gff, Gfx, MapSection, Music, Sfx, TRANSPARENT } = root.PicotoolJS;
  const { test } = root.PicotoolBrowserTests;
  const zeros = (count) => Array(count).fill(0);

  const validGfxLines = [`0123456789abcdef${'0'.repeat(112)}\n`, ...Array(127).fill(`${'0'.repeat(128)}\n`)];
  const validMusicLines = Array(64).fill('00 41424344\n');
  const sfxLine0 = '0110000000472004620c3400c34318470004311842500415003700c30500375183750c3000c3751f4730c375053720536211540114330c37524555247120c3730a470163521d07522375164120a211220252e315\n';
  const sfxLine1 = '01100000183732440518433394033c65539403185432b543184733940318433394033c655306053940339403184733940318423394033c655394031845321433184733940318473394033c655394033940339403\n';
  const emptySfxLine = `00100000${'0'.repeat(160)}\n`;
  const validSfxLines = [sfxLine0, sfxLine1, ...Array(62).fill(emptySfxLine)];

  test('pico8.gfx.gfx_test.TestGfx.testFromLines', ({ deepEqual, equal }) => {
    const gfx = Gfx.fromLines([...validGfxLines, '\n'], 4);
    deepEqual(Array.from(gfx._data.slice(0, 8)), [0x10, 0x32, 0x54, 0x76, 0x98, 0xba, 0xdc, 0xfe]);
    equal(gfx._version, 4);
  });
  test('pico8.gfx.gfx_test.TestGfx.testToLines', ({ deepEqual }) => deepEqual(Gfx.fromLines(validGfxLines, 4).toLines(), validGfxLines));
  test('pico8.gfx.gfx_test.TestGfx.testGetSpriteEmpty', ({ deepEqual }) => {
    const gfx = Gfx.empty();
    for (let id = 0; id < 256; id += 1) deepEqual(gfx.getSprite(id), Array.from({ length: 8 }, () => zeros(8)));
  });
  test('pico8.gfx.gfx_test.TestGfx.testGetSpriteValues', ({ deepEqual }) => {
    const gfx = Gfx.empty(); gfx._data.set([0x10, 0x32, 0x54, 0x76, 0x98, 0xba, 0xdc, 0xfe]);
    deepEqual(gfx.getSprite(0)[0], [0, 1, 2, 3, 4, 5, 6, 7]); deepEqual(gfx.getSprite(1)[0], [8, 9, 10, 11, 12, 13, 14, 15]);
  });
  test('pico8.gfx.gfx_test.TestGfx.testGetLargeSprite', ({ deepEqual, equal }) => {
    const gfx = Gfx.empty(); for (let offset = 0; offset < 64; offset += 8) gfx._data.set([0x10, 0x32, 0x54, 0x76, 0x98, 0xba, 0xdc, 0xfe], offset);
    const sprite = gfx.getSprite(0, 2, 2); deepEqual(sprite[0], Array.from({ length: 16 }, (_, index) => index)); equal(sprite.length, 16);
  });
  test('pico8.gfx.gfx_test.TestGfx.testGetLargeSpriteOffEdge', ({ deepEqual }) => {
    const gfx = Gfx.empty(); for (let offset = 0; offset < 64; offset += 8) gfx._data.set([0x10, 0x32, 0x54, 0x76, 0x98, 0xba, 0xdc, 0xfe], offset);
    deepEqual(gfx.getSprite(15, 2, 2)[0], [8, 9, 10, 11, 12, 13, 14, 15, ...zeros(8)]);
  });
  test('pico8.gfx.gfx_test.TestGfx.testSetSprite', ({ deepEqual }) => {
    const gfx = Gfx.empty(); gfx.setSprite(0, [[0, 1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12, 13, 14, 15], ...Array.from({ length: 6 }, () => zeros(8))]);
    deepEqual(Array.from(gfx._data.slice(0, 8)), [0x10, 0x32, 0x54, 0x76, 0, 0, 0, 0]); deepEqual(Array.from(gfx._data.slice(64, 72)), [0x98, 0xba, 0xdc, 0xfe, 0, 0, 0, 0]);
  });
  test('pico8.gfx.gfx_test.TestGfx.testSetSpriteByteArray', ({ deepEqual }) => {
    const gfx = Gfx.empty(); gfx.setSprite(0, [Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]), Uint8Array.from([8, 9, 10, 11, 12, 13, 14, 15])]);
    deepEqual(Array.from(gfx._data.slice(0, 4)), [0x10, 0x32, 0x54, 0x76]); deepEqual(Array.from(gfx._data.slice(64, 68)), [0x98, 0xba, 0xdc, 0xfe]);
  });
  test('pico8.gfx.gfx_test.TestGfx.testSetSpriteOffset', ({ deepEqual }) => {
    const gfx = Gfx.empty(); gfx.setSprite(0, [[0, 1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12, 13, 14, 15]], 1, 1);
    deepEqual(Array.from(gfx._data.slice(64, 72)), [0, 0x21, 0x43, 0x65, 0x07, 0, 0, 0]); deepEqual(Array.from(gfx._data.slice(128, 136)), [0x80, 0xa9, 0xcb, 0xed, 0x0f, 0, 0, 0]);
  });
  test('pico8.gfx.gfx_test.TestGfx.testSetLargeSprite', ({ deepEqual }) => {
    const gfx = Gfx.empty(); gfx.setSprite(0, Array.from({ length: 12 }, () => Array.from({ length: 12 }, (_, index) => index)));
    deepEqual(Array.from(gfx._data.slice(64 * 11, 64 * 11 + 8)), [0x10, 0x32, 0x54, 0x76, 0x98, 0xba, 0, 0]);
  });
  test('pico8.gfx.gfx_test.TestGfx.testSetSpriteOffEdge', ({ deepEqual }) => {
    const gfx = Gfx.empty(); gfx.setSprite(15, Array.from({ length: 12 }, () => Array.from({ length: 12 }, (_, index) => index)));
    deepEqual(Array.from(gfx._data.slice(64 * 11 + 60, 64 * 11 + 64)), [0x10, 0x32, 0x54, 0x76]);
    deepEqual(gfx.getSprite(15, 2, 2), [...Array.from({ length: 12 }, () => [0, 1, 2, 3, 4, 5, 6, 7, ...zeros(8)]), ...Array.from({ length: 4 }, () => zeros(16))]);
  });
  test('pico8.gfx.gfx_test.TestGfx.testSetSpriteTransparency', ({ deepEqual }) => {
    const gfx = Gfx.empty(); gfx.setSprite(0, Array.from({ length: 8 }, () => Array(8).fill(1))); gfx.setSprite(0, Array.from({ length: 8 }, () => [2, 2, TRANSPARENT, TRANSPARENT, 2, 2, TRANSPARENT, TRANSPARENT]));
    deepEqual(gfx.getSprite(0), Array.from({ length: 8 }, () => [2, 2, 1, 1, 2, 2, 1, 1]));
  });
  test('pico8.gfx.gfx_test.TestGfx.testSetSpriteTransparencyOffset', ({ deepEqual }) => {
    const gfx = Gfx.empty(); gfx.setSprite(0, Array.from({ length: 8 }, () => Array(8).fill(1))); gfx.setSprite(0, Array.from({ length: 8 }, () => [2, 2, TRANSPARENT, TRANSPARENT, 2, 2, TRANSPARENT, TRANSPARENT]), 3, 0);
    deepEqual(gfx.getSprite(0), Array.from({ length: 8 }, () => [1, 1, 1, 2, 2, 1, 1, 2]));
  });

  test('pico8.gff.gff_test.TestGff.testGetFlags', ({ equal }) => {
    const gff = Gff.empty(); gff._data = Uint8Array.from({ length: 256 }, (_, index) => index);
    for (let id = 0; id < 256; id += 1) equal(gff.getFlags(id, GFF.ALL), id);
    equal(gff.getFlags(1, GFF.RED), GFF.RED); equal(gff.getFlags(1, GFF.ORANGE), 0); equal(gff.getFlags(3, GFF.RED | GFF.ORANGE), 3);
  });
  test('pico8.gff.gff_test.TestGff.testSetFlags', ({ equal }) => { const gff = Gff.empty(); gff.setFlags(0, GFF.RED | GFF.BLUE | GFF.PEACH); gff.setFlags(0, GFF.ORANGE); equal(gff.getFlags(0), GFF.RED | GFF.ORANGE | GFF.BLUE | GFF.PEACH); });
  test('pico8.gff.gff_test.TestGff.testClearFlags', ({ equal }) => { const gff = Gff.empty(); gff.setFlags(0, GFF.RED | GFF.BLUE | GFF.PEACH); gff.clearFlags(0, GFF.BLUE); equal(gff.getFlags(0), GFF.RED | GFF.PEACH); });
  test('pico8.gff.gff_test.TestGff.testResetFlags', ({ equal }) => { const gff = Gff.empty(); gff.setFlags(0, GFF.RED | GFF.PEACH); gff.resetFlags(0, GFF.BLUE); equal(gff.getFlags(0), GFF.BLUE); });

  test('pico8.map.map_test.TestMap.testGetCell', ({ equal }) => { const map = MapSection.empty(); map._data.set(Array.from({ length: 128 }, (_, index) => index % 16)); for (let x = 0; x < 128; x += 1) equal(map.getCell(x, 0), x % 16); equal(map.getCell(0, 1), 0); });
  test('pico8.map.map_test.TestMap.testGetCellSharedMem', ({ equal }) => { const gfx = Gfx.empty(), map = MapSection.empty(4, gfx); gfx._data.set(Array.from({ length: 16 }, (_, index) => index), 4096); for (let x = 0; x < 16; x += 1) equal(map.getCell(x, 32), x); });
  test('pico8.map.map_test.TestMap.testSetCell', ({ equal }) => { const map = MapSection.empty(); for (let x = 0; x < 128; x += 1) map.setCell(x, 0, x % 16); for (let x = 0; x < 128; x += 1) equal(map.getCell(x, 0), x % 16); });
  test('pico8.map.map_test.TestMap.testGetRectTiles', ({ deepEqual }) => { const map = MapSection.empty(); for (let x = 0; x < 128; x += 1) map.setCell(x, 0, x % 16); deepEqual(map.getRectTiles(2, 0, 8, 2), [[2, 3, 4, 5, 6, 7, 8, 9], zeros(8)]); });
  test('pico8.map.map_test.TestMap.testGetRectTilesOffEdge', ({ deepEqual }) => { const map = MapSection.empty(); for (let x = 0; x < 128; x += 1) map.setCell(x, 0, x % 16); deepEqual(map.getRectTiles(124, 0, 8, 2), [[12, 13, 14, 15, 0, 0, 0, 0], zeros(8)]); });
  test('pico8.map.map_test.TestMap.testGetRectSharedMem', ({ deepEqual }) => { const gfx = Gfx.empty(), map = MapSection.empty(4, gfx); gfx._data.set(Array.from({ length: 16 }, (_, index) => index), 4096); deepEqual(map.getRectTiles(2, 32, 8, 2), [[2, 3, 4, 5, 6, 7, 8, 9], zeros(8)]); });
  test('pico8.map.map_test.TestMap.testSetRectTiles', ({ deepEqual }) => { const map = MapSection.empty(4, Gfx.empty()); map.setRectTiles(Array.from({ length: 3 }, () => Array(4).fill(1)), 2, 3); deepEqual(map.getRectTiles(0, 0, 7, 7), [...Array.from({ length: 3 }, () => zeros(7)), ...Array.from({ length: 3 }, () => [0, 0, 1, 1, 1, 1, 0]), zeros(7)]); });
  test('pico8.map.map_test.TestMap.testGetRectPixels', ({ deepEqual, equal }) => { const gfx = Gfx.empty(), map = MapSection.empty(4, gfx); for (let id = 0; id < 16; id += 1) gfx.setSprite(id, Array.from({ length: 8 }, () => Array(8).fill(id))); for (let x = 0; x < 128; x += 1) map.setCell(x, 0, x % 16); const pixels = map.getRectPixels(2, 0, 3, 2); equal(pixels.length, 16); for (let row = 0; row < 8; row += 1) deepEqual(pixels[row], [...Array(8).fill(2), ...Array(8).fill(3), ...Array(8).fill(4)]); for (let row = 8; row < 16; row += 1) deepEqual(pixels[row], zeros(24)); });

  test('pico8.music.music_test.TestMusic.testFromLines', ({ deepEqual, equal }) => { const music = Music.fromLines(validMusicLines, 4); deepEqual(Array.from(music._data), Array(64).fill([0x41, 0x42, 0x43, 0x44]).flat()); equal(music._version, 4); });
  test('pico8.music.music_test.TestMusic.testToLines', ({ deepEqual }) => deepEqual(Music.fromLines(validMusicLines, 4).toLines(), validMusicLines));
  test('pico8.music.music_test.TestMusic.testSetChannel', ({ deepEqual }) => { const music = Music.empty(); [0, 1, 2, 3].forEach((pattern, channel) => music.setChannel(0, channel, pattern)); deepEqual(Array.from(music._data.slice(0, 4)), [0, 1, 2, 3]); [0, 1, 2, 3].forEach((_, channel) => music.setChannel(0, channel, null)); deepEqual(Array.from(music._data.slice(0, 4)), [0x41, 0x42, 0x43, 0x44]); });
  test('pico8.music.music_test.TestMusic.testGetChannel', ({ equal }) => { const music = Music.empty(); for (let channel = 0; channel < 4; channel += 1) { equal(music.getChannel(0, channel), null); music.setChannel(0, channel, channel); equal(music.getChannel(0, channel), channel); } });
  test('pico8.music.music_test.TestMusic.testSetProperties', ({ deepEqual }) => { const music = Music.empty(); [0, 1, 2, 3].forEach((value, channel) => music.setChannel(0, channel, value)); music.setProperties(0, { begin: true, end: true, stop: true }); deepEqual(Array.from(music._data.slice(0, 4)), [0x80, 0x81, 0x82, 3]); music.setProperties(0, { begin: false, stop: false }); deepEqual(Array.from(music._data.slice(0, 4)), [0, 0x81, 2, 3]); });
  test('pico8.music.music_test.TestMusic.testGetProperties', ({ deepEqual }) => { const music = Music.empty(); deepEqual(music.getProperties(0), [false, false, false]); music.setProperties(0, { begin: true, end: true, stop: true }); deepEqual(music.getProperties(0), [true, true, true]); music.setProperties(0, { begin: false, stop: false }); deepEqual(music.getProperties(0), [false, true, false]); });

  test('pico8.sfx.sfx_test.TestSfx.testFromLines', ({ deepEqual, equal }) => { const sfx = Sfx.fromLines(validSfxLines, 4); deepEqual(Array.from(sfx._data.slice(0, 8)), [0x00, 0x2f, 0x00, 0x2d, 0xcc, 0x08, 0xcc, 0x38]); deepEqual(Array.from(sfx._data.slice(64, 72)), [0x01, 0x10, 0x00, 0x00, 0xd8, 0x3e, 0x24, 0x51]); equal(sfx._version, 4); });
  test('pico8.sfx.sfx_test.TestSfx.testToLines', ({ deepEqual }) => deepEqual(Sfx.fromLines(validSfxLines, 4).toLines(), validSfxLines));
  test('pico8.sfx.sfx_test.TestSfx.testSetNote', ({ deepEqual }) => { const sfx = Sfx.empty(); sfx.setNote(0, 0, { pitch: 1, waveform: 2, volume: 3, effect: 4 }); deepEqual(Array.from(sfx._data.slice(0, 2)), [0x81, 0x46]); sfx.setNote(1, 0, { pitch: 1, waveform: 2, volume: 3, effect: 4 }); deepEqual(Array.from(sfx._data.slice(68, 70)), [0x81, 0x46]); });
  test('pico8.sfx.sfx_test.TestSfx.testSetNoteHighWaveform', ({ deepEqual }) => { const sfx = Sfx.empty(); sfx.setNote(0, 0, { pitch: 1, waveform: 10, volume: 3, effect: 4 }); deepEqual(Array.from(sfx._data.slice(0, 2)), [0x81, 0xc6]); });
  test('pico8.sfx.sfx_test.TestSfx.testGetNote', ({ deepEqual }) => { const sfx = Sfx.empty(); sfx.setNote(0, 0, { pitch: 1, waveform: 2, volume: 3, effect: 4 }); deepEqual(sfx.getNote(0, 0), [1, 2, 3, 4]); });
  test('pico8.sfx.sfx_test.TestSfx.testGetNoteHighWaveform', ({ deepEqual }) => { const sfx = Sfx.empty(); sfx.setNote(0, 0, { pitch: 1, waveform: 10, volume: 3, effect: 4 }); deepEqual(sfx.getNote(0, 0), [1, 10, 3, 4]); });
  test('pico8.sfx.sfx_test.TestSfx.testSetProperties', ({ deepEqual }) => { const sfx = Sfx.empty(); sfx.setProperties(0, { editorMode: 1, noteDuration: 2, loopStart: 3, loopEnd: 4 }); deepEqual(Array.from(sfx._data.slice(64, 68)), [1, 2, 3, 4]); sfx.setProperties(63, { editorMode: 1, noteDuration: 255, loopStart: 10, loopEnd: 11 }); deepEqual(Array.from(sfx._data.slice(63 * 68 + 64, 64 * 68)), [1, 255, 10, 11]); });
  test('pico8.sfx.sfx_test.TestSfx.testGetProperties', ({ deepEqual }) => { const sfx = Sfx.empty(); deepEqual(sfx.getProperties(0), [0, 1, 0, 0]); deepEqual(sfx.getProperties(63), [0, 16, 0, 0]); sfx.setProperties(0, { editorMode: 1, noteDuration: 2, loopStart: 3, loopEnd: 4 }); deepEqual(sfx.getProperties(0), [1, 2, 3, 4]); });
  test('pico8.sfx.sfx_test.TestHelloWorld.testPattern', ({ equal }) => { const row = 'd83e245118373931bc5b393158396b39183f393118373931bc5bb05139313931183f393118353931bc5b3931183b2137183f3931183f3931bc5b39313931393101100000'; const bytes = root.PicotoolJS.hexToBytes(row); const data = new Uint8Array(4352); for (let offset = 0; offset < data.length; offset += 68) data.set(bytes, offset); equal(new Sfx(data, 4).toLines()[0], sfxLine1); });
}(globalThis));
