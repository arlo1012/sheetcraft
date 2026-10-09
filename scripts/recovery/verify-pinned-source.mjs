import { createHash } from "node:crypto";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.argv[2] ?? resolve(here, "../.."));
const manifestPath = resolve(
  process.argv[3] ?? resolve(root, "docs/recovery/source-manifest-897addc.json"),
);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const realRoot = await realpath(root);
const result = {
  schemaVersion: 1,
  observedAt: new Date().toISOString(),
  pinnedCommit: manifest.commit,
  expectedFiles: manifest.files.length,
  verifiedFiles: 0,
  missing: [],
  mismatches: [],
};

for (const entry of manifest.files) {
  const path = resolve(root, entry.path);
  const rel = relative(root, path);
  if (isAbsolute(entry.path) || rel === ".." || rel.startsWith("../")) {
    throw new Error(`Unsafe manifest path: ${entry.path}`);
  }
  let bytes;
  try {
    const realFile = await realpath(path);
    const realRelative = relative(realRoot, realFile);
    if (realRelative === ".." || realRelative.startsWith("../")) {
      throw new Error(`Unsafe manifest path: ${entry.path}`);
    }
    const info = await stat(path);
    if (!info.isFile()) throw new Error("Expected a regular file");
    bytes = await readFile(path);
  } catch (error) {
    if (error.code === "ENOENT") {
      result.missing.push(entry.path);
      continue;
    }
    throw error;
  }
  const actual = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  if (actual !== entry.gitBlobSha || bytes.length !== entry.size) {
    result.mismatches.push({
      path: entry.path,
      expectedGitBlobSha: entry.gitBlobSha,
      actualGitBlobSha: actual,
      expectedBytes: entry.size,
      actualBytes: bytes.length,
    });
  } else {
    result.verifiedFiles += 1;
  }
}

if (process.argv[4]) {
  await writeFile(resolve(process.argv[4]), `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify(result, null, 2));
if (result.missing.length || result.mismatches.length) process.exitCode = 1;
