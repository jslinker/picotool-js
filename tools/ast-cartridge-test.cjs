'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const base = require('../src/picotool');
const { AstParser } = require('../src/lua-ast-model');
const { printAst } = require('../src/ast-print');
const { createBrowserCommands } = require('../src/browser-commands');
const { main } = require('../src/cli');
const { toBytes } = require('../src/cartridge-io');

async function test() {
  // Glyphs, a local declaration after trivia, and PICO-8 binary operators
  // independently reproduce failures found in full cartridges.
  const source = '-- glyph regression\nif btn(⬅️) then\n local x = 7\\2\n x = x >>> 1\n x = x <<> 1\n x = x >>< 1\n print("⬆️", x)\nend\n';
  const bytes = base.encodeP8scii(source);
  const parser = new AstParser(bytes);
  const tree = parser.parse();
  assert.equal(parser.i, parser.tokens.length, 'must consume the complete source');
  const operators = [];
  tree.walk(node => { if (node.type === 'ExpBinOp') operators.push(node.binop.code); });
  assert.deepEqual([...new Set(operators)], ['\\', '>>>', '<<>', '>><']);
  const local = tree.stats[0].exp_block_pairs[0][1].stats[0];
  assert.equal(local.type, 'StatLocalAssignment');
  assert.equal(local.start.line, 2);
  assert.equal(local.namelist.names[0].code, 'x');
  assert.equal(local.namelist.range.end.column, 8);
  const expected = printAst(bytes);
  const cart = base.encodeUtf8(`${base.HEADER}\nversion 42\n__lua__\n${source}`);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'picotool-ast-'));
  try {
    for (const extension of ['p8', 'p8.png']) {
      const name = `glyphs.${extension}`;
      const input = extension === 'p8' ? cart : await toBytes(base.parseP8(cart), name);
      const filename = path.join(directory, name);
      fs.writeFileSync(filename, input);
      const browser = await createBrowserCommands().printast({ cartridges: [{ name, bytes: input }] });
      assert.equal(browser.ok, true, JSON.stringify(browser.errors));
      assert.equal(browser.results[0].text, expected);
      const cli = spawnSync(process.execPath, [path.resolve(__dirname, 'p8tool.cjs'), 'printast', filename], { encoding: 'utf8' });
      assert.equal(cli.status, 0, cli.stderr);
      assert.equal(cli.stdout, expected);
      if (extension === 'p8') {
        let output = '';
        assert.equal(main(['printast', filename], { write: text => { output += text; } }), 0);
        assert.equal(output, expected);
      }
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  console.log('AST cartridge regressions passed (CLI and browser, P8 and PNG)');
}
test().catch(error => { console.error(error); process.exitCode = 1; });
