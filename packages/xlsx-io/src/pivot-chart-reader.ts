import { getSheetChartData, type SheetChart } from "@sheetcraft/core/sheet-charts";
import { normalizeSheetDrawing, type SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { createWorkbookEvaluator, type Workbook } from "@sheetcraft/core/workbook";
import { only, single, type NativePivotChartPart } from "./chart-package-parts.js";
import { readNativeChartGeometry } from "./drawing-geometry.js";
import { attr, child, nodes, parseRange, type XmlNode } from "./pivot-xml.js";
import type { ImportedPivotTable } from "./pivot-tables.js";
import type { CompatibilityReportBuilder } from "./report.js";

function cache(reference: XmlNode, numeric: boolean): Array<string | number | null> {
  const root = single(reference, numeric ? "numCache" : "strCache");
  only(reference, ["f", numeric ? "numCache" : "strCache"]);
  only(root, numeric ? ["formatCode", "ptCount", "pt"] : ["ptCount", "pt"]);
  const countText = attr(single(root, "ptCount"), "val");
  if (!/^\d+$/.test(countText)) throw new Error("Invalid chart count.");
  const count = Number(countText);
  if (!Number.isSafeInteger(count) || count < 1 || count > 10000)
    throw new Error("Invalid chart count.");
  const result: Array<string | number | null> = Array(count).fill(null);
  const seen = new Set<number>();
  const points = nodes(root.pt);
  if ((Array.isArray(root.pt) ? root.pt.length : root.pt === undefined ? 0 : 1) !== points.length)
    throw new Error("Invalid chart point.");
  for (const point of points) {
    only(point, ["v"]);
    const indexText = attr(point, "idx");
    const value = point.v;
    if (!/^\d+$/.test(indexText) || typeof value !== "string" || value.length > 32767)
      throw new Error("Invalid chart point.");
    const index = Number(indexText);
    if (!Number.isSafeInteger(index) || index >= count || seen.has(index))
      throw new Error("Invalid chart point index.");
    seen.add(index);
    if (
      numeric &&
      (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) ||
        !Number.isFinite(Number(value)))
    )
      throw new Error("Invalid numeric chart cache.");
    result[index] = numeric ? Number(value) : value;
  }
  if (!numeric && seen.size !== count) throw new Error("Incomplete chart text cache.");
  return result;
}
function referenceRange(reference: XmlNode, sheetName: string) {
  if (typeof reference.f !== "string") throw new Error("Missing chart reference.");
  const match = /^(?:'((?:[^']|'')+)'|([^'!\x5b\x5d]+))!(\$[A-Z]+\$\d+(?::\$[A-Z]+\$\d+)?)$/u.exec(
    reference.f,
  );
  if (
    !match ||
    (match[1]?.replace(/''/g, "'") ?? match[2])?.toLowerCase() !== sheetName.toLowerCase()
  )
    throw new Error("Unsupported chart reference.");
  return parseRange(match[3]!);
}
function boolean(node: XmlNode, name: string, fallback: boolean): boolean {
  if (node[name] === undefined) return fallback;
  const value = attr(single(node, name), "val");
  if (!["0", "1", "false", "true"].includes(value)) throw new Error("Invalid chart flag.");
  return value === "1" || value === "true";
}
function chartTitle(chart: XmlNode): string {
  if (chart.title === undefined) return "";
  const rich = single(single(single(chart, "title"), "tx"), "rich");
  const texts: string[] = [];
  const visit = (node: XmlNode) => {
    for (const [name, value] of Object.entries(node)) {
      if (name === "t") {
        if (typeof value !== "string") throw new Error("Unsupported chart title.");
        texts.push(value);
      } else for (const entry of nodes(value)) visit(entry);
    }
  };
  visit(rich);
  const title = texts.join("");
  if (title.length > 1000) throw new Error("Chart title too long.");
  return title;
}

/** Attach only a genuine owner link after cache/formula/layout and Core validation all pass. */
export function readXlsxPivotCharts(
  workbook: Workbook,
  parts: readonly NativePivotChartPart[],
  pivots: readonly ImportedPivotTable[],
  report: CompatibilityReportBuilder,
): void {
  const sheets = [...workbook.sheets.values()];
  for (const [index, part] of parts.entries()) {
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
        title: chartTitle(native),
        headerRow: true,
        headerColumn: true,
        seriesBy: "columns",
        legend: native.legend !== undefined,
        labels: boolean(child(bar, "dLbls"), "showVal", false),
        stacked: false,
        showHidden: !boolean(native, "plotVisOnly", true),
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
        const titleRange = referenceRange(title, sheet.name);
        const catRange = referenceRange(category, sheet.name);
        const valRange = referenceRange(value, sheet.name);
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
        const names = cache(title, false);
        const categories = cache(category, false);
        const values = cache(value, true);
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
