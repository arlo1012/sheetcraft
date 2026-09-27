import { describe, expect, test } from "vitest";
import { createBatchSetCellContentsCommand } from "../../../commands/values.js";
import { assertFillDataValidation } from "../../../commands/fill-validation.js";
import { DataFillError } from "../../../commands/fill-common.js";
import { getActiveSheet, getCellContent } from "../../../workbook.js";
import { createTestWorkbookSession } from "../../helpers.js";

const address = (row: number, column: number) => ({ row, column });
const literal = (value: string | number | boolean) => ({ kind: "literal" as const, value });

describe("fill data validation", () => {
  test("rejects an invalid list entry without modifying the workbook", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.dataValidations = [
      {
        id: "status",
        range: { start: address(0, 0), end: address(0, 0) },
        type: "list",
        list: ["open", "closed"],
        allowBlank: false,
      },
    ];
    const command = createBatchSetCellContentsCommand([
      { sheetId: sheet.id, address: address(0, 0), content: literal("other") },
    ]);

    expect(() => assertFillDataValidation(session.workbook, command)).toThrow(
      expect.objectContaining({ reason: "validation" }),
    );
    expect(getCellContent(sheet, address(0, 0))).toBeNull();
  });

  test("accepts a numeric value inside a stopping numeric validation", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.dataValidations = [
      {
        id: "score",
        range: { start: address(0, 0), end: address(0, 0) },
        type: "whole",
        operator: "between",
        formula1: "1",
        formula2: "10",
        allowBlank: false,
      },
    ];
    const command = createBatchSetCellContentsCommand([
      { sheetId: sheet.id, address: address(0, 0), content: literal(8) },
    ]);

    expect(() => assertFillDataValidation(session.workbook, command)).not.toThrow();
    expect(getCellContent(sheet, address(0, 0))).toBeNull();
  });

  test("evaluates validation references against the final batch values", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.dataValidations = [
      {
        id: "limit",
        range: { start: address(0, 1), end: address(0, 1) },
        type: "whole",
        operator: "lessThanOrEqual",
        formula1: "=A1",
        allowBlank: false,
      },
    ];
    const command = createBatchSetCellContentsCommand([
      { sheetId: sheet.id, address: address(0, 0), content: literal(7) },
      { sheetId: sheet.id, address: address(0, 1), content: literal(7) },
    ]);

    expect(() => assertFillDataValidation(session.workbook, command)).not.toThrow();
    expect(getCellContent(sheet, address(0, 0))).toBeNull();
    expect(getCellContent(sheet, address(0, 1))).toBeNull();
  });

  test("does not block a rule configured without error feedback", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.dataValidations = [
      {
        id: "advisory",
        range: { start: address(0, 0), end: address(0, 0) },
        type: "whole",
        operator: "between",
        formula1: "1",
        formula2: "2",
        allowBlank: false,
        showError: false,
      },
    ];
    const command = createBatchSetCellContentsCommand([
      { sheetId: sheet.id, address: address(0, 0), content: literal(9) },
    ]);

    expect(() => assertFillDataValidation(session.workbook, command)).not.toThrow();
  });

  test("rejects a formula error even when the validation allows blanks", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.dataValidations = [
      {
        id: "optional-score",
        range: { start: address(0, 0), end: address(0, 0) },
        type: "whole",
        allowBlank: true,
      },
    ];
    const command = createBatchSetCellContentsCommand([
      {
        sheetId: sheet.id,
        address: address(0, 0),
        content: { kind: "formula", formula: { source: "=1/0" } },
      },
    ]);

    expect(() => assertFillDataValidation(session.workbook, command)).toThrow(DataFillError);
    expect(getCellContent(sheet, address(0, 0))).toBeNull();
  });

  test("leaves every proposed cell unchanged after a failed validation", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    sheet.dataValidations = [
      {
        id: "positive",
        range: { start: address(0, 0), end: address(0, 1) },
        type: "whole",
        operator: "greaterThan",
        formula1: "0",
        allowBlank: false,
      },
    ];
    const command = createBatchSetCellContentsCommand([
      { sheetId: sheet.id, address: address(0, 0), content: literal(1) },
      { sheetId: sheet.id, address: address(0, 1), content: literal(0) },
    ]);

    expect(() => assertFillDataValidation(session.workbook, command)).toThrow(DataFillError);
    expect(getCellContent(sheet, address(0, 0))).toBeNull();
    expect(getCellContent(sheet, address(0, 1))).toBeNull();
  });
});
