#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const tests = [
  'file-api-test.cjs', 'token-model-test.cjs', 'lua-find-test.cjs',
  'unimplemented-test.cjs', 'ast-walker-test.cjs', 'ast-model-test.cjs',
  'lexer-binary-value-test.cjs', 'lexer-decimal-value-test.cjs',
  'lexer-hex-value-test.cjs', 'unicode-conversion-test.cjs', 'base-section-test.cjs',
  'lexer-simple-parity-test.cjs', 'lexer-string-comment-test.cjs', 'lexer-fixture-parity-test.cjs',
  'game-fixture-parity-test.cjs', 'lua-formatter-parity-test.cjs',
  'lua-source-parity-test.cjs', 'lua-count-parity-test.cjs',
  'build-error-parity-test.cjs', 'game-integration-parity-test.cjs', 'parser-error-parity-test.cjs',
  'include-integration-parity-test.cjs', 'require-error-parity-test.cjs', 'echo-png-parity-test.cjs',
  'build-workflow-parity-test.cjs', 'require-evaluation-parity-test.cjs',
  'tier5-rom-routing-test.cjs',
  'tier4-adapted-behavior-test.cjs',
  'tier4-lexer-parity-test.cjs', 'tier4-include-root-parity-test.cjs',
  'tier4-require-parity-test.cjs', 'tier4-parser-parity-test.cjs',
  'tier4-parser-expressions-test.cjs', 'tier4-parser-functions-test.cjs',
  'tier4-parser-statements-test.cjs', 'tier4-parser-calls-test.cjs',
  'tier4-parser-fragments-test.cjs', 'tier4-parser-failures-test.cjs',
  'parser-fragment-regression-test.cjs',
  'tier4-parser-cursor-test.cjs', 'tier4-parser-chain-test.cjs',
  'minify-every-node-parity-test.cjs', 'game-parser-integration-parity-test.cjs',
];
for (const test of tests) {
  const result = spawnSync(process.execPath, [path.join(__dirname, test)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
