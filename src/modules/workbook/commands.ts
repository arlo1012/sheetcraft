import {
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  getCellValue,
  isCellAddressInBounds,
  setCellValue,
  type CellAddress,
  type CellRange,
  type CellValue,
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

export type WorkbookCommand = SetCellValuesCommand | ClearCellRangeCommand;

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

export function applyWorkbookCommand(
  workbook: Workbook,
  command: WorkbookCommand,
): WorkbookCommand | null {
  return command.type === "clearCellRange"
    ? applyClearCellRangeCommand(workbook, command)
    : applySetCellValuesCommand(workbook, command);
}
