import { deflateRawSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { XlsxAbortError, XlsxCompatibilityError } from "../index.js";
import { preflightXlsxArchive } from "../zip-preflight.js";

function storedZip(
  entries: readonly {
    name: string;
    content: string | Uint8Array;
    compression?: 0 | 8;
    declaredSize?: number;
  }[],
): Uint8Array {
  const encoded = entries.map((entry) => ({
    ...entry,
    nameBytes: new TextEncoder().encode(entry.name),
    bytes:
      typeof entry.content === "string" ? new TextEncoder().encode(entry.content) : entry.content,
    compression: entry.compression ?? 0,
  }));
  const compressed = encoded.map((entry) => ({
    ...entry,
    payload: entry.compression === 8 ? new Uint8Array(deflateRawSync(entry.bytes)) : entry.bytes,
  }));
  const localSize = compressed.reduce(
    (size, entry) => size + 30 + entry.nameBytes.length + entry.payload.length,
    0,
  );
  const centralSize = compressed.reduce((size, entry) => size + 46 + entry.nameBytes.length, 0);
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  let localOffset = 0;
  const offsets: number[] = [];
  for (const entry of compressed) {
    offsets.push(localOffset);
    view.setUint32(localOffset, 0x04034b50, true);
    view.setUint16(localOffset + 8, entry.compression, true);
    view.setUint32(localOffset + 18, entry.payload.length, true);
    view.setUint32(localOffset + 22, entry.bytes.length, true);
    view.setUint16(localOffset + 26, entry.nameBytes.length, true);
    output.set(entry.nameBytes, localOffset + 30);
    output.set(entry.payload, localOffset + 30 + entry.nameBytes.length);
    localOffset += 30 + entry.nameBytes.length + entry.payload.length;
  }
  const centralOffset = localOffset;
  for (const [index, entry] of compressed.entries()) {
    view.setUint32(localOffset, 0x02014b50, true);
    view.setUint16(localOffset + 10, entry.compression, true);
    view.setUint32(localOffset + 20, entry.payload.length, true);
    view.setUint32(localOffset + 24, entry.declaredSize ?? entry.bytes.length, true);
    view.setUint16(localOffset + 28, entry.nameBytes.length, true);
    view.setUint32(localOffset + 42, offsets[index] ?? 0, true);
    output.set(entry.nameBytes, localOffset + 46);
    localOffset += 46 + entry.nameBytes.length;
  }
  view.setUint32(localOffset, 0x06054b50, true);
  view.setUint16(localOffset + 8, encoded.length, true);
  view.setUint16(localOffset + 10, encoded.length, true);
  view.setUint32(localOffset + 12, centralSize, true);
  view.setUint32(localOffset + 16, centralOffset, true);
  return output;
}

describe("XLSX ZIP preflight", () => {
  test("blocks external relationships and macro content types before workbook parsing", async () => {
    await expect(
      preflightXlsxArchive(
        storedZip([
          {
            name: "_rels/.rels",
            content: '<Relationship TargetMode="External" Target="https://example.test"/>',
          },
        ]),
      ),
    ).rejects.toBeInstanceOf(XlsxCompatibilityError);
    await expect(
      preflightXlsxArchive(
        storedZip([{ name: "[Content_Types].xml", content: "macroEnabled vbaProject" }]),
      ),
    ).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });

  test("rejects central-directory declarations that disagree with actual inflated bytes", async () => {
    await expect(
      preflightXlsxArchive(
        storedZip([{ name: "xl/workbook.xml", content: "abc", declaredSize: 2 }]),
      ),
    ).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });

  test("rejects DEFLATE entries whose actual size exceeds their declaration", async () => {
    await expect(
      preflightXlsxArchive(
        storedZip([
          {
            name: "xl/workbook.xml",
            content: "actual deflated contents",
            compression: 8,
            declaredSize: 2,
          },
        ]),
      ),
    ).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });

  test("blocks entity-encoded external relationships and rejects unsupported XML encodings", async () => {
    await expect(
      preflightXlsxArchive(
        storedZip([
          {
            name: "_rels/.rels",
            content: '<Relationship TargetMode="Ext&#101;rnal" Target="https://example.test"/>',
            compression: 8,
          },
        ]),
      ),
    ).rejects.toBeInstanceOf(XlsxCompatibilityError);
    const utf16 = new Uint8Array([0xff, 0xfe, 0x3c, 0x00, 0x3f, 0x00]);
    await expect(
      preflightXlsxArchive(storedZip([{ name: "xl/workbook.xml", content: utf16 }])),
    ).rejects.toBeInstanceOf(XlsxCompatibilityError);
    await expect(
      preflightXlsxArchive(
        storedZip([{ name: "xl/workbook.xml", content: "<!DOCTYPE workbook><workbook/>" }]),
      ),
    ).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });

  test("does not warn on supported hidden sheets and worksheet features or default margins", async () => {
    const report = await preflightXlsxArchive(
      storedZip([
        {
          name: "xl/workbook.xml",
          content: '<x:workbook><x:definedNames/><x:sheet state="hidden"/></x:workbook>',
        },
        {
          name: "xl/worksheets/sheet1.xml",
          content:
            '<x:worksheet><x:dataValidations/><x:conditionalFormatting/><x:sheetProtection/><x:row hidden="1"/><x:pageMargins/></x:worksheet>',
        },
      ]),
    );
    expect(report.issues).toEqual([]);
  });

  test("still reports unsupported workbook file sharing", async () => {
    const report = await preflightXlsxArchive(
      storedZip([{ name: "xl/workbook.xml", content: "<workbook><fileSharing/></workbook>" }]),
    );
    expect(report.issues).toEqual([
      { code: "feature-omitted", severity: "warning", count: 1, locations: ["xl/workbook.xml"] },
    ]);
  });

  test("accepts classic notes and reports threaded comments as unsupported", async () => {
    const classicNotes = await preflightXlsxArchive(
      storedZip([{ name: "xl/comments1.xml", content: "<comments/>" }]),
    );
    expect(classicNotes.issues).toEqual([]);

    const report = await preflightXlsxArchive(
      storedZip([
        {
          name: "xl/threadedComments/threadedComment1.xml",
          content: "<ThreadedComments/>",
        },
      ]),
    );
    expect(report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "feature-omitted" })]),
    );
  });

  test("ignores empty directory placeholders and ExcelJS's default page setup", async () => {
    const report = await preflightXlsxArchive(
      storedZip([
        { name: "_rels/", content: "" },
        { name: "xl/", content: "" },
        {
          name: "xl/worksheets/sheet1.xml",
          content:
            '<worksheet><pageSetup orientation="portrait" horizontalDpi="4294967295" verticalDpi="4294967295" scale="100" fitToWidth="1" fitToHeight="1"/></worksheet>',
        },
      ]),
    );
    expect(report.issues).toEqual([]);
  });

  test("accepts page setup fields handled by the XLSX codec", async () => {
    const report = await preflightXlsxArchive(
      storedZip([
        {
          name: "xl/worksheets/sheet1.xml",
          content: '<worksheet><pageSetup orientation="landscape"/></worksheet>',
        },
      ]),
    );
    expect(report.issues).toEqual([]);
  });

  test("cancels aborted DEFLATE reads and absorbs rejected stream writes", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      let abortChecks = 0;
      const signal = {
        get aborted() {
          abortChecks += 1;
          return abortChecks > 4;
        },
      };
      await expect(
        preflightXlsxArchive(
          storedZip([{ name: "xl/workbook.xml", content: "a".repeat(4096), compression: 8 }]),
          signal,
        ),
      ).rejects.toBeInstanceOf(XlsxAbortError);

      const malformed = storedZip([
        { name: "xl/workbook.xml", content: "a rejected deflate writer", compression: 8 },
      ]);
      const compressedOffset = "xl/workbook.xml".length + 30;
      malformed[compressedOffset] = (malformed[compressedOffset] ?? 0) ^ 0xff;
      await expect(preflightXlsxArchive(malformed)).rejects.toBeInstanceOf(XlsxCompatibilityError);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
