import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeWithPrior, parseRows, statusesFor } from "./update-functions.mjs";
import { assertFeatureCatalog, assertFunctionCatalog } from "./validate.mjs";

const directory = resolve(fileURLToPath(new URL(".", import.meta.url)));
const root = resolve(directory, "../../..");
const fixture = await readFile(resolve(directory, "fixtures/alphabetical-sample.html"), "utf8");
const functionCatalog = JSON.parse(
  await readFile(resolve(root, "docs/compatibility/function-inventory.json"), "utf8"),
);
const featureCatalog = JSON.parse(
  await readFile(resolve(root, "docs/compatibility/feature-inventory.json"), "utf8"),
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("importer expands grouped names and normalizes reviewed Microsoft typos", () => {
  const actual = parseRows(fixture);
  assert.deepEqual(
    actual.map((item) => item.name),
    ["ABS", "BETA.INV", "FIND", "FINDB", "VSTACK"],
  );
  assert.equal(actual.find((item) => item.name === "VSTACK").category, "Lookup and reference");
  assert.equal(
    actual.find((item) => item.name === "FIND").sourceUrl,
    "https://support.microsoft.com/en-us/excel/topic/find",
  );
});

test("importer rejects a repeated name with conflicting provenance", () => {
  const conflict = `${fixture}<tr><td><a href="functions/other" data-linktype="relative-path">ABS</a></td><td><strong>Text:</strong> Conflicts</td></tr>`;
  assert.throws(() => parseRows(conflict), /Conflicting Microsoft entries for ABS/);
});

test("importer deduplicates an identical repeated label", () => {
  const repeated = `${fixture}<tr><td><a href="functions/abs-function" data-linktype="relative-path">ABS</a></td><td><strong>Math and trigonometry:</strong> Returns a value</td></tr>`;
  assert.equal(parseRows(repeated).filter((item) => item.name === "ABS").length, 1);
});

test("refresh preserves reviewed scope and statuses and reports catalog deltas", () => {
  const prior = [
    {
      name: "ABS",
      category: "Math and trigonometry",
      sourceUrl: "https://old.example/abs",
      scope: "review",
      evidence: ["project-owned-case-1"],
      statuses: {
        read: "verified",
        render: "planned",
        edit: "planned",
        recalc: "limited",
        write: "planned",
        roundtrip: "planned",
      },
    },
    {
      name: "GONE",
      category: "Text",
      sourceUrl: "https://old.example/gone",
      scope: "local",
      statuses: {},
    },
  ];
  const harvested = parseRows(fixture);
  const result = mergeWithPrior(harvested, prior);
  const abs = result.functions.find((item) => item.name === "ABS");
  assert.equal(abs.scope, "review");
  assert.deepEqual(abs.evidence, ["project-owned-case-1"]);
  assert.equal(abs.statuses.read, "verified");
  assert.ok(result.additions.includes("FIND"));
  assert.deepEqual(result.removals, ["GONE"]);
});

test("external and platform functions default to blocked calculation without verified coverage", () => {
  for (const scope of ["external", "platform"]) {
    const statuses = statusesFor("CUBEVALUE", scope);
    assert.equal(statuses.recalc, "blocked");
    assert.ok(!Object.values(statuses).includes("limited"));
    assert.ok(!Object.values(statuses).includes("verified"));
  }
  for (const item of functionCatalog.functions.filter(
    (entry) => entry.scope === "external" || entry.scope === "platform",
  )) {
    assert.equal(item.statuses.recalc, "blocked", item.name);
    assert.ok(!Object.values(item.statuses).includes("verified"), item.name);
  }
});

test("function catalog validator accepts the committed catalog", () => {
  assert.doesNotThrow(() => assertFunctionCatalog(functionCatalog));
});

test("feature catalog validator accepts the committed catalog", () => {
  assert.doesNotThrow(() => assertFeatureCatalog(featureCatalog));
});

test("validator rejects malformed provenance and schema", () => {
  const malformedUrl = clone(functionCatalog);
  malformedUrl.functions[0].sourceUrl = "ftp://not-allowed.example";
  assert.throws(() => assertFunctionCatalog(malformedUrl), /must use https/);

  const missingCapturedAt = clone(featureCatalog);
  delete missingCapturedAt.source.capturedAt;
  assert.throws(() => assertFeatureCatalog(missingCapturedAt), /source.capturedAt/);

  const invalidSchema = clone(functionCatalog);
  invalidSchema.schemaVersion = 2;
  assert.throws(() => assertFunctionCatalog(invalidSchema), /schemaVersion/);

  const missingDirectionScope = clone(featureCatalog);
  delete missingDirectionScope.directionScope;
  assert.throws(() => assertFeatureCatalog(missingDirectionScope), /directionScope/);
});

test("validator requires exact direction keys and valid statuses", () => {
  const missingDirection = clone(functionCatalog);
  delete missingDirection.functions[0].statuses.roundtrip;
  assert.throws(() => assertFunctionCatalog(missingDirection), /exactly/);

  const extraDirection = clone(featureCatalog);
  extraDirection.features[0].statuses.preview = "planned";
  assert.throws(() => assertFeatureCatalog(extraDirection), /exactly/);

  const invalidStatus = clone(functionCatalog);
  invalidStatus.functions[0].statuses.read = "done";
  assert.throws(() => assertFunctionCatalog(invalidStatus), /invalid read status/);
});

test("validator rejects duplicate identifiers", () => {
  const duplicateFunction = clone(functionCatalog);
  duplicateFunction.functions.push(clone(duplicateFunction.functions[0]));
  assert.throws(() => assertFunctionCatalog(duplicateFunction), /duplicate or missing name/);

  const duplicateFeature = clone(featureCatalog);
  duplicateFeature.features.push(clone(duplicateFeature.features[0]));
  assert.throws(() => assertFeatureCatalog(duplicateFeature), /duplicate or missing id/);
});
