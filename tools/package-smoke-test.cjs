#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const { mkdtemp, writeFile, readFile, cp, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'picotool-package-'));
  try {
    const npmEnv = { ...process.env, npm_config_cache: join(dir, 'npm-cache') };
    const packed = spawnSync('npm', ['pack', '--json', '--pack-destination', dir], { encoding: 'utf8', cwd: __dirname + '/..', env: npmEnv });
    assert.equal(packed.status, 0, packed.stderr);
    const tarball = join(dir, JSON.parse(packed.stdout)[0].filename);
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'consumer', private: true, dependencies: { '@pico8-studio/picotool': `file:${tarball}` }, devDependencies: { typescript: '^5.9.3' } }));
    let result = spawnSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: dir, encoding: 'utf8', env: npmEnv });
    assert.equal(result.status, 0, result.stderr);
    const consumer = join(dir, 'consumer.cjs');
    await writeFile(consumer, "const p=require('@pico8-studio/picotool'); const s=p.encodeUtf8(p.HEADER+'\\nversion 33\\n__lua__\\nprint(1)\\n'); if(p.parseP8(s).version!==33) process.exit(2);\n");
    result = spawnSync(process.execPath, [consumer], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const input = join(dir, 'input.p8');
    await writeFile(input, 'pico-8 cartridge // http://www.pico-8.com\nversion 33\n__lua__\nprint(1)\n');
    result = spawnSync(join(dir, 'node_modules/.bin/p8tool'), ['stats', input], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const fixture = join(__dirname, 'type-fixtures/core.ts');
    await cp(fixture, join(dir, 'core.ts'));
    result = spawnSync(join(dir, 'node_modules/.bin/tsc'), ['--strict', '--noEmit', '--module', 'Node16', '--moduleResolution', 'Node16', '--target', 'ES2022', 'core.ts'], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    console.log('package smoke passed');
  } finally { await rm(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
