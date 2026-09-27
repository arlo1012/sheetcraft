import { describe, expect, test } from "vitest";
import {
  createApplyDataProofreadingCommand,
  scanDataProofreading,
} from "../../data-proofreading.js";
import { WorkbookDomainError } from "../../errors.js";
import { executeWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { getCellContent, getCellStyle, setCellContent, setCellStyle } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function whole() {
  return { start: { row: 0, column: 0 }, end: { row: 10, column: 10 } };
}

describe("data proofreading", () => {
  test("scans only sparse literals and proposes safe type and format corrections", () => {
    const session = createTestWorkbookSession();
    const sheet = session.workbook.sheets.get(session.workbook.activeSheetId)!;
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "1,250.50" });
    setCellStyle(sheet, { row: 0, column: 0 }, { bold: true, numberFormat: { kind: "text" } });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "2026/09/27" });
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "literal", value: "09:15:02" });
    setCellContent(sheet, { row: 0, column: 3 }, { kind: "literal", value: "12.5%" });
    setCellContent(sheet, { row: 0, column: 4 }, { kind: "literal", value: "￥1,234.50" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "formula", formula: { source: "=1" } });

    const scan = scanDataProofreading(session.workbook, sheet.id, whole());
    expect(scan.scannedCount).toBe(5);
    expect(scan.issues.map((item) => item.kind)).toEqual([
      "number",
      "date",
      "time",
      "percent",
      "currency",
    ]);
    expect(scan.issues.every((item) => item.proposed)).toBe(true);

    const command = createApplyDataProofreadingCommand(session.workbook, sheet.id, scan.issues);
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: 1250.5,
    });
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toEqual({ bold: true });
    expect(getCellStyle(sheet, { row: 0, column: 1 })?.numberFormat).toEqual({
      kind: "date",
      code: "yyyy-mm-dd",
    });
    expect(getCellStyle(sheet, { row: 0, column: 2 })?.numberFormat).toEqual({
      kind: "time",
      code: "hh:mm:ss",
    });
    expect(getCellContent(sheet, { row: 0, column: 3 })).toEqual({ kind: "literal", value: 0.125 });
    expect(getCellStyle(sheet, { row: 0, column: 4 })?.numberFormat).toMatchObject({
      kind: "currency",
      currency: "CNY",
      currencySymbol: "￥",
    });
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "1,250.50",
    });
  });

  test("advises rather than coercing identifiers, leading zeros, precision-sensitive text, or ambiguous dates", () => {
    const session = createTestWorkbookSession();
    const sheet = session.workbook.sheets.get(session.workbook.activeSheetId)!;
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "11010519491231002X" });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "001234" });
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "literal", value: "1234567890123456" });
    setCellContent(sheet, { row: 0, column: 3 }, { kind: "literal", value: "09/27/2026" });
    const issues = scanDataProofreading(session.workbook, sheet.id, whole()).issues;
    expect(issues.map((item) => [item.kind, item.reason, item.proposed])).toEqual([
      ["identity", "identityText", undefined],
      ["number", "unsafeLeadingZero", undefined],
      ["number", "unsafePrecision", undefined],
      ["date", "ambiguousDate", undefined],
    ]);
  });

  test("keeps invalid or ambiguous date-time values and underflowing percentages advisory-only", () => {
    const session = createTestWorkbookSession();
    const sheet = session.workbook.sheets.get(session.workbook.activeSheetId)!;
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "2026-02-29" });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "09/27/2026" });
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "literal", value: "25:00" });
    setCellContent(sheet, { row: 0, column: 3 }, { kind: "literal", value: "1e-322%" });
    setCellContent(sheet, { row: 0, column: 4 }, { kind: "literal", value: "0,123" });
    expect(
      scanDataProofreading(session.workbook, sheet.id, whole()).issues.map((item) => [
        item.kind,
        item.reason,
        item.proposed,
      ]),
    ).toEqual([
      ["date", "invalidDate", undefined],
      ["date", "ambiguousDate", undefined],
      ["time", "invalidTime", undefined],
      ["percent", "unsafeUnderflow", undefined],
      ["number", "unsafeLeadingZero", undefined],
    ]);
  });

  test("honors the workbook date system at its lower boundary", () => {
    const session = createTestWorkbookSession();
    const sheet = session.workbook.sheets.get(session.workbook.activeSheetId)!;
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "1900-02-29" });
    expect(
      scanDataProofreading(session.workbook, sheet.id, whole()).issues[0]?.proposed?.content,
    ).toEqual({
      kind: "literal",
      value: 60,
    });
    session.workbook.dateSystem = "1904";
    expect(scanDataProofreading(session.workbook, sheet.id, whole()).issues[0]).toMatchObject({
      kind: "date",
      reason: "invalidDate",
    });
  });

  test("rejects stale selections and does not apply advisory-only entries", () => {
    const session = createTestWorkbookSession();
    const sheet = session.workbook.sheets.get(session.workbook.activeSheetId)!;
    const address = { row: 0, column: 0 };
    setCellContent(sheet, address, { kind: "literal", value: "12" });
    const [issue] = scanDataProofreading(session.workbook, sheet.id, whole()).issues;
    setCellContent(sheet, address, { kind: "literal", value: "13" });
    expect(() => createApplyDataProofreadingCommand(session.workbook, sheet.id, [issue!])).toThrow(
      expect.objectContaining({
        data: expect.objectContaining({ code: "invalid_command_payload" }),
      }),
    );
    setCellContent(sheet, address, { kind: "literal", value: "0012" });
    const [advisory] = scanDataProofreading(session.workbook, sheet.id, whole()).issues;
    expect(() =>
      createApplyDataProofreadingCommand(session.workbook, sheet.id, [advisory!]),
    ).toThrow(WorkbookDomainError);
  });

  test("uses existing protection and data-validation preflight without mutating the sheet", () => {
    const session = createTestWorkbookSession();
    const sheet = session.workbook.sheets.get(session.workbook.activeSheetId)!;
    const address = { row: 0, column: 0 };
    setCellContent(sheet, address, { kind: "literal", value: "12" });
    sheet.dataValidations = [
      {
        id: "limit",
        range: { start: address, end: address },
        type: "whole",
        operator: "between",
        formula1: "1",
        formula2: "10",
        allowBlank: false,
      },
    ];
    const [issue] = scanDataProofreading(session.workbook, sheet.id, whole()).issues;
    expect(() =>
      createApplyDataProofreadingCommand(session.workbook, sheet.id, [issue!]),
    ).toThrow();
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "12" });
    sheet.dataValidations = [];
    const [safe] = scanDataProofreading(session.workbook, sheet.id, whole()).issues;
    const command = createApplyDataProofreadingCommand(session.workbook, sheet.id, [safe!]);
    sheet.properties.protected = true;
    expect(() => executeWorkbookCommand(session, command)).toThrow();
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "12" });
  });

  test("rejects a selected correction that would violate duplicate rejection before creating a batch", () => {
    const session = createTestWorkbookSession();
    const sheet = session.workbook.sheets.get(session.workbook.activeSheetId)!;
    const address = { row: 0, column: 0 };
    setCellContent(sheet, address, { kind: "literal", value: "2" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: 2 });
    sheet.duplicateRules = [
      {
        id: "reject",
        kind: "reject",
        range: { start: address, end: { row: 1, column: 0 } },
      },
    ];
    const [issue] = scanDataProofreading(session.workbook, sheet.id, whole()).issues;
    expect(() =>
      createApplyDataProofreadingCommand(session.workbook, sheet.id, [issue!]),
    ).toThrow();
    expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value: "2" });
    expect(session.history.undoStack).toHaveLength(0);
  });
});
