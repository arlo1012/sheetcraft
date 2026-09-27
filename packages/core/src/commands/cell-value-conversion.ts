import { cloneCellStyle, type CellStyle } from "../style.js";
import { expandSelectionToMergedCellRanges, MergedCellRangeResolver } from "../merged-cells.js";
import type { CellContentChange, SetCellContentsCommand } from "./contracts.js";
import { assertCellRange, normalizeRange, parseCellKey } from "./helpers.js";
import type { CellRange, Sheet } from "../workbook.js";

export type CellValueConversionMode = "text-to-number" | "number-to-text";

/**
 * Controls the deliberate precision-loss path used by error-correction UI.
 * Ordinary conversions retain the spreadsheet's safety protection by default.
 */
export type CellValueConversionOptions = {
  allowPrecisionLoss?: boolean;
};

const NUMBER_PATTERN = /^[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function exceedsSpreadsheetPrecision(value: string): boolean {
  const significantDigits = value
    .replace(/^[+-]/, "")
    .replace(/e.*$/i, "")
    .replace(/[,.]/g, "")
    .replace(/^0+/, "");
  return significantDigits.length > 15;
}

function hasNonZeroMantissa(value: string): boolean {
  return /[1-9]/.test(value.replace(/e.*$/i, ""));
}

function incrementDigits(digits: string): string {
  const characters = digits.split("");
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    if (characters[index] === "9") {
      characters[index] = "0";
      continue;
    }
    characters[index] = String(Number(characters[index]) + 1);
    return characters.join("");
  }
  return `1${characters.join("")}`;
}

/** Builds a 15-significant-digit numeric literal without relying on binary rounding first. */
function roundToSpreadsheetPrecision(source: string, percent: boolean): number | undefined {
  const unsigned = source.replace(/^[+-]/, "");
  const [mantissa = "", exponentSource = "0"] = unsigned.toLowerCase().split("e");
  const exponent = Number(exponentSource);
  const decimalIndex = mantissa.indexOf(".");
  const digits = mantissa.replace(".", "");
  const firstSignificant = digits.search(/[1-9]/);
  if (firstSignificant === -1) return 0;

  let roundedDigits = digits.slice(firstSignificant, firstSignificant + 15);
  const roundingDigit = digits[firstSignificant + 15];
  let scientificExponent =
    exponent + (decimalIndex === -1 ? digits.length : decimalIndex) - firstSignificant - 1;
  if (roundingDigit && roundingDigit >= "5") {
    roundedDigits = incrementDigits(roundedDigits);
    if (roundedDigits.length > 15) {
      roundedDigits = `1${"0".repeat(14)}`;
      scientificExponent += 1;
    }
  }

  const sign = source.startsWith("-") ? "-" : "";
  const numeric = Number(
    `${sign}${roundedDigits[0]}.${roundedDigits.slice(1)}e${scientificExponent - (percent ? 2 : 0)}`,
  );
  if (!Number.isFinite(numeric) || (numeric === 0 && hasNonZeroMantissa(source))) return undefined;
  return numeric;
}

/** Parses complete, finite numeric literals, including separators, percentages, and exponents. */
function parseTextNumber(value: string, options: CellValueConversionOptions): number | undefined {
  const trimmed = value.trim();
  const isPercent = trimmed.endsWith("%");
  const source = isPercent ? trimmed.slice(0, -1) : trimmed;
  const losesPrecision = exceedsSpreadsheetPrecision(source);
  if (
    source === "" ||
    !NUMBER_PATTERN.test(source) ||
    (losesPrecision && !options.allowPrecisionLoss)
  ) {
    return undefined;
  }
  if (losesPrecision) {
    return roundToSpreadsheetPrecision(source.replaceAll(",", ""), isPercent);
  }
  const numeric = Number(source.replaceAll(",", ""));
  if (!Number.isFinite(numeric)) return undefined;
  const result = isPercent ? numeric / 100 : numeric;
  // Number("1e-999") is finite but silently underflows to zero. Preserve a
  // nonzero source as text rather than changing its value during conversion.
  if (!Number.isFinite(result) || (result === 0 && hasNonZeroMantissa(source))) return undefined;
  return result;
}

function formatNumberForText(value: number): string {
  return Object.is(value, -0) ? "-0" : String(value);
}

function isInsideRange(address: { row: number; column: number }, range: CellRange): boolean {
  return (
    address.row >= range.start.row &&
    address.row <= range.end.row &&
    address.column >= range.start.column &&
    address.column <= range.end.column
  );
}

function withoutNumberFormat(style: CellStyle | undefined): CellStyle | null {
  const next = cloneCellStyle(style);
  if (!next) return null;
  delete next.numberFormat;
  return Object.keys(next).length > 0 ? next : null;
}

/**
 * Creates one ordinary content command so conversion participates in existing
 * protection checks, change notifications, and undo/redo semantics.
 */
export function createConvertCellValueTypeCommand(
  sheet: Sheet,
  range: CellRange,
  mode: CellValueConversionMode,
  options: CellValueConversionOptions = {},
): SetCellContentsCommand {
  if (mode !== "text-to-number" && mode !== "number-to-text") {
    throw new TypeError("Cell value conversion mode must be text-to-number or number-to-text.");
  }
  const normalized = normalizeRange(range);
  assertCellRange(normalized);
  const selection = expandSelectionToMergedCellRanges(normalized, sheet.mergedCells);
  const mergeResolver = new MergedCellRangeResolver(sheet.mergedCells);
  const changes: CellContentChange[] = [];

  for (const [key, cell] of sheet.cells) {
    if (!cell.content || cell.content.kind !== "literal") continue;
    const address = parseCellKey(key);
    if (!isInsideRange(address, selection)) continue;
    const anchor = mergeResolver.getAnchor(address);
    if (anchor && (anchor.row !== address.row || anchor.column !== address.column)) continue;

    if (mode === "text-to-number" && typeof cell.content.value === "string") {
      const value = parseTextNumber(cell.content.value, options);
      if (value === undefined) continue;
      const change: CellContentChange = {
        sheetId: sheet.id,
        address,
        content: { kind: "literal", value },
      };
      if (cell.style?.numberFormat) change.style = withoutNumberFormat(cell.style);
      changes.push(change);
      continue;
    }

    if (mode === "number-to-text" && typeof cell.content.value === "number") {
      const style = cloneCellStyle(cell.style) ?? {};
      if (style.numberFormat?.kind !== "text") style.numberFormat = { kind: "text" };
      changes.push({
        sheetId: sheet.id,
        address,
        content: { kind: "literal", value: formatNumberForText(cell.content.value) },
        style,
      });
    }
  }

  return { type: "setCellContents", changes };
}
