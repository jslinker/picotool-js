#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const p = require('../src');

function assertTokenEquals(actual, Type, code) {
  assert.equal(new Type(code).equals(actual), true);
}

test('tests.pico8.lua.lexer_test.TestLexer.testLexerError', () => {
  assert.throws(() => p.tokenizeLua(Buffer.from('123 ` 456', 'latin1')), (error) => {
    assert.ok(error instanceof p.LexerError);
    String(error); // Exercise error formatting as in the upstream coverage check.
    assert.equal(error.lineno, 1);
    assert.equal(error.charno, 5);
    return true;
  });
});

test('tests.pico8.lua.lexer_test.TestLexer.testNegatedNumber', () => {
  const tokens = p.tokenizeLua(Buffer.from('-1.234567890e-6\n', 'latin1'));
  assert.equal(tokens.length, 3);
  assertTokenEquals(tokens[0], p.TokSymbol, '-');
  assertTokenEquals(tokens[1], p.TokNumber, '1.234567890e-6');
});

test('tests.pico8.lua.lexer_test.TestLexer.testValidLuaNoErrors', () => {
  const validLua = String.raw`
v1 = nil
v2 = false
v3 = true
v4 = 123
v5 = 123.45
v6 = "string"
v7 = 7 < 10
v8 = -12
v9 = not false

func()
v10 = func(1, v3, "string")

v11 = { "Monday", "Tuesday", "Wednesday",
        "Thursday", "Friday", "Saturday",
        "Sunday" }
v12 = v11[3]

v13 = {}
v13.x = 100
v13.y = 200
v13["z"] = 300

do
 func()
 v2 = not v3
end

-- Comment
-- do
--  func()
--  v2 = not v3

counter = 10  -- end of line comment
while counter > 0 do
 counter -= 1
 if counter % 2 == 0 then
  func()
 end
 if func(counter) > 900 then
  break
 end
end

repeat
 counter += 1
 if counter % 2 == 0 then
  func()
 end
until counter == 10

if v4 > 0 then
 func(1)
elseif v5 and (v4 < 0) then
 func(-2)
elseif v4 < 0 then
 func(-1)
else
 func(0)
end

for x = 1,10,2 do
 func(x)
 if x % 2 == 0 then
  func(x+1)
 end
end

for x,y,z in foobar do
 func(x)
 if x % 2 == 0 then
  func(x+1)
 end
end

function func(x, y, z)
 local foobar = 999
 if x % 2 == 0 then
  func(x+1)
 end
 return 111
end

local function func2(x, y, z)
 if x % 2 == 0 then
  func(x+1)
 end
end

a = {"hello", "blah"}
add(a, "world")
del(a, "blah")
print(count(a)) -- 2

for item in all(a) do print(item) end
foreach(a, print)
foreach(a, function(i) print(i) end)

x = 1 y = 2 print(x+y) -- this line will run ok

-- PICO-8 shorthand
if (not b) i=1 j=2
a += 2
a -= 2
a *= 2
a /= 2
a %= 2
if (a != 2) print("ok") end
if (a ~= 2) print("ok") end
s ..= 'foo'

-- bitwise operators
a = 0x15 & 0x87
a = 0x15 | 0x87
a = 0x15 ^^ 0x87
a = ~0x15
a = 0x15 << 3
a = 0x15 >> 3
a = 0x15 >>> 3
a = 0x15 <<> 3
a = 0x15 >>< 3

-- integer division
-- note: this appears as double slash in this string
-- but it's actually a single slash
a = 17 \ 3

-- unary ops
x = @0x5200
y = %0x5300
z = $0x5400
a = ~0b11110000
`;

  // Python splits bytes on newline and passes each newline-free line to _process_line.
  // The JS API has no version or streaming-line method, so tokenize each same line
  // independently to retain that boundary and avoid batch comment/string differences.
  const tokens = validLua.split('\n').flatMap((line) => p.tokenizeLua(Buffer.from(line, 'latin1')));
  assertTokenEquals(tokens[0], p.TokName, 'v1');
  assertTokenEquals(tokens[1], p.TokSpace, ' ');
  assertTokenEquals(tokens[2], p.TokSymbol, '=');
  assertTokenEquals(tokens[3], p.TokSpace, ' ');
  assertTokenEquals(tokens[4], p.TokKeyword, 'nil');
});

test('tests.pico8.lua.lexer_test.TestLexer.testHelloWorldExample', () => {
  const code = Buffer.from(`-- hello world
-- by zep

t = 0

music(0)

function _update()
 t += 1
end

function _draw()
 cls()
  
 for i=1,11 do
  for j0=0,7 do
  j = 7-j0
  col = 7+j
  t1 = t + i*4 - j*2
  x = cos(t0)*5
  y = 38 + j + cos(t1/50)*5
  pal(7,col)
  spr(16+i, 8+i*8 + x, y)
  end
 end
 
  print("this is pico-8",
    37, 70, 14) --8+(t/4)%8)

 print("nice to meet you",
    34, 80, 12) --8+(t/4)%8)

  spr(1, 64-4, 90)
end














`, 'latin1');
  const tokens = p.tokenizeLua(code);
  assertTokenEquals(tokens[0], p.TokComment, '-- hello world');
  assertTokenEquals(tokens[1], p.TokNewline, '\n');
  assertTokenEquals(tokens[2], p.TokComment, '-- by zep');
  assertTokenEquals(tokens[3], p.TokNewline, '\n');
});
