import { describe, expect, test } from "vitest";
import { strFromU8, unzipSync } from "fflate/browser";
import {
  createWorkbook,
  getActiveSheet,
  getCellSparkline,
  getCellContent,
  getCellNote,
  setCellSparkline,
  setCellContent,
  setCellNote,
} from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import { encodeXlsx, decodeXlsx } from "../index.js";
import { readXlsxSparklines } from "../sparklines.js";

function sparkline(type: CellSparkline["type"], empty: CellSparkline["empty"]): CellSparkline {
  return {
    type,
    empty,
    source: { start: { row: 0, column: 0 }, end: { row: 0, column: 2 } },
    color: "#2563eb",
    negativeColor: "#ef4444",
    markers: true,
    axis: true,
    showHidden: true,
  };
}
describe("native XLSX sparklines", () => {
  test.each(["line", "column", "winLoss"] as const)(
    "writes and imports %s with every empty-cell mode",
    async (type) => {
      const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
      const sheet = getActiveSheet(workbook);
      sheet.name = "O'Brien & Sales";
      const emptyModes = ["gap", "zero", "connect"] as const;
      for (const [row, empty] of emptyModes.entries())
        setCellSparkline(sheet, { row, column: 4 }, sparkline(type, empty));
      const encoded = await encodeXlsx(workbook);
      const entries = unzipSync(encoded.bytes);
      const xml = strFromU8(entries["xl/worksheets/sheet1.xml"]!);
      expect(xml).toContain("x14:sparklineGroups");
      expect(xml).toContain(`type="${type === "winLoss" ? "stacked" : type}"`);
      expect(xml).toContain('displayEmptyCellsAs="span"');
      expect(xml).toContain("O&apos;&apos;Brien &amp; Sales");
      const native = readXlsxSparklines(entries, [sheet.name])[0]!;
      for (const [row, empty] of emptyModes.entries())
        expect(native.get(`E${row + 1}`)).toEqual(sparkline(type, empty));
      const restored = getActiveSheet((await decodeXlsx(encoded.bytes)).workbook);
      for (const [row, empty] of emptyModes.entries())
        expect(getCellSparkline(restored, { row, column: 4 })).toEqual(sparkline(type, empty));
    },
  );

  test("retains a sparkline-only cell and another cell's value and note", async () => {
    const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
    const sheet = getActiveSheet(workbook);
    const only = { row: 2, column: 4 },
      decorated = { row: 3, column: 4 };
    setCellSparkline(sheet, only, sparkline("line", "gap"));
    setCellContent(sheet, decorated, { kind: "literal", value: "Revenue" });
    setCellNote(sheet, decorated, { text: "Source note", author: "Analyst" });
    setCellSparkline(sheet, decorated, sparkline("column", "zero"));
    const restored = getActiveSheet(
      (await decodeXlsx((await encodeXlsx(workbook)).bytes)).workbook,
    );
    expect(getCellSparkline(restored, only)).toEqual(sparkline("line", "gap"));
    expect(getCellContent(restored, only)).toBeNull();
    expect(getCellContent(restored, decorated)).toEqual({ kind: "literal", value: "Revenue" });
    expect(getCellNote(restored, decorated)).toMatchObject({
      text: "Source note",
      author: "Analyst",
    });
    expect(getCellSparkline(restored, decorated)).toEqual(sparkline("column", "zero"));
  });

  test("preserves an invalidated source as a native REF reference", async () => {
    const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
    const sheet = getActiveSheet(workbook);
    setCellSparkline(sheet, { row: 1, column: 1 }, { ...sparkline("line", "gap"), source: null });
    const encoded = await encodeXlsx(workbook);
    expect(strFromU8(unzipSync(encoded.bytes)["xl/worksheets/sheet1.xml"]!)).toContain("#REF!");
    expect(
      getCellSparkline(getActiveSheet((await decodeXlsx(encoded.bytes)).workbook), {
        row: 1,
        column: 1,
      })?.source,
    ).toBeNull();
  });
});
