# Parity status and remaining work

The supported JavaScript behavior is checked by running Node and Python over the same inputs and comparing written output, diagnostics, decoded memory, or pixel data. Run `npm test` for the complete parity report.

## Remaining parity items

### Public parser AST model

- Add Python-compatible AST node classes, fields, and token ranges. Lexer tokens now expose Python-style debug representations, but the draft AST still stores some token-valued fields as plain strings; token-aware recursive comparisons remain required before public integration.
- Integrate the implemented `BaseASTWalker` dispatch with a complete parser AST, including all node handlers and token-valued fields, then verify traversal and mutation parity.
- Add AST debug output for `printast`. Observable formatter and minifier output already matches.

### CLI orchestration and presentation

- Match multi-file headings, error continuation, argument parsing, and exit codes.
- Match remaining filesystem-wrapper edge cases for `writep8`, `luamin`, and `luafmt`, including `luafmt --overwrite` for text carts. Writer commands now report the output path after a successful cart load and before a write attempt, as Python does. The vendored Python writer does not prompt before overwrite.
- Extend the `p8tool` entry point beyond the implemented `stats`, `listlua`, `listtokens`, `writep8`, `luamin`, `luafmt`, `luafind`, and `build` slices for text and PNG carts; raw listing is text-only. `build` accepts Lua module sources, `--lua-path` module lookups, and section overrides, including PNG carts, but its name-preservation options and some filesystem/argument edge cases need Python comparison. Check output naming, presentation and argument edge cases against Python.
- Add `printast` after the public AST model exists.

### Broken or unavailable upstream behavior

- Python 3 `luafind` searches a bytes line with a string regex and raises `TypeError`. JavaScript intentionally implements the documented intended line search through `findLua()` and `p8tool luafind`; broader pattern/presentation cases remain to be checked.
- `listrawlua` calls the missing `Game.get_raw_data_from_p8_file()` API in the vendored revision.
- `.rom` is recognized by filename and raises `NotImplementedError` on reading and writing, as the upstream formatter does; usable ROM transport remains unavailable upstream.
- `buildP8({ optimizeTokens: true })` for `.lua` sources and `minifyLua(..., { keepPropertyNames: true })` now reproduce Python's `NotImplementedError`; usable implementations remain unavailable upstream.

### PNG edge cases and transport

- Direct `pypng` reader/writer implementation details are excluded. JavaScript uses `fast-png`; parity covers decoded cartridges, exact embedded RGBA bytes, visible-label preservation, and PNG round trips.
- Non-RGBA or non-8-bit labels are rejected deliberately: Python's PICO-8 pixel codec assumes four 8-bit color planes and can fail or mix channels otherwise. Adam7-interlaced RGBA labels are accepted and tested for decoded cartridge and visible-label preservation; output PNG interlace style itself is not preserved.
- Python's uncompressed-code `TypeError` and oversized-code byte-array expansion are intentionally not reproduced. The JavaScript codec writes useful fixed-size PICO-8 data and rejects code that would overflow the 16-bit length header or code region instead of silently truncating it.

### Python-only infrastructure

- `BaseFormatter` inheritance, Python exception inheritance, logging streams, temporary-file mechanics, and demo scripts are excluded unless a JavaScript consumer needs their observable behavior.

## Completed output parity

The parity harness currently covers text parsing and section serialization; all Lua writer modes; lexer and parser corpora; diagnostics; builds and includes; `require()` bundling; Pure Lua output; listings and token listings; statistics and compression; cartridge-memory writes; PNG decoding, embedding, writing, round trips, and PNG includes. The Node API also selects `.p8` and `.p8.png` transports by filename through `fromFile()` and `toFile()`, preserves an existing PNG label on overwrite, and reports unsupported extensions with a dedicated error. A Python-shaped `Game` class exposes the section fields, empty-game factory, compressed-size calculation, memory writes, and file methods in both camelCase and compatibility spellings. Public lexer results use Python-shaped token classes with source code, parsed values, positions, mutation, equality, and `matches()` behavior.
