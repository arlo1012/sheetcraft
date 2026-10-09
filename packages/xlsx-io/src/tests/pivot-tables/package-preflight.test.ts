import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { preflightXlsxArchive } from "../../zip-preflight.js";
import { XlsxCompatibilityError } from "../../types.js";

async function fixture() {
  return unzipSync(
    new Uint8Array(
      await readFile(new URL("./fixtures/closedxml-two-values.xlsx", import.meta.url)),
    ),
  );
}

describe("relationship-reachable pivot package preflight", () => {
  test("does not whitelist orphan pivot-like files by directory or XML root alone", async () => {
    const entries = await fixture();
    entries["unlinked/pivotCacheDefinition.xml"] = entries["pivotCache/pivotCacheDefinition1.xml"]!;
    const report = await preflightXlsxArchive(zipSync(entries));
    expect(report.issues.flatMap((issue) => issue.locations)).toContain(
      "unlinked/pivotCacheDefinition.xml",
    );
    expect(report.issues.flatMap((issue) => issue.locations)).not.toContain(
      "pivotCache/pivotCacheDefinition1.xml",
    );
  });

  test("does not admit a relationship target containing the wrong XML root", async () => {
    const entries = await fixture();
    entries["pivotCache/pivotCacheDefinition1.xml"] = strToU8('<unrelated name="data"/>');
    const report = await preflightXlsxArchive(zipSync(entries));
    expect(report.issues.flatMap((issue) => issue.locations)).toContain(
      "pivotCache/pivotCacheDefinition1.xml",
    );
  });

  test("validates XML safety for native cache parts outside the conventional xl directory", async () => {
    const entries = await fixture();
    entries["pivotCache/pivotCacheDefinition1.xml"] = strToU8(
      '<!DOCTYPE pivotCacheDefinition [<!ENTITY name "unsafe">]><pivotCacheDefinition name="&name;"/>',
    );
    await expect(preflightXlsxArchive(zipSync(entries))).rejects.toBeInstanceOf(
      XlsxCompatibilityError,
    );
  });

  test.each(["https://example.com/cache.xml", "../../../cache.xml"])(
    "rejects unsafe internal pivot target %s",
    async (target) => {
      const entries = await fixture();
      entries["xl/_rels/workbook.xml.rels"] = strToU8(
        strFromU8(entries["xl/_rels/workbook.xml.rels"]!).replace(
          'Target="/pivotCache/pivotCacheDefinition1.xml"',
          `Target="${target}"`,
        ),
      );
      await expect(preflightXlsxArchive(zipSync(entries))).rejects.toBeInstanceOf(
        XlsxCompatibilityError,
      );
    },
  );

  test("blocks external native pivot links when relationship elements have a prefix", async () => {
    const entries = await fixture();
    entries["xl/_rels/workbook.xml.rels"] = strToU8(
      strFromU8(entries["xl/_rels/workbook.xml.rels"]!)
        .replace(/<(\/?)Relationship(s?)(?=[\s>])/g, "<$1p:Relationship$2")
        .replace(
          "<p:Relationships ",
          '<p:Relationships xmlns:p="http://schemas.openxmlformats.org/package/2006/relationships" ',
        )
        .replace(
          'Target="/pivotCache/pivotCacheDefinition1.xml"',
          'Target="https://example.com/cache.xml" TargetMode="External"',
        ),
    );
    try {
      await preflightXlsxArchive(zipSync(entries));
      throw new Error("Expected external pivot link to be rejected.");
    } catch (error) {
      expect(error).toBeInstanceOf(XlsxCompatibilityError);
      expect((error as XlsxCompatibilityError).report.issues).toContainEqual(
        expect.objectContaining({ code: "external-content", severity: "block" }),
      );
    }
  });
});
