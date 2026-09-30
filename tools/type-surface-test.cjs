'use strict';

// Check actual declaration exports (including aliases and re-exports), rather
// than grepping text or accepting a permissive index signature.
const assert = require('node:assert/strict');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const entries = ['index', 'browser'];
const program = ts.createProgram(entries.map(name => path.join(root, 'src', `${name}.d.ts`)), {
  strict: true, noEmit: true, target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.Node16, moduleResolution: ts.ModuleResolutionKind.Node16,
});
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }));
}
const checker = program.getTypeChecker();
for (const name of entries) {
  const source = program.getSourceFile(path.join(root, 'src', `${name}.d.ts`));
  const moduleSymbol = checker.getSymbolAtLocation(source);
  const declared = checker.getExportsOfModule(moduleSymbol).filter(symbol => {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    return Boolean(target.flags & ts.SymbolFlags.Value);
  }).map(symbol => symbol.name).sort();
  const runtime = Object.keys(require(path.join(root, 'src', `${name}.js`))).sort();
  assert.deepEqual(declared, runtime, `${name}: declaration values must match runtime exports`);
  console.log(`${name}: ${runtime.length} runtime exports match TypeScript declarations`);
}
