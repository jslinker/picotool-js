# picotool-js

JavaScript tools for reading, editing, inspecting, and building PICO-8 cartridges. This project ports [Python picotool](https://github.com/dansanderson/picotool) and provides a Node.js library, a `p8tool` command-line interface, and a smaller browser entry point.

Python and the PICO-8 application are not required to use the library or CLI. PNG encoding and decoding use the pure-JavaScript [`fast-png`](https://github.com/image-js/fast-png) dependency. TypeScript declarations are included.

The implemented Node workflows have extensive differential tests against Python picotool. This is not yet a complete drop-in replacement for Python's object API. See [compatibility boundaries](PARITY.md) and the [parity audit and proposed completion plan](PARITY-AUDIT.md).

## Set up from GitHub

Install Node.js and npm, then clone and install this repository:

```sh
git clone https://github.com/jslinker/picotool-js.git
cd picotool-js
npm ci
node tools/p8tool.cjs --help
```

No compilation step is required. The September 2026 audit ran on Node.js 26.7.0; the repository does not yet declare or test a minimum Node version.

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

Compatibility targets the upstream Python revision recorded in [PARITY-AUDIT.md](PARITY-AUDIT.md), not every feature of current PICO-8. Known boundaries include:

- `.rom`, token optimization, and property-name-preserving minification remain unimplemented, as in the reference implementation.
- JavaScript supplies working Lua search and raw listing where the reference has Python 3 failures.
- PNG parity compares cartridge bytes and visible pixel data, not identical compressed PNG files. Invalid labels and oversized code are rejected.
- Some upstream AST-writer failures are intentionally retained. See [PARITY.md](PARITY.md) for details.

For the main differential harness, obtain the reference checkout and select its revision:

```sh
git clone https://github.com/dansanderson/picotool.git vendor/picotool
git -C vendor/picotool checkout 49808e5ddb21e886a5608a19c95ec3ca6f1ee541
npm run test:parity
python3 tools/python_suite_report.py
```

Python 3 is needed only for development checks. The main harness supports `PICOTOOL_ROOT`, `PICOTOOL_FIXTURES_ROOT`, and `PYTHON` environment overrides. The Python suite also needs `pypng` for its PNG tests.

**Current test setup limitation:** `npm test` passes in the original monorepo layout, but several component tests hard-code `../../vendor/picotool` and `python3`. A standalone clone with `vendor/picotool` can run the main `test:parity` harness, but cannot yet run the complete aggregate suite using that layout. Fixing this is the first item in the [completion plan](PARITY-AUDIT.md). The older [development guide](DEVELOPMENT.md) contains additional oracle workflows, including commands specific to the original monorepo.

## License

[MIT](LICENSE). Based on Dan Sanderson's Python picotool; PNG transport uses MIT-licensed `fast-png`.
