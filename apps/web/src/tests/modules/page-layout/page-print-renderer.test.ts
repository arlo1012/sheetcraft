import { describe, expect, test } from "vitest";
import { createSheetEvaluator, createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { DEFAULT_SHEET_PAGE_SETUP } from "@sheetcraft/core/page-setup";
import { createPrintPreviewDocument } from "../../../modules/page-layout/page-print-renderer";

function documentFor(setup = DEFAULT_SHEET_PAGE_SETUP) {
  const workbook = createWorkbook({ id: "print-preview", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  return {
    sheet,
    preview: createPrintPreviewDocument({ sheet, evaluator: createSheetEvaluator(sheet), setup }),
  };
}

describe("print preview pagination", () => {
  test("resolves fit-to-page before calculating pages", () => {
    const { sheet } = documentFor();
    for (let row = 0; row < 40; row += 1) sheet.rowHeights.set(row, 100);
    sheet.cells.set("39:0", { content: { kind: "literal", value: "end" } });
    const preview = createPrintPreviewDocument({
      sheet,
      evaluator: createSheetEvaluator(sheet),
      setup: { ...DEFAULT_SHEET_PAGE_SETUP, fitToPage: { width: 1, height: 1 } },
    });
    expect(preview.setup.scale).toBeLessThan(100);
    expect(preview.pages).toHaveLength(1);
  });

  test("reserves repeated title rows before each later page body", () => {
    const { sheet } = documentFor();
    for (let row = 0; row < 8; row += 1) {
      sheet.rowHeights.set(row, row === 0 ? 200 : 300);
      sheet.cells.set(`${row}:0`, { content: { kind: "literal", value: String(row) } });
    }
    const preview = createPrintPreviewDocument({
      sheet,
      evaluator: createSheetEvaluator(sheet),
      setup: {
        ...DEFAULT_SHEET_PAGE_SETUP,
        printTitles: { rows: { start: 0, end: 0 }, columns: null, bottomRows: null },
      },
    });
    expect(preview.pages[0]).toMatchObject({ row: { start: 0, end: 2 }, titleRows: null });
    expect(preview.pages[1]).toMatchObject({
      row: { start: 3, end: 4 },
      titleRows: { start: 0, end: 0 },
    });
  });

  test("repeats title rows outside the print area and ignores manual breaks while fitting", () => {
    const { sheet } = documentFor();
    for (let row = 0; row < 8; row += 1) {
      sheet.rowHeights.set(row, row === 0 ? 120 : 80);
      sheet.cells.set(`${row}:0`, { content: { kind: "literal", value: String(row) } });
    }
    const preview = createPrintPreviewDocument({
      sheet,
      evaluator: createSheetEvaluator(sheet),
      setup: {
        ...DEFAULT_SHEET_PAGE_SETUP,
        printArea: { start: { row: 3, column: 0 }, end: { row: 7, column: 0 } },
        rowBreaks: [4],
        fitToPage: { width: 1, height: 1 },
        printTitles: { rows: { start: 0, end: 0 }, columns: null, bottomRows: null },
      },
    });
    expect(preview.pages).toHaveLength(1);
    expect(preview.pages[0]).toMatchObject({
      titleRows: { start: 0, end: 0 },
      row: { start: 3, end: 7 },
    });
  });
});
