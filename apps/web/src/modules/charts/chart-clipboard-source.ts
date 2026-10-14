import { createChartSourceFromRange } from "@sheetcraft/core/chart-source";
import { getSheetChartData, type ChartData } from "@sheetcraft/core/sheet-charts";
import { normalizeSheetDrawing, type SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { Sheet, SheetEvaluator } from "@sheetcraft/core/workbook";

export enum ChartClipboardSourceErrorReason {
  UnknownSourceSheet = "unknown-source-sheet",
  UnknownTargetSheet = "unknown-target-sheet",
  InvalidChartPayload = "invalid-chart-payload",
  UnknownChartSource = "unknown-chart-source",
  UnsupportedLegacySource = "unsupported-legacy-source",
  UnsupportedPivotSource = "unsupported-pivot-source",
  DormantSeriesIdCollision = "dormant-series-id-collision",
  NonEquivalentSource = "non-equivalent-source",
}

export class ChartClipboardSourceError extends Error {
  constructor(
    readonly reason: ChartClipboardSourceErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "ChartClipboardSourceError";
  }
}

export type ChartClipboardSourcePlanInput = {
  drawing: SheetChartDrawing;
  sourceSheet: Sheet;
  targetSheet: Sheet;
  /** A fresh calculation view bound to sourceSheet, never to the destination. */
  evaluator: SheetEvaluator;
  /** When supplied, also verifies the actual source/destination owner instances. */
  resolveSheet?: (sheetId: string) => Sheet | undefined;
};

const promotableTypes = new Set(["column", "bar", "line", "area", "radar"]);

function fail(reason: ChartClipboardSourceErrorReason, message: string): never {
  throw new ChartClipboardSourceError(reason, message);
}

/** Read persisted data without invoking getters or losing sparse/unknown dormant fields. */
export function cloneChartClipboardDrawingData(drawing: SheetChartDrawing): SheetChartDrawing {
  // Accommodates the existing maximum cache (10,000 series with number formats)
  // while bounding traversal of malformed or unknown extension data.
  let budget = 512000;
  const ancestors = new Set<object>();
  const clone = (value: unknown, depth: number): unknown => {
    if (--budget < 0 || depth > 16) throw new RangeError("Chart clipboard data is too large.");
    if (value === null || value === undefined || typeof value === "boolean") return value;
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "object") throw new TypeError("Chart clipboard requires data fields.");
    const array = Array.isArray(value);
    if (array && value.length > 10000)
      throw new RangeError("Chart clipboard arrays must be bounded.");
    const prototype: unknown = Object.getPrototypeOf(value);
    if (array && prototype !== Array.prototype)
      throw new TypeError("Chart clipboard requires ordinary indexed data arrays.");
    if (!array && prototype !== Object.prototype && prototype !== null)
      throw new TypeError("Chart clipboard requires ordinary data records.");
    if (ancestors.has(value)) throw new TypeError("Chart clipboard data cannot be cyclic.");
    ancestors.add(value);
    const result: Record<string, unknown> | unknown[] = array
      ? []
      : prototype === null
        ? (Object.create(null) as Record<string, unknown>)
        : {};
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === "length") continue;
      const field = Object.getOwnPropertyDescriptor(value, key)!;
      if (typeof key !== "string" || !("value" in field))
        throw new TypeError("Chart clipboard requires own data fields, not accessors.");
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))
        throw new TypeError("Chart clipboard arrays require only indexed data.");
      Object.defineProperty(result, key, {
        value: clone(field.value, depth + 1),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    if (array) {
      if (Reflect.ownKeys(result).length - 1 !== value.length)
        throw new RangeError("Chart clipboard arrays must be bounded and complete.");
    }
    ancestors.delete(value);
    return result;
  };
  return clone(drawing, 0) as SheetChartDrawing;
}

function sheetIdentity(sheet: Sheet | undefined): string | undefined {
  if (!sheet || typeof sheet !== "object") return undefined;
  const field = Object.getOwnPropertyDescriptor(sheet, "id");
  const value: unknown = field && "value" in field ? field.value : undefined;
  return typeof value === "string" && value.trim() && value.length <= 1024 ? value : undefined;
}

/**
 * Exactly the data consumed by the five promotable renderers. Legacy records
 * are rectangle rows, whereas explicit records are category-oriented vectors;
 * row-oriented/headerless/hidden-column records therefore need not be equal.
 * Other chart types that consume those records must never use this proof.
 */
function visiblePresentation(data: ChartData): unknown {
  return {
    categories: data.categories,
    series: data.series.map((entry) => ({
      name: entry.name,
      values: entry.values,
      numberFormat: entry.numberFormat,
    })),
  };
}

/**
 * Pure, synchronous source preparation only. Placement, IDs, commands and
 * history belong to the caller. No source is ever rebound or made into a cache.
 * Caller supplies sheets from one workbook; an optional resolver verifies this
 * ownership. Existing absolute refs (including tombstones) stay unchanged.
 */
export function planChartClipboardSourceForTarget(
  input: ChartClipboardSourcePlanInput,
): SheetChartDrawing {
  const { sourceSheet, targetSheet, evaluator, resolveSheet } = input;
  const sourceId = sheetIdentity(sourceSheet);
  const targetId = sheetIdentity(targetSheet);
  if (!sourceId)
    fail(ChartClipboardSourceErrorReason.UnknownSourceSheet, "Chart source owner is unknown.");
  if (!targetId)
    fail(ChartClipboardSourceErrorReason.UnknownTargetSheet, "Chart target owner is unknown.");
  let knownSource = sourceId !== targetId || sourceSheet === targetSheet;
  let knownTarget = true;
  if (resolveSheet) {
    try {
      knownSource = knownSource && resolveSheet(sourceId) === sourceSheet;
    } catch {
      knownSource = false;
    }
    try {
      knownTarget = resolveSheet(targetId) === targetSheet;
    } catch {
      knownTarget = false;
    }
  }
  if (!knownSource)
    fail(
      ChartClipboardSourceErrorReason.UnknownSourceSheet,
      "Chart source owner is stale or unknown.",
    );
  if (!knownTarget)
    fail(
      ChartClipboardSourceErrorReason.UnknownTargetSheet,
      "Chart target owner is stale or unknown.",
    );

  let detached: SheetChartDrawing;
  try {
    detached = cloneChartClipboardDrawingData(input.drawing);
    if (detached.kind !== "chart") throw new TypeError("Expected a standalone Chart drawing.");
    if (Object.hasOwn(detached.chart, "source") && detached.chart.source?.kind !== "series")
      fail(ChartClipboardSourceErrorReason.UnknownChartSource, "Unknown Chart source kind.");
    // Validate without substituting normalized data, which may canonicalize
    // paint or omit cache metadata. The clipboard retains every original field.
    normalizeSheetDrawing(detached);
  } catch (error) {
    if (error instanceof ChartClipboardSourceError) throw error;
    fail(ChartClipboardSourceErrorReason.InvalidChartPayload, "Invalid Chart clipboard payload.");
  }
  const chart = detached.chart;
  if (sourceId === targetId || chart.source !== undefined || chart.dataCache !== undefined)
    return detached;
  if (chart.pivotTableId !== undefined)
    fail(
      ChartClipboardSourceErrorReason.UnsupportedPivotSource,
      "A live PivotChart cannot change owner sheets while preserving its source.",
    );
  // A deleted/split rectangle is already empty, with no owner-relative cells.
  if (chart.range === null) return detached;
  if (!promotableTypes.has(chart.type))
    fail(
      ChartClipboardSourceErrorReason.UnsupportedLegacySource,
      "This live legacy Chart type cannot change owner sheets losslessly.",
    );
  try {
    const source = createChartSourceFromRange(sourceId, chart, sourceSheet);
    const sourceIds = new Set(source.series.map((entry) => entry.id));
    if (chart.format?.series?.some((entry) => sourceIds.has(entry.id)))
      fail(
        ChartClipboardSourceErrorReason.DormantSeriesIdCollision,
        "Promotion would activate a dormant Chart series format.",
      );
    const promoted = { ...chart, range: null, source };
    const legacyData = getSheetChartData(sourceSheet, chart, evaluator, resolveSheet);
    const promotedData = getSheetChartData(sourceSheet, promoted, evaluator, resolveSheet);
    if (
      promotedData.diagnostics?.some(
        (entry) => entry.code === "broken-reference" || entry.code === "length-mismatch",
      ) ||
      JSON.stringify(visiblePresentation(legacyData)) !==
        JSON.stringify(visiblePresentation(promotedData)) ||
      promotedData.series.some((entry, index) => entry.colorIndex !== index)
    )
      fail(
        ChartClipboardSourceErrorReason.NonEquivalentSource,
        "Chart source promotion could not prove the same visible data and palette.",
      );
    detached.chart = promoted;
    return detached;
  } catch (error) {
    if (error instanceof ChartClipboardSourceError) throw error;
    fail(
      ChartClipboardSourceErrorReason.NonEquivalentSource,
      "Chart source promotion could not be evaluated losslessly.",
    );
  }
}
