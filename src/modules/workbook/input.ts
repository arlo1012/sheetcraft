import type { CellValue } from "./workbook";

const NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function exceedsSpreadsheetPrecision(value: string): boolean {
  const significantDigits = value
    .replace(/^[+-]/, "")
    .replace(/e.*$/i, "")
    .replace(".", "")
    .replace(/^0+/, "");
  return significantDigits.length > 15;
}

export function parseCellInput(input: string): CellValue {
  if (input === "") {
    return null;
  }

  if (input.startsWith("'")) {
    return input.slice(1);
  }

  const trimmedInput = input.trim();
  if (/^true$/i.test(trimmedInput)) {
    return true;
  }
  if (/^false$/i.test(trimmedInput)) {
    return false;
  }

  if (NUMBER_PATTERN.test(trimmedInput) && !exceedsSpreadsheetPrecision(trimmedInput)) {
    const numberValue = Number(trimmedInput);
    if (Number.isFinite(numberValue)) {
      return numberValue;
    }
  }

  return input;
}

export function formatCellValueForDisplay(value: CellValue): string {
  if (value === null) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }

  return String(value);
}

export function formatCellValueForInput(value: CellValue): string {
  if (typeof value === "string" && !Object.is(parseCellInput(value), value)) {
    return `'${value}`;
  }

  return formatCellValueForDisplay(value);
}
