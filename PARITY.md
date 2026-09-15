# Parity status and remaining work

The supported JavaScript behavior is checked by running Node and Python over the same inputs and comparing written output, diagnostics, decoded memory, or pixel data. Run `npm test` for the complete parity report.

## Remaining parity items

### Unified cartridge file API

- Select `.p8` or `.p8.png` behavior from a filename.
- Provide `fromFile` and `toFile` equivalents.
- Reuse an existing PNG label when overwriting a cartridge.
- Match unsupported-extension errors.

### Python-shaped Game API

- Expose a `Game` class with Python-compatible fields and factories.
- Add instance forms of empty-game creation, compressed-size calculation, and cartridge-memory writes. Equivalent JavaScript functions already exist.
- Resolve the `Game.from_p8_file()` and `Game.to_p8_file()` calls in upstream tests. Those methods are absent from the vendored Python revision.

### Public lexer token model

- Add Python-compatible token classes such as `TokName`, `TokString`, `TokNumber`, and `TokSymbol`.
- Match token equality, `matches()`, mutable `code`, parsed `value`, and position properties. Tokenization, diagnostics, writing, and `listTokens()` output already match.

### Public parser AST model

- Add Python-compatible AST node classes, fields, and token ranges.
- Support AST traversal and mutation through equivalents of `BaseASTWalker` and its node handlers.
- Add AST debug output for `printast`. Observable formatter and minifier output already matches.

### CLI orchestration and presentation

- Match multi-file headings, error continuation, argument parsing, and exit codes.
- Match overwrite prompting and the filesystem wrappers for `writep8`, `luamin`, and `luafmt`.
- Match `stats` table and CSV presentation. The underlying statistics already match.
- Add `printast` after the public AST model exists.

### Broken or unavailable upstream behavior

- Decide whether `luafind` should reproduce its Python 3 string-pattern/byte-line `TypeError` or implement the intended search behavior.
- `listrawlua` calls the missing `Game.get_raw_data_from_p8_file()` API in the vendored revision.
- `.rom` reading and writing only raise `NotImplementedError` in Python.
- `--optimize-tokens` and property-name-preserving minification raise `NotImplementedError` in Python.

### PNG edge cases and transport

- Direct `pypng` reader/writer implementation details are excluded. JavaScript uses `fast-png`; parity covers decoded cartridges, exact embedded RGBA bytes, visible-label preservation, and PNG round trips.
- Determine whether non-RGBA, non-8-bit, or interlaced labels should be accepted. Python's PICO-8 codec assumes four color planes.
- Decide whether to reproduce Python's uncompressed-code `TypeError` and oversized-code byte-array expansion. JavaScript currently writes useful fixed-size PICO-8 data instead of reproducing corrupt or failing output.

### Python-only infrastructure

- `BaseFormatter` inheritance, Python exception inheritance, logging streams, temporary-file mechanics, and demo scripts are excluded unless a JavaScript consumer needs their observable behavior.

## Completed output parity

The parity harness currently covers text parsing and section serialization; all Lua writer modes; lexer and parser corpora; diagnostics; builds and includes; `require()` bundling; Pure Lua output; listings and token listings; statistics and compression; cartridge-memory writes; PNG decoding, embedding, writing, round trips, and PNG includes.
