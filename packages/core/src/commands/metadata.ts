import {
  doMergedCellRangesIntersect,
  normalizeMergedCellRange,
  validateMergedCellRanges,
} from "../merged-cells.js";
import {
  createSheetSparseState,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  replaceSheetSparseState,
  type CellAddress,
  type CellRange,
  type FreezePanes,
  type Workbook,
} from "../workbook.js";
import type {
  MergeCellsCommand,
  RestoreFullSheetStateCommand,
  SetSheetFreezePanesCommand,
  UnmergeCellsCommand,
} from "./contracts.js";
import {
  assertCellRange,
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
  validateCommandPayload,
} from "./helpers.js";

function cloneAddress(address: CellAddress): CellAddress {
  return { row: address.row, column: address.column };
}

function cloneRange(range: CellRange): CellRange {
  return { start: cloneAddress(range.start), end: cloneAddress(range.end) };
}

function cloneFreezePanes(freezePanes: FreezePanes): FreezePanes {
  return { rows: freezePanes.rows, columns: freezePanes.columns };
}

function validateFreezePanes(value: unknown): FreezePanes {
  if (!value || typeof value !== "object") throw new TypeError("Expected frozen pane boundaries.");
  const freezePanes = value as FreezePanes;
  if (
    !Number.isInteger(freezePanes.rows) ||
    freezePanes.rows < 0 ||
    freezePanes.rows > MAX_SHEET_ROWS ||
    !Number.isInteger(freezePanes.columns) ||
    freezePanes.columns < 0 ||
    freezePanes.columns > MAX_SHEET_COLUMNS
  ) {
    throw new RangeError("Frozen pane boundaries are outside the sheet.");
  }
  return cloneFreezePanes(freezePanes);
}

function createRestore(
  sheetId: string,
  state: ReturnType<typeof createSheetSparseState>,
): RestoreFullSheetStateCommand {
  return { type: "restoreSheetState", sheetId, state };
}

export function createSetSheetFreezePanesCommand(
  sheetId: string,
  freezePanes: FreezePanes,
): SetSheetFreezePanesCommand {
  return { type: "setSheetFreezePanes", sheetId, freezePanes: cloneFreezePanes(freezePanes) };
}

export function createMergeCellsCommand(sheetId: string, range: CellRange): MergeCellsCommand {
  const normalized = normalizeRange(range);
  assertCellRange(normalized);
  return { type: "mergeCells", sheetId, range: cloneRange(normalized) };
}

export function createUnmergeCellsCommand(sheetId: string, range: CellRange): UnmergeCellsCommand {
  const normalized = normalizeRange(range);
  assertCellRange(normalized);
  return { type: "unmergeCells", sheetId, range: cloneRange(normalized) };
}

export function applySetSheetFreezePanesCommand(
  workbook: Workbook,
  command: SetSheetFreezePanesCommand,
): RestoreFullSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const freezePanes = validateCommandPayload("freezePanes", command.freezePanes, () =>
    validateFreezePanes(command.freezePanes),
  );
  const previous = createSheetSparseState(sheet);
  const state = {
    ...previous,
    freezePanes,
  };
  return validateCommandPayload("freezePanes", command.freezePanes, () =>
    replaceSheetSparseState(sheet, state),
  )
    ? createRestore(command.sheetId, previous)
    : null;
}

export function applyMergeCellsCommand(
  workbook: Workbook,
  command: MergeCellsCommand,
): RestoreFullSheetStateCommand | null {
  const normalized = validateCommandPayload("range", command.range, () => {
    const range = normalizeRange(command.range);
    assertCellRange(range);
    const mergeRange = normalizeMergedCellRange(range);
    validateMergedCellRanges([mergeRange]);
    return mergeRange;
  });
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const previous = createSheetSparseState(sheet);
  if (sheet.mergedCells.some((merged) => doMergedCellRangesIntersect(merged, normalized))) {
    throw invalidCommandPayload("range", command.range, "Merged cell ranges must not overlap.");
  }
  const state = createSheetSparseState(sheet);
  state.cells = state.cells.filter((cell) =>
    cell.address.row === normalized.start.row && cell.address.column === normalized.start.column
      ? true
      : cell.address.row < normalized.start.row ||
        cell.address.row > normalized.end.row ||
        cell.address.column < normalized.start.column ||
        cell.address.column > normalized.end.column,
  );
  state.mergedCells = validateMergedCellRanges([...state.mergedCells, normalized]);
  return validateCommandPayload("range", command.range, () => replaceSheetSparseState(sheet, state))
    ? createRestore(command.sheetId, previous)
    : null;
}

export function applyUnmergeCellsCommand(
  workbook: Workbook,
  command: UnmergeCellsCommand,
): RestoreFullSheetStateCommand | null {
  const range = normalizeRange(command.range);
  assertCellRange(range);
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const previous = createSheetSparseState(sheet);
  const mergedCells = sheet.mergedCells.filter(
    (merged) => !doMergedCellRangesIntersect(merged, range),
  );
  if (mergedCells.length === sheet.mergedCells.length) return null;
  return validateCommandPayload("range", command.range, () =>
    replaceSheetSparseState(sheet, { ...previous, mergedCells }),
  )
    ? createRestore(command.sheetId, previous)
    : null;
}
