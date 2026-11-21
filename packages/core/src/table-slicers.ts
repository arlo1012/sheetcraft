import type { TableSlicerSource } from "./sheet-drawings.js";
import type { Sheet, SheetEvaluator, SheetFilter, SheetFilterValue } from "./workbook.js";
import {
  createSetSheetFilterCommand,
  getSheetFilterColumnDistinctValues,
  getSheetFilterColumnValueCounts,
  getSheetFilterValueKey,
  createSheetFilterColumnMatcher,
  getSheetFilterValue,
} from "./commands/filter.js";

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
  const items = values.map((value) => {
    const key = getSheetFilterValueKey(value);
    return { value, key, available: available.has(key), selected: !criterion || selected.has(key) };
  });
  return {
    sheetId: sheet.id,
    column,
    caption: table.columns[index]!.name,
    filter,
    filtered: !!criterion,
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
    const clicked = state.items.find((item) => item.key === itemKey);
    if (!clicked) throw new RangeError("Unknown slicer member.");
    const values: SheetFilterValue[] =
      multi && state.filtered
        ? state.items
            .filter((item) => (item.key === itemKey ? !item.selected : item.selected))
            .map((item) => item.value)
        : [clicked.value];
    if (values.length && values.length < state.items.length)
      columns.push({ column: state.column, allowedValues: values });
  }
  return createSetSheetFilterCommand(state.sheetId, { ...state.filter, columns });
}
