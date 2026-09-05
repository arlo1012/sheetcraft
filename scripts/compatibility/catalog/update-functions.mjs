#!/usr/bin/env node

/**
 * Controlled, manual catalog refresher. This script is intentionally never
 * invoked by CI: the committed JSON is the reviewable source snapshot.
 *
 * Usage: node scripts/compatibility/catalog/update-functions.mjs --write
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertFunctionCatalog } from "./validate.mjs";

const alphabeticalUrl = "https://support.microsoft.com/en-us/excel/excel-functions-alphabetical";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootDirectory = resolve(scriptDirectory, "../../..");
const outputPath = resolve(rootDirectory, "docs/compatibility/function-inventory.json");

const platformNames = new Set(["CALL", "EUROCONVERT", "REGISTER.ID", "RTD"]);
const externalNames = new Set([
  "CUBEKPIMEMBER",
  "CUBEMEMBER",
  "CUBEMEMBERPROPERTY",
  "CUBERANKEDMEMBER",
  "CUBESET",
  "CUBESETCOUNT",
  "CUBEVALUE",
  "STOCKHISTORY",
  "WEBSERVICE",
]);
const reviewNames = new Set(["DETECTLANGUAGE", "FILTERXML", "TRANSLATE"]);
// The current Microsoft alphabetical page renders the BETA.INV label with a
// trailing "n". Keep the documented function identifier rather than copying
// that presentation typo into the machine-readable catalog.
const canonicalNames = new Map([["BETA.INVN", "BETA.INV"]]);
const canonicalCategories = new Map([["Look and reference", "Lookup and reference"]]);

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scopeFor(name, category) {
  if (platformNames.has(name) || category === "Add-in and Automation") return "platform";
  if (externalNames.has(name) || category === "Cube") return "external";
  if (reviewNames.has(name) || category === "Web") return "review";
  return "local";
}

export function statusesFor(name, scope) {
  if (name === "SUM") {
    return {
      read: "planned",
      render: "planned",
      edit: "limited",
      recalc: "limited",
      write: "planned",
      roundtrip: "planned",
    };
  }
  if (scope === "external" || scope === "platform") {
    return {
      read: "planned",
      render: "planned",
      edit: "planned",
      recalc: "blocked",
      write: "planned",
      roundtrip: "planned",
    };
  }
  return {
    read: "planned",
    render: "planned",
    edit: "planned",
    recalc: "planned",
    write: "planned",
    roundtrip: "planned",
  };
}

function namesFromLabel(label) {
  return decodeHtml(label)
    .split(",")
    .map((name) => canonicalNames.get(name.trim().toUpperCase()) ?? name.trim().toUpperCase())
    .filter((name) => /^[A-Z][A-Z0-9.]*(?:\.[A-Z0-9]+)*$/.test(name));
}

export function parseRows(html) {
  const inventory = new Map();
  const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
  for (const row of rows) {
    const cells = row.match(/<td>[\s\S]*?<\/td>/g) ?? [];
    if (cells.length !== 2) continue;
    const anchor = cells[0].match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const categoryLabel = cells[1].match(/<strong>([^:<]+):<\/strong>/)?.[1];
    if (!anchor || !categoryLabel) continue;
    const category =
      canonicalCategories.get(decodeHtml(categoryLabel)) ?? decodeHtml(categoryLabel);
    const sourceUrl = new URL(anchor[1], alphabeticalUrl).toString();
    for (const name of namesFromLabel(anchor[2])) {
      const next = { name, category, sourceUrl, scope: scopeFor(name, category) };
      const previous = inventory.get(name);
      if (
        previous &&
        (previous.category !== next.category || previous.sourceUrl !== next.sourceUrl)
      ) {
        throw new Error(`Conflicting Microsoft entries for ${name}`);
      }
      inventory.set(name, { ...next, statuses: statusesFor(name, next.scope) });
    }
  }
  return [...inventory.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function mergeWithPrior(harvestedFunctions, priorFunctions) {
  const priorByName = new Map(priorFunctions.map((item) => [item.name, item]));
  const harvestedNames = new Set(harvestedFunctions.map((item) => item.name));
  const additions = harvestedFunctions
    .filter((item) => !priorByName.has(item.name))
    .map((item) => item.name);
  const removals = priorFunctions
    .filter((item) => !harvestedNames.has(item.name))
    .map((item) => item.name);
  const functions = harvestedFunctions.map((item) => {
    const existing = priorByName.get(item.name);
    // Scope and verification status are project decisions. A source refresh must
    // never silently demote, promote, or reclassify an already reviewed entry.
    return existing
      ? { ...existing, ...item, scope: existing.scope, statuses: existing.statuses }
      : item;
  });
  return { functions, additions, removals };
}

async function main() {
  if (!process.argv.includes("--write")) {
    throw new Error("Refusing network update without --write. This script is not for CI.");
  }
  const response = await fetch(alphabeticalUrl, {
    headers: { "user-agent": "idea10-catalog-updater/1.0" },
  });
  if (!response.ok) throw new Error(`Microsoft catalog request failed: ${response.status}`);
  const harvestedFunctions = parseRows(await response.text());
  if (harvestedFunctions.length < 400)
    throw new Error(`Refusing suspiciously small catalog: ${harvestedFunctions.length}`);
  const prior = JSON.parse(await readFile(outputPath, "utf8"));
  const { functions, additions, removals } = mergeWithPrior(harvestedFunctions, prior.functions);
  const document = {
    ...prior,
    capturedAt: new Date().toISOString(),
    source: { ...prior.source, capturedAt: new Date().toISOString(), alphabeticalUrl },
    functions,
  };
  assertFunctionCatalog(document);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`);
  console.log(`Wrote ${functions.length} unique functions to ${outputPath}`);
  console.log(`Catalog changes: ${additions.length} added, ${removals.length} removed`);
  if (additions.length) console.log(`Added: ${additions.join(", ")}`);
  if (removals.length) console.log(`Removed: ${removals.join(", ")}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
