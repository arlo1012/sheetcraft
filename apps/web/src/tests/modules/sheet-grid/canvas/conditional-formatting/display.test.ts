import { describe, expect, test } from "vitest";
import {
  createSheetEvaluator,
  createWorkbook,
  getActiveSheet,
  setCellValue,
  setCellStyle,
} from "@idea10/core/workbook";
import { createSheetDisplaySnapshot } from "../../../../../modules/sheet-grid/canvas/sheet-display-snapshot";

describe("conditional formatting display", () => {
  test("refreshes after edits and restores original formatting without mutating it", () => {
    const sheet = getActiveSheet(createWorkbook({ id: "test", sheetId: "sheet" }));
    const address = { row: 0, column: 0 };
    setCellValue(sheet, address, 12);
    setCellStyle(sheet, address, { fillColor: "#ffffff", bold: true });
    sheet.conditionalFormats = [
      {
        id: "rule",
        anchor: address,
        ranges: [{ start: address, end: address }],
        condition: { kind: "cellValue", operator: "greaterThan", value: 10 },
        style: { fillColor: "#ff0000", bold: false },
      },
    ];
    const snapshot = () =>
      createSheetDisplaySnapshot({ sheet, evaluator: createSheetEvaluator(sheet) });
    expect(snapshot().getCellStyle(address)).toEqual({ fillColor: "#ff0000" });
    expect(sheet.cells.get("0:0")?.style).toEqual({ fillColor: "#ffffff", bold: true });
    setCellValue(sheet, address, 5);
    expect(snapshot().getCellStyle(address)).toEqual({ fillColor: "#ffffff", bold: true });
  });
  test("styles unmaterialized blanks and overrides duplicate highlight predictably", () => {
    const sheet = getActiveSheet(createWorkbook({ id: "test", sheetId: "sheet" }));
    const range = { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } };
    sheet.duplicateRules = [{ id: "dup", kind: "highlight", range, fillColor: "#0000ff" }];
    setCellValue(sheet, { row: 0, column: 0 }, 1);
    setCellValue(sheet, { row: 1, column: 0 }, 1);
    sheet.conditionalFormats = [
      {
        id: "rule",
        anchor: range.start,
        ranges: [range],
        condition: { kind: "formula", formula: "=TRUE" },
        style: { fillColor: "#ff0000" },
      },
    ];
    const snapshot = createSheetDisplaySnapshot({ sheet, evaluator: createSheetEvaluator(sheet) });
    expect(snapshot.getCellStyle({ row: 0, column: 0 })?.fillColor).toBe("#ff0000");
    expect(snapshot.getCellStyle({ row: 2, column: 0 })?.fillColor).toBe("#ff0000");
    expect(sheet.cells.has("2:0")).toBe(false);
  });

  test("exposes conditional number, font, pattern and border styles to canvas consumers", () => {
    const sheet = getActiveSheet(createWorkbook({ id: "test", sheetId: "sheet" }));
    const address = { row: 0, column: 0 };
    setCellValue(sheet, address, 12.5);
    sheet.conditionalFormats = [
      {
        id: "complete-style",
        anchor: address,
        ranges: [{ start: address, end: address }],
        condition: { kind: "cellValue", operator: "greaterThan", value: 10 },
        style: {
          numberFormat: { kind: "number", fractionDigits: 2, useGrouping: false },
          fontFamily: "serif",
          fontSize: 18,
          underline: true,
          fillPattern: "darkGrid",
          fillPatternColor: "#112233",
          borderBottom: { style: "medium", color: "#7f6000" },
        },
      },
    ];

    expect(
      createSheetDisplaySnapshot({ sheet, evaluator: createSheetEvaluator(sheet) }).getCellStyle(
        address,
      ),
    ).toMatchObject({
      numberFormat: { kind: "number", fractionDigits: 2 },
      fontFamily: "serif",
      fontSize: 18,
      underline: true,
      fillPattern: "darkGrid",
      fillPatternColor: "#112233",
      borderBottom: { style: "medium", color: "#7f6000" },
    });
  });
});
