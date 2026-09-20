import { describe, expect, test } from "vitest";
import { applyWorkbookCommand } from "../../../commands/apply.js";
import { createFlashFillCommand } from "../../../commands/flash-fill.js";
import { createTestWorkbook } from "../../helpers.js";
import {
  getActiveSheet,
  getCellContent,
  getCellStyle,
  getCellValue,
  setCellContent,
  setCellStyle,
  setCellValue,
} from "../../../workbook.js";

const range = (row: number, column: number, endRow = row, endColumn = column) => ({
  start: { row, column },
  end: { row: endRow, column: endColumn },
});
const setup = () => {
  const workbook = createTestWorkbook();
  return { workbook, sheet: getActiveSheet(workbook) };
};

describe("Flash Fill commands", () => {
  test("extends from the nearest example, keeps headers/styles, and undoes the entire fill", () => {
    const { workbook, sheet } = setup();
    ["Email", "alice@example.com", "bob@open.ai", "carol@example.org"].forEach((value, row) =>
      setCellValue(sheet, { row, column: 0 }, value),
    );
    setCellValue(sheet, { row: 0, column: 1 }, "Name");
    setCellValue(sheet, { row: 1, column: 1 }, "alice");
    setCellStyle(sheet, { row: 2, column: 1 }, { fillColor: "#abcdef" });
    const command = createFlashFillCommand(workbook, sheet.id, range(2, 1));
    expect(command.changes.map((change) => change.address.row)).toEqual([2, 3]);
    const inverse = applyWorkbookCommand(workbook, command);
    expect([0, 1, 2, 3].map((row) => getCellValue(sheet, { row, column: 1 }))).toEqual([
      "Name",
      "alice",
      "bob",
      "carol",
    ]);
    expect(getCellStyle(sheet, { row: 2, column: 1 })?.fillColor).toBe("#abcdef");
    applyWorkbookCommand(workbook, inverse!);
    expect([1, 2, 3].map((row) => getCellValue(sheet, { row, column: 1 }))).toEqual([
      "alice",
      null,
      null,
    ]);
  });

  test("concatenates adjacent columns and respects an explicit output range", () => {
    const { workbook, sheet } = setup();
    [
      ["Ada", "Lovelace"],
      ["Grace", "Hopper"],
      ["Alan", "Turing"],
    ].forEach((values, row) =>
      values.forEach((value, column) => setCellValue(sheet, { row, column }, value)),
    );
    setCellValue(sheet, { row: 0, column: 2 }, "Lovelace, Ada");
    applyWorkbookCommand(workbook, createFlashFillCommand(workbook, sheet.id, range(0, 2, 1)));
    expect(getCellValue(sheet, { row: 1, column: 2 })).toBe("Hopper, Grace");
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBeNull();
  });

  test("rejects ambiguous examples atomically, then uses another example to disambiguate", () => {
    const { workbook, sheet } = setup();
    [
      ["Alice", "Alice"],
      ["Bob", "Carol"],
      ["Dana", "Elsa"],
    ].forEach((values, row) =>
      values.forEach((value, column) => setCellValue(sheet, { row, column }, value)),
    );
    setCellValue(sheet, { row: 0, column: 2 }, "Alice");
    expect(() => createFlashFillCommand(workbook, sheet.id, range(0, 2, 2))).toThrow(
      expect.objectContaining({ reason: "flashFillAmbiguous" }),
    );
    expect(getCellValue(sheet, { row: 1, column: 2 })).toBeNull();
    setCellValue(sheet, { row: 1, column: 2 }, "Bob");
    applyWorkbookCommand(workbook, createFlashFillCommand(workbook, sheet.id, range(0, 2, 2)));
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBe("Dana");
  });

  test("uses displayed source values and preserves existing formulas even when they show empty text", () => {
    const { workbook, sheet } = setup();
    [7, 8, 9].forEach((value, row) => {
      setCellContent(
        sheet,
        { row, column: 0 },
        { kind: "formula", formula: { source: `=${value}` } },
      );
      setCellStyle(sheet, { row, column: 0 }, { numberFormat: { kind: "custom", code: "0000" } });
    });
    setCellValue(sheet, { row: 0, column: 1 }, "ID-0007");
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "formula", formula: { source: '=""' } });
    const command = createFlashFillCommand(workbook, sheet.id, range(0, 1, 2));
    applyWorkbookCommand(workbook, command);
    expect(getCellValue(sheet, { row: 2, column: 1 })).toBe("ID-0009");
    expect(getCellContent(sheet, { row: 1, column: 1 })?.kind).toBe("formula");
    expect(getCellContent(sheet, { row: 2, column: 0 })?.kind).toBe("formula");
  });

  test("requires a destination column, source data and a literal example", () => {
    const { workbook, sheet } = setup();
    expect(() => createFlashFillCommand(workbook, sheet.id, range(0, 1, 2, 2))).toThrow(
      expect.objectContaining({ reason: "flashFillRange" }),
    );
    setCellValue(sheet, { row: 0, column: 1 }, "example");
    expect(() => createFlashFillCommand(workbook, sheet.id, range(0, 1))).toThrow(
      expect.objectContaining({ reason: "flashFillSource" }),
    );
    setCellValue(sheet, { row: 0, column: 0 }, "A-01");
    setCellValue(sheet, { row: 1, column: 0 }, "B-02");
    setCellValue(sheet, { row: 0, column: 1 }, null);
    expect(() => createFlashFillCommand(workbook, sheet.id, range(0, 1))).toThrow(
      expect.objectContaining({ reason: "flashFillExamples" }),
    );
  });

  test("preflights protected, hidden and merged targets before any writes", () => {
    const { workbook, sheet } = setup();
    setCellValue(sheet, { row: 0, column: 0 }, "A-01");
    setCellValue(sheet, { row: 1, column: 0 }, "B-02");
    setCellValue(sheet, { row: 0, column: 1 }, "A");
    sheet.properties.protected = true;
    expect(() => createFlashFillCommand(workbook, sheet.id, range(0, 1))).toThrow(
      expect.objectContaining({ reason: "protected" }),
    );
    sheet.properties.protected = false;
    sheet.hiddenRows = new Set([1]);
    expect(() => createFlashFillCommand(workbook, sheet.id, range(0, 1))).toThrow(
      expect.objectContaining({ reason: "hiddenCells" }),
    );
    sheet.hiddenRows = new Set();
    sheet.mergedCells = [range(1, 1, 1, 2)];
    expect(() => createFlashFillCommand(workbook, sheet.id, range(0, 1))).toThrow(
      expect.objectContaining({ reason: "mergedCells" }),
    );
    expect(getCellValue(sheet, { row: 1, column: 1 })).toBeNull();
  });
});
