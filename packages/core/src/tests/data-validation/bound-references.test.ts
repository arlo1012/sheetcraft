import { describe, expect, test } from "vitest";
import { createSheet, getActiveSheet, insertSheet, setCellContent } from "../../workbook.js";
import {
  validateCellDataValidation,
  validateCellContentDataValidation,
} from "../../data-validation.js";
import { createTestWorkbookSession } from "../helpers.js";

describe("data validation bound references", () => {
  test("evaluates numeric bounds from relative, absolute, calculated, and cross-sheet references", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const limits = createSheet("Limits", "limits");
    insertSheet(session.workbook, limits);
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "formula", formula: { source: "=1+2" } });
    setCellContent(sheet, { row: 1, column: 2 }, { kind: "literal", value: 4 });
    setCellContent(limits, { row: 0, column: 0 }, { kind: "literal", value: 8 });
    const relative = {
      id: "relative-bound",
      range: { start: { row: 0, column: 0 }, end: { row: 1, column: 0 } },
      type: "whole" as const,
      operator: "between" as const,
      formula1: "=C1",
      formula2: "=Limits!$A$1",
      allowBlank: false,
    };
    expect(
      validateCellDataValidation(relative, 3, {
        workbook: session.workbook,
        sheet,
        address: { row: 0, column: 0 },
      }),
    ).toEqual({ valid: true });
    expect(
      validateCellDataValidation(relative, 3, {
        workbook: session.workbook,
        sheet,
        address: { row: 1, column: 0 },
      }),
    ).toEqual({ valid: false, reason: "operator" });
    expect(
      validateCellContentDataValidation(
        relative,
        { kind: "literal", value: 4 },
        {
          workbook: session.workbook,
          sheet,
          address: { row: 1, column: 0 },
        },
      ),
    ).toEqual({ valid: true });
    setCellContent(limits, { row: 0, column: 0 }, { kind: "literal", value: 3 });
    expect(
      validateCellDataValidation(relative, 5, {
        workbook: session.workbook,
        sheet,
        address: { row: 1, column: 0 },
      }),
    ).toEqual({ valid: false, reason: "operator" });
    expect(
      validateCellDataValidation({ ...relative, formula1: "=Missing!A1", formula2: undefined }, 4, {
        workbook: session.workbook,
        sheet,
        address: { row: 0, column: 0 },
      }),
    ).toEqual({ valid: false, reason: "type" });
  });
});
