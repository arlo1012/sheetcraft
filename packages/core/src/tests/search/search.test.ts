import { describe, expect, test } from "vitest";
import { createTestWorkbook } from "../helpers.js";
import { findCellByText, findCellsByText } from "../../search.js";
import {
  createSheet,
  createWorkbookEvaluator,
  getActiveSheet,
  setCellContent,
  setCellStyle,
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

describe("advanced sparse sheet search", () => {
  test("returns all sparse matches in row or column order and wraps with that order", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellValue(sheet, { row: 2, column: 0 }, "needle");
    setCellValue(sheet, { row: 0, column: 3 }, "needle");
    setCellValue(sheet, { row: 1, column: 1 }, "needle");

    expect(findCellsByText(sheet, "needle")).toEqual([
      { row: 0, column: 3 },
      { row: 1, column: 1 },
      { row: 2, column: 0 },
    ]);
    expect(findCellsByText(sheet, "needle", undefined, { order: "columns" })).toEqual([
      { row: 2, column: 0 },
      { row: 1, column: 1 },
      { row: 0, column: 3 },
    ]);
    expect(
      findCellByText(sheet, "needle", { row: 1, column: 1 }, "forward", undefined, {
        order: "columns",
      }),
    ).toEqual({ row: 0, column: 3 });
    expect(
      findCellByText(sheet, "needle", { row: 0, column: 3 }, "forward", undefined, {
        order: "columns",
      }),
    ).toEqual({ row: 2, column: 0 });
    expect(
      findCellByText(sheet, "needle", { row: 2, column: 0 }, "backward", undefined, {
        order: "columns",
      }),
    ).toEqual({ row: 0, column: 3 });
  });

  test("searches smart raw input and values independently, including an injected evaluator", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    const inputs = createSheet("Inputs", "inputs");
    workbook.sheets.set(inputs.id, inputs);
    setCellValue(inputs, { row: 0, column: 0 }, "evaluated needle");
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      {
        kind: "formula",
        formula: { source: "=Inputs!A1" },
      },
    );
    setCellValue(sheet, { row: 1, column: 0 }, "literal needle");
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);

    expect(findCellsByText(sheet, "Inputs!A1", evaluator)).toEqual([{ row: 0, column: 0 }]);
    expect(findCellsByText(sheet, "evaluated needle", evaluator, { lookIn: "values" })).toEqual([
      { row: 0, column: 0 },
    ]);
    expect(findCellsByText(sheet, "Inputs!A1", evaluator, { lookIn: "values" })).toEqual([]);
    expect(findCellsByText(sheet, "literal needle", evaluator, { lookIn: "formulas" })).toEqual([
      { row: 1, column: 0 },
    ]);
  });

  test("supports wildcard escape, newlines, case, whole-cell, and width flags", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellValue(sheet, { row: 0, column: 0 }, "Part*?\nNeedle");
    setCellValue(sheet, { row: 1, column: 0 }, "ＡＢＣ");
    setCellValue(sheet, { row: 2, column: 0 }, "~abc");

    expect(findCellsByText(sheet, "Part~*~?*Needle")).toEqual([{ row: 0, column: 0 }]);
    expect(
      findCellsByText(sheet, "Part~*~?\nNeedle", undefined, { matchEntireCell: true }),
    ).toEqual([{ row: 0, column: 0 }]);
    expect(findCellsByText(sheet, "needle", undefined, { matchCase: true })).toEqual([]);
    expect(findCellsByText(sheet, "\n")).toEqual([{ row: 0, column: 0 }]);
    expect(findCellsByText(sheet, "~abc", undefined, { matchEntireCell: true })).toEqual([
      { row: 2, column: 0 },
    ]);
    expect(findCellsByText(sheet, "~~abc", undefined, { matchEntireCell: true })).toEqual([
      { row: 2, column: 0 },
    ]);
    expect(findCellsByText(sheet, "ABC", undefined, { matchEntireCell: true })).toEqual([
      { row: 1, column: 0 },
    ]);
    expect(
      findCellsByText(sheet, "ABC", undefined, { matchEntireCell: true, matchWidth: true }),
    ).toEqual([]);
  });

  test("finds sparse style-only cells without mutating the sheet", () => {
    const sheet = getActiveSheet(createTestWorkbook());
    setCellStyle(sheet, { row: 4, column: 2 }, { fillColor: "#ff0000" });
    setCellStyle(sheet, { row: 4, column: 3 }, { fillColor: "#00ff00" });
    setCellStyle(
      sheet,
      { row: 5, column: 2 },
      {
        numberFormat: { kind: "number", fractionDigits: 1, useGrouping: true },
      },
    );
    setCellValue(sheet, { row: 6, column: 2 }, "value");
    const before = structuredClone([...sheet.cells]);

    expect(
      findCellsByText(sheet, "", undefined, {
        format: { style: { fillColor: "#ff0000" }, keys: ["fillColor"] },
      }),
    ).toEqual([{ row: 4, column: 2 }]);
    expect(
      findCellsByText(sheet, "", undefined, {
        format: { style: {}, keys: ["fillColor"] },
      }),
    ).toEqual([
      { row: 5, column: 2 },
      { row: 6, column: 2 },
    ]);
    expect(
      findCellsByText(sheet, "", undefined, {
        format: {
          style: { numberFormat: { useGrouping: true, fractionDigits: 1, kind: "number" } },
          keys: ["numberFormat"],
        },
      }),
    ).toEqual([{ row: 5, column: 2 }]);
    expect(sheet.cells.size).toBe(4);
    expect([...sheet.cells]).toEqual(before);
  });
});
