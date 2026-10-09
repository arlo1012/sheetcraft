import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { findPackageJSON } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getFormulaFunctionMetadata } from "@sheetcraft/core/formula";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const reports = join(root, "reports");
const directNames = ["@sheetcraft/core", "@sheetcraft/xlsx-io"];
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
  // Resolve public ESM exports, including workspace packages that do not export package.json.
  const path = findPackageJSON(name, pathToFileURL(from));
  if (!path) throw new Error(`Cannot resolve package metadata: ${name}`);
  return realpathSync(path);
}

function resolvedRuntimeDependencies() {
  const records = new Map();
  const visit = (name, from) => {
    const manifestPath = resolvePackage(name, from);
    if (records.has(manifestPath)) return records.get(manifestPath).path;
    const record = packageRecord(manifestPath);
    records.set(manifestPath, record);
    const manifest = readJson(manifestPath);
    record.dependencies = Object.keys(manifest.dependencies ?? {})
      .sort()
      .map((child) => ({ name: child, path: visit(child, manifestPath) }));
    record.optionalDependencies = Object.keys(manifest.optionalDependencies ?? {})
      .sort()
      .map((child) => {
        try {
          return { name: child, path: visit(child, manifestPath) };
        } catch {
          return { name: child, installed: false };
        }
      });
    return record.path;
  };
  const roots = directNames.map((name) => ({
    name,
    path: visit(name, join(root, "package.json")),
  }));
  return {
    roots,
    packages: [...records.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function artifact(path) {
  if (!existsSync(path)) return { present: false };
  const bytes = readFileSync(path);
  return {
    present: bytes.byteLength > 0,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

const testPath = join(reports, "test-results.json");
const bundlePath = join(reports, "browser-worker.bundle.js");
const workerPath = join(reports, "node-worker-smoke.json");
if (!existsSync(testPath) || !existsSync(bundlePath) || !existsSync(workerPath))
  throw new Error("Missing regression artifacts. Run `bun run qualify`, not `bun run report`.");
const testResults = readJson(testPath);
const testPassed =
  testResults.numTotalTests > 0 && testResults.numFailedTests === 0 && testResults.success === true;
const workerSmoke = readJson(workerPath);
const workerPassed =
  workerSmoke.runtime === "node-worker" &&
  workerSmoke.formulaSum === 6 &&
  workerSmoke.restoredValue === 6 &&
  workerSmoke.xlsxBytes > 0 &&
  workerSmoke.restoredDateSystem === "1904" &&
  workerSmoke.restoredFormula?.kind === "formula" &&
  workerSmoke.restoredFormula.formula?.source === "=SUM(1,2,3)" &&
  workerSmoke.cacheDiscarded === true;
const functions = getFormulaFunctionMetadata();
const bundle = artifact(bundlePath);
const runtimeDependencies = resolvedRuntimeDependencies();
const developmentTools = Object.keys(readJson(join(root, "package.json")).devDependencies)
  .filter((name) => !directNames.includes(name))
  .sort()
  .map((name) => packageRecord(resolvePackage(name)));
const unspecifiedLicenses = [...runtimeDependencies.packages, ...developmentTools]
  .filter((entry) => entry.license === "UNSPECIFIED")
  .map((entry) => `${entry.name}@${entry.version}`);
const coverage = [
  {
    id: "F-CORE-01",
    status: testPassed ? "regression-observed" : "not-observed",
    evidence:
      "Public Core parsing/evaluation probes cover arithmetic, criteria, ranges, lazy branches, lookup, serial dates with per-call date-system isolation, financial/text functions, and typed errors.",
  },
  {
    id: "X-XLSX-01",
    status: testPassed ? "regression-observed" : "not-observed",
    evidence:
      "Public XLSX encode/decode probes roundtrip synthetic values, formula source, date system, number format, style, dimensions, filter, frozen panes and merges; verify cache discard, recalculation, invalid archive rejection and cancellation.",
  },
  {
    id: "X-BROWSER-BUNDLE-01",
    status: bundle.present ? "compile-only" : "not-observed",
    evidence:
      "A Bun browser-target Worker bundle containing public Core/XLSX roundtrip code was emitted; this lab does not execute a browser Worker.",
  },
  {
    id: "X-NODE-WORKER-01",
    status: workerPassed ? "observed-node-only" : "not-observed",
    evidence:
      "A Node worker_threads smoke evaluated a formula and encoded/decoded a workbook through public package outputs; this does not qualify browser Workers.",
  },
];
const gaps = [
  "All vectors and workbook data are synthetic; no Excel-authored oracle, external application or full Excel-compatibility comparison was executed.",
  "The function metadata inventory records implemented registry names, not verified compatibility or exhaustive per-function coverage.",
  "Representative parsing, criteria and date assertions document Core semantics; they are not evidence that every Excel coercion or date edge case matches.",
  "Successful synthetic roundtrips do not prove fidelity for macros, charts, external connections, encryption or every unsupported OOXML part.",
  "Invalid archive and pre-aborted input probes do not exhaust malformed-file handling, cancellation timing or resource limits.",
  "Browser bundling is compile-only; use the repository's separate runtime and package verification gates for their additional evidence.",
];
const passed = testPassed && bundle.present && workerPassed;
const report = {
  generatedAt: new Date().toISOString(),
  fixture: "synthetic-not-excel-verified",
  node: process.version,
  qualification: {
    status: passed ? "regression-evidence-recorded-not-full-compatibility" : "incomplete-artifacts",
    legalClearance: false,
    legalNotice:
      "Dependency metadata is inventory only. Missing declarations and all redistribution obligations require review; this report grants no legal clearance.",
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
  resolvedRuntimeDependencies: runtimeDependencies,
  declaredDevelopmentToolInventory: developmentTools,
  licenseReview: { unspecified: unspecifiedLicenses, notice: "See qualification.legalNotice." },
  coreFunctionInventory: {
    package: "@sheetcraft/core",
    functionCount: functions.length,
    functions,
  },
  coverage,
  knownUnqualifiedGaps: gaps,
  cachedResultProvenance: {
    fixtureCell: "Synthetic Data!C2",
    formula: "=A2+1",
    recalculatedResult: 42,
    afterInputEdit: 43,
    provenance:
      "Core-calculated synthetic formula; encoder creates an eligible cache, decoder discards imported cache, and Core recalculates from restored source. Not Excel-verified.",
  },
};
writeFileSync(join(reports, "qualification-report.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(
  join(reports, "qualification-report.md"),
  [
    "# First-party Formula and XLSX Regression Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "This is public-package synthetic regression evidence, not full compatibility, browser-runtime, Excel-verification, or legal clearance.",
    "",
    "## Executed evidence",
    "",
    `- Vitest: ${testPassed ? "passed" : "failed"} (${testResults.numTotalTests} total, ${testResults.numFailedTests} failed).`,
    `- Browser Worker bundle: ${bundle.present ? `emitted (${bundle.bytes} bytes, sha256 ${bundle.sha256})` : "missing"}; compile-only, not runtime-qualified.`,
    `- Node worker evaluation and XLSX roundtrip: ${workerPassed ? "passed" : "failed"}; Node-only.`,
    `- Core registry: ${functions.length} function metadata entries; not an Excel-verified function count.`,
    "",
    "## Coverage register",
    "",
    ...coverage.map((entry) => `- ${entry.id}: ${entry.status} - ${entry.evidence}`),
    "",
    "## Dependency and license review",
    "",
    `- Runtime roots: ${directNames.join(", ")}; ${runtimeDependencies.packages.length} resolved package records.`,
    `- Development inventory: ${developmentTools.length} declared lab tools, excluding their transitive dependencies and unrelated root tools.`,
    `- UNSPECIFIED licenses: ${unspecifiedLicenses.length === 0 ? "none recorded" : unspecifiedLicenses.join(", ")}.`,
    "- License metadata is not legal clearance; review notices and obligations before redistribution.",
    "",
    "## Cached-result provenance",
    "",
    `- ${report.cachedResultProvenance.fixtureCell}: ${report.cachedResultProvenance.provenance}`,
    "",
    "## Unqualified gaps",
    "",
    ...gaps.map((gap) => `- ${gap}`),
    "",
    "The JSON report includes Core function metadata and the resolved runtime dependency graph.",
    "",
  ].join("\n"),
);
if (!passed) throw new Error("Regression evidence is incomplete; inspect the generated report.");
