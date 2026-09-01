import { deserializeSheet, serializeSheet } from "../serialization.js";
import type { IdFactory } from "../runtime.js";
import {
  createSheet,
  getNextSheetName,
  getSheetIndex,
  getWorkbookSheets,
  insertSheet,
  removeSheet,
  renameSheet,
  setActiveSheet,
  type Workbook,
} from "../workbook.js";
import type { AddSheetCommand, DeleteSheetCommand, RenameSheetCommand } from "./contracts.js";

export function createAddSheetCommand(
  workbook: Workbook,
  options?: { id?: string; name?: string; index?: number; idFactory?: IdFactory },
): AddSheetCommand {
  const sheet = createSheet(
    options?.name ?? getNextSheetName(workbook),
    options?.id,
    options?.idFactory,
  );
  return {
    type: "addSheet",
    sheet: serializeSheet(sheet),
    index: options?.index ?? workbook.sheets.size,
    activeSheetId: sheet.id,
  };
}

export function createDeleteSheetCommand(workbook: Workbook, sheetId: string): DeleteSheetCommand {
  const index = getSheetIndex(workbook, sheetId);
  if (index < 0) throw new Error(`Sheet ${sheetId} does not exist.`);
  if (workbook.sheets.size <= 1) throw new Error("A workbook must contain at least one sheet.");
  const sheets = getWorkbookSheets(workbook);
  const activeSheetId =
    workbook.activeSheetId === sheetId
      ? (sheets[index + 1] ?? sheets[index - 1])?.id
      : workbook.activeSheetId;
  if (!activeSheetId) throw new Error("Unable to select a sheet after deletion.");
  return { type: "deleteSheet", sheetId, activeSheetId };
}

export function createRenameSheetCommand(sheetId: string, name: string): RenameSheetCommand {
  return { type: "renameSheet", sheetId, name };
}

export function applyAddSheetCommand(
  workbook: Workbook,
  command: AddSheetCommand,
): DeleteSheetCommand {
  const sheet = deserializeSheet(command.sheet);
  if (command.activeSheetId !== sheet.id && !workbook.sheets.has(command.activeSheetId)) {
    throw new Error(`Sheet ${command.activeSheetId} does not exist.`);
  }
  const previousActiveSheetId = workbook.activeSheetId;
  insertSheet(workbook, sheet, command.index);
  setActiveSheet(workbook, command.activeSheetId);
  return { type: "deleteSheet", sheetId: sheet.id, activeSheetId: previousActiveSheetId };
}

export function applyDeleteSheetCommand(
  workbook: Workbook,
  command: DeleteSheetCommand,
): AddSheetCommand {
  if (command.activeSheetId === command.sheetId || !workbook.sheets.has(command.activeSheetId)) {
    throw new Error(`Sheet ${command.activeSheetId} does not exist after deletion.`);
  }
  const previousActiveSheetId = workbook.activeSheetId;
  const { sheet, index } = removeSheet(workbook, command.sheetId);
  setActiveSheet(workbook, command.activeSheetId);
  return {
    type: "addSheet",
    sheet: serializeSheet(sheet),
    index,
    activeSheetId: previousActiveSheetId,
  };
}

export function applyRenameSheetCommand(
  workbook: Workbook,
  command: RenameSheetCommand,
): RenameSheetCommand | null {
  const sheet = workbook.sheets.get(command.sheetId);
  if (!sheet) throw new Error(`Sheet ${command.sheetId} does not exist.`);
  const previousName = sheet.name;
  return renameSheet(workbook, command.sheetId, command.name)
    ? createRenameSheetCommand(command.sheetId, previousName)
    : null;
}
