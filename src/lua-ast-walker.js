'use strict';

const { Token } = require('./lua-token');
const ast = require('./lua-ast-model');

/** Python BaseASTWalker-compatible recursive handler dispatch. */
class BaseASTWalker {
  constructor(tokens, root, args = {}) {
    this._tokens = tokens;
    this._root = root;
    this._args = args || {};
  }

  *_walk_token() {}
  *_walk_value() {}

  *_walk(node) {
    if (node && Array.isArray(node._fields) && typeof node.type === 'string') {
      const handler = this[`_walk_${node.type}`] || this._walk_node;
      const result = handler.call(this, node);
      if (result != null) yield* result;
    } else if (node instanceof Token) {
      yield* this._walk_token(node);
    } else if (Array.isArray(node)) {
      for (const item of node) yield* this._walk(item);
    } else {
      yield* this._walk_value(node);
    }
  }

  *_walk_node(node) {
    for (const field of node._fields) yield* this._walk(node[field]);
  }

  *walk() { yield* this._walk(this._root); }
}

// Python installs a default handler for every parser.Node subclass. Keep the
// same override points visible on the prototype, including rarely used nodes.
BaseASTWalker.prototype._walk_Node = BaseASTWalker.prototype._walk_node;
for (const [name, constructor] of Object.entries(ast)) {
  if (typeof constructor === 'function' && constructor.prototype instanceof ast.Node) {
    BaseASTWalker.prototype[`_walk_${name}`] = BaseASTWalker.prototype._walk_node;
  }
}

module.exports = Object.freeze({ BaseASTWalker });
