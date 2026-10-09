import { WorkbookDomainError } from "../errors.js";
import { getPivotTableRange, rangesIntersect } from "../pivot-tables.js";
import { getCellContent, type CellRange, type Sheet, type Workbook } from "../workbook.js";
import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "../sheet-limits.js";
import type { WorkbookCommand } from "./contracts.js";

const contains = (outer: CellRange, inner: CellRange) =>
  outer.start.row <= inner.start.row &&
  outer.end.row >= inner.end.row &&
  outer.start.column <= inner.start.column &&
  outer.end.column >= inner.end.column;
function reject(sheet: Sheet, id: string): never {
  throw new WorkbookDomainError(
    { code: "pivot_result_protected", details: { sheetId: sheet.id, pivotTableId: id } },
    "Cannot change part of a PivotTable report. Use PivotTable tools to change or remove the report.",
  );
}
export function assertPivotRangeIsWritable(
  sheet: Sheet,
  range: CellRange,
  allowComplete = false,
): void {
  for (const table of sheet.pivotTables ?? []) {
    const output = getPivotTableRange(table);
    if (rangesIntersect(output, range) && !(allowComplete && contains(range, output)))
      reject(sheet, table.id);
  }
}
/** Validate the entire command before any cell or history entry can be changed. */
export function assertPivotResultsAreWritable(workbook: Workbook, command: WorkbookCommand): void {
  const check = (sheetId: string, range: CellRange, allowComplete = false) => {
    const sheet = workbook.sheets.get(sheetId);
    if (sheet) assertPivotRangeIsWritable(sheet, range, allowComplete);
  };
  if (command.type === "setCellContents") {
    for (const change of command.changes) {
      const sheet = workbook.sheets.get(change.sheetId);
      if (!sheet?.pivotTables?.length) continue;
      // A format-only paste carries the original content alongside its new style.
      if (JSON.stringify(getCellContent(sheet, change.address)) === JSON.stringify(change.content))
        continue;
      check(change.sheetId, { start: change.address, end: change.address });
    }
    return;
  }
  if (!("sheetId" in command)) return;
  const sheet = workbook.sheets.get(command.sheetId);
  if (!sheet?.pivotTables?.length) return;
  switch (command.type) {
    case "clearCellRange":
    case "sortSheetRange":
    case "mergeCells":
    case "removeDuplicates":
    case "applySubtotals":
      check(sheet.id, command.range);
      return;
    case "moveCellRange": {
      check(sheet.id, command.source, true);
      const destination = {
        start: command.destination,
        end: {
          row: command.destination.row + command.source.end.row - command.source.start.row,
          column:
            command.destination.column + command.source.end.column - command.source.start.column,
        },
      };
      // A complete report cut is safe only when no other report is overwritten.
      for (const table of sheet.pivotTables ?? []) {
        if (
          !contains(command.source, getPivotTableRange(table)) &&
          rangesIntersect(destination, getPivotTableRange(table))
        )
          reject(sheet, table.id);
      }
      return;
    }
    case "insertCells":
    case "deleteCells": {
      const vertical = command.direction === "down" || command.direction === "up";
      const affected = {
        start: command.range.start,
        end: {
          row: vertical ? MAX_SHEET_ROWS - 1 : command.range.end.row,
          column: vertical ? command.range.end.column : MAX_SHEET_COLUMNS - 1,
        },
      };
      for (const table of sheet.pivotTables ?? []) {
        const output = getPivotTableRange(table);
        if (!rangesIntersect(affected, output)) continue;
        const fullBand = vertical
          ? command.range.start.column <= output.start.column &&
            command.range.end.column >= output.end.column
          : command.range.start.row <= output.start.row && command.range.end.row >= output.end.row;
        const before = vertical
          ? command.range.end.row < output.start.row
          : command.range.end.column < output.start.column;
        if (!fullBand || !before) reject(sheet, table.id);
      }
      return;
    }
    case "insertSheetAxis":
    case "deleteSheetAxis":
    case "moveSheetAxis": {
      for (const table of sheet.pivotTables ?? []) {
        const output = getPivotTableRange(table);
        const start = output.start[command.axis],
          end = output.end[command.axis];
        if (command.type === "insertSheetAxis") {
          if (command.index > start && command.index <= end) reject(sheet, table.id);
        } else {
          const last = command.index + command.count - 1;
          if (command.index <= end && last >= start && !(command.index <= start && last >= end))
            reject(sheet, table.id);
          if (
            command.type === "moveSheetAxis" &&
            command.toIndex > start &&
            command.toIndex <= end &&
            !(command.index <= start && last >= end)
          )
            reject(sheet, table.id);
        }
      }
      return;
    }
    case "createTable":
      check(sheet.id, command.table.range);
      if (command.hasHeaders === false)
        assertPivotResultsAreWritable(workbook, {
          type: "insertCells",
          sheetId: sheet.id,
          direction: "down",
          range: {
            start: command.table.range.start,
            end: { ...command.table.range.start, column: command.table.range.end.column },
          },
        });
      return;
    case "resizeTable":
      check(sheet.id, command.range);
      return;
    case "updateTable": {
      const table = sheet.tables?.find((table) => table.id === command.tableId);
      if (table) check(sheet.id, table.range);
      if (command.changes.range) check(sheet.id, command.changes.range);
      return;
    }
    case "setCellHyperlink":
      if (command.displayText !== undefined)
        check(sheet.id, { start: command.address, end: command.address });
      return;
    case "convertFloatingImageToCell": {
      const image = sheet.floatingImages.find((image) => image.id === command.id);
      if (image) check(sheet.id, { start: image.anchor, end: image.anchor });
      return;
    }
    case "convertCellImageToFloating":
      check(sheet.id, { start: command.address, end: command.address });
      return;
  }
}
