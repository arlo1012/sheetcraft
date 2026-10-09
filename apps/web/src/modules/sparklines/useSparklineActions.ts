import { ref, shallowRef } from "vue";
import { canEditRange, canUseSheetPermission, doMergedCellRangesIntersect } from "@sheetcraft/core";
import {
  createSetCellSparklinesCommand,
  createClearCellSparklinesCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import { normalizeCellSparkline, type CellSparkline } from "@sheetcraft/core/sparklines";
import {
  getCellSparkline,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type Sheet,
  type Workbook,
  type CellRange,
} from "@sheetcraft/core/workbook";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
export type SparklineDraft = { source: string; destination: string; sparkline: CellSparkline };
export function useSparklineActions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getRange: () => CellRange;
  flush: () => boolean;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
}) {
  const draft = shallowRef<SparklineDraft>();
  const error = ref(false);
  let target: { workbook: Workbook; sheetId: string } | undefined;
  function allowed() {
    return !options.isBusy() && canUseSheetPermission(options.getSheet(), "formatCells");
  }
  function open() {
    if (!allowed() || !options.flush()) return;
    const sheet = options.getSheet();
    const range = options.getRange();
    const existing = getCellSparkline(sheet, range.start);
    const source = existing?.source ?? range;
    const destination = existing
      ? { start: range.start, end: range.start }
      : range.end.column + 1 < MAX_SHEET_COLUMNS
        ? {
            start: { row: range.start.row, column: range.end.column + 1 },
            end: { row: range.end.row, column: range.end.column + 1 },
          }
        : {
            start: {
              row: Math.min(MAX_SHEET_ROWS - 1, range.end.row + 1),
              column: range.start.column,
            },
            end: { row: Math.min(MAX_SHEET_ROWS - 1, range.end.row + 1), column: range.end.column },
          };
    target = { workbook: options.getWorkbook(), sheetId: sheet.id };
    error.value = false;
    draft.value = {
      source: formatRangeReference(sheet.name, source),
      destination: formatRangeReference(sheet.name, destination),
      sparkline: existing
        ? normalizeCellSparkline(existing)!
        : {
            type: "line",
            source: null,
            color: "#2563eb",
            negativeColor: "#ef4444",
            markers: false,
            axis: false,
            showHidden: false,
            empty: "gap",
          },
    };
  }
  function confirm(value: SparklineDraft) {
    const sheet = options.getSheet();
    if (
      !allowed() ||
      !target ||
      target.workbook !== options.getWorkbook() ||
      target.sheetId !== sheet.id
    )
      return;
    const source = resolveRangeReference(target.workbook, value.source, sheet.id);
    const destination = resolveRangeReference(target.workbook, value.destination, sheet.id);
    if (
      !source ||
      !destination ||
      source.sheetId !== sheet.id ||
      destination.sheetId !== sheet.id ||
      !canEditRange(sheet, destination.range) ||
      sheet.mergedCells.some((merge) => doMergedCellRangesIntersect(merge, destination.range))
    ) {
      error.value = true;
      return;
    }
    const rows = source.range.end.row - source.range.start.row + 1,
      columns = source.range.end.column - source.range.start.column + 1;
    const targetRows = destination.range.end.row - destination.range.start.row + 1,
      targetColumns = destination.range.end.column - destination.range.start.column + 1;
    if (
      rows * columns > 10000 ||
      targetRows * targetColumns > 10000 ||
      !(
        (targetColumns === 1 && targetRows === rows) ||
        (targetRows === 1 && targetColumns === columns) ||
        (targetRows === 1 && targetColumns === 1 && (rows === 1 || columns === 1))
      )
    ) {
      error.value = true;
      return;
    }
    try {
      const changes = [];
      for (let row = 0; row < targetRows; row++)
        for (let column = 0; column < targetColumns; column++) {
          const single = targetRows === 1 && targetColumns === 1;
          const range = single
            ? source.range
            : targetColumns === 1
              ? {
                  start: { row: source.range.start.row + row, column: source.range.start.column },
                  end: { row: source.range.start.row + row, column: source.range.end.column },
                }
              : {
                  start: {
                    row: source.range.start.row,
                    column: source.range.start.column + column,
                  },
                  end: { row: source.range.end.row, column: source.range.start.column + column },
                };
          changes.push({
            address: {
              row: destination.range.start.row + row,
              column: destination.range.start.column + column,
            },
            sparkline: normalizeCellSparkline({ ...value.sparkline, source: range })!,
          });
        }
      options.execute(createSetCellSparklinesCommand(sheet.id, changes));
      close();
    } catch {
      error.value = true;
    }
  }
  function remove() {
    if (!allowed() || !options.flush()) return;
    const sheet = options.getSheet();
    const range = options.getRange();
    if (!canEditRange(sheet, range)) return;
    const command = createClearCellSparklinesCommand(options.getWorkbook(), sheet.id, range);
    if (command) options.execute(command);
  }
  function close() {
    draft.value = undefined;
    target = undefined;
    error.value = false;
  }
  return { draft, error, open, confirm, remove, close };
}
