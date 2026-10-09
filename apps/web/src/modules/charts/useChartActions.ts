import { shallowRef, ref } from "vue";
import { canUseSheetPermission } from "@idea10/core";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@idea10/core/commands";
import { normalizeSheetChart, getSheetChartData, type ChartType } from "@idea10/core/sheet-charts";
import type { SheetChartDrawing, SheetDrawing } from "@idea10/core/sheet-drawings";
import type { Workbook, Sheet, CellRange, SheetEvaluator } from "@idea10/core/workbook";
import { resolveDataRange } from "@idea10/core/data-range";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import { resolveRangeReference } from "../../shared/range-reference/formatRangeReference";
export function useChartActions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getRange: () => CellRange;
  getEvaluator: () => SheetEvaluator;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  name: () => string;
}) {
  const editing = shallowRef<SheetChartDrawing>();
  const error = ref(false);
  const idFactory = createBrowserIdFactory();
  let target:
    | { workbook: Workbook; sheetId: string; existing: boolean; dashboard: boolean }
    | undefined;
  const allowed = () =>
    !options.isBusy() && canUseSheetPermission(options.getSheet(), "editObjects");
  function insert(type: ChartType | "dashboard") {
    if (!allowed() || !options.flush()) return;
    const sheet = options.getSheet();
    const selection = options.getRange();
    const range = resolveDataRange(sheet, selection) ?? selection;
    target = {
      workbook: options.getWorkbook(),
      sheetId: sheet.id,
      existing: false,
      dashboard: type === "dashboard",
    };
    error.value = false;
    editing.value = {
      id: idFactory("chart"),
      kind: "chart",
      name: options.name(),
      anchor: { ...selection.start },
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
        type: type === "dashboard" ? "column" : type,
        range,
        title: options.name(),
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
  function edit(drawing: SheetChartDrawing) {
    if (!allowed() || !options.flush()) return;
    target = {
      workbook: options.getWorkbook(),
      sheetId: options.getSheet().id,
      existing: true,
      dashboard: false,
    };
    editing.value = drawing;
    error.value = false;
  }
  function confirm(drawing: SheetChartDrawing, source: string) {
    if (
      !allowed() ||
      !target ||
      target.workbook !== options.getWorkbook() ||
      target.sheetId !== options.getSheet().id ||
      editing.value?.id !== drawing.id
    )
      return;
    const reference = resolveRangeReference(target.workbook, source, target.sheetId);
    if (!drawing.chart.dataCache && (!reference || reference.sheetId !== target.sheetId)) {
      error.value = true;
      return;
    }
    try {
      const next: SheetChartDrawing = {
        ...drawing,
        chart: normalizeSheetChart({
          ...drawing.chart,
          range: reference?.range ?? drawing.chart.range,
        }),
      };
      const data = getSheetChartData(options.getSheet(), next.chart, options.getEvaluator());
      if (
        !data.series.some((series) => series.values.some((value) => value !== null)) &&
        next.chart.type !== "sankey"
      ) {
        error.value = true;
        return;
      }
      if (
        (next.chart.type === "scatter" && data.series.length < 2) ||
        (next.chart.type === "sankey" &&
          (reference
            ? reference.range.end.column - reference.range.start.column < 2
            : !next.chart.dataCache))
      ) {
        error.value = true;
        return;
      }
      const current = options.getSheet().drawings ?? [];
      let drawings: SheetDrawing[];
      if (target.existing) {
        if (!current.some((item) => item.id === next.id)) {
          close();
          return;
        }
        drawings = current.map((item) => (item.id === next.id ? next : item));
      } else if (target.dashboard)
        drawings = [
          ...current,
          ...(["column", "line", "pie", "bar"] as const).map((type, index) => ({
            ...next,
            id: index ? idFactory("chart") : next.id,
            offsetX: next.offsetX + (index % 2) * 500,
            offsetY: next.offsetY + Math.floor(index / 2) * 320,
            chart: { ...next.chart, type },
          })),
        ];
      else drawings = [...current, next];
      if (options.execute(createSetSheetDrawingsCommand(target.sheetId, drawings)) === false) {
        error.value = true;
        return;
      }
      close();
    } catch {
      error.value = true;
    }
  }
  function close() {
    editing.value = undefined;
    target = undefined;
    error.value = false;
  }
  return { editing, error, insert, edit, confirm, close };
}
