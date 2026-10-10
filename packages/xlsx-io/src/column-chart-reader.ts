import { normalizeSheetChart } from "@sheetcraft/core/sheet-charts";
import { normalizeSheetDrawing, type SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Workbook } from "@sheetcraft/core/workbook";
import {
  chartBoolean,
  chartReferenceRange,
  readChartCache,
  readChartTitle,
} from "./chart-cache-reader.js";
import { only, single, type NativeChartPart } from "./chart-package-parts.js";
import { readNativeChartGeometry } from "./drawing-geometry.js";
import { ordinaryColumnChartSource } from "./column-charts.js";
import { attr, child, nodes } from "./pivot-xml.js";
import type { CompatibilityReportBuilder } from "./report.js";

/** Recover one live rectangular column source, never a guessed PivotTable owner. */
export function readXlsxColumnCharts(
  workbook: Workbook,
  parts: readonly NativeChartPart[],
  report: CompatibilityReportBuilder,
): void {
  const sheets = [...workbook.sheets.values()];
  for (const [index, part] of parts.entries()) {
    if (part.kind !== "ordinary") continue;
    try {
      const sheet = sheets[part.sheetIndex];
      if (!sheet) throw new Error("Missing chart sheet.");
      const native = single(part.chartSpace, "chart");
      const plot = single(native, "plotArea");
      const bar = single(plot, "barChart");
      if (
        chartBoolean(bar, "varyColors", false) ||
        (native.dispBlanksAs !== undefined && attr(single(native, "dispBlanksAs"), "val") !== "gap")
      )
        throw new Error("Unsupported ordinary chart semantics.");
      for (const name of ["catAx", "valAx"]) {
        const axis = single(plot, name);
        const scaling = single(axis, "scaling");
        only(scaling, ["orientation"]);
        if (
          attr(single(scaling, "orientation"), "val") !== "minMax" ||
          chartBoolean(axis, "delete", false)
        )
          throw new Error("Unsupported chart axis.");
      }
      const series = nodes(bar.ser);
      const category = single(single(series[0]!, "cat"), "strRef");
      const categories = chartReferenceRange(category, sheet.name);
      if (categories.start.column !== categories.end.column || categories.start.row < 1)
        throw new Error("Unsupported category span.");
      const range = {
        start: { row: categories.start.row - 1, column: categories.start.column },
        end: { row: categories.end.row, column: categories.start.column + series.length },
      };
      const chart = normalizeSheetChart({
        type: "column",
        range,
        title: readChartTitle(native, true),
        headerRow: true,
        headerColumn: true,
        seriesBy: "columns",
        legend: native.legend !== undefined,
        labels: chartBoolean(child(bar, "dLbls"), "showVal", false),
        stacked: false,
        showHidden: !chartBoolean(native, "plotVisOnly", true),
      });
      if (
        ["showLegendKey", "showCatName", "showSerName", "showPercent", "showBubbleSize"].some(
          (name) => chartBoolean(child(bar, "dLbls"), name, false),
        )
      )
        throw new Error("Unsupported chart label content.");
      if (nodes(bar.dLbls).length > 1 || nodes(native.legend).length > 1)
        throw new Error("Ambiguous chart presentation.");
      const source = ordinaryColumnChartSource(workbook, sheet, chart);
      if (!source) throw new Error("Unsupported ordinary chart source.");
      const { data } = source;
      if (
        data.categories.length !== categories.end.row - categories.start.row + 1 ||
        data.series.length !== series.length ||
        !data.series.some((item) => item.values.some((value) => value !== null))
      )
        throw new Error("Unsupported ordinary chart data.");
      for (const [seriesIndex, item] of series.entries()) {
        only(single(item, "tx"), ["strRef"]);
        only(single(item, "cat"), ["strRef"]);
        only(single(item, "val"), ["numRef"]);
        // WPS's default per-series labels are explicitly disabled. More detailed
        // per-point/per-series label settings have no Core counterpart here.
        if (item.dLbls !== undefined) {
          const labels = single(item, "dLbls");
          only(labels, ["delete"]);
          if (!chartBoolean(labels, "delete", false) || chart.labels)
            throw new Error("Unsupported series labels.");
        }
        const title = single(single(item, "tx"), "strRef");
        const category = single(single(item, "cat"), "strRef");
        const value = single(single(item, "val"), "numRef");
        const titleRange = chartReferenceRange(title, sheet.name);
        const categoryRange = chartReferenceRange(category, sheet.name);
        const valueRange = chartReferenceRange(value, sheet.name);
        const column = range.start.column + 1 + seriesIndex;
        if (
          titleRange.start.row !== range.start.row ||
          titleRange.end.row !== range.start.row ||
          titleRange.start.column !== column ||
          titleRange.end.column !== column ||
          JSON.stringify(categoryRange) !== JSON.stringify(categories) ||
          valueRange.start.row !== categories.start.row ||
          valueRange.end.row !== categories.end.row ||
          valueRange.start.column !== column ||
          valueRange.end.column !== column
        )
          throw new Error("Chart formulas do not describe one rectangular source.");
        const names = readChartCache(title, false);
        if (
          names.length !== 1 ||
          names[0] !== data.series[seriesIndex]!.name ||
          JSON.stringify(readChartCache(category, false)) !== JSON.stringify(data.categories) ||
          JSON.stringify(readChartCache(value, true)) !==
            JSON.stringify(data.series[seriesIndex]!.values)
        )
          throw new Error("Chart caches disagree with the worksheet source.");
      }
      const geometry = readNativeChartGeometry(
        sheet,
        part.anchorKind,
        part.anchor,
        part.frame,
        part.wpsChartProperties,
      );
      let id = `xlsx-column-chart-${part.sheetIndex}-${index}`;
      while (sheet.drawings?.some((drawing) => drawing.id === id)) id += "_2";
      const drawing = normalizeSheetDrawing({
        id,
        name: attr(child(single(part.frame, "nvGraphicFramePr"), "cNvPr"), "name", "Chart"),
        kind: "chart",
        ...geometry,
        chart,
        text: "",
        shape: "rectangle",
        fill: "#ffffff",
        stroke: "#d9e2ef",
        strokeWidth: 1,
        color: "#0f172a",
        fontSize: 14,
        bold: false,
        italic: false,
        rotation: 0,
      }) as SheetChartDrawing;
      (sheet.drawings ??= []).push(drawing);
      report.add("style-omitted", "warning", `${part.chartPart}.nativePresentation`);
      if (geometry.approximated) report.add("dimension-approximated", "warning", part.drawingPart);
    } catch {
      report.add("feature-omitted", "warning", part.chartPart);
    }
  }
}
