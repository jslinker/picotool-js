/** Platform-independent cartridge, memory-section, and byte-codec APIs. */
export type ByteValues = Uint8Array | readonly number[];
export type CodecInput = ByteValues | ArrayBuffer | string;
export const HEADER: 'pico-8 cartridge // http://www.pico-8.com';
export const REPORT_SCHEMA: 'picotool-parity/1';
export const SECTION_NAMES: readonly ['lua', 'gfx', 'gff', 'map', 'sfx', 'music', 'label'];
export function encodeUtf8(value: string): Uint8Array;
export function encodeP8scii(value: string): Uint8Array;
export function decodeP8scii(value: Iterable<number> | ArrayLike<number>): string;
export function fnv1a32(bytes: Iterable<number>): string;
export function bytesToHex(bytes: Iterable<number> | ArrayLike<number>): string;
export function hexToBytes(value: string): Uint8Array;
export function normalizedResult<T>(action: () => T): { status: 'ok'; value: T } | { status: 'error'; value: string };
export interface SectionSnapshot { name: string; byteLength: number; fnv1a32: string; }
export interface P8Snapshot {
  name: string | undefined;
  version: number;
  sectionOrder: string[];
  sections: (SectionSnapshot & { lineCount: number })[];
}
export function snapshotP8(source: string | Uint8Array | ArrayBuffer, name?: string): P8Snapshot;
export function snapshotDomainP8(source: string | Uint8Array | ArrayBuffer, name?: string): P8Snapshot & { domainMemory: SectionSnapshot[] };

export class BaseSection {
  constructor(data?: ByteValues, version?: number);
  _data: Uint8Array;
  _version: number;
  static fromLines(lines: readonly string[], version?: number): BaseSection;
  static fromBytes(data: ByteValues, version?: number): BaseSection;
  toBytes(): Uint8Array;
  toLines(): string[];
}
export const TRANSPARENT: 16;
export const GFF: Readonly<{ RED: 1; ORANGE: 2; YELLOW: 4; GREEN: 8; BLUE: 16; PURPLE: 32; PINK: 64; PEACH: 128; ALL: 255 }>;
export class Gfx extends BaseSection {
  static HEX_LINE_LENGTH_BYTES: number;
  static empty(version?: number): Gfx;
  static fromLines(lines: readonly string[], version?: number): Gfx;
  static fromBytes(data: ByteValues, version?: number): Gfx;
  getSprite(id: number, tileWidth?: number, tileHeight?: number): number[][];
  setSprite(id: number, sprite: readonly (readonly number[])[], tileXOffset?: number, tileYOffset?: number): void;
}
export class Gff extends BaseSection {
  static HEX_LINE_LENGTH_BYTES: number;
  static empty(version?: number): Gff;
  static fromLines(lines: readonly string[], version?: number): Gff;
  static fromBytes(data: ByteValues, version?: number): Gff;
  getFlags(id: number, flags?: number): number;
  setFlags(id: number, flags: number): void;
  clearFlags(id: number, flags: number): void;
  resetFlags(id: number, flags: number): void;
}
export class MapSection extends BaseSection {
  constructor(data?: ByteValues, version?: number, gfx?: Gfx | null);
  _gfx: Gfx | null;
  static HEX_LINE_LENGTH_BYTES: number;
  static empty(version?: number, gfx?: Gfx | null): MapSection;
  static fromLines(lines: readonly string[], version?: number, gfx?: Gfx | null): MapSection;
  static fromBytes(data: ByteValues, version?: number, gfx?: Gfx | null): MapSection;
  getCell(x: number, y: number): number;
  setCell(x: number, y: number, value: number): void;
  getRectTiles(x: number, y: number, width?: number, height?: number): number[][];
  setRectTiles(rect: readonly (readonly number[])[], x: number, y: number): void;
  getRectPixels(x: number, y: number, width?: number, height?: number): number[][];
}
export class Music extends BaseSection {
  static empty(version?: number): Music;
  static fromLines(lines: readonly string[], version?: number): Music;
  static fromBytes(data: ByteValues, version?: number): Music;
  getChannel(id: number, channel: number): number | null;
  setChannel(id: number, channel: number, pattern: number | null): void;
  getProperties(id: number): [boolean, boolean, boolean];
  setProperties(id: number, properties?: { begin?: boolean | null; end?: boolean | null; stop?: boolean | null }): void;
}
export interface SfxNote { pitch?: number; waveform?: number; volume?: number; effect?: number; }
export interface SfxProperties { editorMode?: number | null; noteDuration?: number | null; loopStart?: number | null; loopEnd?: number | null; }
export class Sfx extends BaseSection {
  static empty(version?: number): Sfx;
  static fromLines(lines: readonly string[], version?: number): Sfx;
  static fromBytes(data: ByteValues, version?: number): Sfx;
  getNote(id: number, note: number): [number, number, number, number];
  setNote(id: number, note: number, values?: SfxNote): void;
  getProperties(id: number): [number, number, number, number];
  setProperties(id: number, values?: SfxProperties): void;
}

export const CODE_OFFSET: 0x4300;
export const CODE_END: 0x8000;
export const VERSION_OFFSET: 0x8000;
export interface DecodedCode { codeLength: number; code: Uint8Array; compressedSize: number | null; }
export interface CartridgeMemory {
  version: number;
  code?: { code: Uint8Array; codeLength?: number; compressedSize?: number | null };
  gfx: Gfx; map: MapSection; gff: Gff; music: Music; sfx: Sfx;
}
export interface ParsedP8Png extends CartridgeMemory { readonly format: 'p8.png'; code: DecodedCode; }
export function compressCode(input: CodecInput): Uint8Array;
export function decompressCode(input: CodecInput): DecodedCode & { compressedSize: number };
export function getCodeFromBytes(input: CodecInput, version: number): DecodedCode;
export function getBytesFromCode(input: CodecInput): Uint8Array;
export function getPicodataFromRgba(width: number, height: number, rgba: CodecInput): Uint8Array;
export function getRgbaFromPicodata(picodata: CodecInput, rgba: CodecInput): Uint8Array;
export function parseP8PngPicodata(input: CodecInput): ParsedP8Png;
export function serializeP8PngPicodata(cartridge: CartridgeMemory, luaBytes?: CodecInput): Uint8Array;
export function snapshotP8PngPicodata(input: CodecInput, name?: string): {
  name: string | undefined; version: number; domainMemory: SectionSnapshot[];
  code: { byteLength: number; codeLength: number; compressedSize: number | null; fnv1a32: string };
};
