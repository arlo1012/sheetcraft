import { isFormulaError, createFormulaError, type FormulaValue } from "./formula/types.js";
import {
  MAX_SHEET_ROWS,
  MAX_SHEET_COLUMNS,
  createWorkbookEvaluator,
  type CellAddress,
  type CellRange,
  type CellValue,
  type Workbook,
} from "./workbook.js";
export type PivotAggregate = "sum" | "count" | "average" | "min" | "max";
export type PivotValueField = { field: number; aggregate: PivotAggregate; caption: string };
export type PivotFilter = { field: number; values: CellValue[] };
export type SheetPivotTable = {
  id: string;
  name: string;
  sourceSheetId: string;
  source: CellRange | null;
  anchor: CellAddress;
  outputRange: CellRange | null;
  rowFields: number[];
  columnFields: number[];
  values: PivotValueField[];
  filters: PivotFilter[];
  rowTotals: boolean;
  columnTotals: boolean;
  includeHidden: boolean;
  sort: "source" | "ascending" | "descending";
  totalLabel: string;
  emptyLabel: string;
  styleId?: string;
};
export const MAX_PIVOT_SOURCE_CELLS = 100000;
export const MAX_PIVOT_OUTPUT_CELLS = 10000;
const validAddress = (a: CellAddress) =>
  !!a &&
  Number.isInteger(a.row) &&
  Number.isInteger(a.column) &&
  a.row >= 0 &&
  a.row < MAX_SHEET_ROWS &&
  a.column >= 0 &&
  a.column < MAX_SHEET_COLUMNS;
function cloneRange(range: CellRange | null): CellRange | null {
  if (range === null) return null;
  if (
    !range ||
    !validAddress(range.start) ||
    !validAddress(range.end) ||
    range.start.row > range.end.row ||
    range.start.column > range.end.column
  )
    throw new RangeError("Invalid pivot range.");
  return { start: { ...range.start }, end: { ...range.end } };
}
const text = (value: unknown, max = 200) =>
  typeof value === "string" && !!value.trim() && value.length <= max;
const primitive = (value: unknown): value is CellValue =>
  value === null ||
  typeof value === "string" ||
  typeof value === "boolean" ||
  (typeof value === "number" && Number.isFinite(value));
export function normalizePivotTable(table: SheetPivotTable): SheetPivotTable {
  if (
    !table ||
    !text(table.id) ||
    !text(table.name) ||
    !text(table.sourceSheetId) ||
    !validAddress(table.anchor) ||
    !Array.isArray(table.rowFields) ||
    !Array.isArray(table.columnFields) ||
    !Array.isArray(table.values) ||
    !table.values.length ||
    table.values.length > 16 ||
    !Array.isArray(table.filters) ||
    table.filters.length > 128 ||
    !["source", "ascending", "descending"].includes(table.sort) ||
    [table.rowTotals, table.columnTotals, table.includeHidden].some(
      (value) => typeof value !== "boolean",
    ) ||
    !text(table.totalLabel) ||
    !text(table.emptyLabel) ||
    (table.styleId !== undefined && !text(table.styleId))
  )
    throw new RangeError("Invalid pivot table.");
  const source = cloneRange(table.source);
  const width = source ? source.end.column - source.start.column + 1 : MAX_SHEET_COLUMNS;
  const field = (index: number) => Number.isInteger(index) && index >= 0 && index < width;
  if (
    table.rowFields.length > 32 ||
    table.columnFields.length > 32 ||
    [...table.rowFields, ...table.columnFields].some((index) => !field(index)) ||
    new Set([...table.rowFields, ...table.columnFields]).size !==
      table.rowFields.length + table.columnFields.length ||
    table.values.some(
      (value) =>
        !value ||
        !field(value.field) ||
        !["sum", "count", "average", "min", "max"].includes(value.aggregate) ||
        !text(value.caption),
    ) ||
    table.filters.some(
      (filter) =>
        !filter ||
        !field(filter.field) ||
        !Array.isArray(filter.values) ||
        filter.values.length > 10000 ||
        filter.values.some(
          (value) => !primitive(value) || (typeof value === "string" && value.length > 32767),
        ),
    ) ||
    new Set(table.filters.map((filter) => filter.field)).size !== table.filters.length
  )
    throw new RangeError("Invalid pivot fields.");
  return {
    id: table.id,
    name: table.name,
    sourceSheetId: table.sourceSheetId,
    source,
    anchor: { ...table.anchor },
    outputRange: cloneRange(table.outputRange),
    rowFields: [...table.rowFields],
    columnFields: [...table.columnFields],
    values: table.values.map((value) => ({ ...value })),
    filters: table.filters.map((filter) => ({ field: filter.field, values: [...filter.values] })),
    rowTotals: table.rowTotals,
    columnTotals: table.columnTotals,
    includeHidden: table.includeHidden,
    sort: table.sort,
    totalLabel: table.totalLabel,
    emptyLabel: table.emptyLabel,
    ...(table.styleId ? { styleId: table.styleId } : {}),
  };
}
export function normalizePivotTables(
  tables: readonly SheetPivotTable[] | undefined,
): SheetPivotTable[] {
  if (tables === undefined) return [];
  if (!Array.isArray(tables)) throw new RangeError("Invalid pivot tables.");
  const result = tables.map(normalizePivotTable);
  if (new Set(result.map((table) => table.id)).size !== result.length)
    throw new RangeError("Duplicate pivot IDs.");
  return result;
}
export function getPivotSource(workbook: Workbook, sourceSheetId: string, range: CellRange | null) {
  const source = cloneRange(range);
  const sheet = workbook.sheets.get(sourceSheetId);
  if (!sheet || !source || source.end.row <= source.start.row)
    throw new RangeError("Pivot source needs headers and at least one data row.");
  if (
    (source.end.row - source.start.row + 1) * (source.end.column - source.start.column + 1) >
    MAX_PIVOT_SOURCE_CELLS
  )
    throw new RangeError("Pivot source exceeds 100,000 cells.");
  if (sheet.mergedCells.some((merge) => rangesIntersect(merge, source)))
    throw new RangeError("Pivot source contains merged cells.");
  const evaluator = createWorkbookEvaluator(workbook, sheet.id);
  const headers: string[] = [];
  for (let column = source.start.column; column <= source.end.column; column++) {
    const value = evaluator.getComputedValue({ row: source.start.row, column });
    if (value === null || isFormulaError(value) || !String(value).trim())
      throw new RangeError("Pivot column headers must not be blank.");
    headers.push(String(value));
  }
  if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length)
    throw new RangeError("Pivot column headers must be unique.");
  return { sheet, range: source, evaluator, headers };
}
export const rangesIntersect = (a: CellRange, b: CellRange) =>
  a.start.row <= b.end.row &&
  a.end.row >= b.start.row &&
  a.start.column <= b.end.column &&
  a.end.column >= b.start.column;
export const addressInRange = (address: CellAddress, range: CellRange) =>
  address.row >= range.start.row &&
  address.row <= range.end.row &&
  address.column >= range.start.column &&
  address.column <= range.end.column;
export type PivotResult = {
  matrix: FormulaValue[][];
  headerRows: number;
  rowLabelColumns: number;
  totalRow: number | null;
  totalColumnStart: number | null;
  sourceRows: number;
  headers: string[];
};
type Accumulator = {
  sum: number;
  mean: number;
  count: number;
  countAll: number;
  min: number;
  max: number;
  error?: Extract<FormulaValue, { kind: string }>;
};
const valueKey = (value: FormulaValue) =>
  value === null || value === ""
    ? ["blank"]
    : isFormulaError(value)
      ? ["error", value.code]
      : [typeof value, value];
const groupKey = (values: FormulaValue[]) => JSON.stringify(values.map(valueKey));
export function buildPivotResult(workbook: Workbook, input: SheetPivotTable): PivotResult {
  const table = normalizePivotTable(input);
  const { sheet, range, evaluator, headers } = getPivotSource(
    workbook,
    table.sourceSheetId,
    table.source,
  );
  const rows = new Map<string, FormulaValue[]>();
  const columns = new Map<string, FormulaValue[]>();
  if (!table.rowFields.length) rows.set(groupKey([]), []);
  if (!table.columnFields.length) columns.set(groupKey([]), []);
  const aggregates = new Map<string, Accumulator>();
  let sourceRows = 0;
  const filterKeys = table.filters.map((filter) => ({
    field: filter.field,
    values: new Set(filter.values.map((value) => JSON.stringify(valueKey(value)))),
  }));
  const add = (row: string, column: string, field: number, value: FormulaValue) => {
    const key = JSON.stringify([row, column, field]);
    let aggregate = aggregates.get(key);
    if (!aggregate) {
      aggregate = { sum: 0, mean: 0, count: 0, countAll: 0, min: Infinity, max: -Infinity };
      aggregates.set(key, aggregate);
    }
    if (value !== null && value !== "") aggregate.countAll++;
    if (isFormulaError(value)) aggregate.error ??= value;
    if (typeof value === "number" && Number.isFinite(value)) {
      aggregate.sum += value;
      aggregate.count++;
      aggregate.mean = aggregate.mean * (1 - 1 / aggregate.count) + value / aggregate.count;
      aggregate.min = Math.min(aggregate.min, value);
      aggregate.max = Math.max(aggregate.max, value);
    }
  };
  for (let row = range.start.row + 1; row <= range.end.row; row++) {
    if (!table.includeHidden && sheet.hiddenRows?.has(row)) continue;
    const record = headers.map((_, index) =>
      evaluator.getComputedValue({ row, column: range.start.column + index }),
    );
    if (record.every((value) => value === null || value === "")) continue;
    if (
      filterKeys.some(
        (filter) => !filter.values.has(JSON.stringify(valueKey(record[filter.field] ?? null))),
      )
    )
      continue;
    sourceRows++;
    const rowValues = table.rowFields.map((index) => record[index] ?? null);
    const columnValues = table.columnFields.map((index) => record[index] ?? null);
    const rowKey = groupKey(rowValues),
      columnKey = groupKey(columnValues);
    rows.set(rowKey, rowValues);
    columns.set(columnKey, columnValues);
    if (
      (rows.size + 1 + (table.rowTotals && table.rowFields.length ? 1 : 0)) *
        (Math.max(1, table.rowFields.length) +
          (columns.size + (table.columnTotals && table.columnFields.length ? 1 : 0)) *
            table.values.length) >
      MAX_PIVOT_OUTPUT_CELLS
    )
      throw new RangeError("Pivot output exceeds 10,000 cells.");
    const rowKeys = [rowKey, ...(table.rowTotals && table.rowFields.length ? ["@total"] : [])];
    const columnKeys = [
      columnKey,
      ...(table.columnTotals && table.columnFields.length ? ["@total"] : []),
    ];
    for (const r of rowKeys)
      for (const c of columnKeys)
        table.values.forEach((value, index) => add(r, c, index, record[value.field] ?? null));
  }
  if (!columns.size) columns.set(groupKey([]), []);
  const sorted = (groups: Map<string, FormulaValue[]>) => {
    const entries = [...groups];
    if (table.sort === "source") return entries;
    return entries.sort((a, b) => {
      let comparison = 0;
      for (let index = 0; index < Math.max(a[1].length, b[1].length); index++) {
        const left = a[1][index],
          right = b[1][index];
        comparison =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left ?? "").localeCompare(String(right ?? ""), "en");
        if (comparison) break;
      }
      return table.sort === "descending" ? -comparison : comparison;
    });
  };
  const rowEntries = sorted(rows);
  const columnEntries = sorted(columns);
  const rowLabelColumns = Math.max(1, table.rowFields.length);
  const totalRow = table.rowTotals && table.rowFields.length ? rowEntries.length + 1 : null;
  if (totalRow !== null) rowEntries.push(["@total", [table.totalLabel]]);
  const totalColumnStart =
    table.columnTotals && table.columnFields.length
      ? rowLabelColumns + columnEntries.length * table.values.length
      : null;
  if (totalColumnStart !== null) columnEntries.push(["@total", [table.totalLabel]]);
  const width = rowLabelColumns + columnEntries.length * table.values.length;
  if ((rowEntries.length + 1) * width > MAX_PIVOT_OUTPUT_CELLS)
    throw new RangeError("Pivot output exceeds 10,000 cells.");
  const label = (value: FormulaValue) =>
    value === null || value === "" ? table.emptyLabel : isFormulaError(value) ? value.code : value;
  const heading: FormulaValue[] = table.rowFields.length
    ? table.rowFields.map((index) => headers[index]!)
    : [table.name];
  for (const [, values] of columnEntries)
    for (const value of table.values)
      heading.push([...values.map(label), value.caption].join(" / "));
  const aggregateValue = (row: string, column: string, index: number): FormulaValue => {
    const acc = aggregates.get(JSON.stringify([row, column, index]));
    const type = table.values[index]!.aggregate;
    if (type === "count") return acc?.countAll ?? 0;
    if (acc?.error) return acc.error;
    if (!acc?.count) return type === "average" ? null : 0;
    const number =
      type === "sum" ? acc.sum : type === "average" ? acc.mean : type === "min" ? acc.min : acc.max;
    return Number.isFinite(number) ? number : createFormulaError("NUM");
  };
  const matrix = [
    heading,
    ...rowEntries.map(([key, values]) => {
      const result: FormulaValue[] = Array.from({ length: rowLabelColumns }, (_, index) =>
        index < values.length ? (key === "@total" ? table.totalLabel : label(values[index]!)) : "",
      );
      if (!table.rowFields.length) result[0] = table.totalLabel;
      for (const [column] of columnEntries)
        table.values.forEach((_, index) => result.push(aggregateValue(key, column, index)));
      return result;
    }),
  ];
  return {
    matrix,
    headerRows: 1,
    rowLabelColumns,
    totalRow,
    totalColumnStart,
    sourceRows,
    headers,
  };
}
export type PivotTablesSnapshot = Array<{ sheetId: string; tables: SheetPivotTable[] }>;
export function capturePivotTables(workbook: Workbook): PivotTablesSnapshot {
  return [...workbook.sheets.values()].map((sheet) => ({
    sheetId: sheet.id,
    tables: normalizePivotTables(sheet.pivotTables),
  }));
}
export function restorePivotTables(
  workbook: Workbook,
  snapshot: PivotTablesSnapshot | undefined,
): boolean {
  if (!snapshot) return false;
  const entries = snapshot.map((entry) => ({
    sheet: workbook.sheets.get(entry.sheetId),
    tables: normalizePivotTables(entry.tables),
  }));
  let changed = false;
  for (const { sheet, tables } of entries)
    if (sheet && JSON.stringify(sheet.pivotTables ?? []) !== JSON.stringify(tables)) {
      sheet.pivotTables = tables;
      changed = true;
    }
  return changed;
}
/** Plans reference changes before mutating the workbook, preserving field identities. */
export function transformPivotReferences(
  snapshot: PivotTablesSnapshot,
  sheetId: string,
  mapAddress: (address: CellAddress) => CellAddress | null,
  mapRange: (range: CellRange) => CellRange | null,
): PivotTablesSnapshot {
  return snapshot.map((entry) => ({
    sheetId: entry.sheetId,
    tables: entry.tables.flatMap((input) => {
      const table = normalizePivotTable(input);
      if (entry.sheetId === sheetId) {
        const anchor = mapAddress(table.anchor);
        if (!anchor) return [];
        table.anchor = anchor;
        table.outputRange = table.outputRange ? mapRange(table.outputRange) : null;
      }
      if (table.sourceSheetId === sheetId && table.source) {
        const previous = table.source;
        const next = mapRange(previous);
        const header = mapAddress(previous.start);
        const field = (index: number) => {
          const address = mapAddress({
            row: previous.start.row,
            column: previous.start.column + index,
          });
          return address && next ? address.column - next.start.column : -1;
        };
        const fields = [
          ...table.rowFields,
          ...table.columnFields,
          ...table.values.map((value) => value.field),
          ...table.filters.map((filter) => filter.field),
        ];
        if (
          !next ||
          !header ||
          fields.some(
            (index) => field(index) < 0 || field(index) > next.end.column - next.start.column,
          )
        )
          table.source = null;
        else {
          table.source = next;
          table.rowFields = table.rowFields.map(field);
          table.columnFields = table.columnFields.map(field);
          table.values = table.values.map((value) => ({ ...value, field: field(value.field) }));
          table.filters = table.filters.map((filter) => ({
            ...filter,
            field: field(filter.field),
          }));
        }
      }
      return [normalizePivotTable(table)];
    }),
  }));
}
