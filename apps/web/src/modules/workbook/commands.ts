import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  createSheet,
  getColumnWidth,
  getCellValue,
  getCellStyle,
  getNextSheetName,
  getSheetIndex,
  getRowHeight,
  insertSheet,
  isCellAddressInBounds,
  removeSheet,
  renameSheet,
  createSheetSparseState,
  replaceSheetSparseState,
  setColumnWidth,
  setCellValue,
  setCellStyle,
  setActiveSheet,
  setRowHeight,
  type CellAddress,
  type CellRange,
  type CellValue,
  type SheetDimensionAxis,
  type SheetSparseState,
  type Sheet,
  type Workbook,
} from "./workbook";
import { getCellMatrixSize } from "./clipboard";
import {
  MAX_CELL_STYLE_PATCH_CELLS,
  cloneCellStyle,
  mergeCellStyle,
  normalizeCellStyle,
  normalizeCellStylePatch,
  normalizeCellBorderAction,
  type CellBorderAction,
  type CellStyle,
  type CellStylePatch,
} from "./cell-style";

export type CellValueChange = {
  sheetId: string;
  address: CellAddress;
  value: CellValue;
  style?: CellStyle | null;
};

export type SetCellValuesCommand = {
  type: "setCellValues";
  changes: CellValueChange[];
  reconcileBorders?: true;
};

export type ClearCellRangeCommand = {
  type: "clearCellRange";
  sheetId: string;
  range: CellRange;
};

export type ApplyCellStyleCommand = {
  type: "applyCellStyle";
  sheetId: string;
  range: CellRange;
  patch: CellStylePatch;
};

export type ApplyCellBordersCommand = {
  type: "applyCellBorders";
  sheetId: string;
  range: CellRange;
  action: CellBorderAction;
};

export type RestoreCellStylesCommand = {
  type: "restoreCellStyles";
  sheetId: string;
  changes: Array<{ address: CellAddress; style: CellStyle | null }>;
};

export type ResizeSheetDimensionCommand = {
  type: "resizeSheetDimension";
  sheetId: string;
  axis: SheetDimensionAxis;
  index: number;
  size: number;
};

export type AddSheetCommand = {
  type: "addSheet";
  sheet: Sheet;
  index: number;
  activeSheetId: string;
};

export type DeleteSheetCommand = {
  type: "deleteSheet";
  sheetId: string;
  activeSheetId: string;
};

export type RenameSheetCommand = {
  type: "renameSheet";
  sheetId: string;
  name: string;
};

export type InsertSheetAxisCommand = {
  type: "insertSheetAxis";
  sheetId: string;
  axis: SheetDimensionAxis;
  index: number;
  count: number;
};

export type DeleteSheetAxisCommand = {
  type: "deleteSheetAxis";
  sheetId: string;
  axis: SheetDimensionAxis;
  index: number;
  count: number;
};

type ReplaceSheetSparseStateCommand = {
  type: "replaceSheetSparseState";
  sheetId: string;
  state: SheetSparseState;
};

export type WorkbookCommand =
  | SetCellValuesCommand
  | ClearCellRangeCommand
  | ApplyCellStyleCommand
  | ApplyCellBordersCommand
  | RestoreCellStylesCommand
  | ResizeSheetDimensionCommand
  | AddSheetCommand
  | DeleteSheetCommand
  | RenameSheetCommand
  | InsertSheetAxisCommand
  | DeleteSheetAxisCommand
  | ReplaceSheetSparseStateCommand;

function assertCellAddress(address: CellAddress): void {
  if (!isCellAddressInBounds(address)) {
    throw new RangeError(`Cell address ${address.row}:${address.column} is outside the sheet.`);
  }
}

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
      ...change,
      address: { ...change.address },
      ...("style" in change ? { style: cloneCellStyle(change.style ?? undefined) ?? null } : {}),
    })),
    ...(options?.reconcileBorders ? { reconcileBorders: true } : {}),
  };
}

function normalizeRange(range: CellRange): CellRange {
  return {
    start: {
      row: Math.min(range.start.row, range.end.row),
      column: Math.min(range.start.column, range.end.column),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      column: Math.max(range.start.column, range.end.column),
    },
  };
}

function assertCellRange(range: CellRange): void {
  assertCellAddress(range.start);
  assertCellAddress(range.end);
}

export function createClearCellRangeCommand(
  sheetId: string,
  range: CellRange,
): ClearCellRangeCommand {
  const normalizedRange = normalizeRange(range);
  assertCellRange(normalizedRange);

  return {
    type: "clearCellRange",
    sheetId,
    range: normalizedRange,
  };
}

export function createApplyCellStyleCommand(
  sheetId: string,
  range: CellRange,
  patch: CellStylePatch,
): ApplyCellStyleCommand {
  const normalizedRange = normalizeRange(range);
  assertCellRange(normalizedRange);
  const rowCount = normalizedRange.end.row - normalizedRange.start.row + 1;
  const columnCount = normalizedRange.end.column - normalizedRange.start.column + 1;
  if (rowCount * columnCount > MAX_CELL_STYLE_PATCH_CELLS) {
    throw new RangeError(
      `Cell style changes are limited to ${MAX_CELL_STYLE_PATCH_CELLS} cells per command.`,
    );
  }
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
  const rowCount = normalizedRange.end.row - normalizedRange.start.row + 1;
  const columnCount = normalizedRange.end.column - normalizedRange.start.column + 1;
  if (rowCount * columnCount > MAX_CELL_STYLE_PATCH_CELLS) {
    throw new RangeError(
      `Cell style changes are limited to ${MAX_CELL_STYLE_PATCH_CELLS} cells per command.`,
    );
  }
  return {
    type: "applyCellBorders",
    sheetId,
    range: normalizedRange,
    action: normalizeCellBorderAction(action),
  };
}

export function createResizeSheetDimensionCommand(
  sheetId: string,
  axis: SheetDimensionAxis,
  index: number,
  size: number,
): ResizeSheetDimensionCommand {
  return { type: "resizeSheetDimension", sheetId, axis, index, size };
}

export function createAddSheetCommand(
  workbook: Workbook,
  options?: { id?: string; name?: string; index?: number },
): AddSheetCommand {
  const sheet = createSheet(options?.name ?? getNextSheetName(workbook), options?.id);
  return {
    type: "addSheet",
    sheet,
    index: options?.index ?? workbook.sheets.size,
    activeSheetId: sheet.id,
  };
}

export function createDeleteSheetCommand(workbook: Workbook, sheetId: string): DeleteSheetCommand {
  const index = getSheetIndex(workbook, sheetId);
  if (index < 0) {
    throw new Error(`Sheet ${sheetId} does not exist.`);
  }
  if (workbook.sheets.size <= 1) {
    throw new Error("A workbook must contain at least one sheet.");
  }

  const sheets = [...workbook.sheets.values()];
  const nextActiveSheetId =
    workbook.activeSheetId === sheetId
      ? (sheets[index + 1] ?? sheets[index - 1])?.id
      : workbook.activeSheetId;
  if (!nextActiveSheetId) {
    throw new Error("Unable to select a sheet after deletion.");
  }

  return { type: "deleteSheet", sheetId, activeSheetId: nextActiveSheetId };
}

export function createRenameSheetCommand(sheetId: string, name: string): RenameSheetCommand {
  return { type: "renameSheet", sheetId, name };
}

export function createInsertSheetAxisCommand(
  sheetId: string,
  axis: SheetDimensionAxis,
  index: number,
  count = 1,
): InsertSheetAxisCommand {
  return { type: "insertSheetAxis", sheetId, axis, index, count };
}

export function createDeleteSheetAxisCommand(
  sheetId: string,
  axis: SheetDimensionAxis,
  index: number,
  count = 1,
): DeleteSheetAxisCommand {
  return { type: "deleteSheetAxis", sheetId, axis, index, count };
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
      address,
      value,
      ...(style === undefined ? {} : { style: style ? cloneCellStyle(style) : null }),
    });
  };

  if (options?.clearRange) {
    const clearRange = normalizeRange(options.clearRange);
    assertCellAddress(clearRange.start);
    assertCellAddress(clearRange.end);
    for (let row = clearRange.start.row; row <= clearRange.end.row; row += 1) {
      for (let column = clearRange.start.column; column <= clearRange.end.column; column += 1) {
        setChange({ row, column }, null, null);
      }
    }
  }

  for (let row = 0; row < size.rowCount; row += 1) {
    for (let column = 0; column < size.columnCount; column += 1) {
      const address = { row: anchor.row + row, column: anchor.column + column };
      if (options?.styles) {
        setChange(address, values[row]?.[column] ?? null, options.styles[row]?.[column] ?? null);
      } else {
        setChange(address, values[row]?.[column] ?? null);
      }
    }
  }

  if (end.row >= MAX_SHEET_ROWS || end.column >= MAX_SHEET_COLUMNS) {
    throw new RangeError("Pasted cells exceed the sheet limits.");
  }

  return createBatchSetCellValuesCommand([...changes.values()], {
    reconcileBorders: Boolean(options?.styles),
  });
}

function applySetCellValuesCommand(
  workbook: Workbook,
  command: SetCellValuesCommand,
): WorkbookCommand | null {
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
    if (!workbook.sheets.has(change.sheetId)) {
      throw new Error(`Sheet ${change.sheetId} does not exist.`);
    }
    const key = getChangeKey(change.sheetId, change.address);
    if (initialStates.has(key)) {
      continue;
    }
    const sheet = workbook.sheets.get(change.sheetId);
    if (!sheet) {
      throw new Error(`Sheet ${change.sheetId} disappeared while applying the command.`);
    }
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
    if (!previous) {
      throw new Error(`Missing previous state for cell ${address.row}:${address.column}.`);
    }
    const existing = reverseChangesByAddress.get(key);
    if (existing) {
      if (includeStyle && !("style" in existing)) {
        Object.assign(existing, { style: previous.style ?? null });
      }
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
    const sheet = workbook.sheets.get(change.sheetId);
    if (!sheet) {
      throw new Error(`Sheet ${change.sheetId} disappeared while applying the command.`);
    }

    const valueChanged = setCellValue(sheet, change.address, change.value);
    const styleChanged =
      "style" in change ? setCellStyle(sheet, change.address, change.style) : false;
    if (!valueChanged && !styleChanged) {
      continue;
    }
    recordReverseChange(change.sheetId, change.address, "style" in change);
  }

  if (command.reconcileBorders) {
    const targetsBySheet = new Map<
      string,
      Map<string, { address: CellAddress; patch: CellBorderPatch }>
    >();
    for (const change of command.changes) {
      if (!("style" in change)) {
        continue;
      }
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
        if (existing) {
          Object.assign(existing.patch, patch);
          return;
        }
        cleanupPatches.set(key, { address: { ...address }, patch: { ...patch } });
      });

      const sheet = workbook.sheets.get(sheetId);
      if (!sheet) {
        throw new Error(`Sheet ${sheetId} disappeared while reconciling borders.`);
      }
      for (const { address, patch } of cleanupPatches.values()) {
        const previousValue = getCellValue(sheet, address);
        const previousStyle = cloneCellStyle(getCellStyle(sheet, address) as CellStyle | undefined);
        if (!setCellStyle(sheet, address, mergeCellStyle(previousStyle, patch))) {
          continue;
        }
        recordReverseChange(sheetId, address, true, {
          value: previousValue,
          style: previousStyle,
        });
      }
    }
  }

  return reverseChanges.length > 0 ? createBatchSetCellValuesCommand(reverseChanges) : null;
}

function parseCellKey(key: string): CellAddress {
  const separator = key.indexOf(":");
  return {
    row: Number(key.slice(0, separator)),
    column: Number(key.slice(separator + 1)),
  };
}

function applyClearCellRangeCommand(
  workbook: Workbook,
  command: ClearCellRangeCommand,
): WorkbookCommand | null {
  const range = normalizeRange(command.range);
  assertCellRange(range);
  const sheet = workbook.sheets.get(command.sheetId);
  if (!sheet) {
    throw new Error(`Sheet ${command.sheetId} does not exist.`);
  }

  const reverseChanges: CellValueChange[] = [];
  for (const [key, cell] of sheet.cells) {
    const address = parseCellKey(key);
    if (
      address.row < range.start.row ||
      address.row > range.end.row ||
      address.column < range.start.column ||
      address.column > range.end.column
    ) {
      continue;
    }

    if (cell.value === undefined) {
      continue;
    }
    reverseChanges.push({
      sheetId: command.sheetId,
      address,
      value: cell.value,
    });
    setCellValue(sheet, address, null);
  }

  return reverseChanges.length > 0 ? createBatchSetCellValuesCommand(reverseChanges) : null;
}

function createRestoreCellStylesCommand(
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

function applyCellStyleCommand(
  workbook: Workbook,
  command: ApplyCellStyleCommand,
): WorkbookCommand | null {
  const sheet = workbook.sheets.get(command.sheetId);
  if (!sheet) {
    throw new Error(`Sheet ${command.sheetId} does not exist.`);
  }

  const patches = new Map<string, { address: CellAddress; patch: CellStylePatch }>();
  const addPatch = (address: CellAddress, patch: CellStylePatch) => {
    const key = getCellBorderTargetKey(address);
    const existing = patches.get(key);
    if (existing) {
      Object.assign(existing.patch, patch);
      return;
    }
    patches.set(key, { address: { ...address }, patch: { ...patch } });
  };
  const targetBorderPatches = new Map<string, { address: CellAddress; patch: CellBorderPatch }>();
  const borderPatch = getExplicitCellBorderPatch(command.patch);
  const reverseChanges: RestoreCellStylesCommand["changes"] = [];
  for (let row = command.range.start.row; row <= command.range.end.row; row += 1) {
    for (let column = command.range.start.column; column <= command.range.end.column; column += 1) {
      const address = { row, column };
      addPatch(address, command.patch);
      if (Object.keys(borderPatch).length > 0) {
        targetBorderPatches.set(getCellBorderTargetKey(address), {
          address,
          patch: { ...borderPatch },
        });
      }
    }
  }
  reconcileCellBorderTargets(targetBorderPatches, addPatch);

  for (const { address, patch } of patches.values()) {
    const previousStyle = cloneCellStyle(getCellStyle(sheet, address) as CellStyle | undefined);
    const nextStyle = mergeCellStyle(previousStyle, patch);
    if (!setCellStyle(sheet, address, nextStyle)) {
      continue;
    }
    reverseChanges.push({ address, style: previousStyle ?? null });
  }
  return reverseChanges.length > 0
    ? createRestoreCellStylesCommand(command.sheetId, reverseChanges)
    : null;
}

type CellBorderSide = "borderTop" | "borderRight" | "borderBottom" | "borderLeft";

type CellBorderPatch = Pick<CellStylePatch, CellBorderSide>;

const CELL_BORDER_SIDES = [
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
] as const satisfies readonly CellBorderSide[];

const OPPOSITE_CELL_BORDER_SIDES: Record<CellBorderSide, CellBorderSide> = {
  borderTop: "borderBottom",
  borderRight: "borderLeft",
  borderBottom: "borderTop",
  borderLeft: "borderRight",
};

function getNeighborAddress(address: CellAddress, side: CellBorderSide): CellAddress | undefined {
  const offset =
    side === "borderTop"
      ? { row: -1, column: 0 }
      : side === "borderRight"
        ? { row: 0, column: 1 }
        : side === "borderBottom"
          ? { row: 1, column: 0 }
          : { row: 0, column: -1 };
  const neighbor = { row: address.row + offset.row, column: address.column + offset.column };
  return isCellAddressInBounds(neighbor) ? neighbor : undefined;
}

function hasMatchingCellBorder(
  left: CellStylePatch[CellBorderSide],
  right: CellStylePatch[CellBorderSide],
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  return left.style === right.style && left.color === right.color;
}

function hasCellBorder(value: CellStylePatch[CellBorderSide]): boolean {
  return Boolean(value && typeof value === "object");
}

function getCellBorderTargetKey(address: CellAddress): string {
  return `${address.row}:${address.column}`;
}

function getExplicitCellBorderPatch(style: CellStylePatch): CellBorderPatch {
  const patch: CellBorderPatch = {};
  for (const side of CELL_BORDER_SIDES) {
    if (side in style) {
      Object.assign(patch, { [side]: style[side] });
    }
  }
  return patch;
}

function getExactCellBorderPatch(style: CellStyle | undefined): CellBorderPatch {
  return {
    borderTop: style?.borderTop ?? null,
    borderRight: style?.borderRight ?? null,
    borderBottom: style?.borderBottom ?? null,
    borderLeft: style?.borderLeft ?? null,
  };
}

function reconcileCellBorderTargets(
  targets: ReadonlyMap<string, { address: CellAddress; patch: CellBorderPatch }>,
  addPatch: (address: CellAddress, patch: CellStylePatch) => void,
): void {
  const processedEdges = new Set<string>();
  for (const target of targets.values()) {
    for (const side of CELL_BORDER_SIDES) {
      if (!(side in target.patch)) {
        continue;
      }
      const neighbor = getNeighborAddress(target.address, side);
      if (!neighbor) {
        continue;
      }
      const oppositeSide = OPPOSITE_CELL_BORDER_SIDES[side];
      const ownerAddress =
        side === "borderTop" || side === "borderLeft" ? neighbor : target.address;
      const ownerSide = side === "borderTop" || side === "borderLeft" ? oppositeSide : side;
      const edgeKey = `${getCellBorderTargetKey(ownerAddress)}:${ownerSide}`;
      if (processedEdges.has(edgeKey)) {
        continue;
      }
      processedEdges.add(edgeKey);

      const ownerTarget = targets.get(getCellBorderTargetKey(ownerAddress));
      const fallbackAddress = getNeighborAddress(ownerAddress, ownerSide);
      if (!fallbackAddress) {
        continue;
      }
      const fallbackSide = OPPOSITE_CELL_BORDER_SIDES[ownerSide];
      const fallbackTarget = targets.get(getCellBorderTargetKey(fallbackAddress));
      const ownerBorder = ownerTarget?.patch[ownerSide];
      const fallbackBorder = fallbackTarget?.patch[fallbackSide];
      const winnerIsOwner =
        hasCellBorder(ownerBorder) ||
        (!hasCellBorder(fallbackBorder) &&
          !(fallbackTarget && fallbackSide in fallbackTarget.patch));
      const winnerSide = winnerIsOwner ? ownerSide : fallbackSide;
      const winnerBorder = winnerIsOwner ? ownerBorder : fallbackBorder;
      const loserAddress = winnerIsOwner ? fallbackAddress : ownerAddress;
      if (!loserAddress) {
        continue;
      }
      const loserSide = OPPOSITE_CELL_BORDER_SIDES[winnerSide];
      const intendedLoserBorder = targets.get(getCellBorderTargetKey(loserAddress))?.patch[
        loserSide
      ];
      if (hasMatchingCellBorder(winnerBorder, intendedLoserBorder)) {
        continue;
      }
      addPatch(loserAddress, { [loserSide]: null });
    }
  }
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
  const apply = (side: CellBorderSide) => {
    Object.assign(patch, { [side]: border });
  };

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
  } else if (action.preset === "top" && isTop) {
    apply("borderTop");
  } else if (action.preset === "right" && isRight) {
    apply("borderRight");
  } else if (action.preset === "bottom" && isBottom) {
    apply("borderBottom");
  } else if (action.preset === "left" && isLeft) {
    apply("borderLeft");
  } else if (action.preset === "innerHorizontal" && !isBottom) {
    apply("borderBottom");
  } else if (action.preset === "innerVertical" && !isRight) {
    apply("borderRight");
  } else if (action.preset === "diagonalUp") {
    patch.borderDiagonalUp = border;
  } else if (action.preset === "diagonalDown") {
    patch.borderDiagonalDown = border;
  }

  return patch;
}

function applyCellBordersCommand(
  workbook: Workbook,
  command: ApplyCellBordersCommand,
): WorkbookCommand | null {
  const range = normalizeRange(command.range);
  assertCellRange(range);
  const rowCount = range.end.row - range.start.row + 1;
  const columnCount = range.end.column - range.start.column + 1;
  if (rowCount * columnCount > MAX_CELL_STYLE_PATCH_CELLS) {
    throw new RangeError(
      `Cell style changes are limited to ${MAX_CELL_STYLE_PATCH_CELLS} cells per command.`,
    );
  }
  const action = normalizeCellBorderAction(command.action);
  const sheet = workbook.sheets.get(command.sheetId);
  if (!sheet) {
    throw new Error(`Sheet ${command.sheetId} does not exist.`);
  }

  const patches = new Map<string, { address: CellAddress; patch: CellStylePatch }>();
  const addPatch = (address: CellAddress, patch: CellStylePatch) => {
    const key = `${address.row}:${address.column}`;
    const existing = patches.get(key);
    if (existing) {
      Object.assign(existing.patch, patch);
      return;
    }
    patches.set(key, { address: { ...address }, patch: { ...patch } });
  };

  const targetBorderPatches = new Map<string, { address: CellAddress; patch: CellBorderPatch }>();
  for (let row = range.start.row; row <= range.end.row; row += 1) {
    for (let column = range.start.column; column <= range.end.column; column += 1) {
      const patch = getCellBorderPatch(range, action, row, column);
      if (Object.keys(patch).length === 0) {
        continue;
      }
      const address = { row, column };
      addPatch(address, patch);
      const sharedBorderPatch = getExplicitCellBorderPatch(patch);
      if (Object.keys(sharedBorderPatch).length > 0) {
        targetBorderPatches.set(getCellBorderTargetKey(address), {
          address,
          patch: sharedBorderPatch,
        });
      }
    }
  }
  reconcileCellBorderTargets(targetBorderPatches, addPatch);

  const reverseChanges: RestoreCellStylesCommand["changes"] = [];
  for (const { address, patch } of patches.values()) {
    const previousStyle = cloneCellStyle(getCellStyle(sheet, address) as CellStyle | undefined);
    const nextStyle = mergeCellStyle(previousStyle, patch);
    if (!setCellStyle(sheet, address, nextStyle)) {
      continue;
    }
    reverseChanges.push({ address, style: previousStyle ?? null });
  }

  return reverseChanges.length > 0
    ? createRestoreCellStylesCommand(command.sheetId, reverseChanges)
    : null;
}

function applyRestoreCellStylesCommand(
  workbook: Workbook,
  command: RestoreCellStylesCommand,
): WorkbookCommand | null {
  const sheet = workbook.sheets.get(command.sheetId);
  if (!sheet) {
    throw new Error(`Sheet ${command.sheetId} does not exist.`);
  }
  const addresses = new Set<string>();
  const normalizedChanges = command.changes.map((change) => {
    assertCellAddress(change.address);
    const key = `${change.address.row}:${change.address.column}`;
    if (addresses.has(key)) {
      throw new Error(`Cell style restore contains duplicate cell ${key}.`);
    }
    addresses.add(key);
    return {
      address: { ...change.address },
      style: normalizeCellStyle(change.style) ?? null,
    };
  });

  const reverseChanges: RestoreCellStylesCommand["changes"] = [];
  for (const change of normalizedChanges) {
    const previousStyle = cloneCellStyle(
      getCellStyle(sheet, change.address) as CellStyle | undefined,
    );
    if (!setCellStyle(sheet, change.address, change.style)) {
      continue;
    }
    reverseChanges.push({ address: change.address, style: previousStyle ?? null });
  }
  return reverseChanges.length > 0
    ? createRestoreCellStylesCommand(command.sheetId, reverseChanges)
    : null;
}

function applyResizeSheetDimensionCommand(
  workbook: Workbook,
  command: ResizeSheetDimensionCommand,
): WorkbookCommand | null {
  if (command.axis !== "row" && command.axis !== "column") {
    throw new RangeError(`Unknown sheet dimension axis ${command.axis}.`);
  }
  const sheet = workbook.sheets.get(command.sheetId);
  if (!sheet) {
    throw new Error(`Sheet ${command.sheetId} does not exist.`);
  }

  const previousSize =
    command.axis === "row"
      ? getRowHeight(sheet, command.index)
      : getColumnWidth(sheet, command.index);
  const changed =
    command.axis === "row"
      ? setRowHeight(sheet, command.index, command.size)
      : setColumnWidth(sheet, command.index, command.size);

  return changed
    ? createResizeSheetDimensionCommand(command.sheetId, command.axis, command.index, previousSize)
    : null;
}

function applyAddSheetCommand(workbook: Workbook, command: AddSheetCommand): WorkbookCommand {
  if (command.activeSheetId !== command.sheet.id && !workbook.sheets.has(command.activeSheetId)) {
    throw new Error(`Sheet ${command.activeSheetId} does not exist.`);
  }
  const previousActiveSheetId = workbook.activeSheetId;
  insertSheet(workbook, command.sheet, command.index);
  setActiveSheet(workbook, command.activeSheetId);
  return {
    type: "deleteSheet",
    sheetId: command.sheet.id,
    activeSheetId: previousActiveSheetId,
  };
}

function applyDeleteSheetCommand(workbook: Workbook, command: DeleteSheetCommand): WorkbookCommand {
  if (command.activeSheetId === command.sheetId || !workbook.sheets.has(command.activeSheetId)) {
    throw new Error(`Sheet ${command.activeSheetId} does not exist after deletion.`);
  }
  const previousActiveSheetId = workbook.activeSheetId;
  const { sheet, index } = removeSheet(workbook, command.sheetId);
  setActiveSheet(workbook, command.activeSheetId);
  return {
    type: "addSheet",
    sheet,
    index,
    activeSheetId: previousActiveSheetId,
  };
}

function applyRenameSheetCommand(
  workbook: Workbook,
  command: RenameSheetCommand,
): WorkbookCommand | null {
  const sheet = workbook.sheets.get(command.sheetId);
  if (!sheet) {
    throw new Error(`Sheet ${command.sheetId} does not exist.`);
  }
  const previousName = sheet.name;
  return renameSheet(workbook, command.sheetId, command.name)
    ? createRenameSheetCommand(command.sheetId, previousName)
    : null;
}

function createReplaceSheetSparseStateCommand(
  sheetId: string,
  state: SheetSparseState,
): ReplaceSheetSparseStateCommand {
  return {
    type: "replaceSheetSparseState",
    sheetId,
    state: {
      cells: state.cells.map((cell) => ({
        address: { ...cell.address },
        ...(cell.value === undefined ? {} : { value: cell.value }),
        ...(cell.style ? { style: cloneCellStyle(cell.style) } : {}),
      })),
      rowHeights: state.rowHeights.map((dimension) => ({ ...dimension })),
      columnWidths: state.columnWidths.map((dimension) => ({ ...dimension })),
    },
  };
}

function assertSheetAxisRange(axis: SheetDimensionAxis, index: number, count: number): number {
  if (axis !== "row" && axis !== "column") {
    throw new RangeError(`Unknown sheet dimension axis ${axis}.`);
  }
  const maximum = axis === "row" ? MAX_SHEET_ROWS : MAX_SHEET_COLUMNS;
  if (!Number.isInteger(index) || index < 0 || index >= maximum) {
    throw new RangeError(
      `${axis === "row" ? "Row" : "Column"} index ${index} is outside the sheet.`,
    );
  }
  if (!Number.isInteger(count) || count <= 0 || count > maximum - index) {
    throw new RangeError(`Cannot change ${count} ${axis}s starting at index ${index}.`);
  }
  return maximum;
}

function transformAxisIndex(
  value: number,
  index: number,
  count: number,
  maximum: number,
  operation: "insert" | "delete",
): number | null {
  if (operation === "insert") {
    if (value >= maximum - count) {
      return null;
    }
    return value >= index ? value + count : value;
  }
  if (value >= index && value < index + count) {
    return null;
  }
  return value >= index + count ? value - count : value;
}

function transformSheetSparseState(
  state: SheetSparseState,
  axis: SheetDimensionAxis,
  index: number,
  count: number,
  maximum: number,
  operation: "insert" | "delete",
): SheetSparseState {
  const cells = state.cells.flatMap((cell) => {
    const sourceIndex = axis === "row" ? cell.address.row : cell.address.column;
    const targetIndex = transformAxisIndex(sourceIndex, index, count, maximum, operation);
    if (targetIndex === null) {
      return [];
    }
    return [
      {
        address:
          axis === "row"
            ? { row: targetIndex, column: cell.address.column }
            : { row: cell.address.row, column: targetIndex },
        ...(cell.value === undefined ? {} : { value: cell.value }),
        ...(cell.style ? { style: cloneCellStyle(cell.style) } : {}),
      },
    ];
  });
  const transformDimensions = (dimensions: SheetSparseState["rowHeights"]) =>
    dimensions.flatMap((dimension) => {
      const targetIndex = transformAxisIndex(dimension.index, index, count, maximum, operation);
      return targetIndex === null ? [] : [{ index: targetIndex, size: dimension.size }];
    });

  return {
    cells,
    rowHeights:
      axis === "row"
        ? transformDimensions(state.rowHeights)
        : state.rowHeights.map((item) => ({ ...item })),
    columnWidths:
      axis === "column"
        ? transformDimensions(state.columnWidths)
        : state.columnWidths.map((item) => ({ ...item })),
  };
}

function applyReplaceSheetSparseStateCommand(
  workbook: Workbook,
  command: ReplaceSheetSparseStateCommand,
): WorkbookCommand | null {
  const sheet = workbook.sheets.get(command.sheetId);
  if (!sheet) {
    throw new Error(`Sheet ${command.sheetId} does not exist.`);
  }
  const previousState = createSheetSparseState(sheet);
  return replaceSheetSparseState(sheet, command.state)
    ? createReplaceSheetSparseStateCommand(command.sheetId, previousState)
    : null;
}

function applySheetAxisCommand(
  workbook: Workbook,
  command: InsertSheetAxisCommand | DeleteSheetAxisCommand,
): WorkbookCommand | null {
  const maximum = assertSheetAxisRange(command.axis, command.index, command.count);
  const sheet = workbook.sheets.get(command.sheetId);
  if (!sheet) {
    throw new Error(`Sheet ${command.sheetId} does not exist.`);
  }
  const previousState = createSheetSparseState(sheet);
  const nextState = transformSheetSparseState(
    previousState,
    command.axis,
    command.index,
    command.count,
    maximum,
    command.type === "insertSheetAxis" ? "insert" : "delete",
  );
  return replaceSheetSparseState(sheet, nextState)
    ? createReplaceSheetSparseStateCommand(command.sheetId, previousState)
    : null;
}

export function applyWorkbookCommand(
  workbook: Workbook,
  command: WorkbookCommand,
): WorkbookCommand | null {
  if (command.type === "clearCellRange") {
    return applyClearCellRangeCommand(workbook, command);
  }
  if (command.type === "applyCellStyle") {
    return applyCellStyleCommand(workbook, command);
  }
  if (command.type === "applyCellBorders") {
    return applyCellBordersCommand(workbook, command);
  }
  if (command.type === "restoreCellStyles") {
    return applyRestoreCellStylesCommand(workbook, command);
  }
  if (command.type === "resizeSheetDimension") {
    return applyResizeSheetDimensionCommand(workbook, command);
  }
  if (command.type === "addSheet") {
    return applyAddSheetCommand(workbook, command);
  }
  if (command.type === "deleteSheet") {
    return applyDeleteSheetCommand(workbook, command);
  }
  if (command.type === "renameSheet") {
    return applyRenameSheetCommand(workbook, command);
  }
  if (command.type === "insertSheetAxis" || command.type === "deleteSheetAxis") {
    return applySheetAxisCommand(workbook, command);
  }
  if (command.type === "replaceSheetSparseState") {
    return applyReplaceSheetSparseStateCommand(workbook, command);
  }
  return applySetCellValuesCommand(workbook, command);
}
