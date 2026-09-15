'use strict';

const { parseLua, Node } = require('./lua-ast-model');
const { Token } = require('./lua-token');

function scalar(value) {
  if (value instanceof Token) return value.toPythonRepr();
  if (value === null || value === undefined) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value === 'string') return `b'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
  return String(value);
}

function printNode(value, indent = 0, prefix = '', output = []) {
  const pad = ' '.repeat(indent);
  if (value instanceof Node || (value && Array.isArray(value._fields))) {
    output.push(`${pad}${prefix}${value.type || value._name}\n`);
    for (const field of value._fields) printNode(value[field], indent + 2, `* ${field}: `, output);
  } else if (Array.isArray(value)) {
    output.push(`${pad}${prefix}[list:]\n`);
    for (const item of value) printNode(item, indent + 2, '- ', output);
  } else {
    output.push(`${pad}${prefix}${scalar(value)}\n`);
  }
  return output;
}

function printAst(source) { return printNode(parseLua(source)).join(''); }

module.exports = Object.freeze({ printAst, printNode });
