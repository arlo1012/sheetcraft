import { WorkbookDomainError } from "../errors.js";
import {
  normalizeProtectionPassword,
  verifyProtectionPassword,
  type ProtectionPassword,
} from "../protection-password.js";
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
  currentPassword?: string,
): SetSheetProtectionCommand {
  if (typeof protectedSheet !== "boolean") throw invalidCommandPayload("protected", protectedSheet);
  return {
    type: "setSheetProtection",
    ...(currentPassword !== undefined ? { currentPassword } : {}),
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
  fromHistory = false,
): SetSheetProtectionCommand | null {
  const next = createSetSheetProtectionCommand(
    command.sheetId,
    command.protected,
    command.protection,
  );
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  if (
    !fromHistory &&
    sheet.properties.protected &&
    !verifyProtectionPassword(command.currentPassword ?? "", sheet.protection?.password)
  )
    throw new WorkbookDomainError({ code: "incorrect_protection_password" });
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
  sheet.protectionAccess = undefined;
  return inverse;
}
export function createSetWorkbookStructureProtectionCommand(
  protectedStructure: boolean,
  password?: ProtectionPassword,
  currentPassword?: string,
): SetWorkbookStructureProtectionCommand {
  if (typeof protectedStructure !== "boolean")
    throw invalidCommandPayload("structureProtected", protectedStructure);
  return {
    type: "setWorkbookStructureProtection",
    protected: protectedStructure,
    ...(password ? { password: normalizeProtectionPassword(password) } : {}),
    ...(currentPassword !== undefined ? { currentPassword } : {}),
  };
}
export function applySetWorkbookStructureProtectionCommand(
  workbook: Workbook,
  command: SetWorkbookStructureProtectionCommand,
  fromHistory = false,
): SetWorkbookStructureProtectionCommand | null {
  const next = createSetWorkbookStructureProtectionCommand(command.protected, command.password);
  if (
    !fromHistory &&
    workbook.structureProtected &&
    !verifyProtectionPassword(command.currentPassword ?? "", workbook.structurePassword)
  )
    throw new WorkbookDomainError({ code: "incorrect_protection_password" });
  if (
    Boolean(workbook.structureProtected) === next.protected &&
    JSON.stringify(workbook.structurePassword) === JSON.stringify(next.password)
  )
    return null;
  const inverse = createSetWorkbookStructureProtectionCommand(
    Boolean(workbook.structureProtected),
    workbook.structurePassword,
  );
  workbook.structureProtected = next.protected;
  workbook.structurePassword = next.protected ? next.password : undefined;
  return inverse;
}
