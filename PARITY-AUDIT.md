# Parity audit and completion proposal

Audited 2026-09-16 against JavaScript commit `df12d4e` and Python picotool commit `49808e5ddb21e886a5608a19c95ec3ca6f1ee541`. The upstream checkout was clean. Documentation edits from this audit do not change runtime behavior.

## Assessment

The port has strong evidence for output parity on its tested Node workflows. All ten upstream CLI commands have implementations, and the differential suite exercises much more than happy-path cartridge parsing. However, “complete feature/API parity” is not established: the mutable Lua object contract is incomplete, standalone testing is broken by monorepo assumptions, and browser/package integration lacks a release gate.

The next work should focus on these concrete gaps and a reproducible definition of completion, rather than adding more commands or treating existing corpus matches as exhaustive coverage.

## Verification performed

- `npm test`: exit 0 in the existing monorepo environment, Node 26.7.0 and Python 3.9.6. The main harness reported 57 tests passed, 23 cartridge/conformance comparisons matched, 60 section serialization comparisons matched, and no reported differential mismatches. Other component suites run before that harness; 57 is not an aggregate count for all of them.
- AST oracle: 15/15 focused recursive comparisons passed. Of 79 extracted upstream parser inputs, 72 were Python-accepted: 33 complete programs and 39 fragment/residual cases. All 72 matched recursively and in token-group layout. Walker traces, token edits, and selected child replacements also passed.
- `python3 tools/python_suite_report.py`: 271 reported entries, 265 passed, zero assertion failures, six errors. Four build tests call a missing `Game.to_p8_file`; two errors involve missing `png`. One of those is an import failure for the entire `game_test` module, which contains 38 test methods. Thus 271 is a discovery result in this incomplete environment, not the full upstream test inventory. The reporter itself exits successfully even when its JSON says `successful: false`.
- Direct JS/Python probes confirmed the `LuaSource` lifecycle differences below. Direct Node/browser export comparison confirmed the missing browser functions below.
- CLI global/build help and README creation/conversion examples were checked locally. `npm pack --dry-run --json` confirmed a 34-file package containing source, declarations, CLI, license, and README, but no parity/development documents or browser demo.

No actual browser bundle, browser engine matrix, TypeScript consumer compilation, clean installed-tarball test, or PICO-8 execution was performed in this audit. Those remain proposed acceptance checks, not passing results.

## Findings

### P1: Mutable Lua API parity is incomplete

[`LuaSource`](src/game.js) stores bytes and reconstructs `root` on every access. Python's [`Lua`](https://github.com/dansanderson/picotool/blob/49808e5ddb21e886a5608a19c95ec3ca6f1ee541/pico8/lua/lua.py) retains tokens and a parser tree, validates on update, supports writer selection and `reparse()`, and exposes counts/title/byline.

Reproduced differences:

```js
const { Game } = require('./src');
const game = Game.makeEmptyGame();
game.lua.updateFromLines(['x=1\n']);
const root = game.lua.root;
root.stats[0].varlist.vars[0].name.code = 'y';
console.log(game.lua.root === root); // false
console.log(game.lua.toLines().join('')); // x=1, edit was not retained
// Python update_from_lines raises ParserError for this input:
game.lua.updateFromLines(['local =\n']); // accepted by JS until later parsing
```

`LuaSource` also lacks `tokens`, `reparse`, `get_char_count`, `get_token_count`, `get_line_count`, `get_title`, `get_byline`, and writer arguments to `to_lines`. Free functions cover some equivalent computations, but that is not object API compatibility. Existing walker tests establish edits on a standalone AST, not the edit → reparse → Game serialization workflow.

**Proposed fix:** implement a retained token/tree lifecycle and writer-backed serialization with JavaScript aliases, or explicitly limit the parity claim to functional workflows. For full parity, add differential tests for update errors, token/tree mutation, writer selection, reparse, counts, metadata, and saving/reloading the edited game. Map upstream public lexer/parser/writer classes to equivalents or explicit exclusions as part of the same API inventory.

### P1: Complete tests are not reproducible in a standalone clone

The main harness resolves `PICOTOOL_ROOT` or `vendor/picotool`, but [`cli-test.cjs`](tools/cli-test.cjs), [`png-edge-test.cjs`](tools/png-edge-test.cjs), [`ast-oracle-test.cjs`](tools/ast-oracle-test.cjs), and [`ast-walker-oracle-test.cjs`](tools/ast-walker-oracle-test.cjs) hard-code the old `../../vendor/picotool` layout, sometimes relative to the process working directory. Several subprocesses also hard-code `python3`, bypassing `PYTHON`.

The passing local run benefits from the parent repository's oracle and installed dependencies. It does not validate a GitHub clone's setup. There is no checked-in CI workflow, pinned oracle setup script, or declared Node engine range.

**Proposed fix:** one shared path/interpreter resolver, an exact upstream commit pin, reproducible Python dependencies, and clean-checkout CI. Separate JavaScript-only tests from differential tests. Fail CI on an unexpected upstream failure by inspecting report contents; maintain a named expected-failure list for actual upstream defects. Install `pypng` before recording the baseline so the game test module is discovered.

### P2: Browser scope and packaging need an explicit contract

[`src/browser.js`](src/browser.js) omits top-level `writeP8`, `minifyLua`, `formatLuaTokens`, `pureLua`, `cartridgeStats`, `findLua`, and `buildP8`, among other Node exports. It includes `Game`, whose file methods load `file-api.js`, which imports Node filesystem/path modules. A bundler may need to resolve those static dependencies even when consumers do not call the file methods. This risk has not been validated with a real browser bundle in this audit.

The plain HTML test page loads a smaller set of script files; passing its tests under Node does not prove the browser package entry bundles or works. The single declaration file describes Node exports and does not communicate the browser subset. Package contents also omit documents linked relatively from the shipped README.

**Proposed fix:** define a browser-safe export surface, separate filesystem adapters, provide accurate entry-point declarations, and run real bundler/browser smoke tests without Node shims. Verify both text and PNG round trips. Install a packed tarball into an empty consumer project and test CommonJS usage, the CLI binary, declarations, and documentation links. Declare and test supported Node versions and operating systems.

### P2: Corpus coverage is strong but is not a completeness inventory

[`python_oracle.py`](tools/python_oracle.py) extracts selected literal inputs from upstream tests. It does not translate every upstream assertion or dynamic setup. Matching all extracted cases therefore does not establish all parser/lexer state transitions, section boundary operations, public APIs, or combinations of CLI flags.

The public AST and the internal validation/writer parser also live in separate implementations (`lua-ast-model.js` and `lua-parser.js`). Existing comparisons are valuable, but broader generated programs would help expose disagreement between those paths.

**Proposed fix:** map every upstream public behavior and test family to a JS test, a missing implementation, or a justified exclusion. Add deterministic generated differential tests for syntax and malformed inputs, P8SCII bytes, section boundaries/shared map-gfx memory, compression limits, include/module resolution, and CLI option interactions. Minimize discovered failures and retain regression fixtures. Compare errors, stdout/stderr, exit codes, serialized bytes, decoded memory, and persisted AST edits as appropriate.

## Ordered implementation plan and acceptance gates

| Order | Work package | Acceptance gate |
| --- | --- | --- |
| 1 | Reproducible oracle and standalone tests | A fresh clone can install dependencies and run every test with an external or local pinned oracle, including `PYTHON` override, without any parent-repository files. CI rejects baseline drift. |
| 2 | API/behavior inventory and Lua lifecycle | Every upstream public behavior has a tracked disposition; all intended Lua object operations and AST edits survive writer/reparse/file round trips with matching Python results. |
| 3 | Browser, types, and package integration | Installed tarball works in clean consumers; selected Node/OS matrix passes; TypeScript examples compile; browser entry bundles and runs text/PNG cases in actual browsers. |
| 4 | Broader differential regression coverage | Generated valid/invalid inputs and realistic multi-module cartridges run with recorded seeds; no unexplained differences remain, and all found bugs have regression cases. |
| 5 | Release evidence and documentation | Publish oracle revision, environment matrix, test inventory/results, and a reviewed exception list. Update README, PARITY, and DEVELOPMENT together so their claims agree. |

A defensible completion statement is: **parity with a named Python revision for a listed API/CLI surface, with an explicit exception list and passing reproducible release checks**. “All tests pass” alone is not sufficient.

## Keep intentional differences separate from missing work

The exclusions in [PARITY.md](PARITY.md) should stay explicit: unavailable `.rom`/optimization behavior, working replacements for upstream raw-list/search failures, PNG encoding differences, stricter invalid/oversized PNG handling, and Python-specific infrastructure. Build name-preservation flags also intentionally work where the upstream build path ignores them. These do not need to become bug-for-bug compatible to ship, but each difference should have a regression test and a user-visible explanation.

The retained upstream AST-writer newline and loop-stripping failures deserve explicit regression coverage and documentation. Changing those later should be a deliberate compatibility-policy decision, rather than an accidental consequence of closing the missing Lua lifecycle.
