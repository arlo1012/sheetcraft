import {
  datePartsToExcelSerial,
  excelSerialToDateParts,
  type ExcelDateParts,
} from "../date-system.js";
import { isFormulaError, type FormulaValue } from "../types.js";
import type { FormulaFunctionContext, FormulaFunctionDefinition } from "./contracts.js";
import { defineFunction, finiteNumber, formulaError, scalar, values } from "./helpers.js";

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
  if (typeof first !== "number") return isFormulaError(first) ? first : formulaError("NUM");
  const result = first + day - 1;
  if (!Number.isFinite(result)) return formulaError("NUM");
  try {
    excelSerialToDateParts(result, system(context));
    return result;
  } catch {
    return formulaError("NUM");
  }
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

function serialDay(
  context: FormulaFunctionContext,
  index: number,
): number | ReturnType<typeof formulaError> {
  const value = number(context, index);
  if (isFormulaError(value)) return value;
  const day = Math.floor(value);
  return day < 0 ? formulaError("NUM") : day;
}

function sundayZero(day: number, context: FormulaFunctionContext): number {
  return (((day + (system(context) === "1900" ? 6 : 5)) % 7) + 7) % 7;
}

function holidays(
  context: FormulaFunctionContext,
  start: number,
): Set<number> | ReturnType<typeof formulaError> {
  const result = new Set<number>();
  for (let index = start; index < context.argumentCount; index += 1) {
    for (const value of values(context.evaluateArgument(index))) {
      if (value === null) continue;
      const date = finiteNumber(value);
      if (isFormulaError(date)) return date;
      result.add(Math.floor(date));
    }
  }
  return result;
}

function isWeekend(day: number, context: FormulaFunctionContext): boolean {
  const weekday = sundayZero(day, context);
  return weekday === 0 || weekday === 6;
}

function days360(start: ExcelDateParts, end: ExcelDateParts, european: boolean): number {
  let startDay = start.day;
  let endDay = end.day;
  if (european) {
    startDay = Math.min(startDay, 30);
    endDay = Math.min(endDay, 30);
  } else {
    const startLast = start.day === daysInMonth(start.year, start.month);
    const endLast = end.day === daysInMonth(end.year, end.month);
    if (startLast) startDay = 30;
    if (endDay === 31 && startDay >= 30) endDay = 30;
    if (startLast && endLast) endDay = 30;
  }
  return (end.year - start.year) * 360 + (end.month - start.month) * 30 + endDay - startDay;
}

function isoWeek(_parts: ExcelDateParts, day: number, context: FormulaFunctionContext): number {
  const mondayZero = (sundayZero(day, context) + 6) % 7;
  const thursday = day + 3 - mondayZero;
  const year = datePartsFromSerial(thursday, context).year;
  const jan4 = serial(
    { year, month: 1, day: 4, hour: 0, minute: 0, second: 0, millisecond: 0 },
    context,
  );
  if (typeof jan4 !== "number") return 0;
  const firstThursday = jan4 + 3 - ((sundayZero(jan4, context) + 6) % 7);
  return Math.floor((thursday - firstThursday) / 7) + 1;
}

function yearFracActual(start: number, end: number, context: FormulaFunctionContext): number {
  if (start === end) return 0;
  const direction = start < end ? 1 : -1;
  let cursor = direction > 0 ? start : end;
  const limit = direction > 0 ? end : start;
  let result = 0;
  while (cursor < limit) {
    const year = datePartsFromSerial(cursor, context).year;
    const nextYear = serial(
      { year: year + 1, month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 },
      context,
    );
    if (typeof nextYear !== "number") return Number.NaN;
    const boundary = Math.min(limit, nextYear);
    result += (boundary - cursor) / (daysInMonth(year, 2) === 29 ? 366 : 365);
    cursor = boundary;
  }
  return direction * result;
}

function datePartsFromSerial(day: number, context: FormulaFunctionContext): ExcelDateParts {
  return excelSerialToDateParts(day, system(context));
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
      name: "YEARFRAC",
      category: "Date",
      minArgs: 2,
      maxArgs: 3,
      arguments: [{ name: "start_date" }, { name: "end_date" }, { name: "basis", optional: true }],
      lazy: false,
    },
    (context) => {
      const startDay = serialDay(context, 0);
      const endDay = serialDay(context, 1);
      const basis = context.argumentCount === 2 ? 0 : whole(context, 2);
      if (isFormulaError(startDay) || isFormulaError(endDay) || isFormulaError(basis))
        return isFormulaError(startDay) ? startDay : isFormulaError(endDay) ? endDay : basis;
      if (basis < 0 || basis > 4) return formulaError("NUM");
      const start = datePartsFromSerial(startDay, context);
      const end = datePartsFromSerial(endDay, context);
      const result =
        basis === 0
          ? days360(start, end, false) / 360
          : basis === 1
            ? yearFracActual(startDay, endDay, context)
            : basis === 2
              ? (endDay - startDay) / 360
              : basis === 3
                ? (endDay - startDay) / 365
                : days360(start, end, true) / 360;
      return Number.isFinite(result) ? result : formulaError("NUM");
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
      if (
        hour < 0 ||
        minute < 0 ||
        second < 0 ||
        hour > 32_767 ||
        minute > 32_767 ||
        second > 32_767
      )
        return formulaError("NUM");
      const totalSeconds = hour * 3_600 + minute * 60 + second;
      const result = (totalSeconds % 86_400) / 86_400;
      return Number.isFinite(result) ? result : formulaError("NUM");
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
    {
      name: "DAYS360",
      category: "Date",
      minArgs: 2,
      maxArgs: 3,
      arguments: [{ name: "start_date" }, { name: "end_date" }, { name: "method", optional: true }],
      lazy: false,
    },
    (context) => {
      const start = dateParts(context, 0);
      const end = dateParts(context, 1);
      const method = context.argumentCount === 2 ? 0 : whole(context, 2);
      if (isFormulaError(start) || isFormulaError(end) || isFormulaError(method))
        return isFormulaError(start) ? start : isFormulaError(end) ? end : method;
      return days360(start, end, method !== 0);
    },
  ),
  defineFunction(
    {
      name: "NETWORKDAYS",
      category: "Date",
      minArgs: 2,
      maxArgs: null,
      arguments: [
        { name: "start_date" },
        { name: "end_date" },
        { name: "holidays", optional: true },
      ],
      lazy: false,
    },
    (context) => {
      const start = serialDay(context, 0);
      const end = serialDay(context, 1);
      const offDays = holidays(context, 2);
      if (isFormulaError(start)) return start;
      if (isFormulaError(end)) return end;
      if (isFormulaError(offDays)) return offDays;
      const direction = start <= end ? 1 : -1;
      let result = 0;
      for (let day = start; direction > 0 ? day <= end : day >= end; day += direction)
        if (!isWeekend(day, context) && !offDays.has(day)) result += direction;
      return result;
    },
  ),
  defineFunction(
    {
      name: "WORKDAY",
      category: "Date",
      minArgs: 2,
      maxArgs: null,
      arguments: [{ name: "start_date" }, { name: "days" }, { name: "holidays", optional: true }],
      lazy: false,
    },
    (context) => {
      const start = serialDay(context, 0);
      const count = whole(context, 1);
      const offDays = holidays(context, 2);
      if (isFormulaError(start)) return start;
      if (isFormulaError(count)) return count;
      if (isFormulaError(offDays)) return offDays;
      const direction = count < 0 ? -1 : 1;
      let remaining = Math.abs(count);
      let day = start;
      while (remaining > 0) {
        day += direction;
        if (day < 0 || day > 2_958_465) return formulaError("NUM");
        if (!isWeekend(day, context) && !offDays.has(day)) remaining -= 1;
      }
      return day;
    },
  ),
  defineFunction(
    {
      name: "WEEKNUM",
      category: "Date",
      minArgs: 1,
      maxArgs: 2,
      arguments: [{ name: "serial_number" }, { name: "return_type", optional: true }],
      lazy: false,
    },
    (context) => {
      const day = serialDay(context, 0);
      const returnType = context.argumentCount === 1 ? 1 : whole(context, 1);
      if (isFormulaError(day) || isFormulaError(returnType))
        return isFormulaError(day) ? day : returnType;
      const parts = datePartsFromSerial(day, context);
      if (returnType === 21) return isoWeek(parts, day, context);
      const starts: Record<number, number> = {
        1: 0,
        2: 1,
        11: 1,
        12: 2,
        13: 3,
        14: 4,
        15: 5,
        16: 6,
        17: 0,
      };
      const start = starts[returnType];
      if (start === undefined) return formulaError("NUM");
      const yearStart = serial(
        { year: parts.year, month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 },
        context,
      );
      return typeof yearStart !== "number"
        ? formulaError("NUM")
        : Math.floor((day - yearStart + ((sundayZero(yearStart, context) - start + 7) % 7)) / 7) +
            1;
    },
  ),
  defineFunction(
    {
      name: "ISOWEEKNUM",
      category: "Date",
      minArgs: 1,
      maxArgs: 1,
      arguments: [{ name: "date" }],
      lazy: false,
    },
    (context) => {
      const day = serialDay(context, 0);
      return isFormulaError(day) ? day : isoWeek(datePartsFromSerial(day, context), day, context);
    },
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
