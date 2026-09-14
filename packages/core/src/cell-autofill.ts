import { translateCellContentForCopy } from "./clipboard.js";
import { createSheetFilterHiddenRowIntervals } from "./commands/filter.js";
import { createBatchSetCellContentsCommand } from "./commands/values.js";
import { datePartsToExcelSerial, excelSerialToDateParts } from "./formula/date-system.js";
import { doMergedCellRangesIntersect } from "./merged-cells.js";
import { cloneCellStyle, type CellStyle } from "./style.js";
import {
  cloneCellContent,
  getCellContent,
  getCellStyle,
  isCellAddressInBounds,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "./workbook.js";
import type { SetCellContentsCommand } from "./commands/contracts.js";
import type { CellContent } from "./formula/types.js";

export const CELL_FILL_MODES = [
  "copy",
  "series",
  "fillFormatsOnly",
  "fillWithoutFormatting",
  "dateDay",
  "dateWeekday",
  "dateMonth",
  "dateYear",
] as const;
export type CellFillMode = (typeof CELL_FILL_MODES)[number];
export type CellFillErrorReason =
  | "sheetNotFound"
  | "invalidRange"
  | "resultDoesNotContainSource"
  | "notOneAxis"
  | "emptyTarget"
  | "targetTooLarge"
  | "mergedCells"
  | "hiddenAxis"
  | "filterRange"
  | "modeUnavailable";
export class CellFillError extends Error {
  constructor(
    readonly reason: CellFillErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "CellFillError";
  }
}
type CapturedCell = Readonly<{
  address: CellAddress;
  content: CellContent | null;
  style: CellStyle | undefined;
}>;
export type CellFillPlan = Readonly<{
  sheetId: string;
  sourceRange: CellRange;
  resultRange: CellRange;
  targetRange: CellRange;
  axis: "row" | "column";
  direction: 1 | -1;
  source: readonly CapturedCell[];
  target: readonly CapturedCell[];
  defaultMode: CellFillMode;
  availableModes: readonly CellFillMode[];
}>;
const LIMIT = 100_000;
const laneCache = new WeakMap<CellFillPlan, Map<string, CapturedCell[]>>();
type SeriesGenerator =
  | { kind: "number"; first: number; step: number }
  | { kind: "text"; prefix: string; first: number; step: number; width: number }
  | { kind: "copy" };
const seriesCache = new WeakMap<CellFillPlan, Map<string, SeriesGenerator>>();
const dateCache = new WeakMap<
  CellFillPlan,
  Map<string, { first: number; step: number | null } | null>
>();
const normalize = (r: CellRange): CellRange => ({
  start: {
    row: Math.min(r.start.row, r.end.row),
    column: Math.min(r.start.column, r.end.column),
  },
  end: {
    row: Math.max(r.start.row, r.end.row),
    column: Math.max(r.start.column, r.end.column),
  },
});
const count = (r: CellRange) => (r.end.row - r.start.row + 1) * (r.end.column - r.start.column + 1);
const key = (a: CellAddress) => `${a.row}:${a.column}`;
function isDateStyle(style: CellStyle | undefined): boolean {
  const format = style?.numberFormat;
  const customCode =
    format?.kind === "custom" ? format.code.replace(/\[[^\]]*\]|"[^"]*"/g, "") : "";
  return (
    format?.kind === "date" ||
    format?.kind === "time" ||
    /(?:y{1,4}|m{1,4}|d{1,4}|h{1,2}|s{1,2})/i.test(customCode)
  );
}
function addresses(r: CellRange): CellAddress[] {
  const out: CellAddress[] = [];
  for (let row = r.start.row; row <= r.end.row; row++)
    for (let column = r.start.column; column <= r.end.column; column++) out.push({ row, column });
  return out;
}
function assertRange(r: CellRange): void {
  if (!r?.start || !r?.end || !isCellAddressInBounds(r.start) || !isCellAddressInBounds(r.end))
    throw new CellFillError("invalidRange", "Cell fill range is outside the sheet.");
}

/** Captures source and target before the first fill; mode switches never accumulate results. */
export function captureCellFill(
  workbook: Workbook,
  sheetId: string,
  sourceInput: CellRange,
  resultInput: CellRange,
): CellFillPlan {
  const sheet = workbook.sheets.get(sheetId);
  if (!sheet) throw new CellFillError("sheetNotFound", `Unknown sheet ${sheetId}.`);
  assertRange(sourceInput);
  assertRange(resultInput);
  const sourceRange = normalize(sourceInput),
    resultRange = normalize(resultInput);
  if (
    sourceRange.start.row < resultRange.start.row ||
    sourceRange.end.row > resultRange.end.row ||
    sourceRange.start.column < resultRange.start.column ||
    sourceRange.end.column > resultRange.end.column
  )
    throw new CellFillError(
      "resultDoesNotContainSource",
      "A fill result must contain its source range.",
    );
  if (count(sourceRange) > LIMIT)
    throw new CellFillError(
      "targetTooLarge",
      "Cell fill source must contain no more than 100000 cells.",
    );
  const sameColumns =
      sourceRange.start.column === resultRange.start.column &&
      sourceRange.end.column === resultRange.end.column,
    sameRows =
      sourceRange.start.row === resultRange.start.row &&
      sourceRange.end.row === resultRange.end.row;
  if (sameColumns === sameRows)
    throw new CellFillError("notOneAxis", "Cell fill only supports a one-axis extension.");
  const axis: "row" | "column" = sameColumns ? "row" : "column";
  const sourceStart = axis === "row" ? sourceRange.start.row : sourceRange.start.column,
    sourceEnd = axis === "row" ? sourceRange.end.row : sourceRange.end.column,
    resultStart = axis === "row" ? resultRange.start.row : resultRange.start.column,
    resultEnd = axis === "row" ? resultRange.end.row : resultRange.end.column;
  const atStart = sourceStart === resultStart,
    atEnd = sourceEnd === resultEnd;
  if (atStart === atEnd)
    throw new CellFillError("notOneAxis", "Cell fill source must be on one edge of its result.");
  const direction: 1 | -1 = atStart ? 1 : -1;
  const targetRange: CellRange =
    axis === "row"
      ? {
          start: {
            row: direction === 1 ? sourceEnd + 1 : resultStart,
            column: sourceRange.start.column,
          },
          end: {
            row: direction === 1 ? resultEnd : sourceStart - 1,
            column: sourceRange.end.column,
          },
        }
      : {
          start: {
            row: sourceRange.start.row,
            column: direction === 1 ? sourceEnd + 1 : resultStart,
          },
          end: {
            row: sourceRange.end.row,
            column: direction === 1 ? resultEnd : sourceStart - 1,
          },
        };
  if (count(targetRange) < 1)
    throw new CellFillError("emptyTarget", "Cell fill target must contain a destination cell.");
  if (count(targetRange) > LIMIT)
    throw new CellFillError(
      "targetTooLarge",
      "Cell fill target must contain no more than 100000 cells.",
    );
  if (sheet.mergedCells.some((r) => doMergedCellRangesIntersect(r, resultRange)))
    throw new CellFillError("mergedCells", "Cell fill across merged cells is not supported.");
  if (
    [...(sheet.hiddenRows ?? [])].some(
      (row) => row >= resultRange.start.row && row <= resultRange.end.row,
    ) ||
    [...(sheet.hiddenColumns ?? [])].some(
      (column) => column >= resultRange.start.column && column <= resultRange.end.column,
    )
  )
    throw new CellFillError("hiddenAxis", "Cell fill cannot cross a hidden row or column.");
  if (
    createSheetFilterHiddenRowIntervals(sheet).some(
      (i) => i.start <= resultRange.end.row && i.end >= resultRange.start.row,
    )
  )
    throw new CellFillError("filterRange", "Cell fill cannot cross a filtered-out row.");
  const capture = (address: CellAddress): CapturedCell => {
    const content = getCellContent(sheet, address);
    return {
      address,
      content: content ? cloneCellContent(content) : null,
      style: cloneCellStyle(getCellStyle(sheet, address) as CellStyle | undefined),
    };
  };
  const source = addresses(sourceRange).map(capture),
    target = addresses(targetRange).map(capture);
  const sourceRowCount = sourceRange.end.row - sourceRange.start.row + 1;
  const sourceColumnCount = sourceRange.end.column - sourceRange.start.column + 1;
  const lanes =
    axis === "row"
      ? Array.from({ length: sourceColumnCount }, (_, column) =>
          Array.from(
            { length: sourceRowCount },
            (_, row) => source[row * sourceColumnCount + column]!,
          ),
        )
      : Array.from({ length: sourceRowCount }, (_, row) =>
          source.slice(row * sourceColumnCount, (row + 1) * sourceColumnCount),
        );
  const numeric = (lane: CapturedCell[]) =>
    lane.every((c) => c.content?.kind === "literal" && typeof c.content.value === "number");
  const textNumber = (lane: CapturedCell[]) =>
    lane.every(
      (c) =>
        c.content?.kind === "literal" &&
        typeof c.content.value === "string" &&
        /\d+$/.test(c.content.value),
    );
  const canSeries = lanes.some((lane) => numeric(lane) || textNumber(lane));
  const canTextSeries = lanes.every((lane) => textNumber(lane));
  const date = lanes.every((l) =>
    l.every(
      (c) =>
        c.content?.kind === "literal" &&
        typeof c.content.value === "number" &&
        isDateStyle(c.style),
    ),
  );
  const availableModes: CellFillMode[] = ["copy", "fillFormatsOnly", "fillWithoutFormatting"];
  if (canSeries) availableModes.push("series");
  if (date) availableModes.push("dateDay", "dateWeekday", "dateMonth", "dateYear");
  const sourceLength = sourceEnd - sourceStart + 1;
  return {
    sheetId,
    sourceRange,
    resultRange,
    targetRange,
    axis,
    direction,
    source,
    target,
    availableModes,
    defaultMode: date
      ? "dateDay"
      : canTextSeries || (sourceLength > 1 && canSeries)
        ? "series"
        : "copy",
  };
}
function lane(plan: CellFillPlan, a: CellAddress): CapturedCell[] {
  const laneKey = plan.axis === "row" ? `c:${a.column}` : `r:${a.row}`;
  const cached = laneCache.get(plan)?.get(laneKey);
  if (cached) return cached;
  const rows = plan.sourceRange.end.row - plan.sourceRange.start.row + 1;
  const columns = plan.sourceRange.end.column - plan.sourceRange.start.column + 1;
  if (plan.axis === "row") {
    const offset = a.column - plan.sourceRange.start.column;
    const values = Array.from({ length: rows }, (_, row) => plan.source[row * columns + offset]!);
    const cache = laneCache.get(plan) ?? new Map<string, CapturedCell[]>();
    cache.set(laneKey, values);
    laneCache.set(plan, cache);
    return values;
  }
  const offset = a.row - plan.sourceRange.start.row;
  const values = plan.source.slice(offset * columns, (offset + 1) * columns);
  const cache = laneCache.get(plan) ?? new Map<string, CapturedCell[]>();
  cache.set(laneKey, values);
  laneCache.set(plan, cache);
  return values;
}
function sourceFor(plan: CellFillPlan, a: CellAddress): CapturedCell {
  const values = lane(plan, a),
    coordinate = plan.axis === "row" ? a.row : a.column,
    start = plan.axis === "row" ? plan.sourceRange.start.row : plan.sourceRange.start.column;
  return values[(((coordinate - start) % values.length) + values.length) % values.length]!;
}
function offset(plan: CellFillPlan, a: CellAddress): number {
  const coordinate = plan.axis === "row" ? a.row : a.column,
    start = plan.axis === "row" ? plan.sourceRange.start.row : plan.sourceRange.start.column;
  return coordinate - start;
}
function arithmetic<T>(values: T[], n: (value: T) => number): number | null {
  if (values.length < 2) return 1;
  const step = n(values[1]!) - n(values[0]!);
  return values.slice(2).every((v, i) => equalArithmeticStep(n(v) - n(values[i + 1]!), step))
    ? step
    : null;
}

function equalArithmeticStep(left: number, right: number): boolean {
  if (left === right) return true;
  // Keep exact integer progressions exact. Decimal subtraction needs a small
  // machine-precision allowance, but a broad relative epsilon would accept
  // visibly different steps for large whole numbers.
  if (Number.isSafeInteger(left) && Number.isSafeInteger(right)) return false;
  const epsilon = Number.EPSILON * 16 * Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= epsilon;
}
function seriesGenerator(plan: CellFillPlan, a: CellAddress): SeriesGenerator {
  const laneKey = plan.axis === "row" ? `c:${a.column}` : `r:${a.row}`;
  const cached = seriesCache.get(plan)?.get(laneKey);
  if (cached) return cached;
  const values = lane(plan, a);
  let generator: SeriesGenerator = { kind: "copy" };
  if (
    values.every(
      (c): c is CapturedCell & { content: { kind: "literal"; value: number } } =>
        c.content?.kind === "literal" && typeof c.content.value === "number",
    )
  ) {
    const step = arithmetic(values, (c) => c.content.value);
    if (step !== null) generator = { kind: "number", first: values[0]!.content.value, step };
  } else if (
    values.every((c) => c.content?.kind === "literal" && typeof c.content.value === "string")
  ) {
    const matches = values.map((c) => (c.content as { value: string }).value.match(/^(.*?)(\d+)$/));
    if (matches.every(Boolean) && matches.every((m) => m![1] === matches[0]![1])) {
      const step = arithmetic(matches, (m) => Number(m![2]));
      if (step !== null)
        generator = {
          kind: "text",
          prefix: matches[0]![1]!,
          first: Number(matches[0]![2]),
          step,
          width: /^0\d/.test(matches[0]![2]!) ? matches[0]![2]!.length : 0,
        };
    }
  }
  const cache = seriesCache.get(plan) ?? new Map<string, SeriesGenerator>();
  cache.set(laneKey, generator);
  seriesCache.set(plan, cache);
  return generator;
}
function seriesContent(plan: CellFillPlan, a: CellAddress): CellContent | null {
  const generator = seriesGenerator(plan, a),
    n = offset(plan, a);
  if (generator.kind === "number")
    return { kind: "literal", value: generator.first + generator.step * n };
  if (generator.kind === "text") {
    const value = generator.first + generator.step * n;
    return {
      kind: "literal",
      value: `${generator.prefix}${value < 0 ? `-${String(Math.abs(value)).padStart(generator.width, "0")}` : String(value).padStart(generator.width, "0")}`,
    };
  }
  const source = sourceFor(plan, a);
  return source.content ? translateCellContentForCopy(source.content, source.address, a) : null;
}
function addDate(
  serial: number,
  system: "1900" | "1904",
  mode: CellFillMode,
  increment: number,
): number {
  const p = excelSerialToDateParts(serial, system),
    d = new Date(
      Date.UTC(p.year, p.month - 1, Math.max(1, p.day), p.hour, p.minute, p.second, p.millisecond),
    );
  if (mode === "dateDay") return serial + increment;
  else if (mode === "dateWeekday") {
    const sign = increment < 0 ? -1 : 1;
    let remaining = Math.abs(increment);
    const weekday = d.getUTCDay();
    if (remaining && (weekday === 0 || weekday === 6)) {
      d.setUTCDate(d.getUTCDate() + (sign > 0 ? (weekday === 6 ? 2 : 1) : weekday === 6 ? -1 : -2));
      remaining -= 1;
    }
    const weeks = Math.trunc(remaining / 5);
    d.setUTCDate(d.getUTCDate() + sign * weeks * 7);
    for (let i = 0; i < remaining % 5; i++) {
      d.setUTCDate(d.getUTCDate() + sign);
      while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + sign);
    }
  } else {
    const months = mode === "dateMonth" ? increment : increment * 12,
      target = d.getUTCFullYear() * 12 + d.getUTCMonth() + months,
      year = Math.floor(target / 12),
      month = ((target % 12) + 12) % 12,
      last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    d.setUTCFullYear(year, month, Math.min(p.day, last));
  }
  return datePartsToExcelSerial(
    {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: p.hour,
      minute: p.minute,
      second: p.second,
      millisecond: p.millisecond,
    },
    system,
  );
}

function weekdayDistance(from: number, to: number, system: "1900" | "1904"): number {
  const fromParts = excelSerialToDateParts(from, system);
  const toParts = excelSerialToDateParts(to, system);
  const start = new Date(Date.UTC(fromParts.year, fromParts.month - 1, Math.max(1, fromParts.day)));
  const end = new Date(Date.UTC(toParts.year, toParts.month - 1, Math.max(1, toParts.day)));
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (days === 0) return 0;
  const sign = days < 0 ? -1 : 1;
  const wholeWeeks = Math.floor(Math.abs(days) / 7);
  let distance = wholeWeeks * 5;
  const cursor = new Date(start);
  for (let i = 0; i < Math.abs(days) % 7; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + sign);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) distance += 1;
  }
  return sign * distance;
}

function weekdayStep(values: CapturedCell[], system: "1900" | "1904"): number | null {
  if (values.length < 2) return 1;
  const serials = values.map((cell) => (cell.content as { value: number }).value);
  const step = weekdayDistance(serials[0]!, serials[1]!, system);
  return serials
    .slice(2)
    .every((serial, index) => weekdayDistance(serials[index + 1]!, serial, system) === step)
    ? step
    : null;
}

function dateContent(
  workbook: Workbook,
  plan: CellFillPlan,
  a: CellAddress,
  mode: CellFillMode,
): CellContent | null {
  const laneKey = `${mode}:${plan.axis === "row" ? `c:${a.column}` : `r:${a.row}`}`;
  let cached = dateCache.get(plan)?.get(laneKey);
  if (cached === undefined) {
    const values = lane(plan, a);
    cached = values.every(
      (c): c is CapturedCell & { content: { kind: "literal"; value: number } } =>
        c.content?.kind === "literal" && typeof c.content.value === "number",
    )
      ? {
          first: values[0]!.content.value,
          step:
            mode === "dateWeekday"
              ? weekdayStep(values, workbook.dateSystem)
              : mode === "dateMonth" || mode === "dateYear"
                ? arithmetic(values, (cell) => {
                    const parts = excelSerialToDateParts(cell.content.value, workbook.dateSystem);
                    return mode === "dateYear" ? parts.year : parts.year * 12 + parts.month - 1;
                  })
                : arithmetic(values, (c) => c.content.value),
        }
      : null;
    const cache =
      dateCache.get(plan) ?? new Map<string, { first: number; step: number | null } | null>();
    cache.set(laneKey, cached);
    dateCache.set(plan, cache);
  }
  if (!cached) return null;
  return cached.step === null
    ? seriesContent(plan, a)
    : {
        kind: "literal",
        value: addDate(cached.first, workbook.dateSystem, mode, cached.step * offset(plan, a)),
      };
}
export function createCellFillCommand(
  workbook: Workbook,
  plan: CellFillPlan,
  mode: CellFillMode = plan.defaultMode,
): SetCellContentsCommand {
  captureCellFill(workbook, plan.sheetId, plan.sourceRange, plan.resultRange);
  if (!plan.availableModes.includes(mode))
    throw new CellFillError("modeUnavailable", `Fill mode ${mode} is unavailable for this source.`);
  const previous = new Map(plan.target.map((c) => [key(c.address), c]));
  return createBatchSetCellContentsCommand(
    plan.target.map((target) => {
      const source = sourceFor(plan, target.address),
        contentMode = mode === "fillWithoutFormatting" ? plan.defaultMode : mode,
        generated =
          contentMode === "series"
            ? seriesContent(plan, target.address)
            : contentMode.startsWith("date")
              ? dateContent(workbook, plan, target.address, contentMode)
              : source.content
                ? translateCellContentForCopy(source.content, source.address, target.address)
                : null,
        original = previous.get(key(target.address))!;
      return {
        sheetId: plan.sheetId,
        address: target.address,
        content: mode === "fillFormatsOnly" ? original.content : generated,
        style: mode === "fillWithoutFormatting" ? (original.style ?? null) : (source.style ?? null),
      };
    }),
    { reconcileBorders: true },
  );
}
