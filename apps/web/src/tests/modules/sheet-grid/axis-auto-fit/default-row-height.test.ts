import { describe, expect, test } from "vitest";
import {
  createSheet,
  setCellStyle,
  setCellValue,
  type Cell,
  type CellAddress,
} from "@sheetcraft/core/workbook";
import type { FormulaValue } from "@sheetcraft/core/formula";
import { getAutoFitRowHeights } from "../../../../modules/sheet-grid/axis-auto-fit";

const range = { start: { row: 0, column: 0 }, end: { row: 20, column: 1 } };
const measurer = { measure: (text: string, font: { size: number }) => text.length * font.size };
function getValue(_address: CellAddress, cell: Readonly<Cell>): FormulaValue {
  return cell.content?.kind === "literal" ? cell.content.value : null;
}

describe("axis auto fit sheet row baseline", () => {
  test("resets blank manual24 rows to20 while leaving hidden overrides and sparse empty rows alone", () => {
    const sheet = createSheet("Imported", "s");
    sheet.defaultRowHeight = 20;
    sheet.rowHeights = new Map([
      [0, 24],
      [1, 60],
      [2, 24],
    ]);
    sheet.hiddenRows = new Set([2]);
    expect(getAutoFitRowHeights({ sheet, range, getComputedValue: getValue, measurer })).toEqual(
      new Map([
        [0, 20],
        [1, 20],
      ]),
    );
    expect(sheet.rowHeights).toEqual(
      new Map([
        [0, 24],
        [1, 60],
        [2, 24],
      ]),
    );
  });

  test("uses20 for sparse no-op comparisons and keeps intrinsic text measurements", () => {
    const sheet = createSheet("Imported", "s");
    sheet.defaultRowHeight = 20;
    setCellValue(sheet, { row: 0, column: 0 }, "a");
    setCellStyle(sheet, { row: 0, column: 0 }, { fontSize: 12 });
    setCellValue(sheet, { row: 1, column: 0 }, "a\nb");
    setCellStyle(sheet, { row: 1, column: 0 }, { fontSize: 12 });
    const fit = () => getAutoFitRowHeights({ sheet, range, getComputedValue: getValue, measurer });
    expect(fit()).toEqual(new Map([[1, 35]]));
    sheet.rowHeights.set(0, 24);
    expect(fit()).toEqual(
      new Map([
        [0, 20],
        [1, 35],
      ]),
    );
    delete sheet.defaultRowHeight;
    sheet.rowHeights.clear();
    expect(fit()).toEqual(
      new Map([
        [0, 20],
        [1, 35],
      ]),
    );
  });
});
