import type { DashboardWidget, DashboardMeasure } from "@sheetcraft/core/dashboard";
import type { ChartData } from "@sheetcraft/core/sheet-charts";
import type { CellRange, SheetEvaluator } from "@sheetcraft/core/workbook";
import { formatFormulaAddress } from "@sheetcraft/core/formula";

function plain(value: ReturnType<SheetEvaluator["getComputedValue"]>) {
  return value === null ? "" : typeof value === "object" ? value.code : String(value);
}
export function dashboardFields(range: CellRange, evaluator: SheetEvaluator) {
  const fields: { value: number; label: string }[] = [];
  for (let column = range.start.column; column <= range.end.column; column++) {
    const address = { row: range.start.row, column };
    fields.push({
      value: column,
      label:
        plain(evaluator.getComputedValue(address)) ||
        formatFormulaAddress(address).replace(/\d+$/, ""),
    });
  }
  return fields;
}
type Summary = {
  sum: number;
  min: number;
  max: number;
  numeric: number;
  present: number;
  rows: number;
};
function summarize(summary: Summary, measure: DashboardMeasure) {
  if (measure.stat === "records") return summary.rows;
  if (measure.column === null) return null;
  if (measure.stat === "count") return summary.present;
  if (!summary.numeric) return null;
  switch (measure.stat) {
    case "sum":
      return summary.sum;
    case "average":
      return summary.sum / summary.numeric;
    case "min":
      return summary.min;
    case "max":
      return summary.max;
  }
}
export function dashboardChartData(
  widget: DashboardWidget,
  evaluator: SheetEvaluator,
  recordsLabel: string,
  blankLabel: string,
): ChartData {
  const empty = { categories: [], series: [], records: [] };
  const range = widget.source?.range;
  if (!range || (widget.category === null && widget.kind !== "number")) return empty;
  const fields = dashboardFields(range, evaluator);
  const labels = new Map(fields.map((field) => [field.value, field.label]));
  const grouped = new Map<string, { category: string; sums: Summary[] }>();
  for (let row = range.start.row + 1; row <= range.end.row; row++) {
    const values = fields.map((f) => evaluator.getComputedValue({ row, column: f.value }));
    if (values.every((v) => v === null || v === "")) continue;
    const category =
      widget.category === null
        ? ""
        : plain(values[widget.category - range.start.column] ?? null) || blankLabel;
    const key = widget.kind === "number" ? "" : widget.group ? category : String(row);
    let group = grouped.get(key);
    if (!group) {
      group = {
        category,
        sums: widget.measures.map(() => ({
          sum: 0,
          min: Infinity,
          max: -Infinity,
          numeric: 0,
          present: 0,
          rows: 0,
        })),
      };
      grouped.set(key, group);
    }
    widget.measures.forEach((m, i) => {
      const summary = group.sums[i]!;
      summary.rows++;
      if (m.column === null) return;
      const value = values[m.column - range.start.column];
      if (value !== null && value !== undefined && value !== "") summary.present++;
      if (typeof value === "number") {
        summary.sum += value;
        summary.numeric++;
        summary.min = Math.min(summary.min, value);
        summary.max = Math.max(summary.max, value);
      }
    });
  }
  const groups = Array.from(grouped.values(), (g) => ({
    category: g.category,
    values: g.sums.map((s, i) => summarize(s, widget.measures[i]!)),
  }));
  if (widget.sort !== "source")
    groups.sort(
      (a, b) =>
        (widget.descending ? -1 : 1) *
        (widget.sort === "category"
          ? a.category.localeCompare(b.category, undefined, { numeric: true })
          : (a.values[0] ?? -Infinity) - (b.values[0] ?? -Infinity)),
    );
  return {
    categories: groups.map((g) => g.category),
    series: widget.measures.map((m, i) => ({
      name: m.stat === "records" ? recordsLabel : (labels.get(m.column!) ?? ""),
      values: groups.map((g) => g.values[i] ?? null),
    })),
    records: groups.map((g) => [g.category, ...g.values]),
  };
}
