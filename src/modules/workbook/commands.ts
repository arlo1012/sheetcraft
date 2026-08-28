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
): SetCellValuesCommand {
  return {
    type: "setCellValues",
    changes: changes.map((change) => ({
      ...change,
      address: { ...change.address },
      ...("style" in change ? { style: cloneCellStyle(change.style ?? undefined) ?? null } : {}),
    })),
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

  return createBatchSetCellValuesCommand([...changes.values()]);
}

function applySetCellValuesCommand(
  workbook: Workbook,
  command: SetCellValuesCommand,
): WorkbookCommand | null {
  const reverseChanges: CellValueChange[] = [];

  for (const change of command.changes) {
    assertCellAddress(change.address);
    if (!workbook.sheets.has(change.sheetId)) {
      throw new Error(`Sheet ${change.sheetId} does not exist.`);
    }
  }

  for (const change of command.changes) {
    const sheet = workbook.sheets.get(change.sheetId);
    if (!sheet) {
      throw new Error(`Sheet ${change.sheetId} disappeared while applying the command.`);
    }

    const previousValue = getCellValue(sheet, change.address);
    const previousStyle = cloneCellStyle(
      getCellStyle(sheet, change.address) as CellStyle | undefined,
    );
    const valueChanged = setCellValue(sheet, change.address, change.value);
    const styleChanged =
      "style" in change ? setCellStyle(sheet, change.address, change.style) : false;
    if (!valueChanged && !styleChanged) {
      continue;
    }

    reverseChanges.unshift({
      sheetId: change.sheetId,
      address: { ...change.address },
      value: previousValue,
      ...("style" in change ? { style: previousStyle ?? null } : {}),
    });
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
  const reverseChanges: RestoreCellStylesCommand["changes"] = [];
  for (let row = command.range.start.row; row <= command.range.end.row; row += 1) {
    for (let column = command.range.start.column; column <= command.range.end.column; column += 1) {
      const address = { row, column };
      const previousStyle = cloneCellStyle(getCellStyle(sheet, address) as CellStyle | undefined);
      const nextStyle = mergeCellStyle(previousStyle, command.patch);
      if (!setCellStyle(sheet, address, nextStyle)) {
        continue;
      }
      reverseChanges.push({ address, style: previousStyle ?? null });
    }
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
