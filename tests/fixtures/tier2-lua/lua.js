'use strict';

const VALID_LUA_SHORT_LINES = `-- short test
-- by dan
function foo()
  return 999
end`.split('\n').map((line) => `${line}\n`);

module.exports = Object.freeze({ VALID_LUA_SHORT_LINES });
