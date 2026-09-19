import { describe, expect, test } from "vitest";
import {
  createConvertCellValueTypeCommand,
  createMergeCellsCommand,
} from "../../../commands/index.js";
import {
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../../history.js";
import {
  getCellContent,
  getCellStyle,
  getCellValue,
  setCellContent,
  setCellStyle,
} from "../../../workbook.js";
import { createTestWorkbookSession } from "../../helpers.js";

describe("cell value type conversion", () => {
  test("converts complete numeric text while leaving formulas and unrelated literals intact", () => {
    const session = createTestWorkbookSession();
    const sheet = session.workbook.sheets.get(session.workbook.activeSheetId)!;
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "1,250.5" });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "12.5%" });
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "literal", value: "1.2e3" });
    setCellContent(sheet, { row: 1, column: 0 }, { kind: "literal", value: "2026-09-13" });
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: "12 apples" });
    setCellContent(
      sheet,
      { row: 1, column: 2 },
      { kind: "formula", formula: { source: "=A1+B1" } },
    );
    setCellContent(sheet, { row: 2, column: 0 }, { kind: "literal", value: "42" });

    expect(
      executeWorkbookCommand(
        session,
        createConvertCellValueTypeCommand(
          sheet,
          { start: { row: 1, column: 2 }, end: { row: 0, column: 0 } },
          "text-to-number",
        ),
      ),
    ).toBe(true);

    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: 1250.5,
    });
    expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual({ kind: "literal", value: 0.125 });
    expect(getCellContent(sheet, { row: 0, column: 2 })).toEqual({ kind: "literal", value: 1200 });
    expect(getCellContent(sheet, { row: 1, column: 0 })).toEqual({
      kind: "literal",
      value: "2026-09-13",
    });
    expect(getCellContent(sheet, { row: 1, column: 1 })).toEqual({
      kind: "literal",
      value: "12 apples",
    });
    expect(getCellContent(sheet, { row: 1, column: 2 })).toEqual({
      kind: "formula",
      formula: { source: "=A1+B1" },
    });
    expect(getCellContent(sheet, { row: 2, column: 0 })).toEqual({ kind: "literal", value: "42" });
  });

  test("changes SUM meaning, preserves non-number style fields, and undoes/redoes as one entry", () => {
    const session = createTestWorkbookSession();
    const sheet = session.workbook.sheets.get(session.workbook.activeSheetId)!;
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "5" });
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        bold: true,
        fillColor: "#abcdef",
        numberFormat: { kind: "percent", fractionDigits: 1 },
      },
    );
    setCellContent(
      sheet,
      { row: 0, column: 1 },
      { kind: "formula", formula: { source: "=SUM(A1)" } },
    );

    expect(getCellValue(sheet, { row: 0, column: 1 })).toBe(0);
    expect(
      executeWorkbookCommand(
        session,
        createConvertCellValueTypeCommand(
          sheet,
          { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
          "text-to-number",
        ),
      ),
    ).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(getCellValue(sheet, { row: 0, column: 1 })).toBe(5);
    expect(getCellStyle(sheet, { row: 0, column: 0 })).toEqual({
      bold: true,
      fillColor: "#abcdef",
    });

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value: "5" });
    expect(getCellStyle(sheet, { row: 0, column: 0 })?.numberFormat).toEqual({
      kind: "percent",
      fractionDigits: 1,
    });
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({ kind: "literal", value: 5 });
  });

  test("converts numbers to text, including a merged selection, and applies text format", () => {
    const session = createTestWorkbookSession();
    const sheet = session.workbook.sheets.get(session.workbook.activeSheetId)!;
    const merged = { start: { row: 0, column: 0 }, end: { row: 0, column: 1 } };
    setCellContent(sheet, merged.start, { kind: "literal", value: 42.5 });
    setCellStyle(sheet, merged.start, {
      italic: true,
      numberFormat: { kind: "number", fractionDigits: 2 },
    });
    expect(executeWorkbookCommand(session, createMergeCellsCommand(sheet.id, merged))).toBe(true);

    expect(
      executeWorkbookCommand(
        session,
        createConvertCellValueTypeCommand(
          sheet,
          { start: { row: 0, column: 1 }, end: { row: 0, column: 1 } },
          "number-to-text",
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, merged.start)).toEqual({ kind: "literal", value: "42.5" });
    expect(getCellStyle(sheet, merged.start)).toEqual({
      italic: true,
      numberFormat: { kind: "text" },
    });
  });

  test("protects precision-sensitive and underflowing numeric text while allowing literal zero", () => {
    const session = createTestWorkbookSession();
    const sheet = session.workbook.sheets.get(session.workbook.activeSheetId)!;
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "123456789012345678" });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "1e-999" });
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "literal", value: "1e-999%" });
    setCellContent(sheet, { row: 0, column: 3 }, { kind: "literal", value: "0e-999" });

    expect(
      executeWorkbookCommand(
        session,
        createConvertCellValueTypeCommand(
          sheet,
          { start: { row: 0, column: 0 }, end: { row: 0, column: 3 } },
          "text-to-number",
        ),
      ),
    ).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "123456789012345678",
    });
    expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual({
      kind: "literal",
      value: "1e-999",
    });
    expect(getCellContent(sheet, { row: 0, column: 2 })).toEqual({
      kind: "literal",
      value: "1e-999%",
    });
    expect(getCellContent(sheet, { row: 0, column: 3 })).toEqual({ kind: "literal", value: 0 });
  });

  test("opt-in conversion rounds over-precision text and restores General formatting", () => {
    const session = createTestWorkbookSession();
    const sheet = session.workbook.sheets.get(session.workbook.activeSheetId)!;
    const address = { row: 0, column: 0 };
    setCellContent(sheet, address, { kind: "literal", value: "11111111111111111111" });
    setCellStyle(sheet, address, {
      bold: true,
      fillColor: "#abcdef",
      numberFormat: { kind: "text" },
    });

    expect(
      executeWorkbookCommand(
        session,
        createConvertCellValueTypeCommand(
          sheet,
          { start: address, end: address },
          "text-to-number",
          { allowPrecisionLoss: true },
        ),
      ),
    ).toBe(true);
    expect(getCellContent(sheet, address)).toEqual({
      kind: "literal",
      value: Number("1.11111111111111e19"),
    });
    expect(getCellStyle(sheet, address)).toEqual({
      bold: true,
      fillColor: "#abcdef",
    });

    expect(undoWorkbookCommand(session)).toBe(true);
    expect(getCellContent(sheet, address)).toEqual({
      kind: "literal",
      value: "11111111111111111111",
    });
    expect(getCellStyle(sheet, address)).toEqual({
      bold: true,
      fillColor: "#abcdef",
      numberFormat: { kind: "text" },
    });
  });

  test.each([
    ["9999999999999999", 1e16],
    ["-1234567890123456", -1.23456789012346e15],
    ["0.0001234567890123456", 0.000123456789012346],
    ["1.234567890123456e20", 1.23456789012346e20],
    ["1234567890123456%", 1.23456789012346e13],
    ["1,234,567,890,123,456", 1.23456789012346e15],
  ])(
    "rounds %s to 15 significant digits and clears the previous number format",
    (source, value) => {
      const session = createTestWorkbookSession();
      const sheet = session.workbook.sheets.get(session.workbook.activeSheetId)!;
      const address = { row: 0, column: 0 };
      setCellContent(sheet, address, { kind: "literal", value: source });
      setCellStyle(sheet, address, { numberFormat: { kind: "scientific", fractionDigits: 5 } });

      expect(
        executeWorkbookCommand(
          session,
          createConvertCellValueTypeCommand(
            sheet,
            { start: address, end: address },
            "text-to-number",
            { allowPrecisionLoss: true },
          ),
        ),
      ).toBe(true);
      expect(getCellContent(sheet, address)).toEqual({ kind: "literal", value });
      expect(getCellStyle(sheet, address)?.numberFormat).toBeUndefined();
    },
  );

  test("opt-in precision conversion still rejects overflowing and underflowing values", () => {
    const session = createTestWorkbookSession();
    const sheet = session.workbook.sheets.get(session.workbook.activeSheetId)!;
    setCellContent(
      sheet,
      { row: 0, column: 0 },
      { kind: "literal", value: "123456789012345678e999" },
    );
    setCellContent(
      sheet,
      { row: 0, column: 1 },
      { kind: "literal", value: "123456789012345678e-999" },
    );

    expect(
      executeWorkbookCommand(
        session,
        createConvertCellValueTypeCommand(
          sheet,
          { start: { row: 0, column: 0 }, end: { row: 0, column: 1 } },
          "text-to-number",
          { allowPrecisionLoss: true },
        ),
      ),
    ).toBe(false);
    expect(getCellContent(sheet, { row: 0, column: 0 })).toEqual({
      kind: "literal",
      value: "123456789012345678e999",
    });
    expect(getCellContent(sheet, { row: 0, column: 1 })).toEqual({
      kind: "literal",
      value: "123456789012345678e-999",
    });
  });

  test("creates no history entry when nothing matches", () => {
    const session = createTestWorkbookSession();
    const sheet = session.workbook.sheets.get(session.workbook.activeSheetId)!;
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "not a number" });

    expect(
      executeWorkbookCommand(
        session,
        createConvertCellValueTypeCommand(
          sheet,
          { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
          "text-to-number",
        ),
      ),
    ).toBe(false);
    expect(session.history.undoStack).toHaveLength(0);
  });
});
