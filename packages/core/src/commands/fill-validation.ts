import {
  getCellDataValidations,
  validateCellContentDataValidation,
  validateCellDataValidation,
} from "../data-validation.js";
import {
  cloneCellContent,
  createCellKey,
  createWorkbookEvaluator,
  type CellValue,
  type Sheet,
  type Workbook,
} from "../workbook.js";
import { isFormulaError, type CellContent } from "../formula/types.js";
import type { SetCellContentsCommand } from "./contracts.js";
import { DataFillError } from "./fill-common.js";

function createValidationShadow(workbook: Workbook, command: SetCellContentsCommand): Workbook {
  const sheets = new Map(workbook.sheets);
  const copies = new Map<string, Sheet>();
  const sheetFor = (sheetId: string): Sheet => {
    const existing = copies.get(sheetId);
    if (existing) return existing;
    const source = workbook.sheets.get(sheetId);
    if (!source) throw new DataFillError("validation", "The fill target sheet no longer exists.");
    const copy: Sheet = { ...source, cells: new Map(source.cells) };
    copies.set(sheetId, copy);
    sheets.set(sheetId, copy);
    return copy;
  };

  for (const change of command.changes) {
    const sheet = sheetFor(change.sheetId);
    const key = createCellKey(change.address);
    const current = sheet.cells.get(key) ?? {};
    if (change.content === null) {
      const { content: _content, ...withoutContent } = current;
      sheet.cells.set(key, withoutContent);
    } else {
      sheet.cells.set(key, { ...current, content: cloneCellContent(change.content) });
    }
  }
  return { ...workbook, sheets };
}

function simpleValue(content: CellContent | null): CellValue | undefined {
  if (content === null) return null;
  return content.kind === "literal" ? content.value : undefined;
}

/**
 * Rejects a fill as one atomic operation when its final values violate a stopping
 * data-validation rule. The original workbook is never mutated during validation.
 */
export function assertFillDataValidation(
  workbook: Workbook,
  command: SetCellContentsCommand,
): void {
  const hasEnabledRule = command.changes.some((change) => {
    const sheet = workbook.sheets.get(change.sheetId);
    return Boolean(
      sheet &&
      getCellDataValidations(sheet, change.address).some((rule) => rule.showError !== false),
    );
  });
  if (!hasEnabledRule) return;
  const shadow = createValidationShadow(workbook, command);
  const evaluators = new Map<string, ReturnType<typeof createWorkbookEvaluator>>();
  for (const change of command.changes) {
    const sheet = shadow.sheets.get(change.sheetId);
    if (!sheet) throw new DataFillError("validation", "The fill target sheet no longer exists.");
    const content = change.content;
    for (const rule of getCellDataValidations(sheet, change.address)) {
      if (rule.showError === false) continue;
      const value = simpleValue(content);
      if (content?.kind === "error" || content?.kind === "image")
        throw new DataFillError("validation", "The fill result violates data validation.");
      if (content?.kind === "formula") {
        const evaluator =
          evaluators.get(change.sheetId) ?? createWorkbookEvaluator(shadow, change.sheetId);
        evaluators.set(change.sheetId, evaluator);
        if (isFormulaError(evaluator.getComputedValue(change.address)))
          throw new DataFillError("validation", "The fill result violates data validation.");
      }
      const result =
        rule.type === "custom" || value === undefined
          ? validateCellContentDataValidation(rule, content, {
              workbook: shadow,
              sheet,
              address: change.address,
            })
          : validateCellDataValidation(rule, value, {
              workbook: shadow,
              sheet,
              address: change.address,
            });
      if (!result.valid)
        throw new DataFillError("validation", "The fill result violates data validation.");
    }
  }
}
