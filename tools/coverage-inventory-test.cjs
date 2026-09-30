#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const inventory = require('./coverage-inventory.json');
const apiManifest = require('./upstream-api-manifest.json');
const api = require('../src');
const { picotoolRoot } = require('./test-env.cjs');
const upstreamRoot = picotoolRoot;
const apiInventory = cp.spawnSync(require('./test-env.cjs').python, [path.join(__dirname, 'upstream-api-inventory.py'), upstreamRoot], require('./test-env.cjs').pythonOptions({ encoding: 'utf8' }));
assert.equal(apiInventory.status, 0, apiInventory.stderr.toString());
const upstreamApi = JSON.parse(apiInventory.stdout);
assert.equal(upstreamApi.schema, 'picotool-js/upstream-api/1');
assert.ok(upstreamApi.items.length > 100, 'upstream API extractor returned too few symbols');
assert.equal(apiManifest.schema, 'picotool-js/upstream-api-manifest/1');
assert.deepEqual(upstreamApi.items.map(({ name, kind }) => ({ name, kind })), apiManifest.items.map(({ name, kind }) => ({ name, kind })), 'upstream API symbol manifest drift');
for (const item of apiManifest.items) {
  assert.ok(['implemented', 'functional-equivalent', 'partial', 'excluded'].includes(item.disposition), `invalid disposition: ${item.name}`);
  assert.ok(item.jsEquivalent || item.reason, `missing implementation or reason: ${item.name}`);
  assert.ok(Array.isArray(item.tests) && item.tests.length, `missing tests mapping: ${item.name}`);
}
const explicitDisposition = new Set([
  'pico8.lua.lexer.Lexer.process_lines', 'pico8.lua.parser.Parser.process_tokens',
  'pico8.lua.lua.Lua.update_from_lines', 'pico8.game.game.Game.to_p8_file',
]);
for (const item of upstreamApi.items) {
  // Every extracted symbol must be assigned to a known implementation family,
  // or called out individually when its stateful contract is intentionally
  // partial/excluded. This prevents a new upstream module from disappearing.
  const family = item.name.startsWith('pico8.lua.lexer.') ? 'lua-lexer'
    : item.name.startsWith('pico8.lua.parser.') ? 'lua-parser-ast'
      : item.name.startsWith('pico8.lua.') ? 'lua-writers'
      : item.name.startsWith('pico8.game.') ? 'cartridge-text'
        : item.name.startsWith('pico8.build.') ? 'build-and-includes'
          : item.name.startsWith('pico8.tool.') ? 'cli'
            : item.name.startsWith('pico8.util.') || /^pico8\.(gfx|gff|map|sfx|music)\./.test(item.name) ? 'domains'
              : item.name.startsWith('pico8.png.') ? 'cartridge-png' : null;
  assert.ok(family || explicitDisposition.has(item.name), `unmapped upstream API symbol: ${item.name}`);
}

assert.equal(inventory.schema, 'picotool-js/coverage-inventory/1');
assert.ok(inventory.upstream.revision.length === 40);
assert.deepEqual(Object.keys(api).sort(), inventory.upstream.publicApiSymbols,
  'public API symbol drift: update inventory and disposition map');
assert.ok(Array.isArray(inventory.entries) && inventory.entries.length >= 10);
for (const [relative, expectedCount] of Object.entries(inventory.upstream.testMethodCounts)) {
  const file = path.join(upstreamRoot, relative);
  assert.ok(fs.existsSync(file), `upstream test file missing: ${relative}`);
  const actualCount = (fs.readFileSync(file, 'utf8').match(/^\s+def test\w+\s*\(/gm) || []).length;
  assert.equal(actualCount, expectedCount, `upstream test method drift in ${relative}: update inventory/dispositions`);
  const names = [...fs.readFileSync(file, 'utf8').matchAll(/^\s+def (test\w+)\s*\(/gm)].map((match) => match[1]).sort();
  const hash = crypto.createHash('sha256').update(names.join('\n')).digest('hex');
  assert.equal(hash, inventory.upstream.testMethodNameHashes[relative], `upstream test method names drift in ${relative}`);
}
const actualTestFiles = [];
function collectTests(directory) { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isDirectory()) collectTests(file); else if (entry.name.endsWith('_test.py')) actualTestFiles.push(path.relative(upstreamRoot, file)); } }
collectTests(path.join(upstreamRoot, 'tests'));
assert.deepEqual(actualTestFiles.sort(), inventory.upstream.testFiles.slice().sort(), 'upstream test file manifest drift');
const ids = new Set();
for (const entry of inventory.entries) {
  assert.ok(entry.id && !ids.has(entry.id), `duplicate inventory id: ${entry.id}`); ids.add(entry.id);
  assert.ok(['covered', 'partial', 'excluded'].includes(entry.status), `${entry.id}: invalid status`);
  assert.ok(entry.upstream, `${entry.id}: missing upstream location`);
  assert.ok(Array.isArray(entry.tests) && entry.tests.length, `${entry.id}: missing tests`);
  for (const test of entry.tests) assert.ok(fs.existsSync(path.join(__dirname, '..', test)), `${entry.id}: missing test ${test}`);
  if (entry.implementation) for (const file of entry.implementation.split(';')) assert.ok(fs.existsSync(path.join(__dirname, '..', file)), `${entry.id}: missing implementation ${file}`);
}
const partial = inventory.entries.filter((entry) => entry.status === 'partial');
assert.ok(partial.length >= 1, 'inventory must retain known partial API areas');
assert.equal(typeof api.parseLua, 'function');
console.log(`coverage inventory validated: ${inventory.entries.length} entries (${partial.length} partial, ${inventory.entries.filter((e) => e.status === 'excluded').length} excluded)`);
