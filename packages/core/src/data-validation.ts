import {
  createCellKey,
  createWorkbookEvaluator,
  getDefinedName,
  type CellAddress,
  type CellRange,
  type CellValue,
  type Sheet,
  type SheetDataValidation,
  type Workbook,
} from "./workbook.js";
import type { CellContent } from "./formula/types.js";
import { parseFormulaReference } from "./formula/reference-model.js";
import { translateFormulaForCopy } from "./formula/references.js";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./workbook.js";

export type DataValidationResult =
  | { valid: true }
  | { valid: false; reason: "blank" | "type" | "operator" | "list" | "custom" };
export type DataValidationEvaluationContext = {
  workbook?: Workbook;
  sheet?: Sheet;
  address: CellAddress;
  /** Values are supplied by the caller when formulas need calculation. */
  resolveReference?: (reference: string, origin: CellAddress) => CellValue | null;
  evaluateCustom?: (formula: string, origin: CellAddress, value: CellValue) => boolean | undefined;
};

function inRange(address: CellAddress, range: CellRange): boolean {
  const top = Math.min(range.start.row, range.end.row),
    bottom = Math.max(range.start.row, range.end.row);
  const left = Math.min(range.start.column, range.end.column),
    right = Math.max(range.start.column, range.end.column);
  return (
    address.row >= top && address.row <= bottom && address.column >= left && address.column <= right
  );
}
export function getCellDataValidation(
  sheet: Sheet,
  address: CellAddress,
): SheetDataValidation | undefined {
  return sheet.dataValidations?.find((rule) => inRange(address, rule.range));
}
export function getCellDataValidations(sheet: Sheet, address: CellAddress): SheetDataValidation[] {
  return (sheet.dataValidations ?? []).filter((rule) => inRange(address, rule.range));
}
export function resolveDataValidationListValues(
  rule: SheetDataValidation,
  context: DataValidationEvaluationContext,
): string[] {
  if (rule.list) return [...rule.list];
  if (!rule.formula1) return [];
  if (context.workbook && context.sheet) {
    const reference = parseFormulaReference(rule.formula1.replace(/^=/, ""), {
      currentSheetId: context.sheet.id,
      resolveSheetId: (name) =>
        [...context.workbook!.sheets.values()].find(
          (sheet) => sheet.name.toLowerCase() === name.toLowerCase(),
        )?.id ?? null,
    });
    const named = getDefinedName(
      context.workbook,
      rule.formula1.replace(/^=/, ""),
      context.sheet.id,
    )?.reference;
    const target =
      reference?.target ??
      (named
        ? {
            sheetId: named.sheetId,
            range: { start: named.start, end: named.end },
          }
        : undefined);
    if (target) {
      const targetSheet = context.workbook.sheets.get(target.sheetId);
      if (!targetSheet) return [];
      const evaluator = createWorkbookEvaluator(context.workbook, targetSheet.id);
      const values: string[] = [];
      for (let row = target.range.start.row; row <= target.range.end.row; row++)
        for (let column = target.range.start.column; column <= target.range.end.column; column++) {
          const value = evaluator.getComputedValue({ row, column });
          if (value !== null && typeof value !== "object") values.push(String(value));
        }
      return values;
    }
  }
  const value = context.resolveReference?.(rule.formula1, context.address);
  return value == null
    ? []
    : String(value)
        .split(",")
        .map((entry) => entry.trim());
}
function compare(
  operator: NonNullable<SheetDataValidation["operator"]>,
  value: number,
  first: number,
  second?: number,
): boolean {
  switch (operator) {
    case "between":
      return (
        second !== undefined && value >= Math.min(first, second) && value <= Math.max(first, second)
      );
    case "notBetween":
      return (
        second !== undefined && (value < Math.min(first, second) || value > Math.max(first, second))
      );
    case "equal":
      return value === first;
    case "notEqual":
      return value !== first;
    case "greaterThan":
      return value > first;
    case "greaterThanOrEqual":
      return value >= first;
    case "lessThan":
      return value < first;
    case "lessThanOrEqual":
      return value <= first;
  }
}

function evaluateDataValidationBound(
  formula: string,
  rule: SheetDataValidation,
  context: DataValidationEvaluationContext,
  workbook = context.workbook,
): number | undefined {
  formula = formula.trim();
  if (!formula) return undefined;
  const literal = Number(formula);
  if (Number.isFinite(literal)) return literal;
  if (!workbook || !context.sheet) {
    const resolved = context.resolveReference?.(formula, context.address);
    return typeof resolved === "number" && Number.isFinite(resolved) ? resolved : undefined;
  }
  const source = formula.startsWith("=") ? formula : `=${formula}`;
  const probe = { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 };
  const sheet = workbook.sheets.get(context.sheet.id) ?? context.sheet;
  const shadowSheet: Sheet = { ...sheet, cells: new Map(sheet.cells) };
  shadowSheet.cells.set(createCellKey(probe), {
    content: {
      kind: "formula",
      formula: {
        source: translateFormulaForCopy(source, {
          row: context.address.row - rule.range.start.row,
          column: context.address.column - rule.range.start.column,
        }),
      },
    },
  });
  const shadowWorkbook: Workbook = {
    ...workbook,
    sheets: new Map(workbook.sheets),
  };
  shadowWorkbook.sheets.set(shadowSheet.id, shadowSheet);
  const result = createWorkbookEvaluator(shadowWorkbook, shadowSheet.id).getComputedValue(probe);
  return typeof result === "number" && Number.isFinite(result) ? result : undefined;
}

export function validateCellDataValidation(
  rule: SheetDataValidation,
  value: CellValue,
  context: DataValidationEvaluationContext,
): DataValidationResult {
  if ((value === null || value === "") && rule.allowBlank) return { valid: true };
  if (value === null || value === "") return { valid: false, reason: "blank" };
  if (rule.type === "list")
    return resolveDataValidationListValues(rule, context).includes(String(value))
      ? { valid: true }
      : { valid: false, reason: "list" };
  if (rule.type === "custom")
    return context.evaluateCustom?.(rule.formula1 ?? "", context.address, value)
      ? { valid: true }
      : { valid: false, reason: "custom" };
  const numeric =
    rule.type === "textLength"
      ? String(value).length
      : typeof value === "number"
        ? value
        : Number(value);
  if (!Number.isFinite(numeric) || (rule.type === "whole" && !Number.isInteger(numeric)))
    return { valid: false, reason: "type" };
  if (!rule.operator) return { valid: true };
  const first = rule.formula1
    ? evaluateDataValidationBound(rule.formula1, rule, context)
    : undefined;
  const second = rule.formula2
    ? evaluateDataValidationBound(rule.formula2, rule, context)
    : undefined;
  if (first === undefined || (rule.formula2 !== undefined && second === undefined))
    return { valid: false, reason: "type" };
  return compare(rule.operator, numeric, first, second)
    ? { valid: true }
    : { valid: false, reason: "operator" };
}
/** Validates a pending literal edit without mutating the workbook. Formula results must be supplied by the caller. */
export function validateCellContentDataValidation(
  rule: SheetDataValidation,
  content: CellContent | null,
  context: DataValidationEvaluationContext,
): DataValidationResult {
  if ((content === null || (content.kind === "literal" && content.value === "")) && rule.allowBlank)
    return { valid: true };
  if (!context.workbook || !context.sheet)
    return content?.kind === "literal"
      ? validateCellDataValidation(rule, content.value, context)
      : { valid: false, reason: "type" };
  const target = context.address;
  const shadowSheet: Sheet = {
    ...context.sheet,
    cells: new Map(context.sheet.cells),
  };
  const candidate = content === null ? undefined : content;
  const current = shadowSheet.cells.get(createCellKey(target)) ?? {};
  if (candidate)
    shadowSheet.cells.set(createCellKey(target), {
      ...current,
      content: candidate,
    });
  else {
    const { content: _content, ...withoutContent } = current;
    shadowSheet.cells.set(createCellKey(target), withoutContent);
  }
  const shadowWorkbook: Workbook = {
    ...context.workbook,
    sheets: new Map(context.workbook.sheets),
  };
  shadowWorkbook.sheets.set(shadowSheet.id, shadowSheet);
  const evaluator = createWorkbookEvaluator(shadowWorkbook, shadowSheet.id);
  const value =
    candidate?.kind === "formula"
      ? evaluator.getComputedValue(target)
      : candidate?.kind === "literal"
        ? candidate.value
        : null;
  if (value === null || value === "")
    return rule.allowBlank ? { valid: true } : { valid: false, reason: "blank" };
  if (rule.type === "custom" && rule.formula1) {
    const probe = { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 };
    const source = rule.formula1.startsWith("=") ? rule.formula1 : `=${rule.formula1}`;
    shadowSheet.cells.set(createCellKey(probe), {
      content: {
        kind: "formula",
        formula: {
          source: translateFormulaForCopy(source, {
            row: target.row - rule.range.start.row,
            column: target.column - rule.range.start.column,
          }),
        },
      },
    });
    const result = createWorkbookEvaluator(shadowWorkbook, shadowSheet.id).getComputedValue(probe);
    return result === true ? { valid: true } : { valid: false, reason: "custom" };
  }
  if (rule.operator && rule.formula1) {
    const first = evaluateDataValidationBound(rule.formula1, rule, context, shadowWorkbook);
    const second =
      rule.formula2 === undefined
        ? undefined
        : evaluateDataValidationBound(rule.formula2, rule, context, shadowWorkbook);
    const numeric =
      rule.type === "textLength"
        ? String(value).length
        : typeof value === "number"
          ? value
          : Number(value);
    if (
      !Number.isFinite(numeric) ||
      (rule.type === "whole" && !Number.isInteger(numeric)) ||
      first === undefined ||
      (rule.formula2 !== undefined && second === undefined)
    )
      return { valid: false, reason: "type" };
    return compare(rule.operator, numeric, first, second)
      ? { valid: true }
      : { valid: false, reason: "operator" };
  }
  return validateCellDataValidation(rule, typeof value === "object" ? null : value, context);
}
