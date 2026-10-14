import {
  normalizeSheetDrawing,
  normalizeSheetDrawings,
  type SheetChartDrawing,
} from "@sheetcraft/core/sheet-drawings";
import {
  getSheetChartData,
  getSheetChartSourceData,
  normalizeChartDataCache,
  type ChartData,
} from "@sheetcraft/core/sheet-charts";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { ShapeFrameRect } from "@sheetcraft/core/shape-frame";
import type { Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";
import { countChartDataTableText } from "../charts/chart-data-table";

const MAX_PRINT_CHARTS = 128;
const MAX_BATCH_VALUES = 100_000;
const MAX_CHART_TEXT = 256 * 1024;
const MAX_BATCH_TEXT = 1024 * 1024;

/** Chart has its own consumer gate: a successful cell-only output is not a chart print. */
export class ChartPrintUnavailableError extends Error {
  constructor(
    readonly drawingIds: readonly string[],
    reason = "Chart pixels are unavailable.",
    cause?: unknown,
  ) {
    super(`Chart printing cannot be completed. ${reason} The workbook is unchanged.`, { cause });
    this.name = "ChartPrintUnavailableError";
  }
}

export function getPrintableChartRoots(sheet: Pick<Sheet, "drawings">): SheetChartDrawing[] {
  // Current Chart roots have no hidden/printObject schema. Do not invent shape properties.
  const ownerIds: string[] = [];
  try {
    const original = sheet.drawings ?? [];
    if (
      !Array.isArray(original) ||
      Object.getPrototypeOf(original) !== Array.prototype ||
      original.length > 10000
    )
      throw new TypeError("Chart printing requires a bounded ordinary drawing collection.");
    for (let index = 0; index < original.length; index++) {
      const field = Object.getOwnPropertyDescriptor(original, String(index));
      if (!field || !("value" in field))
        throw new TypeError("Drawing owners must be dense own data fields.");
      const candidate: unknown = field.value;
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
        throw new TypeError("Invalid drawing owner.");
      const prototype: unknown = Object.getPrototypeOf(candidate);
      if (prototype !== null && prototype !== Object.prototype)
        throw new TypeError("Drawing owners must be ordinary data records.");
      const fields = Object.getOwnPropertyDescriptors(candidate);
      if (!fields.kind || !("value" in fields.kind))
        throw new TypeError("Drawing kinds must be own data fields.");
      if (
        fields.kind &&
        "value" in fields.kind &&
        fields.kind.value === "chart" &&
        fields.id &&
        "value" in fields.id &&
        typeof fields.id.value === "string"
      )
        ownerIds.push(fields.id.value);
      for (const descriptor of Object.values(fields))
        if (!("value" in descriptor))
          throw new TypeError("Drawing owners cannot contain accessors.");
    }
    return normalizeSheetDrawings(original).flatMap((drawing, index) => {
      if (drawing.kind !== "chart") return [];
      const source = original[index]!;
      if (source.kind !== "chart") throw new TypeError("Chart owner changed.");
      return [source];
    });
  } catch (cause) {
    throw new ChartPrintUnavailableError(
      ownerIds,
      cause instanceof Error ? cause.message : "Invalid chart owner.",
      cause,
    );
  }
}

export function assertChartPrintConsumer(
  sheet: Pick<Sheet, "drawings">,
  nativeConsumer = false,
): void {
  const roots = getPrintableChartRoots(sheet);
  if (roots.length && !nativeConsumer)
    throw new ChartPrintUnavailableError(roots.map((root) => root.id));
}

export type PrintChartEntry = Readonly<{
  sourceRoot: SheetChartDrawing;
  drawing: SheetChartDrawing;
  data: ChartData;
  order: number;
  rect: ShapeFrameRect;
  rotation: number;
  bounds: Readonly<{ left: number; top: number; right: number; bottom: number }>;
}>;
export type PrintChartPass = Readonly<{
  entries: readonly PrintChartEntry[];
  revision: number;
  key: string;
  assertCurrent(): void;
}>;

function clonePrintData(data: ChartData): ChartData {
  // Reuse numeric/cache validation, then retain derived stable identity and diagnostic fields.
  const clone = normalizeChartDataCache(data);
  clone.series = clone.series.map((entry, index) => ({
    ...entry,
    ...(data.series[index]?.id !== undefined ? { id: data.series[index]!.id } : {}),
    ...(data.series[index]?.colorIndex !== undefined
      ? { colorIndex: data.series[index]!.colorIndex }
      : {}),
  }));
  if (data.diagnostics) clone.diagnostics = data.diagnostics.map((entry) => ({ ...entry }));
  return clone;
}

function freezeData(value: unknown): void {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
  for (const field of Object.values(value)) freezeData(field);
  Object.freeze(value);
}

function sheetGeometryKey(sheet: Sheet): string {
  return JSON.stringify([
    [...sheet.rowHeights],
    [...sheet.columnWidths],
    [...(sheet.hiddenRows ?? [])],
    [...(sheet.hiddenColumns ?? [])],
    sheet.defaultColumnWidth,
  ]);
}

export function capturePrintChartPass(options: {
  sheet: Sheet;
  metrics: PictureSheetMetrics;
  evaluator: SheetEvaluator;
  resolveSheet?: (id: string) => Sheet | undefined;
  revision?: number;
  isCurrent?: () => boolean;
}): PrintChartPass {
  const { sheet, metrics, evaluator, resolveSheet } = options;
  const forest = sheet.drawings;
  const roots = getPrintableChartRoots(sheet);
  if (roots.length > MAX_PRINT_CHARTS)
    throw new ChartPrintUnavailableError(
      roots.map((root) => root.id),
      "Print up to 128 charts per sheet.",
    );
  if (!roots.length)
    return Object.freeze({
      entries: Object.freeze([]),
      revision: options.revision ?? 0,
      key: "[]",
      assertCurrent() {
        if (options.isCurrent && !options.isCurrent())
          throw new ChartPrintUnavailableError([], "The chart print context changed.");
        if (sheet.drawings !== forest || getPrintableChartRoots(sheet).length)
          throw new ChartPrintUnavailableError([], "The chart print owners changed.");
      },
    });
  const geometryKey = sheetGeometryKey(sheet);
  const sourceSheets = new Map<string, Sheet>([[sheet.id, sheet]]);
  for (const root of roots) {
    const normalized = normalizeSheetDrawing(root);
    if (normalized.kind !== "chart")
      throw new ChartPrintUnavailableError([root.id], "Chart owner changed.");
    const chart = normalized.chart;
    const source = chart.source;
    if (!source) continue;
    const ids = [
      source.categories.kind === "range" ? source.categories.sheetId : sheet.id,
      ...source.series.flatMap((entry) => [
        entry.name.kind === "cell" ? entry.name.sheetId : sheet.id,
        entry.values.kind === "range" ? entry.values.sheetId : sheet.id,
      ]),
    ];
    for (const id of ids) {
      const target = id === sheet.id ? sheet : resolveSheet?.(id);
      if (target) sourceSheets.set(id, target);
    }
  }
  // Evaluators are calculation-cycle caches. Catch normal cell replacement even
  // when an unhosted caller reuses its old evaluator. The real host also supplies
  // its workbook/evaluator revision lease for indirect formula dependencies.
  const sourceStates = [...sourceSheets.values()].map((target) => ({
    target,
    cells: target.cells,
    entries: new Map(target.cells),
    name: target.name,
    geometry: sheetGeometryKey(target),
  }));
  const entries: PrintChartEntry[] = [];
  const signatures = new Map<SheetChartDrawing, string>();
  let totalValues = 0,
    totalText = 0;
  for (const sourceRoot of roots) {
    try {
      const drawing = normalizeSheetDrawing(sourceRoot);
      if (drawing.kind !== "chart") throw new TypeError("Chart owner changed.");
      if (
        !drawing.chart.source &&
        !drawing.chart.dataCache &&
        !drawing.chart.range &&
        !drawing.chart.pivotTableId
      )
        throw new Error("The chart source is unavailable.");
      if (
        drawing.chart.pivotTableId &&
        !sheet.pivotTables?.some(
          (pivot) => pivot.id === drawing.chart.pivotTableId && pivot.outputRange,
        )
      )
        throw new Error("The associated PivotTable source is unavailable.");
      const raw = clonePrintData(
        getSheetChartSourceData(sheet, drawing.chart, evaluator, resolveSheet),
      );
      const derived = getSheetChartData(sheet, drawing.chart, evaluator, resolveSheet);
      if (
        raw.diagnostics?.some(
          (entry) => entry.code === "broken-reference" || entry.code === "length-mismatch",
        )
      )
        throw new Error("The chart contains an unavailable or inconsistent data reference.");
      const data = clonePrintData(derived);
      let textSize = 0;
      for (const value of [
        drawing.chart.title,
        ...raw.categories,
        ...raw.series.map((entry) => entry.name),
        ...raw.records.flat().filter((value): value is string => typeof value === "string"),
      ]) {
        if (value.length > 4096)
          throw new Error(
            "A chart label exceeds 4096 characters. Shorten chart labels before printing.",
          );
        textSize += value.length;
      }
      textSize += countChartDataTableText(drawing.chart, raw);
      totalText += textSize;
      totalValues +=
        raw.series.reduce((count, entry) => count + entry.values.length, 0) +
        raw.records.reduce((count, row) => count + row.length, 0);
      if (textSize > MAX_CHART_TEXT || totalText > MAX_BATCH_TEXT || totalValues > MAX_BATCH_VALUES)
        throw new Error(
          "Chart print data exceeds its text or value budget. Reduce the chart data before printing.",
        );
      const layout = resolvePictureLayout(
        {
          x: metrics.columns.visiblePrefix(drawing.anchor.column) + drawing.offsetX,
          y: metrics.rows.visiblePrefix(drawing.anchor.row) + drawing.offsetY,
          width: drawing.width,
          height: drawing.height,
        },
        drawing.rotation,
      );
      if (layout.collapsed) throw new Error("The chart layout is unavailable.");
      const rect = Object.freeze({ ...layout.rect });
      const bounds = Object.freeze({
        left: layout.bounds.x,
        top: layout.bounds.y,
        right: layout.bounds.x + layout.bounds.width,
        bottom: layout.bounds.y + layout.bounds.height,
      });
      freezeData(drawing);
      freezeData(data);
      const entry: PrintChartEntry = Object.freeze({
        sourceRoot,
        drawing,
        data,
        order: forest!.indexOf(sourceRoot),
        rect,
        rotation: layout.angleDeg,
        bounds,
      });
      entries.push(entry);
      signatures.set(sourceRoot, JSON.stringify([drawing, raw, data]));
    } catch (cause) {
      throw new ChartPrintUnavailableError(
        [sourceRoot.id],
        cause instanceof Error ? cause.message : "Chart source validation failed.",
        cause,
      );
    }
  }
  const assertCurrent = () => {
    if (options.isCurrent && !options.isCurrent())
      throw new ChartPrintUnavailableError(
        roots.map((root) => root.id),
        "The chart workbook calculation cycle changed.",
      );
    for (const state of sourceStates) {
      const current = state.target.id === sheet.id ? sheet : resolveSheet?.(state.target.id);
      if (
        current !== state.target ||
        current.cells !== state.cells ||
        current.cells.size !== state.entries.size ||
        current.name !== state.name ||
        sheetGeometryKey(current) !== state.geometry ||
        [...state.entries].some(([key, cell]) => current.cells.get(key) !== cell)
      )
        throw new ChartPrintUnavailableError(
          roots.map((root) => root.id),
          "The chart worksheet source changed.",
        );
    }
    const currentRoots = getPrintableChartRoots(sheet);
    if (
      currentRoots.length !== roots.length ||
      currentRoots.some((root, index) => root !== roots[index]) ||
      sheet.drawings !== forest ||
      sheetGeometryKey(sheet) !== geometryKey
    )
      throw new ChartPrintUnavailableError(
        roots.map((root) => root.id),
        "The chart owners or worksheet geometry changed.",
      );
    for (const entry of entries) {
      if (forest?.[entry.order] !== entry.sourceRoot)
        throw new ChartPrintUnavailableError([entry.sourceRoot.id], "The chart owner changed.");
      try {
        const current = normalizeSheetDrawing(entry.sourceRoot);
        if (current.kind !== "chart") throw new Error("The chart kind changed.");
        const raw = clonePrintData(
          getSheetChartSourceData(sheet, current.chart, evaluator, resolveSheet),
        );
        const data = clonePrintData(
          getSheetChartData(sheet, current.chart, evaluator, resolveSheet),
        );
        if (JSON.stringify([current, raw, data]) !== signatures.get(entry.sourceRoot))
          throw new Error("The chart data or appearance changed.");
      } catch (cause) {
        throw new ChartPrintUnavailableError(
          [entry.sourceRoot.id],
          "The chart print source changed.",
          cause,
        );
      }
    }
  };
  assertCurrent();
  return Object.freeze({
    entries: Object.freeze(entries),
    revision: options.revision ?? 0,
    key: JSON.stringify(
      entries.map((entry) => [
        entry.order,
        entry.rect,
        entry.rotation,
        signatures.get(entry.sourceRoot),
      ]),
    ),
    assertCurrent,
  });
}

export function getPrintChartContentExtent(pass: PrintChartPass, metrics: PictureSheetMetrics) {
  pass.assertCurrent();
  function count(position: number, axis: PictureSheetMetrics["rows"]) {
    let low = 0,
      high = axis.count;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (axis.visiblePrefix(middle) < position) low = middle + 1;
      else high = middle;
    }
    return low;
  }
  return {
    rowCount: Math.max(0, ...pass.entries.map((entry) => count(entry.bounds.bottom, metrics.rows))),
    columnCount: Math.max(
      0,
      ...pass.entries.map((entry) => count(entry.bounds.right, metrics.columns)),
    ),
  };
}
