#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { test } = require('node:test');
const p = require('../src');

const fixture = (...parts) => join(__dirname, '../tests/fixtures', ...parts);

test('tests.pico8.lua.lua_test.TestLuaASTEchoWriter.testToLinesASTEchoWriterEveryNode', async () => {
  const source = await readFile(fixture('tier3-echo-png', 'every-node.lua'));
  // Upstream compares the AST writer's output lines with every original input line.
  const lines = (bytes) => Buffer.from(bytes).toString('latin1').match(/[^\n]*\n|[^\n]+$/g) || [];
  assert.deepEqual(lines(p.echoLuaAst(source)), lines(source));
});

test('tests.pico8.game.game_test.TestGameToP8.testToP8FileFromPng', async () => {
  const game = await p.fromFile(fixture('tier3-echo-png', 'test_cart.p8.png'));
  const actual = Buffer.from(await p.toBytes(game, 'test_cart.p8'));
  const expected = await readFile(fixture('tier2-game', 'test_cart.p8'));
  assert.deepEqual(actual, expected);
});
