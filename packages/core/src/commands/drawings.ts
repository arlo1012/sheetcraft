import { normalizeSheetDrawings, type SheetDrawing } from "../sheet-drawings.js";
import type { Workbook } from "../workbook.js";
import type { SetSheetDrawingsCommand } from "./contracts.js";
import { getSheetOrThrow, validateCommandPayload } from "./helpers.js";
export function createSetSheetDrawingsCommand(
  sheetId: string,
  drawings: readonly SheetDrawing[],
): SetSheetDrawingsCommand {
  return {
    type: "setSheetDrawings",
    sheetId,
    drawings: validateCommandPayload("drawings", drawings, () => normalizeSheetDrawings(drawings)),
  };
}
export function applySetSheetDrawingsCommand(
  workbook: Workbook,
  command: SetSheetDrawingsCommand,
): SetSheetDrawingsCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const next = createSetSheetDrawingsCommand(command.sheetId, command.drawings);
  if (JSON.stringify(sheet.drawings ?? []) === JSON.stringify(next.drawings)) return null;
  const inverse = createSetSheetDrawingsCommand(command.sheetId, sheet.drawings ?? []);
  sheet.drawings = next.drawings;
  return inverse;
}
