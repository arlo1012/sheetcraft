import {
  normalizePivotGroups,
  refreshPivotGroupBounds,
  groupPivotRecords,
  getPivotGroupLabels,
  type PivotFieldGroup,
} from "./pivot-groups.js";
export {
  getPivotGroupLabels,
  getPivotGroupedValue,
  type PivotFieldGroup,
  type PivotDateGroupUnit,
} from "./pivot-groups.js";
import { isFormulaError, type FormulaValue } from "./formula/types.js";
import {
  MAX_SHEET_ROWS,
  MAX_SHEET_COLUMNS,
  createWorkbookEvaluator,
  type CellAddress,
  type CellRange,
  type CellValue,
  type Workbook,
} from "./workbook.js";
import {
  filterPivotRecords,
  normalizePivotAxisFilters,
  type PivotAxisFilter,
} from "./pivot-filters.js";
import {
  addPivotValue,
  createPivotAccumulator,
  getPivotAggregateValue,
  type PivotAccumulator,
} from "./pivot-aggregate.js";
export type { PivotAxisFilter, PivotLabelCondition, PivotValueCondition } from "./pivot-filters.js";
export type PivotAggregate = "sum" | "count" | "average" | "min" | "max";
export type PivotValueField = { field: number; aggregate: PivotAggregate; caption: string };
export type PivotFilter = { field: number; values: CellValue[]; all?: boolean };
export type PivotPresentation = {
  layout: "compact" | "outline" | "tabular";
  subtotals: "off" | "top" | "bottom";
  repeatLabels: boolean;
  blankRows: boolean;
  rowHeaders: boolean;
  columnHeaders: boolean;
  bandedRows: boolean;
  bandedColumns: boolean;
};
export type PivotFieldSort = {
  axis: "rows" | "columns";
  field: number;
  order: "ascending" | "descending";
  measure?: number;
};
export type PivotResultLayout = {
  labelColumns: number;
  dataRows: number[];
  rowLabels: string[];
  headerRows?: number;
  rowFieldIndices?: Array<number | null>;
  valueRows?: number[];
  seriesLabels?: string[];
};
export type PivotReportLayout = {
  rowLabel: string;
  columnLabel: string;
  allLabel: string;
  multipleLabel: string;
  fillColor?: string;
  borderColor?: string;
};
export type PivotSourceRange = {
  sheetId: string;
  range: CellRange | null;
  label: string;
  pageItems?: string[];
};
export type PivotConsolidation = {
  ranges: PivotSourceRange[];
  /** Row, column, value and source-area field captions. */
  labels: string[];
  pageFields?: { mode: "single" | "custom"; count: number };
};
export type PivotDataCache = { headers: string[]; records: FormulaValue[][] };
export type SheetPivotTable = {
  dataCache?: PivotDataCache;
  groups?: PivotFieldGroup[];
  id: string;
  name: string;
  sourceSheetId: string;
  source: CellRange | null;
  consolidation?: PivotConsolidation;
  reportLayout?: PivotReportLayout;
  axisFilters?: PivotAxisFilter[];
  sortFields?: PivotFieldSort[];
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
  presentation?: PivotPresentation;
  resultLayout?: PivotResultLayout;
};
export const MAX_PIVOT_SOURCE_CELLS = 100000;
export const MAX_PIVOT_OUTPUT_CELLS = 10000;
/** Consolidation expands each physical value into at most seven logical fields. */
export const MAX_PIVOT_CACHE_CELLS = MAX_PIVOT_SOURCE_CELLS * 7;
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
  const dataCache = table.dataCache;
  if (
    dataCache !== undefined &&
    (!dataCache ||
      !Array.isArray(dataCache.headers) ||
      !dataCache.headers.length ||
      dataCache.headers.length > MAX_SHEET_COLUMNS ||
      dataCache.headers.some((header) => !text(header, 32767)) ||
      !Array.isArray(dataCache.records) ||
      (dataCache.records.length + 1) * dataCache.headers.length > MAX_PIVOT_CACHE_CELLS ||
      dataCache.records.some(
        (record) =>
          !Array.isArray(record) ||
          record.length !== dataCache.headers.length ||
          record.some((value) => !primitive(value) && !isFormulaError(value)),
      ))
  )
    throw new RangeError("Invalid pivot data cache.");
  const presentation = table.presentation;
  if (
    presentation &&
    (!["compact", "outline", "tabular"].includes(presentation.layout) ||
      !["off", "top", "bottom"].includes(presentation.subtotals) ||
      [
        presentation.repeatLabels,
        presentation.blankRows,
        presentation.rowHeaders,
        presentation.columnHeaders,
        presentation.bandedRows,
        presentation.bandedColumns,
      ].some((value) => typeof value !== "boolean"))
  )
    throw new RangeError("Invalid pivot presentation.");
  const resultLayout = table.resultLayout;
  if (
    resultLayout &&
    (!Number.isInteger(resultLayout.labelColumns) ||
      resultLayout.labelColumns < 1 ||
      resultLayout.labelColumns > 32 ||
      !Array.isArray(resultLayout.dataRows) ||
      !Array.isArray(resultLayout.rowLabels) ||
      resultLayout.dataRows.length !== resultLayout.rowLabels.length ||
      resultLayout.dataRows.length > MAX_PIVOT_OUTPUT_CELLS ||
      resultLayout.dataRows.some(
        (row, index) =>
          !Number.isInteger(row) ||
          row < 1 ||
          row >= MAX_PIVOT_OUTPUT_CELLS ||
          (index > 0 && row <= resultLayout.dataRows[index - 1]!),
      ) ||
      resultLayout.rowLabels.some((label) => typeof label !== "string" || label.length > 1048576) ||
      (resultLayout.valueRows !== undefined &&
        (!Array.isArray(resultLayout.valueRows) ||
          resultLayout.valueRows.length > MAX_PIVOT_OUTPUT_CELLS ||
          resultLayout.valueRows.some(
            (row, index) =>
              !Number.isInteger(row) ||
              row < 1 ||
              row >= MAX_PIVOT_OUTPUT_CELLS ||
              (index > 0 && row <= resultLayout.valueRows![index - 1]!),
          ))) ||
      (resultLayout.rowFieldIndices !== undefined &&
        (!Array.isArray(resultLayout.rowFieldIndices) ||
          resultLayout.rowFieldIndices.length > MAX_PIVOT_OUTPUT_CELLS ||
          resultLayout.rowFieldIndices.some(
            (index) => index !== null && (!Number.isInteger(index) || index < 0 || index >= 32),
          ))) ||
      (resultLayout.headerRows !== undefined &&
        (!Number.isInteger(resultLayout.headerRows) ||
          resultLayout.headerRows < 1 ||
          resultLayout.headerRows > MAX_PIVOT_OUTPUT_CELLS)) ||
      (resultLayout.seriesLabels !== undefined &&
        (!Array.isArray(resultLayout.seriesLabels) ||
          resultLayout.seriesLabels.length > MAX_PIVOT_OUTPUT_CELLS ||
          resultLayout.seriesLabels.some(
            (label) => typeof label !== "string" || label.length > 1048576,
          ))))
  )
    throw new RangeError("Invalid pivot result layout.");
  const reportLayout = table.reportLayout;
  if (
    reportLayout !== undefined &&
    (!reportLayout ||
      [
        reportLayout.rowLabel,
        reportLayout.columnLabel,
        reportLayout.allLabel,
        reportLayout.multipleLabel,
      ].some((label) => !text(label)))
  )
    throw new RangeError("Invalid pivot report layout.");
  if (
    reportLayout &&
    [reportLayout.fillColor, reportLayout.borderColor].some(
      (color) => color !== undefined && !/^#[0-9a-f]{6}$/i.test(color),
    )
  )
    throw new RangeError("Invalid pivot report colors.");
  const axisFilters = normalizePivotAxisFilters(table);
  const sortFields = table.sortFields;
  if (
    sortFields !== undefined &&
    (!Array.isArray(sortFields) ||
      sortFields.length > 64 ||
      sortFields.some(
        (rule) =>
          !rule ||
          !["rows", "columns"].includes(rule.axis) ||
          !(rule.axis === "rows" ? table.rowFields : table.columnFields).includes(rule.field) ||
          !["ascending", "descending"].includes(rule.order) ||
          (rule.measure !== undefined &&
            (!Number.isInteger(rule.measure) ||
              rule.measure < 0 ||
              rule.measure >= table.values.length)),
      ) ||
      new Set(sortFields.map((rule) => `${rule.axis}:${rule.field}`)).size !== sortFields.length)
  )
    throw new RangeError("Invalid pivot field sort.");
  const consolidation = table.consolidation;
  const pageFields = consolidation?.pageFields;
  if (
    pageFields !== undefined &&
    (!pageFields ||
      !["single", "custom"].includes(pageFields.mode) ||
      !Number.isInteger(pageFields.count) ||
      pageFields.count < 0 ||
      pageFields.count > 4 ||
      (pageFields.mode === "single" && pageFields.count !== 1))
  )
    throw new RangeError("Invalid consolidation page fields.");
  if (
    consolidation !== undefined &&
    (!consolidation ||
      !Array.isArray(consolidation.ranges) ||
      !consolidation.ranges.length ||
      consolidation.ranges.length > 128 ||
      !Array.isArray(consolidation.labels) ||
      consolidation.labels.length !== 3 + (pageFields?.count ?? 1) ||
      consolidation.labels.some((label) => !text(label)) ||
      new Set(consolidation.labels).size !== consolidation.labels.length ||
      consolidation.ranges.some(
        (area) =>
          !area ||
          !text(area.sheetId) ||
          !text(area.label) ||
          (pageFields !== undefined &&
            (!Array.isArray(area.pageItems) ||
              area.pageItems.length !== pageFields.count ||
              area.pageItems.some((item) => !text(item)))) ||
          (pageFields === undefined && area.pageItems !== undefined),
      ))
  )
    throw new RangeError("Invalid pivot consolidation.");
  const ranges = consolidation?.ranges.map((area) => ({
    sheetId: area.sheetId,
    range: cloneRange(area.range),
    label: area.label,
    ...(area.pageItems ? { pageItems: [...area.pageItems] } : {}),
  }));
  const source = ranges ? ranges[0]!.range : cloneRange(table.source);
  const width = consolidation
    ? consolidation.labels.length
    : source
      ? source.end.column - source.start.column + 1
      : MAX_SHEET_COLUMNS;
  if (dataCache && (source || consolidation) && dataCache.headers.length !== width)
    throw new RangeError("Invalid pivot cache field count.");
  const groups = normalizePivotGroups(table.groups, width);
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
        (filter.all !== undefined && typeof filter.all !== "boolean") ||
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
    ...(dataCache
      ? {
          dataCache: {
            headers: [...dataCache.headers],
            records: dataCache.records.map((record) =>
              record.map((value) => (isFormulaError(value) ? { ...value } : value)),
            ),
          },
        }
      : {}),
    ...(groups?.length ? { groups } : {}),
    id: table.id,
    name: table.name,
    sourceSheetId: ranges ? ranges[0]!.sheetId : table.sourceSheetId,
    source,
    ...(consolidation && ranges
      ? {
          consolidation: {
            ranges,
            labels: [...consolidation.labels],
            ...(pageFields ? { pageFields: { ...pageFields } } : {}),
          },
        }
      : {}),
    anchor: { ...table.anchor },
    outputRange: cloneRange(table.outputRange),
    ...(axisFilters ? { axisFilters } : {}),
    ...(sortFields ? { sortFields: sortFields.map((rule) => ({ ...rule })) } : {}),
    rowFields: [...table.rowFields],
    columnFields: [...table.columnFields],
    values: table.values.map((value) => ({ ...value })),
    filters: table.filters.map((filter) => ({
      field: filter.field,
      values: [...filter.values],
      ...(filter.all !== undefined ? { all: filter.all } : {}),
    })),
    rowTotals: table.rowTotals,
    columnTotals: table.columnTotals,
    includeHidden: table.includeHidden,
    sort: table.sort,
    totalLabel: table.totalLabel,
    emptyLabel: table.emptyLabel,
    ...(table.styleId ? { styleId: table.styleId } : {}),
    ...(reportLayout ? { reportLayout: { ...reportLayout } } : {}),
    ...(presentation ? { presentation: { ...presentation } } : {}),
    ...(resultLayout
      ? {
          resultLayout: {
            labelColumns: resultLayout.labelColumns,
            dataRows: [...resultLayout.dataRows],
            ...(resultLayout.valueRows ? { valueRows: [...resultLayout.valueRows] } : {}),
            rowLabels: [...resultLayout.rowLabels],
            ...(resultLayout.rowFieldIndices
              ? { rowFieldIndices: [...resultLayout.rowFieldIndices] }
              : {}),
            ...(resultLayout.headerRows !== undefined
              ? { headerRows: resultLayout.headerRows }
              : {}),
            ...(resultLayout.seriesLabels ? { seriesLabels: [...resultLayout.seriesLabels] } : {}),
          },
        }
      : {}),
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
/** Every physical source area, also used to protect source cells from report output. */
export function getPivotSourceRanges(table: SheetPivotTable): PivotSourceRange[] {
  return (
    table.consolidation?.ranges ?? [
      { sheetId: table.sourceSheetId, range: table.source, label: table.name },
    ]
  );
}
/** Uniform record stream for ordinary lists and labeled consolidation matrices. */
export function getRawPivotTableSource(workbook: Workbook, table: SheetPivotTable) {
  if (!table.consolidation) {
    const info = getPivotSource(workbook, table.sourceSheetId, table.source);
    return {
      headers: info.headers,
      *records(): Generator<FormulaValue[]> {
        for (let row = info.range.start.row + 1; row <= info.range.end.row; row++) {
          if (!table.includeHidden && info.sheet.hiddenRows?.has(row)) continue;
          yield info.headers.map((_, field) =>
            info.evaluator.getComputedValue({ row, column: info.range.start.column + field }),
          );
        }
      },
    };
  }
  let cells = 0;
  const areas = table.consolidation.ranges.map((area, index, ranges) => {
    const range = cloneRange(area.range);
    const sheet = workbook.sheets.get(area.sheetId);
    if (
      !range ||
      !sheet ||
      range.end.row <= range.start.row ||
      range.end.column <= range.start.column
    )
      throw new RangeError("Consolidation needs row labels, column labels and values.");
    cells += (range.end.row - range.start.row + 1) * (range.end.column - range.start.column + 1);
    if (cells > MAX_PIVOT_SOURCE_CELLS) throw new RangeError("Pivot source exceeds 100,000 cells.");
    if (sheet.mergedCells.some((merge) => rangesIntersect(merge, range)))
      throw new RangeError("Pivot source contains merged cells.");
    if (
      ranges
        .slice(0, index)
        .some(
          (previous) =>
            previous.sheetId === area.sheetId &&
            previous.range &&
            rangesIntersect(previous.range, range),
        )
    )
      throw new RangeError("Consolidation areas must not overlap.");
    const evaluator = createWorkbookEvaluator(workbook, sheet.id);
    const columns: FormulaValue[] = [];
    for (let column = range.start.column + 1; column <= range.end.column; column++) {
      const label = evaluator.getComputedValue({ row: range.start.row, column });
      if (label === null || isFormulaError(label) || !String(label).trim())
        throw new RangeError("Consolidation column labels must not be blank.");
      columns.push(label);
    }
    // Validate all labels before offering or mutating a report, including hidden rows.
    for (let row = range.start.row + 1; row <= range.end.row; row++) {
      const label = evaluator.getComputedValue({ row, column: range.start.column });
      if (label === null || isFormulaError(label) || !String(label).trim()) {
        const blank = columns.every((_, index) => {
          const value = evaluator.getComputedValue({ row, column: range.start.column + index + 1 });
          return value === null || value === "";
        });
        if (!blank) throw new RangeError("Consolidation row labels must not be blank.");
      }
    }
    return { sheet, range, evaluator, columns, pageItems: area.pageItems ?? [area.label] };
  });
  return {
    headers: [...table.consolidation.labels],
    *records(): Generator<FormulaValue[]> {
      for (const { sheet, range, evaluator, columns, pageItems } of areas)
        for (let row = range.start.row + 1; row <= range.end.row; row++) {
          if (!table.includeHidden && sheet.hiddenRows?.has(row)) continue;
          const rowLabel = evaluator.getComputedValue({ row, column: range.start.column });
          if (rowLabel === null || isFormulaError(rowLabel) || !String(rowLabel).trim()) continue;
          for (let field = 0; field < columns.length; field++) {
            const column = range.start.column + field + 1;
            if (!table.includeHidden && sheet.hiddenColumns?.has(column)) continue;
            yield [
              rowLabel,
              columns[field]!,
              evaluator.getComputedValue({ row, column }),
              ...pageItems,
            ];
          }
        }
    },
  };
}
/** Field menus use the same group members as the displayed report. */
export function getPivotTableSource(workbook: Workbook, table: SheetPivotTable) {
  const source = getRawPivotTableSource(workbook, table);
  if (!table.groups?.length) return source;
  return {
    headers: source.headers,
    records: () =>
      groupPivotRecords([...source.records()], table.groups, workbook.dateSystem).values(),
  };
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
/** Empty reports reserve a visible sheet area without writing placeholder cell values. */
export function getPivotTableRange(table: SheetPivotTable): CellRange {
  return (
    table.outputRange ?? {
      start: { ...table.anchor },
      end: {
        row: Math.min(MAX_SHEET_ROWS - 1, table.anchor.row + 13),
        column: Math.min(MAX_SHEET_COLUMNS - 1, table.anchor.column + 2),
      },
    }
  );
}
export function getPivotPresentation(table: SheetPivotTable): PivotPresentation {
  return (
    table.presentation ?? {
      layout: "tabular",
      subtotals: "off",
      repeatLabels: true,
      blankRows: false,
      rowHeaders: true,
      columnHeaders: true,
      bandedRows: true,
      bandedColumns: false,
    }
  );
}
export type PivotResult = {
  matrix: FormulaValue[][];
  dataCache: PivotDataCache;
  groups?: PivotFieldGroup[];
  rowMembers: Array<FormulaValue[] | null>;
  columnMembers: FormulaValue[][];
  filteredRecords: FormulaValue[][];
  headerRows: number;
  rowLabelColumns: number;
  headerStart: number;
  seriesLabels: string[];
  totalRow: number | null;
  totalColumnStart: number | null;
  sourceRows: number;
  headers: string[];
  dataRows: number[];
  rowLabels: string[];
  rowIndents: number[];
  rowFieldIndices: Array<number | null>;
  subtotalRows: number[];
};
const valueKey = (value: FormulaValue) =>
  value === null || value === ""
    ? ["blank"]
    : isFormulaError(value)
      ? ["error", value.code]
      : [typeof value, value];
const groupKey = (values: FormulaValue[]) => JSON.stringify(values.map(valueKey));
export function buildPivotResult(
  workbook: Workbook,
  input: SheetPivotTable,
  options?: { useCache?: boolean },
): PivotResult {
  const table = normalizePivotTable(input);
  const source =
    options?.useCache && table.dataCache
      ? { headers: table.dataCache.headers, records: () => table.dataCache!.records.values() }
      : getRawPivotTableSource(workbook, table);
  const { headers } = source;
  const dataCache = {
    headers: [...headers],
    records: [...source.records()].map((record) =>
      record.map((value) => (isFormulaError(value) ? { ...value } : value)),
    ),
  };
  if ((dataCache.records.length + 1) * headers.length > MAX_PIVOT_CACHE_CELLS)
    throw new RangeError("Pivot data cache is too large.");
  if (!table.rowFields.length && !table.columnFields.length && !table.values.length)
    return {
      matrix: [],
      dataCache,
      ...(table.groups?.length ? { groups: table.groups } : {}),
      rowMembers: [],
      columnMembers: [],
      filteredRecords: [],
      headerRows: 0,
      rowLabelColumns: 1,
      headerStart: 0,
      seriesLabels: [],
      totalRow: null,
      totalColumnStart: null,
      sourceRows: 0,
      headers,
      dataRows: [],
      rowLabels: [],
      rowIndents: [],
      rowFieldIndices: [],
      subtotalRows: [],
    };
  const presentation = getPivotPresentation(table);
  const rows = new Map<string, FormulaValue[]>();
  const columns = new Map<string, FormulaValue[]>();
  if (!table.rowFields.length) rows.set(groupKey([]), []);
  if (!table.columnFields.length) columns.set(groupKey([]), []);
  const aggregates = new Map<string, PivotAccumulator>();
  let sourceRows = 0;
  const filterKeys = table.filters
    .filter((filter) => !filter.all)
    .map((filter) => ({
      field: filter.field,
      values: new Set(filter.values.map((value) => JSON.stringify(valueKey(value)))),
    }));
  const add = (row: string, column: string, field: number, value: FormulaValue) => {
    const key = JSON.stringify([row, column, field]);
    let aggregate = aggregates.get(key);
    if (!aggregate) {
      aggregate = createPivotAccumulator();
      aggregates.set(key, aggregate);
    }
    addPivotValue(aggregate, value);
  };
  const records: FormulaValue[][] = [];
  if (!options?.useCache)
    table.groups = refreshPivotGroupBounds(table.groups, dataCache.records, workbook.dateSystem);
  const groupedRecords = groupPivotRecords(dataCache.records, table.groups, workbook.dateSystem);
  const originals = new Map(
    groupedRecords.map((record, index) => [record, dataCache.records[index]!]),
  );
  const rawValue = (record: FormulaValue[], field: number) =>
    originals.get(record)?.[field] ?? null;
  for (const record of groupedRecords) {
    if (record.every((value) => value === null || value === "")) continue;
    if (
      filterKeys.some(
        (filter) => !filter.values.has(JSON.stringify(valueKey(record[filter.field] ?? null))),
      )
    )
      continue;
    records.push(record);
  }
  const filteredRecords = filterPivotRecords(table, records, rawValue);
  for (const record of filteredRecords) {
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
    const rowKeys = [
      rowKey,
      ...(table.rowTotals && table.rowFields.length ? ["@total"] : []),
      ...rowValues
        .slice(0, -1)
        .map((_, index) => `@group:${groupKey(rowValues.slice(0, index + 1))}`),
    ];
    const columnKeys = [
      columnKey,
      ...(table.columnTotals && table.columnFields.length ? ["@total"] : []),
    ];
    for (const r of rowKeys)
      for (const c of columnKeys)
        table.values.forEach((value, index) => add(r, c, index, rawValue(record, value.field)));
  }
  if (!columns.size) columns.set(groupKey([]), []);
  const sorted = (groups: Map<string, FormulaValue[]>, axis: "rows" | "columns") => {
    const entries = [...groups];
    const fields = axis === "rows" ? table.rowFields : table.columnFields;
    const levels = fields.map((field, level) => {
      const rule = table.sortFields?.find((rule) => rule.axis === axis && rule.field === field);
      const order = rule?.order ?? table.sort;
      const positions = new Map<string, number>();
      const measures = new Map<string, PivotAccumulator>();
      for (const [, values] of entries) {
        const prefix = groupKey(values.slice(0, level + 1));
        if (!positions.has(prefix)) positions.set(prefix, positions.size);
      }
      if (rule?.measure !== undefined) {
        for (const record of filteredRecords) {
          const prefix = groupKey(fields.slice(0, level + 1).map((index) => record[index] ?? null));
          const acc = measures.get(prefix) ?? createPivotAccumulator();
          addPivotValue(acc, rawValue(record, table.values[rule.measure]!.field));
          measures.set(prefix, acc);
        }
      }
      const group =
        rule?.measure === undefined
          ? table.groups?.find((group) => group.field === field)
          : undefined;
      return {
        rule,
        order,
        positions,
        measures,
        groupLabels: group ? getPivotGroupLabels(group, workbook.dateSystem) : undefined,
      };
    });
    return entries.sort((a, b) => {
      for (let level = 0; level < fields.length; level++) {
        const { rule, order, positions, measures, groupLabels } = levels[level]!;
        const leftKey = groupKey(a[1].slice(0, level + 1));
        const rightKey = groupKey(b[1].slice(0, level + 1));
        if (leftKey === rightKey) continue;
        if (order === "source") return positions.get(leftKey)! - positions.get(rightKey)!;
        const left =
          rule?.measure !== undefined
            ? getPivotAggregateValue(measures.get(leftKey), table.values[rule.measure]!.aggregate)
            : a[1][level];
        const right =
          rule?.measure !== undefined
            ? getPivotAggregateValue(measures.get(rightKey), table.values[rule.measure]!.aggregate)
            : b[1][level];
        const comparison = groupLabels
          ? groupLabels.indexOf(String(left)) - groupLabels.indexOf(String(right))
          : typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left ?? "").localeCompare(String(right ?? ""), "en");
        if (comparison) return order === "descending" ? -comparison : comparison;
        return positions.get(leftKey)! - positions.get(rightKey)!;
      }
      return 0;
    });
  };
  const rowEntries = sorted(rows, "rows");
  const columnEntries = sorted(columns, "columns");
  const rowLabelColumns =
    presentation.layout === "compact" ? 1 : Math.max(1, table.rowFields.length);
  const totalColumnStart =
    table.values.length && table.columnTotals && table.columnFields.length
      ? rowLabelColumns + columnEntries.length * table.values.length
      : null;
  if (totalColumnStart !== null) columnEntries.push(["@total", [table.totalLabel]]);
  const label = (value: FormulaValue) =>
    value === null || value === "" ? table.emptyLabel : isFormulaError(value) ? value.code : value;
  const heading: FormulaValue[] = table.rowFields.length
    ? presentation.layout === "compact"
      ? [headers[table.rowFields[0]!]!]
      : table.rowFields.map((index) => headers[index]!)
    : [table.name];
  for (const [, values] of columnEntries)
    if (table.values.length)
      for (const value of table.values)
        heading.push([...values.map(label), value.caption].join(" / "));
    else if (table.columnFields.length) heading.push(values.map(label).join(" / "));
  if (table.reportLayout && table.filters.length && heading.length < 2) heading.push(null);
  const aggregateValue = (row: string, column: string, index: number): FormulaValue => {
    const acc = aggregates.get(JSON.stringify([row, column, index]));
    const type = table.values[index]!.aggregate;
    if (!acc && table.reportLayout) return null;
    return getPivotAggregateValue(acc, type);
  };
  const seriesLabels = heading.slice(rowLabelColumns).map((value) => String(value ?? ""));
  const matrix: FormulaValue[][] = [];
  const width = heading.length;
  const pad = (row: FormulaValue[]) =>
    [...row, ...Array.from({ length: Math.max(0, width - row.length) }, () => null)].slice(
      0,
      width,
    );
  if (table.reportLayout && width >= 2 && table.filters.length) {
    for (const filter of table.filters) {
      const selected = filter.all
        ? table.reportLayout.allLabel
        : filter.values.length === 1
          ? label(filter.values[0]!)
          : table.reportLayout.multipleLabel;
      matrix.push(pad([headers[filter.field]!, selected]));
    }
    matrix.push(pad([]));
  }
  const headerStart = matrix.length;
  if (table.reportLayout && table.columnFields.length) {
    matrix.push(
      pad([
        table.values.length === 1 ? table.values[0]!.caption : table.name,
        ...Array.from({ length: rowLabelColumns - 1 }, () => null),
        table.consolidation
          ? table.reportLayout.columnLabel
          : table.columnFields.map((field) => headers[field]!).join(" / "),
      ]),
    );
    for (let level = 0; level < table.columnFields.length; level++) {
      const row: FormulaValue[] = Array.from({ length: rowLabelColumns }, () => null);
      if (level === table.columnFields.length - 1 && table.values.length <= 1) {
        for (let field = 0; field < rowLabelColumns; field++) row[field] = heading[field] ?? null;
      }
      for (const [key, values] of columnEntries) {
        const count = Math.max(1, table.values.length);
        for (let measure = 0; measure < count; measure++)
          row.push(
            key === "@total"
              ? level === 0 && measure === 0
                ? table.totalLabel
                : null
              : measure === 0
                ? label(values[level] ?? null)
                : null,
          );
      }
      matrix.push(pad(row));
    }
    if (table.values.length > 1)
      matrix.push(
        pad([
          ...heading.slice(0, rowLabelColumns),
          ...columnEntries.flatMap(() => table.values.map((value) => value.caption)),
        ]),
      );
  } else matrix.push(heading);
  const headerRows = matrix.length;
  const dataRows: number[] = [],
    rowLabels: string[] = [],
    rowIndents: number[] = matrix.map(() => 0),
    subtotalRows: number[] = [];
  const rowFieldIndices: Array<number | null> = matrix.map(() => null);
  const rowMembers: Array<FormulaValue[] | null> = matrix.map(() => null);
  const append = (
    key: string,
    values: FormulaValue[],
    depth: number,
    kind: "leaf" | "group" | "subtotal" | "total",
    previous?: FormulaValue[],
  ) => {
    const cells: FormulaValue[] = Array.from({ length: rowLabelColumns }, () => "");
    if (presentation.layout === "compact")
      cells[0] =
        kind === "total"
          ? table.totalLabel
          : values.length
            ? label(values.at(-1)!)
            : table.totalLabel;
    else
      values.forEach((value, index) => {
        if (
          index < rowLabelColumns &&
          (presentation.repeatLabels ||
            kind !== "leaf" ||
            !previous ||
            groupKey(values.slice(0, index + 1)) !== groupKey(previous.slice(0, index + 1)))
        )
          cells[index] = label(value);
      });
    if (!table.rowFields.length || kind === "total") cells[0] = table.totalLabel;
    if (kind === "subtotal")
      cells[presentation.layout === "compact" ? 0 : depth] =
        `${String(label(values.at(-1)!))} ${table.totalLabel}`;
    for (const [column] of columnEntries)
      if (table.values.length)
        table.values.forEach((_, index) =>
          cells.push(kind === "group" ? null : aggregateValue(key, column, index)),
        );
      else if (table.columnFields.length) cells.push(null);
    const index = matrix.length;
    matrix.push(pad(cells));
    rowMembers.push(kind === "group" ? null : kind === "total" ? [] : values);
    rowFieldIndices.push(
      kind === "total" || !table.rowFields.length
        ? null
        : Math.min(depth, table.rowFields.length - 1),
    );
    rowIndents.push(presentation.layout === "compact" ? Math.min(depth, 15) : 0);
    if (kind === "leaf") {
      dataRows.push(index);
      rowLabels.push(values.length ? values.map(label).join(" / ") : table.totalLabel);
    }
    if (kind === "subtotal") subtotalRows.push(index);
  };
  let previous: FormulaValue[] | undefined;
  const render = (entries: Array<[string, FormulaValue[]]>, depth: number) => {
    if (depth >= table.rowFields.length - 1) {
      for (const [key, values] of entries) {
        append(key, values, Math.max(0, depth), "leaf", previous);
        previous = values;
      }
      return;
    }
    const groups = new Map<string, Array<[string, FormulaValue[]]>>();
    for (const entry of entries) {
      const key = groupKey(entry[1].slice(0, depth + 1));
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }
    for (const [key, group] of groups) {
      const values = group[0]![1].slice(0, depth + 1);
      const subtotal = presentation.subtotals !== "off" && !!table.values.length;
      if (presentation.layout !== "tabular")
        append(
          `@group:${key}`,
          values,
          depth,
          subtotal && presentation.subtotals === "top" ? "subtotal" : "group",
        );
      else if (subtotal && presentation.subtotals === "top")
        append(`@group:${key}`, values, depth, "subtotal");
      render(group, depth + 1);
      if (subtotal && presentation.subtotals === "bottom")
        append(`@group:${key}`, values, depth, "subtotal");
      if (presentation.blankRows) {
        matrix.push(Array.from({ length: heading.length }, () => null));
        rowIndents.push(0);
        rowFieldIndices.push(null);
        rowMembers.push(null);
      }
    }
  };
  render(rowEntries, 0);
  const totalRow =
    table.values.length && table.rowTotals && table.rowFields.length ? matrix.length : null;
  if (totalRow !== null) append("@total", [table.totalLabel], 0, "total");
  if (matrix.length * heading.length > MAX_PIVOT_OUTPUT_CELLS)
    throw new RangeError("Pivot output exceeds 10,000 cells.");
  return {
    matrix,
    dataCache,
    ...(table.groups?.length ? { groups: table.groups } : {}),
    rowMembers,
    columnMembers: columnEntries.map(([key, values]) => (key === "@total" ? [] : values)),
    filteredRecords: filteredRecords.map((record) => originals.get(record)!),
    headerRows,
    headerStart,
    seriesLabels,
    rowLabelColumns,
    totalRow,
    totalColumnStart,
    sourceRows,
    headers,
    dataRows,
    rowLabels,
    rowIndents,
    rowFieldIndices,
    subtotalRows,
  };
}

/** Numeric result cells, including subtotals and grand totals, support Show Details. */
export function isPivotValueCell(table: SheetPivotTable, address: CellAddress): boolean {
  if (
    !validAddress(address) ||
    !table.outputRange ||
    !addressInRange(address, table.outputRange) ||
    !table.values.length
  )
    return false;
  const layout = table.resultLayout;
  if (!layout) return false;
  const row = address.row - table.anchor.row;
  return (
    address.column - table.anchor.column >= layout.labelColumns &&
    (layout.valueRows ?? layout.dataRows).includes(row)
  );
}
/** Uses the last refresh cache so details reconcile with the displayed report. */
export function getPivotDetails(
  workbook: Workbook,
  table: SheetPivotTable,
  address: CellAddress,
): PivotDataCache {
  if (!table.dataCache) throw new RangeError("Refresh this pivot table before showing details.");
  if (
    !validAddress(address) ||
    !table.outputRange ||
    !addressInRange(address, table.outputRange) ||
    !table.values.length
  )
    throw new RangeError("Select a pivot value cell.");
  const result = buildPivotResult(workbook, table, { useCache: true });
  const row = address.row - table.anchor.row;
  const column = address.column - table.anchor.column - result.rowLabelColumns;
  const members = result.rowMembers[row];
  const columnMembers = result.columnMembers[Math.floor(column / table.values.length)];
  if (
    !members ||
    column < 0 ||
    !columnMembers ||
    column >= result.matrix[row]!.length - result.rowLabelColumns
  )
    throw new RangeError("Select a pivot value cell.");
  const matches = (record: FormulaValue[], fields: number[], values: FormulaValue[]) =>
    values.every(
      (value, index) => groupKey([record[fields[index]!] ?? null]) === groupKey([value]),
    );
  const memberRecords = groupPivotRecords(
    result.filteredRecords,
    table.groups,
    workbook.dateSystem,
  );
  return {
    headers: [...result.headers],
    records: result.filteredRecords
      .filter(
        (_, index) =>
          matches(memberRecords[index]!, table.rowFields, members) &&
          matches(memberRecords[index]!, table.columnFields, columnMembers),
      )
      .map((record) => record.map((value) => (isFormulaError(value) ? { ...value } : value))),
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
        if (table.resultLayout) {
          const layout = table.resultLayout;
          const rows = layout.dataRows.flatMap((offset, index) => {
            const address = mapAddress({
              row: table.anchor.row + offset,
              column: table.anchor.column,
            });
            return address
              ? [{ offset: address.row - anchor.row, label: layout.rowLabels[index]! }]
              : [];
          });
          table.resultLayout = {
            ...layout,
            dataRows: rows.map((row) => row.offset),
            rowLabels: rows.map((row) => row.label),
          };
        }
        table.anchor = anchor;
        table.outputRange = table.outputRange ? mapRange(table.outputRange) : null;
      }
      if (table.consolidation) {
        table.consolidation.ranges = table.consolidation.ranges.map((area) => {
          if (area.sheetId !== sheetId || !area.range) return area;
          const range = mapRange(area.range);
          // A deleted header row/label column cannot silently change the meaning of a matrix.
          const header = mapAddress(area.range.start);
          return {
            ...area,
            range:
              range &&
              header &&
              header.row === range.start.row &&
              header.column === range.start.column
                ? range
                : null,
          };
        });
      } else if (table.sourceSheetId === sheetId && table.source) {
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
        const cacheFieldsChanged =
          table.dataCache?.headers.some((_, index) => field(index) !== index) ||
          !next ||
          next.end.column - next.start.column !== previous.end.column - previous.start.column;
        if (cacheFieldsChanged) delete table.dataCache;
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
        ) {
          table.source = null;
          table.groups = table.groups?.filter((group) => field(group.field) >= 0);
        } else {
          table.source = next;
          table.groups = table.groups?.flatMap((group) =>
            field(group.field) < 0 ? [] : [{ ...group, field: field(group.field) }],
          );
          table.sortFields = table.sortFields?.map((rule) => ({
            ...rule,
            field: field(rule.field),
          }));
          table.axisFilters = table.axisFilters?.map((filter) => ({
            ...filter,
            field: field(filter.field),
          }));
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
