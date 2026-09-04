import { isFormulaError, type CellContent, type FormulaValue } from "./formula/types.js";
import type { CellValue } from "./workbook.js";

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

export function parseCellContent(input: string): CellContent | null {
  if (input === "") return null;
  if (input.startsWith("'")) return { kind: "literal", value: input.slice(1) };
  if (input.startsWith("=")) return { kind: "formula", formula: { source: input } };
  const value = parseCellInput(input);
  return value === null ? null : { kind: "literal", value };
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

/** Converts a computed result to display text, including stable formula error tokens. */
export function formatComputedValueForDisplay(value: FormulaValue): string {
  if (isFormulaError(value)) return `#${value.code === "DIV0" ? "DIV/0" : value.code}!`;
  return formatCellValueForDisplay(value);
}

export function formatCellValueForInput(value: CellValue): string {
  if (typeof value === "string" && !Object.is(parseCellInput(value), value)) {
    return `'${value}`;
  }

  return formatCellValueForDisplay(value);
}

export function formatCellContentForInput(content: CellContent | null | undefined): string {
  if (!content) return "";
  if (content.kind === "formula") return content.formula.source;
  if (
    typeof content.value === "string" &&
    (content.value.startsWith("=") || content.value.startsWith("'"))
  ) {
    return `'${content.value}`;
  }
  return formatCellValueForInput(content.value);
}
