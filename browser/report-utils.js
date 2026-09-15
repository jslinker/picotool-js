(function initializeReportUtilities(root) {
  'use strict';

  function parseOracle(value, schema) {
    const text = value.trim();
    if (!text) throw new Error('No Python oracle report loaded. Paste its JSON or choose the saved JSON file.');
    let report;
    try {
      report = JSON.parse(text);
    } catch (initialError) {
      const start = text.indexOf('{'), end = text.lastIndexOf('}');
      if (start < 0 || end <= start) throw new Error('The Python oracle output is incomplete; it must include the complete JSON object.');
      try { report = JSON.parse(text.slice(start, end + 1)); }
      catch { throw new Error(`The Python oracle output is not complete valid JSON: ${initialError.message}`); }
    }
    if (report.schema !== schema || !Array.isArray(report.parity?.cases)) {
      throw new Error(`Expected a ${schema} oracle report from python_oracle.py.`);
    }
    return report;
  }

  function compareParity(javascriptReport, pythonReport) {
    const javascriptCases = new Map(javascriptReport.parity.cases.map((entry) => [entry.id, entry]));
    const pythonCases = new Map(pythonReport.parity.cases.map((entry) => [entry.id, entry]));
    const identifiers = [...new Set([...javascriptCases.keys(), ...pythonCases.keys()])].sort();
    const missingFromJavaScript = identifiers.filter((id) => !javascriptCases.has(id));
    const missingFromPython = identifiers.filter((id) => !pythonCases.has(id));
    const stable = (value) => {
      if (Array.isArray(value)) return value.map(stable);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
      }
      return value;
    };
    const mismatches = identifiers.filter((id) => javascriptCases.has(id) && pythonCases.has(id)
      && JSON.stringify(stable(javascriptCases.get(id))) !== JSON.stringify(stable(pythonCases.get(id))));
    return {
      matched: !missingFromJavaScript.length && !missingFromPython.length && !mismatches.length,
      caseCount: identifiers.length,
      missingFromJavaScript,
      missingFromPython,
      mismatches,
    };
  }

  root.PicotoolReportUtils = Object.freeze({ compareParity, parseOracle });
}(globalThis));
