import { normalizeSheetDrawings } from "@sheetcraft/core/sheet-drawings";
import { deserializeSheet } from "@sheetcraft/core/serialization";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import type { SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Workbook } from "@sheetcraft/core/workbook";

/** Kept for old recovery diagnostics; canonical shapes now have live consumers. */
export class UnsupportedShapeFrameDocumentError extends Error {
  readonly code = "unsupported-shape-frame";
  constructor(
    readonly sheetId: string,
    readonly drawingIds: readonly string[],
  ) {
    super(
      `Canonical shape placement is not yet enabled for this consumer (sheet ${sheetId}, objects ${drawingIds.join(", ")}).`,
    );
    this.name = "UnsupportedShapeFrameDocumentError";
  }
}
function checkDrawings(sheetId: string, drawings: readonly SheetDrawing[] | undefined): void {
  void sheetId;
  normalizeSheetDrawings(drawings);
}
export function assertWorkbookShapeSupport(workbook: Workbook): void {
  for (const sheet of workbook.sheets.values()) checkDrawings(sheet.id, sheet.drawings);
}

function requireOwnDataRecord(value: object): void {
  for (const key of Reflect.ownKeys(value)) {
    if (!("value" in Object.getOwnPropertyDescriptor(value, key)!))
      throw new TypeError("Shape admission requires data payloads without accessors.");
  }
}
function checkState(sheetId: string, state: { drawings?: SheetDrawing[] }): void {
  requireOwnDataRecord(state);
  checkDrawings(sheetId, state.drawings);
}
function requireOwnDataArray<T extends object>(values: readonly T[]): void {
  if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype)
    throw new TypeError("Shape admission requires an ordinary dense data array.");
  requireOwnDataRecord(values);
  for (const key of Reflect.ownKeys(values)) {
    if (
      key !== "length" &&
      (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= values.length)
    )
      throw new TypeError("Command arrays cannot override traversal methods.");
  }
  for (let index = 0; index < values.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(values, String(index));
    if (!descriptor || !("value" in descriptor)) throw new TypeError("Sparse command payload.");
    requireOwnDataRecord(descriptor.value as object);
  }
}

/** Validate incoming data before mutations, history, or view consumers. */
export function assertShapeCommandSupport(command: WorkbookCommand): void {
  requireOwnDataRecord(command);
  const type = Object.getOwnPropertyDescriptor(command, "type");
  if (!type || !("value" in type)) throw new TypeError("Command type must be an own data field.");
  switch (command.type) {
    case "setSheetDrawings":
      checkDrawings(command.sheetId, command.drawings);
      break;
    case "addSheet": {
      requireOwnDataRecord(command.sheet);
      const sheet = deserializeSheet(command.sheet);
      checkDrawings(sheet.id, sheet.drawings);
      break;
    }
    case "restoreCellShift":
      checkState(command.sheetId, command.state);
      break;
    case "restoreSheetState":
      if ("state" in command) checkState(command.sheetId, command.state);
      else {
        requireOwnDataRecord(command.slice);
        checkState(command.sheetId, command.slice.metadata);
      }
      break;
    case "restoreTableTransaction":
      requireOwnDataArray(command.states);
      for (const state of command.states) checkState(state.sheetId, state.state);
      break;
    case "batchDeleteSheetAxes":
      requireOwnDataArray(command.commands);
      for (const nested of command.commands) assertShapeCommandSupport(nested);
      break;
  }
}
