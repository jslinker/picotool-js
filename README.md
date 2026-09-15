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

The implemented compatibility scope is the structural parser and Node-based echo, token-minifying, token-formatting, AST-echoing, AST-minifying, and AST-formatting writers for text `.p8` cartridges; decoded Gfx, Gff, Map, Music, and Sfx memory APIs; empty-cartridge creation and arbitrary cartridge-memory writes; `.p8.png` reading, writing, hidden-data encoding, and Lua decompression; filename-selected `fromFile()`/`toFile()` cartridge I/O; Pure Lua shorthand conversion; cartridge stats, token listings, and compression; section-source builds; `require()` bundling; and single-level `.lua`/`.p8`/`.p8.png` includes. The Node parity command compares these outputs directly with Python picotool, including complete writer output bytes, diagnostics, and pixel embedding at every cartridge memory boundary.

The complete list of remaining and intentionally excluded behavior is maintained in [PARITY.md](PARITY.md). The main exclusions are:

- Python's `pypng` file transport itself. JavaScript uses `fast-png`; parity tests compare the decoded cartridge and exact embedded RGBA bytes with Python's PICO-8 pixel codec, then exercise JavaScript PNG encode/decode round trips across all upstream fixtures.
- Python parser AST classes, walker subclasses, and AST debug printing. The Node API validates grammar and reproduces the observable writer and `require()` outputs used by the extension; it does not expose Python-shaped AST objects.
- CLI-only orchestration and presentation commands such as `luafind`, `printast`, overwrite prompting, and CSV formatting. `listLua()` and `listTokens()` cover the working Lua and token listing output.
- Raw Lua listing, which calls the missing `Game.get_raw_data_from_p8_file` API in this vendored revision.
- `.rom` input and output. Python's `ROMFormatter` methods only raise `NotImplementedError`.
- The demo script and Python-specific utility globals, logging streams, and exception inheritance details.
- `--optimize-tokens` and property-name-preserving minification, which are also `NotImplementedError` in Python.

Python's AST writer has two observable failures that are retained in the Node compatibility behavior: complete AST-writer input without a final newline raises `IndexError`, and `require()` game-loop stripping can raise `AssertionError` when retained code follows a stripped loop function.

## Porting status

| Upstream area | Browser cases | Status |
| --- | ---: | --- |
| Text `.p8` structure and errors | 4 direct ports | Initial slice complete |
| Gfx | 13 of 13 | Complete for the upstream unit file |
| Gff | 4 of 4 | Complete for the upstream unit file |
| Map | 8 of 8 | Complete for the upstream unit file |
| Music | 6 of 6 | Complete for the upstream unit file |
| Sfx | 9 of 10 | The remaining case reads `.p8.png` |
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
