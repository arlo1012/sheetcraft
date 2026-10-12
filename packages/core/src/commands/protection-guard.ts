import { areCellTextFontRunsEqual, replaceCellTextByDiff } from "../text-font-runs.js";
import { canEditPictureForest, canEditPictureRoot } from "../picture-protection.js";
import { planFloatingPictureToCell } from "../picture-cell-conversion.js";
import { getSheetFilters } from "./filter.js";
import { WorkbookDomainError } from "../errors.js";
import { MAX_SHEET_ROWS, MAX_SHEET_COLUMNS } from "../sheet-limits.js";
import { canEditCell, canEditRange } from "../protection.js";
import { expandSelectionToMergedCellRanges, MergedCellRangeResolver } from "../merged-cells.js";
import { areCellStylesEqual } from "../style.js";
import {
  areFloatingImageCollectionsEqual,
  type Workbook,
  type Sheet,
  type CellAddress,
} from "../workbook.js";
import { createSetSheetFloatingImagesCommand } from "./images.js";
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
  const mergeResolvers = new Map<string, MergedCellRangeResolver>();
  function targetAddress(sheet: Sheet, address: CellAddress): CellAddress {
    let resolver = mergeResolvers.get(sheet.id);
    if (!resolver) {
      resolver = new MergedCellRangeResolver(sheet.mergedCells);
      mergeResolvers.set(sheet.id, resolver);
    }
    return resolver.getAnchor(address) ?? address;
  }
  if (command.type === "setCellContents") {
    for (const change of command.changes) {
      const sheet = workbook.sheets.get(change.sheetId);
      if (!sheet?.properties.protected) continue;
      const range = expandSelectionToMergedCellRanges(
        { start: change.address, end: change.address },
        sheet.mergedCells,
      );
      if (!canEditRange(sheet, range)) reject(sheet.id);
      const address = targetAddress(sheet, change.address);
      const cell = sheet.cells.get(`${address.row}:${address.column}`);
      if (
        !sheet.protection?.formatCells &&
        change.content?.kind === "literal" &&
        typeof change.content.value === "string"
      ) {
        const previous = cell?.content;
        const expected =
          previous?.kind === "literal" && typeof previous.value === "string"
            ? replaceCellTextByDiff(
                { text: previous.value, fontRuns: previous.fontRuns },
                change.content.value,
              ).fontRuns
            : undefined;
        if (!areCellTextFontRunsEqual(expected, change.content.fontRuns)) {
          const inherited =
            previous?.kind === "literal" && typeof previous.value === "string"
              ? replaceCellTextByDiff(
                  { text: previous.value, fontRuns: previous.fontRuns },
                  change.content.value,
                  { inheritInsertionFont: true },
                ).fontRuns
              : undefined;
          if (!areCellTextFontRunsEqual(inherited, change.content.fontRuns)) reject(sheet.id);
        }
      }
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
        change.hyperlink !== undefined &&
        !sheet.protection?.insertHyperlinks &&
        JSON.stringify(change.hyperlink ?? undefined) !== JSON.stringify(cell?.hyperlink)
      )
        reject(sheet.id);
      if (
        change.sparkline !== undefined &&
        !sheet.protection?.formatCells &&
        JSON.stringify(change.sparkline ?? undefined) !== JSON.stringify(cell?.sparkline)
      )
        reject(sheet.id);
      if (
        change.note !== undefined &&
        !sheet.protection?.editObjects &&
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
  if (
    command.type === "setSheetProperties" &&
    command.properties.protected === false &&
    sheet.protection?.password
  )
    reject(sheet.id);
  if (command.type === "setCellSparklines") {
    if (
      !sheet.protection?.formatCells ||
      command.changes.some((change) => !canEditCell(sheet, change.address))
    )
      reject(sheet.id);
    return true;
  }
  if (command.type === "setPivotTable" || command.type === "removePivotTable") {
    if (
      !sheet.protection?.pivotTables ||
      !(sheet.pivotTables ?? []).some(
        (table) =>
          table.id === (command.type === "setPivotTable" ? command.table.id : command.tableId),
      )
    )
      reject(sheet.id);
    return true;
  }
  if (command.type === "setCellNotes") {
    if (!sheet.protection?.editObjects) reject(sheet.id);
    return true;
  }
  if (command.type === "sortSheetRange") {
    const range = { start: { ...command.range.start }, end: { ...command.range.end } };
    if (command.hasHeader) range.start.row++;
    if (!sheet.protection?.sort || !canEditRange(sheet, range)) reject(sheet.id);
    return true;
  }
  if (command.type === "setSheetFilter") {
    const existing = getSheetFilters(sheet).find(
      (filter) => JSON.stringify(filter.range) === JSON.stringify(command.filter?.range),
    );
    if (
      !sheet.protection?.autoFilter ||
      !existing ||
      !command.filter ||
      JSON.stringify(existing.advanced) !== JSON.stringify(command.filter.advanced)
    )
      reject(sheet.id);
    return true;
  }
  if (command.type === "insertSheetAxis")
    return Boolean(
      command.axis === "row" ? sheet.protection?.insertRows : sheet.protection?.insertColumns,
    );
  if (command.type === "deleteSheetAxis") {
    const allowed =
      command.axis === "row" ? sheet.protection?.deleteRows : sheet.protection?.deleteColumns;
    const range =
      command.axis === "row"
        ? {
            start: { row: command.index, column: 0 },
            end: { row: command.index + command.count - 1, column: MAX_SHEET_COLUMNS - 1 },
          }
        : {
            start: { row: 0, column: command.index },
            end: { row: MAX_SHEET_ROWS - 1, column: command.index + command.count - 1 },
          };
    if (!allowed || !canEditRange(sheet, range)) reject(sheet.id);
    return true;
  }
  if (command.type === "setCellHyperlink") {
    if (
      !sheet.protection?.insertHyperlinks ||
      !canEditRange(sheet, { start: command.address, end: command.address })
    )
      reject(sheet.id);
    return true;
  }
  if (command.type === "setSheetFloatingImages") return canEditPictureForest(sheet, command.images);
  if (command.type === "convertFloatingImageToCell") {
    const plan = planFloatingPictureToCell(sheet, command.id, command.path);
    if (!plan) return true;
    if (
      !canEditPictureRoot(sheet, plan.sourceRoot) ||
      !canEditRange(
        sheet,
        expandSelectionToMergedCellRanges(
          { start: plan.address, end: plan.address },
          sheet.mergedCells,
        ),
      )
    )
      reject(sheet.id);
    return true;
  }
  if (command.type === "convertCellImageToFloating") {
    if (
      !canEditRange(
        sheet,
        expandSelectionToMergedCellRanges(
          { start: command.address, end: command.address },
          sheet.mergedCells,
        ),
      )
    )
      reject(sheet.id);
    // This transfers an existing cell-owned source; it does not authorize new picture paste.
    return true;
  }
  if (command.type === "deleteFloatingImage")
    return canEditPictureForest(
      sheet,
      sheet.floatingImages.filter((root) => root.id !== command.id),
    );
  if (command.type === "setFloatingImage") {
    const index = sheet.floatingImages.findIndex((root) => root.id === command.image.id);
    const next = sheet.floatingImages.slice();
    if (index < 0) next.splice(command.index ?? next.length, 0, command.image);
    else {
      next.splice(index, 1);
      next.splice(command.index ?? index, 0, command.image);
    }
    return canEditPictureForest(sheet, next);
  }
  if (command.type === "setSheetDrawings") return Boolean(sheet.protection?.editObjects);
  if (command.type === "applyCellStyle" && "unlocked" in command.patch) reject(sheet.id);
  if (
    command.type === "applyCellFormat" &&
    (command.change.merge !== undefined ||
      (command.change.style && "unlocked" in command.change.style))
  )
    reject(sheet.id);
  if (
    command.type === "restoreCellStyles" &&
    command.changes.some((change) => {
      const address = targetAddress(sheet, change.address);
      return (
        Boolean(change.style?.unlocked) !==
        Boolean(sheet.cells.get(`${address.row}:${address.column}`)?.style?.unlocked)
      );
    })
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
      if (
        command.floatingImageState !== undefined &&
        !sheet.protection?.editObjects &&
        !areFloatingImageCollectionsEqual(
          sheet.floatingImages,
          createSetSheetFloatingImagesCommand(sheet.id, command.floatingImageState).images,
        )
      )
        reject(sheet.id);
      return command.axis === "row"
        ? Boolean(sheet.protection?.formatRows)
        : Boolean(sheet.protection?.formatColumns);
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
