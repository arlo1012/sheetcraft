import { describe, expect, test } from "vitest";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_HEIGHT,
  createSheet,
  setCellStyle,
  setCellValue,
  type Cell,
  type CellAddress,
} from "@idea10/core/workbook";
import type { FormulaValue } from "@idea10/core/formula";
import type { TextMeasurer } from "@idea10/sheet-engine/text-layout";
import {
  getAutoFitColumnWidths,
  getAutoFitRowHeights,
} from "../../../../modules/sheet-grid/axis-auto-fit";

const measurer: TextMeasurer = {
  measure: (text, font) => Array.from(text).length * font.size,
};

const wholeSheetRange = {
  start: { row: 0, column: 0 },
  end: { row: 20, column: 20 },
};

function getValue(_address: CellAddress, cell: Readonly<Cell>): FormulaValue {
  return cell.content?.kind === "literal" ? cell.content.value : null;
}

describe("axis auto fit", () => {
  test("fits a row to formatted wrapped text, explicit line breaks, and its largest font", () => {
    const sheet = createSheet("Sheet1", "sheet-1");
    sheet.columnWidths.set(0, 50);
    setCellValue(sheet, { row: 2, column: 0 }, "abcd efgh");
    setCellStyle(sheet, { row: 2, column: 0 }, { wrapText: true });
    setCellValue(sheet, { row: 2, column: 1 }, 1);
    setCellStyle(sheet, { row: 2, column: 1 }, { fontSize: 20 });
    setCellValue(sheet, { row: 3, column: 0 }, "a\nb");

    const sizes = getAutoFitRowHeights({
      sheet,
      range: wholeSheetRange,
      getComputedValue: getValue,
      formatValue: (_address, _cell, value) =>
        value === 1 ? "formatted value" : String(value ?? ""),
      measurer,
    });

    expect(sizes.get(2)).toBeGreaterThan(DEFAULT_ROW_HEIGHT);
    expect(sizes.get(3)).toBeGreaterThan(DEFAULT_ROW_HEIGHT);
  });

  test("fits a column from the rendered value and ignores wrap when finding the natural width", () => {
    const sheet = createSheet("Sheet1", "sheet-1");
    setCellValue(sheet, { row: 0, column: 4 }, "short");
    setCellValue(sheet, { row: 1, column: 4 }, "1234");
    setCellStyle(sheet, { row: 1, column: 4 }, { wrapText: true, bold: true });
    setCellValue(sheet, { row: 0, column: 5 }, "x");

    const sizes = getAutoFitColumnWidths({
      sheet,
      range: wholeSheetRange,
      getComputedValue: getValue,
      formatValue: (_address, _cell, value) =>
        value === "1234" ? "long formatted value" : String(value),
      measurer,
    });

    expect(sizes.get(4)).toBeGreaterThan(DEFAULT_COLUMN_WIDTH);
    expect(sizes.get(4)).toBeGreaterThan(sizes.get(5) ?? 0);
    expect(sizes.get(5)).toBeLessThan(DEFAULT_COLUMN_WIDTH);
  });

  test("resets only pre-existing blank manual dimensions without walking every empty target", () => {
    const sheet = createSheet("Sheet1", "sheet-1");
    sheet.rowHeights.set(5, 60);
    sheet.columnWidths.set(6, 180);

    expect(
      getAutoFitRowHeights({ sheet, range: wholeSheetRange, getComputedValue: getValue, measurer }),
    ).toEqual(new Map([[5, DEFAULT_ROW_HEIGHT]]));
    expect(
      getAutoFitColumnWidths({
        sheet,
        range: wholeSheetRange,
        getComputedValue: getValue,
        measurer,
      }),
    ).toEqual(new Map([[6, DEFAULT_COLUMN_WIDTH]]));
  });

  test("skips hidden axes and merged cells", () => {
    const sheet = createSheet("Sheet1", "sheet-1");
    setCellValue(sheet, { row: 1, column: 1 }, "a value that would otherwise fit");
    setCellValue(sheet, { row: 2, column: 2 }, "also ignored");
    (sheet.hiddenRows ??= new Set()).add(1);
    (sheet.hiddenColumns ??= new Set()).add(2);
    sheet.mergedCells.push({ start: { row: 3, column: 3 }, end: { row: 3, column: 4 } });
    setCellValue(sheet, { row: 3, column: 3 }, "merged value");
    sheet.rowHeights.set(3, 60);
    sheet.columnWidths.set(3, 180);

    const input = { sheet, range: wholeSheetRange, getComputedValue: getValue, measurer };
    expect(getAutoFitRowHeights(input)).toEqual(new Map());
    expect(getAutoFitColumnWidths(input)).toEqual(new Map());
  });
});
