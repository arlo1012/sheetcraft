import {
  cloneSheetPageSetup,
  normalizeSheetPageSetup,
  type SheetPageSetup,
} from "../page-setup.js";
import { createSheetSparseState, replaceSheetSparseState, type Workbook } from "../workbook.js";
import type { RestoreFullSheetStateCommand, SetSheetPageSetupCommand } from "./contracts.js";
import { getSheetOrThrow, validateCommandPayload } from "./helpers.js";

export function createSetSheetPageSetupCommand(
  sheetId: string,
  pageSetup: SheetPageSetup,
): SetSheetPageSetupCommand {
  return { type: "setSheetPageSetup", sheetId, pageSetup: cloneSheetPageSetup(pageSetup) };
}

export function applySetSheetPageSetupCommand(
  workbook: Workbook,
  command: SetSheetPageSetupCommand,
): RestoreFullSheetStateCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  const pageSetup = validateCommandPayload("pageSetup", command.pageSetup, () =>
    normalizeSheetPageSetup(command.pageSetup),
  );
  const previous = createSheetSparseState(sheet);
  return replaceSheetSparseState(sheet, { ...previous, pageSetup })
    ? { type: "restoreSheetState", sheetId: command.sheetId, state: previous }
    : null;
}
