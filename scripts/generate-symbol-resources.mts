import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readFontCharacterCoverage } from "../apps/web/src/modules/insert-tools/symbols/font-character-coverage.ts";

// Input is the verified, unmodified public font/UCD source directory. Nothing is
// downloaded here, and no system-font or browser-profile files are read.
const input = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Provide the verified Symbol resource directory");
const output = resolve("apps/web/src/modules/insert-tools/symbols/assets");
const fontOutput = resolve("apps/web/src/shared/cell-text/fonts");
const manifest = JSON.parse(await readFile(resolve(input, "source-manifest.json"), "utf8")) as {
  commit: string;
  files: Array<{ path: string; url: string; bytes: number; sha256: string }>;
};
const verified = new Set<string>();
async function source(path: string): Promise<Buffer> {
  const item = manifest.files.find((file) => file.path === path);
  if (!item) throw new Error(`Unverified source: ${path}`);
  const bytes = await readFile(resolve(input, path));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== item.bytes || sha256 !== item.sha256)
    throw new Error(`Resource integrity mismatch: ${path}`);
  verified.add(path);
  return bytes;
}
function records(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split("#")[0]?.trim() ?? "")
    .filter(Boolean)
    .map((line) => line.split(";").map((part) => part.trim()));
}
function limits(value: string): [number, number] {
  const parts = value.split("..");
  const start = Number.parseInt(parts[0]!, 16);
  const end = Number.parseInt(parts[1] ?? parts[0]!, 16);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end > 0x10ffff)
    throw new Error(`Invalid Unicode interval ${value}`);
  return [start, end];
}
type CategoryRange = [number, number, string];
const categories: CategoryRange[] = [];
let first: [number, string] | undefined;
for (const fields of records((await source("ucd-17.0.0/UnicodeData.txt")).toString())) {
  const cp = Number.parseInt(fields[0]!, 16);
  const name = fields[1]!;
  const category = fields[2]!;
  if (name.endsWith(", First>")) {
    if (first) throw new Error("Nested Unicode First interval");
    first = [cp, category];
    continue;
  }
  let start = cp;
  if (name.endsWith(", Last>")) {
    if (!first || first[1] !== category) throw new Error("Unmatched Unicode Last interval");
    start = first[0];
    first = undefined;
  } else if (first) throw new Error("Unclosed Unicode First interval");
  const previous = categories.at(-1);
  if (previous && previous[1] + 1 === start && previous[2] === category) previous[1] = cp;
  else categories.push([start, cp, category]);
}
if (first) throw new Error("Unclosed final Unicode interval");
const blocks = records((await source("ucd-17.0.0/Blocks.txt")).toString()).map((fields) => [
  ...limits(fields[0]!),
  fields[1]!,
]);
const names = records((await source("ucd-17.0.0/extracted/DerivedName.txt")).toString()).map(
  (fields) => [...limits(fields[0]!), fields[1]!],
);
const aliases = records((await source("ucd-17.0.0/NameAliases.txt")).toString()).map((fields) => [
  Number.parseInt(fields[0]!, 16),
  fields[1]!,
  fields[2]!,
]);
await mkdir(output, { recursive: true });
await mkdir(fontOutput, { recursive: true });
await writeFile(
  resolve(output, "unicode-catalog.json"),
  JSON.stringify({ version: "17.0.0", blocks, categories, names, aliases }) + "\n",
);
const coverage = JSON.parse(
  await readFile(resolve(input, "coverage-ranges.json"), "utf8"),
) as Record<string, { family: string; font_sha256: string; ranges: Array<[number, number]> }>;
const fonts = [
  ["noto-sans", "notosans/NotoSans[wdth,wght].ttf", "NotoSans.variable.ttf", "100 900"],
  ["noto-math", "notosansmath/NotoSansMath-Regular.ttf", "NotoSansMath-Regular.ttf", "400"],
  [
    "noto-symbols",
    "notosanssymbols/NotoSansSymbols[wght].ttf",
    "NotoSansSymbols.variable.ttf",
    "100 900",
  ],
  [
    "noto-symbols-2",
    "notosanssymbols2/NotoSansSymbols2-Regular.ttf",
    "NotoSansSymbols2-Regular.ttf",
    "400",
  ],
] as const;
const generatedFonts = [];
for (const [id, original, filename, weight] of fonts) {
  const bytes = await source(original);
  const entry = coverage[original.split("/").at(-1)!];
  if (!entry || createHash("sha256").update(bytes).digest("hex") !== entry.font_sha256)
    throw new Error(`Coverage/font mismatch: ${original}`);
  const parsed = readFontCharacterCoverage(bytes);
  if (
    parsed.status !== "supported" ||
    JSON.stringify(parsed.ranges) !== JSON.stringify(entry.ranges)
  )
    throw new Error(`Independent cmap/coverage mismatch: ${original}`);
  await writeFile(resolve(fontOutput, filename), bytes);
  const directory = original.split("/")[0]!;
  const licensePath = `${directory}/OFL.txt`;
  await writeFile(resolve(fontOutput, `${id}-OFL.txt`), await source(licensePath));
  generatedFonts.push({
    id,
    filename,
    family: entry.family,
    weight,
    sha256: entry.font_sha256,
    ranges: parsed.ranges,
  });
}
await writeFile(resolve(output, "font-coverage.json"), JSON.stringify(generatedFonts) + "\n");
const unicodeLicense = manifest.files.find((file) => file.path === "unicode-LICENSE-v3.txt");
if (!unicodeLicense) throw new Error("Missing verified Unicode license");
await source(unicodeLicense.path);
await copyFile(resolve(input, unicodeLicense.path), resolve(output, "Unicode-LICENSE-v3.txt"));
const provenance = {
  unicodeVersion: "17.0.0",
  fontRepository: "google/fonts",
  fontCommit: manifest.commit,
  sources: manifest.files.filter((file) => verified.has(file.path)),
};
await writeFile(
  resolve(output, "resource-sources.json"),
  JSON.stringify(provenance, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    output,
    blocks: blocks.length,
    categoryRanges: categories.length,
    nameRanges: names.length,
    fonts: generatedFonts.length,
  }),
);
