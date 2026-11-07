import { MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./sheet-limits.js";
import type { CellAddress, CellRange } from "./workbook.js";

import { mapCameraSourceCells } from "./camera-source-references.js";
export const MAX_DASHBOARD_SOURCE_CELLS = 100000;
export function dashboardRangeFits(range: CellRange) {
  return (
    (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1) <=
    MAX_DASHBOARD_SOURCE_CELLS
  );
}
export const dashboardKinds = ["column", "line", "bar", "pie", "combo", "number", "text"] as const;
export type DashboardKind = (typeof dashboardKinds)[number];
export const dashboardStats = ["records", "count", "sum", "average", "min", "max"] as const;
export type DashboardStat = (typeof dashboardStats)[number];
export type DashboardMeasure = { column: number | null; stat: DashboardStat };
export type DashboardWidget = {
  id: string;
  kind: DashboardKind;
  title: string;
  text: string;
  source: { sheetId: string; range: CellRange | null } | null;
  category: number | null;
  measures: DashboardMeasure[];
  group: boolean;
  sort: "source" | "category" | "value";
  descending: boolean;
  legend: boolean;
  labels: boolean;
  width: 1 | 2 | 3;
  height: 1 | 2;
};
export type SheetDashboard = {
  title: string;
  showTitle: boolean;
  theme: "light" | "blue" | "dark";
  snapshot: boolean;
  widgets: DashboardWidget[];
};
export function emptyDashboard(snapshot = true): SheetDashboard {
  return { title: "", showTitle: false, theme: "light", snapshot, widgets: [] };
}
export function newDashboardWidget(
  id: string,
  kind: DashboardKind,
  title: string,
): DashboardWidget {
  return {
    id,
    kind,
    title,
    text: "",
    source: null,
    category: null,
    measures: [{ column: null, stat: "records" }],
    group: true,
    sort: "source",
    descending: false,
    legend: true,
    labels: false,
    width: 1,
    height: 1,
  };
}
function invalid(): never {
  throw new TypeError("Invalid dashboard.");
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 255) {
  return typeof value === "string" && value.length <= max ? value : invalid();
}
function flag(value: unknown) {
  return typeof value === "boolean" ? value : invalid();
}
function choice<T extends string | number>(value: unknown, values: readonly T[]): T {
  return values.find((item) => item === value) ?? invalid();
}
function index(value: unknown, limit: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= limit)
    return invalid();
  return value;
}
function address(value: unknown): CellAddress {
  const p = record(value);
  return { row: index(p.row, MAX_SHEET_ROWS), column: index(p.column, MAX_SHEET_COLUMNS) };
}
function source(value: unknown): DashboardWidget["source"] {
  if (value === null) return null;
  const src = record(value),
    sheetId = string(src.sheetId);
  if (!sheetId) return invalid();
  if (src.range === null) return { sheetId, range: null };
  const r = record(src.range),
    start = address(r.start),
    end = address(r.end);
  if (start.row > end.row || start.column > end.column || !dashboardRangeFits({ start, end }))
    return invalid();
  return { sheetId, range: { start, end } };
}
export function normalizeDashboard(value: unknown): SheetDashboard {
  const state = record(value),
    ids = new Set<string>();
  if (!Array.isArray(state.widgets) || state.widgets.length > 128) return invalid();
  const widgets: DashboardWidget[] = state.widgets.map((item) => {
    const w = record(item),
      id = string(w.id);
    if (
      !id ||
      ids.has(id) ||
      !Array.isArray(w.measures) ||
      !w.measures.length ||
      w.measures.length > 16
    )
      return invalid();
    ids.add(id);
    const reference = source(w.source);
    const column = (v: unknown) => (v === null ? null : index(v, MAX_SHEET_COLUMNS));
    const measures = w.measures.map((item) => {
      const m = record(item);
      return { column: column(m.column), stat: choice(m.stat, dashboardStats) };
    });
    return {
      id,
      kind: choice(w.kind, dashboardKinds),
      title: string(w.title),
      text: string(w.text, 16384),
      source: reference,
      category: column(w.category),
      measures,
      group: flag(w.group),
      sort: choice(w.sort, ["source", "category", "value"] as const),
      descending: flag(w.descending),
      legend: flag(w.legend),
      labels: flag(w.labels),
      width: choice(w.width, [1, 2, 3] as const),
      height: choice(w.height, [1, 2] as const),
    };
  });
  return {
    title: string(state.title),
    showTitle: flag(state.showTitle),
    theme: choice(state.theme, ["light", "blue", "dark"] as const),
    snapshot: flag(state.snapshot),
    widgets,
  };
}

export function mapDashboardReferences(
  dashboard: SheetDashboard,
  sheetId: string,
  mapCell: (cell: CellAddress) => CellAddress | null,
  mapRange: (range: CellRange) => CellRange | null = (range) =>
    mapCameraSourceCells(range, mapCell),
): SheetDashboard {
  return {
    ...dashboard,
    widgets: dashboard.widgets.map((w) => {
      if (w.source?.sheetId !== sheetId || !w.source.range) return w;
      const { range } = w.source;
      const mapped = mapRange(range);
      const next = mapped && dashboardRangeFits(mapped) ? mapped : null;
      const column = (field: number | null) => {
        if (field === null || !next) return null;
        const projected = mapRange({
          start: { row: range.start.row, column: field },
          end: { row: range.end.row, column: field },
        });
        const c =
          projected?.start.column ?? mapCell({ row: range.start.row, column: field })?.column;
        return c !== undefined && c >= next.start.column && c <= next.end.column ? c : null;
      };
      return {
        ...w,
        source: { sheetId, range: next },
        category: column(w.category),
        measures: w.measures.map((m) => ({ ...m, column: column(m.column) })),
      };
    }),
  };
}
