# Upstream test catalog

All 308 upstream IDs remain tracked. Deferred features are open contribution opportunities, not passing tests. See [the mapping policy](README.md).

| Python test file | Named JS mappings | Active TODOs | Deferred feature TODOs |
| --- | ---: | ---: | ---: |
| `tests/pico8/build/build_test.py` | 30 | 0 | 0 |
| `tests/pico8/game/game_test.py` | 38 | 0 | 0 |
| `tests/pico8/gff/gff_test.py` | 4 | 0 | 0 |
| `tests/pico8/gfx/gfx_test.py` | 13 | 0 | 0 |
| `tests/pico8/lua/count_test.py` | 2 | 0 | 0 |
| `tests/pico8/lua/lexer_test.py` | 46 | 0 | 0 |
| `tests/pico8/lua/lua_test.py` | 41 | 0 | 1 |
| `tests/pico8/lua/parser_test.py` | 99 | 0 | 0 |
| `tests/pico8/map/map_test.py` | 8 | 0 | 0 |
| `tests/pico8/music/music_test.py` | 6 | 0 | 0 |
| `tests/pico8/sfx/sfx_test.py` | 10 | 0 | 0 |
| `tests/pico8/util_test.py` | 4 | 0 | 6 |
| **Total** | **301** | **0** | **7** |

## Deferred features

- [`tests.pico8.lua.lua_test.TestLua.testBaseLuaWriterNotYetImplemented`](../../tools/lua-source-parity-test.cjs#L63) — Maintainer does not need custom writer subclasses for the current project. JS concrete writer functions have no Python BaseLuaWriter extension lifecycle. Open to contributions implementing the interface and testing both a working custom writer and abstract-method rejection.
- [`tests.pico8.util_test.TestUtil.testDebug`](../../tools/base-section-test.cjs#L54) — Maintainer chose not to add a shared logging/verbosity API for the current project. JS uses caller-supplied output callbacks rather than Python global verbosity and mutable streams. Contributions implementing an isolated logger and the original output/filtering contracts are welcome; CLI coverage is not equivalent.
- [`tests.pico8.util_test.TestUtil.testDebugVerbose`](../../tools/base-section-test.cjs#L56) — Maintainer chose not to add a shared logging/verbosity API for the current project. JS uses caller-supplied output callbacks rather than Python global verbosity and mutable streams. Contributions implementing an isolated logger and the original output/filtering contracts are welcome; CLI coverage is not equivalent.
- [`tests.pico8.util_test.TestUtil.testError`](../../tools/base-section-test.cjs#L50) — Maintainer chose not to add a shared logging/verbosity API for the current project. JS uses caller-supplied output callbacks rather than Python global verbosity and mutable streams. Contributions implementing an isolated logger and the original output/filtering contracts are welcome; CLI coverage is not equivalent.
- [`tests.pico8.util_test.TestUtil.testErrorQuiet`](../../tools/base-section-test.cjs#L52) — Maintainer chose not to add a shared logging/verbosity API for the current project. JS uses caller-supplied output callbacks rather than Python global verbosity and mutable streams. Contributions implementing an isolated logger and the original output/filtering contracts are welcome; CLI coverage is not equivalent.
- [`tests.pico8.util_test.TestUtil.testWrite`](../../tools/base-section-test.cjs#L46) — Maintainer chose not to add a shared logging/verbosity API for the current project. JS uses caller-supplied output callbacks rather than Python global verbosity and mutable streams. Contributions implementing an isolated logger and the original output/filtering contracts are welcome; CLI coverage is not equivalent.
- [`tests.pico8.util_test.TestUtil.testWriteQuiet`](../../tools/base-section-test.cjs#L48) — Maintainer chose not to add a shared logging/verbosity API for the current project. JS uses caller-supplied output callbacks rather than Python global verbosity and mutable streams. Contributions implementing an isolated logger and the original output/filtering contracts are welcome; CLI coverage is not equivalent.
