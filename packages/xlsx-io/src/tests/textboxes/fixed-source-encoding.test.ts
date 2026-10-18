import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createWorkbook, getActiveSheet, setColumnWidth } from "@sheetcraft/core/workbook";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import { child, parseXml } from "../../pivot-xml.js";
import { inspectNativeTextBox, readXlsxTextBoxes } from "../../textbox-reader.js";
import { inspectNativePicture, readXlsxPictures } from "../../picture-reader.js";
import { CompatibilityReportBuilder } from "../../report.js";
import { nativeTextBoxAnchorXml } from "../../native/writer-textboxes.js";
import { encodeXlsx } from "../../index.js";
import { unzipSync, strFromU8 } from "fflate/browser";
const fixtures = (name: string) =>
  readFileSync(new URL(`./fixtures/wps-absolute-${name}.xml`, import.meta.url));
function setup() {
  const book = createWorkbook({ id: "w", sheetId: "s" });
  const sheet = getActiveSheet(book);
  sheet.defaultColumnWidth = 96;
  sheet.defaultRowHeight = 24;
  const report = new CompatibilityReportBuilder();
  return { book, sheet, report };
}
test("real WPS markers survive a text edit and V89 snapshot; fixed geometry remains 300x100", async () => {
  const { book, sheet, report } = setup();
  const source = inspectNativeTextBox(
    "twoCellAnchor",
    child(parseXml(fixtures("textbox")), "twoCellAnchor"),
    "fixture",
  );
  readXlsxTextBoxes(book, [{ ...source, sheetIndex: 0 }], report);
  const box = sheet.drawings![0]!;
  if (box.kind !== "textBox" || !("shapeFrame" in box)) throw Error();
  expect(box.shapeFrame.anchor).toMatchObject({
    mode: "fixed",
    x: 32,
    y: 120,
    size: { width: 300, height: 100 },
    exportEncoding: { kind: "two-cell-absolute-v1" },
  });
  box.text += "🙂";
  // Remove character ranges after a direct synthetic text edit.
  if (box.shapeText) delete box.shapeText.characterRuns;
  const restored = getActiveSheet(
    deserializeWorkbook(JSON.parse(JSON.stringify(serializeWorkbook(book)))),
  );
  const next = restored.drawings![0]!;
  if (next.kind !== "textBox" || !("shapeFrame" in next)) throw Error();
  const xml = nativeTextBoxAnchorXml(next, restored, 1);
  expect(xml).toContain('<xdr:twoCellAnchor editAs="absolute">');
  expect(xml).toContain("<xdr:to><xdr:col>3</xdr:col><xdr:colOff>419100</xdr:colOff>");
  expect(xml).toContain('<a:ext cx="2857500" cy="952500"/>');
  expect(xml).toContain("🙂");
  setColumnWidth(restored, 0, 120);
  expect(nativeTextBoxAnchorXml(next, restored, 1)).toContain("<xdr:absoluteAnchor>");
  const changed = await encodeXlsx(
    deserializeWorkbook(JSON.parse(JSON.stringify(serializeWorkbook(book)))),
  );
  expect(
    changed.report.issues.some(
      (i) =>
        i.code === "dimension-approximated" &&
        i.locations.some((l) => l.endsWith("exportEncoding")),
    ),
  ).toBe(false);
  const changedGrid = await encodeXlsx(
    deserializeWorkbook({
      ...serializeWorkbook(book),
      sheets: serializeWorkbook(book).sheets.map((s) => ({ ...s, defaultColumnWidth: 120 })),
    }),
  );
  expect(changedGrid.report.issues).toContainEqual(
    expect.objectContaining({ code: "dimension-approximated", severity: "warning" }),
  );
  expect(next.shapeFrame.anchor).toHaveProperty("exportEncoding"); // Export does not mutate.
});
test("one EMU transform disagreement is not admitted, and genuine absolute anchors remain absolute", () => {
  for (const delta of [1, 2]) {
    const { book, sheet, report } = setup();
    const xml = fixtures("textbox")
      .toString()
      .replace('cx="2857500"', `cx="${2857500 + delta}"`);
    const source = inspectNativeTextBox(
      "twoCellAnchor",
      child(parseXml(new TextEncoder().encode(xml)), "twoCellAnchor"),
      "fixture",
    );
    readXlsxTextBoxes(book, [{ ...source, sheetIndex: 0 }], report);
    const box = sheet.drawings![0]!;
    expect(box).not.toHaveProperty("shapeFrame.anchor.exportEncoding");
  }
  const { book, sheet, report } = setup();
  const xml = fixtures("textbox")
    .toString()
    .replace(/twoCellAnchor/g, "absoluteAnchor")
    .replace(' editAs="absolute"', "")
    .replace(
      /<xdr:from>.*?<\/xdr:to>/,
      '<xdr:pos x="304800" y="1143000"/><xdr:ext cx="2857500" cy="952500"/>',
    );
  readXlsxTextBoxes(
    book,
    [
      {
        ...inspectNativeTextBox(
          "absoluteAnchor",
          child(parseXml(new TextEncoder().encode(xml)), "absoluteAnchor"),
          "fixture",
        ),
        sheetIndex: 0,
      },
    ],
    report,
  );
  expect(sheet.drawings![0]).not.toHaveProperty("shapeFrame.anchor.exportEncoding");
});
test("identity picture emits original twoCell markers, then safely falls back on changed grid", async () => {
  const { book, sheet, report } = setup();
  const source = inspectNativePicture(
    "twoCellAnchor",
    child(parseXml(fixtures("picture")), "twoCellAnchor"),
    "fixture",
  );
  readXlsxPictures(book, [{ ...source, sheetIndex: 0, assetId: "a" }], [], report);
  const image = sheet.floatingImages[0]!;
  expect(image).toHaveProperty("frame.anchor.exportEncoding");
  const png = new Uint8Array(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  const options = {
    images: [{ assetId: "a", bytes: png, extension: "png" as const, width: 1, height: 1 }],
  };
  const out = await encodeXlsx(book, options);
  const xml = strFromU8(unzipSync(out.bytes)["xl/drawings/drawing1.xml"]!);
  expect(xml).toContain('<xdr:twoCellAnchor editAs="absolute">');
  expect(xml).toContain("<xdr:to><xdr:col>2</xdr:col>");
  expect(xml).toContain('<a:ext cx="1524000" cy="1143000"/>');
  setColumnWidth(sheet, 0, 120);
  const changed = await encodeXlsx(book, options);
  expect(changed.report.issues).toContainEqual(
    expect.objectContaining({ code: "picture-geometry-approximated", severity: "warning" }),
  );
  expect(strFromU8(unzipSync(changed.bytes)["xl/drawings/drawing1.xml"]!)).toContain(
    "<xdr:absoluteAnchor>",
  );
});

test("textbox copies and rotation clear source encoding while preserving the original", async () => {
  const { book, sheet, report } = setup();
  readXlsxTextBoxes(
    book,
    [
      {
        ...inspectNativeTextBox(
          "twoCellAnchor",
          child(parseXml(fixtures("textbox")), "twoCellAnchor"),
          "fixture",
        ),
        sheetIndex: 0,
      },
    ],
    report,
  );
  const { cloneShapeRootsForClipboard } = await import("@sheetcraft/core/shape-group-copy");
  const { normalizeSheetDrawing } = await import("@sheetcraft/core/sheet-drawings");
  const copy = cloneShapeRootsForClipboard(sheet.drawings!, { createId: () => "new" });
  expect(copy[0]).not.toHaveProperty("shapeFrame.anchor.exportEncoding");
  expect(sheet.drawings![0]).toHaveProperty("shapeFrame.anchor.exportEncoding");
  expect(normalizeSheetDrawing({ ...sheet.drawings![0]!, rotation: 30 })).not.toHaveProperty(
    "shapeFrame.anchor.exportEncoding",
  );
});
