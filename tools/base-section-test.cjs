#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const p = require('../src');

class DummySection extends p.BaseSection {}
DummySection.HEX_LINE_LENGTH_BYTES = 3;

test('tests.pico8.util_test.TestBaseSection.testToLines', () => {
  const section = DummySection.fromBytes(Buffer.from('abcdefgh', 'latin1'), 4);
  const lines = section.toLines();
  assert.deepEqual(lines, ['616263\n', '646566\n', '6768\n']);
});

test('tests.pico8.util_test.TestBaseSection.testInit', () => {
  const section = new DummySection(Buffer.from('abcdefgh', 'latin1'), 4);
  assert.deepEqual(Array.from(section._data), Array.from(Buffer.from('abcdefgh', 'latin1')));
  assert.equal(section._version, 4);
});

test('tests.pico8.util_test.TestBaseSection.testFromLines', () => {
  const section = DummySection.fromLines(['616263\n', '646566\n', '6768\n'], 4);
  assert.deepEqual(Array.from(section._data), Array.from(Buffer.from('abcdefgh', 'latin1')));
  assert.equal(section._version, 4);
});

test('tests.pico8.util_test.TestBaseSection.testFromBytes', () => {
  const section = DummySection.fromBytes(Buffer.from('abcdefgh', 'latin1'), 4);
  assert.deepEqual(Array.from(section._data), Array.from(Buffer.from('abcdefgh', 'latin1')));
  assert.equal(section._version, 4);
});

// Open feature: shared logging/verbosity utility (upstream pico8.util).
// The maintainer chose not to add this API for the current project. JS callers
// already supply their own output callbacks; the library has no equivalent of
// Python's global verbosity setting and mutable stdout/stderr streams. Existing
// CLI output tests do not establish these utility contracts.
// These TODOs preserve the gap for contributors, not passing parity coverage.
// A future PR may use an isolated logger with injected sinks rather than globals.
// Preserve exact text (no added newline), keep errors visible in quiet mode,
// and keep command-result output separate from suppressible status messages.

// Normal verbosity writes 'test1' to the normal output sink.
test.todo('tests.pico8.util_test.TestUtil.testWrite');
// Quiet verbosity suppresses normal output ('test2').
test.todo('tests.pico8.util_test.TestUtil.testWriteQuiet');
// Errors write 'test3' to the error sink.
test.todo('tests.pico8.util_test.TestUtil.testError');
// Errors remain visible in quiet mode ('test4').
test.todo('tests.pico8.util_test.TestUtil.testErrorQuiet');
// Normal verbosity suppresses debug output ('test5').
test.todo('tests.pico8.util_test.TestUtil.testDebug');
// Debug verbosity writes 'test6' to the normal output sink.
test.todo('tests.pico8.util_test.TestUtil.testDebugVerbose');
