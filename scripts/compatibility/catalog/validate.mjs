#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const functionPath = resolve(rootDirectory, "docs/compatibility/function-inventory.json");
const featurePath = resolve(rootDirectory, "docs/compatibility/feature-inventory.json");
const statuses = new Set(["planned", "limited", "verified", "preserve", "blocked", "n/a"]);
const scopes = new Set(["local", "external", "platform", "review"]);
const directions = ["read", "render", "edit", "recalc", "write", "roundtrip"];

function fail(message) {
  throw new Error(message);
}

function assertStatuses(item, label) {
  if (!item.statuses || typeof item.statuses !== "object") fail(`${label}: missing statuses`);
  const keys = Object.keys(item.statuses).sort();
  if (keys.join(",") !== [...directions].sort().join(","))
    fail(`${label}: statuses must contain exactly ${directions.join(", ")}`);
  for (const direction of directions) {
    if (!statuses.has(item.statuses[direction]))
      fail(`${label}: invalid ${direction} status ${item.statuses[direction]}`);
  }
}

function assertUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label}: invalid URL`);
  }
  if (url.protocol !== "https:") fail(`${label}: must use https`);
}

function assertUnique(items, key, label) {
  const seen = new Set();
  for (const item of items) {
    if (!item[key] || seen.has(item[key]))
      fail(`${label}: duplicate or missing ${key}: ${item[key]}`);
    seen.add(item[key]);
  }
}

export function assertFunctionCatalog(document) {
  if (document.schemaVersion !== 1) fail("function catalog: unsupported schemaVersion");
  if (!document.directionScope || typeof document.directionScope !== "string") {
    fail("function catalog: missing directionScope");
  }
  if (!document.capturedAt || Number.isNaN(Date.parse(document.capturedAt)))
    fail("function catalog: invalid capturedAt");
  if (!document.source?.capturedAt || Number.isNaN(Date.parse(document.source.capturedAt)))
    fail("function catalog: invalid source.capturedAt");
  assertUrl(document.source?.alphabeticalUrl, "function catalog source.alphabeticalUrl");
  assertUrl(document.source?.categoryUrl, "function catalog source.categoryUrl");
  if (!Array.isArray(document.functions) || document.functions.length < 400)
    fail("function catalog: expected at least 400 functions");
  assertUnique(document.functions, "name", "function catalog");
  for (const item of document.functions) {
    if (!/^[A-Z][A-Z0-9.]*(?:\.[A-Z0-9]+)*$/.test(item.name))
      fail(`function catalog: invalid name ${item.name}`);
    if (!item.category || typeof item.category !== "string")
      fail(`function ${item.name}: missing category`);
    assertUrl(item.sourceUrl, `function ${item.name} sourceUrl`);
    if (!scopes.has(item.scope)) fail(`function ${item.name}: invalid scope ${item.scope}`);
    assertStatuses(item, `function ${item.name}`);
  }
}

export function assertFeatureCatalog(document) {
  if (document.schemaVersion !== 1) fail("feature catalog: unsupported schemaVersion");
  if (!document.directionScope || typeof document.directionScope !== "string") {
    fail("feature catalog: missing directionScope");
  }
  if (!document.capturedAt || Number.isNaN(Date.parse(document.capturedAt)))
    fail("feature catalog: invalid capturedAt");
  if (!document.source?.capturedAt || Number.isNaN(Date.parse(document.source.capturedAt)))
    fail("feature catalog: invalid source.capturedAt");
  if (!Array.isArray(document.source.primaryUrls) || document.source.primaryUrls.length === 0)
    fail("feature catalog: missing source.primaryUrls");
  document.source.primaryUrls.forEach((url, index) =>
    assertUrl(url, `feature catalog source.primaryUrls[${index}]`),
  );
  if (!Array.isArray(document.features) || document.features.length < 30)
    fail("feature catalog: expected at least 30 features");
  assertUnique(document.features, "id", "feature catalog");
  for (const item of document.features) {
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(item.id))
      fail(`feature catalog: invalid id ${item.id}`);
    if (!item.title || !scopes.has(item.scope))
      fail(`feature ${item.id}: missing title or invalid scope`);
    if (!Array.isArray(item.sourceUrls) || item.sourceUrls.length === 0)
      fail(`feature ${item.id}: missing sourceUrls`);
    item.sourceUrls.forEach((url, index) =>
      assertUrl(url, `feature ${item.id} sourceUrls[${index}]`),
    );
    assertStatuses(item, `feature ${item.id}`);
  }
}

export function validateCatalogDocuments(functionDocument, featureDocument) {
  assertFunctionCatalog(functionDocument);
  assertFeatureCatalog(featureDocument);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [functionDocument, featureDocument] = await Promise.all([
    readFile(functionPath, "utf8").then(JSON.parse),
    readFile(featurePath, "utf8").then(JSON.parse),
  ]);
  validateCatalogDocuments(functionDocument, featureDocument);
  console.log(
    `Catalog validation passed: ${functionDocument.functions.length} functions, ${featureDocument.features.length} features.`,
  );
}
