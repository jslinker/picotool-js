# picotool JavaScript migration

This directory is the staging area for a portable JavaScript compatibility port of [picotool](https://github.com/dansanderson/picotool). It is intentionally structured so it can become a standalone repository later.

PICO-8 Studio consumes this package directly for text cartridge imports, so importing a `.p8` no longer launches Python. The vendored Python implementation remains the compatibility oracle for this port.

## Runtime dependency

This package uses [`fast-png`](https://github.com/image-js/fast-png) for PNG transport. `fast-png` is an MIT-licensed JavaScript/TypeScript encoder and decoder that uses typed arrays and runs in both Node and browsers without native modules or platform-specific binaries. The PICO-8 codec remains responsible for embedding and extracting cartridge bytes; `fast-png` only converts between PNG files and raw pixel data.

Install this workspace and its PNG dependency from the repository root:

```sh
npm install
```

When this package is extracted into its own repository, `fast-png` will be installed automatically from the `dependencies` entry in `package.json`.

### Cartridge file API

The Node entry point selects the transport from the complete filename. Both functions accept `.p8` and `.p8.png`, and `toFile()` can convert between the two formats:

```js
const picotool = require('@pico8-studio/picotool');

const cartridge = await picotool.fromFile('game.p8');
await picotool.toFile(cartridge, 'game.p8.png');
```

Overwriting an existing `.p8.png` preserves its visible label. For a different label, pass PNG bytes as `labelPng` or a path as `labelFilename`:

```js
await picotool.toFile(cartridge, 'game.p8.png', {
  labelFilename: 'custom-label.png',
});
```

`fromBytes()` and `toBytes()` provide the same filename-selected behavior without performing the final cartridge read or write. Lower-level callers can use `readP8Png()`, `writeP8PngFromP8()`, and `writeP8Png()` directly. Use `processP8IncludesAsync()` when includes may contain `.p8.png` files.

### Game compatibility API

`Game` provides the mutable, section-oriented shape used by Python picotool. JavaScript-style names and Python compatibility aliases are both available:

```js
const game = picotool.Game.makeEmptyGame('new-game.p8');
game.lua.updateFromLines(['print("hello")\n']);
game.writeCartData([0x80, 0x01], 0x3000);

console.log(game.getCompressedSize());
await game.toFile('new-game.p8');

const loaded = await picotool.Game.fromFile('new-game.p8');
```

The equivalent `make_empty_game()`, `update_from_lines()`, `write_cart_data()`, `get_compressed_size()`, `from_p8_file()`, and `to_p8_file()` spellings ease migration of code written against the Python API.

### Lexer token API

`tokenizeLua()` returns instances of `TokSpace`, `TokNewline`, `TokComment`, `TokString`, `TokNumber`, `TokName`, `TokLabel`, `TokKeyword`, and `TokSymbol`. Each token exposes its source `code`, parsed `value`, zero-based `line`/`column` position, and Python-compatible `lineno`/`charno` aliases. Use `equals()` for position-independent token equality and `matches()` to match a token class or token instance.

String and number values are parsed while `code` retains their writable source representation:

```js
const [token] = picotool.tokenizeLua('0x10.8');
console.log(token instanceof picotool.TokNumber); // true
console.log(token.code);                          // 0x10.8
console.log(token.value);                         // 16.5
```

### Lua search

`findLua()` searches validated Lua lines and returns `filename:line:code` matches or one filename with `listFiles: true`. This implements the intended `luafind` behavior rather than Python picotool's current Python 3 string-regex/bytes-line `TypeError`:

```js
picotool.findLua(cartridge, 'print', { filename: 'game.p8' });
```

`BaseASTWalker` is available for handler-based traversal: subclasses can override `_walk_<NodeType>()`, `_walk_token()`, or `_walk_value()`, and `walk()` yields results from the root. Traversal, token mutation, and child replacement are covered across the full accepted parser corpus.

### CLI progress

The Node package exposes `p8tool` for `stats`, `listlua`, `listrawlua`, `listtokens`, `writep8`, `luamin`, `luafmt`, `build`, `printast`, and the intended `luafind` search behavior. It accepts multiple cartridge paths and continues after a load failure. `stats --csv` emits the same columns and CRLF row endings as Python's CSV writer. PNG cartridge statistics, parsed and raw listings, writer commands, Lua search, builds, and AST debugging use the asynchronous PNG transport:

```sh
p8tool stats game.p8 game.p8.png
p8tool stats --csv game.p8
p8tool listlua --show-line-numbers game.p8
p8tool luafmt --indentwidth 2 game.p8
p8tool listtokens game.p8.png
p8tool luafind --listfiles 'print' game.p8 game.p8.png
p8tool build --lua main.lua --gfx art.p8.png output.p8.png
p8tool build --lua main.lua --lua-path 'modules/?.lua' output.p8
p8tool printast game.p8.png
```

Intentional compatibility boundaries and broken upstream behavior are tracked in [PARITY.md](PARITY.md). The vendored Python writer does not prompt before overwrite.

The implemented compatibility scope is the structural parser, public Python-named `parseLua()` AST with token ranges and token regeneration, `p8tool printast`, and Node-based echo, token-minifying, token-formatting, AST-echoing, AST-minifying, and AST-formatting writers for text `.p8` cartridges; decoded Gfx, Gff, Map, Music, and Sfx memory APIs; empty-cartridge creation and arbitrary cartridge-memory writes; `.p8.png` reading, writing, hidden-data encoding, and Lua decompression; filename-selected `fromFile()`/`toFile()` cartridge I/O; Pure Lua shorthand conversion; cartridge stats, token listings, and compression; section-source builds; `require()` bundling; and single-level `.lua`/`.p8`/`.p8.png` includes. The Node parity command compares these outputs directly with Python picotool, including complete writer output bytes, diagnostics, and pixel embedding at every cartridge memory boundary.

The public AST class inventory and metadata, fields, token values, spans, token-group layouts, regenerated token streams, walker traces and edits, and selected child replacements are compared recursively with Python on all accepted vendored parser-test inputs and text carts. The implementation remains pure JavaScript; optional declaration signatures are provided for consumers.

The complete list of remaining and intentionally excluded behavior is maintained in [PARITY.md](PARITY.md). The main exclusions are:

- Python's `pypng` file transport itself. JavaScript uses `fast-png`; parity tests compare the decoded cartridge and exact embedded RGBA bytes with Python's PICO-8 pixel codec, then exercise JavaScript PNG encode/decode round trips across all upstream fixtures.
- Malformed PNG labels with fewer than four 8-bit color planes are rejected, since Python's cartridge codec assumes four planes and may fail or mix channels.
- Adam7-interlaced RGBA labels can be read and reused; writer output preserves their visible pixels but may use non-interlaced PNG transport.
- PNG Lua writes reject payloads that exceed the format's 16-bit length header or fixed code region; Python can fail or produce oversized byte arrays for these inputs.
- Multi-file headings, ordered output/error continuation, unsupported-extension statuses, parser failures, malformed-cart continuation, option forms, and help exit semantics are compared with Python; help prose is generated natively in pure JavaScript. Writer success bytes and failure boundaries match Python. Fresh and existing text builds match exact Python bytes, silence, and error diagnostics; text/PNG build minification honors both advertised name-preservation options, which the vendored Python build path ignores.
- Python's text raw-listing implementation calls a missing API in this vendored revision; JavaScript supplies useful raw listing for both text and PNG carts.
- Usable `.rom` input and output. Both Python and JavaScript recognize the extension but raise `NotImplementedError` because Python's `ROMFormatter` has no implementation.
- The demo script and Python-specific utility globals, logging streams, and exception inheritance details.
- `--optimize-tokens` and property-name-preserving minification, which are also `NotImplementedError` in Python.

Python's AST writer has two observable failures that are retained in the Node compatibility behavior: complete AST-writer input without a final newline raises `IndexError`, and `require()` game-loop stripping can raise `AssertionError` when retained code follows a stripped loop function.

## Porting status

| Upstream area | Browser cases | Status |
| --- | ---: | --- |
| Text `.p8` structure and errors | 4 direct ports + parity corpus | Complete for the supported upstream behavior |
| Gfx | 13 of 13 | Complete for the upstream unit file |
| Gff | 4 of 4 | Complete for the upstream unit file |
| Map | 8 of 8 | Complete for the upstream unit file |
| Music | 6 of 6 | Complete for the upstream unit file |
| Sfx | 10 of 10 | Complete; the PNG-backed case runs through fixture parity |
| `.p8.png` codec | 5 direct ports + 1 domain case | Pure codec cases complete; real fixture parity runs in the browser |
| JavaScript-specific input behavior | 2 | CRLF/byte input and empty labels |

The five upstream text cartridges are additional parity fixtures. Their reports compare both raw section hashes and decoded memory hashes for Gfx, Gff, Map, Sfx, and Music.

## Run in a browser without Node

Open `browser/index.html` directly from Finder or a browser's **Open File** command. The page runs automatically without a local server. All 11 known upstream `.p8` and `.p8.png` fixtures and their Python oracle results are bundled, so the normal run requires no file selection.

The built-in cases retain their upstream Python test identifiers where they are direct ports. The fixture picker is only needed to test a new or replacement cartridge:

1. Choose the additional `.p8` or `.p8.png` files in the fixture picker.
2. Click **Run tests** again.
3. Use **Copy output** to capture the human-readable result and complete JSON report.

## Produce the Python oracle report

Use the same fixture list when running the oracle:

```sh
python3 packages/picotool-js/tools/python_oracle.py \
  vendor/picotool/tests/testdata/*.p8 \
  vendor/picotool/tests/testdata/*.p8.png \
  > /tmp/picotool-python.json
```

The oracle imports the vendored Python picotool, so it should be run in the same Python environment that runs the upstream tests. It writes JSON to standard output. Choose `/tmp/picotool-python.json` with the report file picker and click **Compare with Python**. You can instead paste the complete JSON; the paste box also accepts terminal output surrounding one complete JSON object.

The checked-in browser bundle is regenerated deterministically after upstream fixtures or oracle behavior change:

```sh
python3 packages/picotool-js/tools/generate_browser_fixtures.py
```

For `.p8.png` fixtures, the oracle uses picotool's optional `pypng` dependency when it is installed. Otherwise, its narrow standard-library fallback reads the non-interlaced 8-bit RGBA format used by PICO-8 cartridges. The browser uses its built-in PNG decoder; neither path requires Node.

Fixture order does not matter, but the browser and oracle must receive the same files. If sharing terminal output for remote diagnosis, include:

- the upstream pytest summary;
- the complete Python oracle JSON;
- the browser's copied output.

## Terminal-only comparison on macOS

macOS includes JavaScriptCore, the JavaScript engine used by Safari. It can run the same dependency-free implementation and browser test files without Node:

```sh
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc \
  packages/picotool-js/src/p8scii-map.js \
  packages/picotool-js/src/picotool.js \
  packages/picotool-js/src/sections.js \
  packages/picotool-js/src/p8png.js \
  packages/picotool-js/browser/fixture-data.js \
  packages/picotool-js/browser/report-utils.js \
  packages/picotool-js/browser/test-runner.js \
  packages/picotool-js/browser/tests.js \
  packages/picotool-js/browser/domain-tests.js \
  packages/picotool-js/browser/png-tests.js \
  packages/picotool-js/browser/fixture-tests.js \
  packages/picotool-js/tools/javascriptcore_report.js \
  -- vendor/picotool/tests/testdata/empty.p8 \
     vendor/picotool/tests/testdata/test_cart.p8 \
     vendor/picotool/tests/testdata/test_cart_memdump.p8 \
     vendor/picotool/tests/testdata/test_cart_with_label.p8 \
     vendor/picotool/tests/testdata/test_gol.p8 \
  > /tmp/picotool-javascript.json
```

Save the Python oracle command's output to `/tmp/picotool-python.json`, then compare the reports:

```sh
python3 packages/picotool-js/tools/compare_reports.py \
  /tmp/picotool-python.json /tmp/picotool-javascript.json
```

The comparison report contains the JavaScript test totals and only the identifiers of mismatched parity cases, making it suitable for sharing as terminal output. JavaScriptCore validates the dependency-free codec and text fixtures; actual PNG image decoding runs in the browser.

## Run the complete upstream suite

From the vendored checkout, use its normal Python environment:

```sh
cd vendor/picotool
python3 -m pytest
```

For a concise report that does not require pytest itself, run:

```sh
python3 packages/picotool-js/tools/python_suite_report.py
```

At the start of this migration, the vendored suite discovers 271 tests: 265 pass and six error in the current Python environment. Two errors need the optional `png` module; four build tests call a legacy `Game.to_p8_file` API that is absent from the vendored implementation. The JSON report records their exact identifiers so that baseline drift is visible.

Passing that suite describes Python picotool. A migration slice is accepted only when its ported browser tests pass and its parity report matches the Python oracle.
