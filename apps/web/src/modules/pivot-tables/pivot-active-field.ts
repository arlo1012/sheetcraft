import {
  getPivotPresentation,
  getPivotTableRange,
  type SheetPivotTable,
} from "@idea10/core/pivot-tables";
import type { CellAddress } from "@idea10/core/workbook";
import type { PivotArea } from "./pivot-field-edits";

/** Resolve the field represented by a report cell, including page and nested row headings. */
export function getPivotActiveField(
  table: SheetPivotTable,
  headers: readonly string[],
  address: CellAddress,
): { area: PivotArea; index: number; name: string } | undefined {
  const range = getPivotTableRange(table);
  if (
    address.row < range.start.row ||
    address.row > range.end.row ||
    address.column < range.start.column ||
    address.column > range.end.column
  )
    return undefined;
  const row = address.row - table.anchor.row;
  const column = address.column - table.anchor.column;
  const labels =
    table.resultLayout?.labelColumns ??
    (getPivotPresentation(table).layout === "compact" ? 1 : Math.max(1, table.rowFields.length));
  const field = (area: "rows" | "columns" | "filters", index: number) => {
    const value =
      area === "filters"
        ? table.filters[index]?.field
        : (area === "rows" ? table.rowFields : table.columnFields)[index];
    return value === undefined ? undefined : { area, index, name: headers[value] ?? "" };
  };
  const value = (index: number) =>
    table.values[index]
      ? { area: "values" as const, index, name: table.values[index]!.caption }
      : undefined;
  const start = table.reportLayout && table.filters.length ? table.filters.length + 1 : 0;
  if (row < start)
    return row < table.filters.length && column <= 1 ? field("filters", row) : undefined;
  const headerRows =
    table.resultLayout?.headerRows ??
    (table.reportLayout && table.columnFields.length
      ? start + 1 + table.columnFields.length + (table.values.length > 1 ? 1 : 0)
      : start + 1);
  if (row < headerRows) {
    if (column < labels) {
      if (
        row === start &&
        table.reportLayout &&
        table.columnFields.length &&
        table.values.length === 1
      )
        return value(0);
      return field("rows", Math.min(column, table.rowFields.length - 1));
    }
    if (table.columnFields.length) {
      const level = table.reportLayout ? row - start - 1 : 0;
      if (table.values.length > 1 && row === headerRows - 1)
        return value((column - labels) % table.values.length);
      return field("columns", Math.max(0, Math.min(level, table.columnFields.length - 1)));
    }
    return value(Math.max(0, column - labels) % Math.max(1, table.values.length));
  }
  if (column < labels) {
    const index =
      getPivotPresentation(table).layout === "compact"
        ? table.resultLayout?.rowFieldIndices?.[row]
        : column;
    if (index === null) return undefined;
    return field("rows", index ?? Math.max(0, table.rowFields.length - 1));
  }
  return value((column - labels) % Math.max(1, table.values.length));
}
