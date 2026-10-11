import { computed, onScopeDispose, ref, shallowRef, watch } from "vue";
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
type SparklineDialogTarget = {
  dialogId: number;
  workbook: Workbook;
  sheet: Sheet;
  generation: number;
  initial: SparklineDraft;
  isCurrent: () => boolean;
  confirm: (value: SparklineDraft) => void;
  close: () => void;
};
export function useSparklineActions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getRange: () => CellRange;
  getGeneration: () => number;
  flush: () => boolean;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
}) {
  const dialog = shallowRef<SparklineDialogTarget>();
  const draft = computed(() => dialog.value?.initial);
  const error = ref(false);
  const errorKind = ref<"invalid" | "failed">("invalid");
  const failed = computed(() => error.value && errorKind.value === "failed");
  let dialogSequence = 0;
  function isCurrent(target: SparklineDialogTarget): boolean {
    return (
      dialog.value === target &&
      target.workbook === options.getWorkbook() &&
      target.generation === options.getGeneration() &&
      target.sheet === options.getSheet() &&
      target.workbook.sheets.get(target.sheet.id) === target.sheet
    );
  }
  watch([options.getWorkbook, options.getSheet, options.getGeneration], () => close(), {
    flush: "sync",
  });
  function allowed() {
    return !options.isBusy() && canUseSheetPermission(options.getSheet(), "formatCells");
  }
  function open() {
    if (!allowed() || !options.flush()) return;
    const sheet = options.getSheet();
    if (!canUseSheetPermission(sheet, "formatCells")) return;
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
    error.value = false;
    const initial: SparklineDraft = {
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
    const target: SparklineDialogTarget = {
      dialogId: ++dialogSequence,
      workbook: options.getWorkbook(),
      sheet,
      generation: options.getGeneration(),
      initial,
      isCurrent: () => isCurrent(target),
      confirm: (value) => confirm(value, target),
      close: () => close(target),
    };
    dialog.value = target;
  }
  function confirm(value: SparklineDraft, target = dialog.value) {
    if (!target || !isCurrent(target) || !allowed()) return;
    const sheet = target.sheet;
    errorKind.value = "invalid";
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
      const accepted = options.execute(createSetCellSparklinesCommand(sheet.id, changes));
      if (!isCurrent(target)) return;
      // Core returns false for a valid unchanged definition as well as Web's
      // refused execution. Close only if every requested normalized result exists.
      const alreadyApplied = changes.every(
        (change) =>
          JSON.stringify(
            normalizeCellSparkline(getCellSparkline(sheet, change.address)) ?? null,
          ) === JSON.stringify(change.sparkline),
      );
      if (!accepted && !alreadyApplied) {
        errorKind.value = "failed";
        error.value = true;
        return;
      }
      close(target);
    } catch {
      if (isCurrent(target)) {
        errorKind.value = "failed";
        error.value = true;
      }
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
  function close(target = dialog.value) {
    if (!target || dialog.value !== target) return;
    dialog.value = undefined;
    error.value = false;
  }
  onScopeDispose(() => close(), true);
  return { dialog, draft, error, failed, open, confirm, remove, close };
}
