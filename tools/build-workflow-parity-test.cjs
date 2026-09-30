'use strict';

// Focused workflow ports from the pinned Python TestDoBuild cases. The four
// historical fixtures that called the absent Game.to_p8_file are written via
// the supported Game.toFile API; this adapts setup while retaining all build
// output assertions from the upstream methods.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Game, LuaSource, locateRequireFile } = require('../src');
const cli = path.join(__dirname, 'p8tool.cjs');

async function inTempDirectory(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p8-build-workflow-'));
  try { return await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
async function saveCart(file, { lua = '', gfx = null, flags = null } = {}) {
  const cart = Game.makeEmptyGame(file);
  if (lua) cart.lua = LuaSource.fromLines([lua], 8);
  if (gfx) cart.gfx.setSprite(0, gfx);
  if (flags !== null) cart.gff.setFlags(0, flags);
  await cart.toFile(file);
}
function build(dir, args) {
  const result = spawnSync(process.execPath, [cli, 'build', ...args], { cwd: dir, encoding: 'utf8' });
  assert.ifError(result.error);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
function outputBytes(file) { return fs.readFileSync(file); }

test('tests.pico8.build.build_test.TestDoBuild.testErrorInputFileHasWrongExtension', async () => inTempDirectory((dir) => {
  fs.writeFileSync(path.join(dir, 'in.xxx'), '');
  assert.ok(fs.existsSync(path.join(dir, 'in.xxx')));
  const result = build(dir, ['--lua', 'in.xxx', 'foo.p8']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsupported file type for --lua arg/);
}));

test('tests.pico8.build.build_test.TestDoBuild.testErrorBothInputAndEmptyArgsSpecified', async () => inTempDirectory((dir) => {
  fs.writeFileSync(path.join(dir, 'in.p8'), '');
  assert.ok(fs.existsSync(path.join(dir, 'in.p8')));
  const result = build(dir, ['--lua', 'in.p8', '--empty-lua', 'foo.p8']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot specify --lua and --empty-lua args together/);
}));

test('tests.pico8.build.build_test.TestDoBuild.testLocateRequireFileDefaultLuaPath', () => {
  const filename = path.join(os.tmpdir(), 'src.lua');
  const expected = path.join(os.tmpdir(), 'foo.lua').replace(/^\//, '');
  const files = { [expected]: Buffer.from('-- hi') };
  assert.equal(locateRequireFile('foo', filename, { files }), expected);
  assert.equal(locateRequireFile('foo.lua', filename, { files }), expected);
});

test('tests.pico8.build.build_test.TestDoBuild.testLocateRequireFileCustomLuaPath', () => {
  const filename = path.join(os.tmpdir(), 'src.lua');
  const expected = path.join(os.tmpdir(), 'bar/foo.lua').replace(/^\//, '');
  const files = { [expected]: Buffer.from('-- hi') };
  assert.equal(locateRequireFile('foo', filename, { files, luaPath: 'bar/?.lua;?;?.lua' }), expected);
  assert.equal(locateRequireFile('foo', filename, { files, luaPath: `${os.tmpdir()}/bar/?.lua;?;?.lua` }), expected);
});

test('tests.pico8.build.build_test.TestDoBuild.testBuildCreatesEmptyDefault', async () => inTempDirectory((dir) => {
  const result = build(dir, ['foo.p8']);
  assert.equal(result.status, 0);
  assert.ok(fs.existsSync(path.join(dir, 'foo.p8')));
  assert.ok(outputBytes(path.join(dir, 'foo.p8')).includes(Buffer.from('__gfx__\n00000000')));
}));

test('tests.pico8.build.build_test.TestDoBuild.testBuildLuaFromLuaFile', async () => inTempDirectory(async (dir) => {
  const output = path.join(dir, 'foo.p8');
  await saveCart(output, { lua: 'print("zzz")' });
  assert.ok(outputBytes(output).includes(Buffer.from('__lua__\nprint("zzz")\n')));
  fs.writeFileSync(path.join(dir, 'in.lua'), 'print("hi")');
  assert.equal(build(dir, ['--lua', 'in.lua', 'foo.p8']).status, 0);
  assert.ok(outputBytes(output).includes(Buffer.from('__lua__\nprint("hi")\n')));
}));

test('tests.pico8.build.build_test.TestDoBuild.testBuildLuaFromP8', async () => inTempDirectory(async (dir) => {
  const output = path.join(dir, 'foo.p8');
  await saveCart(output, { lua: 'print("zzz")' });
  assert.ok(outputBytes(output).includes(Buffer.from('__lua__\nprint("zzz")\n')));
  await saveCart(path.join(dir, 'in.p8'), { lua: 'print("hi")' });
  assert.equal(build(dir, ['--lua', 'in.p8', 'foo.p8']).status, 0);
  assert.ok(outputBytes(output).includes(Buffer.from('__lua__\nprint("hi")\n')));
}));

test('tests.pico8.build.build_test.TestDoBuild.testBuildEmptiesSection', async () => inTempDirectory(async (dir) => {
  const output = path.join(dir, 'foo.p8');
  await saveCart(output, { gfx: [[1, 0, 1], [0, 1, 0], [1, 0, 1]], flags: 7 });
  const initial = outputBytes(output);
  assert.ok(initial.includes(Buffer.from('__gfx__\n10100000')));
  assert.ok(initial.includes(Buffer.from('__gff__\n07000000')));
  assert.equal(build(dir, ['--empty-gfx', 'foo.p8']).status, 0);
  const result = outputBytes(output);
  assert.ok(result.includes(Buffer.from('__gfx__\n00000000')));
  assert.ok(result.includes(Buffer.from('__gff__\n07000000')));
}));

test('tests.pico8.build.build_test.TestDoBuild.testBuildOverwritesExisting', async () => inTempDirectory(async (dir) => {
  const output = path.join(dir, 'foo.p8');
  await saveCart(output, { gfx: [[1, 0, 1], [0, 1, 0], [1, 0, 1]], flags: 7 });
  const initial = outputBytes(output);
  assert.ok(initial.includes(Buffer.from('__gfx__\n10100000')));
  assert.ok(initial.includes(Buffer.from('__gff__\n07000000')));
  await saveCart(path.join(dir, 'in.p8'), { gfx: [[2, 0, 2], [0, 2, 0], [2, 0, 2]] });
  assert.equal(build(dir, ['--gfx', 'in.p8', 'foo.p8']).status, 0);
  const result = outputBytes(output);
  assert.ok(result.includes(Buffer.from('__gfx__\n20200000')));
  assert.ok(result.includes(Buffer.from('__gff__\n07000000')));
}));
