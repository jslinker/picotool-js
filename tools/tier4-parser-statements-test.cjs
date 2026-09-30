#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const p = require('../src');

// Upstream get_parser splits on LF and appends an LF to every part. AstParser
// skips trivia for parsing but tokenPos includes it, so the consumed token maps to
// the Python cursor position after the consumed token.
function parserFor(source) {
  const withLinefeeds = source.split('\n').map((line) => `${line}\n`).join('');
  return new p.AstParser(withLinefeeds);
}
function parseStat(source) { const parser = parserFor(source); const node = parser.statement(); return { parser, node }; }
function parseChunk(source) { const parser = parserFor(source); const node = parser.parse(); return { parser, node }; }
function cursor(parser) { return parser.i ? parser.tokens[parser.i - 1].tokenPos + 1 : 0; }
function tok(actual, expected) { assert.equal(actual.matches(expected), true); }
function type(actual, expected) { assert.equal(actual.type, expected); }

test('tests.pico8.lua.parser_test.TestParser.testStatAssignment', () => {
  const { parser, node } = parseStat('foo, bar, baz = 1, 2, 3');
  assert.ok(node); assert.equal(cursor(parser), 17); assert.equal(node.varlist.vars.length, 3);
  assert.equal(node.varlist.vars[0].name.value, 'foo'); assert.equal(node.varlist.vars[1].name.value, 'bar'); assert.equal(node.varlist.vars[2].name.value, 'baz');
  tok(node.assignop, new p.TokSymbol('=')); assert.equal(node.explist.exps.length, 3);
  for (let i = 0; i < 3; i += 1) tok(node.explist.exps[i].value, new p.TokNumber(String(i + 1)));
});

test('tests.pico8.lua.parser_test.TestParser.testStatFunctionCall', () => {
  const { parser, node } = parseStat('foo(1, 2, 3)');
  assert.ok(node); assert.equal(cursor(parser), 10); assert.equal(node.functioncall.exp_prefix.name.value, 'foo');
  assert.equal(node.functioncall.args.explist.exps.length, 3);
  for (let i = 0; i < 3; i += 1) tok(node.functioncall.args.explist.exps[i].value, new p.TokNumber(String(i + 1)));
});

test('tests.pico8.lua.parser_test.TestParser.testStatDo', () => {
  const { parser, node } = parseStat('do break end'); assert.ok(node); assert.equal(cursor(parser), 5);
  assert.equal(node.block.stats.length, 1); type(node.block.stats[0], 'StatBreak');
});

test('tests.pico8.lua.parser_test.TestParser.testStatWhile', () => {
  const { parser, node } = parseStat('while true do break end'); assert.ok(node); assert.equal(cursor(parser), 9);
  assert.equal(node.exp.value, true); assert.equal(node.block.stats.length, 1); type(node.block.stats[0], 'StatBreak');
});

test('tests.pico8.lua.parser_test.TestParser.testStatWhileLiveExample', () => {
  const source = '\t\twhile(s.y<b.y)do\n\t\t\ts.y+=1;e.y+=1;s.x+=dx1;e.x+=dx2;\n\t\t\tline(s.x,s.y,e.x,e.y);\n\t\tend\n';
  const { parser, node } = parseStat(source); assert.ok(node); assert.equal(cursor(parser), 62); assert.equal(node.block.stats.length, 5);
});

test('tests.pico8.lua.parser_test.TestParser.testStatRepeat', () => {
  const { parser, node } = parseStat('repeat break until true'); assert.ok(node); assert.equal(cursor(parser), 7);
  assert.equal(node.block.stats.length, 1); type(node.block.stats[0], 'StatBreak'); assert.equal(node.exp.value, true);
});

test('tests.pico8.lua.parser_test.TestParser.testStatIf', () => {
  const { parser, node } = parseStat('if true then break end'); assert.ok(node); assert.equal(cursor(parser), 9);
  assert.equal(node.exp_block_pairs.length, 1); assert.equal(node.exp_block_pairs[0][0].value, true);
  assert.equal(node.exp_block_pairs[0][1].stats.length, 1); type(node.exp_block_pairs[0][1].stats[0], 'StatBreak');
});

test('tests.pico8.lua.parser_test.TestParser.testStatIfElse', () => {
  const { parser, node } = parseStat('if true then break else return end'); assert.ok(node); assert.equal(cursor(parser), 13);
  assert.equal(node.exp_block_pairs.length, 2); assert.equal(node.exp_block_pairs[0][0].value, true);
  assert.equal(node.exp_block_pairs[0][1].stats.length, 1); type(node.exp_block_pairs[0][1].stats[0], 'StatBreak');
  assert.equal(node.exp_block_pairs[1][0], null); assert.equal(node.exp_block_pairs[1][1].stats.length, 1);
  type(node.exp_block_pairs[1][1].stats[0], 'StatReturn'); assert.equal(node.exp_block_pairs[1][1].stats[0].explist, null);
});

test('tests.pico8.lua.parser_test.TestParser.testStatIfElseIf', () => {
  const { parser, node } = parseStat('if true then break elseif false then return end'); assert.ok(node); assert.equal(cursor(parser), 17);
  assert.equal(node.exp_block_pairs.length, 2); assert.equal(node.exp_block_pairs[0][0].value, true);
  assert.equal(node.exp_block_pairs[0][1].stats.length, 1); type(node.exp_block_pairs[0][1].stats[0], 'StatBreak');
  assert.equal(node.exp_block_pairs[1][0].value, false); assert.equal(node.exp_block_pairs[1][1].stats.length, 1);
  type(node.exp_block_pairs[1][1].stats[0], 'StatReturn'); assert.equal(node.exp_block_pairs[1][1].stats[0].explist, null);
});

test('tests.pico8.lua.parser_test.TestParser.testStatIfElseIfElse', () => {
  const { parser, node } = parseStat('if true then break elseif false then break else return end'); assert.ok(node); assert.equal(cursor(parser), 21);
  assert.equal(node.exp_block_pairs.length, 3); assert.equal(node.exp_block_pairs[0][0].value, true);
  assert.equal(node.exp_block_pairs[0][1].stats.length, 1); type(node.exp_block_pairs[0][1].stats[0], 'StatBreak');
  assert.equal(node.exp_block_pairs[1][0].value, false); assert.equal(node.exp_block_pairs[1][1].stats.length, 1); type(node.exp_block_pairs[1][1].stats[0], 'StatBreak');
  assert.equal(node.exp_block_pairs[2][0], null); type(node.exp_block_pairs[2][1].stats[0], 'StatReturn'); assert.equal(node.exp_block_pairs[2][1].stats[0].explist, null);
});

function assertShortIf(source, consumed, expectedPairs) {
  const { parser, node } = parseStat(source); assert.ok(node); assert.equal(cursor(parser), consumed);
  assert.equal(node.exp_block_pairs.length, expectedPairs); assert.equal(node.exp_block_pairs[0][0].value, true);
  assert.equal(node.exp_block_pairs[0][1].stats.length, 1); type(node.exp_block_pairs[0][1].stats[0], 'StatBreak');
  if (expectedPairs === 2) { assert.equal(node.exp_block_pairs[1][0], null); assert.equal(node.exp_block_pairs[1][1].stats.length, 1); type(node.exp_block_pairs[1][1].stats[0], 'StatBreak'); }
}

test('tests.pico8.lua.parser_test.TestParser.testStatIfShort', () => {
  assertShortIf('if (true) break\nreturn', 7, 1);
});

test('tests.pico8.lua.parser_test.TestParser.testStatIfShortEOF', () => {
  assertShortIf('if (true) break', 7, 1);
});

test('tests.pico8.lua.parser_test.TestParser.testStatIfShortElse', () => {
  assertShortIf('if (true) break else break\nreturn', 11, 2);
});

test('tests.pico8.lua.parser_test.TestParser.testStatIfShortEmptyElse', () => {
  assertShortIf('if (true) break else  \nreturn', 9, 1);
});

test('tests.pico8.lua.parser_test.TestParser.testStatIfDoHack', () => {
  const { parser, node } = parseStat('if (true) do\nbreak end'); assert.ok(node); assert.equal(cursor(parser), 11);
  assert.equal(node.exp_block_pairs.length, 1); assert.equal(node.exp_block_pairs[0][0].value.value, true);
  assert.equal(node.exp_block_pairs[0][1].stats.length, 1); type(node.exp_block_pairs[0][1].stats[0], 'StatBreak');
});

test('tests.pico8.lua.parser_test.TestParser.testStatFor', () => {
  const { parser, node } = parseStat('for foo=1,3 do break end'); assert.ok(node); assert.equal(cursor(parser), 13);
  assert.equal(node.name.value, 'foo'); tok(node.exp_init.value, new p.TokNumber('1')); tok(node.exp_end.value, new p.TokNumber('3'));
  assert.equal(node.exp_step, null); assert.equal(node.block.stats.length, 1); type(node.block.stats[0], 'StatBreak');
});

test('tests.pico8.lua.parser_test.TestParser.testStatForStep', () => {
  const { parser, node } = parseStat('for foo=1,3,10 do break end'); assert.ok(node); assert.equal(cursor(parser), 15);
  assert.equal(node.name.value, 'foo'); tok(node.exp_init.value, new p.TokNumber('1')); tok(node.exp_end.value, new p.TokNumber('3')); tok(node.exp_step.value, new p.TokNumber('10'));
  assert.equal(node.block.stats.length, 1); type(node.block.stats[0], 'StatBreak');
});

test('tests.pico8.lua.parser_test.TestParser.testStatForIn', () => {
  const { parser, node } = parseStat('for foo, bar in 1, 3 do\n  break\nend\n'); assert.ok(node); assert.equal(cursor(parser), 20);
  assert.equal(node.namelist.names.length, 2); assert.equal(node.namelist.names[0].value, 'foo'); assert.equal(node.namelist.names[1].value, 'bar');
  assert.equal(node.explist.exps.length, 2); tok(node.explist.exps[0].value, new p.TokNumber('1')); tok(node.explist.exps[1].value, new p.TokNumber('3'));
  assert.equal(node.block.stats.length, 1); type(node.block.stats[0], 'StatBreak');
});

test('tests.pico8.lua.parser_test.TestParser.testStatFunction', () => {
  const { parser, node } = parseStat('function foo(a, b, c) break end'); assert.ok(node); assert.equal(cursor(parser), 16);
  assert.equal(node.funcname.namepath.length, 1); assert.equal(node.funcname.namepath[0].value, 'foo'); assert.equal(node.funcname.methodname, null);
  assert.equal(node.funcbody.parlist.names.length, 3); assert.deepEqual(node.funcbody.parlist.names.map(n => n.value), ['a', 'b', 'c']);
  assert.equal(node.funcbody.dots, null); assert.equal(node.funcbody.block.stats.length, 1); type(node.funcbody.block.stats[0], 'StatBreak');
});

test('tests.pico8.lua.parser_test.TestParser.testStatLocalFunction', () => {
  const { parser, node } = parseStat('local function foo(a, b, c) break end'); assert.ok(node); assert.equal(cursor(parser), 18);
  assert.equal(node.funcname.value, 'foo'); assert.equal(node.funcbody.parlist.names.length, 3); assert.deepEqual(node.funcbody.parlist.names.map(n => n.value), ['a', 'b', 'c']);
  assert.equal(node.funcbody.dots, null); assert.equal(node.funcbody.block.stats.length, 1); type(node.funcbody.block.stats[0], 'StatBreak');
});

test('tests.pico8.lua.parser_test.TestParser.testStatLocalAssignment', () => {
  const { parser, node } = parseStat('local foo, bar, baz'); assert.ok(node); assert.equal(cursor(parser), 9);
  assert.equal(node.namelist.names.length, 3); assert.deepEqual(node.namelist.names.map(n => n.value), ['foo', 'bar', 'baz']); assert.equal(node.explist, null);
});

test('tests.pico8.lua.parser_test.TestParser.testStatLocalAssignmentWithValues', () => {
  const { parser, node } = parseStat('local foo, bar, baz = 1, 2, 3'); assert.ok(node); assert.equal(cursor(parser), 19);
  assert.equal(node.namelist.names.length, 3); assert.deepEqual(node.namelist.names.map(n => n.value), ['foo', 'bar', 'baz']);
  assert.equal(node.explist.exps.length, 3); for (let i = 0; i < 3; i += 1) tok(node.explist.exps[i].value, new p.TokNumber(String(i + 1)));
});

test('tests.pico8.lua.parser_test.TestParser.testStatGoto', () => {
  const { parser, node } = parseStat('goto foobar'); assert.ok(node); assert.equal(cursor(parser), 3); assert.equal(node.label, 'foobar');
});

test('tests.pico8.lua.parser_test.TestParser.testStatLabel', () => {
  const { parser, node } = parseStat('::foobar::'); assert.ok(node); assert.equal(cursor(parser), 1); assert.equal(node.label, 'foobar');
});

test('tests.pico8.lua.parser_test.TestParser.testStatAssignmentAnonymousFunctionTable', () => {
  const source = `\nplayer =\n{\n    init=function(this)\n        print(t1)\n    end,\n    update=function(this)\n        print(t2)\n    end,\n    draw=function(this)\n        print(t3)\n    end\n}\n`;
  const { parser, node } = parseStat(source); assert.ok(node); assert.equal(cursor(parser), 61);
  assert.equal(node.varlist.vars.length, 1); assert.equal(node.varlist.vars[0].name.value, 'player'); tok(node.assignop, new p.TokSymbol('='));
  assert.equal(node.explist.exps.length, 1); assert.equal(node.explist.exps[0].value.fields.length, 3);
  for (const [index, name] of ['init', 'update', 'draw'].entries()) {
    const field = node.explist.exps[0].value.fields[index]; assert.equal(field.key_name.value, name); type(field.exp.value, 'Function');
  }
});

test('tests.pico8.lua.parser_test.TestParser.testChunk', () => {
  // Pinned upstream LUA_SAMPLE fixture, copied literally from parser_test.py.
  const source = `
-- game of life: v1
-- by dddaaannn

alive_color = 7; width = 128; height = 128

board_i = 1
boards = {{}, {}}

cls()
for y=1,height do
  boards[1][y] = {}
  boards[2][y] = {}
  for x=1,width do
    boards[1][y][x] = 0
    boards[2][y][x] = 0
  end
end

-- draw an r pentomino
boards[1][60][64] = 1
boards[1][60][65] = 1
boards[1][61][63] = 1
boards[1][61][64] = 1
boards[1][62][64] = 1

function get(bi,x,y)
  if ((x < 1) or (x > width) or (y < 1) or (y > height)) then
    return 0
  end
  return boards[bi][y][x]
end

while true do
  for y=1,height do
    for x=1,width do
      pset(x-1,y-1,boards[board_i][y][x] * alive_color)
    end
  end
  flip()

  other_i = (board_i % 2) + 1
  for y=1,height do
    for x=1,width do
      neighbors = (
        get(board_i,x-1,y-1) +
        get(board_i,x,y-1) +
        get(board_i,x+1,y-1) +
        get(board_i,x-1,y) +
        get(board_i,x+1,y) +
        get(board_i,x-1,y+1) +
        get(board_i,x,y+1) +
        get(board_i,x+1,y+1))
      if ((neighbors == 3) or
          ((boards[board_i][y][x] == 1) and neighbors == 2)) then
        boards[other_i][y][x] = 1
      else
        boards[other_i][y][x] = 0
      end
    end
  end
  board_i = other_i
end
`;
  const { parser, node } = parseChunk(source); assert.ok(node); assert.equal(cursor(parser), 626); assert.equal(node.stats.length, 14);
});

test('tests.pico8.lua.parser_test.TestParser.testChunkExtraSemis', () => {
  const { parser, node } = parseChunk(' ; ; foo=1; bar=1; ;\n;baz=3; \n;  ;');
  assert.ok(node); assert.equal(cursor(parser), 27); assert.equal(node.stats.length, 3);
});
