import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  createSheet,
  getColumnWidth,
  getCellValue,
  getNextSheetName,
  getSheetIndex,
  getRowHeight,
  insertSheet,
  isCellAddressInBounds,
  removeSheet,
  renameSheet,
  setColumnWidth,
  setCellValue,
  setActiveSheet,
  setRowHeight,
  type CellAddress,
  type CellRange,
  type CellValue,
  type SheetDimensionAxis,
  type Sheet,
  type Workbook,
} from "./workbook";
import { getCellMatrixSize } from "./clipboard";

export type CellValueChange = {
  sheetId: string;
  address: CellAddress;
  value: CellValue;
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

export type WorkbookCommand =
  | SetCellValuesCommand
  | ClearCellRangeCommand
  | ResizeSheetDimensionCommand
  | AddSheetCommand
  | DeleteSheetCommand
  | RenameSheetCommand;

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

export function createPasteCellValuesCommand(
  sheetId: string,
  anchor: CellAddress,
  values: readonly (readonly CellValue[])[],
  options?: { clearRange?: CellRange },
): SetCellValuesCommand {
  const size = getCellMatrixSize(values);
  const end = {
    row: anchor.row + size.rowCount - 1,
    column: anchor.column + size.columnCount - 1,
  };
  assertCellAddress(anchor);
  assertCellAddress(end);

  const changes = new Map<string, CellValueChange>();
  const setChange = (address: CellAddress, value: CellValue) => {
    changes.set(`${address.row}:${address.column}`, {
      sheetId,
      address,
      value,
    });
  };

  if (options?.clearRange) {
    const clearRange = normalizeRange(options.clearRange);
    assertCellAddress(clearRange.start);
    assertCellAddress(clearRange.end);
    for (let row = clearRange.start.row; row <= clearRange.end.row; row += 1) {
      for (let column = clearRange.start.column; column <= clearRange.end.column; column += 1) {
        setChange({ row, column }, null);
      }
    }
  }

  for (let row = 0; row < size.rowCount; row += 1) {
    for (let column = 0; column < size.columnCount; column += 1) {
      setChange(
        { row: anchor.row + row, column: anchor.column + column },
        values[row]?.[column] ?? null,
      );
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
    if (!setCellValue(sheet, change.address, change.value)) {
      continue;
    }

    reverseChanges.unshift({
      sheetId: change.sheetId,
      address: { ...change.address },
      value: previousValue,
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

    reverseChanges.push({
      sheetId: command.sheetId,
      address,
      value: cell.value,
    });
    setCellValue(sheet, address, null);
  }

  return reverseChanges.length > 0 ? createBatchSetCellValuesCommand(reverseChanges) : null;
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

export function applyWorkbookCommand(
  workbook: Workbook,
  command: WorkbookCommand,
): WorkbookCommand | null {
  if (command.type === "clearCellRange") {
    return applyClearCellRangeCommand(workbook, command);
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
  return applySetCellValuesCommand(workbook, command);
}
