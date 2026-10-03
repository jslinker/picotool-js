'use strict';

function normalize(value) {
  const input = String(value).replace(/\\/g, '/');
  const absolute = input.startsWith('/');
  const parts = [];
  for (const part of input.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length && parts.at(-1) !== '..') parts.pop();
      else if (!absolute) parts.push(part);
    } else parts.push(part);
  }
  const output = `${absolute ? '/' : ''}${parts.join('/')}`;
  return output || (absolute ? '/' : '.');
}

function dirname(value) {
  const normalized = normalize(value);
  if (normalized === '/' || normalized === '.') return normalized;
  const separator = normalized.lastIndexOf('/');
  if (separator < 0) return '.';
  return separator === 0 ? '/' : normalized.slice(0, separator);
}

function join(...values) {
  return normalize(values.filter((value) => value !== '').join('/'));
}

function isAbsolute(value) {
  return String(value).replace(/\\/g, '/').startsWith('/');
}

module.exports = Object.freeze({ dirname, isAbsolute, join, normalize });
