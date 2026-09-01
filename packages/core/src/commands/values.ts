import { getCellMatrixSize } from "../clipboard.js";
import {
  cloneCellStyle,
  mergeCellStyle,
  normalizeCellStyle,
  type CellStyle,
  type CellStylePatch,
} from "../style.js";
import {
  getCellStyle,
  getCellValue,
  setCellStyle,
  setCellValue,
  type CellAddress,
  type CellRange,
  type CellValue,
  type Workbook,
} from "../workbook.js";
import {
  getExactCellBorderPatch,
  getCellBorderTargetKey,
  reconcileCellBorderTargets,
  type CellBorderPatch,
} from "./borders.js";
import type { CellValueChange, ClearCellRangeCommand, SetCellValuesCommand } from "./contracts.js";
import {
  assertCellAddress,
  assertCellRange,
  getSheetOrThrow,
  normalizeRange,
  parseCellKey,
} from "./helpers.js";

export function createSetCellValueCommand(
  sheetId: string,
  address: CellAddress,
  value: CellValue,
): SetCellValuesCommand {
  return {
    type: "setCellValues",
    changes: [{ sheetId, address: { ...address }, value }],
  };
}

export function createBatchSetCellValuesCommand(
  changes: readonly CellValueChange[],
  options?: { reconcileBorders?: boolean },
): SetCellValuesCommand {
  return {
    type: "setCellValues",
    changes: changes.map((change) => ({
      sheetId: change.sheetId,
      address: { ...change.address },
      value: change.value,
      ...("style" in change ? { style: cloneCellStyle(change.style ?? undefined) ?? null } : {}),
    })),
    ...(options?.reconcileBorders ? { reconcileBorders: true } : {}),
  };
}

export function createClearCellRangeCommand(
  sheetId: string,
  range: CellRange,
): ClearCellRangeCommand {
  const normalizedRange = normalizeRange(range);
  assertCellRange(normalizedRange);
  return { type: "clearCellRange", sheetId, range: normalizedRange };
}

export function createPasteCellValuesCommand(
  sheetId: string,
  anchor: CellAddress,
  values: readonly (readonly CellValue[])[],
  options?: {
    clearRange?: CellRange;
    styles?: readonly (readonly (CellStyle | null)[])[];
  },
): SetCellValuesCommand {
  const size = getCellMatrixSize(values);
  const end = {
    row: anchor.row + size.rowCount - 1,
    column: anchor.column + size.columnCount - 1,
  };
  assertCellAddress(anchor);
  assertCellAddress(end);
  if (
    options?.styles &&
    (options.styles.length !== size.rowCount ||
      options.styles.some((row) => row.length !== size.columnCount))
  ) {
    throw new RangeError("Pasted cell styles must match the pasted value matrix.");
  }

  const changes = new Map<string, CellValueChange>();
  const setChange = (address: CellAddress, value: CellValue, style?: CellStyle | null) => {
    changes.set(`${address.row}:${address.column}`, {
      sheetId,
      address: { ...address },
      value,
      ...(style === undefined ? {} : { style: style ? cloneCellStyle(style) : null }),
    });
  };

  if (options?.clearRange) {
    const clearRange = normalizeRange(options.clearRange);
    assertCellRange(clearRange);
    for (let row = clearRange.start.row; row <= clearRange.end.row; row += 1) {
      for (let column = clearRange.start.column; column <= clearRange.end.column; column += 1) {
        setChange({ row, column }, null, null);
      }
    }
  }
  for (let row = 0; row < size.rowCount; row += 1) {
    for (let column = 0; column < size.columnCount; column += 1) {
      const address = { row: anchor.row + row, column: anchor.column + column };
      const value = values[row]?.[column] ?? null;
      setChange(
        address,
        value,
        options?.styles ? (options.styles[row]?.[column] ?? null) : undefined,
      );
    }
  }
  return createBatchSetCellValuesCommand([...changes.values()], {
    reconcileBorders: Boolean(options?.styles),
  });
}

export function applySetCellValuesCommand(
  workbook: Workbook,
  command: SetCellValuesCommand,
): SetCellValuesCommand | null {
  const reverseChanges: CellValueChange[] = [];
  const reverseChangesByAddress = new Map<string, CellValueChange>();
  const initialStates = new Map<
    string,
    { sheetId: string; address: CellAddress; value: CellValue; style: CellStyle | undefined }
  >();
  const getChangeKey = (sheetId: string, address: CellAddress) =>
    `${sheetId}:${address.row}:${address.column}`;

  for (const change of command.changes) {
    assertCellAddress(change.address);
    const sheet = getSheetOrThrow(workbook, change.sheetId);
    const key = getChangeKey(change.sheetId, change.address);
    if (initialStates.has(key)) continue;
    initialStates.set(key, {
      sheetId: change.sheetId,
      address: { ...change.address },
      value: getCellValue(sheet, change.address),
      style: cloneCellStyle(getCellStyle(sheet, change.address) as CellStyle | undefined),
    });
  }

  const recordReverseChange = (
    sheetId: string,
    address: CellAddress,
    includeStyle: boolean,
    fallback?: { value: CellValue; style: CellStyle | undefined },
  ) => {
    const key = getChangeKey(sheetId, address);
    const previous =
      initialStates.get(key) ??
      (fallback ? { sheetId, address: { ...address }, ...fallback } : undefined);
    if (!previous)
      throw new Error(`Missing previous state for cell ${address.row}:${address.column}.`);
    const existing = reverseChangesByAddress.get(key);
    if (existing) {
      if (includeStyle && !("style" in existing))
        Object.assign(existing, { style: previous.style ?? null });
      return;
    }
    const reverseChange: CellValueChange = {
      sheetId,
      address: { ...address },
      value: previous.value,
      ...(includeStyle ? { style: previous.style ?? null } : {}),
    };
    reverseChanges.unshift(reverseChange);
    reverseChangesByAddress.set(key, reverseChange);
  };

  for (const change of command.changes) {
    const sheet = getSheetOrThrow(workbook, change.sheetId);
    const valueChanged = setCellValue(sheet, change.address, change.value);
    const styleChanged =
      "style" in change ? setCellStyle(sheet, change.address, change.style) : false;
    if (valueChanged || styleChanged) {
      recordReverseChange(change.sheetId, change.address, "style" in change);
    }
  }

  if (command.reconcileBorders) {
    const targetsBySheet = new Map<
      string,
      Map<string, { address: CellAddress; patch: CellBorderPatch }>
    >();
    for (const change of command.changes) {
      if (!("style" in change)) continue;
      const targets = targetsBySheet.get(change.sheetId) ?? new Map();
      targets.set(getCellBorderTargetKey(change.address), {
        address: { ...change.address },
        patch: getExactCellBorderPatch(normalizeCellStyle(change.style)),
      });
      targetsBySheet.set(change.sheetId, targets);
    }
    for (const [sheetId, targets] of targetsBySheet) {
      const cleanupPatches = new Map<string, { address: CellAddress; patch: CellStylePatch }>();
      reconcileCellBorderTargets(targets, (address, patch) => {
        const key = getCellBorderTargetKey(address);
        const existing = cleanupPatches.get(key);
        if (existing) Object.assign(existing.patch, patch);
        else cleanupPatches.set(key, { address: { ...address }, patch: { ...patch } });
      });
      const sheet = getSheetOrThrow(workbook, sheetId);
      for (const { address, patch } of cleanupPatches.values()) {
        const previousValue = getCellValue(sheet, address);
        const previousStyle = cloneCellStyle(getCellStyle(sheet, address) as CellStyle | undefined);
        if (setCellStyle(sheet, address, mergeCellStyle(previousStyle, patch))) {
          recordReverseChange(sheetId, address, true, {
            value: previousValue,
            style: previousStyle,
          });
        }
      }
    }
  }
  return reverseChanges.length > 0 ? createBatchSetCellValuesCommand(reverseChanges) : null;
}

export function applyClearCellRangeCommand(
  workbook: Workbook,
  command: ClearCellRangeCommand,
): SetCellValuesCommand | null {
  const range = normalizeRange(command.range);
  assertCellRange(range);
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const reverseChanges: CellValueChange[] = [];
  for (const [key, cell] of sheet.cells) {
    const address = parseCellKey(key);
    if (
      address.row < range.start.row ||
      address.row > range.end.row ||
      address.column < range.start.column ||
      address.column > range.end.column ||
      cell.value === undefined
    ) {
      continue;
    }
    reverseChanges.push({ sheetId: command.sheetId, address, value: cell.value });
    setCellValue(sheet, address, null);
  }
  return reverseChanges.length > 0 ? createBatchSetCellValuesCommand(reverseChanges) : null;
}
