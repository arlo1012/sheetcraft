import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  setCellStyle,
  setRowHeight,
} from "@sheetcraft/core/workbook";
import { describe, expect, test } from "vitest";
import { getAutoFitRowNumbers } from "../../auto-fit-rows.js";

function sheet() {
  return getActiveSheet(createWorkbook({ id: "workbook", sheetId: "sheet" }));
}

describe("XLSX native auto-fit rows", () => {
  test("selects wrapped literal and formula content, including sparse rows", () => {
    const activeSheet = sheet();
    setCellContent(activeSheet, { row: 0, column: 0 }, { kind: "literal", value: "wrapped" });
    setCellStyle(activeSheet, { row: 0, column: 0 }, { wrapText: true });
    setCellContent(
      activeSheet,
      { row: 5_000, column: 2 },
      { kind: "formula", formula: { source: "=A1" } },
    );
    setCellStyle(activeSheet, { row: 5_000, column: 2 }, { wrapText: true });
    setCellContent(activeSheet, { row: 3, column: 1 }, { kind: "literal", value: "not wrapped" });

    expect(getAutoFitRowNumbers(activeSheet)).toEqual(new Set([1, 5_001]));
  });

  test("leaves explicit heights and non-text materialization fixed", () => {
    const activeSheet = sheet();
    setCellContent(activeSheet, { row: 0, column: 0 }, { kind: "literal", value: "manual" });
    setCellStyle(activeSheet, { row: 0, column: 0 }, { wrapText: true });
    setRowHeight(activeSheet, 0, 48);
    setCellStyle(activeSheet, { row: 1, column: 0 }, { wrapText: true });
    setCellContent(
      activeSheet,
      { row: 2, column: 0 },
      {
        kind: "image",
        image: { assetId: "image", altText: "Image" },
      },
    );
    setCellStyle(activeSheet, { row: 2, column: 0 }, { wrapText: true });

    expect(getAutoFitRowNumbers(activeSheet)).toEqual(new Set());
  });

  test("excludes every row covered by unsorted and overlapping merged ranges", () => {
    const activeSheet = sheet();
    for (const row of [1, 2, 3, 7]) {
      setCellContent(activeSheet, { row, column: 0 }, { kind: "literal", value: `row ${row}` });
      setCellStyle(activeSheet, { row, column: 0 }, { wrapText: true });
    }
    activeSheet.mergedCells.push(
      { start: { row: 3, column: 0 }, end: { row: 4, column: 1 } },
      { start: { row: 1, column: 0 }, end: { row: 2, column: 1 } },
      { start: { row: 2, column: 2 }, end: { row: 3, column: 3 } },
    );

    expect(getAutoFitRowNumbers(activeSheet)).toEqual(new Set([8]));
  });
});
