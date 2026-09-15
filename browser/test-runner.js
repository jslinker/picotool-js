(function initializeTestRunner(root) {
  'use strict';

  const tests = [];

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
    }
    return value;
  }

  function printable(value) {
    return JSON.stringify(stable(value));
  }

  const assert = Object.freeze({
    equal(actual, expected, message = 'values differ') {
      if (!Object.is(actual, expected)) throw new Error(`${message}\nexpected: ${printable(expected)}\nactual:   ${printable(actual)}`);
    },
    deepEqual(actual, expected, message = 'values differ') {
      if (printable(actual) !== printable(expected)) throw new Error(`${message}\nexpected: ${printable(expected)}\nactual:   ${printable(actual)}`);
    },
    throws(action, expectedCode) {
      try { action(); } catch (error) {
        if (expectedCode === undefined || error?.code === expectedCode) return error;
        throw new Error(`expected error ${expectedCode}, received ${error?.code || error?.name || String(error)}`);
      }
      throw new Error(`expected error ${expectedCode || ''}`.trim());
    },
  });

  function test(id, action) {
    tests.push({ id, action });
  }

  async function run() {
    const cases = [];
    for (const entry of tests) {
      try {
        await entry.action(assert);
        cases.push({ id: entry.id, status: 'pass' });
      } catch (error) {
        const detail = error?.stack || String(error);
        cases.push({ id: entry.id, status: 'fail', error: detail.includes(String(error)) ? detail : `${String(error)}\n${detail}` });
      }
    }
    return {
      summary: {
        passed: cases.filter((entry) => entry.status === 'pass').length,
        failed: cases.filter((entry) => entry.status === 'fail').length,
        total: cases.length,
      },
      cases,
    };
  }

  root.PicotoolBrowserTests = Object.freeze({ assert, run, test });
}(globalThis));
