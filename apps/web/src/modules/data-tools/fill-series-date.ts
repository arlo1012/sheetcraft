import { datePartsToExcelSerial, type ExcelDateSystem } from "@sheetcraft/core/formula";
import { DataFillError } from "@sheetcraft/core/commands";
import type { FillSeriesDraft } from "./fill-tool-types";

type DateUnit = FillSeriesDraft["dateUnit"];

type CivilDate = { year: number; month: number; day: number };

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseInteger(value: string): number | undefined {
  return /^\d+$/.test(value) ? Number(value) : undefined;
}

function parseDate(value: string): CivilDate | undefined {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  )
    return undefined;
  return { year, month, day };
}

function parseMonth(value: string): Pick<CivilDate, "year" | "month"> | undefined {
  const match = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1 || year > 9999 || month < 1 || month > 12) return undefined;
  return { year, month };
}

function invalidStop(): never {
  throw new DataFillError("invalidOptions", "Invalid date stop value.");
}

/**
 * Turns a date series stop input into a calendar boundary. Month and year
 * stops include the selected period: positive steps use its final day and
 * negative steps use its first day.
 */
export function parseFillSeriesDateStop(
  input: string,
  unit: DateUnit,
  step: number,
  dateSystem: ExcelDateSystem,
): number | undefined {
  const value = input.trim();
  if (!value) return undefined;

  let date: CivilDate | undefined;
  if (unit === "day" || unit === "weekday") {
    date = parseDate(value);
  } else if (unit === "month") {
    const period = parseMonth(value);
    const fullDate = parseDate(value);
    if (period) date = { ...period, day: step < 0 ? 1 : daysInMonth(period.year, period.month) };
    else if (fullDate)
      date = {
        year: fullDate.year,
        month: fullDate.month,
        day: step < 0 ? 1 : daysInMonth(fullDate.year, fullDate.month),
      };
  } else {
    const year = parseInteger(value);
    const fullDate = parseDate(value);
    if (year !== undefined && year >= 1 && year <= 9999)
      date = { year, month: step < 0 ? 1 : 12, day: step < 0 ? 1 : 31 };
    else if (fullDate)
      date = { year: fullDate.year, month: step < 0 ? 1 : 12, day: step < 0 ? 1 : 31 };
  }
  if (!date) invalidStop();
  try {
    return datePartsToExcelSerial(
      { ...date, hour: 0, minute: 0, second: 0, millisecond: 0 },
      dateSystem,
    );
  } catch {
    invalidStop();
  }
}
