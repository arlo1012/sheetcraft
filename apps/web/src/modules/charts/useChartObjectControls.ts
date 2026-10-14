import { computed, getCurrentScope, onScopeDispose, ref } from "vue";
import { canUseSheetPermission } from "@sheetcraft/core";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { normalizeSheetChart, type SheetChart } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Sheet, Workbook } from "@sheetcraft/core/workbook";
import type { ChartElementPatch } from "./chart-element-controls";
import { getChartElementCapabilities } from "./chart-elements";

/** Only rendered element fields may cross this object-level action boundary. */
function applyElementPatch(chart: SheetChart, patch: ChartElementPatch): SheetChart {
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new TypeError("Invalid chart element change.");
  const prototype: unknown = Object.getPrototypeOf(patch);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError("Invalid chart element change.");
  const next = { ...chart };
  const capabilities = getChartElementCapabilities(chart.type);
  for (const key of Reflect.ownKeys(patch)) {
    const descriptor = Object.getOwnPropertyDescriptor(patch, key);
    if (typeof key !== "string" || !descriptor || !("value" in descriptor))
      throw new TypeError("Chart elements require ordinary data fields.");
    const value: unknown = descriptor.value;
    if (key === "title" && typeof value === "string") next.title = value;
    else if (key === "legend" && typeof value === "boolean" && capabilities.legend)
      next.legend = value;
    else if (key === "labels" && typeof value === "boolean" && capabilities.labels)
      next.labels = value;
    else if (key === "stacked" && typeof value === "boolean" && capabilities.stacked)
      next.stacked = value;
    else if (key === "elements" && value && typeof value === "object") {
      // The Core normalizer verifies settings before we inspect their values.
      const normalized = normalizeSheetChart({
        ...next,
        elements: value as SheetChart["elements"],
      });
      const elements = normalized.elements!;
      if (
        (!capabilities.legend &&
          (("legendPosition" in elements &&
            elements.legendPosition !== chart.elements?.legendPosition) ||
            ("legendOverlay" in elements &&
              elements.legendOverlay !== chart.elements?.legendOverlay))) ||
        ("labelPosition" in elements &&
          !capabilities.labelPosition &&
          elements.labelPosition !== chart.elements?.labelPosition)
      )
        throw new TypeError("This chart does not support this element position.");
      next.elements = { ...next.elements, ...elements };
    } else throw new TypeError("Unsupported chart element change.");
  }
  return normalizeSheetChart(next);
}

export function useChartObjectControls(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getRevision: () => number;
  getSelectedId: () => string | null;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  edit: (drawing: SheetChartDrawing) => void;
}) {
  const error = ref(false);
  let disposed = false;
  let applying = false;
  let preparing = false;
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
    });
  const snapshot = computed(() => {
    const workbook = options.getWorkbook(),
      sheet = options.getSheet();
    const generation = options.getGeneration(),
      revision = options.getRevision();
    const id = options.getSelectedId();
    const forest = sheet.drawings;
    const drawing = forest?.find((node) => node.id === id);
    if (!drawing || drawing.kind !== "chart") return;
    const isCurrent = () =>
      !disposed &&
      workbook === options.getWorkbook() &&
      generation === options.getGeneration() &&
      revision === options.getRevision() &&
      sheet === options.getSheet() &&
      workbook.sheets.get(sheet.id) === sheet &&
      id === options.getSelectedId() &&
      sheet.drawings === forest &&
      forest?.includes(drawing) === true;
    const allowed = () =>
      isCurrent() && !options.isBusy() && canUseSheetPermission(sheet, "editObjects");
    const prepare = () => {
      if (applying || preparing || !allowed()) return false;
      preparing = true;
      try {
        return options.flush() && allowed();
      } catch {
        return false;
      } finally {
        preparing = false;
      }
    };
    const change = (
      build: () => SheetChart,
      after?: (currentDrawing: SheetChartDrawing) => void,
    ): boolean => {
      if (!prepare()) return false;
      applying = true;
      try {
        const chart = build();
        if (!allowed()) return false;
        if (JSON.stringify(chart) === JSON.stringify(drawing.chart)) {
          error.value = false;
          if (allowed()) after?.(drawing);
          return true;
        }
        const next = { ...drawing, chart };
        const command = createSetSheetDrawingsCommand(
          sheet.id,
          forest!.map((item) => (item === drawing ? next : item)),
        );
        if (!allowed() || options.execute(command) === false) {
          if (isCurrent()) error.value = true;
          return false;
        }
        if (after) {
          // The only accepted new owner is the exact replacement produced by this command.
          // Do not re-resolve an arbitrary latest selection after committing the title.
          const replacementForest = sheet.drawings;
          const replacement = replacementForest?.find((item) => item.id === id);
          if (
            disposed ||
            workbook !== options.getWorkbook() ||
            generation !== options.getGeneration() ||
            sheet !== options.getSheet() ||
            workbook.sheets.get(sheet.id) !== sheet ||
            id !== options.getSelectedId() ||
            options.isBusy() ||
            !canUseSheetPermission(sheet, "editObjects") ||
            !replacement ||
            replacement.kind !== "chart" ||
            JSON.stringify(replacementForest) !== JSON.stringify(command.drawings)
          )
            return false;
          after(replacement);
        }
        error.value = false;
        return true;
      } catch {
        if (isCurrent()) error.value = true;
        return false;
      } finally {
        applying = false;
      }
    };
    const edit = () => {
      if (!prepare()) return;
      options.edit(drawing);
    };
    const canSwitchDirection =
      !drawing.chart.pivotTableId && !drawing.chart.dataCache && !!drawing.chart.range;
    return {
      drawing,
      isCurrent,
      disabled: !canUseSheetPermission(sheet, "editObjects"),
      apply: (patch: ChartElementPatch) => change(() => applyElementPatch(drawing.chart, patch)),
      edit,
      source: edit,
      applyAndRun: (
        patch: ChartElementPatch,
        action: "edit" | "source" | "switchDirection",
      ): boolean => {
        if (action !== "edit" && action !== "source" && action !== "switchDirection") return false;
        if (action === "switchDirection" && !canSwitchDirection) return false;
        return change(
          () => {
            const chart = applyElementPatch(drawing.chart, patch);
            return action === "switchDirection"
              ? normalizeSheetChart({
                  ...chart,
                  seriesBy: chart.seriesBy === "rows" ? "columns" : "rows",
                })
              : chart;
          },
          action === "switchDirection" ? undefined : (replacement) => options.edit(replacement),
        );
      },
      switchDirection: canSwitchDirection
        ? () =>
            change(() =>
              normalizeSheetChart({
                ...drawing.chart,
                seriesBy: drawing.chart.seriesBy === "rows" ? "columns" : "rows",
              }),
            )
        : undefined,
    };
  });
  return { snapshot, error };
}
