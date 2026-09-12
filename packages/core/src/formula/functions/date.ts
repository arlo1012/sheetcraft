import {
  datePartsToExcelSerial,
  excelSerialToDateParts,
  type ExcelDateParts,
} from "../date-system.js";
import { isFormulaError, type FormulaValue } from "../types.js";
import type { FormulaFunctionContext, FormulaFunctionDefinition } from "./contracts.js";
import { defineFunction, finiteNumber, formulaError, scalar } from "./helpers.js";

function number(
  context: FormulaFunctionContext,
  index: number,
): number | ReturnType<typeof formulaError> {
  return finiteNumber(scalar(context.evaluateArgument(index)));
}

function whole(
  context: FormulaFunctionContext,
  index: number,
): number | ReturnType<typeof formulaError> {
  const value = number(context, index);
  return isFormulaError(value) ? value : Math.trunc(value);
}

function system(context: FormulaFunctionContext) {
  return context.dateSystem ?? "1900";
}

function dateParts(
  context: FormulaFunctionContext,
  index: number,
): ExcelDateParts | ReturnType<typeof formulaError> {
  const value = number(context, index);
  if (isFormulaError(value)) return value;
  try {
    return excelSerialToDateParts(Math.floor(value), system(context));
  } catch {
    return formulaError("NUM");
  }
}

function serial(parts: ExcelDateParts, context: FormulaFunctionContext): FormulaValue {
  try {
    return datePartsToExcelSerial(parts, system(context));
  } catch {
    return formulaError("NUM");
  }
}

function daysInMonth(year: number, month: number): number {
  return month === 2
    ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
      ? 29
      : 28
    : [4, 6, 9, 11].includes(month)
      ? 30
      : 31;
}

function normalizedDate(
  year: number,
  month: number,
  day: number,
  context: FormulaFunctionContext,
): FormulaValue {
  if (year >= 0 && year <= 1899) year += 1900;
  if (year < 0 || year >= 10_000) return formulaError("NUM");
  year += Math.floor((month - 1) / 12);
  month = ((((month - 1) % 12) + 12) % 12) + 1;
  if (year < 1 || year > 9_999) return formulaError("NUM");
  const first = serial(
    { year, month, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 },
    context,
  );
  return typeof first === "number"
    ? first + day - 1
    : isFormulaError(first)
      ? first
      : formulaError("NUM");
}

function shiftedMonth(context: FormulaFunctionContext, endOfMonth: boolean): FormulaValue {
  const source = dateParts(context, 0);
  const months = whole(context, 1);
  if (isFormulaError(source) || isFormulaError(months))
    return isFormulaError(source) ? source : months;
  let year = source.year + Math.floor((source.month - 1 + months) / 12);
  const month = ((((source.month - 1 + months) % 12) + 12) % 12) + 1;
  if (year < 1 || year > 9_999) return formulaError("NUM");
  // Serial 60 is the only deliberately non-Gregorian date. Moving it by months follows its displayed day.
  const day = endOfMonth
    ? daysInMonth(year, month)
    : Math.min(source.day, daysInMonth(year, month));
  return serial({ year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 }, context);
}

function weekday(context: FormulaFunctionContext): FormulaValue {
  const value = number(context, 0);
  const returnType = context.argumentCount === 1 ? 1 : whole(context, 1);
  if (isFormulaError(value) || isFormulaError(returnType))
    return isFormulaError(value) ? value : returnType;
  const serialDay = Math.floor(value);
  if (serialDay < 0) return formulaError("NUM");
  const sundayZero = (((serialDay + (system(context) === "1900" ? 6 : 5)) % 7) + 7) % 7;
  if (returnType === 1) return sundayZero + 1;
  if (returnType === 2 || returnType === 11) return ((sundayZero + 6) % 7) + 1;
  if (returnType === 3) return (sundayZero + 6) % 7;
  const starts: Record<number, number> = { 12: 2, 13: 3, 14: 4, 15: 5, 16: 6, 17: 0 };
  return starts[returnType] === undefined
    ? formulaError("NUM")
    : ((sundayZero - starts[returnType] + 7) % 7) + 1;
}

function clock(context: FormulaFunctionContext): ExcelDateParts | ReturnType<typeof formulaError> {
  return context.now?.() ?? formulaError("VALUE");
}

export const DATE_FUNCTIONS = [
  defineFunction(
    {
      name: "DATE",
      category: "Date",
      minArgs: 3,
      maxArgs: 3,
      arguments: [{ name: "year" }, { name: "month" }, { name: "day" }],
      lazy: false,
    },
    (context) => {
      const year = whole(context, 0);
      const month = whole(context, 1);
      const day = whole(context, 2);
      return isFormulaError(year)
        ? year
        : isFormulaError(month)
          ? month
          : isFormulaError(day)
            ? day
            : normalizedDate(year, month, day, context);
    },
  ),
  defineFunction(
    {
      name: "TIME",
      category: "Date",
      minArgs: 3,
      maxArgs: 3,
      arguments: [{ name: "hour" }, { name: "minute" }, { name: "second" }],
      lazy: false,
    },
    (context) => {
      const hour = whole(context, 0);
      const minute = whole(context, 1);
      const second = whole(context, 2);
      if (isFormulaError(hour) || isFormulaError(minute) || isFormulaError(second))
        return isFormulaError(hour) ? hour : isFormulaError(minute) ? minute : second;
      if (hour < 0 || minute < 0 || second < 0) return formulaError("NUM");
      return ((hour * 3_600 + minute * 60 + second) % 86_400) / 86_400;
    },
  ),
  ...(["YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND"] as const).map((name) =>
    defineFunction(
      {
        name,
        category: "Date",
        minArgs: 1,
        maxArgs: 1,
        arguments: [{ name: "serial_number" }],
        lazy: false,
      },
      (context) => {
        const parts = dateParts(context, 0);
        if (isFormulaError(parts)) return parts;
        return name === "YEAR"
          ? parts.year
          : name === "MONTH"
            ? parts.month
            : name === "DAY"
              ? parts.day
              : name === "HOUR"
                ? parts.hour
                : name === "MINUTE"
                  ? parts.minute
                  : parts.second;
      },
    ),
  ),
  defineFunction(
    {
      name: "DAYS",
      category: "Date",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "end_date" }, { name: "start_date" }],
      lazy: false,
    },
    (context) => {
      const end = number(context, 0);
      const start = number(context, 1);
      return isFormulaError(end)
        ? end
        : isFormulaError(start)
          ? start
          : Math.floor(end) - Math.floor(start);
    },
  ),
  defineFunction(
    {
      name: "EDATE",
      category: "Date",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "start_date" }, { name: "months" }],
      lazy: false,
    },
    (context) => shiftedMonth(context, false),
  ),
  defineFunction(
    {
      name: "EOMONTH",
      category: "Date",
      minArgs: 2,
      maxArgs: 2,
      arguments: [{ name: "start_date" }, { name: "months" }],
      lazy: false,
    },
    (context) => shiftedMonth(context, true),
  ),
  defineFunction(
    {
      name: "WEEKDAY",
      category: "Date",
      minArgs: 1,
      maxArgs: 2,
      arguments: [{ name: "serial_number" }, { name: "return_type", optional: true }],
      lazy: false,
    },
    weekday,
  ),
  defineFunction(
    { name: "TODAY", category: "Date", minArgs: 0, maxArgs: 0, arguments: [], lazy: false },
    (context) => {
      const now = clock(context);
      return isFormulaError(now)
        ? now
        : serial({ ...now, hour: 0, minute: 0, second: 0, millisecond: 0 }, context);
    },
  ),
  defineFunction(
    { name: "NOW", category: "Date", minArgs: 0, maxArgs: 0, arguments: [], lazy: false },
    (context) => {
      const now = clock(context);
      return isFormulaError(now) ? now : serial(now, context);
    },
  ),
] as const satisfies readonly FormulaFunctionDefinition[];
