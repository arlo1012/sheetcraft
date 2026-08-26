import {
  getCellValue,
  isCellAddressInBounds,
  setCellValue,
  type CellAddress,
  type CellValue,
  type Workbook,
} from "./workbook";

export type CellValueChange = {
  sheetId: string;
  address: CellAddress;
  value: CellValue;
};

export type SetCellValuesCommand = {
  type: "setCellValues";
  changes: CellValueChange[];
};

export type WorkbookCommand = SetCellValuesCommand;

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

export function applyWorkbookCommand(
  workbook: Workbook,
  command: WorkbookCommand,
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
