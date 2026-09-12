import { normalizeExcelDateSystem, type ExcelDateSystem } from "../formula/date-system.js";
import {
  normalizeWorkbookCalculationSettings,
  type WorkbookCalculationSettings,
} from "../calculation.js";
import type { Workbook } from "../workbook.js";
import type { SetWorkbookDateSystemCommand, SetWorkbookCalculationCommand } from "./contracts.js";
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

export function createSetWorkbookCalculationCommand(
  workbook: Workbook,
  settings: Partial<WorkbookCalculationSettings>,
): SetWorkbookCalculationCommand {
  return {
    type: "setWorkbookCalculation",
    calculation: validateCommandPayload("calculation", settings, () =>
      normalizeWorkbookCalculationSettings({ ...workbook.calculation, ...settings }),
    ),
  };
}

export function applySetWorkbookCalculationCommand(
  workbook: Workbook,
  command: SetWorkbookCalculationCommand,
): SetWorkbookCalculationCommand | null {
  const next = validateCommandPayload("calculation", command.calculation, () =>
    normalizeWorkbookCalculationSettings(command.calculation),
  );
  const previous = workbook.calculation;
  if (
    previous.mode === next.mode &&
    previous.iterative === next.iterative &&
    previous.maxIterations === next.maxIterations &&
    previous.maxChange === next.maxChange
  )
    return null;
  workbook.calculation = next;
  return { type: "setWorkbookCalculation", calculation: { ...previous } };
}
