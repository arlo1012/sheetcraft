import { getCellStyle, type CellAddress, type Sheet, type SheetEvaluator } from "./workbook.js";
import {
  normalizeChartSource,
  type ChartSourceDiagnostic,
  type ChartSourceCategories,
  type ChartSourceSeries,
  type ChartSourceValues,
} from "./chart-source.js";
import type { ChartData, ChartSeries, SheetChart } from "./sheet-charts.js";
import type { FormulaValue } from "./formula/types.js";

type Vector = {
  values: FormulaValue[];
  sheet?: Sheet;
  addresses?: CellAddress[];
  hidden: Set<number>;
  transverseHidden: boolean;
};
/** One ordinal mask is shared across all retained vectors, including cross-sheet ones. */
export function getChartSourceData(
  sheet: Sheet,
  chart: SheetChart,
  evaluator: SheetEvaluator,
  resolveSheet?: (sheetId: string) => Sheet | undefined,
): ChartData {
  const source = normalizeChartSource(chart.source);
  const diagnostics: ChartSourceDiagnostic[] = [];
  const empty = (): ChartData => ({
    categories: [],
    series: [],
    records: [],
    ...(diagnostics.length ? { diagnostics } : {}),
  });
  if (!source.series.length) return empty();
  const add = (
    code: ChartSourceDiagnostic["code"],
    role: ChartSourceDiagnostic["role"],
    seriesId?: string,
    index?: number,
  ) => {
    diagnostics.push({
      code,
      role,
      ...(seriesId === undefined ? {} : { seriesId }),
      ...(index === undefined ? {} : { index }),
    });
  };
  const target = (sheetId: string): { sheet: Sheet; evaluator: SheetEvaluator } | undefined => {
    if (sheetId === sheet.id) return { sheet, evaluator };
    const other = resolveSheet?.(sheetId);
    if (!other || other.id !== sheetId || !evaluator.forSheet) return undefined;
    return { sheet: other, evaluator: evaluator.forSheet(sheetId) };
  };
  const vector = (
    value: Exclude<ChartSourceValues | ChartSourceCategories, { kind: "generated" }>,
    role: "categories" | "values",
    seriesId?: string,
  ): Vector | undefined => {
    if (value.kind === "literal")
      return { values: [...value.values], hidden: new Set(), transverseHidden: false };
    const found = value.range !== null ? target(value.sheetId) : undefined;
    if (!found || !value.range) {
      add("broken-reference", role, seriesId);
      return undefined;
    }
    const { start, end } = value.range;
    // A point has no geometric axis. Preserve the original chart direction for
    // this ambiguity; longer vectors always use their own geometric direction.
    const point = start.row === end.row && start.column === end.column;
    const vertical = point ? chart.seriesBy === "columns" : start.column === end.column;
    const count = Math.max(end.row - start.row, end.column - start.column) + 1;
    const addresses = Array.from({ length: count }, (_, index) => ({
      row: start.row + (vertical ? index : 0),
      column: start.column + (vertical ? 0 : index),
    }));
    // Category vectors are readable header labels even when their transverse
    // stripe is hidden. Only value-series stripes can omit a complete series.
    const transverseHidden =
      role === "values" &&
      !chart.showHidden &&
      (vertical
        ? found.sheet.hiddenColumns?.has(start.column)
        : found.sheet.hiddenRows?.has(start.row)) === true;
    const hidden = new Set<number>();
    if (!chart.showHidden)
      addresses.forEach((address, index) => {
        if (
          (vertical
            ? found.sheet.hiddenRows?.has(address.row)
            : found.sheet.hiddenColumns?.has(address.column)) === true
        )
          hidden.add(index);
      });
    return {
      values: addresses.map((address) => found.evaluator.getComputedValue(address)),
      sheet: found.sheet,
      addresses,
      hidden,
      transverseHidden,
    };
  };
  const name = (entry: ChartSourceSeries): string => {
    if (entry.name.kind === "literal") return entry.name.text;
    const found = entry.name.cell !== null ? target(entry.name.sheetId) : undefined;
    if (!found || !entry.name.cell) {
      add("broken-reference", "name", entry.id);
      return "";
    }
    const value = found.evaluator.getComputedValue(entry.name.cell);
    if (value === null) {
      add("blank", "name", entry.id);
      return "";
    }
    if (typeof value === "object" || (typeof value === "number" && !Number.isFinite(value))) {
      add("error", "name", entry.id);
      return "";
    }
    if (typeof value === "boolean") {
      add("text", "name", entry.id);
      return "";
    }
    return String(value);
  };
  // Broken dependencies in even a hidden series remain explicit; never silently revive a tombstone.
  const all = source.series.map((entry) => ({
    entry,
    name: name(entry),
    vector: vector(entry.values, "values", entry.id),
  }));
  const categoryVector =
    source.categories.kind === "range" ? vector(source.categories, "categories") : undefined;
  if (diagnostics.some((entry) => entry.code === "broken-reference")) return empty();
  const length =
    source.categories.kind === "range"
      ? categoryVector!.values.length
      : all[0]!.vector!.values.length;
  all.forEach(({ entry, vector }) => {
    if (vector!.values.length !== length) add("length-mismatch", "values", entry.id);
  });
  if (diagnostics.some((entry) => entry.code === "length-mismatch")) return empty();
  const retained = all.filter(({ entry, vector }) => {
    if (!vector!.transverseHidden) return true;
    add("hidden", "values", entry.id);
    return false;
  });
  if (!retained.length) return empty();
  const mask = new Set(categoryVector?.hidden);
  for (const { vector } of retained) for (const index of vector!.hidden) mask.add(index);
  const ordinals = Array.from({ length }, (_, index) => index).filter((index) => !mask.has(index));
  const categories = ordinals.map((index, visibleIndex) => {
    if (!categoryVector) return String(visibleIndex + 1);
    const value = categoryVector.values[index]!;
    if (value === null) {
      add("blank", "categories", undefined, index);
      return "";
    }
    if (typeof value === "object" || (typeof value === "number" && !Number.isFinite(value))) {
      add("error", "categories", undefined, index);
      return "";
    }
    if (typeof value === "boolean") {
      add("text", "categories", undefined, index);
      return "";
    }
    return String(value);
  });
  const series: ChartSeries[] = retained.map(({ entry, name, vector: original }) => {
    const vector = original!;
    const values = ordinals.map((index) => {
      const value = vector.values[index]!;
      if (typeof value === "number" && Number.isFinite(value)) return value;
      add(
        value === null
          ? "blank"
          : typeof value === "object" || typeof value === "number"
            ? "error"
            : "text",
        "values",
        entry.id,
        index,
      );
      return null;
    });
    const formats = ordinals.flatMap((index) =>
      typeof vector.values[index] === "number" && vector.sheet && vector.addresses
        ? [getCellStyle(vector.sheet, vector.addresses[index]!)?.numberFormat]
        : [],
    );
    const first = formats[0];
    const numberFormat =
      first && formats.every((format) => JSON.stringify(format) === JSON.stringify(first))
        ? { ...first }
        : undefined;
    return {
      id: entry.id,
      colorIndex: entry.colorIndex,
      name,
      values,
      ...(numberFormat ? { numberFormat } : {}),
    };
  });
  const raw = (value: FormulaValue): string | number | null =>
    typeof value === "string" || (typeof value === "number" && Number.isFinite(value))
      ? value
      : null;
  const records = ordinals.map((ordinal, index) => [
    categoryVector ? raw(categoryVector.values[ordinal]!) : categories[index]!,
    ...retained.map(({ vector }) => raw(vector!.values[ordinal]!)),
  ]);
  return { categories, series, records, ...(diagnostics.length ? { diagnostics } : {}) };
}
