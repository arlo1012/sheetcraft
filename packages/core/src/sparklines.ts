import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
} from "./workbook.js";
import { createSheetFilterHiddenRowIntervals } from "./commands/filter.js";
import { getOutlineHiddenIntervals, type HiddenAxisInterval } from "./data-outline.js";
import type { IdFactory } from "./runtime.js";
export type SparklinePointStyle = { show: boolean; color: string };
export type SparklinePointKind = "highPoint" | "lowPoint" | "firstPoint" | "lastPoint";
export type SparklineAxisLimit =
  | { type: "individual" | "group" }
  | { type: "custom"; value: number };
export type SparklineScale = { min: number; max: number };
export type CellSparkline = {
  /** Group identities are scoped to the owning worksheet. */
  groupId?: string;
  type: "line" | "column" | "winLoss";
  source: CellRange | null;
  color: string;
  negativeColor: string;
  markers: boolean;
  axis: boolean;
  minAxis?: SparklineAxisLimit;
  maxAxis?: SparklineAxisLimit;
  showHidden: boolean;
  empty: "gap" | "zero" | "connect";
  highPoint?: SparklinePointStyle;
  lowPoint?: SparklinePointStyle;
  firstPoint?: SparklinePointStyle;
  lastPoint?: SparklinePointStyle;
  negativePoints?: boolean;
  markerColor?: string;
};
export function normalizeCellSparkline(
  value: CellSparkline | null | undefined,
): CellSparkline | undefined {
  if (value == null) return undefined;
  for (const limit of [value.minAxis, value.maxAxis]) {
    if (
      limit !== undefined &&
      (!limit ||
        !["individual", "group", "custom"].includes(limit.type) ||
        (limit.type === "custom" && !Number.isFinite(limit.value)))
    )
      throw new RangeError("Invalid sparkline axis limit.");
  }
  if (
    value.minAxis?.type === "custom" &&
    value.maxAxis?.type === "custom" &&
    value.minAxis.value > value.maxAxis.value
  )
    throw new RangeError("Sparkline minimum exceeds maximum.");
  if (value.groupId !== undefined && (typeof value.groupId !== "string" || !value.groupId.trim()))
    throw new RangeError("Invalid sparkline group identity.");
  if (
    !["line", "column", "winLoss"].includes(value.type) ||
    !["gap", "zero", "connect"].includes(value.empty) ||
    typeof value.color !== "string" ||
    typeof value.negativeColor !== "string" ||
    !/^#[0-9a-f]{6}$/i.test(value.color) ||
    !/^#[0-9a-f]{6}$/i.test(value.negativeColor) ||
    ["markers", "axis", "showHidden"].some(
      (key) => typeof value[key as keyof CellSparkline] !== "boolean",
    )
  )
    throw new RangeError("Invalid sparkline.");
  if (
    (value.negativePoints !== undefined && typeof value.negativePoints !== "boolean") ||
    (value.markerColor !== undefined &&
      (typeof value.markerColor !== "string" || !/^#[0-9a-f]{6}$/i.test(value.markerColor)))
  )
    throw new RangeError("Invalid sparkline point style.");
  const points: Partial<Record<SparklinePointKind, SparklinePointStyle>> = {};
  for (const key of ["highPoint", "lowPoint", "firstPoint", "lastPoint"] as const) {
    const point = value[key];
    if (point === undefined) continue;
    if (
      !point ||
      typeof point.show !== "boolean" ||
      typeof point.color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(point.color)
    )
      throw new RangeError("Invalid sparkline point style.");
    points[key] = { show: point.show, color: point.color };
  }
  const source = value.source;
  if (
    source !== null &&
    (!source ||
      !source.start ||
      !source.end ||
      [source.start.row, source.start.column, source.end.row, source.end.column].some(
        (index) => !Number.isInteger(index) || index < 0,
      ) ||
      source.end.row >= MAX_SHEET_ROWS ||
      source.end.column >= MAX_SHEET_COLUMNS ||
      source.start.row > source.end.row ||
      source.start.column > source.end.column ||
      (source.start.row !== source.end.row && source.start.column !== source.end.column) ||
      Math.max(source.end.row - source.start.row, source.end.column - source.start.column) >= 10000)
  )
    throw new RangeError("A sparkline needs one row or column of at most 10,000 cells.");
  return {
    ...(value.groupId !== undefined ? { groupId: value.groupId } : {}),
    type: value.type,
    source: source ? { start: { ...source.start }, end: { ...source.end } } : null,
    color: value.color,
    negativeColor: value.negativeColor,
    markers: value.markers,
    axis: value.axis,
    ...(value.minAxis
      ? {
          minAxis:
            value.minAxis.type === "custom"
              ? { type: "custom", value: value.minAxis.value }
              : { type: value.minAxis.type },
        }
      : {}),
    ...(value.maxAxis
      ? {
          maxAxis:
            value.maxAxis.type === "custom"
              ? { type: "custom", value: value.maxAxis.value }
              : { type: value.maxAxis.type },
        }
      : {}),
    showHidden: value.showHidden,
    empty: value.empty,
    ...points,
    ...(value.negativePoints !== undefined ? { negativePoints: value.negativePoints } : {}),
    ...(value.markerColor !== undefined ? { markerColor: value.markerColor } : {}),
  };
}
export const cloneCellSparkline = normalizeCellSparkline;

/** A copied block retains its internal groups without joining the source groups. */
export function copySparklineGroups(
  matrix: readonly (readonly (CellSparkline | null)[])[],
  idFactory: IdFactory,
): (CellSparkline | null)[][] {
  const identities = new Map<string, string>();
  return matrix.map((row) =>
    row.map((value) => {
      const copy = cloneCellSparkline(value);
      if (!copy) return null;
      if (copy.groupId) {
        let identity = identities.get(copy.groupId);
        if (!identity) {
          identity = idFactory("sparkline-group");
          identities.set(copy.groupId, identity);
        }
        copy.groupId = identity;
      }
      return copy;
    }),
  );
}

export type SparklineEntry = { address: CellAddress; value: CellSparkline };
export function getSheetSparklines(sheet: Sheet, range?: CellRange): SparklineEntry[] {
  return [...sheet.cells].flatMap(([key, cell]) => {
    if (!cell.sparkline) return [];
    const [row, column] = key.split(":").map(Number) as [number, number];
    if (
      range &&
      (row < range.start.row ||
        row > range.end.row ||
        column < range.start.column ||
        column > range.end.column)
    )
      return [];
    return [{ address: { row, column }, value: normalizeCellSparkline(cell.sparkline)! }];
  });
}

/** Include group peers outside the selection when changing shared group settings. */
export function expandSparklineGroups(
  sheet: Sheet,
  entries: readonly SparklineEntry[],
): SparklineEntry[] {
  const groups = new Set(entries.flatMap(({ value }) => (value.groupId ? [value.groupId] : [])));
  if (!groups.size) return [...entries];
  const addresses = new Set(entries.map(({ address }) => `${address.row}:${address.column}`));
  return getSheetSparklines(sheet).filter(
    ({ address, value }) =>
      addresses.has(`${address.row}:${address.column}`) ||
      (value.groupId && groups.has(value.groupId)),
  );
}
export function translateCellSparkline(
  value: CellSparkline | null | undefined,
  delta: CellAddress,
): CellSparkline | undefined {
  const sparkline = cloneCellSparkline(value);
  if (!sparkline?.source) return sparkline;
  const source = {
    start: {
      row: sparkline.source.start.row + delta.row,
      column: sparkline.source.start.column + delta.column,
    },
    end: {
      row: sparkline.source.end.row + delta.row,
      column: sparkline.source.end.column + delta.column,
    },
  };
  return {
    ...sparkline,
    source:
      source.start.row < 0 ||
      source.start.column < 0 ||
      source.end.row >= MAX_SHEET_ROWS ||
      source.end.column >= MAX_SHEET_COLUMNS
        ? null
        : source,
  };
}
export function getSparklineValues(
  sheet: Sheet,
  value: CellSparkline,
  evaluator: SheetEvaluator,
): Array<number | null> {
  return createSparklineValueResolver(sheet, evaluator)(value);
}

/** Resolve each boundary independently; a missing group falls back to this sparkline. */
export function resolveSparklineScale(
  sparkline: CellSparkline,
  values: readonly (number | null)[],
  group?: SparklineScale,
): SparklineScale {
  if (sparkline.type === "winLoss") return { min: -1, max: 1 };
  let min = Infinity,
    max = -Infinity;
  for (const value of values) {
    if (value === null) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (min === Infinity) {
    min = 0;
    max = 0;
  }
  if (sparkline.minAxis?.type === "group" && group) min = group.min;
  if (sparkline.maxAxis?.type === "group" && group) max = group.max;
  if (sparkline.type === "column") {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (sparkline.minAxis?.type === "custom") min = sparkline.minAxis.value;
  if (sparkline.maxAxis?.type === "custom") max = sparkline.maxAxis.value;
  if (min > max) {
    if (sparkline.minAxis?.type === "custom") max = min;
    else min = max;
  }
  return { min, max };
}

/** One resolver per display snapshot, including group members outside the viewport. */
export function createSparklineScaleResolver(sheet: Sheet, evaluator: SheetEvaluator) {
  const valuesOf = createSparklineValueResolver(sheet, evaluator);
  let groups: Map<string, SparklineScale> | undefined;
  return (
    sparkline: CellSparkline,
    values: readonly (number | null)[] = valuesOf(sparkline),
  ): SparklineScale => {
    if (
      sparkline.groupId &&
      (sparkline.minAxis?.type === "group" || sparkline.maxAxis?.type === "group")
    ) {
      if (!groups) {
        groups = new Map();
        for (const cell of sheet.cells.values()) {
          const member = cell.sparkline;
          if (!member?.groupId) continue;
          for (const value of valuesOf(member)) {
            if (value === null) continue;
            const bounds = groups.get(member.groupId) ?? { min: value, max: value };
            bounds.min = Math.min(bounds.min, value);
            bounds.max = Math.max(bounds.max, value);
            groups.set(member.groupId, bounds);
          }
        }
      }
      return resolveSparklineScale(sparkline, values, groups.get(sparkline.groupId));
    }
    return resolveSparklineScale(sparkline, values);
  };
}

/** Recreate with the document display snapshot; share visibility work across its sparklines. */
export function createSparklineValueResolver(sheet: Sheet, evaluator: SheetEvaluator) {
  let hiddenRows: HiddenAxisInterval[] | undefined;
  let hiddenColumns: HiddenAxisInterval[] | undefined;
  let filteredRows: HiddenAxisInterval[] | undefined;
  function contains(intervals: readonly HiddenAxisInterval[], index: number): boolean {
    let low = 0;
    let high = intervals.length - 1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      const interval = intervals[middle]!;
      if (index < interval.start) high = middle - 1;
      else if (index > interval.end) low = middle + 1;
      else return true;
    }
    return false;
  }
  function isHidden(row: number, column: number): boolean {
    filteredRows ??= createSheetFilterHiddenRowIntervals(sheet, evaluator);
    hiddenRows ??= getOutlineHiddenIntervals(sheet.outlineGroups ?? [], "row");
    hiddenColumns ??= getOutlineHiddenIntervals(sheet.outlineGroups ?? [], "column");
    return !!(
      sheet.hiddenRows?.has(row) ||
      sheet.hiddenColumns?.has(column) ||
      contains(filteredRows, row) ||
      contains(hiddenRows, row) ||
      contains(hiddenColumns, column)
    );
  }
  return (value: CellSparkline): Array<number | null> => {
    const sparkline = normalizeCellSparkline(value)!;
    if (!sparkline.source) return [];
    const { start, end } = sparkline.source;
    const values: Array<number | null> = [];
    for (let row = start.row; row <= end.row; row++)
      for (let column = start.column; column <= end.column; column++) {
        if (!sparkline.showHidden && isHidden(row, column)) continue;
        const value = evaluator.getComputedValue({ row, column });
        values.push(
          typeof value === "number" && Number.isFinite(value)
            ? value
            : value == null || value === ""
              ? sparkline.empty === "zero"
                ? 0
                : null
              : null,
        );
      }
    return values;
  };
}
