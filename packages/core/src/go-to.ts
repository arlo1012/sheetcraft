import { createSheetFilterHiddenRowIntervals } from "./commands/filter.js";
import { resolveContiguousDataRange } from "./data-range.js";
import { WorkbookDomainError } from "./errors.js";
import { isFormulaError, type FormulaValue } from "./formula/types.js";
import { doMergedCellRangesIntersect } from "./merged-cells.js";
import {
  createSheetEvaluator,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
} from "./workbook.js";

export type SheetGoToOptions = {
  kind:
    | "data"
    | "blanks"
    | "visible"
    | "last-cell"
    | "current-region"
    | "row-differences"
    | "column-differences"
    | "merged"
    | "objects";
  constants: boolean;
  formulas: boolean;
  valueTypes: readonly ("number" | "text" | "logical" | "error")[];
};

export type SheetGoToResult = {
  range: CellRange;
  imageId?: string;
};

type GoToContext = {
  selection: CellRange;
  active: CellAddress;
  evaluator?: SheetEvaluator;
};

type AxisInterval = { start: number; end: number };

const MAX_GO_TO_TARGETS = 100_000;

function normalizeRange(range: CellRange): CellRange {
  return {
    start: {
      row: Math.min(range.start.row, range.end.row),
      column: Math.min(range.start.column, range.end.column),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      column: Math.max(range.start.column, range.end.column),
    },
  };
}

function isSingleCell(range: CellRange): boolean {
  return range.start.row === range.end.row && range.start.column === range.end.column;
}

function inRange(address: CellAddress, range: CellRange): boolean {
  return (
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column
  );
}

function parseCellKey(key: string): CellAddress | null {
  const separator = key.indexOf(":");
  if (separator < 1 || separator === key.length - 1) return null;
  const row = Number(key.slice(0, separator));
  const column = Number(key.slice(separator + 1));
  return Number.isInteger(row) && Number.isInteger(column) ? { row, column } : null;
}

/** Includes sparse styled cells, merge bounds, and image anchors, matching the sheet's used extent. */
function getUsedRange(sheet: Sheet): CellRange | undefined {
  let top = Number.POSITIVE_INFINITY;
  let left = Number.POSITIVE_INFINITY;
  let bottom = -1;
  let right = -1;
  const include = (address: CellAddress): void => {
    top = Math.min(top, address.row);
    bottom = Math.max(bottom, address.row);
    left = Math.min(left, address.column);
    right = Math.max(right, address.column);
  };
  for (const key of sheet.cells.keys()) {
    const address = parseCellKey(key);
    if (address) include(address);
  }
  for (const merged of sheet.mergedCells) {
    include(merged.start);
    include(merged.end);
  }
  for (const image of sheet.floatingImages) include(image.anchor);
  return bottom < 0
    ? undefined
    : { start: { row: top, column: left }, end: { row: bottom, column: right } };
}

function scopeFor(sheet: Sheet, selection: CellRange): CellRange {
  const normalized = normalizeRange(selection);
  return isSingleCell(normalized) ? (getUsedRange(sheet) ?? normalized) : normalized;
}

function result(range: CellRange, imageId?: string): SheetGoToResult {
  return imageId === undefined ? { range } : { range, imageId };
}

function compareRanges(left: CellRange, right: CellRange): number {
  return (
    left.start.row - right.start.row ||
    left.start.column - right.start.column ||
    left.end.row - right.end.row ||
    left.end.column - right.end.column
  );
}

function assertResultLimit(results: readonly SheetGoToResult[]): void {
  if (results.length <= MAX_GO_TO_TARGETS) return;
  throw new WorkbookDomainError(
    {
      code: "workbook_operation_failed",
      details: { reason: "go_to_targets_limit", limit: MAX_GO_TO_TARGETS },
    },
    `Go To Special produced more than ${MAX_GO_TO_TARGETS} target ranges.`,
  );
}

function sparseAddresses(sheet: Sheet, range: CellRange): CellAddress[] {
  const addresses: CellAddress[] = [];
  for (const key of sheet.cells.keys()) {
    const address = parseCellKey(key);
    if (address && inRange(address, range)) addresses.push(address);
  }
  return addresses.sort((left, right) => left.row - right.row || left.column - right.column);
}

function valueType(value: FormulaValue): "number" | "text" | "logical" | "error" | undefined {
  if (isFormulaError(value)) return "error";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "text";
  if (typeof value === "boolean") return "logical";
  return undefined;
}

function sameValue(left: FormulaValue, right: FormulaValue): boolean {
  return isFormulaError(left) || isFormulaError(right)
    ? isFormulaError(left) && isFormulaError(right) && left.code === right.code
    : Object.is(left, right);
}

function nonBlankAddresses(sheet: Sheet, range: CellRange): CellAddress[] {
  return sparseAddresses(sheet, range).filter(
    (address) => sheet.cells.get(`${address.row}:${address.column}`)?.content,
  );
}

/**
 * Returns rectangular complements of sparse addresses. It does not enumerate
 * blank cells, including when the selected rectangle spans the whole sheet.
 */
function complementRanges(range: CellRange, excluded: readonly CellAddress[]): CellRange[] {
  const byRow = new Map<number, number[]>();
  for (const address of excluded) {
    if (!inRange(address, range)) continue;
    const columns = byRow.get(address.row);
    if (columns) columns.push(address.column);
    else byRow.set(address.row, [address.column]);
  }
  for (const columns of byRow.values()) columns.sort((left, right) => left - right);

  const ranges: CellRange[] = [];
  const rows = [...byRow.keys()].sort((left, right) => left - right);
  let cursor = range.start.row;
  const addFullRows = (start: number, end: number): void => {
    if (start <= end)
      ranges.push({
        start: { row: start, column: range.start.column },
        end: { row: end, column: range.end.column },
      });
  };
  for (const row of rows) {
    addFullRows(cursor, row - 1);
    let column = range.start.column;
    for (const excludedColumn of byRow.get(row)!) {
      if (excludedColumn > column)
        ranges.push({
          start: { row, column },
          end: { row, column: excludedColumn - 1 },
        });
      column = excludedColumn + 1;
    }
    if (column <= range.end.column)
      ranges.push({ start: { row, column }, end: { row, column: range.end.column } });
    cursor = row + 1;
  }
  addFullRows(cursor, range.end.row);
  assertResultLimit(ranges.map((target) => result(target)));
  return ranges;
}

function visibleIntervals(
  start: number,
  end: number,
  hidden: readonly AxisInterval[],
): AxisInterval[] {
  const intervals = hidden
    .map((interval) => ({
      start: Math.max(start, interval.start),
      end: Math.min(end, interval.end),
    }))
    .filter((interval) => interval.start <= interval.end)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: AxisInterval[] = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.start <= previous.end + 1)
      previous.end = Math.max(previous.end, interval.end);
    else merged.push(interval);
  }
  const visible: AxisInterval[] = [];
  let cursor = start;
  for (const interval of merged) {
    if (cursor < interval.start) visible.push({ start: cursor, end: interval.start - 1 });
    cursor = interval.end + 1;
  }
  if (cursor <= end) visible.push({ start: cursor, end });
  return visible;
}

function visibleTargets(
  sheet: Sheet,
  range: CellRange,
  evaluator: SheetEvaluator,
): SheetGoToResult[] {
  const filterHidden = createSheetFilterHiddenRowIntervals(sheet, evaluator);
  const hiddenRows: AxisInterval[] = [
    ...[...(sheet.hiddenRows ?? [])].map((row) => ({ start: row, end: row })),
    ...filterHidden,
  ];
  const hiddenColumns = [...(sheet.hiddenColumns ?? [])].map((column) => ({
    start: column,
    end: column,
  }));
  const rows = visibleIntervals(range.start.row, range.end.row, hiddenRows);
  const columns = visibleIntervals(range.start.column, range.end.column, hiddenColumns);
  const results: SheetGoToResult[] = [];
  for (const row of rows) {
    for (const column of columns) {
      results.push(
        result({
          start: { row: row.start, column: column.start },
          end: { row: row.end, column: column.end },
        }),
      );
      assertResultLimit(results);
    }
  }
  return results;
}

function contentTargets(
  sheet: Sheet,
  range: CellRange,
  options: SheetGoToOptions,
  evaluator: SheetEvaluator,
): SheetGoToResult[] {
  const selectedTypes = new Set(options.valueTypes);
  const results = sparseAddresses(sheet, range).flatMap((address) => {
    const content = sheet.cells.get(`${address.row}:${address.column}`)?.content;
    if (!content || content.kind === "image") return [];
    const isConstant = content.kind === "literal" || content.kind === "error";
    if ((!isConstant || !options.constants) && (content.kind !== "formula" || !options.formulas))
      return [];
    const type = valueType(evaluator.getComputedValue(address));
    return type && selectedTypes.has(type) ? [result({ start: address, end: address })] : [];
  });
  assertResultLimit(results);
  return results;
}

function rowDifferences(
  sheet: Sheet,
  range: CellRange,
  active: CellAddress,
  evaluator: SheetEvaluator,
): SheetGoToResult[] {
  const byRow = new Map<number, CellAddress[]>();
  for (const address of sparseAddresses(sheet, range)) {
    const row = byRow.get(address.row);
    if (row) row.push(address);
    else byRow.set(address.row, [address]);
  }
  const ranges: CellRange[] = [];
  for (const [row, addresses] of byRow) {
    const base = evaluator.getComputedValue({ row, column: active.column });
    if (base === null) {
      for (const address of addresses) {
        if (!sameValue(evaluator.getComputedValue(address), base))
          ranges.push({ start: address, end: address });
      }
    } else {
      const same = addresses.filter((address) =>
        sameValue(evaluator.getComputedValue(address), base),
      );
      ranges.push(
        ...complementRanges(
          { start: { row, column: range.start.column }, end: { row, column: range.end.column } },
          same,
        ),
      );
    }
  }
  const results = ranges.sort(compareRanges).map((target) => result(target));
  assertResultLimit(results);
  return results;
}

function columnDifferences(
  sheet: Sheet,
  range: CellRange,
  active: CellAddress,
  evaluator: SheetEvaluator,
): SheetGoToResult[] {
  const byColumn = new Map<number, CellAddress[]>();
  for (const address of sparseAddresses(sheet, range)) {
    const column = byColumn.get(address.column);
    if (column) column.push(address);
    else byColumn.set(address.column, [address]);
  }
  const ranges: CellRange[] = [];
  for (const [column, addresses] of byColumn) {
    const base = evaluator.getComputedValue({ row: active.row, column });
    if (base === null) {
      for (const address of addresses) {
        if (!sameValue(evaluator.getComputedValue(address), base))
          ranges.push({ start: address, end: address });
      }
    } else {
      const sameRows = addresses
        .filter((address) => sameValue(evaluator.getComputedValue(address), base))
        .map((address) => ({ row: address.column, column: address.row }));
      const transposed = complementRanges(
        {
          start: { row: column, column: range.start.row },
          end: { row: column, column: range.end.row },
        },
        sameRows,
      );
      ranges.push(
        ...transposed.map((target) => ({
          start: { row: target.start.column, column: target.start.row },
          end: { row: target.end.column, column: target.end.row },
        })),
      );
    }
  }
  const results = ranges.sort(compareRanges).map((target) => result(target));
  assertResultLimit(results);
  return results;
}

/**
 * Finds Go To Special targets without mutating the workbook. A single-cell
 * selection operates over the used sheet extent; a multi-cell selection limits
 * every selection-based mode to that rectangle.
 */
export function findSheetGoToTargets(
  sheet: Sheet,
  options: SheetGoToOptions,
  context: GoToContext,
): SheetGoToResult[] {
  const selection = normalizeRange(context.selection);
  const scope = scopeFor(sheet, selection);
  const evaluator = context.evaluator ?? createSheetEvaluator(sheet);
  switch (options.kind) {
    case "data":
      return contentTargets(sheet, scope, options, evaluator);
    case "blanks":
      return complementRanges(scope, nonBlankAddresses(sheet, scope)).map((range) => result(range));
    case "visible":
      return visibleTargets(sheet, scope, evaluator);
    case "last-cell": {
      const used = getUsedRange(sheet) ?? selection;
      return [result({ start: { ...used.end }, end: { ...used.end } })];
    }
    case "current-region":
      return [result(resolveContiguousDataRange(sheet, context.active))];
    case "row-differences":
      return rowDifferences(sheet, scope, context.active, evaluator);
    case "column-differences":
      return columnDifferences(sheet, scope, context.active, evaluator);
    case "merged":
      return sheet.mergedCells
        .filter((merged) => doMergedCellRangesIntersect(merged, scope))
        .map((range) => result(normalizeRange(range)))
        .sort((left, right) => compareRanges(left.range, right.range));
    case "objects":
      return sheet.floatingImages
        .filter((image) => inRange(image.anchor, scope))
        .map((image) => result({ start: { ...image.anchor }, end: { ...image.anchor } }, image.id))
        .sort(
          (left, right) =>
            compareRanges(left.range, right.range) || (left.imageId! < right.imageId! ? -1 : 1),
        );
  }
}
