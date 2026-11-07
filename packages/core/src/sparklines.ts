import {
  parseFormulaReference,
  type ParseFormulaReferenceOptions,
} from "./formula/reference-model.js";
import { getCellAddressLabel } from "./coordinates.js";
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
type SparklineAddress = CellAddress & { rowAbsolute?: boolean; columnAbsolute?: boolean };
export type SparklineReferenceRange = { start: SparklineAddress; end: SparklineAddress };
export type SparklineDateRange = SparklineReferenceRange;
export function readSparklineReference(
  text: string,
  options: ParseFormulaReferenceOptions,
): { sheetId: string; range: SparklineReferenceRange } | undefined {
  const ref = parseFormulaReference(text.trim().replace(/^=/, ""), options);
  if (!ref) return;
  const { startReference: start, endReference } = ref.source;
  const address = (ref: typeof start) => ({
    row: ref.row,
    column: ref.column,
    ...(ref.rowAbsolute ? { rowAbsolute: true } : {}),
    ...(ref.columnAbsolute ? { columnAbsolute: true } : {}),
  });
  return {
    sheetId: ref.target.sheetId,
    range: { start: address(start), end: address(endReference ?? start) },
  };
}
export function readSparklineDateRange(
  text: string,
  options: ParseFormulaReferenceOptions,
): Pick<CellSparkline, "dateSheetId" | "dateRange"> | undefined {
  const ref = readSparklineReference(text, options);
  if (!ref) return;
  try {
    return {
      dateRange: cloneSparklineRange(ref.range),
      dateSheetId: ref.sheetId === options.currentSheetId ? undefined : ref.sheetId,
    };
  } catch {
    return;
  }
}
export function formatSparklineReference(
  range: SparklineReferenceRange,
  sheetName: string,
): string {
  const address = (p: SparklineAddress) =>
    getCellAddressLabel(p).replace(
      /^([A-Z]+)([0-9]+)$/,
      (_match, col: string, row: string) =>
        (p.columnAbsolute ? "$" : "") + col + (p.rowAbsolute ? "$" : "") + row,
    );
  const start = address(range.start),
    end = address(range.end);
  return "'" + sheetName.replaceAll("'", "''") + "'!" + start + (end === start ? "" : ":" + end);
}
export type CellSparkline = {
  /** Group identities are scoped to the owning worksheet. */
  groupId?: string;
  type: "line" | "column" | "winLoss";
  source: SparklineReferenceRange | null;
  sourceSheetId?: string;
  /** Set for a date axis referencing another worksheet in this workbook. */
  dateSheetId?: string;
  /** Null represents a broken date reference. */
  dateRange?: SparklineDateRange | null;
  color: string;
  negativeColor: string;
  markers: boolean;
  axis: boolean;
  rightToLeft?: boolean;
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
export function cloneSparklineRange(
  source: SparklineReferenceRange | null,
): SparklineReferenceRange | null {
  if (
    source !== null &&
    (!source ||
      !source.start ||
      !source.end ||
      [source.start.row, source.start.column, source.end.row, source.end.column].some(
        (index) => !Number.isInteger(index) || index < 0,
      ) ||
      [source.start, source.end].some((p) =>
        [p.rowAbsolute, p.columnAbsolute].some(
          (flag) => flag !== undefined && typeof flag !== "boolean",
        ),
      ) ||
      source.end.row >= MAX_SHEET_ROWS ||
      source.end.column >= MAX_SHEET_COLUMNS ||
      source.start.row > source.end.row ||
      source.start.column > source.end.column ||
      (source.start.row !== source.end.row && source.start.column !== source.end.column) ||
      Math.max(source.end.row - source.start.row, source.end.column - source.start.column) >= 10000)
  )
    throw new RangeError("A sparkline needs one row or column of at most 10,000 cells.");
  return source ? { start: { ...source.start }, end: { ...source.end } } : null;
}
export function normalizeCellSparkline(
  value: CellSparkline | null | undefined,
): CellSparkline | undefined {
  if (value == null) return undefined;
  if (value.rightToLeft !== undefined && typeof value.rightToLeft !== "boolean")
    throw new RangeError("Invalid sparkline direction.");
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
  if (
    value.dateSheetId !== undefined &&
    (typeof value.dateSheetId !== "string" ||
      !value.dateSheetId.trim() ||
      value.dateRange === undefined)
  )
    throw new RangeError("Invalid sparkline date sheet.");
  const source = cloneSparklineRange(value.source);
  if (
    value.sourceSheetId !== undefined &&
    (typeof value.sourceSheetId !== "string" || !value.sourceSheetId.trim())
  )
    throw new RangeError("Invalid sparkline data sheet.");
  const dateRange =
    value.dateRange === undefined ? undefined : cloneSparklineRange(value.dateRange);
  return {
    ...(value.groupId !== undefined ? { groupId: value.groupId } : {}),
    type: value.type,
    source,
    ...(value.sourceSheetId ? { sourceSheetId: value.sourceSheetId } : {}),
    ...(dateRange !== undefined
      ? { dateRange, ...(value.dateSheetId ? { dateSheetId: value.dateSheetId } : {}) }
      : {}),
    color: value.color,
    negativeColor: value.negativeColor,
    markers: value.markers,
    axis: value.axis,
    ...(value.rightToLeft !== undefined ? { rightToLeft: value.rightToLeft } : {}),
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
export function mapSparklineReferenceRange(
  dates: SparklineDateRange | null,
  map: (range: CellRange) => CellRange | null,
): SparklineDateRange | null {
  if (!dates) return null;
  const next = map(dates);
  if (!next) return null;
  try {
    return cloneSparklineRange({
      start: { ...dates.start, ...next.start },
      end: { ...dates.end, ...next.end },
    });
  } catch {
    return null;
  }
}
export function mapSparklineRanges(
  value: CellSparkline,
  map: (range: CellRange) => CellRange | null,
  ownerSheetId: string,
): CellSparkline {
  return {
    ...value,
    source:
      !value.sourceSheetId || value.sourceSheetId === ownerSheetId
        ? mapSparklineReferenceRange(value.source, map)
        : value.source,
    ...(value.dateRange !== undefined && (!value.dateSheetId || value.dateSheetId === ownerSheetId)
      ? { dateRange: mapSparklineReferenceRange(value.dateRange, map) }
      : {}),
  };
}
export function translateCellSparkline(
  value: CellSparkline | null | undefined,
  delta: CellAddress,
): CellSparkline | undefined {
  const sparkline = cloneCellSparkline(value);
  if (!sparkline) return;
  const shiftAddress = (p: SparklineAddress) => ({
    ...p,
    row: p.row + (p.rowAbsolute ? 0 : delta.row),
    column: p.column + (p.columnAbsolute ? 0 : delta.column),
  });
  const translate = (range: SparklineReferenceRange | null) => {
    if (!range) return null;
    try {
      return cloneSparklineRange({
        start: shiftAddress(range.start),
        end: shiftAddress(range.end),
      });
    } catch {
      return null;
    }
  };
  return {
    ...sparkline,
    source: translate(sparkline.source),
    ...(sparkline.dateRange !== undefined ? { dateRange: translate(sparkline.dateRange) } : {}),
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
  const series = createSparklineSeriesResolver(sheet, evaluator);
  return (sparkline: CellSparkline) => series(sparkline).values;
}
function sparklineHiddenCells(sheet: Sheet, evaluator: SheetEvaluator) {
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
  return (row: number, column: number): boolean => {
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
  };
}
export function createSparklineSeriesResolver(sheet: Sheet, evaluator: SheetEvaluator) {
  const sources = new Map<
    string,
    { evaluator: SheetEvaluator; isHidden: (row: number, column: number) => boolean }
  >();
  function dataSource(id: string) {
    let source = sources.get(id);
    if (!source) {
      const data = id === sheet.id ? evaluator : evaluator.forSheet?.(id);
      const owner = id === sheet.id ? sheet : data?.sheet;
      if (!data) return;
      source = {
        evaluator: data,
        isHidden: owner ? sparklineHiddenCells(owner, data) : () => false,
      };
      sources.set(id, source);
    }
    return source;
  }
  return (value: CellSparkline): { values: Array<number | null>; dates?: number[] } => {
    const sparkline = normalizeCellSparkline(value)!;
    if (!sparkline.source || sparkline.dateRange === null) return { values: [] };
    const source = dataSource(sparkline.sourceSheetId ?? sheet.id);
    if (!source) return { values: [] };
    const dates = sparkline.dateRange;
    const dateEvaluator =
      dates && sparkline.dateSheetId && sparkline.dateSheetId !== sheet.id
        ? evaluator.forSheet?.(sparkline.dateSheetId)
        : evaluator;
    const points: { date: number; value: number | null }[] = [];
    let ordinal = 0;
    const { start, end } = sparkline.source;
    const values: Array<number | null> = [];
    for (let row = start.row; row <= end.row; row++)
      for (let column = start.column; column <= end.column; column++) {
        const index = ordinal++;
        if (!sparkline.showHidden && source.isHidden(row, column)) continue;
        const value = source.evaluator.getComputedValue({ row, column });
        const numeric =
          typeof value === "number" && Number.isFinite(value)
            ? value
            : value == null || value === ""
              ? sparkline.empty === "zero"
                ? 0
                : null
              : null;
        if (dates) {
          const address = {
            row: dates.start.row + (dates.end.row > dates.start.row ? index : 0),
            column: dates.start.column + (dates.end.column > dates.start.column ? index : 0),
          };
          if (
            index > Math.max(dates.end.row - dates.start.row, dates.end.column - dates.start.column)
          )
            continue;
          const date = dateEvaluator?.getComputedValue(address);
          if (typeof date === "number" && Number.isFinite(date))
            points.push({ date, value: numeric });
        } else values.push(numeric);
      }
    if (dates) {
      points.sort((a, b) => a.date - b.date);
      return { values: points.map((p) => p.value), dates: points.map((p) => p.date) };
    }
    return { values };
  };
}
