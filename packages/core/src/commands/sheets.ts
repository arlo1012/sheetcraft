import { WorkbookDomainError, toWorkbookErrorData, toWorkbookErrorDetail } from "../errors.js";
import type { IdFactory } from "../runtime.js";
import { deserializeSheet, serializeSheet } from "../serialization.js";
import {
  createSheet,
  getNextDuplicateSheetName,
  getNextSheetName,
  getSheetIndex,
  getWorkbookSheets,
  insertSheet,
  moveSheet,
  removeSheet,
  renameSheet,
  setActiveSheet,
  type Workbook,
} from "../workbook.js";
import type {
  AddSheetCommand,
  DeleteSheetCommand,
  MoveSheetCommand,
  RenameSheetCommand,
} from "./contracts.js";
import { invalidCommandPayload } from "./helpers.js";

function sheetNotFound(sheetId: unknown): WorkbookDomainError {
  return new WorkbookDomainError(
    { code: "sheet_not_found", details: { sheetId: toWorkbookErrorDetail(sheetId) } },
    `Sheet ${String(sheetId)} does not exist.`,
  );
}

function assertSheetNameAvailable(workbook: Workbook, name: string, exceptSheetId?: string): void {
  const conflictingSheet = getWorkbookSheets(workbook).find(
    (sheet) => sheet.id !== exceptSheetId && sheet.name.toLowerCase() === name.toLowerCase(),
  );
  if (conflictingSheet) {
    throw new WorkbookDomainError(
      { code: "sheet_name_conflict", details: { name } },
      `A sheet named ${name} already exists.`,
    );
  }
}

function normalizeCommandSheetName(name: unknown): string {
  if (typeof name !== "string") {
    throw invalidCommandPayload("name", name);
  }
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw invalidCommandPayload("name", name);
  }
  return normalizedName;
}

function resolveSheetId(
  workbook: Workbook,
  options: { id?: string; idFactory?: IdFactory } | undefined,
): string {
  if (options?.id !== undefined && (typeof options.id !== "string" || !options.id.trim())) {
    throw invalidCommandPayload("id", options.id);
  }
  let sheetId = options?.id;
  if (sheetId === undefined) {
    if (typeof options?.idFactory !== "function") {
      throw invalidCommandPayload("idFactory", options?.idFactory);
    }
    try {
      sheetId = options.idFactory("sheet");
    } catch (error) {
      throw new WorkbookDomainError(
        toWorkbookErrorData(error),
        error instanceof Error ? error.message : undefined,
      );
    }
    if (typeof sheetId !== "string" || !sheetId.trim()) {
      throw invalidCommandPayload("idFactory", sheetId);
    }
  }
  if (workbook.sheets.has(sheetId)) {
    throw invalidCommandPayload("sheet.id", sheetId);
  }
  return sheetId;
}

export function createAddSheetCommand(
  workbook: Workbook,
  options?: { id?: string; name?: string; index?: number; idFactory?: IdFactory },
): AddSheetCommand {
  const name =
    options?.name === undefined
      ? getNextSheetName(workbook)
      : normalizeCommandSheetName(options.name);
  assertSheetNameAvailable(workbook, name);
  const index = options?.index ?? workbook.sheets.size;
  if (!Number.isInteger(index) || index < 0 || index > workbook.sheets.size) {
    throw invalidCommandPayload("index", index);
  }
  const sheetId = resolveSheetId(workbook, options);
  const sheet = createSheet(name, sheetId);
  return {
    type: "addSheet",
    sheet: serializeSheet(sheet),
    index,
    activeSheetId: sheet.id,
  };
}

export function createDuplicateSheetCommand(
  workbook: Workbook,
  sourceSheetId: string,
  options?: { id?: string; name?: string; idFactory?: IdFactory },
): AddSheetCommand {
  const source = workbook.sheets.get(sourceSheetId);
  if (!source) throw sheetNotFound(sourceSheetId);

  const name =
    options?.name === undefined
      ? getNextDuplicateSheetName(workbook, source.name)
      : normalizeCommandSheetName(options.name);
  assertSheetNameAvailable(workbook, name);
  const sheetId = resolveSheetId(workbook, options);
  const sheet = serializeSheet(source);
  sheet.id = sheetId;
  sheet.name = name;

  return {
    type: "addSheet",
    sheet,
    index: getSheetIndex(workbook, sourceSheetId) + 1,
    activeSheetId: sheetId,
  };
}

export function createDeleteSheetCommand(workbook: Workbook, sheetId: string): DeleteSheetCommand {
  const index = getSheetIndex(workbook, sheetId);
  if (index < 0) throw sheetNotFound(sheetId);
  if (workbook.sheets.size <= 1) {
    throw new WorkbookDomainError(
      { code: "last_sheet_removal", details: { sheetId: toWorkbookErrorDetail(sheetId) } },
      "A workbook must contain at least one sheet.",
    );
  }
  const sheets = getWorkbookSheets(workbook);
  const activeSheetId =
    workbook.activeSheetId === sheetId
      ? (sheets[index + 1] ?? sheets[index - 1])?.id
      : workbook.activeSheetId;
  if (!activeSheetId) {
    throw new WorkbookDomainError(
      { code: "workbook_operation_failed", details: { reason: "No remaining active sheet." } },
      "Unable to select a sheet after deletion.",
    );
  }
  return { type: "deleteSheet", sheetId, activeSheetId };
}

export function createRenameSheetCommand(sheetId: string, name: string): RenameSheetCommand {
  return { type: "renameSheet", sheetId, name: normalizeCommandSheetName(name) };
}

export function createMoveSheetCommand(
  workbook: Workbook,
  sheetId: string,
  toIndex: number,
): MoveSheetCommand {
  if (getSheetIndex(workbook, sheetId) < 0) throw sheetNotFound(sheetId);
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= workbook.sheets.size) {
    throw invalidCommandPayload("toIndex", toIndex);
  }
  return { type: "moveSheet", sheetId, toIndex };
}

export function applyAddSheetCommand(
  workbook: Workbook,
  command: AddSheetCommand,
): DeleteSheetCommand {
  const sheet = deserializeSheet(command.sheet);
  if (workbook.sheets.has(sheet.id)) {
    throw invalidCommandPayload("sheet.id", sheet.id);
  }
  assertSheetNameAvailable(workbook, sheet.name);
  if (
    !Number.isInteger(command.index) ||
    command.index < 0 ||
    command.index > workbook.sheets.size
  ) {
    throw invalidCommandPayload("index", command.index);
  }
  if (command.activeSheetId !== sheet.id && !workbook.sheets.has(command.activeSheetId)) {
    throw sheetNotFound(command.activeSheetId);
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
  if (!workbook.sheets.has(command.sheetId)) {
    throw sheetNotFound(command.sheetId);
  }
  if (workbook.sheets.size <= 1) {
    throw new WorkbookDomainError(
      { code: "last_sheet_removal", details: { sheetId: toWorkbookErrorDetail(command.sheetId) } },
      "A workbook must contain at least one sheet.",
    );
  }
  if (command.activeSheetId === command.sheetId) {
    throw invalidCommandPayload("activeSheetId", command.activeSheetId);
  }
  if (!workbook.sheets.has(command.activeSheetId)) {
    throw sheetNotFound(command.activeSheetId);
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
  if (!sheet) throw sheetNotFound(command.sheetId);
  const name = normalizeCommandSheetName(command.name);
  assertSheetNameAvailable(workbook, name, command.sheetId);
  const previousName = sheet.name;
  return renameSheet(workbook, command.sheetId, name)
    ? createRenameSheetCommand(command.sheetId, previousName)
    : null;
}

export function applyMoveSheetCommand(
  workbook: Workbook,
  command: MoveSheetCommand,
): MoveSheetCommand | null {
  const previousIndex = getSheetIndex(workbook, command.sheetId);
  if (previousIndex < 0) throw sheetNotFound(command.sheetId);
  if (
    !Number.isInteger(command.toIndex) ||
    command.toIndex < 0 ||
    command.toIndex >= workbook.sheets.size
  ) {
    throw invalidCommandPayload("toIndex", command.toIndex);
  }
  return moveSheet(workbook, command.sheetId, command.toIndex)
    ? { type: "moveSheet", sheetId: command.sheetId, toIndex: previousIndex }
    : null;
}
