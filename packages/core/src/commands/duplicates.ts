import {
  createSheetSparseState,
  createWorkbookEvaluator,
  getCellContent,
  replaceSheetSparseState,
  setCellContent,
  MAX_SHEET_ROWS,
  type CellRange,
  type SheetDuplicateRule,
  type Workbook,
} from "../workbook.js";
import {
  getDuplicateValueCounts,
  getDuplicateValueKey,
  validateDuplicateEntries,
} from "../duplicate-values.js";
import type {
  ClearSheetDuplicateRulesCommand,
  CountDuplicateValuesCommand,
  RestoreFullSheetStateCommand,
  SetSheetDuplicateRulesCommand,
} from "./contracts.js";
import {
  assertCellAddress,
  assertCellRange,
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
} from "./helpers.js";

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
export function createCountDuplicateValuesCommand(
  sheetId: string,
  sourceRange: CellRange,
  destination: CountDuplicateValuesCommand["destination"],
  options?: CountDuplicateValuesCommand["options"],
): CountDuplicateValuesCommand {
  return {
    type: "countDuplicateValues",
    sheetId,
    sourceRange: normalizeRange(sourceRange),
    destination: { sheetId: destination.sheetId, address: { ...destination.address } },
    ...(options ? { options: { ...options } } : {}),
  };
}
export function applyCountDuplicateValuesCommand(
  workbook: Workbook,
  command: CountDuplicateValuesCommand,
): RestoreFullSheetStateCommand | null {
  const sourceRange = normalizeRange(command.sourceRange);
  assertCellRange(sourceRange);
  assertCellAddress(command.destination.address);
  const source = getSheetOrThrow(workbook, command.sheetId);
  const target = getSheetOrThrow(workbook, command.destination.sheetId);
  if (sourceRange.start.column !== sourceRange.end.column)
    throw invalidCommandPayload(
      "sourceRange",
      sourceRange,
      "Duplicate count supports one source column.",
    );
  const hasHeader = command.options?.hasHeader ?? false;
  const start = sourceRange.start.row + (hasHeader ? 1 : 0);
  const rows = sourceRange.end.row - start + 1;
  if (rows <= 0)
    throw invalidCommandPayload(
      "sourceRange",
      sourceRange,
      "Duplicate count requires data below the header.",
    );
  const outputEnd = {
    row: command.destination.address.row + sourceRange.end.row - sourceRange.start.row,
    column: command.destination.address.column,
  };
  if (outputEnd.row >= MAX_SHEET_ROWS)
    throw invalidCommandPayload(
      "destination",
      command.destination,
      "Duplicate count destination is outside the sheet.",
    );
  const outputRange = { start: command.destination.address, end: outputEnd };
  if (source.id === target.id && intersects(sourceRange, outputRange))
    throw invalidCommandPayload(
      "destination",
      command.destination,
      "Duplicate count destination cannot overlap its source.",
    );
  if (target.mergedCells.some((merged) => intersects(merged, outputRange)))
    throw invalidCommandPayload(
      "destination",
      command.destination,
      "Duplicate count destination cannot intersect merged cells.",
    );
  const outputs = Array.from({ length: rows + (hasHeader ? 1 : 0) }, (_, offset) => ({
    row: command.destination.address.row + offset,
    column: command.destination.address.column,
  }));
  const targetEvaluator = createWorkbookEvaluator(workbook, target.id);
  for (const [key, cell] of target.cells) {
    if (cell.content?.kind !== "formula") continue;
    const separator = key.indexOf(":");
    targetEvaluator.getComputedValue({
      row: Number(key.slice(0, separator)),
      column: Number(key.slice(separator + 1)),
    });
  }
  for (const projection of targetEvaluator.getSpillProjections?.() ?? []) {
    if (intersects({ start: projection.address, end: projection.address }, outputRange))
      throw invalidCommandPayload(
        "destination",
        command.destination,
        "Duplicate count destination cannot overwrite a spill range.",
      );
  }
  if (!command.options?.overwrite && outputs.some((address) => getCellContent(target, address)))
    throw invalidCommandPayload("overwrite", false, "Duplicate count destination is not empty.");
  const evaluator =
    source.id === target.id ? targetEvaluator : createWorkbookEvaluator(workbook, source.id);
  const counts = getDuplicateValueCounts(
    workbook,
    source.id,
    { ...sourceRange, start: { ...sourceRange.start, row: start } },
    evaluator,
  );
  const writes = outputs.map((address, offset) => {
    if (hasHeader && offset === 0)
      return {
        address,
        content: { kind: "literal" as const, value: command.options?.headerLabel ?? "Count" },
      };
    const key = getDuplicateValueKey(
      evaluator.getComputedValue({
        row: start + offset - (hasHeader ? 1 : 0),
        column: sourceRange.start.column,
      }),
    );
    return {
      address,
      content: key ? { kind: "literal" as const, value: counts.get(key) ?? 0 } : null,
    };
  });
  const changed = writes.filter(({ address, content }) => {
    const existing = getCellContent(target, address);
    return content === null
      ? existing !== null
      : existing?.kind !== "literal" || existing.value !== content.value;
  });
  if (changed.length === 0) return null;
  const duplicate = validateDuplicateEntries(
    workbook,
    writes.map((write) => ({ sheetId: target.id, ...write })),
  );
  if (!duplicate.valid)
    throw invalidCommandPayload(
      "duplicate",
      duplicate,
      "Duplicate count output violates a duplicate-entry rule.",
    );
  const state = createSheetSparseState(target);
  for (const write of changed) setCellContent(target, write.address, write.content);
  return { type: "restoreSheetState", sheetId: target.id, state };
}
