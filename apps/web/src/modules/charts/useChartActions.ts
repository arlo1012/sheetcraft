import { computed, getCurrentScope, onScopeDispose, shallowRef, ref, watch } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import {
  applyWorkbookCommand,
  createSetSheetDrawingsCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import {
  normalizeSheetChart,
  getSheetChartData,
  type ChartType,
} from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing, SheetDrawing } from "@sheetcraft/core/sheet-drawings";
import type { SheetPivotTable } from "@sheetcraft/core/pivot-tables";
import {
  MAX_SHEET_COLUMNS,
  type Workbook,
  type Sheet,
  type CellRange,
  type SheetEvaluator,
} from "@sheetcraft/core/workbook";
import { resolveDataRange } from "@sheetcraft/core/data-range";
import { preflightChartDataTable } from "./chart-data-table-preflight";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { resolveRangeReference } from "../../shared/range-reference/formatRangeReference";
import {
  applyChartDesignIntent,
  changeChartType,
  normalizeChartInsertIntent,
  type ChartInsertIntent,
} from "./chart-design-intents";

type ChartTarget = {
  workbook: Workbook;
  generation: number | undefined;
  sheet: Sheet;
  report?: SheetPivotTable;
  existing?: SheetChartDrawing;
};
type ChartDialog = ChartTarget & {
  dialogId: number;
  drawingId: string;
  initial: SheetChartDrawing;
  dashboard: boolean;
  isCurrent: () => boolean;
  confirm: (drawing: SheetChartDrawing, source: string) => void;
  close: () => void;
  editPivot: (id: string) => void;
};
export function useChartActions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getRange: () => CellRange;
  getEvaluator: () => SheetEvaluator;
  getGeneration?: () => number;
  getRevision?: () => number;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  name: () => string;
  onEditPivot?: (id: string) => void;
}) {
  const dialog = shallowRef<ChartDialog>();
  const editing = computed(() => dialog.value?.initial);
  const error = ref(false);
  const idFactory = createBrowserIdFactory();
  let dialogId = 0;
  let operation = 0;
  let confirming = false;
  let disposed = false;
  const allowed = (sheet: Sheet) =>
    !disposed && !options.isBusy() && canUseSheetPermission(sheet, "editObjects");
  function hasTargetIdentity(target: ChartTarget): boolean {
    return (
      !disposed &&
      target.workbook === options.getWorkbook() &&
      target.generation === options.getGeneration?.() &&
      target.sheet === options.getSheet() &&
      target.workbook.sheets.get(target.sheet.id) === target.sheet &&
      (!target.report || target.sheet.pivotTables?.includes(target.report) === true) &&
      (!target.existing || target.sheet.drawings?.includes(target.existing) === true)
    );
  }
  function isCurrent(target: ChartDialog): boolean {
    return dialog.value === target && hasTargetIdentity(target);
  }
  if (getCurrentScope()) {
    watch([options.getWorkbook, options.getSheet, () => options.getGeneration?.()], () => close(), {
      flush: "sync",
    });
    watch(
      () => {
        void options.getRevision?.();
        return !dialog.value || hasTargetIdentity(dialog.value);
      },
      (valid) => {
        if (!valid && !confirming) close();
      },
      { flush: "sync" },
    );
    onScopeDispose(() => {
      disposed = true;
      close();
    });
  }
  function capture(reportId?: string, existing?: SheetChartDrawing): ChartTarget | undefined {
    const workbook = options.getWorkbook(),
      sheet = options.getSheet();
    const report = reportId ? sheet.pivotTables?.find((item) => item.id === reportId) : undefined;
    if (reportId && !report) return;
    const target = { workbook, sheet, generation: options.getGeneration?.(), report, existing };
    return hasTargetIdentity(target) ? target : undefined;
  }
  function prepare(target: ChartTarget): boolean {
    const request = ++operation;
    return (
      !confirming &&
      allowed(target.sheet) &&
      options.flush() &&
      request === operation &&
      hasTargetIdentity(target) &&
      allowed(target.sheet)
    );
  }
  function open(target: ChartTarget, initial: SheetChartDrawing, dashboard = false): void {
    const next: ChartDialog = {
      ...target,
      dialogId: ++dialogId,
      drawingId: initial.id,
      initial,
      dashboard,
      isCurrent: () => isCurrent(next),
      confirm: (drawing, source) => confirm(drawing, source, next),
      close: () => close(next),
      editPivot: (id) => {
        if (!isCurrent(next) || next.report?.id !== id) return;
        close(next);
        options.onEditPivot?.(id);
      },
    };
    error.value = false;
    dialog.value = next;
  }
  function createDrawing(
    type: ChartType,
    name: string,
    range: CellRange | null,
    anchor: SheetChartDrawing["anchor"],
  ): SheetChartDrawing {
    return {
      id: idFactory("chart"),
      kind: "chart",
      name,
      anchor: { ...anchor },
      offsetX: 8,
      offsetY: 8,
      width: 480,
      height: 300,
      text: "",
      shape: "rectangle",
      fill: "#ffffff",
      stroke: "#d1d5db",
      strokeWidth: 1,
      color: "#111827",
      fontSize: 14,
      bold: false,
      italic: false,
      rotation: 0,
      chart: {
        type,
        range: range ? { start: { ...range.start }, end: { ...range.end } } : null,
        title: name,
        headerRow: true,
        headerColumn: type !== "scatter",
        seriesBy: "columns",
        legend: true,
        labels: false,
        stacked: false,
        showHidden: false,
      },
    };
  }
  function insert(intent: ChartInsertIntent) {
    let request: ChartInsertIntent;
    try {
      request = normalizeChartInsertIntent(intent);
    } catch {
      error.value = true;
      return;
    }
    const target = capture();
    if (!target || !prepare(target)) return;
    const selection = options.getRange();
    const range = resolveDataRange(target.sheet, selection) ?? selection;
    const type = typeof request === "string" ? request : request.type;
    const drawing = createDrawing(
      type === "dashboard" ? "column" : type,
      options.name(),
      range,
      selection.start,
    );
    let invalidSelection = false;
    try {
      drawing.chart = normalizeSheetChart(drawing.chart);
    } catch {
      // A too-large selection remains a recoverable source edit, never an
      // invalid chart model passed into the editor's setup or persisted data.
      drawing.chart = normalizeSheetChart({ ...drawing.chart, range: null });
      invalidSelection = true;
    }
    if (typeof request !== "string")
      drawing.chart = applyChartDesignIntent(drawing.chart, {
        kind: "variant",
        variant: request.variant,
      });
    open(target, drawing, type === "dashboard");
    if (invalidSelection) error.value = true;
  }
  function insertPivot(id: string) {
    const target = capture(id);
    if (!target || !prepare(target) || !target.report) return;
    const report = target.report,
      range = report.outputRange;
    const drawing = createDrawing("column", report.name, range, {
      row: range?.start.row ?? report.anchor.row,
      column: Math.min(MAX_SHEET_COLUMNS - 1, (range?.end.column ?? report.anchor.column) + 2),
    });
    drawing.chart.pivotTableId = report.id;
    drawing.chart.showHidden = true;
    open(target, drawing);
  }
  function edit(drawing: SheetChartDrawing) {
    const target = capture(drawing.chart.pivotTableId, drawing);
    if (!target || !prepare(target)) return;
    open(target, drawing);
  }
  function isUnchangedEdit(
    target: ChartDialog,
    command: ReturnType<typeof createSetSheetDrawingsCommand>,
  ): boolean {
    if (!target.existing) return false;
    const sheets = new Map(target.workbook.sheets);
    // This command only replaces drawings on its destination. Keep the real sheet untouched during planning.
    sheets.set(target.sheet.id, { ...target.sheet });
    return applyWorkbookCommand({ ...target.workbook, sheets }, command) === null;
  }
  function confirm(drawing: SheetChartDrawing, source: string, target = dialog.value) {
    if (!target || dialog.value !== target || confirming || disposed) return;
    if (!hasTargetIdentity(target)) {
      close(target);
      return;
    }
    if (!allowed(target.sheet)) return;
    if (
      drawing.id !== target.drawingId ||
      drawing.chart.pivotTableId !== target.report?.id ||
      (target.report && drawing.chart.dataCache !== undefined)
    ) {
      error.value = true;
      return;
    }
    confirming = true;
    try {
      if (!options.flush() || !isCurrent(target) || !allowed(target.sheet)) return;
      // Linked charts read the captured report's materialized output, never its source or the disabled source text.
      const reference = target.report
        ? undefined
        : resolveRangeReference(target.workbook, source, target.sheet.id);
      if (
        !target.report &&
        !drawing.chart.dataCache &&
        !drawing.chart.source &&
        (!reference || reference.sheetId !== target.sheet.id)
      ) {
        error.value = true;
        return;
      }
      const next: SheetChartDrawing = {
        ...drawing,
        chart: normalizeSheetChart({
          ...drawing.chart,
          range: drawing.chart.source
            ? null
            : target.report
              ? target.report.outputRange
              : (reference?.range ?? drawing.chart.range),
          ...(target.report
            ? {
                pivotTableId: target.report.id,
                headerRow: true,
                headerColumn: true,
                seriesBy: "columns",
              }
            : {}),
        }),
      };
      const data = getSheetChartData(target.sheet, next.chart, options.getEvaluator(), (sheetId) =>
        target.workbook.sheets.get(sheetId),
      );
      if (
        data.diagnostics?.some(
          (item) => item.code === "broken-reference" || item.code === "length-mismatch",
        )
      ) {
        error.value = true;
        return;
      }
      if (
        !data.series.some((series) => series.values.some((value) => value !== null)) &&
        !(next.chart.source?.kind === "series" && next.chart.source.series.length === 0) &&
        next.chart.type !== "sankey"
      ) {
        error.value = true;
        return;
      }
      if (
        (next.chart.type === "scatter" && data.series.length < 2) ||
        (next.chart.type === "sankey" &&
          (target.report ||
            (reference
              ? reference.range.end.column - reference.range.start.column < 2
              : !next.chart.dataCache)))
      ) {
        error.value = true;
        return;
      }
      preflightChartDataTable(next.chart, data, next);
      if (!isCurrent(target) || !allowed(target.sheet)) return;
      const current = target.sheet.drawings ?? [];
      let drawings: SheetDrawing[];
      if (target.existing) {
        drawings = current.map((item) => (item === target.existing ? next : item));
      } else if (target.dashboard)
        drawings = [
          ...current,
          ...(["column", "line", "pie", "bar"] as const).map((type, index) => ({
            ...next,
            id: index ? idFactory("chart") : next.id,
            offsetX: next.offsetX + (index % 2) * 500,
            offsetY: next.offsetY + Math.floor(index / 2) * 320,
            chart: changeChartType(next.chart, type),
          })),
        ];
      else {
        if (current.some((item) => item.id === next.id)) {
          error.value = true;
          return;
        }
        drawings = [...current, next];
      }
      const command = createSetSheetDrawingsCommand(target.sheet.id, drawings);
      const unchanged = isUnchangedEdit(target, command);
      if (options.execute(command) === false) {
        if (unchanged && isCurrent(target) && isUnchangedEdit(target, command)) close(target);
        else if (dialog.value === target) error.value = true;
        return;
      }
      close(target);
    } catch {
      if (dialog.value === target) error.value = true;
    } finally {
      confirming = false;
      if (dialog.value === target && !hasTargetIdentity(target)) close(target);
    }
  }
  function close(target = dialog.value) {
    if (target !== dialog.value) return;
    operation++;
    dialog.value = undefined;
    error.value = false;
  }
  return { dialog, editing, error, insert, insertPivot, edit, confirm, close };
}
