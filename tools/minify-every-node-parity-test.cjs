#!/usr/bin/env node
'use strict';

// Focused ports of the three every-node Lua minifier tests from lua_test.py.
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { test } = require('node:test');
const { minifyLua, minifyLuaAst } = require('../src');

const fixture = join(__dirname, '../tests/fixtures/tier3-echo-png/every-node.lua');

async function source() {
  return readFile(fixture);
}

test('tests.pico8.lua.lua_test.TestLuaMinifyWriter.testMinifiesSpacesEveryNode', async () => {
  const txt = Buffer.from(minifyLuaAst(await source()));
  assert.ok(!txt.includes(Buffer.from('-- the code with the nodes')));
  assert.ok(txt.includes(Buffer.from('while f < 10 do\nf += 1\nif f % 2 == 0 then\na(f)\nelseif f > 5 then\na(f, 5)\nelse\na(f, 1)\ng *= 2\nend\nend\n')));
  assert.ok(txt.includes(Buffer.from('for g in i() do\na(g)\nend\n')));
  assert.ok(txt.includes(Buffer.from('f=1  n=2  o=3')));
});

test('tests.pico8.lua.lua_test.TestLuaMinifyWriter.testMinifyTokenWriterMinifiesSpacesEveryNode', async () => {
  const txt = Buffer.from(minifyLua(await source()));
  assert.ok(txt.includes(Buffer.from('-- author comment')));
  assert.ok(!txt.includes(Buffer.from('-- the code with the nodes')));
  assert.ok(txt.includes(Buffer.from('while f<10 do\nf+=1\nif f%2==0 then\na(f)\nelseif f>5 then\na(f,5)\nelse\na(f,1)\ng*=2\nend\nend')));
  assert.ok(txt.includes(Buffer.from('for g in i() do\na(g)\nend')));
  assert.ok(txt.includes(Buffer.from('f=1;n=2;o=3')));
});

test('tests.pico8.lua.lua_test.TestLuaMinifyWriter.testMinifiesNamesEveryNode', async () => {
  const txt = Buffer.from(minifyLuaAst(await source()));
  assert.ok(txt.includes(Buffer.from('function a(b,')));
  assert.ok(txt.includes(Buffer.from('local c')));
  assert.ok(txt.includes(Buffer.from('c[b]')));
  assert.ok(txt.includes(Buffer.from('return c')));
  assert.ok(txt.includes(Buffer.from('local function d(e)')));
  assert.ok(txt.includes(Buffer.from('print(e)')));
  assert.ok(txt.includes(Buffer.from('::u::\ngoto u')));
});
