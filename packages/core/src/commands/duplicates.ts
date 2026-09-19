import {
  createSheet,
  createSheetSparseState,
  replaceSheetSparseState,
  setCellContent,
  setCellStyle,
  setColumnWidth,
  MAX_SHEET_ROWS,
  type CellRange,
  type SheetDuplicateRule,
  type Workbook,
} from "../workbook.js";
import { getDuplicateValueSummaries } from "../duplicate-values.js";
import type {
  ClearSheetDuplicateRulesCommand,
  RestoreFullSheetStateCommand,
  SetSheetDuplicateRulesCommand,
} from "./contracts.js";
import {
  assertCellRange,
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
} from "./helpers.js";
import type { AddSheetCommand } from "./contracts.js";
import { serializeSheet } from "../serialization.js";
import type { IdFactory } from "../runtime.js";
import { isFormulaError, type FormulaValue } from "../formula/types.js";

export function createSetSheetDuplicateRulesCommand(
  sheetId: string,
  rules: readonly SheetDuplicateRule[],
): SetSheetDuplicateRulesCommand {
  return {
    type: "setSheetDuplicateRules",
    sheetId,
    rules: rules.map((rule) => ({ ...rule, range: normalizeRange(rule.range) })),
  };
}
export function createClearSheetDuplicateRulesCommand(
  sheetId: string,
  kind: "highlight" | "reject",
  range?: CellRange,
): ClearSheetDuplicateRulesCommand {
  return {
    type: "clearSheetDuplicateRules",
    sheetId,
    kind,
    ...(range ? { range: normalizeRange(range) } : {}),
  };
}
function intersects(a: CellRange, b: CellRange): boolean {
  return !(
    a.end.row < b.start.row ||
    a.start.row > b.end.row ||
    a.end.column < b.start.column ||
    a.start.column > b.end.column
  );
}
export function applySetSheetDuplicateRulesCommand(
  workbook: Workbook,
  command: SetSheetDuplicateRulesCommand,
): RestoreFullSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const state = createSheetSparseState(sheet);
  if (!replaceSheetSparseState(sheet, { ...state, duplicateRules: command.rules })) return null;
  return { type: "restoreSheetState", sheetId: sheet.id, state };
}
export function applyClearSheetDuplicateRulesCommand(
  workbook: Workbook,
  command: ClearSheetDuplicateRulesCommand,
): RestoreFullSheetStateCommand | null {
  if (command.kind !== "highlight" && command.kind !== "reject")
    throw invalidCommandPayload("kind", command.kind);
  const range = command.range ? normalizeRange(command.range) : undefined;
  if (range) assertCellRange(range);
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const state = createSheetSparseState(sheet);
  const duplicateRules = (state.duplicateRules ?? []).filter(
    (rule) => rule.kind !== command.kind || (range && !intersects(rule.range, range)),
  );
  if (!replaceSheetSparseState(sheet, { ...state, duplicateRules })) return null;
  return { type: "restoreSheetState", sheetId: sheet.id, state };
}
function getUniqueSheetName(workbook: Workbook, requestedName: string): string {
  const base = requestedName.trim();
  if (!base) throw invalidCommandPayload("sheetName", requestedName);
  const names = new Set([...workbook.sheets.values()].map((sheet) => sheet.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let index = 2;
  while (names.has(`${base} (${index})`.toLowerCase())) index += 1;
  return `${base} (${index})`;
}

function asOutputContent(value: FormulaValue) {
  if (isFormulaError(value)) return { kind: "error" as const, error: value };
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return { kind: "literal" as const, value };
  throw invalidCommandPayload(
    "sourceRange",
    value,
    "Duplicate count cannot output this cell value.",
  );
}

/** Creates a new sheet containing one row per distinct non-blank value in the selected rectangle. */
export function createCountDuplicateValuesCommand(
  workbook: Workbook,
  sheetId: string,
  sourceRange: CellRange,
  options: {
    idFactory: IdFactory;
    sheetName?: string;
    valueLabel?: string;
    countLabel?: string;
  },
): AddSheetCommand {
  const range = normalizeRange(sourceRange);
  assertCellRange(range);
  getSheetOrThrow(workbook, sheetId);
  if (typeof options?.idFactory !== "function")
    throw invalidCommandPayload("idFactory", options?.idFactory);
  const summaries = getDuplicateValueSummaries(workbook, sheetId, range);
  if (!summaries.length)
    throw invalidCommandPayload(
      "empty",
      sourceRange,
      "Duplicate count requires a non-empty range.",
    );
  if (summaries.length + 1 > MAX_SHEET_ROWS)
    throw invalidCommandPayload("sourceRange", sourceRange, "Duplicate count output is too large.");
  const id = options.idFactory("sheet");
  if (typeof id !== "string" || !id.trim() || workbook.sheets.has(id))
    throw invalidCommandPayload("idFactory", id);
  const sheet = createSheet(
    getUniqueSheetName(workbook, options.sheetName ?? "Duplicate Values"),
    id,
  );
  setCellContent(
    sheet,
    { row: 0, column: 0 },
    { kind: "literal", value: options.valueLabel ?? "Value" },
  );
  setCellContent(
    sheet,
    { row: 0, column: 1 },
    { kind: "literal", value: options.countLabel ?? "Count" },
  );
  setCellStyle(sheet, { row: 0, column: 0 }, { bold: true });
  setCellStyle(sheet, { row: 0, column: 1 }, { bold: true });
  setColumnWidth(sheet, 0, 240);
  setColumnWidth(sheet, 1, 96);
  summaries.forEach((summary, index) => {
    setCellContent(sheet, { row: index + 1, column: 0 }, asOutputContent(summary.value));
    setCellContent(sheet, { row: index + 1, column: 1 }, { kind: "literal", value: summary.count });
  });
  return {
    type: "addSheet",
    sheet: serializeSheet(sheet),
    index: workbook.sheets.size,
    activeSheetId: id,
  };
}
