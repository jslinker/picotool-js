# picotool-js

JavaScript tools for reading, editing, inspecting, and building PICO-8 cartridges. This project ports [Python picotool](https://github.com/dansanderson/picotool) and provides a Node.js library, a `p8tool` command-line interface, and a smaller browser entry point.

Python and the PICO-8 application are not required to use the library or CLI. PNG encoding and decoding use the pure-JavaScript [`fast-png`](https://github.com/image-js/fast-png) dependency. TypeScript declarations are included.

The implemented Node workflows have extensive differential tests against Python picotool. This is not yet a complete drop-in replacement for Python's object API. See [compatibility boundaries](PARITY.md) and the [parity audit and proposed completion plan](PARITY-AUDIT.md).

## Set up from GitHub

Install Node.js 22 or newer and npm, then clone and install this repository:

```sh
git clone https://github.com/jslinker/picotool-js.git
cd picotool-js
npm ci
node tools/p8tool.cjs --help
```

No compilation step is required. The package declares Node.js 22 or newer; the September 2026 audit ran on Node.js 26.7.0.

All commands below assume you are in this repository's root. To make `p8tool` available on your PATH, optionally run:

```sh
npm link
p8tool --help
```

To use the library in another local Node project, install your checkout from that project's directory:

```sh
npm install /absolute/path/to/picotool-js
```

Then import it with `require('@pico8-studio/picotool')`. The instructions here use a local checkout and do not depend on an npm registry release.

## Command-line quick start

Create a Lua file named `main.lua`:

```lua
function _draw()
  cls()
  print("hello from picotool-js", 20, 60, 7)
end
```

Build a cartridge, inspect its size, and list its code:

```sh
node tools/p8tool.cjs build --lua main.lua hello.p8
node tools/p8tool.cjs stats hello.p8
node tools/p8tool.cjs listlua --show-line-numbers hello.p8
```

Load `hello.p8` in PICO-8 to run it. This package processes cartridges; it does not execute games.

### Available commands

| Command | Purpose | Example arguments after the command |
| --- | --- | --- |
| `stats` | Show cartridge statistics | `--csv game.p8 game.p8.png` |
| `listlua` | Print Lua, optionally converting PICO-8 shorthand | `--show-line-numbers game.p8` |
| `listrawlua` | Print raw Lua | `game.p8.png` |
| `listtokens` | Inspect Lua tokens | `game.p8` |
| `printast` | Print the Lua syntax tree | `game.p8` |
| `luafind` | Search Lua with a JavaScript regular expression | `--listfiles 'print' game.p8` |
| `writep8` | Rewrite a cartridge using the default writer | `game.p8` |
| `luamin` | Minify Lua in a cartridge | `--keep-all-names game.p8` |
| `luafmt` | Format Lua in a cartridge | `--indentwidth 2 game.p8` |
| `build` | Assemble Lua and cartridge sections | `--lua main.lua --gfx art.p8 output.p8` |

Prefix these with `node tools/p8tool.cjs`, or with `p8tool` after `npm link`. Run `node tools/p8tool.cjs COMMAND --help` for command help. Commands that read cartridges accept `.p8` and `.p8.png` files and generally accept multiple inputs.

Writer commands normally create `game_fmt.p8` or `game_fmt.p8.png`; an existing output can be replaced without prompting. `luafmt --overwrite game.p8` edits a text cartridge in place. `build` updates its named output if it already exists, retaining sections you do not replace or empty.

### Build with assets and modules

```sh
node tools/p8tool.cjs build --lua main.lua --gfx art.p8.png --sfx sounds.p8 game.p8
node tools/p8tool.cjs build --lua main.lua --lua-path 'modules/?.lua' game.p8
node tools/p8tool.cjs build --lua main.lua --lua-minify game.p8.png
```

Build sources can supply `lua`, `gfx`, `gff`, `map`, `sfx`, and `music`. Use the corresponding `--empty-SECTION` option to clear a section. Lua builds support `require()` bundling; the include helpers support single-level `.lua`, `.p8`, and `.p8.png` includes. Token optimization is not implemented.

## Use as a Node.js library

Save this as `example.cjs` in the checkout and run `node example.cjs`:

```js
const picotool = require('./src');
// In another project: require('@pico8-studio/picotool')

async function main() {
  const game = picotool.Game.makeEmptyGame('hello.p8');
  game.lua.updateFromLines(['print("hello")\n']);
  await game.toFile('hello.p8');

  const cartridge = await picotool.fromFile('hello.p8');
  console.log(picotool.cartridgeStats(cartridge));
  await picotool.toFile(cartridge, 'hello.p8.png');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
```

`fromFile()` chooses the input format by filename. `toFile()` converts between text and PNG cartridges. New PNG output uses a blank label by default; overwriting an existing PNG preserves that destination's visible label. Supply your own label with:

```js
await picotool.toFile(cartridge, 'hello.p8.png', {
  labelFilename: 'custom-label.png',
});
```

Labels must decode to 8-bit RGBA and have enough pixels for cartridge data (the default is 160 × 205). `labelPng` accepts PNG bytes instead of a filename.

### Features and APIs

| Area | APIs and capabilities |
| --- | --- |
| Text cartridges | `parseP8()`, `writeP8()`, `writeP8WithDiagnostics()`; section serialization and P8SCII encoding |
| File conversion | Async `fromFile()`, `toFile()`, `fromBytes()`, `toBytes()`; `.p8` and `.p8.png` |
| PNG cartridges | `readP8Png()`, `writeP8Png()`, hidden cartridge data, Lua compression/decompression, visible-label preservation |
| Editable game data | `Game`, `Gfx`, `Gff`, `MapSection`, `Sfx`, `Music`, cartridge-memory writes |
| Lua inspection | `tokenizeLua()`, `parseLua()`, Python-shaped token and AST classes, `BaseASTWalker` |
| Lua transformations | Token and AST echo/minify/format writers, `pureLua()` shorthand conversion |
| Analysis | `cartridgeStats()`, `listLua()`, `listTokens()`, `findLua()` |
| Assembly | `buildP8()`, `bundleRequiredLua()`, `processP8Includes()`, `processP8IncludesAsync()` |

For example, inspect tokens or transform source:

```js
const [token] = picotool.tokenizeLua('0x10.8');
console.log(token.code, token.value); // 0x10.8, 16.5

const bytes = picotool.minifyLua('local score = 10\nprint(score)\n');
console.log(picotool.decodeP8scii(bytes));
```

See [the declarations](src/index.d.ts) for signatures and options. Source transformations generally return `Uint8Array`; use `decodeP8scii()` for PICO-8 Lua text. `Game` offers selected snake_case compatibility aliases, but `Game.lua` is a lightweight source wrapper: it does not yet implement Python's full mutable Lua/writer lifecycle.

## Browser use

The package's `browser` entry points bundlers to `src/browser.js`. It exposes text parsing, section models, PNG codecs/transport, game data, tokens, ASTs, and traversal. It does **not** export all Node functions: top-level writers, minification, builds, includes, statistics, search, and filesystem helpers are absent. Browser bundling and filesystem-dependent methods still need dedicated integration verification; see the audit.

For the existing browser test demo, open [`browser/index.html`](browser/index.html) directly in a browser. It bundles 11 upstream cartridges and frozen Python expectations, so no Node, Python, or local server is needed. It exercises the core codecs and section models, not the full package API.

## Compatibility and tests

The [upstream test coverage](tests/parity/README.md) maps all 308 Python tests: 301 named JS mappings and seven deferred feature TODOs (custom writers and logging). Mappings include documented adaptations and do not prove identical internal contracts. Run `npm run test:catalog` to validate the catalog. Four build tests have documented obsolete Python fixture-save calls.

**Open contribution: custom Lua writers.** Built-in JS writer functions work, but Python's `BaseLuaWriter` subclass interface and its integration with Lua output are not implemented. The maintainer does not need this extension interface for the current project; contributions are welcome. See the [commented TODO beside the writer tests](tools/lua-source-parity-test.cjs). A useful PR should support a working custom writer and test its integration, as well as rejection of the unimplemented base method.

**Open contribution: shared logging and verbosity.** The maintainer chose not to add a logging utility for this project. JS callers provide output callbacks; Python's shared verbosity and logging-stream API is absent. The six [commented utility TODOs](tools/base-section-test.cjs) document the expected output routing and quiet/debug filtering for a future implementation. They are not counted as passing parity tests.

Compatibility targets the upstream Python revision recorded in [PARITY-AUDIT.md](PARITY-AUDIT.md), not every feature of current PICO-8. Known boundaries include:

- `.rom`, token optimization, and property-name-preserving minification remain unimplemented, as in the reference implementation.
- JavaScript supplies working Lua search and raw listing where the reference has Python 3 failures.
- PNG parity compares cartridge bytes and visible pixel data, not identical compressed PNG files. Invalid labels and oversized code are rejected.
- Some upstream AST-writer failures are intentionally retained. See [PARITY.md](PARITY.md) for details.

### Run Python and JavaScript tests

After `npm ci`, install Python 3 with `venv` support and Git. From the repository root, set up the pinned Python reference environment:

```sh
python3 tools/setup-oracle.py
```

On Windows, use `py -3` instead of `python3` if needed. Setup downloads the pinned picotool checkout to `vendor/picotool`, creates `.oracle-venv`, and installs the pinned `pypng` dependency. It requires network access. The test commands automatically find this environment; no virtual-environment activation is needed. Python is only required for development/reference checks, not library or CLI use.

Run the suites separately:

```sh
# Original Python suite, checked against the known upstream baseline
npm run test:python-baseline

# JavaScript tests, including named upstream ports and feature TODOs
npm run test:js

# Validate all upstream-to-JS test mappings
npm run test:catalog
```

The expected Python baseline is **308 tests: 304 passes and four known fixture-setup errors** caused by obsolete `Game.to_p8_file` calls. The baseline command succeeds when those exact expected errors occur; unexpected failures or baseline drift fail it. The JS suite includes **seven intentional feature TODOs**, which are not passing tests. JS also has additional regression tests, so its test count need not equal Python's.

### Compare the implementations

```sh
# Run both implementations on shared inputs and compare their results
npm run test:parity

# Broader Python-backed checks, including AST and generated-data comparisons
npm run test:oracle
```

The parity harness compares emitted bytes, token results, cartridge data, and supported writer output. Mismatches cause a nonzero exit status and appear in its report. The Python and JS unit-test logs are not directly comparable line by line; use this harness for behavioral comparison. Matching results cover the tested inputs and documented adaptations, not every Python API contract.

To save reports for inspection (these files are written to the system temporary directory):

```sh
# macOS/Linux shell
node tools/run-python.cjs tools/python_suite_report.py > /tmp/picotool-python-tests.json
npm run test:js > /tmp/picotool-js-tests.txt 2>&1
node tools/check-parity.cjs > /tmp/picotool-parity-comparison.json
```

On Windows, choose equivalent paths under your temporary directory. The raw Python JSON report includes the known upstream errors; `test:python-baseline` is the command that validates them. Running the comparison script directly keeps npm's command banner out of the JSON report.

To reuse an existing reference checkout, run `python3 tools/setup-oracle.py --root /path/to/picotool` and set `PICOTOOL_ROOT` to that checkout when testing. It must match the revision in [oracle-pin.json](tools/oracle-pin.json). `PICOTOOL_FIXTURES_ROOT` and `PYTHON` can override the fixture directory and interpreter; otherwise the tests use the checkout's fixtures and `.oracle-venv` interpreter.

`npm test` combines the JS suite, oracle checks, and TypeScript checks. **Known limitation:** the browser declaration/runtime export comparison currently fails even when the JS and Python parity suites pass. This is a separate type-surface issue, not an expected Python baseline error. See [DEVELOPMENT.md](DEVELOPMENT.md) for additional browser and oracle workflows.

## License

[MIT](LICENSE). Based on Dan Sanderson's Python picotool; PNG transport uses MIT-licensed `fast-png`.
