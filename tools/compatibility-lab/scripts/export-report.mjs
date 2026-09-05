import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const reports = join(root, "reports");
const directNames = ["@formulajs/formulajs", "exceljs"];
mkdirSync(reports, { recursive: true });

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
function packageRecord(manifestPath) {
  const manifest = readJson(manifestPath);
  const legacyLicenses = Array.isArray(manifest.licenses)
    ? manifest.licenses.map((item) => item?.type).filter((type) => typeof type === "string")
    : [];
  const license =
    typeof manifest.license === "string"
      ? manifest.license
      : legacyLicenses.join(" OR ") || "UNSPECIFIED";
  const noticeFiles = readdirSync(dirname(manifestPath))
    .filter((name) => /^(?:licen[sc]e|copying|notice)(?:[.-]|$)/i.test(name))
    .filter((name) => statSync(join(dirname(manifestPath), name)).isFile())
    .sort();
  return {
    name: manifest.name,
    version: manifest.version,
    license,
    licenseMetadataSource:
      typeof manifest.license === "string"
        ? "license"
        : legacyLicenses.length
          ? "licenses"
          : "missing",
    noticeFiles,
    path: relative(root, dirname(manifestPath)),
  };
}
function resolvePackage(name, from = join(root, "package.json")) {
  return createRequire(from).resolve(`${name}/package.json`);
}
function resolvedRuntimeTree() {
  const records = new Map();
  const visit = (name, from) => {
    let manifestPath;
    try {
      manifestPath = resolvePackage(name, from);
    } catch (error) {
      return { name, unresolved: true, requestedFrom: relative(root, from), error: String(error) };
    }
    if (records.has(manifestPath)) return records.get(manifestPath);
    const record = packageRecord(manifestPath);
    records.set(manifestPath, record);
    const manifest = readJson(manifestPath);
    record.dependencies = Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    })
      .sort()
      .map((child) => visit(child, manifestPath));
    return record;
  };
  return directNames.map((name) => visit(name, join(root, "package.json")));
}
function installedInventory(nodeModules, records = new Map()) {
  if (!existsSync(nodeModules)) return records;
  for (const entry of readdirSync(nodeModules).filter((name) => name !== ".bin")) {
    const path = join(nodeModules, entry);
    if (entry.startsWith("@")) {
      installedInventory(path, records);
      continue;
    }
    const manifestPath = join(path, "package.json");
    if (!existsSync(manifestPath) || !statSync(path).isDirectory()) continue;
    const record = packageRecord(manifestPath);
    const key = `${record.name}@${record.version}`;
    const previous = records.get(key) ?? { ...record, locations: [] };
    previous.locations.push(record.path);
    records.set(key, previous);
    installedInventory(join(path, "node_modules"), records);
  }
  return records;
}
function artifact(path) {
  if (!existsSync(path)) return { present: false };
  const bytes = readFileSync(path);
  return {
    present: true,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

const testPath = join(reports, "test-results.json");
const bundlePath = join(reports, "browser-worker.bundle.js");
const workerPath = join(reports, "node-worker-smoke.json");
if (!existsSync(testPath) || !existsSync(bundlePath) || !existsSync(workerPath))
  throw new Error("Missing qualification artifacts. Run `bun run qualify`, not `bun run report`.");
const testResults = readJson(testPath);
const testPassed = testResults.numFailedTests === 0 && testResults.success === true;
const workerSmoke = readJson(workerPath);
const workerPassed =
  workerSmoke.runtime === "node-worker" &&
  workerSmoke.formulaSum === 6 &&
  workerSmoke.excelJsWorkbookConstructed === true;
const formulaExports = Object.keys(await import("@formulajs/formulajs")).sort();
const bundle = artifact(bundlePath);
const runtimeTree = resolvedRuntimeTree();
const installed = [...installedInventory(join(root, "node_modules")).values()]
  .map((entry) => ({ ...entry, locations: [...new Set(entry.locations)].sort() }))
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const unspecifiedLicenses = installed
  .filter((entry) => entry.license === "UNSPECIFIED")
  .map((entry) => `${entry.name}@${entry.version}`);
const coverage = [
  {
    id: "F-DIRECT-01",
    status: testPassed ? "observed" : "not-observed",
    evidence:
      "Executed Vitest direct Formula.js representatives (math, criteria, logic, lookup, date, financial, text, and #N/A error object).",
  },
  {
    id: "X-XLSX-01",
    status: testPassed ? "observed" : "not-observed",
    evidence:
      "Executed Vitest synthetic in-memory ExcelJS XLSX write/read probe of selected X1-shaped fields.",
  },
  {
    id: "X-BROWSER-BUNDLE-01",
    status: bundle.present ? "compile-only" : "not-observed",
    evidence:
      "Bun browser-target Worker entry bundle was emitted; no browser or Worker runtime was executed.",
  },
  {
    id: "X-NODE-WORKER-01",
    status: workerPassed ? "observed-node-only" : "not-observed",
    evidence:
      "Executed a Node worker_threads smoke importing Formula.js and ExcelJS; this does not qualify browser Workers.",
  },
];
const gaps = [
  "Direct Formula.js calls do not qualify Excel formula parsing, references, dependency graphs, lazy branches, arrays, volatile functions, or error propagation.",
  "The observed COUNTIF input is case-sensitive (North matched 1 of [North, south, NORTH]); criteria and coercion need Excel-authored vectors before any adapter decision.",
  "Formula.js exposes no supported public date-system switch in this probe, so 1900/1904 global-mode isolation is unobserved and unqualified.",
  "ExcelJS stores the supplied formula result cache but does not calculate formulas; synthetic cache values are imported-cache provenance, not recalculated truth.",
  "No Excel-authored corpus, macros, charts, conditional formats, names, tables, external connections, encryption, malformed-file handling, resource limits, or browser/Worker runtime test is qualified.",
  "Core is deliberately not imported by this standalone lab; no product XLSX adapter or import/export claim follows.",
];
const report = {
  generatedAt: new Date().toISOString(),
  fixture: "synthetic-not-excel-verified",
  node: process.version,
  qualification: {
    status:
      testPassed && bundle.present && workerPassed
        ? "evidence-recorded-not-full-compatibility"
        : "incomplete-artifacts",
    legalClearance: false,
    legalNotice:
      "Dependency metadata is inventory only. UNSPECIFIED licenses and all license obligations require legal review; this report grants no legal clearance.",
  },
  executedArtifacts: {
    vitest: {
      passed: testPassed,
      total: testResults.numTotalTests,
      failed: testResults.numFailedTests,
    },
    browserWorkerBundle: bundle,
    nodeWorkerSmoke: { passed: workerPassed, result: workerSmoke },
  },
  resolvedRuntimeDependencyTree: runtimeTree,
  installedDevelopmentInventory: installed,
  licenseReview: { unspecified: unspecifiedLicenses, notice: "See qualification.legalNotice." },
  formulaJsExportInventory: {
    package: "@formulajs/formulajs@4.6.1",
    exportCount: formulaExports.length,
    exports: formulaExports,
  },
  coverage,
  knownLossyGaps: gaps,
  cachedResultProvenance: {
    fixtureCell: "Synthetic Data!C2",
    formula: "A2+1",
    storedResult: 42,
    provenance:
      "imported-cache-synthetic; ExcelJS did not calculate this formula; not Excel-verified",
  },
};
writeFileSync(join(reports, "qualification-report.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(
  join(reports, "qualification-report.md"),
  [
    "# Formula.js and ExcelJS Qualification Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "This is an isolated synthetic probe report, not a full compatibility, browser-runtime, Excel-verification, or legal-clearance claim.",
    "",
    "## Executed evidence",
    "",
    `- Vitest: ${testPassed ? "passed" : "failed"} (${testResults.numTotalTests} total, ${testResults.numFailedTests} failed).`,
    `- Browser Worker bundle: ${bundle.present ? `emitted (${bundle.bytes} bytes, sha256 ${bundle.sha256})` : "missing"}; compile-only, not runtime-qualified.`,
    `- Node worker smoke: ${workerPassed ? "passed" : "failed"}; Node-only, not browser Worker evidence.`,
    "",
    "## Coverage register",
    "",
    ...coverage.map((entry) => `- ${entry.id}: ${entry.status} - ${entry.evidence}`),
    "",
    "## Dependency and license review",
    "",
    `- Resolved runtime tree roots: ${runtimeTree.map((entry) => `${entry.name}@${entry.version}`).join(", ")}.`,
    `- Installed development inventory: ${installed.length} unique package/version records, including nested node_modules.`,
    `- UNSPECIFIED licenses: ${unspecifiedLicenses.length === 0 ? "none recorded" : unspecifiedLicenses.join(", ")}.`,
    "- License metadata is not legal clearance; review notices and obligations before redistribution.",
    "",
    "## Cached-result provenance",
    "",
    `- ${report.cachedResultProvenance.fixtureCell}: ${report.cachedResultProvenance.provenance}`,
    "",
    "## Known lossy / unqualified gaps",
    "",
    ...gaps.map((gap) => `- ${gap}`),
    "",
    "The JSON report contains the complete observed Formula.js export inventory and resolved dependency records.",
  ].join("\n"),
);
