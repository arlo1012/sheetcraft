import { isFormulaError, type FormulaValue } from "@sheetcraft/core/formula";
import { MAX_SHEET_ROWS } from "@sheetcraft/core/workbook";
import type { CellAddress, CellRange, Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";
import { createSheetHiddenRowIntervals, isInHiddenAxisIntervals } from "./data-visibility";

export type ColumnValueDistribution = Readonly<{
  value: string;
  count: number;
}>;

export type ColumnStatistics = Readonly<{
  column: number;
  totalRowCount: number;
  emptyCount: number;
  median: number | null;
  leastDistribution: readonly ColumnValueDistribution[];
  selectedCellCount: number;
  nonEmptyCount: number;
  numericCount: number;
  dateCount: number;
  errorCount: number;
  sum: number;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
  distinctCount: number;
  uniqueCount: number;
  distributionTruncated: boolean;
  distribution: readonly ColumnValueDistribution[];
}>;

export type ColumnChoice = Readonly<{
  value: string;
  count: number;
  nearestRow: number;
}>;

const MAX_DISTRIBUTION_VALUES = 5;
const MAX_COLUMN_CHOICES = 200;
const MAX_EMPTY_COLUMNS_TO_REPORT = 50;

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

function parseCellKey(key: string): CellAddress | null {
  const separator = key.indexOf(":");
  if (separator <= 0) return null;
  const row = Number(key.slice(0, separator));
  const column = Number(key.slice(separator + 1));
  return Number.isInteger(row) && Number.isInteger(column) ? { row, column } : null;
}

function isVisibleRow(
  sheet: Sheet,
  address: CellAddress,
  hiddenIntervals: readonly { start: number; end: number }[],
): boolean {
  return (
    !(sheet.hiddenRows?.has(address.row) ?? false) &&
    !isInHiddenAxisIntervals(address.row, hiddenIntervals)
  );
}

function asDistributionValue(value: FormulaValue): string | null {
  if (value === null || isFormulaError(value)) return null;
  return String(value);
}

function createEmptyStatistic() {
  return {
    selectedCellCount: 0,
    nonEmptyCount: 0,
    numericCount: 0,
    dateCount: 0,
    errorCount: 0,
    sum: 0,
    minimum: null as number | null,
    maximum: null as number | null,
  };
}

/** Summarizes selected content, including hidden and filter-hidden rows.
 * Whole columns use their populated bounds rather than the grid capacity.
 */
export function getColumnStatistics(
  sheet: Sheet,
  range: CellRange,
  evaluator: SheetEvaluator,
): ColumnStatistics[] {
  const normalized = normalizeRange(range);
  const bounds = new Map<number, { first: number; last: number }>();
  const numbers = new Map<number, number[]>();
  const valuesByColumn = new Map<number, Map<string, number>>();
  const statistics = new Map<number, ReturnType<typeof createEmptyStatistic>>();

  for (const [key, cell] of sheet.cells) {
    if (!cell.content) continue;
    const address = parseCellKey(key);
    if (
      !address ||
      address.row < normalized.start.row ||
      address.row > normalized.end.row ||
      address.column < normalized.start.column ||
      address.column > normalized.end.column
    ) {
      continue;
    }

    const statistic = statistics.get(address.column) ?? createEmptyStatistic();
    if (!statistics.has(address.column)) {
      statistics.set(address.column, statistic);
      valuesByColumn.set(address.column, new Map());
    }
    const value =
      cell.content.kind === "formula"
        ? evaluator.getComputedValue(address)
        : cell.content.kind === "literal"
          ? cell.content.value
          : cell.content.kind === "error"
            ? cell.content.error
            : null;
    if (value === null || value === "") continue;
    const bound = bounds.get(address.column);
    bounds.set(address.column, {
      first: Math.min(bound?.first ?? address.row, address.row),
      last: Math.max(bound?.last ?? address.row, address.row),
    });
    statistic.selectedCellCount += 1;
    if (isFormulaError(value)) {
      statistic.errorCount += 1;
      continue;
    }

    statistic.nonEmptyCount += 1;
    const displayValue = asDistributionValue(value);
    if (displayValue !== null) {
      const distribution = valuesByColumn.get(address.column)!;
      distribution.set(displayValue, (distribution.get(displayValue) ?? 0) + 1);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const isDate =
        cell.style?.numberFormat?.kind === "date" || cell.style?.numberFormat?.kind === "time";
      if (isDate) statistic.dateCount += 1;
      const numericValues = numbers.get(address.column) ?? [];
      numericValues.push(value);
      numbers.set(address.column, numericValues);
      statistic.numericCount += 1;
      statistic.sum += value;
      statistic.minimum = statistic.minimum === null ? value : Math.min(statistic.minimum, value);
      statistic.maximum = statistic.maximum === null ? value : Math.max(statistic.maximum, value);
    }
  }

  const selectedColumnCount = normalized.end.column - normalized.start.column + 1;
  if (selectedColumnCount <= MAX_EMPTY_COLUMNS_TO_REPORT) {
    for (let column = normalized.start.column; column <= normalized.end.column; column += 1) {
      if (statistics.has(column)) continue;
      statistics.set(column, createEmptyStatistic());
      valuesByColumn.set(column, new Map());
    }
  }
  return [...statistics.entries()]
    .sort(([left], [right]) => left - right)
    .map(([column, statistic]) => {
      const allValues = [...valuesByColumn.get(column)!.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort(
          (left, right) =>
            right.count - left.count ||
            left.value.localeCompare(right.value, undefined, { numeric: true }),
        );
      const distribution = allValues.slice(0, MAX_DISTRIBUTION_VALUES);
      const leastDistribution = [...allValues]
        .sort(
          (a, b) =>
            a.count - b.count || a.value.localeCompare(b.value, undefined, { numeric: true }),
        )
        .slice(0, MAX_DISTRIBUTION_VALUES);
      const numericValues = (numbers.get(column) ?? []).sort((a, b) => a - b);
      const middle = Math.floor(numericValues.length / 2);
      const median = !numericValues.length
        ? null
        : numericValues.length % 2
          ? numericValues[middle]!
          : numericValues[middle - 1]! / 2 + numericValues[middle]! / 2;
      const bound = bounds.get(column);
      const wholeColumn = normalized.start.row === 0 && normalized.end.row === MAX_SHEET_ROWS - 1;
      const totalRowCount = wholeColumn
        ? bound
          ? bound.last - bound.first + 1
          : 0
        : normalized.end.row - normalized.start.row + 1;
      return {
        column,
        totalRowCount,
        emptyCount: totalRowCount - statistic.selectedCellCount,
        median,
        leastDistribution,
        ...statistic,
        sum: Object.is(statistic.sum, -0) ? 0 : statistic.sum,
        average: statistic.numericCount === 0 ? null : statistic.sum / statistic.numericCount,
        distinctCount: valuesByColumn.get(column)!.size,
        uniqueCount: [...valuesByColumn.get(column)!.values()].filter((count) => count === 1)
          .length,
        distributionTruncated: valuesByColumn.get(column)!.size > MAX_DISTRIBUTION_VALUES,
        distribution,
      };
    });
}

/**
 * Returns up to 200 distinct nearby literal-text values from the active
 * column. Formula results, numbers, booleans, images, blanks, hidden rows,
 * and filter-hidden rows are deliberately excluded.
 */
export function getColumnChoices(
  sheet: Sheet,
  address: CellAddress,
  evaluator: SheetEvaluator,
): ColumnChoice[] {
  const choices = new Map<string, { count: number; nearestRow: number }>();
  const hiddenIntervals = createSheetHiddenRowIntervals(sheet, evaluator);
  for (const [key, cell] of sheet.cells) {
    if (cell.content?.kind !== "literal" || typeof cell.content.value !== "string") continue;
    const candidate = parseCellKey(key);
    const value = cell.content.value;
    if (
      !candidate ||
      candidate.column !== address.column ||
      value.trim() === "" ||
      !isVisibleRow(sheet, candidate, hiddenIntervals)
    ) {
      continue;
    }
    const current = choices.get(value);
    if (current) {
      current.count += 1;
      if (Math.abs(candidate.row - address.row) < Math.abs(current.nearestRow - address.row)) {
        current.nearestRow = candidate.row;
      }
    } else {
      choices.set(value, { count: 1, nearestRow: candidate.row });
    }
  }
  return [...choices.entries()]
    .map(([value, choice]) => ({ value, ...choice }))
    .sort(
      (left, right) =>
        Math.abs(left.nearestRow - address.row) - Math.abs(right.nearestRow - address.row) ||
        right.count - left.count ||
        left.value.localeCompare(right.value, undefined, { numeric: true }),
    )
    .slice(0, MAX_COLUMN_CHOICES);
}
