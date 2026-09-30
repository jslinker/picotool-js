#!/usr/bin/env python3
"""Emit the public upstream API surface used by the parity inventory.

The output is deliberately qualified (module.Class.method) so stateful APIs
cannot be hidden behind a broad module-level disposition.
"""
import ast, json, pathlib, sys

root = pathlib.Path(sys.argv[1])
items = []
for file in sorted((root / 'pico8').rglob('*.py')):
    if file.name == '__init__.py' or any(part.startswith('demo') for part in file.parts):
        continue
    module = '.'.join(file.relative_to(root).with_suffix('').parts)
    tree = ast.parse(file.read_text(encoding='utf-8'), filename=str(file))
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and not node.name.startswith('_'):
            qualified = f'{module}.{node.name}'
            items.append({'kind': 'class' if isinstance(node, ast.ClassDef) else 'function', 'name': qualified})
            if isinstance(node, ast.ClassDef):
                for child in node.body:
                    if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)) and not child.name.startswith('_'):
                        items.append({'kind': 'method', 'name': f'{qualified}.{child.name}'})
                # Parser nodes are often assigned dynamically in the module;
                # include their explicit class declarations through the same path.
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == '_ast_node_types' and isinstance(node.value, (ast.Tuple, ast.List)):
                    for entry in node.value.elts:
                        if isinstance(entry, ast.Tuple) and entry.elts and isinstance(entry.elts[0], ast.Constant):
                            items.append({'kind': 'dynamic-class', 'name': f'{module}.{entry.elts[0].value}'})
    
print(json.dumps({'schema': 'picotool-js/upstream-api/1', 'items': items}, sort_keys=True))
