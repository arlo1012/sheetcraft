import { computed, getCurrentScope, onScopeDispose, ref } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import {
  getSheetChartData,
  getSheetChartSourceData,
  type ChartData,
} from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Sheet, SheetEvaluator, Workbook } from "@sheetcraft/core/workbook";
import { applyChartFormatIntent } from "./chart-format-intents";
import {
  getChartFormatTargets,
  chartFormatTargetKey,
  type ChartFormatIntent,
  type ChartFormatTarget,
} from "./chart-format-pane";
import { createChartOption } from "./chart-option";
import { preflightChartDataTable } from "./chart-data-table-preflight";

/** Each form callback owns an exact drawing and element, including after flushing edits. */
export function useChartFormatControls(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getRevision: () => number;
  getSelectedId: () => string | null;
  getTarget: () => ChartFormatTarget;
  getEvaluator: () => SheetEvaluator;
  isOpen: () => boolean;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
}) {
  const error = ref(false);
  let disposed = false;
  let applying = false;
  if (getCurrentScope()) onScopeDispose(() => (disposed = true));
  const snapshot = computed(() => {
    const workbook = options.getWorkbook(),
      sheet = options.getSheet(),
      generation = options.getGeneration(),
      revision = options.getRevision(),
      id = options.getSelectedId(),
      target = options.getTarget(),
      forest = sheet.drawings;
    const node = forest?.find((entry) => entry.id === id);
    if (!node || node.kind !== "chart" || !options.isOpen()) return;
    const drawing: SheetChartDrawing = node;
    const isCurrent = () =>
      !disposed &&
      options.isOpen() &&
      workbook === options.getWorkbook() &&
      generation === options.getGeneration() &&
      revision === options.getRevision() &&
      sheet === options.getSheet() &&
      workbook.sheets.get(sheet.id) === sheet &&
      id === options.getSelectedId() &&
      target === options.getTarget() &&
      forest === sheet.drawings &&
      forest?.includes(drawing) === true;
    const allowed = () =>
      isCurrent() && !options.isBusy() && canUseSheetPermission(sheet, "editObjects");
    let data: ChartData;
    try {
      data = getSheetChartSourceData(sheet, drawing.chart, options.getEvaluator(), (sheetId) =>
        workbook.sheets.get(sheetId),
      );
    } catch {
      return;
    }
    const capturedData = data;
    const visibleData = getSheetChartData(sheet, drawing.chart, options.getEvaluator(), (sheetId) =>
      workbook.sheets.get(sheetId),
    );
    return {
      drawing,
      target,
      data: capturedData,
      visibleData,
      disabled: !canUseSheetPermission(sheet, "editObjects"),
      isCurrent,
      apply(intent: ChartFormatIntent): boolean {
        if (applying || !allowed()) return false;
        applying = true;
        try {
          if (!options.flush() || !allowed()) return false;
          if (
            !getChartFormatTargets(
              drawing.chart,
              capturedData,
              getSheetChartData(sheet, drawing.chart, options.getEvaluator(), (sheetId) =>
                workbook.sheets.get(sheetId),
              ),
            ).some((candidate) => chartFormatTargetKey(candidate) === chartFormatTargetKey(target))
          )
            throw new TypeError("Chart element is unavailable.");
          const chart = applyChartFormatIntent(drawing.chart, target, intent);
          // A first range-series edit creates its identity in this same candidate, never on read.
          const preparedData = getSheetChartData(sheet, chart, options.getEvaluator(), (sheetId) =>
            workbook.sheets.get(sheetId),
          );
          // Validate real mathematical domain/interval budgets before a history write.
          createChartOption(chart, preparedData, {
            width: drawing.width,
            height: drawing.height,
            theme: workbook.theme,
          });
          if (!allowed()) return false;
          if (JSON.stringify(chart) === JSON.stringify(drawing.chart)) {
            error.value = false;
            return true;
          }
          preflightChartDataTable(
            chart,
            preparedData,
            { ...drawing, theme: workbook.theme },
            getSheetChartSourceData(sheet, chart, options.getEvaluator(), (sheetId) =>
              workbook.sheets.get(sheetId),
            ),
          );
          if (!allowed()) return false;
          const next = { ...drawing, chart };
          const command = createSetSheetDrawingsCommand(
            sheet.id,
            forest!.map((entry) => (entry === drawing ? next : entry)),
          );
          if (!allowed() || options.execute(command) === false) {
            if (isCurrent()) error.value = true;
            return false;
          }
          error.value = false;
          return true;
        } catch {
          if (isCurrent()) error.value = true;
          return false;
        } finally {
          applying = false;
        }
      },
    };
  });
  return { snapshot, error };
}
