import {
  MAX_TABLE_SLICER_COLUMNS,
  TABLE_SLICER_STYLE_IDS,
  hasPivotSlicerSource,
  hasTableSlicerOptions,
  isPivotSlicerSource,
  type PivotSlicerSource,
  type SheetSlicerSource,
  type SlicerDisplayOptions,
  type TableSlicerSortOrder,
  type TableSlicerSource,
  type TableSlicerStyleId,
} from "./sheet-drawings.js";
import type {
  CellValue,
  Sheet,
  SheetEvaluator,
  SheetFilter,
  SheetFilterValue,
  Workbook,
} from "./workbook.js";
import {
  createSetSheetFilterCommand,
  getSheetFilterColumnDistinctValues,
  getSheetFilterColumnValueCounts,
  getSheetFilterValueKey,
  createSheetFilterColumnMatcher,
  getSheetFilterValue,
} from "./commands/filter.js";
import { createSetPivotTableCommand } from "./commands/pivot-tables.js";
import { isFormulaError, type FormulaValue } from "./formula/types.js";
import { filterPivotRecords } from "./pivot-filters.js";
import { getPivotTableSource, type SheetPivotTable } from "./pivot-tables.js";

export {
  MAX_TABLE_SLICER_COLUMNS,
  TABLE_SLICER_STYLE_IDS,
  hasPivotSlicerSource,
  hasTableSlicerOptions,
  isPivotSlicerSource,
  type PivotSlicerSource,
  type SheetSlicerSource,
  type SlicerDisplayOptions,
  type TableSlicerSortOrder,
  type TableSlicerSource,
  type TableSlicerStyleId,
};

export type SlicerMemberItem = {
  value: SheetFilterValue;
  key: string;
  available: boolean;
  selected: boolean;
};

export function getTableSlicerState(
  sheet: Sheet,
  source: TableSlicerSource,
  evaluator: SheetEvaluator,
) {
  const table = sheet.tables?.find((item) => item.id === source.tableId);
  const index = table?.columns.findIndex((field) => field.id === source.columnId) ?? -1;
  if (!table || index < 0 || !table.headerRow || !table.filterButton) return undefined;
  const column = table.range.start.column + index;
  const range = {
    start: table.range.start,
    end: { ...table.range.end, row: table.range.end.row - Number(table.totalRow) },
  };
  const filter: SheetFilter = table.filter ?? { range, columns: [] };
  const criterion = filter.columns.find((field) => field.column === column);
  const values = getSheetFilterColumnDistinctValues(sheet, range, column, evaluator);
  const available = new Set(
    getSheetFilterColumnValueCounts(sheet, range, column, evaluator).map((item) =>
      getSheetFilterValueKey(item.value),
    ),
  );
  const selected = new Set(criterion?.allowedValues.map(getSheetFilterValueKey));
  if (criterion?.condition) {
    selected.clear();
    const matches = createSheetFilterColumnMatcher(
      sheet,
      filter,
      criterion,
      evaluator.getComputedValue,
    );
    for (let row = range.start.row + 1; row <= range.end.row; row++)
      if (matches(row))
        selected.add(
          getSheetFilterValueKey(getSheetFilterValue(evaluator.getComputedValue({ row, column }))),
        );
  }
  const sortOrder: TableSlicerSortOrder = source.sortOrder === "desc" ? "desc" : "asc";
  const orderedValues = sortOrder === "desc" ? [...values].reverse() : values;
  const allMapped: SlicerMemberItem[] = orderedValues.map((value) => {
    const key = getSheetFilterValueKey(value);
    return { value, key, available: available.has(key), selected: !criterion || selected.has(key) };
  });
  const availableItems = allMapped.filter((item) => item.available);
  const unavailableItems = allMapped.filter((item) => !item.available);
  const allItems = [...availableItems, ...unavailableItems];
  const hideNoData = source.hideNoData === true;
  const items = hideNoData
    ? allItems.filter((item) => item.available || (!!criterion && item.selected))
    : allItems;
  const fieldName = table.columns[index]!.name;
  return {
    kind: "table" as const,
    sheetId: sheet.id,
    column,
    fieldName,
    caption: source.caption?.trim() ? source.caption.trim() : fieldName,
    showHeader: source.showHeader !== false,
    columns: source.columns ?? 1,
    styleId: source.styleId ?? ("light-blue" as TableSlicerStyleId),
    sortOrder,
    hideNoData,
    filter,
    filtered: !!criterion,
    allItems,
    items,
  };
}

export type TableSlicerState = NonNullable<ReturnType<typeof getTableSlicerState>>;

export type PivotSlicerMemberItem = SlicerMemberItem & { cellValue: CellValue };

function compareFilterValues(a: SheetFilterValue, b: SheetFilterValue): number {
  const rank = (v: SheetFilterValue) =>
    v.kind === "number"
      ? 0
      : v.kind === "string"
        ? 1
        : v.kind === "boolean"
          ? 2
          : v.kind === "error"
            ? 3
            : 4;
  const diff = rank(a) - rank(b);
  if (diff !== 0) return diff;
  if (a.kind === "number" && b.kind === "number") return a.value - b.value;
  if (a.kind === "string" && b.kind === "string")
    return a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: "base" });
  if (a.kind === "boolean" && b.kind === "boolean") return Number(a.value) - Number(b.value);
  if (a.kind === "error" && b.kind === "error") return a.code.localeCompare(b.code);
  return 0;
}

function toPivotCellValue(raw: FormulaValue | undefined): CellValue | undefined {
  if (raw === undefined || raw === null || raw === "") return null;
  if (isFormulaError(raw)) return undefined;
  return raw;
}

function getPivotFilterSlot(
  table: SheetPivotTable,
  fieldIndex: number,
): "rows" | "columns" | "filters" {
  if (table.rowFields.includes(fieldIndex)) return "rows";
  if (table.columnFields.includes(fieldIndex)) return "columns";
  return "filters";
}

export function getPivotSlicerState(workbook: Workbook, sheet: Sheet, source: PivotSlicerSource) {
  const pivot = sheet.pivotTables?.find((item) => item.id === source.pivotTableId);
  if (!pivot) return undefined;
  let pivotSource: ReturnType<typeof getPivotTableSource>;
  try {
    pivotSource = getPivotTableSource(workbook, pivot);
  } catch {
    return undefined;
  }
  const fieldName = pivotSource.headers[source.fieldIndex];
  if (fieldName === undefined) return undefined;

  const records = [...pivotSource.records()];
  const distinct = new Map<string, { value: SheetFilterValue; cellValue: CellValue }>();
  for (const record of records) {
    const cellValue = toPivotCellValue(record[source.fieldIndex]);
    if (cellValue === undefined) continue;
    const filterValue = getSheetFilterValue(cellValue);
    const key = getSheetFilterValueKey(filterValue);
    if (!distinct.has(key)) distinct.set(key, { value: filterValue, cellValue });
  }

  // Cross-filtering: evaluate availability against all OTHER active pivot filters.
  const otherPageFilters = pivot.filters
    .filter((f) => f.field !== source.fieldIndex && !f.all)
    .map((f) => ({
      field: f.field,
      allowed: new Set(
        f.values.map((v) => getSheetFilterValueKey(getSheetFilterValue(v === "" ? null : v))),
      ),
    }));
  const otherAxisFilters = (pivot.axisFilters ?? []).filter((f) => f.field !== source.fieldIndex);
  let crossRecords = records.filter((record) =>
    otherPageFilters.every(({ field, allowed }) => {
      const cellValue = toPivotCellValue(record[field]);
      if (cellValue === undefined) return false;
      return allowed.has(getSheetFilterValueKey(getSheetFilterValue(cellValue)));
    }),
  );
  if (otherAxisFilters.length) {
    crossRecords = filterPivotRecords({ ...pivot, axisFilters: otherAxisFilters }, crossRecords);
  }
  const availableKeys = new Set<string>();
  for (const record of crossRecords) {
    const cellValue = toPivotCellValue(record[source.fieldIndex]);
    if (cellValue === undefined) continue;
    availableKeys.add(getSheetFilterValueKey(getSheetFilterValue(cellValue)));
  }

  const slot = getPivotFilterSlot(pivot, source.fieldIndex);
  let filtered = false;
  const selectedKeys = new Set<string>();
  if (slot === "rows" || slot === "columns") {
    const axisFilter = pivot.axisFilters?.find(
      (f) => f.axis === slot && f.field === source.fieldIndex,
    );
    if (axisFilter?.values !== undefined) {
      filtered = true;
      for (const v of axisFilter.values)
        selectedKeys.add(getSheetFilterValueKey(getSheetFilterValue(v === "" ? null : v)));
    }
  } else {
    const pageFilter = pivot.filters.find((f) => f.field === source.fieldIndex);
    if (pageFilter && !pageFilter.all) {
      filtered = true;
      for (const v of pageFilter.values)
        selectedKeys.add(getSheetFilterValueKey(getSheetFilterValue(v === "" ? null : v)));
    }
  }

  const sortOrder: TableSlicerSortOrder = source.sortOrder === "desc" ? "desc" : "asc";
  const sortedEntries = [...distinct.entries()].sort(([, a], [, b]) =>
    sortOrder === "desc"
      ? compareFilterValues(b.value, a.value)
      : compareFilterValues(a.value, b.value),
  );
  const allMapped: PivotSlicerMemberItem[] = sortedEntries.map(([key, entry]) => ({
    value: entry.value,
    cellValue: entry.cellValue,
    key,
    available: availableKeys.has(key),
    selected: !filtered || selectedKeys.has(key),
  }));
  const availableItems = allMapped.filter((item) => item.available);
  const unavailableItems = allMapped.filter((item) => !item.available);
  const allItems = [...availableItems, ...unavailableItems];
  const hideNoData = source.hideNoData === true;
  const items = hideNoData
    ? allItems.filter((item) => item.available || (filtered && item.selected))
    : allItems;

  return {
    kind: "pivot" as const,
    sheetId: sheet.id,
    pivot,
    fieldIndex: source.fieldIndex,
    slot,
    fieldName,
    caption: source.caption?.trim() ? source.caption.trim() : fieldName,
    showHeader: source.showHeader !== false,
    columns: source.columns ?? 1,
    styleId: source.styleId ?? ("light-blue" as TableSlicerStyleId),
    sortOrder,
    hideNoData,
    filtered,
    allItems,
    items,
  };
}

export type PivotSlicerState = NonNullable<ReturnType<typeof getPivotSlicerState>>;
export type SheetSlicerState = TableSlicerState | PivotSlicerState;

function buildNextPivotTableForSlicer(
  state: PivotSlicerState,
  allowedValues: CellValue[] | undefined,
): SheetPivotTable {
  const { pivot, fieldIndex, slot } = state;
  if (slot === "rows" || slot === "columns") {
    const others = (pivot.axisFilters ?? []).filter(
      (f) => !(f.axis === slot && f.field === fieldIndex),
    );
    const existing = pivot.axisFilters?.find((f) => f.axis === slot && f.field === fieldIndex);
    const nextAxisFilters = [...others];
    if (allowedValues !== undefined) {
      nextAxisFilters.push({
        axis: slot,
        field: fieldIndex,
        values: allowedValues,
        ...(existing?.labelCondition ? { labelCondition: existing.labelCondition } : {}),
        ...(existing?.valueCondition ? { valueCondition: existing.valueCondition } : {}),
      });
    } else if (existing?.labelCondition || existing?.valueCondition) {
      nextAxisFilters.push({
        axis: slot,
        field: fieldIndex,
        ...(existing.labelCondition ? { labelCondition: existing.labelCondition } : {}),
        ...(existing.valueCondition ? { valueCondition: existing.valueCondition } : {}),
      });
    }
    return {
      ...pivot,
      axisFilters: nextAxisFilters.length ? nextAxisFilters : undefined,
    };
  }
  const existingIndex = pivot.filters.findIndex((f) => f.field === fieldIndex);
  const nextFilters = [...pivot.filters];
  if (allowedValues !== undefined) {
    const nextEntry = { field: fieldIndex, values: allowedValues, all: false };
    if (existingIndex >= 0) nextFilters[existingIndex] = nextEntry;
    else nextFilters.push(nextEntry);
  } else if (existingIndex >= 0) {
    nextFilters[existingIndex] = { field: fieldIndex, values: [], all: true };
  }
  return { ...pivot, filters: nextFilters };
}

export function createPivotSlicerFilterCommand(
  state: PivotSlicerState,
  itemKey?: string,
  multi = false,
) {
  let allowedValues: CellValue[] | undefined;
  if (itemKey !== undefined) {
    const clicked = state.allItems.find((item) => item.key === itemKey);
    if (!clicked) throw new RangeError("Unknown slicer member.");
    const nextSelected =
      multi && state.filtered
        ? state.allItems
            .filter((item) => (item.key === itemKey ? !item.selected : item.selected))
            .map((item) => item.cellValue)
        : [clicked.cellValue];
    if (nextSelected.length && nextSelected.length < state.allItems.length)
      allowedValues = nextSelected;
  }
  return createSetPivotTableCommand(
    state.sheetId,
    buildNextPivotTableForSlicer(state, allowedValues),
    {
      overwrite: true,
    },
  );
}

export function createPivotSlicerRangeFilterCommand(
  state: PivotSlicerState,
  fromKey: string,
  toKey: string,
) {
  const fromIndex = state.items.findIndex((item) => item.key === fromKey);
  const toIndex = state.items.findIndex((item) => item.key === toKey);
  if (fromIndex < 0 || toIndex < 0) throw new RangeError("Unknown slicer member.");
  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  const values = state.items.slice(start, end + 1).map((item) => item.cellValue);
  const allowedValues = values.length && values.length < state.allItems.length ? values : undefined;
  return createSetPivotTableCommand(
    state.sheetId,
    buildNextPivotTableForSlicer(state, allowedValues),
    {
      overwrite: true,
    },
  );
}

export function createTableSlicerFilterCommand(
  state: TableSlicerState,
  itemKey?: string,
  multi = false,
) {
  const columns = state.filter.columns.filter((field) => field.column !== state.column);
  if (itemKey !== undefined) {
    const clicked = state.allItems.find((item) => item.key === itemKey);
    if (!clicked) throw new RangeError("Unknown slicer member.");
    const values: SheetFilterValue[] =
      multi && state.filtered
        ? state.allItems
            .filter((item) => (item.key === itemKey ? !item.selected : item.selected))
            .map((item) => item.value)
        : [clicked.value];
    if (values.length && values.length < state.allItems.length)
      columns.push({ column: state.column, allowedValues: values });
  }
  return createSetSheetFilterCommand(state.sheetId, { ...state.filter, columns });
}

export function createTableSlicerRangeFilterCommand(
  state: TableSlicerState,
  fromKey: string,
  toKey: string,
) {
  const fromIndex = state.items.findIndex((item) => item.key === fromKey);
  const toIndex = state.items.findIndex((item) => item.key === toKey);
  if (fromIndex < 0 || toIndex < 0) throw new RangeError("Unknown slicer member.");
  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  const values = state.items.slice(start, end + 1).map((item) => item.value);
  const columns = state.filter.columns.filter((field) => field.column !== state.column);
  if (values.length && values.length < state.allItems.length)
    columns.push({ column: state.column, allowedValues: values });
  return createSetSheetFilterCommand(state.sheetId, { ...state.filter, columns });
}
