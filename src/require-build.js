'use strict';

const path = require('node:path');
const { encodeP8scii } = require('./picotool');
const { tokenizeLua, echoLua } = require('./lua-lexer');
const { validateLua } = require('./lua-parser');

const PREAMBLE = 'package={loaded={},_c={}}\n';
const REQUIRE_FUNCTION = 'function require(p)\nlocal l=package.loaded\nif (l[p]==nil) l[p]=package._c[p]()\nif (l[p]==nil) l[p]=true\nreturn l[p]\nend\n';
const GAME_LOOP_NAMES = new Set(['_init', '_update', '_update60', '_draw']);

class LuaBuildError extends Error {
  constructor(message, token) {
    super(`${message} at line ${token.line + 1} char ${token.column}`);
    this.name = 'LuaBuildError';
  }
}

function significant(source) { return tokenizeLua(source).filter((token) => !['space', 'newline', 'comment'].includes(token.type)); }

function stringValue(code) {
  if (!code || !['"', "'"].includes(code[0])) return null;
  const body = code.slice(1, -1);
  return body.replace(/\\(\d{1,3}|.)/gs, (_, escape) => {
    if (/^\d/.test(escape)) return String.fromCharCode(Number(escape));
    const values = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11 };
    return String.fromCharCode(values[escape] ?? escape.charCodeAt(0));
  });
}

function calls(source) {
  const tokens = significant(source), found = [];
  function pythonAttributeError(message) {
    const error = new Error(message); error.name = 'AttributeError'; throw error;
  }
  function insideAnotherCall(index) {
    const stack = [];
    for (let j = 0; j < index; j += 1) {
      const value = tokens[j].code;
      if (value === '(') stack.push(tokens[j - 1]?.type === 'name' || [')', ']'].includes(tokens[j - 1]?.code));
      else if (value === ')') stack.pop();
    }
    return stack.includes(true);
  }
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    if (tokens[i].type !== 'name' || tokens[i].code !== 'require') continue;
    if (i > 0 && ['.', ':'].includes(tokens[i - 1].code)) continue;
    if (insideAnotherCall(i)) continue;
    if (tokens[i + 1]?.type === 'string') pythonAttributeError("'TokString' object has no attribute 'explist'");
    if (tokens[i + 1]?.code === '{') pythonAttributeError("'TableConstructor' object has no attribute 'explist'");
    if (tokens[i + 1]?.code !== '(') continue;
    const open = tokens[i + 1], args = [];
    let start = i + 2, depth = 0, end = -1;
    for (let j = start; j < tokens.length; j += 1) {
      const value = tokens[j].code;
      if (value === ')' && depth === 0) { if (j > start) args.push(tokens.slice(start, j)); end = j; break; }
      if (value === ',' && depth === 0) { args.push(tokens.slice(start, j)); start = j + 1; continue; }
      if (['(', '{', '['].includes(value)) depth += 1;
      if ([')', '}', ']'].includes(value)) depth -= 1;
    }
    if (end < 0) continue;
    if (args.length < 1 || args.length > 2) throw new LuaBuildError(`require() has ${args.length} args, should have 1 or 2`, open);
    if (args[0].length !== 1 || args[0][0].type !== 'string') {
      throw new LuaBuildError('require() first argument must be a string literal', open);
    }
    const requirePath = stringValue(args[0][0].code);
    let useGameLoop = false;
    if (args.length === 2) {
      const option = args[1];
      if (option[0]?.code !== '{' || option.at(-1)?.code !== '}') {
        throw new LuaBuildError('require() second argument must be a table literal', open);
      }
      if (option.length !== 5 || option[1].code !== 'use_game_loop' || option[2].code !== '='
        || !['true', 'false'].includes(option[3].code)) {
        throw new LuaBuildError('Invalid require() options; did you mean {use_game_loop=true} ?', open);
      }
      useGameLoop = option[3].code === 'true';
    }
    found.push({ path: requirePath, useGameLoop, token: open });
    i = end;
  }
  return found;
}

function removeGameLoops(source) {
  const tokens = significant(Buffer.from(source, 'latin1'));
  const lines = source.split('\n');
  const offsets = [0];
  for (let i = 0; i < lines.length - 1; i += 1) offsets.push(offsets.at(-1) + lines[i].length + 1);
  const offset = (token) => offsets[token.line] + token.column;
  const ranges = [];
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    if (tokens[i].code !== 'function' || !GAME_LOOP_NAMES.has(tokens[i + 1].code)) continue;
    const start = offset(tokens[i]);
    if (start > 0 && source[start - 1] !== '\n') continue;
    let depth = 1, pendingDo = 0, last = -1;
    for (let j = i + 2; j < tokens.length; j += 1) {
      const value = tokens[j].code;
      if (['function', 'if', 'for', 'while', 'repeat'].includes(value)) {
        depth += 1;
        if (value === 'for' || value === 'while') pendingDo += 1;
      } else if (value === 'do') {
        if (pendingDo) pendingDo -= 1;
        else depth += 1;
      } else if (value === 'end' || value === 'until') {
        depth -= 1;
        if (depth === 0) { last = j; break; }
      }
    }
    if (last < 0) continue;
    let end = offset(tokens[last]) + tokens[last].code.length;
    while (source[end] === ' ' || source[end] === '\t') end += 1;
    if (source[end] === '\n') end += 1;
    ranges.push([start, end]);
    i = last;
  }
  if (!ranges.length) return source;
  // Python's AST echo writer currently fails if a removed loop is followed by
  // another retained statement. Preserve that observable upstream result.
  const finalEnd = ranges.at(-1)[1];
  if (source.slice(finalEnd).trim()) {
    const error = new Error(''); error.name = 'AssertionError'; throw error;
  }
  let result = '', cursor = 0;
  for (const [start, end] of ranges) { result += source.slice(cursor, start); cursor = end; }
  return result + source.slice(cursor);
}

function bundleRequiredLua(source, { filename = 'main.lua', files = {}, luaPath } = {}) {
  const main = typeof source === 'string' ? encodeP8scii(source) : Buffer.from(source);
  validateLua(main);
  const modules = new Map();
  function visit(bytes, currentFile) {
    for (const call of calls(bytes)) {
      if (call.path.includes('./') || call.path.startsWith('/')) {
        throw new LuaBuildError('require() filename cannot contain "./" or "../" or start with "/"', call.token);
      }
      if (modules.has(call.path)) continue;
      let selected = null;
      for (const pattern of (luaPath ?? '?;?.lua').split(';')) {
        const candidate = pattern.replace('?', call.path);
        const resolved = path.isAbsolute(candidate) ? path.normalize(candidate)
          : path.normalize(path.join(path.dirname(currentFile), candidate));
        const key = resolved.replace(/^\//, '');
        if (Object.prototype.hasOwnProperty.call(files, key)) { selected = key; break; }
      }
      if (selected === null) {
        throw new LuaBuildError(`require() file ${call.path} not found; used load path ${luaPath ?? 'None'}`, call.token);
      }
      const value = files[selected];
      const moduleBytes = typeof value === 'string' ? encodeP8scii(value) : Buffer.from(value);
      validateLua(moduleBytes);
      let moduleCode = echoLua(moduleBytes).toString('latin1');
      if (!call.useGameLoop && [...GAME_LOOP_NAMES].some((name) => moduleCode.includes(`function ${name}`))) {
        moduleCode = removeGameLoops(moduleCode);
      }
      modules.set(call.path, moduleCode);
      visit(moduleBytes, selected);
    }
  }
  visit(main, filename);
  if (!modules.size) return echoLua(main);
  let output = PREAMBLE;
  for (const [modulePath, moduleCode] of modules) {
    output += `package._c["${modulePath.replace(/"/g, '\\"')}"]=function()\n${moduleCode}end\n`;
  }
  output += REQUIRE_FUNCTION + echoLua(main).toString('latin1');
  validateLua(Buffer.from(output, 'latin1'));
  return Buffer.from(output, 'latin1');
}

module.exports = Object.freeze({ bundleRequiredLua, LuaBuildError });
