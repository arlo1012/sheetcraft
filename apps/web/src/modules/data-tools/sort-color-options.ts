import { createSortCellColorResolver, getSortCellColor } from "@idea10/core/commands";
import { DEFAULT_CELL_TEXT_COLOR } from "@idea10/core/style";
import type { ExcelDateSystem } from "@idea10/core/formula";
import type { CellRange, Sheet, SheetEvaluator } from "@idea10/core/workbook";
import type { SortColorColumn } from "./data-tools-types";

type SortColorOptions = { dateSystem?: ExcelDateSystem };

function intersects(left: CellRange, right: CellRange): boolean {
  return !(
    left.end.row < right.start.row ||
    right.end.row < left.start.row ||
    left.end.column < right.start.column ||
    right.end.column < left.start.column
  );
}

function hasDerivedStyles(sheet: Sheet, range: CellRange): boolean {
  return Boolean(
    (sheet.tables ?? []).some((table) => intersects(table.range, range)) ||
    (sheet.duplicateRules ?? []).some(
      (rule) => rule.kind === "highlight" && intersects(rule.range, range),
    ) ||
    (sheet.conditionalFormats ?? []).some((rule) =>
      rule.ranges.some((candidate) => intersects(candidate, range)),
    ),
  );
}

/** Read sparse styles once; unallocated body cells contribute the default colors. */
export function getSortColorColumns(
  sheet: Sheet,
  range: CellRange,
  evaluator?: SheetEvaluator,
  options?: SortColorOptions,
): SortColorColumn[] {
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
  const derived = evaluator && hasDerivedStyles(sheet, range);
  const resolve = derived
    ? createSortCellColorResolver(sheet, evaluator, options)
    : (address: { row: number; column: number }, sortOn: "cellColor" | "fontColor") =>
        getSortCellColor(sheet, address, sortOn);
  if (derived) {
    for (let row = range.start.row + 1; row <= range.end.row; row++)
      for (let column = range.start.column; column <= range.end.column; column++) {
        const entry = columns.get(column)!;
        entry.count++;
        const address = { row, column };
        const fill = resolve(address, "cellColor");
        const font = resolve(address, "fontColor");
        if (fill !== undefined) entry.cellColors.add(fill);
        if (typeof font === "string") entry.fontColors.add(font);
      }
  } else {
    for (const [key] of sheet.cells) {
      const [row, column] = key.split(":").map(Number);
      if (
        row === undefined ||
        column === undefined ||
        row <= range.start.row ||
        row > range.end.row
      )
        continue;
      const entry = columns.get(column);
      if (!entry) continue;
      entry.count++;
      const address = { row, column };
      const fill = resolve(address, "cellColor");
      const font = resolve(address, "fontColor");
      if (fill !== undefined) entry.cellColors.add(fill);
      if (typeof font === "string") entry.fontColors.add(font);
    }
  }
  return [...columns].map(([column, entry]) => {
    if (entry.count < range.end.row - range.start.row) {
      entry.cellColors.add(null);
      entry.fontColors.add(DEFAULT_CELL_TEXT_COLOR.toLowerCase());
    }
    const address = { row: range.start.row, column };
    const headerCellColor = resolve(address, "cellColor");
    return {
      column,
      cellColors: [...entry.cellColors],
      fontColors: [...entry.fontColors],
      ...(headerCellColor === undefined ? {} : { headerCellColor }),
      headerFontColor: resolve(address, "fontColor") as string,
    };
  });
}
