(function registerTests(root) {
  'use strict';

  const { parseP8 } = root.PicotoolJS;
  const { test } = root.PicotoolBrowserTests;
  const validHeader = 'pico-8 cartridge // http://www.pico-8.com\nversion 4\n';
  const validFooter = [
    '__gfx__', ...Array(128).fill('0'.repeat(128)),
    '__gff__', ...Array(2).fill('0'.repeat(256)),
    '__map__', ...Array(32).fill('0'.repeat(256)),
    '__sfx__', `0001${'0'.repeat(164)}`, ...Array(63).fill(`001${'0'.repeat(165)}`),
    '__music__', ...Array(64).fill('00 41424344'), '', '', '',
  ].join('\n');

  function completeCart(lua = '') {
    return `${validHeader}__lua__\n${lua}${validFooter}`;
  }

  function createConformanceCases() {
    const { normalizedResult, snapshotDomainP8 } = root.PicotoolJS;
    return [
      { id: 'p8/minimal', ...normalizedResult(() => snapshotDomainP8(completeCart(), 'minimal.p8')) },
      { id: 'p8/invalid-title', ...normalizedResult(() => snapshotDomainP8(`INVALID HEADER\nversion 4\n__lua__\n${validFooter}`, 'invalid-title.p8')) },
      { id: 'p8/invalid-version', ...normalizedResult(() => snapshotDomainP8(`pico-8 cartridge // http://www.pico-8.com\nINVALID HEADER\n__lua__\n${validFooter}`, 'invalid-version.p8')) },
      { id: 'p8/invalid-section', ...normalizedResult(() => snapshotDomainP8(`${validHeader}__lua__\n\n__bad__\n\n${validFooter}`, 'invalid-section.p8')) },
    ];
  }

  root.PicotoolParityFixtures = Object.freeze({ completeCart, createConformanceCases, validFooter, validHeader });

  test('pico8.game.game_test.TestP8Game.testFromP8File', ({ equal }) => {
    const cart = parseP8(completeCart());
    equal(cart.version, 4);
    equal(cart.sections.gfx.length, 128);
    equal(cart.sections.gff.length, 2);
    equal(cart.sections.map.length, 32);
    equal(cart.sections.sfx.length, 64);
    equal(cart.sections.music.length, 66);
  });

  test('pico8.game.game_test.TestP8Game.testInvalidP8HeaderLineOne', ({ throws }) => {
    throws(() => parseP8(`INVALID HEADER\nversion 4\n__lua__\n${validFooter}`), 'INVALID_HEADER');
  });

  test('pico8.game.game_test.TestP8Game.testInvalidP8HeaderLineTwo', ({ throws }) => {
    throws(() => parseP8(`pico-8 cartridge // http://www.pico-8.com\nINVALID HEADER\n__lua__\n${validFooter}`), 'INVALID_HEADER');
  });

  test('pico8.game.game_test.TestP8Game.testInvalidP8Section', ({ throws }) => {
    throws(() => parseP8(`${validHeader}__lua__\n\n__bad__\n\n${validFooter}`), 'INVALID_SECTION');
  });

  test('picotool-js.parseP8 accepts byte input and CRLF', ({ deepEqual }) => {
    const source = completeCart('print(1)\n').replace(/\n/g, '\r\n');
    const parsed = parseP8(root.PicotoolJS.encodeUtf8(source));
    deepEqual(parsed.sections.lua, ['print(1)\n']);
  });

  test('picotool-js.parseP8 keeps an empty label section', ({ deepEqual }) => {
    const parsed = parseP8(`${completeCart()}__label__\n`);
    deepEqual(parsed.sectionOrder.at(-1), 'label');
    deepEqual(parsed.sections.label, []);
  });

  test('picotool-js.report.parseOracle accepts surrounding terminal output', ({ equal }) => {
    const value = { schema: root.PicotoolJS.REPORT_SCHEMA, parity: { cases: [] } };
    const parsed = root.PicotoolReportUtils.parseOracle(`command output\n${JSON.stringify(value)}\nshell prompt`, root.PicotoolJS.REPORT_SCHEMA);
    equal(parsed.schema, root.PicotoolJS.REPORT_SCHEMA);
  });

  test('picotool-js.report.parseOracle explains empty input', ({ equal }) => {
    let message = '';
    try { root.PicotoolReportUtils.parseOracle('   ', root.PicotoolJS.REPORT_SCHEMA); }
    catch (error) { message = error.message; }
    equal(message, 'No Python oracle report loaded. Paste its JSON or choose the saved JSON file.');
  });

  test('picotool-js.report.compareParity identifies missing fixture cases', ({ deepEqual }) => {
    const javascriptReport = { parity: { cases: [{ id: 'p8/minimal', status: 'ok' }] } };
    const pythonReport = { parity: { cases: [{ id: 'p8/minimal', status: 'ok' }, { id: 'fixture/extra.p8', status: 'ok' }] } };
    const comparison = root.PicotoolReportUtils.compareParity(javascriptReport, pythonReport);
    deepEqual(comparison.missingFromJavaScript, ['fixture/extra.p8']);
    deepEqual(comparison.missingFromPython, []);
    deepEqual(comparison.mismatches, []);
  });

  test('picotool-js.report.compareParity ignores object key insertion order', ({ deepEqual }) => {
    const javascriptReport = { parity: { cases: [{ id: 'fixture/cart.p8', status: 'ok', value: { name: 'cart.p8', domainMemory: [{ name: 'gfx', byteLength: 8 }] } }] } };
    const pythonReport = { parity: { cases: [{ value: { domainMemory: [{ byteLength: 8, name: 'gfx' }], name: 'cart.p8' }, status: 'ok', id: 'fixture/cart.p8' }] } };
    const comparison = root.PicotoolReportUtils.compareParity(javascriptReport, pythonReport);
    deepEqual(comparison.mismatches, []);
    deepEqual(comparison.matched, true);
  });
}(globalThis));
