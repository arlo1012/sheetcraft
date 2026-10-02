import { createSortCellIconResolver, type SortIcon } from "@idea10/core/commands";
import type { ExcelDateSystem } from "@idea10/core/formula";
import type { CellRange, Sheet, SheetEvaluator } from "@idea10/core/workbook";
import type { SortIconColumn } from "./data-tools-types";

export function sortIconKey(icon: SortIcon | null): string {
  return icon ? `${icon.iconSet}:${icon.iconIndex}` : "no-icon";
}

/** Preserve family/index identity, including custom icons and the absence of a visible icon. */
export function getSortIconColumns(
  sheet: Sheet,
  range: CellRange,
  evaluator?: SheetEvaluator,
  options?: { dateSystem?: ExcelDateSystem },
): SortIconColumn[] {
  const resolve = createSortCellIconResolver(sheet, evaluator, options);
  const result: SortIconColumn[] = [];
  for (let column = range.start.column; column <= range.end.column; column++) {
    const icons = new Map<string, SortIcon | null>();
    for (let row = range.start.row + 1; row <= range.end.row; row++) {
      const icon = resolve({ row, column });
      icons.set(sortIconKey(icon), icon);
    }
    result.push({
      column,
      icons: [...icons.values()].sort(
        (left, right) => Number(left === null) - Number(right === null),
      ),
      headerIcon: resolve({ row: range.start.row, column }),
    });
  }
  return result;
}
