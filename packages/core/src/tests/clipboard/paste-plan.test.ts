import { describe, expect, test } from "vitest";
import { createPastePlan, tileCellMatrix } from "../../clipboard.js";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "../../workbook.js";

describe("clipboard paste plan", () => {
  test("expands a matrix from a single active cell", () => {
    expect(
      createPastePlan(
        [
          ["A", "B"],
          ["C", "D"],
        ],
        { start: { row: 2, column: 3 }, end: { row: 2, column: 3 } },
        { row: 2, column: 3 },
      ),
    ).toEqual({
      anchor: { row: 2, column: 3 },
      range: { start: { row: 2, column: 3 }, end: { row: 3, column: 4 } },
      values: [
        ["A", "B"],
        ["C", "D"],
      ],
    });
  });

  test("tiles a matrix across an evenly divisible selected range", () => {
    expect(
      createPastePlan(
        [[1, 2]],
        { start: { row: 1, column: 1 }, end: { row: 2, column: 4 } },
        { row: 1, column: 1 },
      )?.values,
    ).toEqual([
      [1, 2, 1, 2],
      [1, 2, 1, 2],
    ]);
  });

  test("tiles generic cell metadata without coercing null entries", () => {
    expect(tileCellMatrix([[{ bold: true }, null]], { rowCount: 2, columnCount: 4 })).toEqual([
      [{ bold: true }, null, { bold: true }, null],
      [{ bold: true }, null, { bold: true }, null],
    ]);
    expect(() => tileCellMatrix([[1]], { rowCount: 0, columnCount: 1 })).toThrow(RangeError);
  });

  test("rejects incompatible selected dimensions and sheet overflow", () => {
    expect(
      createPastePlan(
        [[1, 2]],
        { start: { row: 0, column: 0 }, end: { row: 1, column: 2 } },
        { row: 0, column: 0 },
      ),
    ).toBeNull();
    expect(
      createPastePlan(
        [[1, 2]],
        {
          start: { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
          end: { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
        },
        { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
      ),
    ).toBeNull();
  });

  test("forces cut moves to begin at the active cell", () => {
    expect(
      createPastePlan(
        [
          ["A", "B"],
          ["C", "D"],
        ],
        { start: { row: 5, column: 5 }, end: { row: 7, column: 7 } },
        { row: 6, column: 6 },
        { pasteFromActiveCell: true },
      )?.range,
    ).toEqual({ start: { row: 6, column: 6 }, end: { row: 7, column: 7 } });
  });
});
