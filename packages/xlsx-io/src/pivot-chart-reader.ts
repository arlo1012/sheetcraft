import { getSheetChartData, type SheetChart } from "@sheetcraft/core/sheet-charts";
import { normalizeSheetDrawing, type SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { createWorkbookEvaluator, type Workbook } from "@sheetcraft/core/workbook";
import { only, single, type NativeChartPart } from "./chart-package-parts.js";
import { readNativeChartGeometry } from "./drawing-geometry.js";
import { attr, child, nodes } from "./pivot-xml.js";
import type { ImportedPivotTable } from "./pivot-tables.js";
import type { CompatibilityReportBuilder } from "./report.js";
import {
  readChartCache,
  chartReferenceRange,
  chartBoolean,
  readChartTitle,
} from "./chart-cache-reader.js";

/** Attach only a genuine owner link after cache/formula/layout and Core validation all pass. */
export function readXlsxPivotCharts(
  workbook: Workbook,
  parts: readonly NativeChartPart[],
  pivots: readonly ImportedPivotTable[],
  report: CompatibilityReportBuilder,
): void {
  const sheets = [...workbook.sheets.values()];
  for (const [index, part] of parts.entries()) {
    if (part.kind !== "pivot") continue;
    try {
      const sheet = sheets[part.sheetIndex];
      if (!sheet) throw new Error("Missing chart sheet.");
      const source = single(part.chartSpace, "pivotSource");
      const identity =
        typeof source.name === "string" && /^\[([^\x5b\x5d\\/]+)\](.+)!([^!]+)$/u.exec(source.name);
      if (!identity) throw new Error("Invalid native pivot identity.");
      const ownerName = identity[2]!;
      const owners = pivots.filter(
        (owner) =>
          owner.sheetPart === part.sheetPart &&
          owner.cachedLeafLayout &&
          owner.sheet.name.toLowerCase() === ownerName.toLowerCase() &&
          owner.nativeName.toLowerCase() === identity[3]!.toLowerCase(),
      );
      if (owners.length !== 1 || owners[0]!.sheet !== sheet)
        throw new Error("Unresolved native pivot owner.");
      const table = owners[0]!.table;
      const range = table.outputRange!;
      const layout = table.resultLayout!;
      if (
        (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1) >
        10000
      )
        throw new Error("Chart range too large.");
      const native = single(part.chartSpace, "chart");
      const bar = single(single(native, "plotArea"), "barChart");
      const chart: SheetChart = {
        pivotTableId: table.id,
        type: "column",
        range,
        title: readChartTitle(native),
        headerRow: true,
        headerColumn: true,
        seriesBy: "columns",
        legend: native.legend !== undefined,
        labels: chartBoolean(child(bar, "dLbls"), "showVal", false),
        stacked: false,
        showHidden: !chartBoolean(native, "plotVisOnly", true),
      };
      if (nodes(bar.dLbls).length > 1) throw new Error("Ambiguous chart labels.");
      if (nodes(native.legend).length > 1) throw new Error("Ambiguous chart legend.");
      const evaluator = createWorkbookEvaluator(workbook, sheet.id);
      const data = getSheetChartData(sheet, chart, evaluator);
      const series = nodes(bar.ser);
      if (
        !data.categories.length ||
        data.categories.length * series.length > 10000 ||
        series.length !== data.series.length ||
        data.categories.length !== layout.dataRows.length ||
        layout.dataRows.some((row, i) => row !== layout.headerRows! + i)
      )
        throw new Error("Unsupported native chart layout.");
      const firstRow = range.start.row + layout.headerRows!;
      const lastRow = firstRow + data.categories.length - 1;
      for (const [seriesIndex, item] of series.entries()) {
        only(single(item, "tx"), ["strRef"]);
        only(single(item, "cat"), ["strRef"]);
        only(single(item, "val"), ["numRef"]);
        const title = single(single(item, "tx"), "strRef");
        const category = single(single(item, "cat"), "strRef");
        const value = single(single(item, "val"), "numRef");
        const column = range.start.column + 1 + seriesIndex;
        const titleRange = chartReferenceRange(title, sheet.name);
        const catRange = chartReferenceRange(category, sheet.name);
        const valRange = chartReferenceRange(value, sheet.name);
        if (
          titleRange.start.column !== column ||
          titleRange.end.column !== column ||
          titleRange.start.row < range.start.row ||
          titleRange.end.row !== firstRow - 1 ||
          ![catRange, valRange].every(
            (ref) =>
              ref.start.row === firstRow &&
              ref.start.column === ref.end.column &&
              (ref.end.row === lastRow || (table.rowTotals && ref.end.row === lastRow + 1)),
          ) ||
          catRange.start.column !== range.start.column ||
          valRange.start.column !== column
        )
          throw new Error("Native chart references do not match saved report.");
        const names = readChartCache(title, false);
        const categories = readChartCache(category, false);
        const values = readChartCache(value, true);
        if (
          names.length !== 1 ||
          names[0] !== data.series[seriesIndex]!.name ||
          JSON.stringify(categories) !== JSON.stringify(data.categories) ||
          JSON.stringify(values) !== JSON.stringify(data.series[seriesIndex]!.values)
        )
          throw new Error("Native chart caches do not match saved report.");
      }
      const geometry = readNativeChartGeometry(
        sheet,
        part.anchorKind,
        part.anchor,
        part.frame,
        part.wpsChartProperties,
      );
      const name = attr(
        child(single(part.frame, "nvGraphicFramePr"), "cNvPr"),
        "name",
        "PivotChart",
      );
      let id = `xlsx-pivot-chart-${part.sheetIndex}-${index}`;
      while (sheet.drawings?.some((drawing) => drawing.id === id)) id += "_2";
      const drawing = normalizeSheetDrawing({
        id,
        name,
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
