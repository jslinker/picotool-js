# Parity status and remaining work

The supported JavaScript behavior is checked by running Node and Python over the same inputs and comparing written output, diagnostics, decoded memory, or pixel data. Run `npm test` for the complete parity report.

## Remaining parity items

### Broken or unavailable upstream behavior

- Python 3 `luafind` searches a bytes line with a string regex and raises `TypeError`. JavaScript intentionally implements the documented intended line search through `findLua()` and `p8tool luafind`; broader pattern/presentation cases remain to be checked.
- Python's text-cart `listrawlua` calls the missing `Game.get_raw_data_from_p8_file()` API in the vendored revision. JavaScript provides useful raw listing for both text and PNG carts, including line numbers and mixed-file ordering.
- `.rom` is recognized by filename and raises `NotImplementedError` on reading and writing, as the upstream formatter does; usable ROM transport remains unavailable upstream.
- `buildP8({ optimizeTokens: true })` for `.lua` sources and `minifyLua(..., { keepPropertyNames: true })` now reproduce Python's `NotImplementedError`; usable implementations remain unavailable upstream.

### PNG edge cases and transport

- Direct `pypng` reader/writer implementation details are excluded. JavaScript uses `fast-png`; parity covers decoded cartridges, exact embedded RGBA bytes, visible-label preservation, and PNG round trips.
- Non-RGBA or non-8-bit labels are rejected deliberately: Python's PICO-8 pixel codec assumes four 8-bit color planes and can fail or mix channels otherwise. Adam7-interlaced RGBA labels are accepted and tested for decoded cartridge and visible-label preservation; output PNG interlace style itself is not preserved.
- Python's uncompressed-code `TypeError` and oversized-code byte-array expansion are intentionally not reproduced. The JavaScript codec writes useful fixed-size PICO-8 data and rejects code that would overflow the 16-bit length header or code region instead of silently truncating it.

### Python-only infrastructure

- `BaseFormatter` inheritance, Python exception inheritance, logging streams, temporary-file mechanics, demo scripts, and byte-for-byte `argparse`-generated help/error prose are excluded unless a JavaScript consumer needs their observable behavior. The pure-JavaScript CLI provides the same help/status semantics with concise native wording.

## Completed output parity

Public `parseLua()` exposes the exact vendored Python AST class inventory and class-level metadata, fields, token spans, and token-valued fields. The recursive oracle matches 15 focused programs, all 72 Python-accepted parser-test inputs (33 fully consumed programs and 39 fragment/residual cases), and upstream text-cart fixtures. Token-group layouts and regeneration match on the same corpus. `BaseASTWalker` named handlers, traversal traces, name/number token edits, and custom-handler replacement of names, binary operands, table fields, and `if` blocks match Python across the corpus and carts. The runtime remains pure JavaScript; optional declaration signatures support consumers.

CLI multi-file headings, ordered output/error continuation, unsupported-extension and malformed-cart behavior, parser statuses, `--` termination, value-bearing `--option=value` forms, and help exit semantics are covered against Python. Global and subcommand help are generated in pure JavaScript.

The full upstream command set (`stats`, `listlua`, `listrawlua`, `listtokens`, `writep8`, `luamin`, `luafmt`, `luafind`, `printast`, and `build`) has a pure-JavaScript entry point. Text-cart writer commands match exact Python bytes and notices, including overwrite, formatting, and name preservation; their load/write failure boundary is covered. Fresh and existing text builds match exact Python bytes, successful builds are silent, and invalid output/source/conflict errors match exactly. Build module lookup, section overrides, and useful name-preservation flags cover text and PNG output. Printast matches Python byte-for-byte for text fixtures and matches equivalent decoded PNG carts.

The parity harness currently covers text parsing and section serialization; all Lua writer modes; lexer and parser corpora; diagnostics; builds and includes; `require()` bundling; Pure Lua output; listings and token listings; statistics and compression; cartridge-memory writes; PNG decoding, embedding, writing, round trips, and PNG includes. The Node API also selects `.p8` and `.p8.png` transports by filename through `fromFile()` and `toFile()`, preserves an existing PNG label on overwrite, and reports unsupported extensions with a dedicated error. A Python-shaped `Game` class exposes the section fields, empty-game factory, compressed-size calculation, memory writes, and file methods in both camelCase and compatibility spellings. Public lexer results use Python-shaped token classes with source code, parsed values, positions, mutation, equality, and `matches()` behavior.
