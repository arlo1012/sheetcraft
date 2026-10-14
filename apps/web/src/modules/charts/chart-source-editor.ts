import {
  createChartSourceFromRange,
  getChartSourceApplicability as coreChartSourceApplicability,
  normalizeChartSource,
  type ChartSeriesSource,
  type ChartSourceCategories,
  type ChartSourceName,
  type ChartSourceValues,
} from "@sheetcraft/core/chart-source";
import {
  planChartSeriesVisibility,
  type ChartSeriesVisibilityChange,
} from "@sheetcraft/core/chart-series-filter";
import {
  getSheetChartData,
  getSheetChartSourceData,
  normalizeSheetChart,
  type ChartData,
  type SheetChart,
} from "@sheetcraft/core/sheet-charts";
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
/** Detached, transient evidence for the captured source owner. Never document metadata. */
export type ChartSourceVisibilityProof = {
  base: SheetChart;
  changes: ChartSeriesVisibilityChange[];
};

function ownData(value: unknown, budget = { remaining: 100000 }, depth = 0): unknown {
  if (--budget.remaining < 0 || depth > 32)
    throw new RangeError("Chart source visibility proof is too large.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object")
    throw new TypeError("Chart source visibility proof requires ordinary own data.");
  const array = Array.isArray(value);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== (array ? Array.prototype : Object.prototype) && prototype !== null)
    throw new TypeError("Chart source visibility proof requires ordinary own data.");
  const copy: Record<string, unknown> | unknown[] = array ? [] : {};
  const keys = Reflect.ownKeys(value);
  for (const key of keys) {
    if (array && key === "length") continue;
    const field = Object.getOwnPropertyDescriptor(value, key)!;
    if (
      typeof key !== "string" ||
      !("value" in field) ||
      (array && (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))
    )
      throw new TypeError(
        "Chart source visibility proof cannot contain accessors or extra array fields.",
      );
    Object.defineProperty(copy, key, {
      value: ownData(field.value, budget, depth + 1),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  if (array && keys.length !== value.length + 1)
    throw new TypeError("Chart source visibility proof requires dense arrays.");
  return copy;
}

/** Reject proof accessors before legacy chart normalization can inspect its fields. */
export function readChartSourceVisibilityProof(value: unknown): ChartSourceVisibilityProof {
  const proof = ownData(value) as ChartSourceVisibilityProof;
  if (
    !proof ||
    Array.isArray(proof) ||
    Object.keys(proof).sort().join(",") !== "base,changes" ||
    !Array.isArray(proof.changes)
  )
    throw new TypeError("Chart source visibility proof requires only base and changes.");
  const base = normalizeSheetChart(proof.base);
  if (Object.keys(proof.base).some((key) => !Object.hasOwn(base, key)))
    throw new TypeError("Chart source visibility proof has unknown chart fields.");
  // The planner validates the complete change shape, targets and bounds.
  planChartSourceVisibility(base, proof.changes);
  return { base, changes: proof.changes };
}

/** Materialize net intents in deterministic direction/band order, then restore the final layout.
 * Header and inactive-direction intents were staged while those bands were editable.
 * Keeping them here preserves dormancy without persisting any read-generated seed IDs. */
export function planChartSourceVisibility(
  input: SheetChart,
  changes: readonly ChartSeriesVisibilityChange[],
): SheetChart {
  const entries = ownData(changes) as ChartSeriesVisibilityChange[];
  if (!Array.isArray(entries) || entries.length > 512)
    throw new RangeError("Chart source visibility requires at most 512 net changes.");
  const base = normalizeSheetChart(input);
  if (!entries.length) return base;
  const seen = new Set<string>();
  for (const change of entries) {
    if (!change || Array.isArray(change) || typeof change.visible !== "boolean")
      throw new TypeError("Chart source visibility requires boolean own changes.");
    const explicit = "seriesId" in change;
    const fields = Object.keys(change).sort().join(",");
    if (fields !== (explicit ? "seriesId,visible" : "rangeBand,visible"))
      throw new TypeError("Unknown chart source visibility change fields.");
    if (
      !explicit &&
      (!change.rangeBand || Object.keys(change.rangeBand).sort().join(",") !== "index,seriesBy")
    )
      throw new TypeError("Unknown chart source visibility band fields.");
    if (
      !explicit &&
      ((change.rangeBand.seriesBy !== "rows" && change.rangeBand.seriesBy !== "columns") ||
        !Number.isInteger(change.rangeBand.index) ||
        change.rangeBand.index < 0)
    )
      throw new RangeError("Chart source visibility requires a valid physical band.");
    const key = explicit
      ? `id:${change.seriesId}`
      : `band:${change.rangeBand.seriesBy}:${change.rangeBand.index}`;
    if (seen.has(key)) throw new RangeError("Chart source visibility targets must be distinct.");
    seen.add(key);
  }
  if (base.source) return planChartSeriesVisibility(base, entries);
  if (entries.some((change) => "seriesId" in change))
    throw new RangeError("Rectangle visibility requires physical bands.");
  let candidate = base;
  // Shows free a full filter budget before any effective hide is allocated.
  for (const visible of [true, false]) {
    for (const seriesBy of ["columns", "rows"] as const) {
      const group = entries
        .filter(
          (change) =>
            "rangeBand" in change &&
            change.rangeBand.seriesBy === seriesBy &&
            change.visible === visible,
        )
        .sort(
          (left, right) =>
            ("rangeBand" in left ? left.rangeBand.index : 0) -
            ("rangeBand" in right ? right.rangeBand.index : 0),
        );
      if (!group.length) continue;
      candidate = planChartSeriesVisibility(
        {
          ...candidate,
          seriesBy,
          ...(seriesBy === "rows" ? { headerRow: false } : { headerColumn: false }),
        },
        group,
      );
    }
  }
  return {
    ...candidate,
    seriesBy: base.seriesBy,
    headerRow: base.headerRow,
    headerColumn: base.headerColumn,
  };
}
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
    ...(chart.seriesFilter?.hiddenSeriesIds ?? []),
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
): { data: ChartData; sourceData: ChartData; invalid: boolean } {
  try {
    const sourceData = getSheetChartSourceData(sheet, chart, evaluator, (id) =>
      workbook.sheets.get(id),
    );
    const data = getSheetChartData(sheet, chart, evaluator, (id) => workbook.sheets.get(id));
    return {
      data,
      sourceData,
      invalid: !!sourceData.diagnostics?.some(
        (entry) => entry.code === "broken-reference" || entry.code === "length-mismatch",
      ),
    };
  } catch {
    const data = { categories: [], series: [], records: [] };
    return { data, sourceData: data, invalid: true };
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
