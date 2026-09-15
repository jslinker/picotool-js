'use strict';

const fixturePaths = Array.from(arguments);
const cases = PicotoolParityFixtures.createConformanceCases();
for (const fixturePath of fixturePaths) {
  const name = fixturePath.split(/[\\/]/).at(-1);
  cases.push({
    id: `fixture/${name}`,
    ...PicotoolJS.normalizedResult(() => PicotoolJS.snapshotDomainP8(readFile(fixturePath), name)),
  });
}

PicotoolBrowserTests.run().then((tests) => print(JSON.stringify({
  schema: PicotoolJS.REPORT_SCHEMA,
  implementation: 'javascript-javascriptcore',
  tests,
  parity: { cases },
}, null, 2)));
