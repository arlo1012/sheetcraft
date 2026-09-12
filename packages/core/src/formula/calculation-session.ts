import type { FormulaRuntimeValue } from "./types.js";
import {
  createWorkbookEvaluator,
  createCellKey,
  type CellAddress,
  type SheetEvaluator,
  type Workbook,
} from "../workbook.js";

type CachedFormula = { source: string; value: FormulaRuntimeValue };

/** Owns one workbook's calculation cycles; persisted cells contain only source content. */
export function createWorkbookCalculationSession(workbook: Workbook) {
  const cached = new Map<string, CachedFormula>();
  const evaluators = new Map<string, SheetEvaluator>();
  const key = (sheetId: string, address: CellAddress) => `${sheetId}|${createCellKey(address)}`;
  const sourceAt = (sheetId: string, address: CellAddress) => {
    const content = workbook.sheets.get(sheetId)?.cells.get(createCellKey(address))?.content;
    return content?.kind === "formula" ? content.formula.source : undefined;
  };

  function getEvaluator(sheetId: string): SheetEvaluator {
    const existing = evaluators.get(sheetId);
    if (existing) return existing;
    const shared = evaluators.values().next().value as SheetEvaluator | undefined;
    const evaluator =
      shared?.forSheet?.(sheetId) ??
      createWorkbookEvaluator(workbook, sheetId, {
        getCachedFormulaValue:
          workbook.calculation.mode === "manual"
            ? (targetSheetId, address, source) => {
                const previous = cached.get(key(targetSheetId, address));
                return previous?.source === source ? previous.value : undefined;
              }
            : undefined,
      });
    evaluators.set(sheetId, evaluator);
    return evaluator;
  }

  function capture(): void {
    const next = new Map<string, CachedFormula>();
    for (const sheet of workbook.sheets.values()) {
      const evaluator = getEvaluator(sheet.id);
      for (const [cellKey, cell] of sheet.cells) {
        if (cell.content?.kind !== "formula") continue;
        const separator = cellKey.indexOf(":");
        const address = {
          row: Number(cellKey.slice(0, separator)),
          column: Number(cellKey.slice(separator + 1)),
        };
        const value = evaluator.getRuntimeValue?.(address) ?? evaluator.getComputedValue(address);
        next.set(key(sheet.id, address), { source: cell.content.formula.source, value });
      }
    }
    cached.clear();
    for (const [cacheKey, value] of next) cached.set(cacheKey, value);
  }

  /** Call before mutating workbook content, including switching into manual calculation. */
  function prepareMutation(nextMode = workbook.calculation.mode): void {
    if (workbook.calculation.mode === "manual" || nextMode === "manual") capture();
  }

  function invalidate(): void {
    evaluators.clear();
    if (workbook.calculation.mode === "automatic") cached.clear();
    else {
      for (const [cacheKey, entry] of cached) {
        const divider = cacheKey.lastIndexOf("|");
        const sheetId = cacheKey.slice(0, divider);
        const parts = cacheKey.slice(divider + 1).split(":");
        const address = { row: Number(parts[0]), column: Number(parts[1]) };
        if (sourceAt(sheetId, address) !== entry.source) cached.delete(cacheKey);
      }
    }
  }

  function recalculate(): void {
    cached.clear();
    evaluators.clear();
    capture();
  }

  return { getEvaluator, prepareMutation, invalidate, recalculate };
}
