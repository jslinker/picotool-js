# Upstream test coverage

The catalog tracks all 308 test methods at Python revision `49808e5ddb21e886a5608a19c95ec3ca6f1ee541`: **301 named JS mappings and seven deferred feature TODOs**. No active test-porting backlog remains.

- [CATALOG.md](CATALOG.md) summarizes coverage and links to the deferred features.
- [catalog.json](catalog.json) records each upstream source and JS registration.
- `npm run test:catalog` validates completeness, registration locations, and required annotations.
- `npm run test:js` runs the behavioral tests, including the seven visible feature TODOs.

## What the mappings establish

A `named-js-port` identifies an upstream-named JS test, not proof of exact assertion equivalence. The original 49 pre-existing mappings still need assertion-level review. Differential coverage supplies additional evidence but does not remove that caveat.

API adaptations are documented beside the tests. These include batch tokenization instead of a streaming lexer, asynchronous file APIs, JS format identifiers, and parser node/cursor adapters. Two entries explicitly carry `coverageRelationship: adapted-behavior` and coverage limits:

- `TestLua.testInit` checks public `LuaSource.version`, not private versioned lexer/parser instances or version-specific grammar.
- `TestPrependPackageLua.testEmptyPackageLua` checks unchanged source bytes, not identity of the Python Lua object.

## Deferred features and contributions

One custom-writer test and six shared logging/verbosity tests use `deferred-feature`. The maintainer does not need these APIs for the current project. Their TODO registrations live beside the regular [writer tests](../../tools/lua-source-parity-test.cjs) and [utility tests](../../tools/base-section-test.cjs), with intended behavior and contribution guidance. They are not passing mappings. See [the catalog](CATALOG.md) for each rationale.

## Upstream fixture defects

Four `TestDoBuild` tests call the absent Python `Game.to_p8_file` during fixture setup: `testBuildEmptiesSection`, `testBuildLuaFromLuaFile`, `testBuildLuaFromP8`, and `testBuildOverwritesExisting`. The pinned baseline therefore reports 304 passes and four setup errors, before those build assertions execute. See [the baseline](../../tools/python-suite-baseline.json).

Their JS ports use supported fixture-save APIs and test the intended build behavior. Catalog entries retain `outdated-save-api` annotations. Do not reproduce the Python AttributeError or count it as behavioral coverage. Keep the pinned baseline intact and identify repaired Python reference runs as adaptations.

## Maintaining the catalog

When changing tests, update their catalog file/line locations and run `npm run test:catalog`. Preserve every upstream ID. Deferred entries require a rationale and a real `test.todo` registration; adapted behavior entries require their rationale and coverage limits. When implementing a deferred feature, replace its TODO with assertions, update its status, and refresh the summary counts.
