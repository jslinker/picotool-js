'use strict';

const assert = require('assert');
const { resolve } = require('node:path');
const { join } = require('node:path');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { formatStats, main, mainAsync, parseArgs, statsRows } = require('../src/cli');

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
  let missingWriteOutput = '';
  assert.strictEqual(main(['writep8', join(testDirectory, 'missing.p8')], {
    write: (text) => { missingWriteOutput += text; }, error: () => {},
  }), 1);
  assert.strictEqual(missingWriteOutput, '');
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
  assert.deepStrictEqual(parseArgs(['build', '--empty-gfx', outputFile]).empty_gfx, true);
  let buildError = '';
  assert.strictEqual(main(['build', '--lua', luaFile, '--empty-lua', outputFile], {
    write: () => {}, error: (text) => { buildError += text; },
  }), 1);
  assert.match(buildError, /Cannot specify --lua and --empty-lua/);
} finally { rmSync(buildDirectory, { recursive: true, force: true }); }

const png = resolve(__dirname, '../../../vendor/picotool/tests/testdata/test_cart.p8.png');
const pngOutput = png.replace(/\.p8\.png$/, '_fmt.p8.png');
const pngBuildDirectory = mkdtempSync(join(tmpdir(), 'picotool-build-png-test-'));
const pngBuildLua = join(pngBuildDirectory, 'main.lua');
const pngBuildModuleDirectory = join(pngBuildDirectory, 'modules');
const pngBuildModule = join(pngBuildModuleDirectory, 'module.lua');
const pngBuildOutput = join(pngBuildDirectory, 'built.p8.png');
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
  rmSync(pngBuildDirectory, { recursive: true, force: true });
}).catch((error) => { throw error; });
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
    return Promise.all(['luamin', 'luafmt'].map((command) => mainAsync([command, png], {
      writeFile: (filename, bytes) => {
        assert.strictEqual(filename, pngOutput);
        assert.ok(Buffer.from(bytes).length > 100);
      },
      write: () => {}, error: (text) => { throw new Error(text); },
    })));
  }).then((statuses) => {
    assert.deepStrictEqual(statuses, [0, 0]);
    console.log('cli tests passed');
  });
}).catch((error) => { throw error; });
