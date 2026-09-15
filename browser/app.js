(function initializeBrowserApp(root) {
  'use strict';

  const output = document.querySelector('#output');
  const fixtureInput = document.querySelector('#fixtures');
  const oracleInput = document.querySelector('#oracle');
  const oracleFileInput = document.querySelector('#oracleFile');
  const runButton = document.querySelector('#run');
  const compareButton = document.querySelector('#compare');
  const copyButton = document.querySelector('#copy');
  let lastReport;
  let lastBundledComparison;

  function conformanceCases() {
    return root.PicotoolParityFixtures.createConformanceCases();
  }

  function decodeBase64(value) {
    const binary = atob(value), bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  async function snapshotFixture(name, type, bytes) {
    if (name.toLowerCase().endsWith('.p8.png')) {
      try {
        const decoded = await root.PicotoolBrowserPng.decodeP8PngBlob(new Blob([bytes], { type }));
        return {
          id: `fixture/${name}`,
          status: 'ok',
          value: root.PicotoolJS.snapshotP8PngPicodata(decoded.picodata, name),
        };
      } catch (error) {
        return { id: `fixture/${name}`, status: 'error', value: String(error) };
      }
    }
    const text = new TextDecoder().decode(bytes);
    return { id: `fixture/${name}`, ...root.PicotoolJS.normalizedResult(() => root.PicotoolJS.snapshotDomainP8(text, name)) };
  }

  async function fixtureCases() {
    const cases = new Map();
    for (const fixture of root.PicotoolBundledFixtures.fixtures) {
      const entry = await snapshotFixture(fixture.name, fixture.type, decodeBase64(fixture.base64));
      cases.set(entry.id, entry);
    }
    for (const file of fixtureInput.files) {
      const entry = await snapshotFixture(file.name, file.type, new Uint8Array(await file.arrayBuffer()));
      cases.set(entry.id, entry);
    }
    return [...cases.values()];
  }

  function formatReport(report) {
    const lines = [
      `picotool-js browser tests: ${report.tests.summary.passed} passed, ${report.tests.summary.failed} failed, ${report.tests.summary.total} total`,
      `parity cases: ${report.parity.cases.length}`,
      lastBundledComparison?.matched
        ? `bundled Python parity: MATCH (${lastBundledComparison.caseCount} cases)`
        : `bundled Python parity: MISMATCH (${lastBundledComparison?.mismatches.join(', ') || 'missing cases'})`,
    ];
    for (const test of report.tests.cases) {
      lines.push(`${test.status === 'pass' ? 'PASS' : 'FAIL'} ${test.id}`);
      if (test.error) lines.push(test.error);
    }
    lines.push('', '--- PICOTOOL PARITY JSON ---', JSON.stringify(report, null, 2));
    return lines.join('\n');
  }

  async function run() {
    runButton.disabled = true;
    try {
      const tests = await root.PicotoolBrowserTests.run();
      lastReport = {
        schema: root.PicotoolJS.REPORT_SCHEMA,
        implementation: 'javascript-browser',
        tests,
        parity: { cases: [...conformanceCases(), ...await fixtureCases()] },
      };
      const bundledIds = new Set(root.PicotoolBundledFixtures.oracle.parity.cases.map((entry) => entry.id));
      const bundledReport = { parity: { cases: lastReport.parity.cases.filter((entry) => bundledIds.has(entry.id)) } };
      lastBundledComparison = root.PicotoolReportUtils.compareParity(bundledReport, root.PicotoolBundledFixtures.oracle);
      output.textContent = formatReport(lastReport);
      document.body.dataset.status = tests.summary.failed || !lastBundledComparison.matched ? 'failed' : 'passed';
    } catch (error) {
      output.textContent = `Unable to run browser tests: ${String(error)}`;
      document.body.dataset.status = 'failed';
    } finally {
      runButton.disabled = false;
    }
  }

  function compare() {
    if (!lastReport) throw new Error('Run the JavaScript suite first.');
    const oracle = root.PicotoolReportUtils.parseOracle(oracleInput.value, root.PicotoolJS.REPORT_SCHEMA);
    const comparison = root.PicotoolReportUtils.compareParity(lastReport, oracle);
    if (comparison.matched) {
      output.textContent = `${formatReport(lastReport)}\n\nPARITY MATCH: JavaScript and Python results are identical across ${comparison.caseCount} cases.`;
      document.body.dataset.status = 'passed';
      return;
    }
    const details = [
      'PARITY MISMATCH',
      comparison.missingFromJavaScript.length ? `missing from JavaScript: ${comparison.missingFromJavaScript.join(', ')}` : '',
      comparison.missingFromPython.length ? `missing from Python: ${comparison.missingFromPython.join(', ')}` : '',
      comparison.mismatches.length ? `different results: ${comparison.mismatches.join(', ')}` : '',
      'Select the same additional fixture files in the browser and Python oracle command.',
    ].filter(Boolean);
    output.textContent = `${formatReport(lastReport)}\n\n${details.join('\n')}`;
    document.body.dataset.status = 'failed';
  }

  async function copyOutput() {
    const value = output.textContent;
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(value);
    } catch {
      const temporary = document.createElement('textarea');
      temporary.value = value;
      temporary.setAttribute('readonly', '');
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      document.body.append(temporary);
      temporary.select();
      document.execCommand('copy');
      temporary.remove();
    }
  }

  runButton.addEventListener('click', () => { void run(); });
  oracleFileInput.addEventListener('change', async () => {
    const [file] = oracleFileInput.files;
    if (!file) return;
    oracleInput.value = await file.text();
  });
  compareButton.addEventListener('click', () => {
    try { compare(); } catch (error) { output.textContent = `Unable to compare reports: ${String(error)}`; }
  });
  copyButton.addEventListener('click', async () => {
    await copyOutput();
    copyButton.textContent = 'Copied';
    setTimeout(() => { copyButton.textContent = 'Copy output'; }, 1200);
  });
  void run();
}(globalThis));
