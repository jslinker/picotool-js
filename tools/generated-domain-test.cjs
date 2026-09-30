#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const api = require('../src');
const { python, pythonOptions } = require('./test-env.cjs');
const seed = Number(process.env.DOMAIN_SEED ?? 0x9e3779b9);
assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff, 'DOMAIN_SEED must be a uint32');
let state = seed;
const rand = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
const bytes = size => Uint8Array.from({ length: size }, () => rand() >>> 24);
const classes = { gfx: api.Gfx, gff: api.Gff, map: api.MapSection, music: api.Music, sfx: api.Sfx };
const sizes = { gfx: 8192, gff: 256, map: 4096, music: 256, sfx: 4352 };
const inputs = Array.from({ length: 8 }, () => ({
  domains: Object.fromEntries(Object.entries(sizes).map(([name, size]) => [name, [...bytes(size)]])),
  edits: [[0, 0, rand() & 255], [127, 31, rand() & 255], [0, 32, rand() & 255], [127, 63, rand() & 255]],
}));
const codeInputs = [[], [...Buffer.from('hello\0'.repeat(200))], [...bytes(512)],
  [...Buffer.from('_update60=function() print(1) end\n')],
  ...Array.from({ length: 8 }, () => [...bytes(32 + (rand() % 1024))])];
const oracle = String.raw`import json,sys
from pico8.gfx.gfx import Gfx
from pico8.gff.gff import Gff
from pico8.map.map import Map
from pico8.music.music import Music
from pico8.sfx.sfx import Sfx
from pico8.game import compress
from pico8.lua.lua import unicode_to_p8scii,p8scii_to_unicode
classes={'gfx':Gfx,'gff':Gff,'map':Map,'music':Music,'sfx':Sfx}
data=json.load(sys.stdin); cases=[]
for case in data['inputs']:
 domains={name:cls.from_bytes(bytearray(case['domains'][name]),version=33) for name,cls in classes.items()}
 domains['map']._gfx=domains['gfx']
 for x,y,value in case['edits']: domains['map'].set_cell(x,y,value)
 cases.append({name:{'bytes':list(obj.to_bytes()),'lines':[line.decode('ascii') for line in obj.to_lines()],'roundtrip':list(classes[name].from_lines(list(obj.to_lines()),version=33).to_bytes())} for name,obj in domains.items()})
all_bytes=bytes(range(256))
print(json.dumps({'cases':cases,'compressed':[list(compress.compress_code(bytes(code))) for code in data['codeInputs']], 'text':p8scii_to_unicode(all_bytes),'roundtrip':list(unicode_to_p8scii(p8scii_to_unicode(all_bytes)))}))`;
const result = spawnSync(python, ['-c', oracle], pythonOptions({
  input: JSON.stringify({ inputs, codeInputs }), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
}));
assert.equal(result.status, 0, `seed=${seed}: ${result.error || result.stderr}`);
const expected = JSON.parse(result.stdout);
for (const [index, input] of inputs.entries()) {
  const domains = Object.fromEntries(Object.entries(classes).map(([name, cls]) => [name, cls.fromBytes(input.domains[name], 33)]));
  domains.map._gfx = domains.gfx;
  for (const [x, y, value] of input.edits) domains.map.setCell(x, y, value);
  const sections = { lua: ['print(1)\n'] };
  for (const [name, section] of Object.entries(domains)) {
    assert.deepEqual([...section.toBytes()], expected.cases[index][name].bytes, `seed=${seed} case=${index} ${name} memory`);
    assert.deepEqual(section.toLines(), expected.cases[index][name].lines, `seed=${seed} case=${index} ${name} serialization`);
    sections[name] = section.toLines();
  }
  // Full text transport exercises the generated serializers with valid section
  // data, including music flags and sound-effect fields, not just raw lengths.
  const text = api.writeP8({ format: 'p8', version: 33, sections });
  const parsed = api.parseP8(text);
  for (const name of Object.keys(classes)) {
    assert.deepEqual([...classes[name].fromLines(parsed.sections[name], 33).toBytes()],
      expected.cases[index][name].roundtrip, `seed=${seed} case=${index} ${name} text roundtrip`);
  }
}
const allBytes = Uint8Array.from({ length: 256 }, (_, i) => i);
assert.equal(api.decodeP8scii(allBytes), expected.text, 'Python P8SCII mapping');
assert.deepEqual([...api.encodeP8scii(expected.text)], expected.roundtrip, 'Python P8SCII roundtrip');
for (const [index, input] of codeInputs.entries()) {
  assert.deepEqual([...api.compressCode(Uint8Array.from(input))], expected.compressed[index], `seed=${seed} compression case=${index}`);
}
assert.throws(() => api.getBytesFromCode(new Uint8Array(0x10000)), /too large/);
console.log(`generated domains: seed=${seed}, ${inputs.length} full-memory cases, ${codeInputs.length} compression cases, 256 P8SCII bytes`);
