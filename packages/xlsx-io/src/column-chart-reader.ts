import { normalizeSheetChart, type SheetChart } from "@sheetcraft/core/sheet-charts";
import { normalizeSheetDrawing, type SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  getCellContent,
  type CellRange,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";
import {
  chartBoolean,
  chartReferenceRange,
  readChartCache,
  readChartTitle,
} from "./chart-cache-reader.js";
import { only, single, type NativeChartPart } from "./chart-package-parts.js";
import { readNativeChartGeometry } from "./drawing-geometry.js";
import { ordinaryColumnChartSource } from "./column-charts.js";
import { attr, child, nodes, type XmlNode } from "./pivot-xml.js";
import type { CompatibilityReportBuilder } from "./report.js";

function sameRange(a: CellRange, b: CellRange): boolean {
  return (
    a.start.row === b.start.row &&
    a.start.column === b.start.column &&
    a.end.row === b.end.row &&
    a.end.column === b.end.column
  );
}
function textCacheMatches(reference: XmlNode, expected: readonly string[]): boolean {
  // WPS omits category cache points for actual blank cells. Their positions
  // remain meaningful; only an independently verified empty source label may
  // match a missing point. Linked PivotChart's stricter cache reader is unchanged.
  const cache = readChartCache(reference, false, true);
  return (
    cache.length === expected.length &&
    cache.every(
      (value, index) => value === expected[index] || (value === null && expected[index] === ""),
    )
  );
}

function numericCacheMatches(
  reference: XmlNode,
  expected: readonly (number | null)[],
  span: CellRange,
  sheet: Sheet,
  labels: boolean,
  allowTextZero: boolean,
): { matches: boolean; normalized: boolean } {
  const cache = readChartCache(reference, true);
  let normalized = false;
  const matches =
    cache.length === expected.length &&
    cache.every((value, index) => {
      if (value === expected[index]) return true;
      // Observed WPS saves ordinary nonnumeric text as 0 in numCache. Recover
      // Core's missing point from the literal worksheet source, with a warning.
      // WPS also retains an exact empty literal string's source identity while
      // caching it as zero. That is distinguishable from a genuinely blank cell.
      // Never normalize real numbers, blanks, whitespace-only text, booleans,
      // errors, numeric-looking strings, formulas or value-labelled zeros.
      const cell = getCellContent(sheet, {
        row: span.start.row + (span.start.column === span.end.column ? index : 0),
        column: span.start.column + (span.start.row === span.end.row ? index : 0),
      });
      if (
        allowTextZero &&
        !labels &&
        expected[index] === null &&
        value === 0 &&
        cell?.kind === "literal" &&
        typeof cell.value === "string" &&
        (cell.value === "" || (cell.value.trim() !== "" && !Number.isFinite(Number(cell.value))))
      ) {
        normalized = true;
        return true;
      }
      return false;
    });
  return { matches, normalized };
}

function recoverSource(
  workbook: Workbook,
  sheet: Sheet,
  series: readonly XmlNode[],
  base: Omit<SheetChart, "range" | "headerRow" | "headerColumn" | "seriesBy">,
): { chart: SheetChart; normalized: boolean } {
  const values = series.map((item) => {
    only(single(item, "val"), ["numRef"]);
    return chartReferenceRange(single(single(item, "val"), "numRef"), sheet.name);
  });
  const block = {
    start: {
      row: Math.min(...values.map((span) => span.start.row)),
      column: Math.min(...values.map((span) => span.start.column)),
    },
    end: {
      row: Math.max(...values.map((span) => span.end.row)),
      column: Math.max(...values.map((span) => span.end.column)),
    },
  };
  const candidates: Array<{ chart: SheetChart; normalized: boolean }> = [];
  for (const seriesBy of ["columns", "rows"] as const)
    for (const headerRow of [true, false])
      for (const headerColumn of [true, false]) {
        try {
          const chart = normalizeSheetChart({
            ...base,
            seriesBy,
            headerRow,
            headerColumn,
            range: {
              start: {
                row: block.start.row - Number(headerRow),
                column: block.start.column - Number(headerColumn),
              },
              end: block.end,
            },
          });
          const source = ordinaryColumnChartSource(workbook, sheet, chart);
          if (!source || source.valueRanges.length !== series.length) continue;
          let matches = true;
          let normalized = false;
          for (const [index, item] of series.entries()) {
            const value = single(single(item, "val"), "numRef");
            if (!sameRange(values[index]!, source.valueRanges[index]!)) {
              matches = false;
              break;
            }
            const numeric = numericCacheMatches(
              value,
              source.data.series[index]!.values,
              source.valueRanges[index]!,
              sheet,
              chart.labels,
              chart.type === "column",
            );
            if (!numeric.matches) {
              matches = false;
              break;
            }
            normalized ||= numeric.normalized;
            only(single(item, "tx"), ["strRef"]);
            const title = single(single(item, "tx"), "strRef");
            const nameRange = source.nameRanges[index]!;
            if (
              nameRange
                ? !sameRange(chartReferenceRange(title, sheet.name), nameRange)
                : title.f !== JSON.stringify(String(index + 1))
            ) {
              matches = false;
              break;
            }
            if (!textCacheMatches(title, [source.names[index]!])) {
              matches = false;
              break;
            }
            if (source.categoryRange) {
              only(single(item, "cat"), ["strRef"]);
              const category = single(single(item, "cat"), "strRef");
              if (
                !sameRange(chartReferenceRange(category, sheet.name), source.categoryRange) ||
                !textCacheMatches(category, source.data.categories)
              ) {
                matches = false;
                break;
              }
            } else if (item.cat !== undefined) {
              matches = false;
              break;
            }
          }
          if (matches) candidates.push({ chart, normalized });
        } catch {
          /* This option does not prove the actual native references. */
        }
      }
  if (candidates.length !== 1) throw new Error("Missing or ambiguous rectangular chart source.");
  return candidates[0]!;
}

/** Recover a proven ordinary column/straight marker line, never guessed pivot ownership. */
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
      const line = plot.lineChart !== undefined;
      const bar = single(plot, line ? "lineChart" : "barChart");
      if (line && (!chartBoolean(bar, "marker", false) || chartBoolean(bar, "smooth", false)))
        throw new Error("Unsupported line markers or smoothing.");
      if (
        line &&
        (native.dispBlanksAs === undefined || attr(single(native, "dispBlanksAs"), "val") !== "gap")
      )
        throw new Error("Unproven line missing-point behavior.");
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
        if (line && attr(single(axis, "axPos"), "val") !== (name === "catAx" ? "b" : "l"))
          throw new Error("Unproven line axis position.");
      }
      const series = nodes(bar.ser);
      const base = {
        type: line ? ("line" as const) : ("column" as const),
        title: readChartTitle(native, true),
        legend: native.legend !== undefined,
        labels: chartBoolean(child(bar, "dLbls"), "showVal", false),
        stacked: false,
        showHidden: !chartBoolean(native, "plotVisOnly", true),
      };
      if (
        ["showLegendKey", "showCatName", "showSerName", "showPercent", "showBubbleSize"].some(
          (name) => chartBoolean(child(bar, "dLbls"), name, false),
        )
      )
        throw new Error("Unsupported chart label content.");
      if (nodes(bar.dLbls).length > 1 || nodes(native.legend).length > 1)
        throw new Error("Ambiguous chart presentation.");
      for (const item of series) {
        if (line) {
          const marker = single(item, "marker");
          only(marker, ["symbol", "size", "spPr"]);
          const size = Number(attr(single(marker, "size"), "val"));
          if (
            attr(single(marker, "symbol"), "val") !== "circle" ||
            !Number.isSafeInteger(size) ||
            size < 2 ||
            size > 72 ||
            chartBoolean(item, "smooth", false)
          )
            throw new Error("Unsupported straight marker line.");
        }
        // Observed WPS default per-series labels are explicitly disabled.
        if (item.dLbls !== undefined) {
          const labels = single(item, "dLbls");
          only(labels, ["delete"]);
          if (!chartBoolean(labels, "delete", false) || base.labels)
            throw new Error("Unsupported series labels.");
        }
      }
      const { chart, normalized } = recoverSource(workbook, sheet, series, base);
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
      if (normalized) report.add("chart-cache-normalized", "warning", part.chartPart);
      if (geometry.approximated) report.add("dimension-approximated", "warning", part.drawingPart);
    } catch {
      report.add("feature-omitted", "warning", part.chartPart);
    }
  }
}
