import { describe, expect, test, vi } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate/browser";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { getActiveSheet, setCellContent } from "@sheetcraft/core/workbook";
import { decodeXlsx, encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { nativeColumnFixture } from "../charts/native-column-fixture.js";
import { webCreatedTextBox } from "./web-created-textbox.js";
const part = "xl/drawings/drawing1.xml";
const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAATUlEQVR4nO3OsQ0AIAwDwWzBMAzB/hISC7BD2CApkOXmC5cvX+x7stpYs9xvHwAAALAD1AddDwAAAD9AfdD1AAAA8APUB10PAAAAO+ABy7aMl7hArRwAAAAASUVORK5CYII=",
    "base64",
  ),
);
const image = { assetId: "raster", bytes: png, extension: "png" as const, width: 32, height: 32 };
function fixture(withPicture = false) {
  const f = nativeColumnFixture();
  const first = { ...structuredClone(webCreatedTextBox), id: "text-a", name: "Text A" };
  const second = { ...structuredClone(webCreatedTextBox), id: "text-b", name: "Text B" };
  second.shapeFrame.anchor = { mode: "fixed", x: 650, y: 480, size: { width: 200, height: 120 } };
  const chart = { ...structuredClone(f.drawing), id: "chart-b", name: "Chart B" };
  f.drawing.name = "Chart A";
  f.sheet.drawings = [first, f.drawing, second, chart];
  if (withPicture)
    f.sheet.floatingImages = [
      {
        id: "picture",
        assetId: image.assetId,
        altText: "Synthetic raster",
        frame: {
          kind: "object-frame-v1",
          anchor: { mode: "fixed", x: 700, y: 10, size: { width: 32, height: 32 } },
          source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
          angleDeg: 0,
        },
      },
    ];
  return f;
}
async function changed(update: (entries: Record<string, Uint8Array>) => void) {
  const entries = unzipSync((await encodeXlsx(fixture().workbook)).bytes);
  update(entries);
  return zipSync(entries);
}
describe("native mixed chart and text box routing", () => {
  test.each([false, true])(
    "preserves shared drawing IDs, relationships and chart/textbox paint order (picture=%s)",
    async (withPicture) => {
      const { workbook, sheet } = fixture(withPicture),
        before = serializeWorkbook(workbook);
      const out = await encodeXlsx(workbook, withPicture ? { images: [image] } : undefined);
      expect(serializeWorkbook(workbook)).toEqual(before);
      const entries = unzipSync(out.bytes),
        xml = strFromU8(entries[part]!);
      expect(
        Object.keys(entries).filter((path) => /^xl\/drawings\/drawing\d+\.xml$/.test(path)),
      ).toEqual([part]);
      const names = [...xml.matchAll(/<xdr:cNvPr\b[^>]*name="([^"]*)"/g)].map((match) => match[1]);
      expect(
        names.filter(
          (name) =>
            name === "Text A" || name === "Text B" || name === "Chart A" || name === "Chart B",
        ),
      ).toEqual(["Text A", "Chart A", "Text B", "Chart B"]);
      const ids = [...xml.matchAll(/<xdr:cNvPr\b[^>]*id="(\d+)"/g)].map((match) => match[1]);
      expect(new Set(ids).size).toBe(ids.length);
      expect(xml).not.toContain("drawingOrder");
      expect(out.report.issues.some((issue) => issue.code === "feature-omitted")).toBe(false);
      const read = await decodeXlsx(out.bytes),
        restored = getActiveSheet(read.workbook);
      expect(restored.drawings?.map((d) => d.name)).toEqual(sheet.drawings!.map((d) => d.name));
      expect(restored.drawings?.map((d) => d.kind)).toEqual([
        "textBox",
        "chart",
        "textBox",
        "chart",
      ]);
      expect(JSON.stringify(serializeWorkbook(read.workbook))).not.toContain('"drawingOrder"');
      if (withPicture) {
        expect(restored.floatingImages).toHaveLength(1);
        expect(read.images?.[0]?.bytes).toEqual(png);
        expect(read.report.issues.flatMap((issue) => issue.locations)).toContain(
          `${part}.pictureObjectOrder`,
        );
      }
      const snapshot = deserializeWorkbook(serializeWorkbook(read.workbook)),
        snapshotSheet = getActiveSheet(snapshot);
      const edited = snapshotSheet.drawings![0]!;
      if (edited.kind !== "textBox") throw new Error("Missing text box");
      edited.text = "Edited plain text";
      if (edited.shapeText) delete edited.shapeText.characterRuns;
      setCellContent(snapshotSheet, { row: 1, column: 1 }, { kind: "literal", value: 90 });
      const again = await encodeXlsx(
        snapshot,
        withPicture
          ? { images: read.images!.map((asset) => ({ ...asset, width: 32, height: 32 })) }
          : undefined,
      );
      const second = getActiveSheet((await decodeXlsx(again.bytes)).workbook);
      expect(second.drawings?.map((d) => d.name)).toEqual(restored.drawings?.map((d) => d.name));
      const secondTextBox = second.drawings?.find((drawing) => drawing.kind === "textBox");
      expect(secondTextBox?.kind === "textBox" ? secondTextBox.text : undefined).toBe(
        "Edited plain text",
      );
      expect(strFromU8(unzipSync(again.bytes)["xl/charts/chart1.xml"]!)).toContain("<c:v>90</c:v>");
    },
  );
  test("sole textbox creates one drawing without any artificial chart or relationship", async () => {
    const { workbook, sheet } = fixture();
    sheet.drawings = [sheet.drawings![0]!];
    const out = await encodeXlsx(workbook),
      entries = unzipSync(out.bytes);
    expect(Object.keys(entries).some((name) => name.startsWith("xl/charts/"))).toBe(false);
    expect(entries["xl/drawings/_rels/drawing1.xml.rels"]).toBeUndefined();
    expect(getActiveSheet((await decodeXlsx(out.bytes)).workbook).drawings?.[0]?.kind).toBe(
      "textBox",
    );
  });
  test("duplicate IDs across chart and textbox fail closed", async () => {
    const bytes = await changed((entries) => {
      const xml = strFromU8(entries[part]!);
      const chartId = xml.match(/<xdr:graphicFrame>[\s\S]*?<xdr:cNvPr id="(\d+)"/)![1];
      entries[part] = strToU8(
        xml.replace(/(<xdr:sp><xdr:nvSpPr><xdr:cNvPr id=")\d+/, `$1${chartId}`),
      );
    });
    await expect(decodeXlsx(bytes)).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });
  test("a textbox cannot consume an unused relationship", async () => {
    const bytes = await changed((entries) => {
      const rel = "xl/drawings/_rels/drawing1.xml.rels";
      entries[rel] = strToU8(
        strFromU8(entries[rel]!).replace(
          "</Relationships>",
          '<Relationship Id="unused" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>',
        ),
      );
    });
    await expect(decodeXlsx(bytes)).rejects.toBeInstanceOf(XlsxCompatibilityError);
  });
  test.each(["sp", "paragraph", "relationship-attribute", "extra-shape"])(
    "bounds textbox subtree %s without widening other drawing objects",
    async (choice) => {
      const bytes = await changed((entries) => {
        let xml = strFromU8(entries[part]!);
        if (choice === "sp") xml = xml.replaceAll("xdr:sp>", "a:sp>");
        if (choice === "paragraph") xml = xml.replaceAll("a:p>", "xdr:p>");
        if (choice === "relationship-attribute")
          xml = xml.replace("<xdr:sp>", '<xdr:sp r:id="rId1">');
        if (choice === "extra-shape")
          xml = xml.replace(
            "</xdr:graphicFrame>",
            `</xdr:graphicFrame>${xml.match(/<xdr:sp>[\s\S]*?<\/xdr:sp>/)![0]}`,
          );
        entries[part] = strToU8(xml);
      });
      await expect(decodeXlsx(bytes)).rejects.toBeInstanceOf(XlsxCompatibilityError);
    },
  );
  test("unsupported canonical textbox blocks before image resources", async () => {
    const { workbook, sheet } = fixture();
    sheet.drawings![0]!.rotation = 15;
    const resources = vi.fn(() => []);
    await expect(
      encodeXlsx(workbook, {
        get images() {
          return resources();
        },
      }),
    ).rejects.toBeInstanceOf(XlsxCompatibilityError);
    expect(resources).not.toHaveBeenCalled();
  });
});
