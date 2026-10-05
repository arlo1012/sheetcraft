import { normalizeSheetProtection, type SheetProtection } from "../protection.js";
import type { Workbook } from "../workbook.js";
import type {
  SetSheetProtectionCommand,
  SetWorkbookStructureProtectionCommand,
} from "./contracts.js";
import { getSheetOrThrow, invalidCommandPayload, validateCommandPayload } from "./helpers.js";

export function createSetSheetProtectionCommand(
  sheetId: string,
  protectedSheet: boolean,
  protection?: SheetProtection,
): SetSheetProtectionCommand {
  if (typeof protectedSheet !== "boolean") throw invalidCommandPayload("protected", protectedSheet);
  return {
    type: "setSheetProtection",
    sheetId,
    protected: protectedSheet,
    protection: validateCommandPayload("protection", protection, () =>
      normalizeSheetProtection(protection),
    ),
  };
}
export function applySetSheetProtectionCommand(
  workbook: Workbook,
  command: SetSheetProtectionCommand,
): SetSheetProtectionCommand | null {
  const next = createSetSheetProtectionCommand(
    command.sheetId,
    command.protected,
    command.protection,
  );
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  if (
    sheet.properties.protected === next.protected &&
    JSON.stringify(sheet.protection) === JSON.stringify(next.protection)
  )
    return null;
  const inverse = createSetSheetProtectionCommand(
    sheet.id,
    sheet.properties.protected,
    sheet.protection,
  );
  sheet.properties.protected = next.protected;
  sheet.protection = next.protection;
  return inverse;
}
export function createSetWorkbookStructureProtectionCommand(
  protectedStructure: boolean,
): SetWorkbookStructureProtectionCommand {
  if (typeof protectedStructure !== "boolean")
    throw invalidCommandPayload("structureProtected", protectedStructure);
  return { type: "setWorkbookStructureProtection", protected: protectedStructure };
}
export function applySetWorkbookStructureProtectionCommand(
  workbook: Workbook,
  command: SetWorkbookStructureProtectionCommand,
): SetWorkbookStructureProtectionCommand | null {
  const next = createSetWorkbookStructureProtectionCommand(command.protected);
  if (Boolean(workbook.structureProtected) === next.protected) return null;
  const inverse = createSetWorkbookStructureProtectionCommand(Boolean(workbook.structureProtected));
  workbook.structureProtected = next.protected;
  return inverse;
}
