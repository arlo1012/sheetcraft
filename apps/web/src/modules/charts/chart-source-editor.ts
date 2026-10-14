import {
  createChartSourceFromRange,
  getChartSourceApplicability as coreChartSourceApplicability,
  normalizeChartSource,
  type ChartSeriesSource,
  type ChartSourceCategories,
  type ChartSourceName,
  type ChartSourceValues,
} from "@sheetcraft/core/chart-source";
import { getSheetChartData, type ChartData, type SheetChart } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { CellRange, Sheet, SheetEvaluator, Workbook } from "@sheetcraft/core/workbook";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";

export type ChartSourceReferenceRole = "source" | "series-name" | "series-values" | "categories";
export type ChartSourceReferencePicker = (
  current: string,
  role: ChartSourceReferenceRole,
) => Promise<string | undefined>;
export type ChartSourceApplicability =
  | "editable"
  | "pivot"
  | "cached"
  | "unsupported-type"
  | "broken-range";
export function getChartSourceApplicability(chart: SheetChart): ChartSourceApplicability {
  return coreChartSourceApplicability(chart);
}

export function cloneChartSourceDrawing(drawing: SheetChartDrawing): SheetChartDrawing {
  // Drawings are persisted data records, not view models. Keep all style/title fields isolated.
  return JSON.parse(JSON.stringify(drawing)) as SheetChartDrawing;
}
export function getEditableChartSource(
  sheetId: string,
  chart: SheetChart,
  sourceSheet?: Sheet,
): ChartSeriesSource {
  return chart.source
    ? normalizeChartSource(chart.source)
    : createChartSourceFromRange(sheetId, chart, sourceSheet);
}
/** Promotion transfers bound identities into source series and drops owner-relative metadata. */
export function createChartSourceCandidate(
  chart: SheetChart,
  source: ChartSeriesSource,
): SheetChart & { source: ChartSeriesSource } {
  const { rectangleSeries: _rectangleSeries, ...rest } = chart;
  return { ...rest, range: null, source: normalizeChartSource(source) };
}

/** New series must never reactivate an inactive or removed series' formatting. */
export function allocateChartSourceSeriesId(chart: SheetChart, source: ChartSeriesSource): string {
  const used = new Set([
    ...source.series.map((entry) => entry.id),
    ...(chart.format?.series ?? []).map((entry) => entry.id),
    ...(chart.rectangleSeries?.rows ?? []).map((entry) => entry.id),
    ...(chart.rectangleSeries?.columns ?? []).map((entry) => entry.id),
  ]);
  let ordinal = 1;
  while (used.has(`series-${ordinal}`)) ordinal++;
  return `series-${ordinal}`;
}

export function readChartSourcePreview(
  sheet: Sheet,
  chart: SheetChart,
  evaluator: SheetEvaluator,
  workbook: Workbook,
): { data: ChartData; invalid: boolean } {
  try {
    const data = getSheetChartData(sheet, chart, evaluator, (id) => workbook.sheets.get(id));
    return {
      data,
      invalid: !!data.diagnostics?.some(
        (entry) => entry.code === "broken-reference" || entry.code === "length-mismatch",
      ),
    };
  } catch {
    return { data: { categories: [], series: [], records: [] }, invalid: true };
  }
}

function boundedRange(workbook: Workbook, text: string, defaultSheetId: string, vector: boolean) {
  const target = resolveRangeReference(workbook, text, defaultSheetId);
  if (!target) return undefined;
  const { start, end } = target.range;
  const count = (end.row - start.row + 1) * (end.column - start.column + 1);
  if (
    count < 1 ||
    count > 10000 ||
    (vector && start.row !== end.row && start.column !== end.column)
  )
    return undefined;
  return target;
}
export function parseChartSourceRange(workbook: Workbook, text: string, defaultSheetId: string) {
  return boundedRange(workbook, text, defaultSheetId, false);
}
export function parseChartSourceName(
  workbook: Workbook,
  text: string,
  defaultSheetId: string,
): ChartSourceName | undefined {
  if (!text.trim().startsWith("="))
    return text.length <= 32767 ? { kind: "literal", text } : undefined;
  const target = boundedRange(workbook, text, defaultSheetId, true);
  if (
    !target ||
    target.range.start.row !== target.range.end.row ||
    target.range.start.column !== target.range.end.column
  )
    return undefined;
  return { kind: "cell", sheetId: target.sheetId, cell: { ...target.range.start } };
}
export function parseChartSourceValues(
  workbook: Workbook,
  text: string,
  defaultSheetId: string,
): ChartSourceValues | undefined {
  const literal = /^=\{([^{}]*)\}$/.exec(text.trim());
  if (literal) {
    const pieces = literal[1]!.split(",").map((piece) => piece.trim());
    if (
      pieces.length > 10000 ||
      pieces.some((piece) => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(piece))
    )
      return undefined;
    const values = pieces.map(Number);
    return values.every(Number.isFinite) ? { kind: "literal", values } : undefined;
  }
  const target = boundedRange(workbook, text, defaultSheetId, true);
  return target ? { kind: "range", ...target } : undefined;
}
export function parseChartSourceCategories(
  workbook: Workbook,
  text: string,
  defaultSheetId: string,
): ChartSourceCategories | undefined {
  const target = boundedRange(workbook, text, defaultSheetId, true);
  return target ? { kind: "range", ...target } : undefined;
}
function referenceText(workbook: Workbook, sheetId: string, range: CellRange | null): string {
  const sheet = workbook.sheets.get(sheetId);
  return sheet && range ? formatRangeReference(sheet.name, range) : "=#REF!";
}
export function formatChartSourceName(workbook: Workbook, name: ChartSourceName): string {
  return name.kind === "literal"
    ? name.text
    : referenceText(
        workbook,
        name.sheetId,
        name.cell ? { start: name.cell, end: name.cell } : null,
      );
}
export function formatChartSourceValues(workbook: Workbook, values: ChartSourceValues): string {
  return values.kind === "literal"
    ? `={${values.values.join(",")}}`
    : referenceText(workbook, values.sheetId, values.range);
}
export function formatChartSourceCategories(
  workbook: Workbook,
  categories: ChartSourceCategories,
): string {
  return categories.kind === "generated"
    ? ""
    : referenceText(workbook, categories.sheetId, categories.range);
}
