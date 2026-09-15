#!/usr/bin/env node
'use strict';

const { mainAsync } = require('../src/cli');

mainAsync(process.argv.slice(2)).then((status) => { process.exitCode = status; })
  .catch((error) => { console.error(error); process.exitCode = 1; });
