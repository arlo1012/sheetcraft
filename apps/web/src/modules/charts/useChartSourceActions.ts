import { getCurrentScope, nextTick, onScopeDispose, ref, shallowRef, watch } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import {
  getSheetChartData,
  normalizeSheetChart,
  type SheetChart,
} from "@sheetcraft/core/sheet-charts";
import { normalizeSheetDrawings, type SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Sheet, SheetEvaluator, Workbook } from "@sheetcraft/core/workbook";
import type { ChartSourceReferenceRole } from "./chart-source-editor";

type SourceOwner = {
  dialogId: number;
  workbook: Workbook;
  generation: number;
  sheet: Sheet;
  initial: SheetChartDrawing;
  picking: boolean;
  isCurrent: () => boolean;
  commit: (drawing: SheetChartDrawing) => boolean;
  close: () => void;
  selectReference: (current: string, role: ChartSourceReferenceRole) => Promise<string | undefined>;
};

/** A source draft owns one captured chart; picker navigation does not change that owner. */
export function useChartSourceActions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getRevision: () => number;
  getEvaluator: () => SheetEvaluator;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  selectSheet: (sheetId: string) => void;
  selectDrawing?: (drawingId: string) => void;
  selectReference: (current: string, role: ChartSourceReferenceRole) => Promise<string | undefined>;
}) {
  const dialog = shallowRef<SourceOwner>();
  const error = ref(false);
  let sequence = 0;
  let disposed = false;
  let applying = false;
  let preparing = false;

  function validOwner(target: SourceOwner): boolean {
    return (
      !disposed &&
      target.workbook === options.getWorkbook() &&
      target.generation === options.getGeneration() &&
      target.workbook.sheets.get(target.sheet.id) === target.sheet &&
      target.sheet.drawings?.includes(target.initial) === true &&
      (target.picking || target.sheet === options.getSheet())
    );
  }
  function current(target: SourceOwner): boolean {
    return dialog.value === target && validOwner(target);
  }
  function allowed(target: SourceOwner): boolean {
    return (
      current(target) && !options.isBusy() && canUseSheetPermission(target.sheet, "editObjects")
    );
  }
  function close(target = dialog.value): void {
    if (!target || dialog.value !== target) return;
    dialog.value = undefined;
    error.value = false;
  }
  function commit(target: SourceOwner, candidate: SheetChartDrawing): boolean {
    if (applying || preparing || !allowed(target) || target.picking) return false;
    preparing = true;
    try {
      if (!options.flush() || !allowed(target)) return false;
    } catch {
      return false;
    } finally {
      preparing = false;
    }
    applying = true;
    try {
      // This entry edits data selection only, never placement, style, or chart type.
      if (
        JSON.stringify(normalizeSheetDrawings([{ ...candidate, chart: target.initial.chart }])) !==
        JSON.stringify(normalizeSheetDrawings([target.initial]))
      )
        throw new TypeError("Data selection cannot alter drawing geometry or identity.");
      const chart = normalizeSheetChart(candidate.chart);
      const preserved: Partial<SheetChart> = { ...chart };
      const original: Partial<SheetChart> = normalizeSheetChart(target.initial.chart);
      for (const key of [
        "range",
        "headerRow",
        "headerColumn",
        "seriesBy",
        "showHidden",
        "source",
      ] as const) {
        delete preserved[key];
        delete original[key];
      }
      if (JSON.stringify(preserved) !== JSON.stringify(original))
        throw new TypeError("Data selection cannot alter unrelated chart settings.");
      const evaluator = options.getEvaluator();
      const ownerEvaluator =
        target.sheet === options.getSheet() ? evaluator : evaluator.forSheet?.(target.sheet.id);
      if (!ownerEvaluator) throw new TypeError("Chart owner evaluator is unavailable.");
      const data = getSheetChartData(target.sheet, chart, ownerEvaluator, (id) =>
        target.workbook.sheets.get(id),
      );
      if (
        data.diagnostics?.some(
          (item) => item.code === "broken-reference" || item.code === "length-mismatch",
        )
      )
        throw new TypeError("Chart references must resolve to equally sized vectors.");
      if (!allowed(target)) return false;
      if (JSON.stringify(chart) === JSON.stringify(normalizeSheetChart(target.initial.chart))) {
        close(target);
        return true;
      }
      const forest = target.sheet.drawings;
      if (!forest?.includes(target.initial)) return false;
      const next = { ...target.initial, chart };
      const command = createSetSheetDrawingsCommand(
        target.sheet.id,
        forest.map((drawing) => (drawing === target.initial ? next : drawing)),
      );
      if (!allowed(target) || options.execute(command) === false) {
        if (current(target)) error.value = true;
        return false;
      }
      close(target);
      return true;
    } catch {
      if (current(target)) error.value = true;
      return false;
    } finally {
      applying = false;
    }
  }
  async function pick(
    target: SourceOwner,
    value: string,
    role: ChartSourceReferenceRole,
  ): Promise<string | undefined> {
    if (!allowed(target) || target.picking || applying || preparing) return undefined;
    target.picking = true;
    let result: string | undefined;
    try {
      result = await options.selectReference(value, role);
    } finally {
      // Only this still-current picker may restore the chart's owner tab.
      if (allowed(target)) {
        options.selectSheet(target.sheet.id);
        await nextTick();
        if (allowed(target)) options.selectDrawing?.(target.initial.id);
      }
      target.picking = false;
      if (dialog.value === target && !validOwner(target)) close(target);
    }
    return allowed(target) ? result : undefined;
  }
  function edit(drawing: SheetChartDrawing): void {
    if (
      disposed ||
      applying ||
      preparing ||
      options.isBusy() ||
      !canUseSheetPermission(options.getSheet(), "editObjects")
    )
      return;
    const workbook = options.getWorkbook();
    const sheet = options.getSheet();
    const generation = options.getGeneration();
    preparing = true;
    try {
      if (
        !sheet.drawings?.includes(drawing) ||
        !options.flush() ||
        workbook !== options.getWorkbook() ||
        generation !== options.getGeneration() ||
        sheet !== options.getSheet() ||
        workbook.sheets.get(sheet.id) !== sheet ||
        !sheet.drawings?.includes(drawing) ||
        options.isBusy() ||
        !canUseSheetPermission(sheet, "editObjects")
      )
        return;
      const next: SourceOwner = {
        dialogId: ++sequence,
        workbook,
        generation,
        sheet,
        initial: drawing,
        picking: false,
        isCurrent: () => current(next),
        commit: (candidate) => commit(next, candidate),
        close: () => close(next),
        selectReference: (value, role) => pick(next, value, role),
      };
      error.value = false;
      dialog.value = next;
    } catch {
      error.value = true;
    } finally {
      preparing = false;
    }
  }
  if (getCurrentScope()) {
    watch(
      [options.getWorkbook, options.getSheet, options.getGeneration, options.getRevision],
      () => {
        const target = dialog.value;
        if (target && !applying && !validOwner(target)) close(target);
      },
      { flush: "sync" },
    );
    onScopeDispose(() => {
      disposed = true;
      close();
    });
  }
  return { dialog, error, edit, close };
}
