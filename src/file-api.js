'use strict';

const { readFile, writeFile, rename, unlink } = require('node:fs/promises');
const { dirname, basename, join } = require('node:path');
const portable = require('./cartridge-io');

async function fromFile(filename) {
  portable.formatForFilename(filename);
  return portable.fromBytes(await readFile(filename), filename);
}

async function labelBytesFor(filename, options) {
  if (options.labelPng !== undefined) return options.labelPng;
  if (options.labelFilename !== undefined) return readFile(options.labelFilename);
  try { return await readFile(filename); } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return portable.emptyLabelPng();
  }
}

async function toFile(cartridge, filename, options = {}) {
  // Produce all output before replacing the destination, so an input PNG can
  // safely provide its own visible label and failed writes leave it intact.
  const output = await portable.toBytes(cartridge, filename, {
    ...options,
    labelPng: await labelBytesFor(filename, options),
  });
  const temporary = join(dirname(filename), `.${basename(filename)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await writeFile(temporary, output);
    await rename(temporary, filename);
  } catch (error) {
    try { await unlink(temporary); } catch {}
    throw error;
  }
}

module.exports = Object.freeze({ ...portable, fromFile, toFile });
