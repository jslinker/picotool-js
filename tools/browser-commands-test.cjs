#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const picotool = require('../src/browser');
const cli = require('../src/cli');

async function main() {
  const text = picotool.encodeUtf8(`${picotool.HEADER}\nversion 33\n__lua__\n-- comet\n-- by orbit\nprint(42)\n`);
  const file = { name: 'game.p8', bytes: text };
  const commands = picotool.createBrowserCommands();

  const stats = await commands.stats({ cartridges: [file], csv: true });
  assert.equal(stats.ok, true);
  assert.equal(stats.results[0].title, 'comet');
  assert.match(stats.csv, /game\.p8,comet,by orbit/);
  assert.match(stats.csv, /^Filename,Title,Byline,Code Version,Char Count,Token Count,Line Count,Compressed Code Size\r\n/);
  const pathNamedFile = { name: 'project/cart.p8', bytes: text };
  const pathStats = await commands.stats({ cartridges: [pathNamedFile], csv: true });
  const cliPathCsv = cli.formatStats([{ filename: pathNamedFile.name,
    stats: picotool.cartridgeStats(text) }], true);
  assert.equal(pathStats.csv, cliPathCsv);

  assert.match((await commands.listlua({ cartridges: [file] })).results[0].text, /print\(42\)/);
  const pureInput = { name: 'pure.p8', bytes: picotool.encodeUtf8(
    `${picotool.HEADER}\nversion 33\n__lua__\nif a != b then\nprint(1)\nend\n`) };
  const pureNumberedListing = (await commands.listlua({ cartridges: [pureInput], pureLua: true, showLineNumbers: true })).results[0].text;
  assert.match(pureNumberedListing, /^0: /m);
  assert.notEqual(pureNumberedListing, (await commands.listlua({ cartridges: [pureInput] })).results[0].text);
  assert.match(pureNumberedListing, /~=/);
  assert.match((await commands.listrawlua({ cartridges: [file], showLineNumbers: true })).results[0].text, /^0: -- comet/m);
  assert.match((await commands.listtokens({ cartridges: [file] })).results[0].text, /print/);
  assert.match((await commands.printast({ cartridges: [file] })).results[0].text, /Chunk/);
  assert.match((await commands.luafind({ cartridges: [file], pattern: 'print' })).results[0].text, /game\.p8:3:print/);
  assert.equal((await commands.luafind({ cartridges: [file], pattern: '[' })).ok, false);
  const fileOnlySearch = await commands.luafind({ cartridges: [file], pattern: 'print', listFiles: true });
  assert.equal(fileOnlySearch.results[0].text, 'game.p8\n');

  for (const command of ['writep8', 'luamin', 'luafmt']) {
    const transformed = await commands[command]({ cartridges: [file] });
    assert.equal(transformed.ok, true, command);
    assert.equal(transformed.results[0].output.name, 'game_fmt.p8');
    assert.equal(picotool.parseP8(transformed.results[0].output.bytes).format, 'p8');
  }

  const built = await commands.build({
    outputName: 'combined.p8',
    sources: { lua: { name: 'main.lua', data: 'local m=require("mod")\nprint(m)\n' } },
    modules: [{ name: 'mod.lua', data: 'return 7\n' }],
  });
  assert.equal(built.ok, true, JSON.stringify(built.errors));
  assert.match(picotool.decodeUtf8
    ? picotool.decodeUtf8(built.results[0].output.bytes)
    : new TextDecoder().decode(built.results[0].output.bytes), /package\._c\["mod"\]/);

  const png = await picotool.toBytes(picotool.parseP8(text), 'game.p8.png');
  const pngResult = await commands.luamin({ cartridges: [{ name: 'game.p8.png', bytes: png }] });
  assert.equal(pngResult.ok, true, JSON.stringify(pngResult.errors));
  assert.equal((await picotool.fromBytes(pngResult.results[0].output.bytes, 'game_fmt.p8.png')).format, 'p8.png');

  // Browser requests should carry the CLI's supported flags through to both
  // behavior and output naming. The CLI's overwrite option only applies to
  // text .p8 files; PNG transports still use the formatted output name.
  const formattedInPlace = await commands.luafmt({ cartridges: [file], overwrite: true });
  assert.equal(formattedInPlace.results[0].output.name, 'game.p8');
  const formattedPng = await commands.luafmt({ cartridges: [{ name: 'game.p8.png', bytes: png }], overwrite: true });
  assert.equal(formattedPng.results[0].output.name, 'game_fmt.p8.png');

  const namesLua = 'local longVariable=1\nprint(longVariable)\n';
  const namesCart = picotool.encodeUtf8(`${picotool.HEADER}\nversion 33\n__lua__\n${namesLua}`);
  const namesFile = { name: 'names.p8', bytes: namesCart };
  const minified = await commands.luamin({ cartridges: [namesFile] });
  const minifiedKeepAll = await commands.luamin({ cartridges: [namesFile], keepAllNames: true });
  const minifiedKeepFile = await commands.luamin({
    cartridges: [namesFile], keepNamesText: '# kept names\nlongVariable\n',
  });
  const keepBytes = new Uint8Array([...new TextEncoder().encode('  # comment '), 0xe9, 0x0a,
    ...new TextEncoder().encode('  longVariable  \r\n')]);
  const minifiedKeepBytes = await commands.luamin({ cartridges: [namesFile], keepNamesBytes: keepBytes });
  assert.doesNotMatch(minified.results[0].lua, /longVariable/);
  assert.match(minifiedKeepAll.results[0].lua, /longVariable/);
  assert.match(minifiedKeepFile.results[0].lua, /longVariable/);
  assert.match(minifiedKeepBytes.results[0].lua, /longVariable/);

  const nestedLua = 'if true then\nprint(1)\nend\n';
  const nestedFile = { name: 'nested.p8', bytes: picotool.encodeUtf8(
    `${picotool.HEADER}\nversion 33\n__lua__\n${nestedLua}`) };
  const fourSpaceFormat = await commands.luafmt({ cartridges: [nestedFile], indentwidth: 4 });
  assert.match(fourSpaceFormat.results[0].lua, /\n {4}print\(1\)/);
  const fractionalIndent = await commands.luafmt({ cartridges: [nestedFile], indentwidth: 1.5 });
  assert.equal(fractionalIndent.ok, false);
  assert.match(fractionalIndent.errors[0].message, /indentwidth|integer/i);

  // CLI raw listings first round each line through Latin-1 bytes, so Unicode
  // outside that byte range follows the same P8SCII-compatible mapping.
  const unicodeLua = 'print("♥🐱")\n';
  const unicodeCart = picotool.encodeUtf8(`${picotool.HEADER}\nversion 33\n__lua__\n${unicodeLua}`);
  const expectedRaw = cli.formatRawLua(unicodeLua, false);
  const actualRaw = (await commands.listrawlua({
    cartridges: [{ name: 'unicode.p8', bytes: unicodeCart }],
  })).results[0].text;
  assert.equal(actualRaw, expectedRaw);

  // --optimize-tokens is accepted by the CLI but explicitly unimplemented
  // for raw Lua sources. The browser API must return that same failure rather
  // than silently building an unoptimized cart.
  const optimizedBuild = await commands.build({
    outputName: 'optimized.p8',
    optimizeTokens: true,
    sources: { lua: { name: 'main.lua', data: 'print(1)\n' } },
  });
  assert.equal(optimizedBuild.ok, false);
  assert.match(optimizedBuild.errors[0].message, /--optimize_tokens not yet implemented/);

  // Building PNG output from a text base must use a valid blank label image,
  // matching the CLI's text-cartridge behavior instead of passing .p8 bytes
  // as the PNG label payload.
  const pngFromTextBase = await commands.build({
    outputName: 'built-from-text.p8.png',
    base: file,
    sources: { lua: { name: 'main.lua', data: 'print(9)\n' } },
  });
  assert.equal(pngFromTextBase.ok, true, JSON.stringify(pngFromTextBase.errors));
  assert.equal((await picotool.fromBytes(pngFromTextBase.results[0].output.bytes,
    'built-from-text.p8.png')).format, 'p8.png');

  // Build option parity: one cartridge can provide each CLI section source,
  // while unspecified sections continue to come from the base cart.
  const sourceGfx = picotool.Gfx.empty(33); sourceGfx.setSprite(1, [[1]]);
  const sourceGff = picotool.Gff.empty(33); sourceGff.setFlags(1, 1);
  const sourceMap = picotool.MapSection.empty(33); sourceMap.setCell(1, 0, 1);
  const sourceSfx = picotool.Sfx.empty(33); sourceSfx.setNote(0, 0, { pitch: 1, waveform: 0, volume: 1, effect: 0 });
  const sourceMusic = picotool.Music.empty(33); sourceMusic.setChannel(0, 0, 1);
  const allSections = picotool.writeP8({ format: 'p8', version: 33, sections: {
    lua: ['print("section source")\n'], gfx: sourceGfx.toLines(), gff: sourceGff.toLines(),
    map: sourceMap.toLines(), sfx: sourceSfx.toLines(), music: sourceMusic.toLines(),
    label: picotool.Gfx.empty(33).toLines(),
  } });
  const sourceSectionsFile = { name: 'sections.p8', bytes: allSections };
  const baseSectionsFile = { name: 'base.p8', bytes: picotool.encodeUtf8(
    `${picotool.HEADER}\nversion 33\n__lua__\nprint("retained lua")\n` +
    `__gfx__\n${'a'.repeat(128)}\n`) };
  const domains = ['lua', 'gfx', 'gff', 'map', 'sfx', 'music'];
  const sectionSources = Object.fromEntries(domains.map((domain) => [domain, sourceSectionsFile]));
  const sectionBuild = await commands.build({ outputName: 'sections-out.p8', sources: sectionSources });
  assert.equal(sectionBuild.ok, true, JSON.stringify(sectionBuild.errors));
  const sourceParsed = picotool.parseP8(sourceSectionsFile.bytes);
  const sectionParsed = picotool.parseP8(sectionBuild.results[0].output.bytes);
  for (const domain of domains) assert.deepEqual(sectionParsed.sections[domain], sourceParsed.sections[domain], domain);

  const retainedBuild = await commands.build({
    outputName: 'retained.p8', base: baseSectionsFile,
    sources: { gfx: sourceSectionsFile },
  });
  assert.equal(retainedBuild.ok, true, JSON.stringify(retainedBuild.errors));
  const retainedParsed = picotool.parseP8(retainedBuild.results[0].output.bytes);
  const baseParsed = picotool.parseP8(baseSectionsFile.bytes);
  assert.deepEqual(retainedParsed.sections.lua, baseParsed.sections.lua);
  assert.equal(retainedParsed.sections.gfx[0], sectionParsed.sections.gfx[0]);
  assert.notEqual(retainedParsed.sections.gfx[0], baseParsed.sections.gfx[0]);

  const emptyAllBuild = await commands.build({
    outputName: 'empty.p8', base: sourceSectionsFile, empty: domains,
  });
  assert.equal(emptyAllBuild.ok, true, JSON.stringify(emptyAllBuild.errors));
  const emptyParsed = picotool.parseP8(emptyAllBuild.results[0].output.bytes);
  const emptyReference = picotool.parseP8(picotool.buildP8({ empty: domains }));
  for (const domain of domains) assert.deepEqual(emptyParsed.sections[domain], emptyReference.sections[domain], domain);

  const sourceEmptyConflict = await commands.build({
    outputName: 'conflict.p8', sources: { lua: sourceSectionsFile }, empty: ['lua'],
  });
  assert.equal(sourceEmptyConflict.ok, false);
  assert.match(sourceEmptyConflict.errors[0].message, /Cannot specify --lua and --empty-lua/);

  // CLI chooses formatting when both Lua modes are present. Build's name
  // preservation settings must also be forwarded for a raw Lua source.
  const modeSource = { name: 'main.lua', data: 'local longVariable=1\nif true then\nprint(longVariable)\nend\n' };
  const bothModes = await commands.build({ outputName: 'both-modes.p8', sources: { lua: modeSource },
    luaFormat: true, luaMinify: true, indentwidth: 4 });
  assert.equal(bothModes.ok, true, JSON.stringify(bothModes.errors));
  assert.match(bothModes.results[0].lua, /\n {2}print\(longVariable\)/);
  const builtNames = await commands.build({ outputName: 'built-names.p8', sources: { lua: modeSource },
    luaMinify: true, keepNamesText: 'longVariable\n' });
  assert.equal(builtNames.ok, true, JSON.stringify(builtNames.errors));
  assert.match(builtNames.results[0].lua, /longVariable/);

  // A non-default Lua load path resolves nested modules just as the CLI's
  // --lua-path does for a project directory.
  const nestedModuleBuild = await commands.build({ outputName: 'nested-module.p8',
    sources: { lua: { name: 'main.lua', data: 'local value=require("pkg/mod")\nprint(value)\n' } },
    modules: [
      { name: 'modules/pkg/mod.lua', data: 'return require("helper")\n' },
      { name: 'modules/pkg/helper.lua', data: 'return 17\n' },
    ], luaPath: 'modules/?.lua;?.lua' });
  assert.equal(nestedModuleBuild.ok, true, JSON.stringify(nestedModuleBuild.errors));
  assert.match(nestedModuleBuild.results[0].lua, /package\._c\["pkg\/mod"\]/);
  assert.match(nestedModuleBuild.results[0].lua, /package\._c\["helper"\]/);

  // Invalid CLI-style invocations return structured usage errors in the
  // browser adapter instead of succeeding with empty/default work.
  const noStatsInputs = await commands.stats({});
  assert.equal(noStatsInputs.ok, false);
  assert.match(noStatsInputs.errors[0].message, /required.*filename/i);
  const noSearchPattern = await commands.luafind({ cartridges: [file] });
  assert.equal(noSearchPattern.ok, false);
  assert.match(noSearchPattern.errors[0].message, /pattern|required|usage/i);
  const noBuildOutput = await commands.build({ sources: { lua: modeSource } });
  assert.equal(noBuildOutput.ok, false);
  assert.match(noBuildOutput.errors[0].message, /required.*filename/i);
  const badBuildOutput = await commands.build({ outputName: 'output.txt', sources: { lua: modeSource } });
  assert.equal(badBuildOutput.ok, false);
  assert.match(badBuildOutput.errors[0].message, /\.p8/);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
