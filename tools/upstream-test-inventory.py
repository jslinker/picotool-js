#!/usr/bin/env python3
"""List every upstream test file and class-qualified test method without importing it."""
import ast
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1]).resolve()
files = []
for file in sorted((root / 'tests').rglob('*_test.py')):
    tree = ast.parse(file.read_text(encoding='utf-8'), filename=str(file))
    tests = []
    for cls in tree.body:
        if isinstance(cls, ast.ClassDef):
            tests.extend(f'{cls.name}.{method.name}' for method in cls.body
                         if isinstance(method, (ast.FunctionDef, ast.AsyncFunctionDef))
                         and method.name.startswith('test'))
    files.append({'file': file.relative_to(root).as_posix(), 'methods': sorted(tests)})
print(json.dumps(files, indent=2))
