(function registerBundledFixtureTests(root) {
  'use strict';

  const { test } = root.PicotoolBrowserTests;

  test('picotool-js.browser includes the complete upstream fixture bundle', ({ deepEqual, equal }) => {
    const bundle = root.PicotoolBundledFixtures;
    const names = bundle.fixtures.map((fixture) => fixture.name);
    deepEqual(names, [
      'empty.p8',
      'empty.p8.png',
      'memorymap.p8.png',
      'onechar.p8.png',
      'test_cart.p8',
      'test_cart.p8.png',
      'test_cart_memdump.p8',
      'test_cart_memdump.p8.png',
      'test_cart_with_label.p8',
      'test_gol.p8',
      'test_gol.p8.png',
    ]);
    equal(bundle.oracle.schema, root.PicotoolJS.REPORT_SCHEMA);
    equal(bundle.oracle.parity.cases.length, names.length + 4);
    deepEqual(bundle.oracle.parity.cases.slice(4).map((entry) => entry.id), names.map((name) => `fixture/${name}`));
  });
}(globalThis));
