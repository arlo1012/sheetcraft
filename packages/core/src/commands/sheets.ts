import { WorkbookDomainError, toWorkbookErrorData, toWorkbookErrorDetail } from "../errors.js";
import type { IdFactory } from "../runtime.js";
import { deserializeSheet, serializeSheet } from "../serialization.js";
import {
  renameQualifiedReferencesForSheet,
  rewriteQualifiedReferencesForSheet,
} from "../formula/workbook-references.js";
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
  SetSheetPropertiesCommand,
} from "./contracts.js";
import { invalidCommandPayload } from "./helpers.js";

function sheetNotFound(sheetId: unknown): WorkbookDomainError {
  return new WorkbookDomainError(
    {
      code: "sheet_not_found",
      details: { sheetId: toWorkbookErrorDetail(sheetId) },
    },
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

function normalizeSheetProperties(
  properties: import("../workbook.js").SheetProperties,
): import("../workbook.js").SheetProperties {
  const tabColor = properties.tabColor;
  if (
    tabColor !== undefined &&
    (typeof tabColor !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(tabColor))
  ) {
    throw invalidCommandPayload("properties.tabColor", tabColor);
  }
  for (const key of ["pinned", "hidden", "protected"] as const) {
    if (typeof properties[key] !== "boolean")
      throw invalidCommandPayload(`properties.${key}`, properties[key]);
  }
  return {
    ...(tabColor === undefined ? {} : { tabColor: tabColor.toUpperCase() }),
    pinned: properties.pinned,
    hidden: properties.hidden,
    protected: properties.protected,
  };
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
  options?: {
    id?: string;
    name?: string;
    index?: number;
    idFactory?: IdFactory;
  },
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
  sheet.properties = {
    ...(source.properties.tabColor === undefined ? {} : { tabColor: source.properties.tabColor }),
    pinned: false,
    hidden: false,
    protected: false,
  };

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
  if (
    getWorkbookSheets(workbook).filter((sheet) => !sheet.properties.hidden).length <=
    (workbook.sheets.get(sheetId)?.properties.hidden ? 0 : 1)
  ) {
    throw new WorkbookDomainError(
      {
        code: "last_sheet_removal",
        details: { sheetId: toWorkbookErrorDetail(sheetId) },
      },
      "A workbook must contain at least one sheet.",
    );
  }
  const sheets = getWorkbookSheets(workbook);
  const activeSheetId =
    workbook.activeSheetId === sheetId
      ? sheets
          .slice(index + 1)
          .concat(sheets.slice(0, index))
          .find((sheet) => !sheet.properties.hidden)?.id
      : workbook.activeSheetId;
  if (!activeSheetId) {
    throw new WorkbookDomainError(
      {
        code: "workbook_operation_failed",
        details: { reason: "No remaining active sheet." },
      },
      "Unable to select a sheet after deletion.",
    );
  }
  return { type: "deleteSheet", sheetId, activeSheetId };
}

export function createSetSheetPropertiesCommand(
  workbook: Workbook,
  sheetId: string,
  patch: Partial<import("../workbook.js").SheetProperties>,
): SetSheetPropertiesCommand {
  const sheet = workbook.sheets.get(sheetId);
  if (!sheet) throw sheetNotFound(sheetId);
  const properties = normalizeSheetProperties({ ...sheet.properties, ...patch });
  if (
    properties.hidden &&
    !sheet.properties.hidden &&
    getWorkbookSheets(workbook).every((item) => item.id === sheetId || item.properties.hidden)
  )
    throw new WorkbookDomainError(
      { code: "last_visible_sheet", details: { sheetId } },
      "A workbook must contain a visible sheet.",
    );
  return { type: "setSheetProperties", sheetId, properties };
}

export function createRenameSheetCommand(sheetId: string, name: string): RenameSheetCommand {
  return {
    type: "renameSheet",
    sheetId,
    name: normalizeCommandSheetName(name),
  };
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
  const activeSheet =
    command.activeSheetId === sheet.id ? sheet : workbook.sheets.get(command.activeSheetId);
  if (!activeSheet) throw sheetNotFound(command.activeSheetId);
  if (activeSheet.properties.hidden)
    throw invalidCommandPayload("activeSheetId", command.activeSheetId);
  const previousActiveSheetId = workbook.activeSheetId;
  insertSheet(workbook, sheet, command.index);
  workbook.activeSheetId = command.activeSheetId;
  for (const definition of command.definedNames ?? []) {
    workbook.definedNames.set(definition.id, {
      ...definition,
      reference: { sheetId: definition.reference.sheetId, start: { ...definition.reference.start }, end: { ...definition.reference.end } },
    });
  }
  for (const formula of command.formulaSources ?? []) {
    const target = workbook.sheets.get(formula.sheetId);
    const cell = target?.cells.get(`${formula.address.row}:${formula.address.column}`);
    if (target && cell?.content?.kind === "formula") {
      target.cells.set(`${formula.address.row}:${formula.address.column}`, {
        ...cell,
        content: { kind: "formula", formula: { source: formula.source } },
      });
    }
  }
  return {
    type: "deleteSheet",
    sheetId: sheet.id,
    activeSheetId: previousActiveSheetId,
  };
}

export function applyDeleteSheetCommand(
  workbook: Workbook,
  command: DeleteSheetCommand,
): AddSheetCommand {
  if (!workbook.sheets.has(command.sheetId)) {
    throw sheetNotFound(command.sheetId);
  }
  if (
    getWorkbookSheets(workbook).filter((sheet) => !sheet.properties.hidden).length <=
    (workbook.sheets.get(command.sheetId)?.properties.hidden ? 0 : 1)
  ) {
    throw new WorkbookDomainError(
      {
        code: "last_sheet_removal",
        details: { sheetId: toWorkbookErrorDetail(command.sheetId) },
      },
      "A workbook must contain at least one sheet.",
    );
  }
  if (command.activeSheetId === command.sheetId) {
    throw invalidCommandPayload("activeSheetId", command.activeSheetId);
  }
  const nextActiveSheet = workbook.sheets.get(command.activeSheetId);
  if (!nextActiveSheet) throw sheetNotFound(command.activeSheetId);
  if (nextActiveSheet.properties.hidden)
    throw invalidCommandPayload("activeSheetId", command.activeSheetId);
  const previousActiveSheetId = workbook.activeSheetId;
  const definedNames = [...workbook.definedNames.values()]
    .filter((definition) => definition.scopeSheetId === command.sheetId || definition.reference.sheetId === command.sheetId)
    .map((definition) => ({ ...definition, reference: { sheetId: definition.reference.sheetId, start: { ...definition.reference.start }, end: { ...definition.reference.end } } }));
  const formulaSources = [...workbook.sheets.values()].flatMap((sourceSheet) =>
    [...sourceSheet.cells.entries()].flatMap(([key, cell]) => {
      if (sourceSheet.id === command.sheetId || cell.content?.kind !== "formula") return [];
      const [rawRow, rawColumn] = key.split(":");
      const row = Number(rawRow);
      const column = Number(rawColumn);
      return Number.isInteger(row) && Number.isInteger(column)
        ? [{ sheetId: sourceSheet.id, address: { row, column }, source: cell.content.formula.source }]
        : [];
    }),
  );
  rewriteQualifiedReferencesForSheet(workbook, command.sheetId, null);
  for (const definition of definedNames) workbook.definedNames.delete(definition.id);
  const { sheet, index } = removeSheet(workbook, command.sheetId);
  setActiveSheet(workbook, command.activeSheetId);
  return {
    type: "addSheet",
    sheet: serializeSheet(sheet),
    index,
    activeSheetId: previousActiveSheetId,
    formulaSources,
    definedNames,
  };
}

export function applySetSheetPropertiesCommand(
  workbook: Workbook,
  command: SetSheetPropertiesCommand,
): SetSheetPropertiesCommand | null {
  const sheet = workbook.sheets.get(command.sheetId);
  if (!sheet) throw sheetNotFound(command.sheetId);
  const next = normalizeSheetProperties(command.properties);
  if (
    next.hidden &&
    !sheet.properties.hidden &&
    getWorkbookSheets(workbook).every((item) => item.id === sheet.id || item.properties.hidden)
  ) {
    throw new WorkbookDomainError(
      { code: "last_visible_sheet", details: { sheetId: sheet.id } },
      "A workbook must contain a visible sheet.",
    );
  }
  const previous = { ...sheet.properties };
  const previousActiveSheetId = workbook.activeSheetId;
  let nextActiveSheetId = command.activeSheetId;
  if (nextActiveSheetId !== undefined) {
    const requestedActive =
      nextActiveSheetId === sheet.id
        ? { ...sheet, properties: next }
        : workbook.sheets.get(nextActiveSheetId);
    if (!requestedActive) throw sheetNotFound(nextActiveSheetId);
    if (requestedActive.properties.hidden)
      throw invalidCommandPayload("activeSheetId", nextActiveSheetId);
  } else if (next.hidden && workbook.activeSheetId === sheet.id) {
    const sheets = getWorkbookSheets(workbook);
    const index = sheets.indexOf(sheet);
    nextActiveSheetId = sheets
      .slice(index + 1)
      .concat(sheets.slice(0, index))
      .find((item) => !item.properties.hidden)?.id;
    if (!nextActiveSheetId)
      throw new WorkbookDomainError(
        { code: "last_visible_sheet", details: { sheetId: sheet.id } },
        "A workbook must contain a visible sheet.",
      );
  }
  if (JSON.stringify(previous) === JSON.stringify(next) && nextActiveSheetId === undefined)
    return null;
  sheet.properties = { ...next };
  if (nextActiveSheetId !== undefined) workbook.activeSheetId = nextActiveSheetId;
  return {
    type: "setSheetProperties",
    sheetId: sheet.id,
    properties: previous,
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
  const changed = renameSheet(workbook, command.sheetId, name);
  if (changed) renameQualifiedReferencesForSheet(workbook, previousName, name);
  return changed
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
