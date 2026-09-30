#!/usr/bin/env node
'use strict';

// Assertion-level adaptations of TestRequireWalker and TestPrependPackageLua
// from the pinned build_test.py. findRequireCalls exposes the existing JS
// call scan, with token objects and JS result fields (not a Python AST walker).
const test = require('node:test');
const assert = require('node:assert/strict');
const { findRequireCalls, bundleRequiredLua, LuaBuildError } = require('../src/require-build');


function assertWalkedCall(source, path, useGameLoop = false) {
  const result = findRequireCalls(source);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, path);
  assert.equal(result[0].useGameLoop, useGameLoop);
  assert.equal(result[0].token.type, 'symbol');
  assert.equal(result[0].token.code, '(');
}

test('tests.pico8.build.build_test.TestRequireWalker.testRequireWalkerNoRequires', () => {
  assert.equal(findRequireCalls('print("hi")x = 7\n').length, 0);
});

test('tests.pico8.build.build_test.TestRequireWalker.testRequireWalkerOneRequire', () => {
  assertWalkedCall('print("hi")require("foo")x = 7\n', 'foo');
});

test('tests.pico8.build.build_test.TestRequireWalker.testRequireWalkerExpression', () => {
  assertWalkedCall('print("hi")foomod = require("foo")x = 7\n', 'foo');
});

test('tests.pico8.build.build_test.TestRequireWalker.testRequireWalkerOptionsTable', () => {
  assertWalkedCall('print("hi")require("foo", {use_game_loop=true})x = 7\n', 'foo', true);
});

test('tests.pico8.build.build_test.TestRequireWalker.testRequireWalkerComplexRequires', () => {
  const result = findRequireCalls('foomod = require("foo")function bar()  require("foo", {use_game_loop=true})end\n');
  assert.equal(result.length, 2);
});

const walkerErrors = [
  ['testRequireWalkerErrorZeroArgs', 'require()', /require\(\) has 0 args, should have 1 or 2/],
  ['testRequireWalkerErrorFirstNonString', 'require(123)', /first argument must be a string literal/],
  ['testRequireWalkerErrorSecondNonTable', 'require("foo", 123)', /second argument must be a table literal/],
  ['testRequireWalkerErrorBadOptionName', 'require("foo", {invalid_name=true})', /Invalid require\(\) options/],
  ['testRequireWalkerErrorBadOptionValue', 'require("foo", {use_game_loop=123})', /Invalid require\(\) options/],
];

function assertWalkerError(index) {
  const [, source, expected] = walkerErrors[index];
  assert.throws(() => findRequireCalls(source), (error) =>
    error instanceof LuaBuildError && expected.test(error.message));
}

test('tests.pico8.build.build_test.TestRequireWalker.testRequireWalkerErrorZeroArgs', () => assertWalkerError(0));
test('tests.pico8.build.build_test.TestRequireWalker.testRequireWalkerErrorFirstNonString', () => assertWalkerError(1));
test('tests.pico8.build.build_test.TestRequireWalker.testRequireWalkerErrorSecondNonTable', () => assertWalkerError(2));
test('tests.pico8.build.build_test.TestRequireWalker.testRequireWalkerErrorBadOptionName', () => assertWalkerError(3));
test('tests.pico8.build.build_test.TestRequireWalker.testRequireWalkerErrorBadOptionValue', () => assertWalkerError(4));

test('tests.pico8.build.build_test.TestPrependPackageLua.testPrependsCorrectPreamble', () => {
  const output = Buffer.from(bundleRequiredLua('require("lib1")\nx=2\n', {
    filename: '/test/main.lua',
    files: { 'test/lib1.lua': 'x=3\n' },
  })).toString('latin1');
  assert.match(output, /package=\{loaded=\{\},_c=\{\}\}\n/);
  assert.match(output, /function\(\)\nx=3\nend\n/);
  assert.match(output, /function require\(p\)\n/);
});

