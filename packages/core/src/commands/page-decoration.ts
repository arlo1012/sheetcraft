import {
  cloneSheetPageDecoration,
  normalizeSheetPageDecoration,
  type SheetPageDecoration,
} from "../page-decoration.js";
import type { Workbook } from "../workbook.js";
import type { SetSheetPageDecorationCommand } from "./contracts.js";
import { getSheetOrThrow, validateCommandPayload } from "./helpers.js";

export function createSetSheetPageDecorationCommand(
  sheetId: string,
  decoration: SheetPageDecoration,
): SetSheetPageDecorationCommand {
  return {
    type: "setSheetPageDecoration",
    sheetId,
    decoration: validateCommandPayload("decoration", decoration, () =>
      normalizeSheetPageDecoration(decoration),
    ),
  };
}

export function applySetSheetPageDecorationCommand(
  workbook: Workbook,
  command: SetSheetPageDecorationCommand,
): SetSheetPageDecorationCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const decoration = validateCommandPayload("decoration", command.decoration, () =>
    normalizeSheetPageDecoration(command.decoration),
  );
  const previous = cloneSheetPageDecoration(sheet.pageDecoration);
  if (JSON.stringify(previous) === JSON.stringify(decoration)) return null;
  sheet.pageDecoration = cloneSheetPageDecoration(decoration);
  return createSetSheetPageDecorationCommand(command.sheetId, previous);
}
