import { normalizeExcelDateSystem, type ExcelDateSystem } from "../formula/date-system.js";
import type { Workbook } from "../workbook.js";
import type { SetWorkbookDateSystemCommand } from "./contracts.js";
import { validateCommandPayload } from "./helpers.js";

/** Changes serial interpretation only, never rewrites numeric cells or formulas. */
export function createSetWorkbookDateSystemCommand(
  dateSystem: ExcelDateSystem,
): SetWorkbookDateSystemCommand {
  return {
    type: "setWorkbookDateSystem",
    dateSystem: validateCommandPayload("dateSystem", dateSystem, () =>
      normalizeExcelDateSystem(dateSystem),
    ),
  };
}

export function applySetWorkbookDateSystemCommand(
  workbook: Workbook,
  command: SetWorkbookDateSystemCommand,
): SetWorkbookDateSystemCommand | null {
  const dateSystem = createSetWorkbookDateSystemCommand(command.dateSystem).dateSystem;
  if (workbook.dateSystem === dateSystem) return null;
  const inverse = createSetWorkbookDateSystemCommand(workbook.dateSystem);
  workbook.dateSystem = dateSystem;
  return inverse;
}
