export type P8SectionName = 'lua' | 'gfx' | 'gff' | 'map' | 'sfx' | 'music' | 'label';
export type BuildDomainName = Exclude<P8SectionName, 'label'>;

export interface ParsedP8 {
  readonly format: 'p8';
  readonly version: number;
  readonly sectionOrder: readonly P8SectionName[];
  readonly sections: Readonly<Partial<Record<P8SectionName, readonly string[]>>>;
}

export class P8Error extends Error {
  readonly code: string;
  readonly details?: unknown;
}

export function parseP8(source: string | Uint8Array | ArrayBuffer): ParsedP8;
export interface P8WriterOptions {
  filename?: string;
  luaWriter?: 'minify' | 'format-token' | 'ast-echo' | 'ast-minify' | 'ast-format';
  minifyOptions?: { keepAllNames?: boolean; keepNames?: string[] };
  formatOptions?: { indentwidth?: number };
}
export function writeP8(source: ParsedP8 | string | Uint8Array | ArrayBuffer, options?: P8WriterOptions): Uint8Array;
export function writeP8WithDiagnostics(source: ParsedP8 | string | Uint8Array | ArrayBuffer, options?: P8WriterOptions): {
  bytes: Uint8Array;
  characterCount: number;
  tokenCount: number;
  warnings: string[];
};
export function buildP8(options?: {
  existing?: string | Uint8Array | ArrayBuffer;
  sources?: Partial<Record<BuildDomainName, { format: 'p8' | 'lua'; data: string | Uint8Array | ArrayBuffer;
    filename?: string; files?: Record<string, string | Uint8Array>; luaPath?: string }>>;
  empty?: BuildDomainName[];
  luaMinify?: boolean;
  luaFormat?: boolean;
  optimizeTokens?: boolean;
  indentwidth?: number;
}): Uint8Array;
export function processP8Includes(source: string | Uint8Array | ArrayBuffer, options: {
  filename: string;
  readFile: (filename: string) => Uint8Array | undefined;
  rootPath?: string;
}): string;
export function processP8IncludesAsync(source: string | Uint8Array | ArrayBuffer, options: {
  filename: string;
  readFile: (filename: string) => Uint8Array | undefined | Promise<Uint8Array | undefined>;
  rootPath?: string;
}): Promise<string>;
export function minifyLua(source: string | Uint8Array, options?: { keepAllNames?: boolean; keepNames?: string[]; keepPropertyNames?: boolean }): Uint8Array;
export function formatLuaTokens(source: string | Uint8Array, options?: { indentwidth?: number }): Uint8Array;
export function minifyLuaAst(source: string | Uint8Array): Uint8Array;
export function formatLuaAst(source: string | Uint8Array, options?: { indentwidth?: number }): Uint8Array;
export function echoLuaAst(source: string | Uint8Array): Uint8Array;
export function pureLua(source: string | Uint8Array): Uint8Array;
export function cartridgeStats(source: ParsedP8 | string | Uint8Array | ArrayBuffer): {
  title: Uint8Array | null; byline: Uint8Array | null; version: number;
  characterCount: number; tokenCount: number; lineCount: number; compressedSize: number;
};
export function listLua(source: ParsedP8 | string | Uint8Array | ArrayBuffer, options?: {
  pure?: boolean; showLineNumbers?: boolean;
}): string;
export function listTokens(source: ParsedP8 | string | Uint8Array | ArrayBuffer): string;
export function bundleRequiredLua(source: string | Uint8Array, options?: {
  filename?: string; files?: Record<string, string | Uint8Array>; luaPath?: string;
}): Uint8Array;
export class LuaBuildError extends Error {}
export function decodePng(input: Uint8Array | ArrayBuffer): Promise<{
  width: number; height: number; rgba: Uint8Array;
}>;
export function encodePng(image: { width: number; height: number; rgba: Uint8Array }): Promise<Uint8Array>;
export function readP8Png(input: Uint8Array | ArrayBuffer): Promise<{
  width: number; height: number; rgba: Uint8Array; picodata: Uint8Array; cartridge: unknown;
}>;
export function writeP8Png(cartridge: unknown, labelPng: Uint8Array | ArrayBuffer,
  luaBytes?: Uint8Array): Promise<Uint8Array>;
export function writeP8PngFromP8(source: ParsedP8 | string | Uint8Array | ArrayBuffer,
  labelPng: Uint8Array | ArrayBuffer, options?: P8WriterOptions): Promise<Uint8Array>;
export function makeEmptyCartridge(options?: { filename?: string; version?: number }): any;
export function writeCartData(cartridge: any, data: Uint8Array | number[], startAddress?: number): any;
export function cartridgeCompressedSize(cartridge: any): number;
export class UnrecognizedFileType extends P8Error {
  readonly filename: string;
}
export function formatForFilename(filename: string): 'p8' | 'p8.png' | 'rom';
export function fromBytes(input: Uint8Array | ArrayBuffer, filename: string): Promise<ParsedP8 | any>;
export function fromFile(filename: string): Promise<ParsedP8 | any>;
export interface CartridgeFileOptions extends P8WriterOptions {
  labelPng?: Uint8Array | ArrayBuffer;
  labelFilename?: string;
  luaBytes?: Uint8Array;
}
export function toBytes(cartridge: ParsedP8 | any, filename: string,
  options?: CartridgeFileOptions): Promise<Uint8Array>;
export function toFile(cartridge: ParsedP8 | any, filename: string,
  options?: CartridgeFileOptions): Promise<void>;
export class LuaSource {
  constructor(code?: Uint8Array | string, version?: number);
  version: number;
  code: Uint8Array;
  static fromLines(lines: Iterable<string>, version?: number): LuaSource;
  updateFromLines(lines: Iterable<string>): this;
  update_from_lines(lines: Iterable<string>): this;
  toBytes(): Uint8Array;
  toLines(): string[];
  to_lines(): string[];
  readonly root: Chunk;
}
export class Game {
  constructor(filename?: string | null, compressedSize?: number | null);
  filename: string | null;
  compressedSize: number | null;
  compressed_size: number | null;
  lua: LuaSource | null;
  gfx: any; gff: any; map: any; sfx: any; music: any; label: any;
  version: number | null;
  static makeEmptyGame(filename?: string | null, version?: number): Game;
  static make_empty_game(filename?: string | null, version?: number): Game;
  static fromCartridge(cartridge: any, filename?: string | null): Game;
  static fromFile(filename: string): Promise<Game>;
  static from_file(filename: string): Promise<Game>;
  static fromP8File(filename: string): Promise<Game>;
  static from_p8_file(filename: string): Promise<Game>;
  getCompressedSize(): number;
  get_compressed_size(): number;
  writeCartData(data: Uint8Array | number[], startAddress?: number): this;
  write_cart_data(data: Uint8Array | number[], startAddress?: number): this;
  toCartridge(format?: 'p8' | 'p8.png'): any;
  toFile(filename: string, options?: CartridgeFileOptions): Promise<void>;
  to_file(filename: string, options?: CartridgeFileOptions): Promise<void>;
  toP8File(filename: string, options?: CartridgeFileOptions): Promise<void>;
  to_p8_file(filename: string, options?: CartridgeFileOptions): Promise<void>;
}
export class Token {
  constructor(data: string | Uint8Array, line?: number | null, column?: number | null);
  readonly type: string;
  readonly name: string;
  readonly line: number | null;
  readonly column: number | null;
  readonly lineno: number | null;
  readonly charno: number | null;
  readonly value: string | number;
  code: string;
  readonly length: number;
  equals(other: unknown): boolean;
  matches(other: unknown): boolean;
  toPythonRepr(): string;
}
export class TokSpace extends Token {}
export class TokNewline extends Token {}
export class TokComment extends Token {}
export class TokString extends Token { readonly value: string; }
export class TokNumber extends Token { readonly value: number; }
export class TokName extends Token {}
export class TokLabel extends Token {}
export class TokKeyword extends Token {}
export class TokSymbol extends Token {}
export function tokenizeLua(source: string | Uint8Array): Token[];
export function pythonBytesRepr(value: string | Uint8Array): string;
export function analyzeLua(source: string | Uint8Array, filename?: string): {
  characterCount: number; tokenCount: number; warnings: string[];
};
export function echoLua(source: string | Uint8Array): Uint8Array;
export function findLua(source: ParsedP8 | string | Uint8Array | ArrayBuffer,
  pattern: string | RegExp, options?: { filename?: string; listFiles?: boolean }): string;
export class LuaAstError extends SyntaxError {}
export class Node {
  constructor(type: string, fields?: Record<string, unknown>, first?: unknown, last?: unknown, source?: string);
  type: string;
  _name: string;
  _fields: string[];
  _token_groups: Array<Token[] | [string | [string, ...number[]], Token[]]>;
  readonly start_pos: number | null;
  readonly end_pos: number | null;
  readonly tokens: IterableIterator<Token>;
  storeTokenGroups(tokenlist: Token[]): this;
  store_token_groups(tokenlist: Token[]): this;
  iterTokens(): IterableIterator<Token>;
  children(): Node[];
  walk(visitor: ((node: Node) => void) | { visit(node: Node): void }): this;
}
export { Node as LuaNode };
export class Chunk extends Node { stats: Node[]; }
export class StatAssignment extends Node { varlist: VarList; assignop: TokSymbol; explist: ExpList; }
export class StatFunctionCall extends Node { functioncall: FunctionCall | FunctionCallMethod; }
export class StatDo extends Node { block: Chunk; }
export class StatWhile extends Node { exp: Node; block: Chunk; }
export class StatRepeat extends Node { block: Chunk; exp: Node; }
export class StatIf extends Node { exp_block_pairs: Array<[Node | null, Chunk]>; }
export class StatForStep extends Node { name: TokName; exp_init: Node; exp_end: Node; exp_step: Node | null; block: Chunk; }
export class StatForIn extends Node { namelist: NameList; explist: ExpList; block: Chunk; }
export class StatFunction extends Node { funcname: FunctionName; funcbody: FunctionBody; }
export class StatLocalFunction extends Node { funcname: TokName; funcbody: FunctionBody; }
export class StatLocalAssignment extends Node { namelist: NameList; explist: ExpList | null; }
export class StatGoto extends Node { label: string; }
export class StatLabel extends Node { label: string; }
export class StatBreak extends Node {}
export class StatReturn extends Node { explist: ExpList | null; }
export class FunctionName extends Node { namepath: TokName[]; methodname: TokName | null; }
export class FunctionArgs extends Node { explist: ExpList | null; }
export class VarList extends Node { vars: Node[]; }
export class VarName extends Node { name: TokName; }
export class VarIndex extends Node { exp_prefix: Node; exp_index: Node; }
export class VarAttribute extends Node { exp_prefix: Node; attr_name: TokName; }
export class NameList extends Node { names: TokName[]; }
export class ExpList extends Node { exps: Node[]; }
export class ExpValue extends Node { value: Node | Token | boolean | null; }
export class VarargDots extends Node {}
export class ExpBinOp extends Node { exp1: Node; binop: TokSymbol | TokKeyword; exp2: Node; }
export class ExpUnOp extends Node { unop: TokSymbol | TokKeyword; exp: Node; }
export class FunctionCall extends Node { exp_prefix: Node; args: FunctionArgs | TableConstructor | string | null; }
export class FunctionCallMethod extends Node { exp_prefix: Node; methodname: TokName; args: FunctionArgs | TableConstructor | string | null; }
export class Function extends Node { funcbody: FunctionBody; }
export class FunctionBody extends Node { parlist: NameList | null; dots: VarargDots | null; block: Chunk; }
export class TableConstructor extends Node { fields: Node[]; }
export class FieldExp extends Node { exp: Node; }
export class FieldExpKey extends Node { key_exp: Node; exp: Node; }
export class FieldNamedKey extends Node { key_name: TokName; exp: Node; }
export class FieldOtherThing extends Node {}
export class FieldNamed extends Node {}
export class AstParser { constructor(source: string | Uint8Array); parse(): Chunk; }
export function parseLua(source: string | Uint8Array): Chunk;
export function parseLuaAst(source: string | Uint8Array): Chunk;
export function printAst(source: string | Uint8Array): string;
export function printNode(value: unknown, indent?: number, prefix?: string, output?: string[]): string[];
export class BaseASTWalker {
  constructor(tokens: Token[], root: any, args?: Record<string, unknown>);
  protected _tokens: Token[];
  protected _root: any;
  protected _args: Record<string, unknown>;
  protected _walk(node: any): IterableIterator<unknown>;
  protected _walk_node(node: any): IterableIterator<unknown>;
  protected _walk_token(token: Token): IterableIterator<unknown>;
  protected _walk_value(value: unknown): IterableIterator<unknown>;
  walk(): IterableIterator<unknown>;
}
