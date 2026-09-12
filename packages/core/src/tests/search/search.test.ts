import { describe, expect, test } from "vitest";
import { createTestWorkbook } from "../helpers.js";
import { findCellByText } from "../../search.js";
import {
  createSheet,
  createWorkbookEvaluator,
  getActiveSheet,
  setCellContent,
  setCellValue,
} from "../../workbook.js";

describe("sparse sheet search", () => {
  test("finds values in row order and wraps in either direction", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellValue(sheet, { row: 9, column: 1 }, "Needle last");
    setCellValue(sheet, { row: 1, column: 4 }, "needle first");
    setCellValue(sheet, { row: 3, column: 0 }, "other");

    expect(findCellByText(sheet, "NEEDLE", { row: 0, column: 0 })).toEqual({
      row: 1,
      column: 4,
    });
    expect(findCellByText(sheet, "needle", { row: 1, column: 4 })).toEqual({
      row: 9,
      column: 1,
    });
    expect(findCellByText(sheet, "needle", { row: 9, column: 1 })).toEqual({
      row: 1,
      column: 4,
    });
    expect(findCellByText(sheet, "needle", { row: 1, column: 4 }, "backward")).toEqual({
      row: 9,
      column: 1,
    });
  });

  test("matches formatted booleans and numbers without materializing empty cells", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellValue(sheet, { row: 800_000, column: 10_000 }, true);
    setCellValue(sheet, { row: 2, column: 2 }, 1200);

    expect(findCellByText(sheet, "true", { row: 0, column: 0 })).toEqual({
      row: 800_000,
      column: 10_000,
    });
    expect(findCellByText(sheet, "200", { row: 0, column: 0 })).toEqual({
      row: 2,
      column: 2,
    });
    expect(findCellByText(sheet, "missing", { row: 0, column: 0 })).toBeNull();
    expect(findCellByText(sheet, "   ", { row: 0, column: 0 })).toBeNull();
  });

  test("matches cross-sheet computed values with an injected evaluator", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    const inputs = createSheet("Inputs", "inputs");
    workbook.sheets.set(inputs.id, inputs);
    setCellValue(inputs, { row: 0, column: 0 }, "Needle");
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=Inputs!A1" },
      },
    );

    expect(
      findCellByText(
        sheet,
        "needle",
        { row: 0, column: 1 },
        "forward",
        createWorkbookEvaluator(workbook, sheet.id),
      ),
    ).toEqual({ row: 0, column: 0 });
  });
});
