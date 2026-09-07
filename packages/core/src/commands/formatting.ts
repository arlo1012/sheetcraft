import {
  MAX_CELL_STYLE_PATCH_CELLS,
  MAX_NUMBER_FORMAT_FRACTION_DIGITS,
  MIN_NUMBER_FORMAT_FRACTION_DIGITS,
  cloneCellStyle,
  normalizeCellBorderFormatPatch,
  mergeCellStyle,
  normalizeCellBorderAction,
  normalizeCellStyle,
  normalizeCellStylePatch,
  type CellBorderAction,
  type CellBorder,
  type CellBorderFormatPatch,
  type CellStyle,
  type CellStylePatch,
  type CellNumberFormat,
} from "../style.js";
import {
  getCellStyle,
  setCellStyle,
  type CellAddress,
  type CellRange,
  type Workbook,
  type Sheet,
} from "../workbook.js";
import { MergedCellRangeResolver } from "../merged-cells.js";
import {
  getExplicitCellBorderPatch,
  getCellBorderTargetKey,
  reconcileCellBorderTargets,
  type CellBorderPatch,
  type CellBorderSide,
} from "./borders.js";
import type {
  ApplyCellBordersCommand,
  ApplyCellFormatCommand,
  AdjustCellNumberFormatDecimalsCommand,
  ApplyCellStyleCommand,
  CellFormatChange,
  RestoreCellStylesCommand,
} from "./contracts.js";
import {
  assertCellAddress,
  assertCellRange,
  getSheetOrThrow,
  invalidCommandPayload,
  normalizeRange,
  validateCommandPayload,
} from "./helpers.js";

function assertSupportedRange(range: CellRange): void {
  const rowCount = range.end.row - range.start.row + 1;
  const columnCount = range.end.column - range.start.column + 1;
  if (rowCount * columnCount > MAX_CELL_STYLE_PATCH_CELLS) {
    throw invalidCommandPayload(
      "range",
      rowCount * columnCount,
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
    patch: validateCommandPayload("patch", patch, () => normalizeCellStylePatch(patch)),
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
    action: validateCommandPayload("action", action, () => normalizeCellBorderAction(action)),
  };
}

function normalizeCellFormatChange(change: CellFormatChange): CellFormatChange {
  if (!change || typeof change !== "object") {
    throw new TypeError("Cell format change must be an object.");
  }
  const normalized: CellFormatChange = {};
  if ("style" in change && change.style !== undefined) {
    normalized.style = normalizeCellStylePatch(change.style);
  }
  if ("borders" in change && change.borders !== undefined) {
    if (!Array.isArray(change.borders)) {
      throw new TypeError("Cell format borders must be an array.");
    }
    normalized.borders = change.borders.map((action) => normalizeCellBorderAction(action));
  }
  if ("borderFormat" in change && change.borderFormat !== undefined) {
    normalized.borderFormat = normalizeCellBorderFormatPatch(change.borderFormat);
  }
  if (!normalized.style && !normalized.borders && !normalized.borderFormat) {
    throw new TypeError("Cell format change must contain a style, borders, or border format.");
  }
  return normalized;
}

export function createApplyCellFormatCommand(
  sheetId: string,
  range: CellRange,
  change: CellFormatChange,
): ApplyCellFormatCommand {
  const normalizedRange = normalizeRange(range);
  assertCellRange(normalizedRange);
  assertSupportedRange(normalizedRange);
  return {
    type: "applyCellFormat",
    sheetId,
    range: normalizedRange,
    change: validateCommandPayload("change", change, () => normalizeCellFormatChange(change)),
  };
}

export function createAdjustCellNumberFormatDecimalsCommand(
  sheetId: string,
  range: CellRange,
  delta: -1 | 1,
): AdjustCellNumberFormatDecimalsCommand {
  const normalizedRange = normalizeRange(range);
  assertCellRange(normalizedRange);
  assertSupportedRange(normalizedRange);
  if (delta !== -1 && delta !== 1) {
    throw invalidCommandPayload("delta", delta, "Number format decimal delta must be -1 or 1.");
  }
  return { type: "adjustCellNumberFormatDecimals", sheetId, range: normalizedRange, delta };
}

export function createRestoreCellStylesCommand(
  sheetId: string,
  changes: readonly { address: CellAddress; style: CellStyle | null }[],
): RestoreCellStylesCommand {
  return {
    type: "restoreCellStyles",
    sheetId,
    changes: validateCommandPayload("changes", changes, () =>
      changes.map((change) => ({
        address: { ...change.address },
        style:
          validateCommandPayload("changes.style", change.style, () =>
            cloneCellStyle(change.style ?? undefined),
          ) ?? null,
      })),
    ),
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

function getMergeAwareAddress(
  resolver: MergedCellRangeResolver,
  address: CellAddress,
): CellAddress {
  return resolver.getAnchor(address) ?? address;
}

export function applyCellStyleCommand(
  workbook: Workbook,
  command: ApplyCellStyleCommand,
): RestoreCellStylesCommand | null {
  const range = normalizeRange(command.range);
  assertCellRange(range);
  assertSupportedRange(range);
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const mergeResolver = new MergedCellRangeResolver(sheet.mergedCells);
  const normalizedPatch = validateCommandPayload("patch", command.patch, () =>
    normalizeCellStylePatch(command.patch),
  );
  const patches = new Map<string, { address: CellAddress; patch: CellStylePatch }>();
  const targetBorderPatches = new Map<string, { address: CellAddress; patch: CellBorderPatch }>();
  const borderPatch = getExplicitCellBorderPatch(normalizedPatch);
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      const address = getMergeAwareAddress(mergeResolver, { row, column });
      addPatch(patches, address, normalizedPatch);
      if (Object.keys(borderPatch).length > 0) {
        targetBorderPatches.set(getCellBorderTargetKey(address), {
          address,
          patch: { ...borderPatch },
        });
      }
    }
  }
  reconcileCellBorderTargets(targetBorderPatches, (address, patch) =>
    addPatch(patches, getMergeAwareAddress(mergeResolver, address), patch),
  );
  return applyStylePatches(workbook, command.sheetId, patches);
}

function adjustNumberFormat(
  format: CellNumberFormat | undefined,
  delta: -1 | 1,
): CellNumberFormat | undefined {
  if (!format) {
    return delta > 0 ? { kind: "number", fractionDigits: 1 } : undefined;
  }
  const fractionDigits = Math.max(
    MIN_NUMBER_FORMAT_FRACTION_DIGITS,
    Math.min(MAX_NUMBER_FORMAT_FRACTION_DIGITS, format.fractionDigits + delta),
  );
  return fractionDigits === format.fractionDigits ? format : { ...format, fractionDigits };
}

export function applyAdjustCellNumberFormatDecimalsCommand(
  workbook: Workbook,
  command: AdjustCellNumberFormatDecimalsCommand,
): RestoreCellStylesCommand | null {
  const range = normalizeRange(command.range);
  assertCellRange(range);
  assertSupportedRange(range);
  if (command.delta !== -1 && command.delta !== 1) {
    throw invalidCommandPayload(
      "delta",
      command.delta,
      "Number format decimal delta must be -1 or 1.",
    );
  }
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const mergeResolver = new MergedCellRangeResolver(sheet.mergedCells);
  const patches = new Map<string, { address: CellAddress; patch: CellStylePatch }>();
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      const address = getMergeAwareAddress(mergeResolver, { row, column });
      const current = getCellStyle(sheet, address)?.numberFormat;
      const adjusted = adjustNumberFormat(current, command.delta);
      if (adjusted !== current) {
        addPatch(patches, address, { numberFormat: adjusted ?? null });
      }
    }
  }
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
  // Actions are normalized before reaching this helper. The only absent border
  // belongs to the `none` preset handled above; null intentionally clears sides.
  const border = action.border ?? null;
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

type StylePatchMap = Map<string, { address: CellAddress; patch: CellStylePatch }>;
type BorderPatchMap = Map<string, { address: CellAddress; patch: CellBorderPatch }>;

function addTargetBorderPatch(
  targets: BorderPatchMap,
  address: CellAddress,
  patch: CellBorderPatch,
): void {
  const key = getCellBorderTargetKey(address);
  const current = targets.get(key);
  if (current) Object.assign(current.patch, patch);
  else targets.set(key, { address: { ...address }, patch: { ...patch } });
}

function addBorderActionPatches(
  range: CellRange,
  action: CellBorderAction,
  resolver: MergedCellRangeResolver,
  patches: StylePatchMap,
  targets: BorderPatchMap,
): void {
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      const patch = getCellBorderPatch(range, action, row, column);
      if (Object.keys(patch).length === 0) continue;
      const address = getMergeAwareAddress(resolver, { row, column });
      addPatch(patches, address, patch);
      const sharedPatch = getExplicitCellBorderPatch(patch);
      // Keep the physical coordinate for ownership reconciliation. The style
      // itself is stored at a merged range's anchor, but its perimeter may
      // meet a different neighboring cell at every row or column.
      if (Object.keys(sharedPatch).length > 0)
        addTargetBorderPatch(targets, { row, column }, sharedPatch);
    }
  }
}

function updateBorder(border: CellBorder, format: CellBorderFormatPatch): CellBorder {
  return {
    style: format.style ?? border.style,
    color: format.color ?? border.color,
  };
}

function addExistingVisibleBorderPatches(
  sheet: Sheet,
  range: CellRange,
  format: CellBorderFormatPatch,
  resolver: MergedCellRangeResolver,
  patches: StylePatchMap,
  targets: BorderPatchMap,
): void {
  const getBorder = (
    address: CellAddress,
    side: keyof Pick<
      CellStyle,
      | "borderTop"
      | "borderRight"
      | "borderBottom"
      | "borderLeft"
      | "borderDiagonalUp"
      | "borderDiagonalDown"
    >,
  ): CellBorder | undefined => {
    const patched = patches.get(getCellBorderTargetKey(address))?.patch[side];
    if (patched === null || patched === false) return undefined;
    if (patched && typeof patched === "object") return patched as CellBorder;
    return getCellStyle(sheet, address)?.[side] as CellBorder | undefined;
  };
  const getPatchedBorder = (
    address: CellAddress,
    side: keyof Pick<
      CellStyle,
      | "borderTop"
      | "borderRight"
      | "borderBottom"
      | "borderLeft"
      | "borderDiagonalUp"
      | "borderDiagonalDown"
    >,
  ): { present: boolean; border: CellBorder | undefined } => {
    const patch = patches.get(getCellBorderTargetKey(address))?.patch;
    if (!patch || !(side in patch)) return { present: false, border: undefined };
    const value = patch[side];
    return {
      present: true,
      border: value && typeof value === "object" ? (value as CellBorder) : undefined,
    };
  };
  const applyShared = (
    primary: CellAddress | undefined,
    primarySide: CellBorderSide,
    fallback: CellAddress | undefined,
    fallbackSide: CellBorderSide,
  ) => {
    const primaryAddress = primary && getMergeAwareAddress(resolver, primary);
    const fallbackAddress = fallback && getMergeAwareAddress(resolver, fallback);
    const primaryPatched = primaryAddress
      ? getPatchedBorder(primaryAddress, primarySide)
      : { present: false, border: undefined };
    const fallbackPatched = fallbackAddress
      ? getPatchedBorder(fallbackAddress, fallbackSide)
      : { present: false, border: undefined };
    const primaryBorder = primaryAddress ? getBorder(primaryAddress, primarySide) : undefined;
    const fallbackBorder = fallbackAddress ? getBorder(fallbackAddress, fallbackSide) : undefined;
    const usePatchedBorder = primaryPatched.present || fallbackPatched.present;
    const address = usePatchedBorder
      ? primaryPatched.border
        ? primaryAddress
        : fallbackPatched.border
          ? fallbackAddress
          : undefined
      : primaryBorder
        ? primaryAddress
        : fallbackBorder
          ? fallbackAddress
          : undefined;
    const side = usePatchedBorder
      ? primaryPatched.border
        ? primarySide
        : fallbackPatched.border
          ? fallbackSide
          : undefined
      : primaryBorder
        ? primarySide
        : fallbackBorder
          ? fallbackSide
          : undefined;
    const border = usePatchedBorder
      ? (primaryPatched.border ?? fallbackPatched.border)
      : (primaryBorder ?? fallbackBorder);
    if (!address || !side || !border) return;
    const patch = { [side]: updateBorder(border, format) } as CellBorderPatch;
    addPatch(patches, address, patch);
    addTargetBorderPatch(targets, address, patch);
  };

  for (let row = range.start.row; row <= range.end.row + 1; row += 1) {
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      applyShared(
        row > 0 ? { row: row - 1, column } : undefined,
        "borderBottom",
        row <= range.end.row + 1 ? { row, column } : undefined,
        "borderTop",
      );
    }
  }
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    for (let column = range.start.column; column <= range.end.column + 1; column += 1) {
      applyShared(
        column > 0 ? { row, column: column - 1 } : undefined,
        "borderRight",
        column <= range.end.column + 1 ? { row, column } : undefined,
        "borderLeft",
      );
    }
  }
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      const address = getMergeAwareAddress(resolver, { row, column });
      for (const side of ["borderDiagonalUp", "borderDiagonalDown"] as const) {
        const border = getBorder(address, side);
        if (!border) continue;
        addPatch(patches, address, { [side]: updateBorder(border, format) });
      }
    }
  }
}

function reconcileAndApply(
  workbook: Workbook,
  sheetId: string,
  resolver: MergedCellRangeResolver,
  patches: StylePatchMap,
  targets: BorderPatchMap,
): RestoreCellStylesCommand | null {
  reconcileCellBorderTargets(targets, (address, patch) => {
    const mergeAwareAddress = getMergeAwareAddress(resolver, address);
    // A merged range stores its perimeter on its anchor. Reconciliation can
    // visit an internal constituent as the opposite side of that same anchor;
    // applying its clearing patch back to the anchor would erase another
    // perimeter side of the very border action being reconciled.
    if (
      getCellBorderTargetKey(mergeAwareAddress) !== getCellBorderTargetKey(address) &&
      targets.has(getCellBorderTargetKey(mergeAwareAddress))
    ) {
      return;
    }
    addPatch(patches, mergeAwareAddress, patch);
  });
  return applyStylePatches(workbook, sheetId, patches);
}

export function applyCellFormatCommand(
  workbook: Workbook,
  command: ApplyCellFormatCommand,
): RestoreCellStylesCommand | null {
  const range = normalizeRange(command.range);
  assertCellRange(range);
  assertSupportedRange(range);
  const change = validateCommandPayload("change", command.change, () =>
    normalizeCellFormatChange(command.change),
  );
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const resolver = new MergedCellRangeResolver(sheet.mergedCells);
  const patches: StylePatchMap = new Map();
  const targets: BorderPatchMap = new Map();

  if (change.style) {
    const borderPatch = getExplicitCellBorderPatch(change.style);
    for (let row = range.start.row; row <= range.end.row; row += 1) {
      for (let column = range.start.column; column <= range.end.column; column += 1) {
        const address = getMergeAwareAddress(resolver, { row, column });
        addPatch(patches, address, change.style);
        if (Object.keys(borderPatch).length > 0)
          addTargetBorderPatch(targets, { row, column }, borderPatch);
      }
    }
  }
  for (const action of change.borders ?? []) {
    addBorderActionPatches(range, action, resolver, patches, targets);
  }
  if (change.borderFormat) {
    addExistingVisibleBorderPatches(sheet, range, change.borderFormat, resolver, patches, targets);
  }
  return reconcileAndApply(workbook, command.sheetId, resolver, patches, targets);
}

export function applyCellBordersCommand(
  workbook: Workbook,
  command: ApplyCellBordersCommand,
): RestoreCellStylesCommand | null {
  const range = normalizeRange(command.range);
  assertCellRange(range);
  assertSupportedRange(range);
  const action = validateCommandPayload("action", command.action, () =>
    normalizeCellBorderAction(command.action),
  );
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const mergeResolver = new MergedCellRangeResolver(sheet.mergedCells);
  const patches = new Map<string, { address: CellAddress; patch: CellStylePatch }>();
  const targetBorderPatches = new Map<string, { address: CellAddress; patch: CellBorderPatch }>();
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      const patch = getCellBorderPatch(range, action, row, column);
      if (Object.keys(patch).length === 0) continue;
      const address = getMergeAwareAddress(mergeResolver, { row, column });
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
    addPatch(patches, getMergeAwareAddress(mergeResolver, address), patch),
  );
  return applyStylePatches(workbook, command.sheetId, patches);
}

export function applyRestoreCellStylesCommand(
  workbook: Workbook,
  command: RestoreCellStylesCommand,
): RestoreCellStylesCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const mergeResolver = new MergedCellRangeResolver(sheet.mergedCells);
  const addresses = new Set<string>();
  const normalizedChanges = validateCommandPayload("changes", command.changes, () =>
    command.changes.map((change) => {
      assertCellAddress(change.address);
      const address = getMergeAwareAddress(mergeResolver, change.address);
      const key = getCellBorderTargetKey(address);
      if (addresses.has(key)) {
        throw invalidCommandPayload(
          "changes",
          key,
          `Cell style restore contains duplicate cell ${key}.`,
        );
      }
      addresses.add(key);
      return {
        address,
        style:
          validateCommandPayload("changes.style", change.style, () =>
            normalizeCellStyle(change.style),
          ) ?? null,
      };
    }),
  );
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
