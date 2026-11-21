import {
  MAX_TABLE_SLICER_COLUMNS,
  TABLE_SLICER_STYLE_IDS,
  hasTableSlicerOptions,
  type TableSlicerSortOrder,
  type TableSlicerSource,
  type TableSlicerStyleId,
} from "./sheet-drawings.js";
import type { Sheet, SheetEvaluator, SheetFilter, SheetFilterValue } from "./workbook.js";
import {
  createSetSheetFilterCommand,
  getSheetFilterColumnDistinctValues,
  getSheetFilterColumnValueCounts,
  getSheetFilterValueKey,
  createSheetFilterColumnMatcher,
  getSheetFilterValue,
} from "./commands/filter.js";

export {
  MAX_TABLE_SLICER_COLUMNS,
  TABLE_SLICER_STYLE_IDS,
  hasTableSlicerOptions,
  type TableSlicerSortOrder,
  type TableSlicerSource,
  type TableSlicerStyleId,
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
  const allMapped = orderedValues.map((value) => {
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
