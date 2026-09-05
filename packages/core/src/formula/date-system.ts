const MILLISECONDS_PER_DAY = 86_400_000;
const MIN_YEAR = 1;
const MAX_YEAR = 9_999;

export type ExcelDateSystem = "1900" | "1904";

/**
 * A timezone-free civil date and time used by Excel serial values.
 *
 * All fields are required so conversion never inherits values from a host
 * timezone or a JavaScript Date. `day: 0` is reserved for the 1900 system's
 * serial zero. The otherwise non-Gregorian 1900-02-29 represents serial 60.
 */
export type ExcelDateParts = Readonly<{
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}>;

export function normalizeExcelDateSystem(value: unknown): ExcelDateSystem {
  if (value === "1900" || value === "1904") {
    return value;
  }

  throw new TypeError("Excel date system must be '1900' or '1904'.");
}

/**
 * Converts an Excel serial value into explicit civil parts.
 *
 * Fractional serial values are rounded to the nearest millisecond. In the
 * 1900 system, serial 0 maps to 1900-01-00 (the explicit zero-day policy) and
 * serial 60 maps to the Excel-only, non-Gregorian 1900-02-29. Those values are
 * deliberately represented as parts rather than a JavaScript Date.
 */
export function excelSerialToDateParts(
  serial: number,
  dateSystem: ExcelDateSystem,
): ExcelDateParts {
  assertDateSystem(dateSystem);
  if (!Number.isFinite(serial) || serial < 0) {
    throw new RangeError("Excel serial must be a finite non-negative number.");
  }

  const totalMilliseconds = Math.round(serial * MILLISECONDS_PER_DAY);
  if (!Number.isSafeInteger(totalMilliseconds)) {
    throw new RangeError("Excel serial is outside the supported date range.");
  }

  const serialDay = Math.floor(totalMilliseconds / MILLISECONDS_PER_DAY);
  const timeMilliseconds = totalMilliseconds % MILLISECONDS_PER_DAY;
  if (serialDay > maximumSerialDay(dateSystem)) {
    throw new RangeError("Excel serial is outside the supported date range.");
  }

  return {
    ...serialDayToDateParts(serialDay, dateSystem),
    ...timeMillisecondsToParts(timeMilliseconds),
  };
}

/**
 * Converts explicit, timezone-free civil parts into an Excel serial value.
 *
 * The 1900-only parts 1900-01-00 and 1900-02-29 preserve Excel serials 0 and
 * 60 respectively. All other dates use the proleptic Gregorian calendar.
 */
export function datePartsToExcelSerial(parts: ExcelDateParts, dateSystem: ExcelDateSystem): number {
  assertDateSystem(dateSystem);
  assertDateParts(parts, dateSystem);

  const serialDay = datePartsToSerialDay(parts, dateSystem);
  if (serialDay < 0 || serialDay > maximumSerialDay(dateSystem)) {
    throw new RangeError("Excel date is outside the supported range for its date system.");
  }
  const timeMilliseconds =
    ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1_000 + parts.millisecond;
  return serialDay + timeMilliseconds / MILLISECONDS_PER_DAY;
}

function assertDateSystem(dateSystem: ExcelDateSystem): void {
  normalizeExcelDateSystem(dateSystem);
}

function assertDateParts(parts: ExcelDateParts, dateSystem: ExcelDateSystem): void {
  if (typeof parts !== "object" || parts === null) {
    throw new TypeError("Excel date parts must be an object.");
  }

  const values = [
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    parts.millisecond,
  ];
  if (!values.every(Number.isInteger)) {
    throw new RangeError("Excel date parts must be finite integers.");
  }
  if (parts.hour < 0 || parts.hour > 23 || parts.minute < 0 || parts.minute > 59) {
    throw new RangeError("Excel date time is outside the supported range.");
  }
  if (parts.second < 0 || parts.second > 59 || parts.millisecond < 0 || parts.millisecond > 999) {
    throw new RangeError("Excel date time is outside the supported range.");
  }

  if (dateSystem === "1900" && parts.year === 1900 && parts.month === 1 && parts.day === 0) {
    return;
  }
  if (dateSystem === "1900" && parts.year === 1900 && parts.month === 2 && parts.day === 29) {
    return;
  }

  if (parts.year < MIN_YEAR || parts.year > MAX_YEAR || parts.month < 1 || parts.month > 12) {
    throw new RangeError("Excel date is outside the supported range.");
  }
  if (parts.day < 1 || parts.day > daysInMonth(parts.year, parts.month)) {
    throw new RangeError("Excel date is outside the supported range.");
  }
}

function datePartsToSerialDay(parts: ExcelDateParts, dateSystem: ExcelDateSystem): number {
  if (dateSystem === "1900") {
    if (parts.year === 1900 && parts.month === 1 && parts.day === 0) {
      return 0;
    }
    if (parts.year === 1900 && parts.month === 2 && parts.day === 29) {
      return 60;
    }
  }

  const dayIndex = daysBeforeDate(parts.year, parts.month, parts.day);
  const epochIndex = daysBeforeDate(dateSystem === "1900" ? 1900 : 1904, 1, 1);
  let serialDay = dayIndex - epochIndex + (dateSystem === "1900" ? 1 : 0);
  if (dateSystem === "1900" && dayIndex >= daysBeforeDate(1900, 3, 1)) {
    serialDay += 1;
  }
  return serialDay;
}

function serialDayToDateParts(
  serialDay: number,
  dateSystem: ExcelDateSystem,
): Pick<ExcelDateParts, "year" | "month" | "day"> {
  if (dateSystem === "1900") {
    if (serialDay === 0) {
      return { year: 1900, month: 1, day: 0 };
    }
    if (serialDay === 60) {
      return { year: 1900, month: 2, day: 29 };
    }
  }

  const epochIndex = daysBeforeDate(dateSystem === "1900" ? 1900 : 1904, 1, 1);
  const dayIndex = epochIndex + serialDay - (dateSystem === "1900" ? (serialDay < 60 ? 1 : 2) : 0);
  return dateFromDayIndex(dayIndex);
}

function maximumSerialDay(dateSystem: ExcelDateSystem): number {
  return datePartsToSerialDay(
    { year: MAX_YEAR, month: 12, day: 31, hour: 0, minute: 0, second: 0, millisecond: 0 },
    dateSystem,
  );
}

function timeMillisecondsToParts(
  timeMilliseconds: number,
): Pick<ExcelDateParts, "hour" | "minute" | "second" | "millisecond"> {
  const hour = Math.floor(timeMilliseconds / 3_600_000);
  const minute = Math.floor((timeMilliseconds % 3_600_000) / 60_000);
  const second = Math.floor((timeMilliseconds % 60_000) / 1_000);
  const millisecond = timeMilliseconds % 1_000;
  return { hour, minute, second, millisecond };
}

function daysBeforeDate(year: number, month: number, day: number): number {
  const priorYear = year - 1;
  return (
    priorYear * 365 +
    Math.floor(priorYear / 4) -
    Math.floor(priorYear / 100) +
    Math.floor(priorYear / 400) +
    daysBeforeMonth(year, month) +
    day -
    1
  );
}

function dateFromDayIndex(dayIndex: number): Pick<ExcelDateParts, "year" | "month" | "day"> {
  let year = Math.floor(dayIndex / 365.2425) + 1;
  while (daysBeforeDate(year + 1, 1, 1) <= dayIndex) {
    year += 1;
  }
  while (daysBeforeDate(year, 1, 1) > dayIndex) {
    year -= 1;
  }

  let month = 1;
  while (month < 12 && daysBeforeDate(year, month + 1, 1) <= dayIndex) {
    month += 1;
  }
  return { year, month, day: dayIndex - daysBeforeDate(year, month, 1) + 1 };
}

function daysBeforeMonth(year: number, month: number): number {
  const monthOffsets = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const offset = monthOffsets[month - 1];
  if (offset === undefined) {
    throw new RangeError("Month is outside the supported range.");
  }
  return offset + (month > 2 && isLeapYear(year) ? 1 : 0);
}

function daysInMonth(year: number, month: number): number {
  const monthLengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const length = monthLengths[month - 1];
  if (length === undefined) {
    throw new RangeError("Month is outside the supported range.");
  }
  return length;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
