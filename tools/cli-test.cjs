'use strict';

const assert = require('assert');
const { resolve } = require('node:path');
const { join } = require('node:path');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const { formatStats, main, mainAsync, parseArgs, statsRows } = require('../src/cli');

const pythonEventOracle = String.raw`import argparse,json,sys
from pico8 import tool,util
events=[]
util.write=lambda value: events.append(['out',value])
util.error=lambda value: events.append(['err',value])
args=argparse.Namespace(filename=sys.argv[2:],csv=False,show_line_numbers=False,pure_lua=False,overwrite=False,listfiles=False,keep_all_names=False)
name='do_'+sys.argv[1] if sys.argv[1] in ('writep8','luamin','luafmt') else sys.argv[1]
status=getattr(tool,name)(args)
print(json.dumps({'status':status,'events':events}))`;
function collapseEvents(events) {
  const collapsed = [];
  for (const [channel, value] of events) {
    if (collapsed.at(-1)?.[0] === channel) collapsed.at(-1)[1] += value;
    else collapsed.push([channel, value]);
  }
  return collapsed;
}
function comparePythonEvents(command, filenames) {
  const result = spawnSync('python3', ['-c', pythonEventOracle, command, ...filenames], {
    env: { ...process.env, PYTHONPATH: '../../vendor/picotool' },
  });
  assert.strictEqual(result.status, 0, result.stderr.toString());
  const expected = JSON.parse(result.stdout.toString());
  const events = [];
  const status = main([command, ...filenames], {
    write: (value) => events.push(['out', value]), error: (value) => events.push(['err', value]),
  });
  assert.strictEqual(status, expected.status, `${command}: exit status`);
  assert.deepStrictEqual(collapseEvents(events), collapseEvents(expected.events), `${command}: ordered output/error events`);
}
const upstreamCart = resolve(__dirname, '../../../vendor/picotool/tests/testdata/test_cart.p8');
const pythonCliMain = String.raw`import sys
from pico8 import tool
sys.exit(tool.main(sys.argv[1:]))`;
for (const argv of [
  [], ['bogus'], ['stats'], ['stats', '--bogus', 'cart.p8'],
  ['luafmt', '--indentwidth', 'nope', 'cart.p8'], ['build', '--lua'],
  ['build', '--lua-path'], ['luamin', '--keep-names-from-file'],
]) {
  const pythonResult = spawnSync('python3', ['-c', pythonCliMain, ...argv], {
    env: { ...process.env, PYTHONPATH: resolve(__dirname, '../../../vendor/picotool') },
  });
  const javascriptStatus = main(argv, { write: () => {}, error: () => {} });
  assert.strictEqual(javascriptStatus, pythonResult.status, `argument-parser status: ${argv.join(' ')}`);
}
const fileSystem = require('node:fs');
const writerOracleOutputs = new Map();
for (const sourceCart of [upstreamCart, resolve(__dirname, '../../../vendor/picotool/tests/testdata/test_gol.p8')]) {
for (const [command, options] of [['writep8', []], ['luamin', []], ['luamin', ['--keep-all-names']], ['luamin', ['--keep-names-from-file', '<names>']], ['luafmt', []], ['luafmt', ['--indentwidth', '4']], ['luafmt', ['--overwrite']]]) {
  const directory = mkdtempSync(join(tmpdir(), `picotool-writer-oracle-${command}-`));
  const input = join(directory, 'game.p8');
  const namesFile = join(directory, 'names.txt');
  const cliOptions = options.map((option) => option === '<names>' ? namesFile : option);
  const output = options.includes('--overwrite') ? input : join(directory, 'game_fmt.p8');
  const original = fileSystem.readFileSync(sourceCart);
  try {
    fileSystem.writeFileSync(input, original);
    fileSystem.writeFileSync(namesFile, 'player\n # comment\n\n  x  \n');
    const pythonResult = spawnSync('python3', ['-c', pythonCliMain, command, ...cliOptions, input], {
      env: { ...process.env, PYTHONPATH: resolve(__dirname, '../../../vendor/picotool') },
    });
    assert.strictEqual(pythonResult.status, 0, pythonResult.stderr.toString());
    const pythonOutput = fileSystem.readFileSync(output);
    fileSystem.writeFileSync(input, original);
    if (output !== input) fileSystem.unlinkSync(output);
    let javascriptOutput = '', javascriptErrors = '';
    const javascriptStatus = main([command, ...cliOptions, input], {
      write: (value) => { javascriptOutput += value; }, error: (value) => { javascriptErrors += value; },
    });
    assert.strictEqual(javascriptStatus, pythonResult.status, `${command} ${options.join(' ')}: status`);
    assert.strictEqual(javascriptOutput, pythonResult.stdout.toString(), `${command} ${options.join(' ')}: notice`);
    assert.strictEqual(javascriptErrors, pythonResult.stderr.toString(), `${command} ${options.join(' ')}: errors`);
    assert.deepStrictEqual(fileSystem.readFileSync(output), pythonOutput, `${command} ${options.join(' ')}: written cart bytes`);
    writerOracleOutputs.set(`${sourceCart}:${command}:${options[0] || ''}`, pythonOutput);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
}
const golSourceCart = resolve(__dirname, '../../../vendor/picotool/tests/testdata/test_gol.p8');
assert.notDeepStrictEqual(writerOracleOutputs.get(`${golSourceCart}:luamin:--keep-names-from-file`), writerOracleOutputs.get(`${golSourceCart}:luamin:`), 'keep-names file must materially change complex-cart minification');
for (const command of ['stats', 'listlua', 'listtokens', 'printast']) {
  comparePythonEvents(command, [upstreamCart, 'missing-extension.txt', upstreamCart]);
  comparePythonEvents(command, ['missing-extension.txt']);
}
for (const command of ['listrawlua', 'writep8', 'luamin', 'luafmt']) comparePythonEvents(command, ['missing-extension.txt']);
comparePythonEvents('luafind', ['pattern', 'missing-extension.txt']);

const fatalDirectory = mkdtempSync(join(tmpdir(), 'picotool-cli-fatal-'));
try {
  const malformedCart = join(fatalDirectory, 'malformed.p8');
  fileSystem.writeFileSync(malformedCart, 'pico-8 cartridge // http://www.pico-8.com\nversion 33\n__lua__\nx=\n');
  for (const command of ['stats', 'listlua', 'listtokens', 'printast']) {
    const pythonSingle = spawnSync('python3', ['-c', pythonCliMain, command, malformedCart], {
      env: { ...process.env, PYTHONPATH: resolve(__dirname, '../../../vendor/picotool') },
    });
    const javascriptSingle = main([command, malformedCart], { write: () => {}, error: () => {} });
    assert.strictEqual(javascriptSingle, pythonSingle.status, `${command}: fatal single-file status`);

    const events = [];
    const pythonMixedResult = spawnSync('python3', ['-c', pythonEventOracle, command, upstreamCart, malformedCart, upstreamCart], {
      env: { ...process.env, PYTHONPATH: '../../vendor/picotool' },
    });
    assert.strictEqual(pythonMixedResult.status, 0, pythonMixedResult.stderr.toString());
    const pythonMixed = JSON.parse(pythonMixedResult.stdout.toString());
    const javascriptMixed = main([command, upstreamCart, malformedCart, upstreamCart], {
      write: (value) => events.push(['out', value]), error: (value) => events.push(['err', value]),
    });
    assert.strictEqual(javascriptMixed, pythonMixed.status, `${command}: fatal multi-file continuation status`);
    assert.deepStrictEqual(collapseEvents(events).map(([channel]) => channel), collapseEvents(pythonMixed.events).map(([channel]) => channel), `${command}: fatal multi-file ordering`);
  }
} finally { rmSync(fatalDirectory, { recursive: true, force: true }); }

const cart = [
  'pico-8 cartridge // http://www.pico-8.com\n', 'version 33\n', '__lua__\n',
  '-- Title\n', '-- Byline\n', 'print("hello")\n',
].join('');
assert.deepStrictEqual(parseArgs(['--quiet', 'stats', '--csv', 'one.p8', 'two.p8']), {
  quiet: true, debug: false, command: 'stats', csv: true, filename: ['one.p8', 'two.p8'],
});
assert.throws(() => parseArgs(['stats']), /filename/);
assert.throws(() => parseArgs(['bogus']), /unknown command/);
assert.deepStrictEqual(parseArgs(['listlua', '--show-line-numbers', '--pure-lua', 'one.p8']), {
  quiet: false, debug: false, command: 'listlua', csv: false, showLineNumbers: true,
  pureLua: true, filename: ['one.p8'],
});
assert.deepStrictEqual(parseArgs(['luamin', '--keep-names-from-file', 'names.txt', 'one.p8']), {
  quiet: false, debug: false, command: 'luamin', csv: false, keepNamesFromFile: 'names.txt', filename: ['one.p8'],
});
assert.throws(() => parseArgs(['luamin', '--keep-names-from-file']), /requires a filename/);
assert.deepStrictEqual(parseArgs(['stats', '--', '-cart.p8']).filename, ['-cart.p8']);
assert.deepStrictEqual(parseArgs(['listlua', '--', '--pure-lua']).filename, ['--pure-lua']);

const files = new Map([['one.p8', Buffer.from(cart)], ['two.p8', Buffer.from(cart)]]);
const read = (filename) => files.get(filename) || (() => { throw new Error('missing'); })();
const loaded = statsRows(['one.p8', 'bad.txt', 'two.p8'], read);
assert.strictEqual(loaded.rows.length, 2);
assert.strictEqual(loaded.errors.length, 1);
assert.match(formatStats(loaded.rows), /Title \(one\.p8\)/);
assert.match(formatStats(loaded.rows, true), /^Filename,Title,Byline,Code Version/m);
assert.match(formatStats(loaded.rows, true), /\r\n/);

let out = '';
let err = '';
assert.strictEqual(main(['stats', 'one.p8', 'missing.p8'], {
  readFile: read, write: (text) => { out += text; }, error: (text) => { err += text; },
}), 0);
assert.match(out, /one\.p8/);
assert.match(err, /missing\.p8: could not load cart/);
assert.strictEqual(main(['stats', 'missing.p8'], {
  readFile: read, write: () => {}, error: (text) => { err += text; },
}), 1);
let listing = '';
assert.strictEqual(main(['listlua', 'one.p8'], { readFile: read, write: (text) => { listing += text; } }), 0);
assert.match(listing, /print/);
listing = '';
assert.strictEqual(main(['listtokens', 'one.p8'], { readFile: read, write: (text) => { listing += text; } }), 0);
assert.match(listing, /<0:/);
let found = '';
assert.strictEqual(main(['luafind', 'print', 'one.p8', 'two.p8'], {
  readFile: read, write: (text) => { found += text; }, error: (text) => { throw new Error(text); },
}), 0);
assert.match(found, /one\.p8:3:print\("hello"\)/);
assert.match(found, /two\.p8:3:print\("hello"\)/);
found = '';
assert.strictEqual(main(['luafind', '--listfiles', 'print', 'one.p8', 'two.p8'], {
  readFile: read, write: (text) => { found += text; }, error: (text) => { throw new Error(text); },
}), 0);
assert.strictEqual(found, 'one.p8\ntwo.p8\n');
let usage = '';
assert.strictEqual(main(['luafind', 'print'], { write: () => {}, error: (text) => { usage += text; } }), 1);
assert.match(usage, /Usage: p8tool luafind/);
const invalidLua = `${cart.split('__lua__\n')[0]}__lua__\nnot valid @@@\n`;
const rawFiles = (filename) => filename === 'bad-lua.p8' ? Buffer.from(invalidLua) : read(filename);
listing = '';
assert.strictEqual(main(['listrawlua', 'bad-lua.p8'], {
  readFile: rawFiles, write: (text) => { listing += text; }, error: () => {},
}), 0);
assert.match(listing, /not valid @@@/);

const testDirectory = mkdtempSync(join(tmpdir(), 'picotool-cli-test-'));
try {
  const writableCart = join(testDirectory, 'game.p8');
  require('fs').writeFileSync(writableCart, cart);
  let writes = '';
  assert.strictEqual(main(['writep8', writableCart], {
    write: (text) => { writes += text; }, error: (text) => { throw new Error(text); },
  }), 0);
  assert.match(writes, /_fmt\.p8/);
  assert.ok(require('fs').existsSync(join(testDirectory, 'game_fmt.p8')));
  assert.strictEqual(main(['luafmt', '--overwrite', writableCart], {
    write: () => {}, error: (text) => { throw new Error(text); },
  }), 0);
  let failedWriteOutput = '';
  assert.strictEqual(main(['writep8', writableCart], {
    write: (text) => { failedWriteOutput += text; },
    writeFile: () => { throw new Error('simulated write failure'); },
    error: () => {},
  }), 1);
  assert.match(failedWriteOutput, /game\.p8 -> .*game_fmt\.p8/);
  let attemptedWrites = 0;
  assert.strictEqual(main(['writep8', writableCart, writableCart], {
    write: () => {}, writeFile: () => { attemptedWrites += 1; throw new Error('simulated write failure'); }, error: () => {},
  }), 1);
  assert.strictEqual(attemptedWrites, 1, 'writer must stop after an output write failure');
  let missingWriteOutput = '';
  assert.strictEqual(main(['writep8', join(testDirectory, 'missing.p8')], {
    write: (text) => { missingWriteOutput += text; }, error: () => {},
  }), 1);
  assert.strictEqual(missingWriteOutput, '');
  let recoveredWrite = '';
  assert.strictEqual(main(['writep8', join(testDirectory, 'missing.p8'), writableCart], {
    write: (text) => { recoveredWrite += text; }, error: () => {},
  }), 1);
  assert.match(recoveredWrite, /game\.p8 -> .*game_fmt\.p8/, 'writer must continue after an input load failure');
} finally { rmSync(testDirectory, { recursive: true, force: true }); }

const buildDirectory = mkdtempSync(join(tmpdir(), 'picotool-build-test-'));
try {
  const luaFile = join(buildDirectory, 'main.lua');
  const moduleDirectory = join(buildDirectory, 'modules');
  const moduleFile = join(moduleDirectory, 'module.lua');
  const outputFile = join(buildDirectory, 'built.p8');
  require('fs').mkdirSync(moduleDirectory);
  require('fs').writeFileSync(luaFile, '-- Built\nrequire("module")\nprint("ok")\n');
  require('fs').writeFileSync(moduleFile, 'module_value=42\n');
  let buildOutput = '';
  assert.strictEqual(main(['build', '--lua', luaFile, '--lua-path', 'modules/?.lua', outputFile], {
    write: (text) => { buildOutput += text; }, error: (text) => { throw new Error(text); },
  }), 0);
  assert.match(buildOutput, /built\.p8/);
  const built = require('fs').readFileSync(outputFile, 'utf8');
  assert.match(built, /print\("ok"\)/);
  assert.match(built, /package\._c\["module"\]/);
  const siblingLua = join(buildDirectory, 'sibling.lua');
  const siblingMain = join(buildDirectory, 'sibling_main.lua');
  const siblingOutput = join(buildDirectory, 'sibling.p8');
  require('fs').writeFileSync(siblingLua, 'sibling_value=7\n');
  require('fs').writeFileSync(siblingMain, 'require("sibling")\n');
  assert.strictEqual(main(['build', '--lua', siblingMain, siblingOutput], {
    write: () => {}, error: (text) => { throw new Error(text); },
  }), 0);
  assert.match(require('fs').readFileSync(siblingOutput, 'utf8'), /package\._c\["sibling"\]/);
  const namesFile = join(buildDirectory, 'names.txt');
  const plainMinified = join(buildDirectory, 'plain-minified.p8');
  const keepAllMinified = join(buildDirectory, 'keep-all-minified.p8');
  const keepFileMinified = join(buildDirectory, 'keep-file-minified.p8');
  require('fs').writeFileSync(luaFile, 'local player_score=1\nlocal enemy_score=2\nprint(player_score,enemy_score)\n');
  require('fs').writeFileSync(namesFile, '# names\nplayer_score\n\n');
  for (const [options, output] of [
    [[], plainMinified], [['--keep-all-names'], keepAllMinified],
    [['--keep-names-from-file', namesFile], keepFileMinified],
  ]) {
    assert.strictEqual(main(['build', '--lua', luaFile, '--lua-minify', ...options.flat(), output], {
      write: () => {}, error: (text) => { throw new Error(text); },
    }), 0);
  }
  const plainBuild = require('fs').readFileSync(plainMinified, 'utf8');
  const keepAllBuild = require('fs').readFileSync(keepAllMinified, 'utf8');
  const keepFileBuild = require('fs').readFileSync(keepFileMinified, 'utf8');
  assert.doesNotMatch(plainBuild, /player_score/);
  assert.match(keepAllBuild, /player_score/);
  assert.match(keepAllBuild, /enemy_score/);
  assert.match(keepFileBuild, /player_score/);
  assert.doesNotMatch(keepFileBuild, /enemy_score/);
  assert.deepStrictEqual(parseArgs(['build', '--empty-gfx', outputFile]).empty_gfx, true);
  let buildError = '';
  assert.strictEqual(main(['build', '--lua', luaFile, '--empty-lua', outputFile], {
    write: () => {}, error: (text) => { buildError += text; },
  }), 1);
  assert.match(buildError, /Cannot specify --lua and --empty-lua/);
} finally { rmSync(buildDirectory, { recursive: true, force: true }); }

let astOutput = '';
assert.strictEqual(main(['printast', resolve(__dirname, '../../../vendor/picotool/tests/testdata/test_cart.p8')], {
  write: (text) => { astOutput += text; }, error: (text) => { throw new Error(text); },
}), 0);
assert.match(astOutput, /^Chunk\n  \* stats: \[list:\]/);
assert.match(astOutput, /StatFunctionCall/);
const vendoredAst = spawnSync('python3', ['-c', String.raw`import sys
from pico8 import tool
from pico8.game import file
game = file.from_file(sys.argv[1])
tool._printast_node(game.lua.root)`, resolve(__dirname, '../../../vendor/picotool/tests/testdata/test_cart.p8')], {
  env: { ...process.env, PYTHONPATH: '../../vendor/picotool' },
});
assert.strictEqual(vendoredAst.status, 0, vendoredAst.stderr.toString());
assert.strictEqual(astOutput, vendoredAst.stdout.toString());
const golCart = resolve(__dirname, '../../../vendor/picotool/tests/testdata/test_gol.p8');
let golAstOutput = '';
assert.strictEqual(main(['printast', golCart], { write: (value) => { golAstOutput += value; }, error: (value) => { throw new Error(value); } }), 0);
const upstreamGolAst = spawnSync('python3', ['-c', String.raw`import sys
from pico8 import tool
from pico8.game import file
tool._printast_node(file.from_file(sys.argv[1]).lua.root)`, golCart], { env: { ...process.env, PYTHONPATH: '../../vendor/picotool' } });
assert.strictEqual(upstreamGolAst.status, 0, upstreamGolAst.stderr.toString());
assert.strictEqual(golAstOutput, upstreamGolAst.stdout.toString());
const exactAstDirectory = mkdtempSync(join(tmpdir(), 'picotool-ast-test-'));
try {
  const exactAstFile = join(exactAstDirectory, 'simple.p8');
  require('fs').writeFileSync(exactAstFile, 'pico-8 cartridge // http://www.pico-8.com\nversion 33\n__lua__\nx=1\nprint(x)\n');
  let exactAst = '';
  assert.strictEqual(main(['printast', exactAstFile], { write: (text) => { exactAst += text; }, error: (text) => { throw new Error(text); } }), 0);
  assert.match(exactAst, /TokName<b'x', line 0 char 0>/);
  assert.match(exactAst, /TokSymbol<b'=', line 0 char 1>/);
  assert.match(exactAst, /TokNumber<b'1', line 0 char 2>/);
  assert.match(exactAst, /TokName<b'print', line 1 char 0>/);
  const printAstPython = String.raw`import sys
from pico8 import tool
from pico8.lua import lexer, parser
source = sys.stdin.buffer.read()
lexed = lexer.Lexer(4)
lexed.process_lines([source])
parsed = parser.Parser(4)
parsed.process_tokens(lexed.tokens)
tool._printast_node(parsed.root)`;
  const upstreamAst = spawnSync('python3', ['-c', printAstPython], {
    input: Buffer.from('x=1\nprint(x)\n'),
    env: { ...process.env, PYTHONPATH: '../../vendor/picotool' },
  });
  assert.strictEqual(upstreamAst.status, 0, upstreamAst.stderr.toString());
  assert.strictEqual(exactAst, upstreamAst.stdout.toString());
} finally { rmSync(exactAstDirectory, { recursive: true, force: true }); }
let astErrors = '', multiAstOutput = '';
assert.strictEqual(main(['printast', 'missing.p8', resolve(__dirname, '../../../vendor/picotool/tests/testdata/test_cart.p8')], {
  write: (text) => { multiAstOutput += text; }, error: (text) => { astErrors += text; },
}), 0);
assert.match(astErrors, /missing\.p8: could not load cart/);
assert.match(multiAstOutput, /=== .*test_cart\.p8 ===\nChunk/);

const png = resolve(__dirname, '../../../vendor/picotool/tests/testdata/test_cart.p8.png');
const pngOutput = png.replace(/\.p8\.png$/, '_fmt.p8.png');
const pngBuildDirectory = mkdtempSync(join(tmpdir(), 'picotool-build-png-test-'));
const pngBuildLua = join(pngBuildDirectory, 'main.lua');
const pngBuildModuleDirectory = join(pngBuildDirectory, 'modules');
const pngBuildModule = join(pngBuildModuleDirectory, 'module.lua');
const pngBuildOutput = join(pngBuildDirectory, 'built.p8.png');
const pngBuildKeepOutput = join(pngBuildDirectory, 'built-keep.p8.png');
const pngBuildNames = join(pngBuildDirectory, 'names.txt');
require('fs').mkdirSync(pngBuildModuleDirectory);
require('fs').writeFileSync(pngBuildLua, 'require("module")\nprint("png")\n');
require('fs').writeFileSync(pngBuildModule, 'png_module=true\n');
mainAsync(['build', '--lua', pngBuildLua, '--lua-path', 'modules/?.lua', pngBuildOutput], {
  write: () => {}, error: (text) => { throw new Error(text); },
}).then((status) => {
  assert.strictEqual(status, 0);
  return mainAsync(['listlua', pngBuildOutput], {
    write: (text) => { assert.match(text, /package\._c\["module"\]/); },
    error: (text) => { throw new Error(text); },
  });
}).then((status) => {
  assert.strictEqual(status, 0);
  require('fs').writeFileSync(pngBuildLua, 'local player_score=1\nlocal enemy_score=2\nprint(player_score,enemy_score)\n');
  require('fs').writeFileSync(pngBuildNames, 'player_score\n');
  return mainAsync(['build', '--lua', pngBuildLua, '--lua-minify', '--keep-names-from-file', pngBuildNames, pngBuildKeepOutput], {
    write: () => {}, error: (text) => { throw new Error(text); },
  });
}).then((status) => {
  assert.strictEqual(status, 0);
  let listing = '';
  return mainAsync(['listlua', pngBuildKeepOutput], {
    write: (text) => { listing += text; }, error: (text) => { throw new Error(text); },
  }).then((listStatus) => {
    assert.strictEqual(listStatus, 0);
    assert.match(listing, /player_score/);
    assert.doesNotMatch(listing, /enemy_score/);
  });
}).then(() => {
  rmSync(pngBuildDirectory, { recursive: true, force: true });
}).catch((error) => { throw error; });
let pngAst = '', textAst = '';
assert.strictEqual(main(['printast', resolve(__dirname, '../../../vendor/picotool/tests/testdata/test_cart.p8')], {
  write: (text) => { textAst += text; }, error: (text) => { throw new Error(text); },
}), 0);
mainAsync(['printast', png], {
  write: (text) => { pngAst += text; },
  error: (text) => { throw new Error(text); },
}).then((status) => { assert.strictEqual(status, 0); assert.strictEqual(pngAst, textAst); }).catch((error) => { throw error; });
mainAsync(['stats', png], {
  write: (text) => { out += text; }, error: (text) => { err += text; },
}).then((status) => {
  assert.strictEqual(status, 0);
  assert.match(out, /test_cart\.p8\.png/);
  let pngListing = '';
  return mainAsync(['listlua', png], {
    write: (text) => { pngListing += text; }, error: (text) => { throw new Error(text); },
  }).then((pngStatus) => {
    assert.strictEqual(pngStatus, 0);
    assert.match(pngListing, /print/);
    pngListing = '';
    return mainAsync(['listtokens', png], {
      write: (text) => { pngListing += text; }, error: (text) => { throw new Error(text); },
    });
  }).then((pngStatus) => {
    assert.strictEqual(pngStatus, 0);
    assert.match(pngListing, /<0:/);
    return mainAsync(['writep8', png], {
      writeFile: (filename, bytes) => {
        assert.strictEqual(filename, pngOutput);
        assert.ok(Buffer.from(bytes).length > 100);
      },
      write: (text) => { assert.match(text, /_fmt\.p8\.png/); },
      error: (text) => { throw new Error(text); },
    });
  }).then((pngStatus) => {
    assert.strictEqual(pngStatus, 0);
    return Promise.all([['luamin', []], ['luafmt', []], ['luafmt', ['--overwrite']]].map(([command, options]) => mainAsync([command, ...options, png], {
      writeFile: (filename, bytes) => {
        assert.strictEqual(filename, pngOutput);
        assert.ok(Buffer.from(bytes).length > 100);
      },
      write: () => {}, error: (text) => { throw new Error(text); },
    })));
  }).then((statuses) => {
    assert.deepStrictEqual(statuses, [0, 0, 0]);
    return Promise.all(['stats', 'listlua', 'listtokens', 'printast'].map(async (command) => {
      const events = [];
      const status = await mainAsync([command, png, 'missing-extension.txt', upstreamCart], {
        write: (value) => events.push(['out', value]), error: (value) => events.push(['err', value]),
      });
      assert.strictEqual(status, 0, `${command}: mixed text/PNG status`);
      assert.deepStrictEqual(collapseEvents(events).map(([channel]) => channel), ['out', 'err', 'out'], `${command}: mixed text/PNG ordering`);
      assert.match(events.find(([channel]) => channel === 'err')[1], /filename must end in \.p8 or \.p8\.png/);
    }));
  }).then(() => {
    const directory = mkdtempSync(join(tmpdir(), 'picotool-png-keep-names-'));
    const namesFile = join(directory, 'names.txt');
    const golPng = resolve(__dirname, '../../../vendor/picotool/tests/testdata/test_gol.p8.png');
    fileSystem.writeFileSync(namesFile, 'x\n');
    let plain, kept;
    return Promise.all([
      mainAsync(['luamin', golPng], { writeFile: (_filename, bytes) => { plain = Buffer.from(bytes); }, write: () => {}, error: (value) => { throw new Error(value); } }),
      mainAsync(['luamin', '--keep-names-from-file', namesFile, golPng], { writeFile: (_filename, bytes) => { kept = Buffer.from(bytes); }, write: () => {}, error: (value) => { throw new Error(value); } }),
    ]).then((statuses) => {
      assert.deepStrictEqual(statuses, [0, 0]);
      assert.notDeepStrictEqual(kept, plain, 'PNG keep-names file must affect written cart bytes');
    }).finally(() => { rmSync(directory, { recursive: true, force: true }); });
  }).then(() => {
    let attempts = 0;
    return mainAsync(['writep8', png, png], {
      writeFile: async () => { attempts += 1; throw new Error('simulated async write failure'); },
      write: () => {}, error: () => {},
    }).then((status) => {
      assert.strictEqual(status, 1);
      assert.strictEqual(attempts, 1, 'async writer must stop after an output write failure');
    });
  }).then(() => {
    console.log('cli tests passed');
  });
}).catch((error) => { throw error; });
