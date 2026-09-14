import { describe, expect, test } from "vitest";
import { captureCellFill, createCellFillCommand } from "../../cell-autofill.js";
import { applyWorkbookCommand } from "../../commands/apply.js";
import { createTestWorkbook } from "../helpers.js";
import {
  getActiveSheet,
  getCellContent,
  getCellStyle,
  getCellValue,
  setCellContent,
  setCellStyle,
} from "../../workbook.js";

describe("cell autofill sequences", () => {
  test("fills numeric and numbered-text lanes independently, including upward", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 2, column: 1 }, { kind: "literal", value: 4 });
    setCellContent(sheet, { row: 1, column: 2 }, { kind: "literal", value: "Item 007" });
    setCellContent(sheet, { row: 2, column: 2 }, { kind: "literal", value: "Item 009" });
    const plan = captureCellFill(
      workbook,
      sheet.id,
      { start: { row: 1, column: 1 }, end: { row: 2, column: 2 } },
      { start: { row: 1, column: 1 }, end: { row: 4, column: 2 } },
    );
    applyWorkbookCommand(workbook, createCellFillCommand(workbook, plan));
    expect(getCellValue(sheet, { row: 4, column: 1 })).toBe(8);
    expect(getCellValue(sheet, { row: 4, column: 2 })).toBe("Item 013");
    const up = captureCellFill(
      workbook,
      sheet.id,
      { start: { row: 1, column: 1 }, end: { row: 2, column: 1 } },
      { start: { row: 0, column: 1 }, end: { row: 2, column: 1 } },
    );
    applyWorkbookCommand(workbook, createCellFillCommand(workbook, up));
    expect(getCellValue(sheet, { row: 0, column: 1 })).toBe(0);
  });

  test("copies a single number by default but advances a single text suffix", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: 7 });
    setCellContent(sheet, { row: 1, column: 2 }, { kind: "literal", value: "Item001" });
    const numeric = captureCellFill(
      workbook,
      sheet.id,
      { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
      { start: { row: 1, column: 1 }, end: { row: 2, column: 1 } },
    );
    const text = captureCellFill(
      workbook,
      sheet.id,
      { start: { row: 1, column: 2 }, end: { row: 1, column: 2 } },
      { start: { row: 1, column: 2 }, end: { row: 2, column: 2 } },
    );
    expect(numeric.defaultMode).toBe("copy");
    expect(text.defaultMode).toBe("series");
    applyWorkbookCommand(workbook, createCellFillCommand(workbook, numeric, "series"));
    applyWorkbookCommand(workbook, createCellFillCommand(workbook, text));
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBe(8);
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBe("Item002");
  });

  test("preserves decimals, translates formula lanes, and formats negative suffixes", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: 1.25 });
    setCellContent(sheet, { row: 2, column: 1 }, { kind: "literal", value: 1.5 });
    setCellContent(
      sheet,
      { row: 1, column: 2 },
      { kind: "formula", formula: { source: "=A1+$B$1" } },
    );
    setCellContent(
      sheet,
      { row: 2, column: 2 },
      { kind: "formula", formula: { source: "=A2+$B$1" } },
    );
    const mixed = captureCellFill(
      workbook,
      sheet.id,
      { start: { row: 1, column: 1 }, end: { row: 2, column: 2 } },
      { start: { row: 1, column: 1 }, end: { row: 3, column: 2 } },
    );
    applyWorkbookCommand(workbook, createCellFillCommand(workbook, mixed, "series"));
    expect(getCellValue(sheet, { row: 3, column: 1 })).toBe(1.75);
    expect(getCellContent(sheet, { row: 3, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=A3+$B$1" },
    });
    setCellContent(sheet, { row: 5, column: 1 }, { kind: "literal", value: "Item001" });
    setCellContent(sheet, { row: 6, column: 1 }, { kind: "literal", value: "Item000" });
    const text = captureCellFill(
      workbook,
      sheet.id,
      { start: { row: 5, column: 1 }, end: { row: 6, column: 1 } },
      { start: { row: 5, column: 1 }, end: { row: 7, column: 1 } },
    );
    applyWorkbookCommand(workbook, createCellFillCommand(workbook, text, "series"));
    expect(getCellValue(sheet, { row: 7, column: 1 })).toBe("Item-001");
  });

  test("accepts floating-point arithmetic without treating distinct large integer steps as equal", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    for (const [row, value] of [0.1, 0.2, 0.3].entries())
      setCellContent(sheet, { row: row + 1, column: 1 }, { kind: "literal", value });
    const decimals = captureCellFill(
      workbook,
      sheet.id,
      { start: { row: 1, column: 1 }, end: { row: 3, column: 1 } },
      { start: { row: 1, column: 1 }, end: { row: 4, column: 1 } },
    );
    applyWorkbookCommand(workbook, createCellFillCommand(workbook, decimals, "series"));
    expect(getCellValue(sheet, { row: 4, column: 1 })).toBeCloseTo(0.4, 12);

    for (const [row, value] of [1_000_000_000_000, 1_000_000_000_002, 1_000_000_000_005].entries())
      setCellContent(sheet, { row: row + 1, column: 2 }, { kind: "literal", value });
    const large = captureCellFill(
      workbook,
      sheet.id,
      { start: { row: 1, column: 2 }, end: { row: 3, column: 2 } },
      { start: { row: 1, column: 2 }, end: { row: 4, column: 2 } },
    );
    applyWorkbookCommand(workbook, createCellFillCommand(workbook, large, "series"));
    expect(getCellValue(sheet, { row: 4, column: 2 })).toBe(1_000_000_000_000);
  });

  test("only preserves numbered-text padding when the source suffix has leading zeroes", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: "Item10" });
    setCellContent(sheet, { row: 2, column: 1 }, { kind: "literal", value: "Item11" });
    const plan = captureCellFill(
      workbook,
      sheet.id,
      { start: { row: 1, column: 1 }, end: { row: 2, column: 1 } },
      { start: { row: 0, column: 1 }, end: { row: 2, column: 1 } },
    );

    applyWorkbookCommand(workbook, createCellFillCommand(workbook, plan, "series"));
    expect(getCellValue(sheet, { row: 0, column: 1 })).toBe("Item9");
  });

  test("formats-only preserves original content and without-formatting preserves target style", () => {
    const workbook = createTestWorkbook(),
      sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: 1 });
    setCellStyle(sheet, { row: 1, column: 1 }, { fillColor: "#ff0000" });
    setCellContent(sheet, { row: 2, column: 1 }, { kind: "literal", value: "keep" });
    setCellStyle(sheet, { row: 2, column: 1 }, { fillColor: "#00ff00" });
    const plan = captureCellFill(
      workbook,
      sheet.id,
      { start: { row: 1, column: 1 }, end: { row: 1, column: 1 } },
      { start: { row: 1, column: 1 }, end: { row: 2, column: 1 } },
    );
    applyWorkbookCommand(workbook, createCellFillCommand(workbook, plan, "fillFormatsOnly"));
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBe("keep");
    expect(getCellStyle(sheet, { row: 2, column: 1 })?.fillColor).toBe("#ff0000");
  });
});
