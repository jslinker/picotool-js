'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const catalog = JSON.parse(read('tests/parity/catalog.json'));
const manifest = JSON.parse(read('tools/upstream-test-manifest.json'));
const baseline = JSON.parse(read('tools/python-suite-baseline.json'));
const expected = manifest.files.flatMap(file =>
  file.methods.map(method => file.file.replace(/\.py$/, '').replaceAll('/', '.') + '.' + method));
const ids = catalog.tests.map(entry => entry.id);
assert.equal(new Set(ids).size, ids.length, 'Duplicate catalog IDs');
assert.deepEqual([...ids].sort(), expected.sort(), 'Every upstream test needs a catalog entry');
assert.equal(catalog.upstreamRevision, baseline.revision);
const todos = catalog.tests.filter(entry => entry.status === 'todo');
const deferred = catalog.tests.filter(entry => entry.status === 'deferred-feature');
for (const entry of catalog.tests) {
  assert.ok(['todo', 'named-js-port', 'deferred-feature'].includes(entry.status), entry.id);
  const line = read(entry.jsFile).split('\n')[entry.jsLine - 1];
  const registration = entry.status !== 'named-js-port' ? /test\.todo\(["']([^"']+)["']/ : /test\(["']([^"']+)["']/;
  const match = line && line.match(registration);
  assert.ok(match, 'Missing registration at catalog location: ' + entry.id);
  assert.equal(match[1].replace(/^pico8\./, 'tests.pico8.'), entry.id);
  if (entry.status !== 'named-js-port') assert.ok(entry.reason, entry.id);
  if (entry.coverageRelationship === 'adapted-behavior') {
    assert.equal(entry.status, 'named-js-port', entry.id);
    assert.ok(entry.adaptation && entry.coverageLimits, 'Adapted behavior needs rationale and limits: ' + entry.id);
  }
}
// Scan the regular test directory so deferred TODOs cannot silently disappear
// or acquire duplicate registrations outside their catalog location.
const todoIds = fs.readdirSync(path.join(root, 'tools'))
  .filter(file => file.endsWith('.cjs'))
  .flatMap(file => [...read('tools/' + file)
    .matchAll(/test\.todo\(["'](tests\.[^"']+)["']/g)].map(match => match[1]));
assert.deepEqual(todoIds.sort(), [...todos, ...deferred].map(entry => entry.id).sort(),
  'Uncataloged or duplicate TODO');
const outdated = catalog.tests.filter(entry => entry.upstreamIssue === 'outdated-save-api');
assert.deepEqual(outdated.map(entry => entry.id).sort(), [...baseline.expectedErrors].sort());
for (const entry of outdated) {
  assert.ok(entry.intent && entry.reason.includes('Game.to_p8_file'), entry.id);
}
console.log('Upstream catalog: ' + ids.length + ' tests; ' +
  (ids.length - todos.length - deferred.length) + ' named JS ports; ' + todos.length +
  ' active TODOs; ' + deferred.length + ' deferred features (not passing parity tests); ' + outdated.length + ' outdated API annotations.');
