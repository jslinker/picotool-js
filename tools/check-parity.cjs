#!/usr/bin/env node
'use strict';

const { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync, existsSync } = require('node:fs');
const { join, resolve, basename } = require('node:path');
const { spawnSync } = require('node:child_process');
const { tmpdir } = require('node:os');
const { analyzeLua, tokenizeLua, echoLua } = require('../src/lua-lexer');
const { validateLua } = require('../src/lua-parser');
const { formatLuaTokens } = require('../src/lua-format-token');
const { bundleRequiredLua } = require('../src/require-build');
const { echoLuaAst, minifyLuaAst, formatLuaAst } = require('../src/lua-ast-writers');
const { pureLua } = require('../src/lua-pure');
const { cartridgeStats } = require('../src/stats');
const { listLua, listTokens } = require('../src/listing');

const packageRoot = resolve(__dirname, '..');
const bundledOracle = resolve(packageRoot, 'vendor/picotool');
const monorepoOracle = resolve(packageRoot, '../../vendor/picotool');
const picotoolRoot = process.env.PICOTOOL_ROOT
  ? resolve(process.env.PICOTOOL_ROOT)
  : existsSync(bundledOracle) ? bundledOracle : monorepoOracle;
const fixturesRoot = process.env.PICOTOOL_FIXTURES_ROOT
  ? resolve(process.env.PICOTOOL_FIXTURES_ROOT)
  : join(picotoolRoot, 'tests/testdata');
const upstreamFixtures = readdirSync(fixturesRoot)
  .filter((name) => name.endsWith('.p8') || name.endsWith('.p8.png'))
  .sort()
  .map((name) => join(fixturesRoot, name));

globalThis.PicotoolJS = require('../src');
for (const name of ['png-browser.js', 'fixture-data.js', 'report-utils.js', 'test-runner.js',
  'tests.js', 'domain-tests.js', 'png-tests.js', 'fixture-tests.js']) {
  require(join(packageRoot, 'browser', name));
}

function generatedFixtures(directory) {
  const source = readFileSync(join(fixturesRoot, 'test_cart.p8'), 'utf8');
  const domainPattern = source
    .replace(/(__gfx__\n)[^\n]+/, (_, marker) => `${marker}${'0123456789abcdef'.repeat(8)}`)
    .replace(/(__gff__\n)[^\n]+/, (_, marker) => `${marker}${'80ff01a5'.repeat(32)}`)
    .replace(/(__map__\n)[^\n]+/, (_, marker) => `${marker}${'fedcba9876543210'.repeat(16)}`)
    .replace(/(__sfx__\n)[^\n]+/, (_, marker) => `${marker}01100000${'3ff77'.repeat(32)}`)
    .replace(/(__music__\n)[^\n]+/, (_, marker) => `${marker}07 80ff7f40`);
  const cases = {
    'generated-minimal.p8': 'pico-8 cartridge // http://www.pico-8.com\nversion 8\n__lua__\nprint(1)\n',
    'generated-lua-empty.p8': source.replace(/(__lua__\n)[\s\S]*?(?=__gfx__\n)/, '$1'),
    'generated-lua-comment.p8': source.replace('__lua__\n', '__lua__\n-- parity test\n'),
    'generated-lua-p8scii.p8': source.replace('__lua__\n', '__lua__\n-- ♥ ★ あ ⬆️\n'),
    'generated-label.p8': `${source}\n__label__\n${'1'.repeat(128)}\n`,
    'generated-version.p8': source.replace(/^version \d+/m, 'version 42'),
    'generated-domain-pattern.p8': domainPattern,
    'generated-invalid-section.p8': `${source}\n__unknown__\n`,
  };
  return Object.entries(cases).map(([name, contents]) => {
    const path = join(directory, name);
    writeFileSync(path, contents);
    return path;
  });
}

async function check(fixtures) {
  const python = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), ...fixtures], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (python.error || python.status !== 0) {
    throw new Error(`Python oracle failed: ${python.error?.message || python.stderr}`);
  }
  const oracle = JSON.parse(python.stdout);
  const cases = PicotoolParityFixtures.createConformanceCases();
  for (const fixture of fixtures) {
    const name = basename(fixture);
    const bytes = readFileSync(fixture);
    if (name.endsWith('.p8.png')) {
      const decoded = await PicotoolBrowserPng.decodeP8PngBlob(new Blob([bytes], { type: 'image/png' }));
      cases.push({ id: `fixture/${name}`, status: 'ok', value: PicotoolJS.snapshotP8PngPicodata(decoded.picodata, name) });
    } else {
      cases.push({ id: `fixture/${name}`, ...PicotoolJS.normalizedResult(() => PicotoolJS.snapshotDomainP8(bytes, name)) });
    }
  }
  const tests = await PicotoolBrowserTests.run();
  const comparison = PicotoolReportUtils.compareParity({ parity: { cases } }, oracle);
  const sectionFixtures = fixtures.filter((path) => path.endsWith('.p8') && !basename(path).includes('invalid'));
  const pythonSections = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--sections', ...sectionFixtures],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonSections.error || pythonSections.status !== 0) {
    throw new Error(`Python section serializer failed: ${pythonSections.error?.message || pythonSections.stderr}`);
  }
  const sectionOracle = JSON.parse(pythonSections.stdout);
  const sectionCases = [];
  const classes = { gfx: PicotoolJS.Gfx, gff: PicotoolJS.Gff, map: PicotoolJS.MapSection,
    sfx: PicotoolJS.Sfx, music: PicotoolJS.Music };
  for (const fixture of sectionFixtures) {
    const name = basename(fixture);
    const parsed = PicotoolJS.parseP8(readFileSync(fixture));
    for (const [domain, Section] of Object.entries(classes)) {
      const instance = parsed.sections[domain]
        ? Section.fromLines(parsed.sections[domain], parsed.version)
        : Section.empty(parsed.version);
      const bytes = PicotoolJS.encodeUtf8(instance.toLines().join(''));
      sectionCases.push({ id: `section/${name}/${domain}`, status: 'ok', value: Buffer.from(bytes).toString('base64') });
    }
  }
  const sectionComparison = PicotoolReportUtils.compareParity({ parity: { cases: sectionCases } }, sectionOracle);
  const pythonWriter = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--write', ...sectionFixtures],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonWriter.error || pythonWriter.status !== 0) {
    throw new Error(`Python text writer failed: ${pythonWriter.error?.message || pythonWriter.stderr}`);
  }
  const writerOracle = JSON.parse(pythonWriter.stdout);
  const writerCases = sectionFixtures.map((fixture) => ({
    id: `writer/${basename(fixture)}`, status: 'ok',
    value: Buffer.from(PicotoolJS.writeP8(readFileSync(fixture))).toString('base64'),
  }));
  const writerComparison = PicotoolReportUtils.compareParity({ parity: { cases: writerCases } }, writerOracle);
  const pythonMinifiedWriter = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--write-minify', ...sectionFixtures],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonMinifiedWriter.error || pythonMinifiedWriter.status !== 0) {
    throw new Error(`Python minified text writer failed: ${pythonMinifiedWriter.error?.message || pythonMinifiedWriter.stderr}`);
  }
  const minifiedWriterOracle = JSON.parse(pythonMinifiedWriter.stdout);
  const minifiedWriterCases = sectionFixtures.map((fixture) => ({
    id: `writer-minify/${basename(fixture)}`, status: 'ok',
    value: Buffer.from(PicotoolJS.writeP8(readFileSync(fixture), { luaWriter: 'minify' })).toString('base64'),
  }));
  const minifiedWriterComparison = PicotoolReportUtils.compareParity(
    { parity: { cases: minifiedWriterCases } }, minifiedWriterOracle);
  const pythonFormattedWriter = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--write-format-token', ...sectionFixtures],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonFormattedWriter.error || pythonFormattedWriter.status !== 0) {
    throw new Error(`Python token-formatted writer failed: ${pythonFormattedWriter.error?.message || pythonFormattedWriter.stderr}`);
  }
  const formattedWriterOracle = JSON.parse(pythonFormattedWriter.stdout);
  const formattedWriterCases = sectionFixtures.map((fixture) => ({
    id: `writer-format-token/${basename(fixture)}`, status: 'ok',
    value: Buffer.from(PicotoolJS.writeP8(readFileSync(fixture), { luaWriter: 'format-token' })).toString('base64'),
  }));
  const formattedWriterComparison = PicotoolReportUtils.compareParity(
    { parity: { cases: formattedWriterCases } }, formattedWriterOracle);
  const astWriterFixtures = upstreamFixtures.filter((fixture) => fixture.endsWith('.p8'));
  const astWriterComparisons = {};
  const astWriterDetails = {};
  for (const mode of ['echo', 'minify', 'format']) {
    const pythonAstWriter = spawnSync(process.env.PYTHON || 'python3',
      [join(__dirname, 'python_oracle.py'), `--write-ast-${mode}`, ...astWriterFixtures],
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (pythonAstWriter.error || pythonAstWriter.status !== 0) {
      throw new Error(`Python AST ${mode} writer failed: ${pythonAstWriter.error?.message || pythonAstWriter.stderr}`);
    }
    const oracle = JSON.parse(pythonAstWriter.stdout);
    const cases = astWriterFixtures.map((fixture) => ({
      id: `writer-ast-${mode}/${basename(fixture)}`, status: 'ok',
      value: Buffer.from(PicotoolJS.writeP8(readFileSync(fixture), { luaWriter: `ast-${mode}` })).toString('base64'),
    }));
    astWriterComparisons[mode] = PicotoolReportUtils.compareParity({ parity: { cases } }, oracle);
    astWriterDetails[mode] = { oracle, cases };
  }
  const baseFixture = join(fixturesRoot, 'test_cart.p8');
  const pythonWriterScenarios = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--write-scenarios', baseFixture],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonWriterScenarios.error || pythonWriterScenarios.status !== 0) {
    throw new Error(`Python writer scenarios failed: ${pythonWriterScenarios.error?.message || pythonWriterScenarios.stderr}`);
  }
  const scenarioOracle = JSON.parse(pythonWriterScenarios.stdout);
  const parsedBase = PicotoolJS.parseP8(readFileSync(baseFixture));
  const scenarios = {
    'empty-lua': [],
    'no-final-newline': ['print(1)'],
    'trailing-spaces': ['print(1)  \n'],
    'p8scii-comment': ['-- ♥ ★ あ ⬆️\n'],
    'numeric-escape': ['print("a\\123")\n'],
  };
  const scenarioCases = Object.entries(scenarios).map(([name, lua]) => ({
    id: `writer-scenario/${name}`, status: 'ok',
    value: Buffer.from(PicotoolJS.writeP8({ ...parsedBase, sections: { ...parsedBase.sections, lua } })).toString('base64'),
  }));
  const scenarioComparison = PicotoolReportUtils.compareParity({ parity: { cases: scenarioCases } }, scenarioOracle);
  const luaScenarios = [
    { id: 'empty', source: '' },
    { id: 'simple', source: 'local x=1e2\nprint(x)\n' },
    { id: 'comment-and-string', source: '-- hello\nprint("hello \\\"world\\\"")\n' },
    { id: 'escapes', source: 'print("a\\n\\t\\123")\n' },
    { id: 'number-forms', source: 'a=0xff b=0b101 c=.5 d=1e3\n' },
    { id: 'multiline', source: '--[[ note ]]\nprint([=[hi]=])\n' },
    { id: 'p8scii', source: '-- ♥ ★ あ ⬆️\n' },
    { id: 'character-limit', source: `--${'a'.repeat(65532)}\n` },
    { id: 'character-over-limit', source: `--${'a'.repeat(65533)}\n` },
    { id: 'token-limit', source: 'a=1\n'.repeat(2730) },
    { id: 'token-over-limit', source: 'a=1\n'.repeat(2731) },
    { id: 'unterminated-string', source: 'print("oops)' },
    { id: 'unterminated-comment', source: '--[[ hi' },
    { id: 'unterminated-multiline-string', source: 'print([=[hi)' },
    { id: 'unknown-byte', source: '`' },
    { id: 'missing-call-close', source: 'print(' },
    { id: 'missing-if-end', source: 'if true then' },
    { id: 'missing-assignment-value', source: 'a=' },
    { id: 'do-block', source: 'do local a=1; print(a) end\n' },
    { id: 'while-block', source: 'while a<10 do a+=1 end\n' },
    { id: 'repeat-block', source: 'repeat a+=1 until a>10\n' },
    { id: 'for-step', source: 'for i=1,10,2 do print(i) end\n' },
    { id: 'for-in', source: 'for k,v in pairs(t) do print(k,v) end\n' },
    { id: 'if-elseif-else', source: 'if a then print(1) elseif b then print(2) else print(3) end\n' },
    { id: 'function', source: 'function t.f(a,...) return a end\n' },
    { id: 'local-function', source: 'local function f(a) return a end\n' },
    { id: 'table', source: 't={a=1,[2]=3,4;5}\n' },
    { id: 'label-goto', source: '::again::\ngoto again\n' },
    { id: 'method-call', source: 'obj:run(1,2)\n' },
    { id: 'short-if', source: 'if (a>0) print(a)\n' },
    { id: 'unary', source: 'a=not b and -c\n' },
    { id: 'missing-table-close', source: 't={a=1' },
    { id: 'missing-function-end', source: 'function f() print(1)' },
    { id: 'assignment-list', source: 'a,b=1,2\n' },
    { id: 'indexed-assignment', source: 'a.b[1]=2\n' },
    { id: 'call-table-arg', source: 'f{a=1}\n' },
    { id: 'call-string-arg', source: 'f"hello"\n' },
    { id: 'nested-expression', source: 'a=(1+2)*3\n' },
    { id: 'trailing-table-separator', source: 'a={1,2,}\n' },
    { id: 'short-if-else', source: 'if (a) print(1) else print(2)\n' },
    { id: 'short-if-do', source: 'if (a) do print(1) end\n' },
    { id: 'invalid-for', source: 'for i=1, do end' },
    { id: 'invalid-field', source: 'a={[1]=}' },
    { id: 'invalid-method', source: 'obj:run(' },
  ];
  for (const fixture of upstreamFixtures.filter((path) => path.endsWith('.p8'))) {
    const parsed = PicotoolJS.parseP8(readFileSync(fixture));
    luaScenarios.push({ id: `fixture-${basename(fixture)}`, source: (parsed.sections.lua || []).join('') });
  }
  const pythonLua = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--lua-diagnostics'],
    { input: JSON.stringify(luaScenarios), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonLua.error || pythonLua.status !== 0) {
    throw new Error(`Python Lua diagnostics failed: ${pythonLua.error?.message || pythonLua.stderr}`);
  }
  const luaOracle = JSON.parse(pythonLua.stdout);
  const luaCases = luaScenarios.map((scenario) => {
    let value;
    try {
      const bytes = PicotoolJS.encodeP8scii(scenario.source);
      const diagnostics = analyzeLua(bytes);
      validateLua(bytes);
      value = diagnostics;
    }
    catch (error) { value = { error: error.name, message: error.message }; }
    return { id: `lua/${scenario.id}`, status: 'ok', value };
  });
  const luaComparison = PicotoolReportUtils.compareParity({ parity: { cases: luaCases } }, luaOracle);
  const pythonParserCorpus = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--parser-corpus'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonParserCorpus.error || pythonParserCorpus.status !== 0) {
    throw new Error(`Python parser corpus failed: ${pythonParserCorpus.error?.message || pythonParserCorpus.stderr}`);
  }
  const parserCorpusOracle = JSON.parse(pythonParserCorpus.stdout);
  const parserCorpusCases = parserCorpusOracle.parity.cases.map((entry) => {
    let value;
    try {
      const bytes = Buffer.from(entry.source, 'base64');
      analyzeLua(bytes);
      validateLua(bytes);
      value = { accepted: true };
    } catch (error) { value = { accepted: false, error: error.name, message: error.message }; }
    return { id: entry.id, status: 'ok', value };
  });
  const parserCorpusComparison = PicotoolReportUtils.compareParity(
    { parity: { cases: parserCorpusCases } },
    { parity: { cases: parserCorpusOracle.parity.cases.map(({ source, ...entry }) => entry) } });
  const pythonLexerCorpus = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--lexer-corpus'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonLexerCorpus.error || pythonLexerCorpus.status !== 0) {
    throw new Error(`Python lexer corpus failed: ${pythonLexerCorpus.error?.message || pythonLexerCorpus.stderr}`);
  }
  const lexerCorpusOracle = JSON.parse(pythonLexerCorpus.stdout);
  const lexerCorpusCases = lexerCorpusOracle.parity.cases.map((entry) => {
    let value;
    try {
      value = { tokens: tokenizeLua(Buffer.from(entry.source, 'base64')).map((token) => ({
        type: token.type, value: Buffer.from(token.code, 'latin1').toString('base64'),
        line: token.line, column: token.column,
      })) };
    } catch (error) { value = { error: error.name, message: error.message }; }
    return { id: entry.id, status: 'ok', value };
  });
  const lexerCorpusComparison = PicotoolReportUtils.compareParity(
    { parity: { cases: lexerCorpusCases } },
    { parity: { cases: lexerCorpusOracle.parity.cases.map(({ source, ...entry }) => entry) } });
  const writerDiagnosticScenarios = [
    { id: 'ordinary', source: 'print(1)\n' },
    { id: 'character-over-limit', source: `--${'a'.repeat(65533)}\n`, filename: 'large.p8' },
    { id: 'token-over-limit', source: 'a=1\n'.repeat(2731) },
    { id: 'missing-call-close', source: 'print(' },
    { id: 'missing-if-end', source: 'if true then' },
    { id: 'unterminated-string', source: 'print("oops)' },
  ];
  const pythonWriterDiagnostics = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--writer-diagnostics', baseFixture],
    { input: JSON.stringify(writerDiagnosticScenarios), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonWriterDiagnostics.error || pythonWriterDiagnostics.status !== 0) {
    throw new Error(`Python writer diagnostics failed: ${pythonWriterDiagnostics.error?.message || pythonWriterDiagnostics.stderr}`);
  }
  const writerDiagnosticOracle = JSON.parse(pythonWriterDiagnostics.stdout);
  const writerDiagnosticCases = writerDiagnosticScenarios.map((scenario) => {
    let value;
    try {
      const result = PicotoolJS.writeP8WithDiagnostics({ ...parsedBase,
        sections: { ...parsedBase.sections, lua: [scenario.source] } }, { filename: scenario.filename });
      value = { byteLength: result.bytes.length, fnv1a32: PicotoolJS.fnv1a32(result.bytes), warnings: result.warnings };
    } catch (error) { value = { error: error.name, message: error.message }; }
    return { id: `writer-diagnostic/${scenario.id}`, status: 'ok', value };
  });
  const writerDiagnosticComparison = PicotoolReportUtils.compareParity(
    { parity: { cases: writerDiagnosticCases } }, writerDiagnosticOracle);
  const cartA = readFileSync(join(fixturesRoot, 'test_cart.p8'));
  const cartB = readFileSync(join(fixturesRoot, 'test_cart_memdump.p8'));
  const luaSource = Buffer.from('print("from lua")\n');
  const buildScenarios = [
    { id: 'empty' },
    { id: 'existing', existing: cartA },
    { id: 'replace-gfx', existing: cartA, sources: { gfx: { format: 'p8', data: cartB } } },
    { id: 'empty-gfx', existing: cartA, empty: ['gfx'] },
    { id: 'replace-two', existing: cartA, sources: {
      gfx: { format: 'p8', data: cartB }, music: { format: 'p8', data: cartB } } },
    { id: 'lua-file', existing: cartA, sources: { lua: { format: 'lua', data: luaSource } } },
    { id: 'empty-lua', existing: cartA, empty: ['lua'] },
    { id: 'minified-lua-file', existing: cartA, sources: { lua: { format: 'lua', data: luaSource } }, luaMinify: true },
    { id: 'formatted-lua-file', existing: cartA, sources: { lua: { format: 'lua',
      data: Buffer.from('function f()\nprint(1)\nend\n') } }, luaFormat: true },
    { id: 'formatted-custom-indent', existing: cartA, sources: { lua: { format: 'lua',
      data: Buffer.from('if true then\nprint(1)\nend\n') } }, luaFormat: true, indentwidth: 4 },
    { id: 'require-one', existing: cartA, sources: { lua: { format: 'lua',
      data: Buffer.from('local x=require("lib")\nprint(x)\n'), filename: 'main.lua',
      files: { 'lib.lua': Buffer.from('local x=1\nreturn x\n') } } } },
    { id: 'require-nested', existing: cartA, sources: { lua: { format: 'lua',
      data: Buffer.from('require("lib2")\n'), filename: 'main.lua', files: {
        'lib1.lua': Buffer.from('x=1\nreturn 111\n'),
        'lib2.lua': Buffer.from('require("lib1")\nx=2\nreturn 222\n'),
      } } } },
    { id: 'require-loop-keep', existing: cartA, sources: { lua: { format: 'lua',
      data: Buffer.from('require("lib",{use_game_loop=true})\n'), filename: 'main.lua',
      files: { 'lib.lua': Buffer.from('x=3\nfunction _draw() print(1) end\nreturn x\n') } } } },
  ];
  const pythonBuild = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--build-cases'],
    { input: JSON.stringify(buildScenarios.map((scenario) => ({
      id: scenario.id, empty: scenario.empty,
      luaMinify: scenario.luaMinify,
      luaFormat: scenario.luaFormat, indentwidth: scenario.indentwidth,
      existing: scenario.existing?.toString('base64'),
      sources: Object.fromEntries(Object.entries(scenario.sources || {}).map(([domain, source]) =>
        [domain, { format: source.format, data: source.data.toString('base64'),
          filename: source.filename, luaPath: source.luaPath,
          files: source.files && Object.fromEntries(Object.entries(source.files).map(([name, bytes]) => [name, bytes.toString('base64')])) }])),
    }))), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonBuild.error || pythonBuild.status !== 0) {
    throw new Error(`Python build oracle failed: ${pythonBuild.error?.message || pythonBuild.stderr}`);
  }
  const buildOracle = JSON.parse(pythonBuild.stdout);
  const buildCases = buildScenarios.map((scenario) => ({
    id: `build/${scenario.id}`, status: 'ok',
    value: Buffer.from(PicotoolJS.buildP8(scenario)).toString('base64'),
  }));
  const buildComparison = PicotoolReportUtils.compareParity({ parity: { cases: buildCases } }, buildOracle);
  const includeCart = (lua) => Buffer.from(`pico-8 cartridge // http://www.pico-8.com\nversion 8\n__lua__\n${lua}`);
  const includeScenarios = [
    { id: 'lua-file', main: 'sub/main.p8', files: {
      'sub/main.p8': includeCart('print(1)\n#include inc.lua\nprint(2)\n'),
      'sub/inc.lua': Buffer.from('print(3)\n') } },
    { id: 'p8-file', main: 'sub/main.p8', files: {
      'sub/main.p8': includeCart('#include inc.p8\nprint(2)\n'),
      'sub/inc.p8': includeCart('print(4)\n') } },
    { id: 'tab-two', main: 'sub/main.p8', files: {
      'sub/main.p8': includeCart('#include inc.p8:2\n'),
      'sub/inc.p8': includeCart('print(0)\n-->8\nprint(1)\n-->8\nprint(2)\n') } },
    { id: 'all-tabs', main: 'sub/main.p8', files: {
      'sub/main.p8': includeCart('#include inc.p8\n'),
      'sub/inc.p8': includeCart('print(0)\n-->8\nprint(1)\n-->8\nprint(2)\n') } },
    { id: 'nested-directive-stays', main: 'sub/main.p8', files: {
      'sub/main.p8': includeCart('#include inc.p8\n'),
      'sub/inc.p8': includeCart('#include ignored.lua\nprint(2)\n'),
      'sub/ignored.lua': Buffer.from('print(3)\n') } },
    { id: 'missing', main: 'sub/main.p8', files: {
      'sub/main.p8': includeCart('#include absent.lua\n') } },
    { id: 'outside', main: 'sub/main.p8', files: {
      'sub/main.p8': includeCart('#include ../outside.lua\n'),
      'outside.lua': Buffer.from('print(9)\n') } },
  ];
  const pythonIncludes = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--include-cases'],
    { input: JSON.stringify(includeScenarios.map((scenario) => ({
      id: scenario.id, main: scenario.main,
      files: Object.fromEntries(Object.entries(scenario.files).map(([name, bytes]) => [name, bytes.toString('base64')]))
    }))), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonIncludes.error || pythonIncludes.status !== 0) {
    throw new Error(`Python include oracle failed: ${pythonIncludes.error?.message || pythonIncludes.stderr}`);
  }
  const includeOracle = JSON.parse(pythonIncludes.stdout);
  const includeCases = includeScenarios.map((scenario) => {
    const filename = resolve('/virtual', scenario.main);
    const files = new Map(Object.entries(scenario.files).map(([name, bytes]) => [resolve('/virtual', name), bytes]));
    let value;
    try {
      const lua = PicotoolJS.processP8Includes(files.get(filename), {
        filename, readFile: (name) => files.get(name),
      });
      const bytes = PicotoolJS.encodeP8scii(lua);
      validateLua(bytes);
      value = { status: 'ok', lua: Buffer.from(require('../src/lua-lexer').echoLua(bytes)).toString('base64') };
    } catch (error) { value = { status: 'error', name: error.name }; }
    return { id: `include/${scenario.id}`, status: 'ok', value };
  });
  const includeComparison = PicotoolReportUtils.compareParity({ parity: { cases: includeCases } }, includeOracle);
  const minifyScenarios = [
    { id: 'simple', source: 'local score = 1\nprint(score)\n' },
    { id: 'header-comments', source: '-- title\n-- author\n\nlocal score = 1\n-- remove me\nprint(score)\n' },
    { id: 'preserved-names', source: 'function _draw()\n  local value=peek(1)\n  print(value)\nend\n' },
    { id: 'keep-all-names', source: 'local value = 1\nprint(value)\n', keepAllNames: true },
    { id: 'short-if', source: 'if (value>0) print(value)\n' },
    { id: 'numeric-escape', source: 'print("a\\123")\n' },
    { id: 'label', source: '::again::\nvalue += 1\nif (value<3) goto again\n' },
  ];
  const pythonMinify = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--minify-cases'],
    { input: JSON.stringify(minifyScenarios), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonMinify.error || pythonMinify.status !== 0) {
    throw new Error(`Python minify oracle failed: ${pythonMinify.error?.message || pythonMinify.stderr}`);
  }
  const minifyOracle = JSON.parse(pythonMinify.stdout);
  const minifyCases = minifyScenarios.map((scenario) => ({
    id: `minify/${scenario.id}`, status: 'ok',
    value: Buffer.from(PicotoolJS.minifyLua(scenario.source, scenario)).toString('base64'),
  }));
  const minifyComparison = PicotoolReportUtils.compareParity({ parity: { cases: minifyCases } }, minifyOracle);
  const formatScenarios = [
    { id: 'simple', source: 'print(1)\n' },
    { id: 'nested-block', source: 'function f(x)\nif x then\nprint(x)\nelse\nprint(0)\nend\nend\n' },
    { id: 'table', source: 'a={x=1,y={2,3}}\n' },
    { id: 'comments', source: '-- header\nlocal x=1 -- tail\n\nprint(x)\n' },
    { id: 'loop', source: 'for i=1,3 do\nprint(i)\nend\n' },
    { id: 'custom-indent', source: 'if true then\nprint(1)\nend\n', indentwidth: 4 },
  ];
  const pythonFormat = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--format-token-cases'],
    { input: JSON.stringify(formatScenarios), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonFormat.error || pythonFormat.status !== 0) {
    throw new Error(`Python token formatter oracle failed: ${pythonFormat.error?.message || pythonFormat.stderr}`);
  }
  const formatOracle = JSON.parse(pythonFormat.stdout);
  const formatCases = formatScenarios.map((scenario) => ({ id: `format-token/${scenario.id}`, status: 'ok',
    value: formatLuaTokens(scenario.source, scenario).toString('base64') }));
  const formatComparison = PicotoolReportUtils.compareParity({ parity: { cases: formatCases } }, formatOracle);
  const b64 = (source) => Buffer.from(source, 'utf8').toString('base64');
  const requireScenarios = [
    { id: 'no-require', source: b64('print(1)\n') },
    { id: 'one', source: b64('local x=require("lib")\nprint(x)\n'), files: { 'lib.lua': b64('local x=1\nreturn x\n') } },
    { id: 'nested', source: b64('require("lib2")\n'), files: {
      'lib1.lua': b64('x=1\nreturn 111\n'), 'lib2.lua': b64('require("lib1")\nx=2\nreturn 222\n') } },
    { id: 'cycle', source: b64('require("lib1")\n'), files: {
      'lib1.lua': b64('require("lib2")\nreturn 1\n'), 'lib2.lua': b64('require("lib1")\nreturn 2\n') } },
    { id: 'duplicate', source: b64('require("lib")\nrequire("lib")\n'), files: { 'lib.lua': b64('x=1\n') } },
    { id: 'loop-strip', source: b64('require("lib")\n'), files: {
      'lib.lua': b64('x=3\nfunction _update60() end\nfunction _draw() end\n') } },
    { id: 'loop-keep', source: b64('require("lib",{use_game_loop=true})\n'), files: {
      'lib.lua': b64('x=3\nfunction _draw() print(1) end\nreturn x\n') } },
    { id: 'loop-multiline-strip', source: b64('require("lib")\n'), files: {
      'lib.lua': b64('x=3\nfunction _draw()\n if x then\n  print(x)\n end\nend\n') } },
    { id: 'loop-strip-upstream-error', source: b64('require("lib")\n'), files: {
      'lib.lua': b64('x=3\nfunction _draw() end\nreturn x\n') } },
    { id: 'custom-path', source: b64('require("lib")\n'), luaPath: 'modules/?.lua', files: {
      'modules/lib.lua': b64('return 5\n') } },
    { id: 'missing', source: b64('require("missing")\n') },
    { id: 'invalid-path', source: b64('require("../lib")\n') },
    { id: 'zero-args', source: b64('require()\n') },
    { id: 'bad-arg', source: b64('require(123)\n') },
    { id: 'bad-option', source: b64('require("lib",{other=true})\n') },
    { id: 'bad-option-value', source: b64('require("lib",{use_game_loop=123})\n') },
    { id: 'bad-second-arg', source: b64('require("lib",123)\n') },
    { id: 'false-option', source: b64('require("lib",{use_game_loop=false})\n'), files: {
      'lib.lua': b64('x=3\nfunction _draw() end\n') } },
    { id: 'call-in-expression', source: b64('print(require("lib"))\n'), files: { 'lib.lua': b64('return 5\n') } },
    { id: 'parenthesized-expression', source: b64('x=(require("lib"))\n'), files: { 'lib.lua': b64('return 5\n') } },
    { id: 'table-expression', source: b64('x={value=require("lib")}\n'), files: { 'lib.lua': b64('return 5\n') } },
    { id: 'conditional-expression', source: b64('if require("lib") then print(1) end\n'), files: { 'lib.lua': b64('return 5\n') } },
    { id: 'single-quote', source: b64("require('lib')\n"), files: { 'lib.lua': b64('return 5\n') } },
    { id: 'numeric-escape-path', source: b64('require("lib\\046lua")\n'), files: { 'lib.lua': b64('return 5\n') } },
    { id: 'subdirectory-path', source: b64('require("sub/lib")\n'), files: { 'sub/lib.lua': b64('return 5\n') } },
    { id: 'search-path-order', source: b64('require("lib")\n'), luaPath: 'missing/?.lua;modules/?.lua',
      files: { 'modules/lib.lua': b64('return 5\n') } },
    { id: 'source-directory', source: b64('require("lib")\n'), filename: 'src/main.lua',
      files: { 'src/lib.lua': b64('return 5\n') } },
    { id: 'commented-require', source: b64('-- require("lib")\nprint("require(\\\"lib\\\")")\n') },
    { id: 'string-call-syntax', source: b64('require "lib"\n'), files: { 'lib.lua': b64('return 5\n') } },
    { id: 'table-call-syntax', source: b64('require {"lib"}\n'), files: { 'lib.lua': b64('return 5\n') } },
  ];
  const pythonRequire = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--require-cases'],
    { input: JSON.stringify(requireScenarios), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonRequire.error || pythonRequire.status !== 0) {
    throw new Error(`Python require oracle failed: ${pythonRequire.error?.message || pythonRequire.stderr}`);
  }
  const requireOracle = JSON.parse(pythonRequire.stdout);
  const requireCases = requireScenarios.map((scenario) => {
    let value;
    try {
      const files = Object.fromEntries(Object.entries(scenario.files || {}).map(([name, content]) => [name, Buffer.from(content, 'base64')]));
      const bytes = bundleRequiredLua(Buffer.from(scenario.source, 'base64'),
        { files, filename: scenario.filename, luaPath: scenario.luaPath });
      value = { bytes: Buffer.from(bytes).toString('base64') };
    } catch (error) { value = { error: error.name, message: error.message }; }
    return { id: `require/${scenario.id}`, status: 'ok', value };
  });
  const requireComparison = PicotoolReportUtils.compareParity({ parity: { cases: requireCases } }, requireOracle);
  const astScenarios = [
    { id: 'print', source: b64('print(1)\n') },
    { id: 'local', source: b64('local x=1\nprint(x)\n') },
    { id: 'function', source: b64('function f(x)\n print(x)\nend\n') },
    { id: 'if', source: b64('if true then\n print(1)\nend\n') },
    { id: 'semicolons', source: b64('a=1;print(a)\n') },
    { id: 'comment-table', source: b64('-- hi\na = {x=1,y=2}\n') },
    { id: 'short-if', source: b64('if (x) print(x)\n') },
    { id: 'nested', source: b64('function f(x)\n if x then\n  for i=1,3 do\n   print(i)\n  end\n end\nend\n') },
    { id: 'spacing', source: b64('  -- header\nlocal x = 1  -- tail\n\nprint( x )  \n') },
    { id: 'fixture-gol', source: Buffer.from(PicotoolJS.encodeP8scii(
      (PicotoolJS.parseP8(readFileSync(join(fixturesRoot, 'test_gol.p8'))).sections.lua || []).join(''))).toString('base64') },
    { id: 'method', source: b64('local object={x=1}\nfunction object:draw(v)\n print(self.x+v)\nend\nobject:draw(2)\n') },
    { id: 'compound', source: b64('value += 1\nif value != 2 then print(value) end\n') },
    { id: 'table-fields', source: b64('a={one=1,[2]=3; four=4}\nprint(a.one)\n') },
    { id: 'nested-parens', source: b64('x=(\n (a+b) *\n (c+d)\n)\n') },
    { id: 'comments-inline', source: b64('x=1 -- comment\n-- next\nprint(x)\n') },
    { id: 'label-goto', source: b64('::again::\nx+=1\nif (x<3) goto again\n') },
    { id: 'no-final-newline', source: b64('print(1)') },
    { id: 'custom-ast-indent', source: b64('function f()\nif true then\nprint(1)\nend\nend\n'), indentwidth: 4 },
    ...[
      'local value = 1\nprint(value)\n',
      'function draw(x)\nif x then\nprint(x)\nelse\nprint(0)\nend\nend\n',
      'items={one=1,two=2}\nfor key,value in pairs(items) do\nprint(key,value)\nend\n',
      'repeat\ncount += 1\nuntil count > 3\n',
    ].flatMap((source, index) => [
      { id: `variant-${index}-plain`, source: b64(source) },
      { id: `variant-${index}-spaces`, source: b64(source.replace(/=/g, '  =  ').replace(/\n/g, '  \n')) },
      { id: `variant-${index}-comments`, source: b64(`-- heading\n${source.replace(/\n/g, ' -- line\n')}`) },
    ]),
  ];
  const pythonAst = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--ast-writer-cases'],
    { input: JSON.stringify(astScenarios), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonAst.error || pythonAst.status !== 0) {
    throw new Error(`Python AST writer oracle failed: ${pythonAst.error?.message || pythonAst.stderr}`);
  }
  const astOracle = JSON.parse(pythonAst.stdout);
  const astCases = astScenarios.flatMap((scenario) => ['echo', 'minify', 'format', 'format-token', 'minify-token'].map((mode) => {
    let value;
    try {
      const source = Buffer.from(scenario.source, 'base64');
      const bytes = mode === 'echo' ? echoLuaAst(source)
        : mode === 'minify' ? minifyLuaAst(source)
          : mode === 'minify-token' ? PicotoolJS.minifyLua(source)
          : mode === 'format-token' ? formatLuaTokens(source, scenario) : formatLuaAst(source, scenario);
      value = { bytes: Buffer.from(bytes).toString('base64') };
    } catch (error) { value = { error: error.name, message: error.message }; }
    return { id: `ast-writer/${mode}/${scenario.id}`, status: 'ok', value };
  }));
  const astComparison = PicotoolReportUtils.compareParity({ parity: { cases: astCases } }, astOracle);
  const pythonAstCorpus = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--ast-writer-corpus'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonAstCorpus.error || pythonAstCorpus.status !== 0) {
    throw new Error(`Python AST writer corpus failed: ${pythonAstCorpus.error?.message || pythonAstCorpus.stderr}`);
  }
  const astCorpusOracle = JSON.parse(pythonAstCorpus.stdout);
  const astCorpusCases = astCorpusOracle.parity.cases.map((entry) => {
    let value;
    try {
      const source = Buffer.from(entry.source, 'base64');
      const mode = entry.id.split('/')[1];
      const bytes = mode === 'echo' ? echoLuaAst(source)
        : mode === 'minify' ? minifyLuaAst(source)
          : mode === 'minify-token' ? PicotoolJS.minifyLua(source)
          : mode === 'format-token' ? formatLuaTokens(source) : formatLuaAst(source);
      value = { bytes: Buffer.from(bytes).toString('base64') };
    } catch (error) { value = { error: error.name, message: error.message }; }
    return { id: entry.id, status: 'ok', value };
  });
  const astCorpusComparison = PicotoolReportUtils.compareParity(
    { parity: { cases: astCorpusCases } },
    { parity: { cases: astCorpusOracle.parity.cases.map(({ source, ...entry }) => entry) } });
  const pureScenarios = [
    { id: 'ordinary', source: b64('print(1)\n') },
    { id: 'short-print', source: b64('?"hello"\n') },
    { id: 'short-if', source: b64('if (x>0) print(x)\n') },
    { id: 'compound', source: b64('x+=1\n') },
    { id: 'not-equal', source: b64('if x!=2 then print(x) end\n') },
    { id: 'slash-comment', source: b64('print(1) // comment\n') },
    { id: 'empty-line', source: b64('\nprint(1)\n\n') },
    { id: 'no-newline', source: b64('x=1') },
    { id: 'fixture-gol', source: astScenarios.find((scenario) => scenario.id === 'fixture-gol').source },
    ...astWriterFixtures.map((fixture) => ({ id: `fixture-${basename(fixture)}`, source: Buffer.from(PicotoolJS.encodeP8scii(
      (PicotoolJS.parseP8(readFileSync(fixture)).sections.lua || []).join(''))).toString('base64') })),
  ];
  const pythonPure = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--pure-lua-cases'],
    { input: JSON.stringify(pureScenarios), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonPure.error || pythonPure.status !== 0) {
    throw new Error(`Python pure Lua oracle failed: ${pythonPure.error?.message || pythonPure.stderr}`);
  }
  const pureOracle = JSON.parse(pythonPure.stdout);
  const pureCases = pureScenarios.map((scenario) => {
    let value;
    try { value = { bytes: pureLua(Buffer.from(scenario.source, 'base64')).toString('base64') }; }
    catch (error) { value = { error: error.name, message: error.message }; }
    return { id: `pure-lua/${scenario.id}`, status: 'ok', value };
  });
  const pureComparison = PicotoolReportUtils.compareParity({ parity: { cases: pureCases } }, pureOracle);
  const pythonStats = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--stats', ...sectionFixtures],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonStats.error || pythonStats.status !== 0) {
    throw new Error(`Python stats oracle failed: ${pythonStats.error?.message || pythonStats.stderr}`);
  }
  const statsOracle = JSON.parse(pythonStats.stdout);
  const statsCases = sectionFixtures.map((fixture) => ({
    id: `stats/${basename(fixture)}`, status: 'ok', value: (() => {
      const stats = cartridgeStats(readFileSync(fixture));
      return { ...stats, title: stats.title?.toString('base64') ?? null,
        byline: stats.byline?.toString('base64') ?? null };
    })(),
  }));
  const statsComparison = PicotoolReportUtils.compareParity({ parity: { cases: statsCases } }, statsOracle);
  const compressScenarios = [
    { id: 'empty', source: '' },
    { id: 'short', source: b64('print(1)\n') },
    { id: 'repeated', source: b64('for i=1,100 do print(i) end\n'.repeat(20)) },
    ...astWriterFixtures.map((fixture) => ({ id: basename(fixture), source: Buffer.from(PicotoolJS.encodeP8scii(
      (PicotoolJS.parseP8(readFileSync(fixture)).sections.lua || []).join(''))).toString('base64') })),
  ];
  const pythonCompress = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--compress-cases'],
    { input: JSON.stringify(compressScenarios), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonCompress.error || pythonCompress.status !== 0) {
    throw new Error(`Python compression oracle failed: ${pythonCompress.error?.message || pythonCompress.stderr}`);
  }
  const compressOracle = JSON.parse(pythonCompress.stdout);
  const compressCases = compressScenarios.map((scenario) => ({ id: `compress/${scenario.id}`, status: 'ok',
    value: Buffer.from(PicotoolJS.compressCode(Buffer.from(scenario.source, 'base64'))).toString('base64') }));
  const compressComparison = PicotoolReportUtils.compareParity({ parity: { cases: compressCases } }, compressOracle);
  const listingScenarios = [
    { id: 'ordinary', source: cartA.toString('base64') },
    { id: 'line-numbers', source: cartA.toString('base64'), lineNumbers: true },
    { id: 'pure', source: cartA.toString('base64'), pure: true },
    { id: 'high-chars', source: readFileSync(sectionFixtures.find((fixture) => basename(fixture) === 'generated-lua-p8scii.p8')).toString('base64') },
  ];
  const pythonListing = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--listing-cases'],
    { input: JSON.stringify(listingScenarios), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonListing.error || pythonListing.status !== 0) {
    throw new Error(`Python listing oracle failed: ${pythonListing.error?.message || pythonListing.stderr}`);
  }
  const listingOracle = JSON.parse(pythonListing.stdout);
  const listingCases = listingScenarios.map((scenario) => ({ id: `listing/${scenario.id}`, status: 'ok',
    value: listLua(Buffer.from(scenario.source, 'base64'),
      { pure: scenario.pure, showLineNumbers: scenario.lineNumbers }) }));
  const listingComparison = PicotoolReportUtils.compareParity({ parity: { cases: listingCases } }, listingOracle);
  const tokenListingScenarios = [
    { id: 'ordinary', source: cartA.toString('base64') },
    { id: 'spaces-comments', source: includeCart('local  x=1 -- hi\nprint(x)\n').toString('base64') },
    { id: 'numbers', source: includeCart('a=1 b=.5 c=1e2 d=0xff e=0b10\n').toString('base64') },
    { id: 'strings', source: includeCart('print("a\\n\\123")\nprint([=[multi]=])\n').toString('base64') },
    { id: 'high-chars', source: includeCart('-- ♥\nlocal あ="★"\n').toString('base64') },
  ];
  const pythonTokenListing = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--token-listing-cases'],
    { input: JSON.stringify(tokenListingScenarios), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonTokenListing.error || pythonTokenListing.status !== 0) {
    throw new Error(`Python token listing oracle failed: ${pythonTokenListing.error?.message || pythonTokenListing.stderr}`);
  }
  const tokenListingOracle = JSON.parse(pythonTokenListing.stdout);
  const tokenListingCases = tokenListingScenarios.map((scenario) => ({
    id: `token-listing/${scenario.id}`, status: 'ok', value: listTokens(Buffer.from(scenario.source, 'base64')),
  }));
  const tokenListingComparison = PicotoolReportUtils.compareParity(
    { parity: { cases: tokenListingCases } }, tokenListingOracle);
  const cartMemoryScenarios = [
    { id: 'gfx-start', start: 0, data: Buffer.from([1, 2, 3]).toString('base64'), code: b64('print(1)\n') },
    { id: 'gfx-map-boundary', start: 0x1ffe, data: Buffer.from([4, 5, 6, 7]).toString('base64'), code: b64('a=1\n'.repeat(20)) },
    { id: 'map-gff-boundary', start: 0x2fff, data: Buffer.from([8, 9]).toString('base64') },
    { id: 'gff-music-boundary', start: 0x30ff, data: Buffer.from([10, 11]).toString('base64') },
    { id: 'music-sfx-boundary', start: 0x31ff, data: Buffer.from([12, 13]).toString('base64') },
    { id: 'last-byte', start: 0x42ff, data: Buffer.from([14]).toString('base64'), version: 8 },
    { id: 'too-large', start: 0x42ff, data: Buffer.from([1, 2]).toString('base64') },
  ];
  const pythonCartMemory = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--cart-memory-cases'],
    { input: JSON.stringify(cartMemoryScenarios), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (pythonCartMemory.error || pythonCartMemory.status !== 0) {
    throw new Error(`Python cartridge memory oracle failed: ${pythonCartMemory.error?.message || pythonCartMemory.stderr}`);
  }
  const cartMemoryOracle = JSON.parse(pythonCartMemory.stdout);
  const cartMemoryCases = cartMemoryScenarios.map((scenario) => {
    let value;
    try {
      const cart = PicotoolJS.makeEmptyCartridge({ version: scenario.version });
      cart.code.code = Buffer.from(scenario.code || '', 'base64');
      PicotoolJS.writeCartData(cart, Buffer.from(scenario.data, 'base64'), scenario.start);
      const memory = Buffer.concat(['gfx', 'map', 'gff', 'music', 'sfx'].map((domain) => Buffer.from(cart[domain]._data)));
      value = { memory: PicotoolJS.fnv1a32(memory), compressedSize: PicotoolJS.cartridgeCompressedSize(cart) };
    } catch (error) { value = { error: error instanceof RangeError ? 'ValueError' : error.name, message: error.message }; }
    return { id: `cart-memory/${scenario.id}`, status: 'ok', value };
  });
  const cartMemoryComparison = PicotoolReportUtils.compareParity(
    { parity: { cases: cartMemoryCases } }, cartMemoryOracle);
  const pngFixtures = fixtures.filter((fixture) => fixture.endsWith('.p8.png'));
  const pngEmbedScenarios = [];
  const pngEmbedCases = [];
  const pngRoundTripCases = [];
  const pngIncludeCases = [];
  for (const fixture of pngFixtures) {
    const name = basename(fixture);
    const png = readFileSync(fixture);
    const image = await PicotoolJS.decodePng(png);
    const original = PicotoolJS.getPicodataFromRgba(image.width, image.height, image.rgba);
    const picodata = Uint8Array.from(original);
    for (const offset of [0, 1, 0x1fff, 0x2000, 0x3000, 0x3100, 0x3200, 0x42ff, 0x4300, 0x7fff, 0x8000]) {
      picodata[offset] ^= (offset * 37 + 0x5a) & 0xff;
    }
    pngEmbedScenarios.push({ id: name, png: png.toString('base64'), picodata: Buffer.from(picodata).toString('base64') });
    const rgba = PicotoolJS.getRgbaFromPicodata(picodata, image.rgba);
    const extracted = PicotoolJS.getPicodataFromRgba(image.width, image.height, rgba);
    pngEmbedCases.push({ id: `png-embed/${name}`, status: 'ok', value: {
      width: image.width, height: image.height, rgba: PicotoolJS.fnv1a32(rgba),
      picodata: Buffer.from(extracted.subarray(0, picodata.length)).toString('base64'),
    } });
    const parsed = PicotoolJS.parseP8PngPicodata(picodata);
    const output = await PicotoolJS.writeP8Png(parsed, png, parsed.code.code);
    const roundTrip = await PicotoolJS.readP8Png(output);
    const expected = PicotoolJS.serializeP8PngPicodata(parsed, parsed.code.code);
    let labelHighBitsPreserved = true;
    for (let index = 0; index < image.rgba.length; index += 1) {
      if ((image.rgba[index] & 0xfc) !== (roundTrip.rgba[index] & 0xfc)) { labelHighBitsPreserved = false; break; }
    }
    pngRoundTripCases.push({ id: `png-roundtrip/${name}`, status:
      Buffer.from(roundTrip.picodata.subarray(0, expected.length)).equals(Buffer.from(expected)) && labelHighBitsPreserved
        ? 'pass' : 'fail' });
    const includeSource = Buffer.from(`pico-8 cartridge // http://www.pico-8.com\nversion 8\n__lua__\n#include ${name}\n`);
    const includedLua = await PicotoolJS.processP8IncludesAsync(includeSource, {
      filename: resolve('/virtual/main.p8'),
      readFile: async (requested) => requested === resolve('/virtual', name) ? png : undefined,
    });
    const expectedLua = PicotoolJS.decodeP8scii(echoLua(PicotoolJS.parseP8PngPicodata(original).code.code));
    pngIncludeCases.push({ id: `png-include/${name}`, status: includedLua === expectedLua ? 'pass' : 'fail' });
  }
  const pythonPngEmbed = spawnSync(process.env.PYTHON || 'python3',
    [join(__dirname, 'python_oracle.py'), '--png-embed-cases'],
    { input: JSON.stringify(pngEmbedScenarios), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (pythonPngEmbed.error || pythonPngEmbed.status !== 0) {
    throw new Error(`Python PNG embedding oracle failed: ${pythonPngEmbed.error?.message || pythonPngEmbed.stderr}`);
  }
  const pngEmbedOracle = JSON.parse(pythonPngEmbed.stdout);
  const pngEmbedComparison = PicotoolReportUtils.compareParity({ parity: { cases: pngEmbedCases } }, pngEmbedOracle);
  const pngTextWriterCases = [];
  const labelPng = readFileSync(pngFixtures[0]);
  for (const fixture of sectionFixtures) {
    const parsedText = PicotoolJS.parseP8(readFileSync(fixture));
    const output = await PicotoolJS.writeP8PngFromP8(parsedText, labelPng);
    const decoded = await PicotoolJS.readP8Png(output);
    const normalized = PicotoolJS.parseP8(PicotoolJS.writeP8(parsedText));
    const version = normalized.version, sections = normalized.sections;
    const gfx = sections.gfx ? PicotoolJS.Gfx.fromLines(sections.gfx, version) : PicotoolJS.Gfx.empty(version);
    const expected = {
      gfx,
      map: sections.map ? PicotoolJS.MapSection.fromLines(sections.map, version, gfx) : PicotoolJS.MapSection.empty(version, gfx),
      gff: sections.gff ? PicotoolJS.Gff.fromLines(sections.gff, version) : PicotoolJS.Gff.empty(version),
      music: sections.music ? PicotoolJS.Music.fromLines(sections.music, version) : PicotoolJS.Music.empty(version),
      sfx: sections.sfx ? PicotoolJS.Sfx.fromLines(sections.sfx, version) : PicotoolJS.Sfx.empty(version),
      code: PicotoolJS.getCodeFromBytes(PicotoolJS.getBytesFromCode(
        PicotoolJS.encodeP8scii((sections.lua || []).join(''))), version).code,
    };
    const matches = decoded.cartridge.version === version && ['gfx', 'map', 'gff', 'music', 'sfx']
      .every((domain) => Buffer.from(decoded.cartridge[domain].toBytes()).equals(Buffer.from(expected[domain].toBytes())))
      && Buffer.from(decoded.cartridge.code.code).equals(Buffer.from(expected.code));
    pngTextWriterCases.push({ id: `png-text-writer/${basename(fixture)}`, status: matches ? 'pass' : 'fail' });
  }
  const sectionPythonCases = new Map(sectionOracle.parity.cases.map((entry) => [entry.id, entry]));
  const sectionJavascriptCases = new Map(sectionCases.map((entry) => [entry.id, entry]));
  function byteDifferences(comparison, pythonCases, javascriptCases) { return comparison.mismatches.map((id) => {
    const expected = Buffer.from(pythonCases.get(id).value, 'base64');
    const actual = Buffer.from(javascriptCases.get(id).value, 'base64');
    let offset = 0;
    while (offset < Math.min(expected.length, actual.length) && expected[offset] === actual[offset]) offset += 1;
    return { id, firstDifferentByte: offset, pythonLength: expected.length, javascriptLength: actual.length,
      pythonBytes: expected.subarray(offset, offset + 16).toString('hex'),
      javascriptBytes: actual.subarray(offset, offset + 16).toString('hex') };
  }); }
  const sectionDifferences = byteDifferences(sectionComparison, sectionPythonCases, sectionJavascriptCases);
  const writerDifferences = byteDifferences(writerComparison,
    new Map(writerOracle.parity.cases.map((entry) => [entry.id, entry])),
    new Map(writerCases.map((entry) => [entry.id, entry])));
  const minifiedWriterDifferences = byteDifferences(minifiedWriterComparison,
    new Map(minifiedWriterOracle.parity.cases.map((entry) => [entry.id, entry])),
    new Map(minifiedWriterCases.map((entry) => [entry.id, entry])));
  const formattedWriterDifferences = byteDifferences(formattedWriterComparison,
    new Map(formattedWriterOracle.parity.cases.map((entry) => [entry.id, entry])),
    new Map(formattedWriterCases.map((entry) => [entry.id, entry])));
  const astWriterDifferences = Object.fromEntries(Object.entries(astWriterComparisons).map(([mode, comparison]) =>
    [mode, byteDifferences(comparison,
      new Map(astWriterDetails[mode].oracle.parity.cases.map((entry) => [entry.id, entry])),
      new Map(astWriterDetails[mode].cases.map((entry) => [entry.id, entry])))]));
  const scenarioDifferences = byteDifferences(scenarioComparison,
    new Map(scenarioOracle.parity.cases.map((entry) => [entry.id, entry])),
    new Map(scenarioCases.map((entry) => [entry.id, entry])));
  const buildDifferences = byteDifferences(buildComparison,
    new Map(buildOracle.parity.cases.map((entry) => [entry.id, entry])),
    new Map(buildCases.map((entry) => [entry.id, entry])));
  const minifyDifferences = byteDifferences(minifyComparison,
    new Map(minifyOracle.parity.cases.map((entry) => [entry.id, entry])),
    new Map(minifyCases.map((entry) => [entry.id, entry])));
  const pythonCases = new Map(oracle.parity.cases.map((entry) => [entry.id, entry]));
  const javascriptCases = new Map(cases.map((entry) => [entry.id, entry]));
  const report = { tests: tests.summary, parity: comparison, sectionSerialization: sectionComparison,
    textWriter: writerComparison,
    minifiedWriter: minifiedWriterComparison,
    formattedWriter: formattedWriterComparison,
    astCartridgeWriters: astWriterComparisons,
    writerScenarios: scenarioComparison,
    luaDiagnostics: luaComparison,
    parserCorpus: parserCorpusComparison,
    lexerCorpus: lexerCorpusComparison,
    writerDiagnostics: writerDiagnosticComparison,
    build: buildComparison,
    includes: includeComparison,
    minify: minifyComparison,
    formatToken: formatComparison,
    requires: requireComparison,
    astWriters: astComparison,
    astWriterCorpus: astCorpusComparison,
    pureLua: pureComparison,
    stats: statsComparison,
    compression: compressComparison,
    listings: listingComparison,
    tokenListings: tokenListingComparison,
    cartridgeMemory: cartMemoryComparison,
    pngEmbedding: pngEmbedComparison,
    pngRoundTrips: { total: pngRoundTripCases.length,
      passed: pngRoundTripCases.filter((entry) => entry.status === 'pass').length,
      failed: pngRoundTripCases.filter((entry) => entry.status === 'fail').length },
    pngIncludes: { total: pngIncludeCases.length,
      passed: pngIncludeCases.filter((entry) => entry.status === 'pass').length,
      failed: pngIncludeCases.filter((entry) => entry.status === 'fail').length },
    pngTextWriters: { total: pngTextWriterCases.length,
      passed: pngTextWriterCases.filter((entry) => entry.status === 'pass').length,
      failed: pngTextWriterCases.filter((entry) => entry.status === 'fail').length },
    differences: comparison.mismatches.map((id) => ({ id, python: pythonCases.get(id), javascript: javascriptCases.get(id) })),
    sectionDifferences,
    writerDifferences,
    minifiedWriterDifferences,
    formattedWriterDifferences,
    astWriterDifferences,
    scenarioDifferences,
    luaDifferences: luaComparison.mismatches.map((id) => ({ id,
      python: luaOracle.parity.cases.find((entry) => entry.id === id)?.value,
      javascript: luaCases.find((entry) => entry.id === id)?.value })),
    parserCorpusDifferences: parserCorpusComparison.mismatches.map((id) => ({ id,
      python: parserCorpusOracle.parity.cases.find((entry) => entry.id === id)?.value,
      javascript: parserCorpusCases.find((entry) => entry.id === id)?.value })),
    lexerCorpusDifferences: lexerCorpusComparison.mismatches.map((id) => ({ id,
      python: lexerCorpusOracle.parity.cases.find((entry) => entry.id === id)?.value,
      javascript: lexerCorpusCases.find((entry) => entry.id === id)?.value })),
    writerDiagnosticDifferences: writerDiagnosticComparison.mismatches.map((id) => ({ id,
      python: writerDiagnosticOracle.parity.cases.find((entry) => entry.id === id)?.value,
      javascript: writerDiagnosticCases.find((entry) => entry.id === id)?.value })),
    buildDifferences,
    minifyDifferences,
    formatDifferences: formatComparison.mismatches.map((id) => ({ id,
      python: formatOracle.parity.cases.find((entry) => entry.id === id)?.value,
      javascript: formatCases.find((entry) => entry.id === id)?.value })),
    requireDifferences: requireComparison.mismatches.map((id) => ({ id,
      python: requireOracle.parity.cases.find((entry) => entry.id === id)?.value,
      javascript: requireCases.find((entry) => entry.id === id)?.value })),
    astDifferences: astComparison.mismatches.map((id) => ({ id,
      python: astOracle.parity.cases.find((entry) => entry.id === id)?.value,
      javascript: astCases.find((entry) => entry.id === id)?.value })),
    astCorpusDifferences: astCorpusComparison.mismatches.map((id) => ({ id,
      python: astCorpusOracle.parity.cases.find((entry) => entry.id === id)?.value,
      javascript: astCorpusCases.find((entry) => entry.id === id)?.value })),
    pureDifferences: pureComparison.mismatches.map((id) => ({ id,
      python: pureOracle.parity.cases.find((entry) => entry.id === id)?.value,
      javascript: pureCases.find((entry) => entry.id === id)?.value })),
    statsDifferences: statsComparison.mismatches.map((id) => ({ id,
      python: statsOracle.parity.cases.find((entry) => entry.id === id)?.value,
      javascript: statsCases.find((entry) => entry.id === id)?.value })),
    compressDifferences: compressComparison.mismatches.map((id) => ({ id,
      python: compressOracle.parity.cases.find((entry) => entry.id === id)?.value,
      javascript: compressCases.find((entry) => entry.id === id)?.value })),
    listingDifferences: listingComparison.mismatches.map((id) => ({ id,
      python: listingOracle.parity.cases.find((entry) => entry.id === id)?.value,
      javascript: listingCases.find((entry) => entry.id === id)?.value })),
    tokenListingDifferences: tokenListingComparison.mismatches.map((id) => ({ id,
      python: tokenListingOracle.parity.cases.find((entry) => entry.id === id)?.value,
      javascript: tokenListingCases.find((entry) => entry.id === id)?.value })),
    cartridgeMemoryDifferences: cartMemoryComparison.mismatches.map((id) => ({ id,
      python: cartMemoryOracle.parity.cases.find((entry) => entry.id === id)?.value,
      javascript: cartMemoryCases.find((entry) => entry.id === id)?.value })),
    pngEmbeddingDifferences: pngEmbedComparison.mismatches.map((id) => ({ id,
      python: pngEmbedOracle.parity.cases.find((entry) => entry.id === id)?.value,
      javascript: pngEmbedCases.find((entry) => entry.id === id)?.value })),
    includeDifferences: includeComparison.mismatches.map((id) => ({ id,
      python: includeOracle.parity.cases.find((entry) => entry.id === id)?.value,
      javascript: includeCases.find((entry) => entry.id === id)?.value })),
    failedTests: tests.cases.filter((entry) => entry.status === 'fail') };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (tests.summary.failed || !comparison.matched || !sectionComparison.matched || !writerComparison.matched || !minifiedWriterComparison.matched || !formattedWriterComparison.matched || Object.values(astWriterComparisons).some((result) => !result.matched) || !scenarioComparison.matched || !luaComparison.matched || !parserCorpusComparison.matched || !lexerCorpusComparison.matched || !writerDiagnosticComparison.matched || !buildComparison.matched || !includeComparison.matched || !minifyComparison.matched || !formatComparison.matched || !requireComparison.matched || !astComparison.matched || !astCorpusComparison.matched || !pureComparison.matched || !statsComparison.matched || !compressComparison.matched || !listingComparison.matched || !tokenListingComparison.matched || !cartMemoryComparison.matched || !pngEmbedComparison.matched || pngRoundTripCases.some((entry) => entry.status === 'fail') || pngIncludeCases.some((entry) => entry.status === 'fail') || pngTextWriterCases.some((entry) => entry.status === 'fail')) process.exitCode = 1;
}

async function main() {
  const directory = mkdtempSync(join(tmpdir(), 'picotool-parity-'));
  try { await check([...upstreamFixtures, ...generatedFixtures(directory)]); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
