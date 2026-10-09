import { createWorkbook, getActiveSheet, setCellContent } from "@sheetcraft/core/workbook";
import { describe, expect, test } from "vitest";
import { createFormulaCacheEligibility } from "../formula-cache.js";

describe("formula cache eligibility", () => {
  test("handles a 15,000-cell reverse-inserted dependency chain without recursion", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 14_999, column: 0 }, { kind: "literal", value: 1 });
    for (let row = 14_998; row >= 0; row -= 1)
      setCellContent(
        sheet,
        { row, column: 0 },
        {
          kind: "formula",
          formula: { source: `=A${row + 2}+1` },
        },
      );
    expect(createFormulaCacheEligibility(workbook)(sheet.id, 0, 0)).toBe(true);
  });

  test("keeps independent sparse-range formula eligibility isolated", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    for (let row = 0; row < 500; row += 1) {
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: row });
      setCellContent(
        sheet,
        { row, column: 1 },
        {
          kind: "formula",
          formula: { source: `=SUM(A${row + 1}:A${row + 1})` },
        },
      );
    }
    setCellContent(
      sheet,
      { row: 1_000, column: 0 },
      {
        kind: "formula",
        formula: { source: "=UNKNOWN(1)" },
      },
    );
    setCellContent(
      sheet,
      { row: 1_000, column: 1 },
      {
        kind: "formula",
        formula: { source: "=IFERROR(A1001,0)" },
      },
    );
    const eligible = createFormulaCacheEligibility(workbook);
    for (let row = 0; row < 500; row += 1) expect(eligible(sheet.id, row, 1)).toBe(true);
    expect(eligible(sheet.id, 1_000, 1)).toBe(false);
  });

  test("fails closed for a formula cycle", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "formula", formula: { source: "=B1" } });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "formula", formula: { source: "=A1" } });
    expect(createFormulaCacheEligibility(workbook)(sheet.id, 0, 0)).toBe(false);
  });

  test("leaves whole-axis formulas for Excel recalculation while retaining their source", () => {
    const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=SUM(A:A)" } },
    );
    expect(createFormulaCacheEligibility(workbook)(sheet.id, 0, 0)).toBe(false);
  });
});
