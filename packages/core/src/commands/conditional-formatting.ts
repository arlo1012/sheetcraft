import {
  normalizeConditionalFormatRules,
  type SheetConditionalFormatRule,
} from "../conditional-formatting.js";
import { clearConditionalFormatRanges } from "../conditional-formatting-transfer.js";
import {
  createSheetSparseState,
  replaceSheetSparseState,
  type CellRange,
  type Workbook,
} from "../workbook.js";
import type {
  ClearSheetConditionalFormatsCommand,
  RestoreFullSheetStateCommand,
  SetSheetConditionalFormatsCommand,
} from "./contracts.js";
import { assertCellRange, getSheetOrThrow, normalizeRange } from "./helpers.js";

export function createSetSheetConditionalFormatsCommand(
  sheetId: string,
  rules: readonly SheetConditionalFormatRule[],
): SetSheetConditionalFormatsCommand {
  return {
    type: "setSheetConditionalFormats",
    sheetId,
    rules: normalizeConditionalFormatRules(rules),
  };
}

export function createClearSheetConditionalFormatsCommand(
  sheetId: string,
  range?: CellRange,
): ClearSheetConditionalFormatsCommand {
  return {
    type: "clearSheetConditionalFormats",
    sheetId,
    ...(range ? { range: normalizeRange(range) } : {}),
  };
}

export function applySetSheetConditionalFormatsCommand(
  workbook: Workbook,
  command: SetSheetConditionalFormatsCommand,
): RestoreFullSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const state = createSheetSparseState(sheet);
  const rules = normalizeConditionalFormatRules(command.rules);
  if (!replaceSheetSparseState(sheet, { ...state, conditionalFormats: rules })) return null;
  return { type: "restoreSheetState", sheetId: sheet.id, state };
}

export function applyClearSheetConditionalFormatsCommand(
  workbook: Workbook,
  command: ClearSheetConditionalFormatsCommand,
): RestoreFullSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const state = createSheetSparseState(sheet);
  const rules = state.conditionalFormats ?? [];
  if (!rules.length) return null;
  if (!command.range) {
    replaceSheetSparseState(sheet, { ...state, conditionalFormats: [] });
    return { type: "restoreSheetState", sheetId: sheet.id, state };
  }

  const cut = normalizeRange(command.range);
  assertCellRange(cut);
  const next = clearConditionalFormatRanges(rules, [cut]);
  if (JSON.stringify(next) === JSON.stringify(rules)) return null;
  replaceSheetSparseState(sheet, { ...state, conditionalFormats: next });
  return { type: "restoreSheetState", sheetId: sheet.id, state };
}
