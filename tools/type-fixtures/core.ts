import {
  Gfx, Gff, GFF, MapSection, Music, Sfx, encodeP8scii, decodeP8scii,
  compressCode, getBytesFromCode, getCodeFromBytes, makeEmptyCartridge,
  serializeP8PngPicodata, parseP8PngPicodata, createToken, TokNumber,
} from '@pico8-studio/picotool';

const gfx = Gfx.fromBytes(new Uint8Array(8192));
gfx.setSprite(0, [[1, 2, 3]]);
const sprite: number[][] = gfx.getSprite(0);
const gff = Gff.fromLines(['00\n']);
gff.setFlags(0, GFF.RED);
const map = MapSection.empty(33, gfx);
map.setCell(0, 32, 7);
const tile: number = map.getCell(0, 32);
const music = Music.empty();
music.setChannel(0, 0, null);
const channel: number | null = music.getChannel(0, 0);
const flags: [boolean, boolean, boolean] = music.getProperties(0);
const sfx = Sfx.fromBytes(new Uint8Array(4352));
sfx.setNote(0, 0, { pitch: 12, waveform: 3 });
const note: [number, number, number, number] = sfx.getNote(0, 0);
const code = encodeP8scii('print("hello")\n');
const text: string = decodeP8scii(code);
const compressed: Uint8Array = compressCode(code);
const decoded = getCodeFromBytes(getBytesFromCode(code), 33);
const cart = parseP8PngPicodata(serializeP8PngPicodata(makeEmptyCartridge(), code));
cart.gfx.getSprite(0);
const token: TokNumber = createToken('number', '42');
// @ts-expect-error section APIs require numeric sprite IDs
gfx.getSprite('0');
// @ts-expect-error channel patterns are numeric or null
music.setChannel(0, 0, 'mute');
// @ts-expect-error not a supported token class
createToken('invalid', 'x');
void [sprite, tile, channel, flags, note, text, compressed, decoded, token];
