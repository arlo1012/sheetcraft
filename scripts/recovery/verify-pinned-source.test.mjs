import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const verifier = fileURLToPath(new URL("./verify-pinned-source.mjs", import.meta.url));

function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), "sheetcraft-source-verifier-"));
  try {
    const bytes = Buffer.from([0, 255, 80, 75, 3, 4]);
    writeFileSync(join(root, "fixture.xlsx"), bytes);
    const manifest = {
      commit: "pinned-test-commit",
      files: [
        {
          path: "fixture.xlsx",
          size: bytes.length,
          gitBlobSha: createHash("sha1")
            .update(`blob ${bytes.length}\0`)
            .update(bytes)
            .digest("hex"),
        },
      ],
    };
    fn({ root, manifest });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function run(root, manifest) {
  const path = join(root, "manifest.json");
  writeFileSync(path, JSON.stringify(manifest));
  return spawnSync(process.execPath, [verifier, root, path, join(root, "result.json")], {
    encoding: "utf8",
  });
}

test("verifies raw binary bytes and writes a structured result", () => {
  fixture(({ root, manifest }) => {
    const result = run(root, manifest);
    assert.equal(result.status, 0, result.stderr);
    const saved = JSON.parse(readFileSync(join(root, "result.json"), "utf8"));
    assert.equal(saved.verifiedFiles, 1);
    assert.deepEqual(saved.missing, []);
    assert.deepEqual(saved.mismatches, []);
  });
});

test("reports a missing file without claiming it was verified", () => {
  fixture(({ root, manifest }) => {
    manifest.files[0].path = "missing.xlsx";
    const result = run(root, manifest);
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout).missing, ["missing.xlsx"]);
  });
});

test("reports changed bytes and size without modifying the source", () => {
  fixture(({ root, manifest }) => {
    writeFileSync(join(root, "fixture.xlsx"), "changed");
    const result = run(root, manifest);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).mismatches[0].path, "fixture.xlsx");
    assert.equal(readFileSync(join(root, "fixture.xlsx"), "utf8"), "changed");
  });
});

test("rejects paths outside the selected source root", () => {
  fixture(({ root, manifest }) => {
    manifest.files[0].path = "../outside.xlsx";
    const result = run(root, manifest);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unsafe manifest path/);
  });
});

test("rejects an in-root symlink that resolves outside the source root", () => {
  fixture(({ root, manifest }) => {
    symlinkSync(tmpdir(), join(root, "outside"));
    manifest.files[0].path = "outside";
    const result = run(root, manifest);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unsafe manifest path/);
  });
});
