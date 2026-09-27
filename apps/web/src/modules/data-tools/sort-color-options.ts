import { getSortCellColor } from "@idea10/core/commands";
import { DEFAULT_CELL_TEXT_COLOR } from "@idea10/core/style";
import type { CellRange, Sheet } from "@idea10/core/workbook";
import type { SortColorColumn } from "./data-tools-types";

/** Read sparse styles once; unallocated body cells contribute the default colors. */
export function getSortColorColumns(sheet: Sheet, range: CellRange): SortColorColumn[] {
  const columns = new Map<
    number,
    {
      count: number;
      cellColors: Set<string | null>;
      fontColors: Set<string>;
    }
  >();
  for (let column = range.start.column; column <= range.end.column; column++) {
    columns.set(column, { count: 0, cellColors: new Set(), fontColors: new Set() });
  }
  for (const [key] of sheet.cells) {
    const [row, column] = key.split(":").map(Number);
    if (row === undefined || column === undefined || row <= range.start.row || row > range.end.row)
      continue;
    const entry = columns.get(column);
    if (!entry) continue;
    entry.count++;
    const address = { row, column };
    const fill = getSortCellColor(sheet, address, "cellColor");
    const font = getSortCellColor(sheet, address, "fontColor");
    if (fill !== undefined) entry.cellColors.add(fill);
    if (typeof font === "string") entry.fontColors.add(font);
  }
  return [...columns].map(([column, entry]) => {
    if (entry.count < range.end.row - range.start.row) {
      entry.cellColors.add(null);
      entry.fontColors.add(DEFAULT_CELL_TEXT_COLOR.toLowerCase());
    }
    const address = { row: range.start.row, column };
    const headerCellColor = getSortCellColor(sheet, address, "cellColor");
    return {
      column,
      cellColors: [...entry.cellColors],
      fontColors: [...entry.fontColors],
      ...(headerCellColor === undefined ? {} : { headerCellColor }),
      headerFontColor: getSortCellColor(sheet, address, "fontColor") as string,
    };
  });
}
