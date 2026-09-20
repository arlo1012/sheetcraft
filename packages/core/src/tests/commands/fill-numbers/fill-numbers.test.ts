import { describe, expect, test } from "vitest";
import { applyWorkbookCommand } from "../../../commands/apply.js";
import { DataFillError } from "../../../commands/fill-common.js";
import {
  createFillNumberSequenceCommand,
  createFillRankCommand,
} from "../../../commands/fill-numbers.js";
import {
  getActiveSheet,
  getCellContent,
  getCellValue,
  setCellContent,
  setCellStyle,
} from "../../../workbook.js";
import { createTestWorkbook } from "../../helpers.js";

const range = (
  startRow: number,
  startColumn: number,
  endRow = startRow,
  endColumn = startColumn,
) => ({
  start: { row: startRow, column: startColumn },
  end: { row: endRow, column: endColumn },
});

describe("fill number commands", () => {
  test("fills every selected cell in the requested row or column order and retains styles", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    setCellStyle(sheet, { row: 1, column: 2 }, { fillColor: "#abcdef" });
    applyWorkbookCommand(
      workbook,
      createFillNumberSequenceCommand(workbook, sheet.id, range(1, 1, 2, 2), {
        axis: "rows",
        start: -1,
        step: 2,
      }),
    );
    expect(
      [1, 2].flatMap((row) => [1, 2].map((column) => getCellValue(sheet, { row, column }))),
    ).toEqual([-1, 1, 3, 5]);
    expect(sheet.cells.get("1:2")?.style?.fillColor).toBe("#abcdef");

    applyWorkbookCommand(
      workbook,
      createFillNumberSequenceCommand(workbook, sheet.id, range(4, 1, 5, 2), {
        axis: "columns",
        start: 0,
        step: 1,
      }),
    );
    expect(
      [4, 5].flatMap((row) => [1, 2].map((column) => getCellValue(sheet, { row, column }))),
    ).toEqual([0, 2, 1, 3]);
  });

  test("ranks formula results, negatives and zeros while leaving nonnumeric slots blank", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: 0 });
    setCellContent(sheet, { row: 2, column: 1 }, { kind: "formula", formula: { source: "=-2" } });
    setCellContent(sheet, { row: 3, column: 1 }, { kind: "literal", value: "not a number" });
    setCellContent(sheet, { row: 4, column: 1 }, { kind: "literal", value: -2 });
    setCellContent(sheet, { row: 5, column: 1 }, { kind: "literal", value: 4 });
    const command = createFillRankCommand(workbook, {
      source: { sheetId: sheet.id, range: range(1, 1, 5, 1) },
      target: { sheetId: sheet.id, start: { row: 1, column: 2 } },
      order: "ascending",
      ties: "competition",
      overwrite: false,
    });
    const inverse = applyWorkbookCommand(workbook, command);
    expect([1, 2, 3, 4, 5].map((row) => getCellValue(sheet, { row, column: 2 }))).toEqual([
      3,
      1,
      null,
      1,
      4,
    ]);
    expect(getCellContent(sheet, { row: 3, column: 2 })).toBeNull();
    applyWorkbookCommand(workbook, inverse!);
    expect([1, 2, 3, 4, 5].map((row) => getCellValue(sheet, { row, column: 2 }))).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  test("supports dense and stable ordinal ties in horizontal sources", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    [8, 8, 3, 3].forEach((value, column) =>
      setCellContent(sheet, { row: 1, column: column + 1 }, { kind: "literal", value }),
    );
    const fill = (ties: "dense" | "ordinal", row: number) =>
      applyWorkbookCommand(
        workbook,
        createFillRankCommand(workbook, {
          source: { sheetId: sheet.id, range: range(1, 1, 1, 4) },
          target: { sheetId: sheet.id, start: { row, column: 1 } },
          order: "descending",
          ties,
          overwrite: false,
        }),
      );
    fill("dense", 2);
    fill("ordinal", 3);
    expect([1, 2, 3, 4].map((column) => getCellValue(sheet, { row: 2, column }))).toEqual([
      1, 1, 2, 2,
    ]);
    expect([1, 2, 3, 4].map((column) => getCellValue(sheet, { row: 3, column }))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  test("rejects occupied rank targets until overwrite is explicit and protects the target preflight", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 1, column: 1 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 2, column: 1 }, { kind: "literal", value: 2 });
    setCellContent(sheet, { row: 1, column: 2 }, { kind: "literal", value: "existing" });
    const options = {
      source: { sheetId: sheet.id, range: range(1, 1, 2, 1) },
      target: { sheetId: sheet.id, start: { row: 1, column: 2 } },
      order: "ascending" as const,
      ties: "competition" as const,
      overwrite: false,
    };
    expect(() => createFillRankCommand(workbook, options)).toThrow(DataFillError);
    expect(() => createFillRankCommand(workbook, options)).toThrow(
      expect.objectContaining({ reason: "targetOccupied" }),
    );
    const command = createFillRankCommand(workbook, { ...options, overwrite: true });
    applyWorkbookCommand(workbook, command);
    expect(getCellValue(sheet, { row: 1, column: 2 })).toBe(1);
    expect(getCellValue(sheet, { row: 2, column: 2 })).toBe(2);

    setCellContent(sheet, { row: 4, column: 1 }, { kind: "literal", value: "text" });
    expect(() =>
      createFillRankCommand(workbook, {
        ...options,
        source: { sheetId: sheet.id, range: range(4, 1) },
        target: { sheetId: sheet.id, start: { row: 4, column: 2 } },
        overwrite: true,
      }),
    ).toThrow(expect.objectContaining({ reason: "invalidSeed" }));
  });

  test("returns no changes when retrying an occupied output that already has the ranks", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    [1, 2].forEach((value, row) => {
      setCellContent(sheet, { row: row + 1, column: 1 }, { kind: "literal", value });
      setCellContent(sheet, { row: row + 1, column: 2 }, { kind: "literal", value });
    });
    const options = {
      source: { sheetId: sheet.id, range: range(1, 1, 2, 1) },
      target: { sheetId: sheet.id, start: { row: 1, column: 2 } },
      order: "ascending" as const,
      ties: "competition" as const,
      overwrite: false,
    };

    expect(() => createFillRankCommand(workbook, options)).toThrow(
      expect.objectContaining({ reason: "targetOccupied" }),
    );
    expect(createFillRankCommand(workbook, { ...options, overwrite: true }).changes).toEqual([]);
  });

  test("rewrites changed and formula rank outputs after an occupied-target retry", () => {
    const workbook = createTestWorkbook();
    const sheet = getActiveSheet(workbook);
    [1, 2, 3].forEach((value, row) =>
      setCellContent(sheet, { row: row + 1, column: 1 }, { kind: "literal", value }),
    );
    setCellContent(sheet, { row: 1, column: 2 }, { kind: "literal", value: 1 });
    setCellContent(sheet, { row: 2, column: 2 }, { kind: "literal", value: 99 });
    setCellContent(sheet, { row: 3, column: 2 }, { kind: "formula", formula: { source: "=3" } });
    const options = {
      source: { sheetId: sheet.id, range: range(1, 1, 3, 1) },
      target: { sheetId: sheet.id, start: { row: 1, column: 2 } },
      order: "ascending" as const,
      ties: "competition" as const,
      overwrite: false,
    };

    expect(() => createFillRankCommand(workbook, options)).toThrow(
      expect.objectContaining({ reason: "targetOccupied" }),
    );

    const command = createFillRankCommand(workbook, { ...options, overwrite: true });
    expect(command.changes.map((change) => change.address)).toEqual([
      { row: 2, column: 2 },
      { row: 3, column: 2 },
    ]);
    applyWorkbookCommand(workbook, command);
    expect([1, 2, 3].map((row) => getCellValue(sheet, { row, column: 2 }))).toEqual([1, 2, 3]);
    expect(getCellContent(sheet, { row: 3, column: 2 })).toEqual({ kind: "literal", value: 3 });
  });
});
