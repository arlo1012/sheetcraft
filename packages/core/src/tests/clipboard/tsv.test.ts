import { describe, expect, test } from "vitest";
import {
  getCellRangeValues,
  parseTsvToCellValues,
  serializeCellValuesToTsv,
} from "../../clipboard.js";
import { createSheet, setCellValue } from "../../workbook.js";

describe("workbook TSV clipboard", () => {
  test("serializes a rectangular range with empty cells", () => {
    const sheet = createSheet();
    setCellValue(sheet, { row: 1, column: 1 }, "Name");
    setCellValue(sheet, { row: 1, column: 2 }, 42);
    setCellValue(sheet, { row: 2, column: 2 }, true);

    const values = getCellRangeValues(sheet, {
      start: { row: 1, column: 1 },
      end: { row: 2, column: 2 },
    });

    expect(values).toEqual([
      ["Name", 42],
      [null, true],
    ]);
    expect(serializeCellValuesToTsv(values)).toBe("Name\t42\r\n\tTRUE");
  });

  test("quotes tabs, line breaks, and quotes", () => {
    const values = [["A\tB", 'He said "yes"', "Line 1\nLine 2"]];
    const text = serializeCellValuesToTsv(values);

    expect(text).toBe('"A\tB"\t"He said ""yes"""\t"Line 1\nLine 2"');
    expect(parseTsvToCellValues(text)).toEqual(values);
  });

  test("accepts CRLF, LF, trailing empty columns, and uneven rows", () => {
    expect(parseTsvToCellValues("1\t\r\nTRUE\nText\t2\textra\n")).toEqual([
      [1, null, null],
      [true, null, null],
      ["Text", 2, "extra"],
    ]);
  });

  test("parses blank clipboard text as one empty cell", () => {
    expect(parseTsvToCellValues("")).toEqual([[null]]);
  });
});
