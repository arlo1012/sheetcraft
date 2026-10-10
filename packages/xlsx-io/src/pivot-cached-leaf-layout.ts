import {
  buildPivotResult,
  getPivotPresentation,
  type SheetPivotTable,
} from "@sheetcraft/core/pivot-tables";
import { createWorkbookEvaluator, type CellValue, type Workbook } from "@sheetcraft/core/workbook";
import { pivotValueKey, readPivotSharedItems } from "./pivot-cache.js";
import { attr, child, nodes, type XmlNode } from "./pivot-xml.js";

/** Restore only leaf layouts whose cache, native item order and displayed cells all agree. */
export function restoreCachedLeafPivotLayout(
  workbook: Workbook,
  sheetId: string,
  table: SheetPivotTable,
  definition: XmlNode,
  cacheBytes: Uint8Array,
  productMetadataRestored = false,
): boolean {
  const range = table.outputRange;
  const presentation = getPivotPresentation(table);
  if (
    !range ||
    !table.dataCache ||
    table.rowFields.length !== 1 ||
    table.columnFields.length !== 1 ||
    table.values.length !== 1 ||
    table.values[0]?.display ||
    table.groups?.length ||
    table.consolidation ||
    table.filters.length ||
    table.axisFilters?.length ||
    presentation.blankRows
  )
    return false;
  const location = child(definition, "location");
  const headerRows = Number(attr(location, "firstDataRow", "-1"));
  if (headerRows !== 2 || Number(attr(location, "firstDataCol", "-1")) !== 1) return false;
  const shared = readPivotSharedItems(cacheBytes, workbook.dateSystem).shared;
  const fields = nodes(child(definition, "pivotFields").pivotField);
  const members = (tag: string, field: number, total: boolean): CellValue[] | undefined => {
    const items = nodes(child(definition, tag).i);
    if (!items.length || Number(attr(child(definition, tag), "count", "-1")) !== items.length)
      return;
    const nativeItems = child(fields[field] ?? {}, "items");
    const fieldItems = nodes(nativeItems.item);
    if (Number(attr(nativeItems, "count", "-1")) !== fieldItems.length) return;
    const values: CellValue[] = [];
    for (const [index, item] of items.entries()) {
      const x = Array.isArray(item.x) ? item.x : item.x === undefined ? [] : [item.x];
      if (
        x.length !== 1 ||
        Number(attr(item, "r", "0")) !== 0 ||
        Number(attr(item, "i", "0")) !== 0
      )
        return;
      const grand = attr(item, "t") === "grand";
      if (grand) {
        if (!total || index !== items.length - 1) return;
        continue;
      }
      if (total && index === items.length - 1) return;
      if (!["", "data"].includes(attr(item, "t"))) return;
      const fieldIndex = Number(attr(child(item, "x"), "v", "0"));
      if (!Number.isInteger(fieldIndex) || fieldIndex < 0) return;
      const fieldItem = fieldItems[fieldIndex];
      if (!fieldItem || !["", "data"].includes(attr(fieldItem, "t"))) return;
      const sharedIndex = Number(attr(fieldItem, "x", "-1"));
      if (
        !Number.isInteger(sharedIndex) ||
        sharedIndex < 0 ||
        sharedIndex >= (shared[field]?.length ?? 0)
      )
        return;
      const value = shared[field]![sharedIndex]!;
      if (value !== null && typeof value === "object") return;
      values.push(value);
    }
    return values.length && new Set(values.map(pivotValueKey)).size === values.length
      ? values
      : undefined;
  };
  const rows = members("rowItems", table.rowFields[0]!, table.rowTotals);
  const columns = members("colItems", table.columnFields[0]!, table.columnTotals);
  if (
    !rows ||
    !columns ||
    range.end.row - range.start.row + 1 !== headerRows + rows.length + Number(table.rowTotals) ||
    range.end.column - range.start.column + 1 !== 1 + columns.length + Number(table.columnTotals)
  )
    return false;
  const evaluator = createWorkbookEvaluator(workbook, sheetId);
  const sortFields =
    table.sortFields?.filter(
      (rule) =>
        !(
          (rule.axis === "rows" && rule.field === table.rowFields[0]) ||
          (rule.axis === "columns" && rule.field === table.columnFields[0])
        ),
    ) ?? [];
  for (const [axis, field, values] of [
    ["rows", table.rowFields[0]!, rows],
    ["columns", table.columnFields[0]!, columns],
  ] as const) {
    const order = attr(fields[field] ?? {}, "sortType", "manual");
    if (order === "manual") sortFields.push({ axis, field, order, members: [...values] });
    else if (order === "ascending" || order === "descending") {
      const existing = table.sortFields?.find(
        (rule) => rule.axis === axis && rule.field === field && rule.order === order,
      );
      sortFields.push(existing ?? { axis, field, order });
    } else return false;
  }
  // Native manual order is explicit membership, not an inferred alphabetical rule.
  // Rebuild only from the saved cache to prove Show Details and refresh share it.
  {
    const candidate: SheetPivotTable = {
      ...table,
      // A valid own extension distinguishes source order from native manual
      // order. Preserve its refresh semantics, but still prove native items and
      // saved cells against that rule before restoring a chart-capable layout.
      sortFields: productMetadataRestored ? table.sortFields : sortFields,
      presentation: productMetadataRestored
        ? table.presentation
        : { ...presentation, subtotals: "off" },
    };
    const result = buildPivotResult(workbook, candidate, { useCache: true });
    if (
      result.headerRows !== headerRows ||
      result.matrix.length !== headerRows + rows.length + Number(table.rowTotals)
    )
      return false;
    const rowMembers = result.dataRows.map((row) => pivotValueKey(result.rowMembers[row]![0]!));
    const columnMembers = result.columnMembers
      .slice(0, columns.length)
      .map((values) => pivotValueKey(values[0]!));
    if (
      JSON.stringify(rowMembers) !== JSON.stringify(rows.map(pivotValueKey)) ||
      JSON.stringify(columnMembers) !== JSON.stringify(columns.map(pivotValueKey))
    )
      return false;
    const matches = result.matrix.every((row, rowIndex) =>
      row.every(
        (value, column) =>
          JSON.stringify(value === "" ? null : value) ===
          JSON.stringify(
            evaluator.getComputedValue({
              row: range.start.row + rowIndex,
              column: range.start.column + column,
            }),
          ),
      ),
    );
    if (!matches) return false;
    table.sortFields = candidate.sortFields;
    table.presentation = candidate.presentation;
    table.resultLayout = {
      labelColumns: 1,
      headerRows,
      dataRows: result.dataRows,
      rowLabels: result.rowLabels,
      rowFieldIndices: result.rowFieldIndices,
      valueRows: result.rowMembers.flatMap((value, index) => (value === null ? [] : [index])),
      seriesLabels: Array.from(
        { length: columns.length + Number(table.columnTotals) },
        (_, index) =>
          String(
            evaluator.getComputedValue({
              row: range.start.row + headerRows - 1,
              column: range.start.column + index + 1,
            }) ?? "",
          ),
      ),
    };
    return true;
  }
}
