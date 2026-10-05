import { WorkbookDomainError } from "../errors.js";
import { canEditRange } from "../protection.js";
import { expandSelectionToMergedCellRanges } from "../merged-cells.js";
import { areCellStylesEqual } from "../style.js";
import type { Workbook } from "../workbook.js";
import type { WorkbookCommand } from "./contracts.js";

function reject(sheetId: string): never {
  throw new WorkbookDomainError(
    { code: "sheet_protected", details: { sheetId } },
    `Sheet ${sheetId} is protected.`,
  );
}
export function assertWorkbookStructureProtection(
  workbook: Workbook,
  command: WorkbookCommand,
): void {
  if (!workbook.structureProtected) return;
  if (
    ["addSheet", "deleteSheet", "moveSheet", "renameSheet"].includes(command.type) ||
    (command.type === "setSheetProperties" &&
      command.properties.hidden !== undefined &&
      command.properties.hidden !== workbook.sheets.get(command.sheetId)?.properties.hidden)
  ) {
    throw new WorkbookDomainError(
      { code: "workbook_protected" },
      "Workbook structure is protected.",
    );
  }
}

/** Handles exceptions to whole-sheet protection; all other mutations use the existing guard. */
export function allowProtectedCellCommand(workbook: Workbook, command: WorkbookCommand): boolean {
  if (command.type === "setCellContents") {
    for (const change of command.changes) {
      const sheet = workbook.sheets.get(change.sheetId);
      if (!sheet?.properties.protected) continue;
      const range = expandSelectionToMergedCellRanges(
        { start: change.address, end: change.address },
        sheet.mergedCells,
      );
      if (!canEditRange(sheet, range)) reject(sheet.id);
      const cell = sheet.cells.get(`${change.address.row}:${change.address.column}`);
      if (command.reconcileBorders && !sheet.protection?.formatCells && "style" in change)
        reject(sheet.id);
      if (change.style !== undefined) {
        if (Boolean(change.style?.unlocked) !== Boolean(cell?.style?.unlocked)) reject(sheet.id);
        if (
          !sheet.protection?.formatCells &&
          !areCellStylesEqual(change.style ?? undefined, cell?.style)
        )
          reject(sheet.id);
      }
      if (
        change.note !== undefined &&
        JSON.stringify(change.note ?? undefined) !== JSON.stringify(cell?.note)
      )
        reject(sheet.id);
    }
    for (const entry of command.conditionalFormats ?? []) {
      if (workbook.sheets.get(entry.sheetId)?.properties.protected) reject(entry.sheetId);
    }
    return true;
  }
  if (!("sheetId" in command)) return false;
  const sheet = workbook.sheets.get(command.sheetId);
  if (!sheet?.properties.protected) return false;
  if (command.type === "clearCellRange") {
    if (!canEditRange(sheet, expandSelectionToMergedCellRanges(command.range, sheet.mergedCells)))
      reject(sheet.id);
    return true;
  }
  if (command.type === "setCellNotes") reject(sheet.id);
  if (command.type === "applyCellStyle" && "unlocked" in command.patch) reject(sheet.id);
  if (
    command.type === "applyCellFormat" &&
    (command.change.merge !== undefined ||
      (command.change.style && "unlocked" in command.change.style))
  )
    reject(sheet.id);
  if (
    command.type === "restoreCellStyles" &&
    command.changes.some(
      (change) =>
        Boolean(change.style?.unlocked) !==
        Boolean(sheet.cells.get(`${change.address.row}:${change.address.column}`)?.style?.unlocked),
    )
  )
    reject(sheet.id);
  switch (command.type) {
    case "applyCellStyle":
    case "applyCellFormat":
    case "applyCellBorders":
    case "adjustCellNumberFormatDecimals":
    case "adjustCellIndent":
    case "restoreCellStyles":
      return Boolean(sheet.protection?.formatCells);
    case "restoreSheetDimensionState":
    case "resizeSheetDimension":
    case "resizeSheetDimensions":
    case "setSheetDimensionSizes":
    case "setSheetDimensionHidden":
    case "resetSheetDimensionSizes":
      return command.axis === "row"
        ? Boolean(sheet.protection?.formatRows)
        : Boolean(sheet.protection?.formatColumns);
    case "setSheetDefaultColumnWidth":
      return Boolean(sheet.protection?.formatColumns);
    default:
      return false;
  }
}
