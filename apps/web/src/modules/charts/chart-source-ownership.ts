import { MAX_SHAPE_GROUP_NODES } from "@sheetcraft/core/shape-group";
import { normalizeShapeDrawingForest } from "@sheetcraft/core/shape-group-planning";
import { createChartSourceFromRange, normalizeChartSource } from "@sheetcraft/core/chart-source";
import type { Sheet } from "@sheetcraft/core/workbook";
import {
  assertChartSourcePromotionIdentity,
  cloneChartClipboardDrawingData,
} from "./chart-clipboard-source";
import { normalizeSheetDrawing, type SheetDrawing } from "@sheetcraft/core/sheet-drawings";

/** Source planning belongs before placement; host preparation cannot silently rewrite it. */
export function assertChartDrawingPreserved(expected: SheetDrawing, candidate: SheetDrawing): void {
  if (expected.kind !== "chart") return;
  if (
    candidate.kind !== "chart" ||
    JSON.stringify(normalizeSheetDrawing(cloneChartClipboardDrawingData(expected))) !==
      JSON.stringify(normalizeSheetDrawing(cloneChartClipboardDrawingData(candidate)))
  )
    throw new TypeError(
      "Chart preparation changed captured source, appearance, geometry or identity.",
    );
}

/** A detached before-preparation snapshot also catches a mutating host or changed sibling. */
export function captureChartDrawingForest(values: readonly SheetDrawing[]): SheetDrawing[] {
  return values
    .filter((value) => value.kind === "chart")
    .map((value) => normalizeSheetDrawing(cloneChartClipboardDrawingData(value)));
}
export function assertChartForestPreserved(
  expected: readonly SheetDrawing[],
  candidate: readonly SheetDrawing[],
): void {
  const byId = new Map(candidate.map((value) => [value.id, value]));
  for (const chart of expected) {
    const next = byId.get(chart.id);
    if (!next) throw new TypeError("Prepared collection lost a Chart source.");
    assertChartDrawingPreserved(chart, next);
  }
}

/** Check Chart nested data before a legacy normalizer can invoke accessors or array methods. */
export function detachChartDrawingForest(values: readonly SheetDrawing[]): SheetDrawing[] {
  if (
    !Array.isArray(values) ||
    Object.getPrototypeOf(values) !== Array.prototype ||
    values.length > MAX_SHAPE_GROUP_NODES
  )
    throw new TypeError("Clipboard drawing forest requires a bounded ordinary array.");
  for (const key of Reflect.ownKeys(values)) {
    if (key === "length") continue;
    const field = Object.getOwnPropertyDescriptor(values, key)!;
    if (
      typeof key !== "string" ||
      !/^(0|[1-9]\d*)$/.test(key) ||
      Number(key) >= values.length ||
      !("value" in field)
    )
      throw new TypeError("Clipboard drawing forest requires own indexed data.");
  }
  const safe: SheetDrawing[] = [];
  for (let index = 0; index < values.length; index++) {
    const field = Object.getOwnPropertyDescriptor(values, String(index));
    if (!field || !("value" in field))
      throw new TypeError("Clipboard drawing forest must be dense.");
    const root: SheetDrawing = field.value;
    const kind =
      root && typeof root === "object" ? Object.getOwnPropertyDescriptor(root, "kind") : undefined;
    safe.push(
      kind && "value" in kind && kind.value === "chart" && root.kind === "chart"
        ? cloneChartClipboardDrawingData(root)
        : root,
    );
  }
  return safe;
}
export function normalizeChartClipboardForest(values: readonly SheetDrawing[]): SheetDrawing[] {
  return normalizeShapeDrawingForest(detachChartDrawingForest(values));
}

/** A source-only host hook may add the exact originating range source, never other Chart edits. */
export function assertChartClipboardSourcePrepared(
  expected: SheetDrawing,
  candidate: SheetDrawing,
  sourceSheet: Sheet,
  targetSheet: Sheet,
): void {
  if (expected.kind !== "chart") {
    if (JSON.stringify(expected) !== JSON.stringify(candidate))
      throw new TypeError("Source planning changed a non-Chart object.");
    return;
  }
  expected = cloneChartClipboardDrawingData(expected);
  if (sourceSheet !== targetSheet && expected.chart.pivotTableId !== undefined)
    throw new TypeError("A PivotChart source cannot be carried into another worksheet.");
  if (
    sourceSheet === targetSheet ||
    expected.chart.source ||
    expected.chart.dataCache ||
    expected.chart.range === null
  ) {
    assertChartDrawingPreserved(expected, candidate);
    return;
  }
  if (
    expected.chart.pivotTableId ||
    !["column", "bar", "line", "area", "radar", "combo"].includes(expected.chart.type)
  )
    throw new TypeError("Chart source planning cannot promote this legacy source.");
  const source = normalizeChartSource(
    createChartSourceFromRange(sourceSheet.id, expected.chart, sourceSheet),
  );
  assertChartSourcePromotionIdentity(expected.chart, source);
  const { rectangleSeries: _bindings, ...chart } = expected.chart;
  assertChartDrawingPreserved({ ...expected, chart: { ...chart, range: null, source } }, candidate);
}
