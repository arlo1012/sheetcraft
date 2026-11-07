import { emptyDashboard, normalizeDashboard, type SheetDashboard } from "../dashboard.js";
import type { Workbook } from "../workbook.js";
import type { SetDashboardCommand, AddSheetCommand } from "./contracts.js";
import { createAddSheetCommand } from "./sheets.js";
import { getSheetOrThrow, invalidCommandPayload } from "./helpers.js";
export function createDashboardSheetCommand(
  workbook: Workbook,
  name: string,
  snapshot: boolean,
  idFactory: import("../runtime.js").IdFactory,
): AddSheetCommand {
  const names = new Set([...workbook.sheets.values()].map((sheet) => sheet.name.toLowerCase()));
  let title = name,
    number = 2;
  while (names.has(title.toLowerCase())) title = name + " " + number++;
  const command = createAddSheetCommand(workbook, { name: title, idFactory });
  command.sheet.dashboard = emptyDashboard(snapshot);
  return command;
}
export function createSetDashboardCommand(
  sheetId: string,
  dashboard: SheetDashboard,
): SetDashboardCommand {
  return { type: "setDashboard", sheetId, dashboard: normalizeDashboard(dashboard) };
}
export function applySetDashboardCommand(
  workbook: Workbook,
  command: SetDashboardCommand,
): SetDashboardCommand | null {
  const sheet = getSheetOrThrow(workbook, command.sheetId);
  if (!sheet.dashboard) throw invalidCommandPayload("dashboard", command.sheetId);
  const next = normalizeDashboard(command.dashboard);
  if (JSON.stringify(sheet.dashboard) === JSON.stringify(next)) return null;
  const inverse = createSetDashboardCommand(sheet.id, sheet.dashboard);
  sheet.dashboard = next;
  return inverse;
}
