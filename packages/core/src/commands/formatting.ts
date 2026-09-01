import {
  MAX_CELL_STYLE_PATCH_CELLS,
  cloneCellStyle,
  mergeCellStyle,
  normalizeCellBorderAction,
  normalizeCellStyle,
  normalizeCellStylePatch,
  type CellBorderAction,
  type CellStyle,
  type CellStylePatch,
} from "../style.js";
import {
  getCellStyle,
  setCellStyle,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "../workbook.js";
import {
  getExplicitCellBorderPatch,
  getCellBorderTargetKey,
  reconcileCellBorderTargets,
  type CellBorderPatch,
  type CellBorderSide,
} from "./borders.js";
import type {
  ApplyCellBordersCommand,
  ApplyCellStyleCommand,
  RestoreCellStylesCommand,
} from "./contracts.js";
import { assertCellAddress, assertCellRange, getSheetOrThrow, normalizeRange } from "./helpers.js";

function assertSupportedRange(range: CellRange): void {
  const rowCount = range.end.row - range.start.row + 1;
  const columnCount = range.end.column - range.start.column + 1;
  if (rowCount * columnCount > MAX_CELL_STYLE_PATCH_CELLS) {
    throw new RangeError(
      `Cell style changes are limited to ${MAX_CELL_STYLE_PATCH_CELLS} cells per command.`,
    );
  }
}

export function createApplyCellStyleCommand(
  sheetId: string,
  range: CellRange,
  patch: CellStylePatch,
): ApplyCellStyleCommand {
  const normalizedRange = normalizeRange(range);
  assertCellRange(normalizedRange);
  assertSupportedRange(normalizedRange);
  return {
    type: "applyCellStyle",
    sheetId,
    range: normalizedRange,
    patch: normalizeCellStylePatch(patch),
  };
}

export function createApplyCellBordersCommand(
  sheetId: string,
  range: CellRange,
  action: CellBorderAction,
): ApplyCellBordersCommand {
  const normalizedRange = normalizeRange(range);
  assertCellRange(normalizedRange);
  assertSupportedRange(normalizedRange);
  return {
    type: "applyCellBorders",
    sheetId,
    range: normalizedRange,
    action: normalizeCellBorderAction(action),
  };
}

export function createRestoreCellStylesCommand(
  sheetId: string,
  changes: readonly { address: CellAddress; style: CellStyle | null }[],
): RestoreCellStylesCommand {
  return {
    type: "restoreCellStyles",
    sheetId,
    changes: changes.map((change) => ({
      address: { ...change.address },
      style: cloneCellStyle(change.style ?? undefined) ?? null,
    })),
  };
}

function applyStylePatches(
  workbook: Workbook,
  sheetId: string,
  patches: ReadonlyMap<string, { address: CellAddress; patch: CellStylePatch }>,
): RestoreCellStylesCommand | null {
  const sheet = getSheetOrThrow(workbook, sheetId);
  const reverseChanges: RestoreCellStylesCommand["changes"] = [];
  for (const { address, patch } of patches.values()) {
    const previousStyle = cloneCellStyle(getCellStyle(sheet, address) as CellStyle | undefined);
    if (!setCellStyle(sheet, address, mergeCellStyle(previousStyle, patch))) continue;
    reverseChanges.push({ address: { ...address }, style: previousStyle ?? null });
  }
  return reverseChanges.length > 0 ? createRestoreCellStylesCommand(sheetId, reverseChanges) : null;
}

function addPatch(
  patches: Map<string, { address: CellAddress; patch: CellStylePatch }>,
  address: CellAddress,
  patch: CellStylePatch,
): void {
  const key = getCellBorderTargetKey(address);
  const existing = patches.get(key);
  if (existing) Object.assign(existing.patch, patch);
  else patches.set(key, { address: { ...address }, patch: { ...patch } });
}

export function applyCellStyleCommand(
  workbook: Workbook,
  command: ApplyCellStyleCommand,
): RestoreCellStylesCommand | null {
  const range = normalizeRange(command.range);
  assertCellRange(range);
  assertSupportedRange(range);
  getSheetOrThrow(workbook, command.sheetId);
  const patches = new Map<string, { address: CellAddress; patch: CellStylePatch }>();
  const targetBorderPatches = new Map<string, { address: CellAddress; patch: CellBorderPatch }>();
  const borderPatch = getExplicitCellBorderPatch(command.patch);
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      const address = { row, column };
      addPatch(patches, address, command.patch);
      if (Object.keys(borderPatch).length > 0) {
        targetBorderPatches.set(getCellBorderTargetKey(address), {
          address,
          patch: { ...borderPatch },
        });
      }
    }
  }
  reconcileCellBorderTargets(targetBorderPatches, (address, patch) =>
    addPatch(patches, address, patch),
  );
  return applyStylePatches(workbook, command.sheetId, patches);
}

function getCellBorderPatch(
  range: CellRange,
  action: CellBorderAction,
  row: number,
  column: number,
): CellStylePatch {
  if (action.preset === "none") {
    return {
      borderTop: null,
      borderRight: null,
      borderBottom: null,
      borderLeft: null,
      borderDiagonalUp: null,
      borderDiagonalDown: null,
    };
  }
  const border = action.border;
  const isTop = row === range.start.row;
  const isRight = column === range.end.column;
  const isBottom = row === range.end.row;
  const isLeft = column === range.start.column;
  const patch: CellStylePatch = {};
  const apply = (side: CellBorderSide) => Object.assign(patch, { [side]: border });

  if (action.preset === "all") {
    apply("borderTop");
    apply("borderRight");
    apply("borderBottom");
    apply("borderLeft");
  } else if (action.preset === "outer") {
    if (isTop) apply("borderTop");
    if (isRight) apply("borderRight");
    if (isBottom) apply("borderBottom");
    if (isLeft) apply("borderLeft");
  } else if (action.preset === "inner") {
    if (!isRight) apply("borderRight");
    if (!isBottom) apply("borderBottom");
  } else if (action.preset === "top" && isTop) apply("borderTop");
  else if (action.preset === "right" && isRight) apply("borderRight");
  else if (action.preset === "bottom" && isBottom) apply("borderBottom");
  else if (action.preset === "left" && isLeft) apply("borderLeft");
  else if (action.preset === "innerHorizontal" && !isBottom) apply("borderBottom");
  else if (action.preset === "innerVertical" && !isRight) apply("borderRight");
  else if (action.preset === "diagonalUp") patch.borderDiagonalUp = border;
  else if (action.preset === "diagonalDown") patch.borderDiagonalDown = border;
  return patch;
}

export function applyCellBordersCommand(
  workbook: Workbook,
  command: ApplyCellBordersCommand,
): RestoreCellStylesCommand | null {
  const range = normalizeRange(command.range);
  assertCellRange(range);
  assertSupportedRange(range);
  const action = normalizeCellBorderAction(command.action);
  getSheetOrThrow(workbook, command.sheetId);
  const patches = new Map<string, { address: CellAddress; patch: CellStylePatch }>();
  const targetBorderPatches = new Map<string, { address: CellAddress; patch: CellBorderPatch }>();
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      const patch = getCellBorderPatch(range, action, row, column);
      if (Object.keys(patch).length === 0) continue;
      const address = { row, column };
      addPatch(patches, address, patch);
      const sharedBorderPatch = getExplicitCellBorderPatch(patch);
      if (Object.keys(sharedBorderPatch).length > 0) {
        targetBorderPatches.set(getCellBorderTargetKey(address), {
          address,
          patch: sharedBorderPatch,
        });
      }
    }
  }
  reconcileCellBorderTargets(targetBorderPatches, (address, patch) =>
    addPatch(patches, address, patch),
  );
  return applyStylePatches(workbook, command.sheetId, patches);
}

export function applyRestoreCellStylesCommand(
  workbook: Workbook,
  command: RestoreCellStylesCommand,
): RestoreCellStylesCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const addresses = new Set<string>();
  const normalizedChanges = command.changes.map((change) => {
    assertCellAddress(change.address);
    const key = getCellBorderTargetKey(change.address);
    if (addresses.has(key)) throw new Error(`Cell style restore contains duplicate cell ${key}.`);
    addresses.add(key);
    return { address: { ...change.address }, style: normalizeCellStyle(change.style) ?? null };
  });
  const reverseChanges: RestoreCellStylesCommand["changes"] = [];
  for (const change of normalizedChanges) {
    const previousStyle = cloneCellStyle(
      getCellStyle(sheet, change.address) as CellStyle | undefined,
    );
    if (setCellStyle(sheet, change.address, change.style)) {
      reverseChanges.push({ address: { ...change.address }, style: previousStyle ?? null });
    }
  }
  return reverseChanges.length > 0
    ? createRestoreCellStylesCommand(command.sheetId, reverseChanges)
    : null;
}
