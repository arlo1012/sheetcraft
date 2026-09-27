import { captureCellFill, createCellFillCommand } from "../cell-autofill.js";
import { datePartsToExcelSerial, excelSerialToDateParts } from "../formula/date-system.js";
import type { FormulaValue } from "../formula/types.js";
import {
  getCellContent,
  getCellStyle,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "../workbook.js";
import type { SetCellContentsCommand } from "./contracts.js";
import { DataFillError, MAX_FILL_CELLS, prepareFillTarget } from "./fill-common.js";
import { createBatchSetCellContentsCommand } from "./values.js";

export type FillSeriesOptions = {
  axis: "rows" | "columns";
  type: "linear" | "growth" | "date" | "auto";
  step: number;
  stop?: number;
  dateUnit: "day" | "weekday" | "month" | "year";
  trend: boolean;
};

function validateOptions(value: FillSeriesOptions): void {
  if (
    !value ||
    typeof value !== "object" ||
    (value.axis !== "rows" && value.axis !== "columns") ||
    !["linear", "growth", "date", "auto"].includes(value.type) ||
    typeof value.step !== "number" ||
    !["day", "weekday", "month", "year"].includes(value.dateUnit) ||
    typeof value.trend !== "boolean" ||
    (value.stop !== undefined && !Number.isFinite(value.stop)) ||
    (value.trend && value.type !== "linear" && value.type !== "growth") ||
    (!value.trend && value.type !== "auto" && !Number.isFinite(value.step)) ||
    (value.type === "growth" && !value.trend && value.step <= 0) ||
    (value.type === "date" && !Number.isInteger(value.step))
  ) {
    throw new DataFillError("invalidOptions", "The fill series options are invalid.");
  }
}

function count(range: CellRange): number {
  return (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1);
}

function dateStyle(style: ReturnType<typeof getCellStyle>): boolean {
  const format = style?.numberFormat;
  const code = format?.kind === "custom" ? format.code.replace(/\[[^\]]*\]|"[^"]*"/g, "") : "";
  return (
    format?.kind === "date" ||
    format?.kind === "time" ||
    /(?:y{1,4}|m{1,4}|d{1,4}|h{1,2}|s{1,2})/i.test(code)
  );
}

function numeric(value: FormulaValue): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function addDate(
  serial: number,
  workbook: Workbook,
  unit: FillSeriesOptions["dateUnit"],
  step: number,
): number {
  if (unit === "day") {
    const result = serial + step;
    excelSerialToDateParts(result, workbook.dateSystem);
    return result;
  }
  const parts = excelSerialToDateParts(serial, workbook.dateSystem);
  const date = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      Math.max(1, parts.day),
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    ),
  );
  if (unit === "weekday") {
    const sign = step < 0 ? -1 : 1;
    let remaining = Math.abs(step);
    const weekday = date.getUTCDay();
    if (remaining && (weekday === 0 || weekday === 6)) {
      date.setUTCDate(
        date.getUTCDate() + (sign > 0 ? (weekday === 6 ? 2 : 1) : weekday === 6 ? -1 : -2),
      );
      remaining -= 1;
    }
    const weeks = Math.trunc(remaining / 5);
    date.setUTCDate(date.getUTCDate() + sign * weeks * 7);
    for (let index = 0; index < remaining % 5; index++) {
      date.setUTCDate(date.getUTCDate() + sign);
      while (date.getUTCDay() === 0 || date.getUTCDay() === 6)
        date.setUTCDate(date.getUTCDate() + sign);
    }
  } else {
    const months = unit === "month" ? step : step * 12;
    const target = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
    const year = Math.floor(target / 12),
      month = ((target % 12) + 12) % 12;
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    date.setUTCFullYear(year, month, Math.min(parts.day, last));
  }
  return datePartsToExcelSerial(
    {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: parts.hour,
      minute: parts.minute,
      second: parts.second,
      millisecond: parts.millisecond,
    },
    workbook.dateSystem,
  );
}

function seriesLength(workbook: Workbook, seed: number, options: FillSeriesOptions): number {
  if (options.stop === undefined) return 1;
  if (options.type === "auto")
    throw new DataFillError("invalidOptions", "Automatic fill does not support a stop value.");
  let previous = seed;
  for (let index = 1; index <= MAX_FILL_CELLS; index++) {
    const value =
      options.type === "date"
        ? addDate(seed, workbook, options.dateUnit, options.step * index)
        : options.type === "growth"
          ? seed * options.step ** index
          : seed + options.step * index;
    if (!Number.isFinite(value))
      throw new DataFillError("invalidSeed", "The series produced an invalid value.");
    if (value === previous)
      throw new DataFillError("invalidOptions", "A stop value requires a progressing series.");
    if (!inStop(seed, value, options.stop)) return index;
    if (value === options.stop) return index + 1;
    previous = value;
  }
  throw new DataFillError("tooLarge", `A fill can change at most ${MAX_FILL_CELLS} cells.`);
}

function expandedRange(
  workbook: Workbook,
  range: CellRange,
  options: FillSeriesOptions,
  seed: number,
): CellRange {
  if (options.stop === undefined || count(range) !== 1) return range;
  const seedSpan = seriesLength(workbook, seed, options);
  const end =
    options.axis === "rows"
      ? { row: range.end.row, column: range.start.column + seedSpan - 1 }
      : { row: range.start.row + seedSpan - 1, column: range.end.column };
  if (end.row > 1_048_575 || end.column > 16_383)
    throw new DataFillError("invalidRange", "The stopped series exceeds the sheet boundary.");
  return { start: range.start, end };
}

function inStop(seed: number, value: number, stop: number | undefined): boolean {
  if (stop === undefined) return true;
  if (stop === seed) return false;
  return stop > seed ? value > seed && value <= stop : value < seed && value >= stop;
}

function fit(
  values: readonly { index: number; value: number }[],
  growth: boolean,
): { intercept: number; slope: number } {
  const samples = values.map(({ index, value }) => ({
    index,
    value: growth ? Math.log(value) : value,
  }));
  if (growth && samples.some((sample) => !Number.isFinite(sample.value)))
    throw new DataFillError("invalidSeed", "Growth trends require positive numeric seeds.");
  const n = samples.length;
  if (n < 2)
    throw new DataFillError("invalidSeed", "Trend series require at least two numeric seeds.");
  const sumX = samples.reduce((sum, sample) => sum + sample.index, 0);
  const sumXX = samples.reduce((sum, sample) => sum + sample.index * sample.index, 0);
  const sumY = samples.reduce((sum, sample) => sum + sample.value, 0);
  const sumXY = samples.reduce((sum, sample) => sum + sample.value * sample.index, 0);
  const divisor = n * sumXX - sumX * sumX;
  return divisor === 0
    ? { intercept: samples[0]!.value, slope: 0 }
    : {
        intercept: (sumY * sumXX - sumX * sumXY) / divisor,
        slope: (n * sumXY - sumX * sumY) / divisor,
      };
}

function laneAddresses(range: CellRange, axis: FillSeriesOptions["axis"]): CellAddress[][] {
  const output: CellAddress[][] = [];
  if (axis === "rows")
    for (let row = range.start.row; row <= range.end.row; row++)
      output.push(
        Array.from({ length: range.end.column - range.start.column + 1 }, (_, offset) => ({
          row,
          column: range.start.column + offset,
        })),
      );
  else
    for (let column = range.start.column; column <= range.end.column; column++)
      output.push(
        Array.from({ length: range.end.row - range.start.row + 1 }, (_, offset) => ({
          row: range.start.row + offset,
          column,
        })),
      );
  return output;
}

/** Retains target styles, supplying a date display format for date series when needed. */
export function createFillSeriesCommand(
  workbook: Workbook,
  sheetId: string,
  input: CellRange,
  options: FillSeriesOptions,
): SetCellContentsCommand {
  validateOptions(options);
  const initial = prepareFillTarget(workbook, sheetId, input);
  const initialSeed = numeric(initial.evaluator.getComputedValue(initial.range.start));
  if (options.stop !== undefined && initialSeed === null)
    throw new DataFillError("invalidSeed", "A stopped series requires a numeric seed.");
  if (options.trend && count(initial.range) === 1)
    throw new DataFillError("invalidSeed", "Trend series require at least two numeric seeds.");
  const expanded = expandedRange(workbook, initial.range, options, initialSeed ?? 0);
  const { sheet, range, evaluator } =
    expanded === initial.range ? initial : prepareFillTarget(workbook, sheetId, expanded);
  const changes: SetCellContentsCommand["changes"] = [];
  for (const lane of laneAddresses(range, options.axis)) {
    const seed = lane[0]!;
    const seedValue = numeric(evaluator.getComputedValue(seed));
    if (options.type !== "auto" && seedValue === null)
      throw new DataFillError("invalidSeed", "The series seed must be a finite number.");
    if (options.type === "auto") {
      if (lane.length === 1) continue;
      let sourceLength = 0;
      while (sourceLength < lane.length && getCellContent(sheet, lane[sourceLength]!) !== null)
        sourceLength++;
      if (!sourceLength)
        throw new DataFillError("invalidSeed", "Automatic fill requires a source cell.");
      if (sourceLength === lane.length) continue;
      const sourceRange = { start: seed, end: lane[sourceLength - 1]! };
      const plan = captureCellFill(workbook, sheetId, sourceRange, {
        start: seed,
        end: lane[lane.length - 1]!,
      });
      const generated = createCellFillCommand(workbook, plan);
      for (const change of generated.changes)
        changes.push({ sheetId, address: change.address, content: change.content });
      continue;
    }
    const known = lane
      .map((address, index) => ({
        index,
        value:
          getCellContent(sheet, address) === null
            ? null
            : numeric(evaluator.getComputedValue(address)),
      }))
      .filter((sample): sample is { index: number; value: number } => sample.value !== null);
    const model = options.trend ? fit(known, options.type === "growth") : null;
    const startIndex = options.trend ? 0 : 1;
    for (let index = startIndex; index < lane.length; index++) {
      const value =
        options.type === "date"
          ? addDate(seedValue!, workbook, options.dateUnit, options.step * index)
          : options.trend
            ? options.type === "growth"
              ? Math.exp(model!.intercept + model!.slope * index)
              : model!.intercept + model!.slope * index
            : options.type === "growth"
              ? seedValue! * options.step ** index
              : seedValue! + options.step * index;
      if (!Number.isFinite(value))
        throw new DataFillError("invalidSeed", "The series produced an invalid value.");
      const stopOrigin = options.trend
        ? options.type === "growth"
          ? Math.exp(model!.intercept)
          : model!.intercept
        : seedValue!;
      if (!(options.trend && index === 0) && !inStop(stopOrigin, value, options.stop)) break;
      const target = lane[index]!;
      const seedStyle = getCellStyle(sheet, seed);
      const style =
        options.type === "date" && !dateStyle(getCellStyle(sheet, target))
          ? {
              ...getCellStyle(sheet, target),
              numberFormat: dateStyle(seedStyle)
                ? seedStyle!.numberFormat
                : { kind: "date" as const, code: "yyyy-mm-dd" },
            }
          : undefined;
      changes.push({
        sheetId,
        address: target,
        content: { kind: "literal", value },
        ...(style ? { style } : {}),
      });
    }
  }
  if (!changes.length)
    throw new DataFillError("emptyResult", "The fill series has no destination cells.");
  return createBatchSetCellContentsCommand(changes);
}
