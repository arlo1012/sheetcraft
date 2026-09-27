import {
  createSheetSparseState,
  replaceSheetSparseState,
  type CellRange,
  type SheetDataValidation,
  type Workbook,
} from "../workbook.js";
import type {
  ClearSheetDataValidationsCommand,
  RestoreFullSheetStateCommand,
  SetSheetDataValidationsCommand,
} from "./contracts.js";
import { getSheetOrThrow, normalizeRange, validateCommandPayload } from "./helpers.js";
import { translateFormulaForCopy } from "../formula/references.js";
function restore(sheetId: string, workbook: Workbook): RestoreFullSheetStateCommand {
  return {
    type: "restoreSheetState",
    sheetId,
    state: createSheetSparseState(getSheetOrThrow(workbook, sheetId)),
  };
}
export function createSetSheetDataValidationsCommand(
  sheetId: string,
  rules: SheetDataValidation[],
): SetSheetDataValidationsCommand {
  return {
    type: "setSheetDataValidations",
    sheetId,
    rules: rules.map((rule) => ({
      ...rule,
      range: normalizeRange(rule.range),
      ...(rule.list ? { list: [...rule.list] } : {}),
    })),
  };
}
export function createClearSheetDataValidationsCommand(
  sheetId: string,
  range?: CellRange,
): ClearSheetDataValidationsCommand {
  return {
    type: "clearSheetDataValidations",
    sheetId,
    ...(range ? { range: normalizeRange(range) } : {}),
  };
}
export function applySetSheetDataValidationsCommand(
  workbook: Workbook,
  command: SetSheetDataValidationsCommand,
): RestoreFullSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const inverse = restore(command.sheetId, workbook);
  validateCommandPayload("rules", command.rules, () =>
    replaceSheetSparseState(sheet, {
      ...createSheetSparseState(sheet),
      dataValidations: command.rules,
    }),
  );
  return JSON.stringify(inverse.state) === JSON.stringify(createSheetSparseState(sheet))
    ? null
    : inverse;
}
function intersects(a: CellRange, b: CellRange): boolean {
  const x = normalizeRange(a),
    y = normalizeRange(b);
  return (
    x.start.row <= y.end.row &&
    x.end.row >= y.start.row &&
    x.start.column <= y.end.column &&
    x.end.column >= y.start.column
  );
}
/** Splits a validation around a cleared range, rebasing relative formulas for each fragment. */
export function subtractSheetDataValidation(
  rule: SheetDataValidation,
  cut: CellRange,
  ids: Set<string>,
): SheetDataValidation[] {
  const a = normalizeRange(rule.range),
    b = normalizeRange(cut);
  if (!intersects(a, b)) return [rule];
  const top = Math.max(a.start.row, b.start.row),
    bottom = Math.min(a.end.row, b.end.row),
    left = Math.max(a.start.column, b.start.column),
    right = Math.min(a.end.column, b.end.column);
  const ranges: CellRange[] = [];
  if (a.start.row < top)
    ranges.push({ start: { ...a.start }, end: { row: top - 1, column: a.end.column } });
  if (bottom < a.end.row)
    ranges.push({ start: { row: bottom + 1, column: a.start.column }, end: { ...a.end } });
  if (a.start.column < left)
    ranges.push({
      start: { row: top, column: a.start.column },
      end: { row: bottom, column: left - 1 },
    });
  if (right < a.end.column)
    ranges.push({
      start: { row: top, column: right + 1 },
      end: { row: bottom, column: a.end.column },
    });
  return ranges.map((range, index) => {
    let id = `${rule.id}:clear:${index}`,
      suffix = index;
    while (ids.has(id)) id = `${rule.id}:clear:${++suffix}`;
    ids.add(id);
    const delta = {
      row: range.start.row - a.start.row,
      column: range.start.column - a.start.column,
    };
    const translate = (formula: string | undefined) =>
      formula === undefined ? undefined : translateFormulaForCopy(formula, delta);
    return {
      ...rule,
      id,
      range,
      ...(rule.formula1 === undefined ? {} : { formula1: translate(rule.formula1)! }),
      ...(rule.formula2 === undefined ? {} : { formula2: translate(rule.formula2)! }),
    };
  });
}
export function applyClearSheetDataValidationsCommand(
  workbook: Workbook,
  command: ClearSheetDataValidationsCommand,
): RestoreFullSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const current = createSheetSparseState(sheet);
  const rules = current.dataValidations ?? [];
  if (!command.range && rules.length === 0) return null;
  const ids = new Set(rules.map((rule) => rule.id));
  const next = command.range
    ? rules.flatMap((rule) => {
        ids.delete(rule.id);
        return subtractSheetDataValidation(rule, command.range!, ids);
      })
    : [];
  if (JSON.stringify(next) === JSON.stringify(rules)) return null;
  replaceSheetSparseState(sheet, { ...current, dataValidations: next });
  return { type: "restoreSheetState", sheetId: command.sheetId, state: current };
}
