import { computed, onScopeDispose, ref, shallowRef, watch } from "vue";
import {
  canEditCell,
  canEditRange,
  canUseSheetPermission,
  doMergedCellRangesIntersect,
} from "@sheetcraft/core";
import {
  createSetCellSparklinesCommand,
  createClearCellSparklinesCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import {
  normalizeCellSparkline,
  readSparklineReference,
  formatSparklineReference,
  getSheetSparklines,
  type CellSparkline,
} from "@sheetcraft/core/sparklines";
import {
  getCellSparkline,
  type Sheet,
  type Workbook,
  type CellRange,
  type CellAddress,
} from "@sheetcraft/core/workbook";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { useReferencePickerOwner } from "../../shared/range-reference/useReferencePickerOwner";
export type SparklineDraft = { source: string; destination: string; sparkline: CellSparkline };
function hasSelectedContent(sheet: Sheet, range: CellRange): boolean {
  // Inspect stored cells so whole-row/column selections do not scan empty coordinates.
  for (const [key, cell] of sheet.cells) {
    const content = cell.content;
    if (
      !content ||
      (content.kind === "literal" && (content.value === null || content.value === ""))
    )
      continue;
    const [row, column] = key.split(":").map(Number) as [number, number];
    if (
      row >= range.start.row &&
      row <= range.end.row &&
      column >= range.start.column &&
      column <= range.end.column
    )
      return true;
  }
  return false;
}
type SparklineDialogTarget = {
  dialogId: number;
  editing: boolean;
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
  selectSheet?: (id: string) => void;
}) {
  const idFactory = createBrowserIdFactory();
  const dialog = shallowRef<SparklineDialogTarget>();
  const draft = computed(() => dialog.value?.initial);
  const error = ref(false);
  const picker = useReferencePickerOwner(options.selectSheet);
  const owner = () => picker.owner.value ?? options.getSheet();
  const errorKind = ref<"invalid" | "failed">("invalid");
  const failed = computed(() => error.value && errorKind.value === "failed");
  let dialogSequence = 0;
  function isCurrent(target: SparklineDialogTarget): boolean {
    return (
      dialog.value === target &&
      target.workbook === options.getWorkbook() &&
      target.generation === options.getGeneration() &&
      target.sheet === owner() &&
      target.workbook.sheets.get(target.sheet.id) === target.sheet
    );
  }
  watch([options.getWorkbook, owner, options.getGeneration], () => close(), {
    flush: "sync",
  });
  function allowed() {
    return !options.isBusy() && canUseSheetPermission(options.getSheet(), "formatCells");
  }
  function open(type?: CellSparkline["type"], address?: CellAddress) {
    if (picker.owner.value || !allowed() || !options.flush()) return;
    const sheet = options.getSheet();
    if (!canUseSheetPermission(sheet, "formatCells")) return;
    const range = address ? { start: address, end: address } : options.getRange();
    const existing = getCellSparkline(sheet, range.start);
    const destination = existing ? { start: range.start, end: range.start } : range;
    const useSelectionAsSource = !existing && hasSelectedContent(sheet, range);
    error.value = false;
    const initial: SparklineDraft = {
      source: existing?.source
        ? "=" +
          formatSparklineReference(
            existing.source,
            options.getWorkbook().sheets.get(existing.sourceSheetId ?? sheet.id)!.name,
          )
        : existing
          ? "#REF!"
          : useSelectionAsSource
            ? formatRangeReference(sheet.name, range)
            : "",
      destination: useSelectionAsSource ? "" : formatRangeReference(sheet.name, destination),
      sparkline: existing
        ? normalizeCellSparkline(existing)!
        : {
            type: type ?? "line",
            source: null,
            color: "#2563eb",
            negativeColor: "#ef4444",
            markers: false,
            axis: false,
            showHidden: false,
            empty: "gap",
            negativePoints: false,
          },
    };
    if (type) initial.sparkline.type = type;
    const target: SparklineDialogTarget = {
      dialogId: ++dialogSequence,
      editing: Boolean(existing),
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
    if (!target || picker.owner.value || !isCurrent(target) || !allowed()) return;
    errorKind.value = "invalid";
    const source =
      readSparklineReference(value.source, {
        currentSheetId: target.sheet.id,
        resolveSheetId: (name) =>
          [...target.workbook.sheets.values()].find(
            (s) => s.name.toLowerCase() === name.toLowerCase(),
          )?.id,
      }) ?? resolveRangeReference(target.workbook, value.source, target.sheet.id);
    const destination = resolveRangeReference(target.workbook, value.destination, target.sheet.id);
    const sheet = destination && target.workbook.sheets.get(destination.sheetId);
    if (
      !source ||
      !destination ||
      !sheet ||
      sheet.dashboard ||
      target.workbook.sheets.get(source.sheetId)?.dashboard ||
      (target.editing && sheet !== target.sheet) ||
      !canUseSheetPermission(sheet, "formatCells") ||
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
      rows < 1 ||
      columns < 1 ||
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
      const groupId =
        (target.editing ? target.initial.sparkline.groupId : undefined) ??
        (targetRows * targetColumns > 1 ? idFactory("sparkline-group") : undefined);
      const definition = normalizeCellSparkline({ ...value.sparkline, groupId })!;
      for (let row = 0; row < targetRows; row++)
        for (let column = 0; column < targetColumns; column++) {
          const single = targetRows === 1 && targetColumns === 1;
          const range = single
            ? source.range
            : targetColumns === 1
              ? {
                  start: { ...source.range.start, row: source.range.start.row + row },
                  end: { ...source.range.end, row: source.range.start.row + row },
                }
              : {
                  start: {
                    ...source.range.start,
                    column: source.range.start.column + column,
                  },
                  end: { ...source.range.end, column: source.range.start.column + column },
                };
          changes.push({
            address: {
              row: destination.range.start.row + row,
              column: destination.range.start.column + column,
            },
            sparkline: normalizeCellSparkline({
              ...definition,
              source: range,
              sourceSheetId: source.sheetId === sheet.id ? undefined : source.sheetId,
            })!,
          });
        }
      if (target.editing && groupId) {
        const targets = new Set(changes.map(({ address }) => `${address.row}:${address.column}`));
        for (const entry of getSheetSparklines(sheet)) {
          if (
            entry.value.groupId !== groupId ||
            targets.has(`${entry.address.row}:${entry.address.column}`)
          )
            continue;
          if (!canEditCell(sheet, entry.address)) {
            errorKind.value = "failed";
            error.value = true;
            return;
          }
          changes.push({
            address: entry.address,
            sparkline: normalizeCellSparkline({
              ...definition,
              source: entry.value.source,
              sourceSheetId: entry.value.sourceSheetId,
            })!,
          });
        }
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
      if (sheet !== target.sheet) options.selectSheet?.(sheet.id);
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
  function pickReference(select: () => Promise<string | undefined>) {
    const target = dialog.value;
    return target
      ? picker.pick(target.sheet, target.isCurrent, select)
      : Promise.resolve(undefined);
  }
  return {
    dialog,
    draft,
    error,
    failed,
    open,
    confirm,
    remove,
    close,
    pickReference,
    pickerOwner: picker.owner,
  };
}
