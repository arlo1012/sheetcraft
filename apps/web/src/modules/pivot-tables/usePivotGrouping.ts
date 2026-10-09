import { shallowRef } from "vue";
import {
  createGroupPivotFieldCommand,
  createUngroupPivotFieldCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import {
  getRawPivotTableSource,
  type PivotFieldGroup,
  type SheetPivotTable,
} from "@sheetcraft/core/pivot-tables";
import { getCellStyle, type Workbook, type Sheet } from "@sheetcraft/core/workbook";
import { canUseSheetPermission } from "@sheetcraft/core";
export type PivotGroupingDraft = {
  tableId: string;
  field: number;
  name: string;
  initial: PivotFieldGroup;
  min?: number;
  max?: number;
};
export function usePivotGrouping(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  selected: (id?: string) => SheetPivotTable | undefined;
  getField: () => number | undefined;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  onError: () => void;
}) {
  const draft = shallowRef<PivotGroupingDraft>();
  const allowed = () =>
    !options.isBusy() &&
    canUseSheetPermission(options.getSheet(), "pivotTables") &&
    options.flush();
  function open(id?: string) {
    if (!allowed()) return;
    const table = options.selected(id),
      field = options.getField();
    if (!table || field === undefined) return;
    try {
      const source = getRawPivotTableSource(options.getWorkbook(), table);
      const numbers: number[] = [];
      for (const record of source.records()) {
        if (record.every((value) => value === null || value === "")) continue;
        const value = record[field];
        if (typeof value !== "number") throw new RangeError("Not a numeric field.");
        numbers.push(value);
      }
      if (!numbers.length) throw new RangeError("Empty field.");
      const min = numbers.reduce((a, b) => Math.min(a, b)),
        max = numbers.reduce((a, b) => Math.max(a, b));
      const area = table.consolidation?.ranges[0];
      const range = area?.range ?? table.source;
      const sheet = options.getWorkbook().sheets.get(area?.sheetId ?? table.sourceSheetId);
      const format =
        sheet && range
          ? getCellStyle(sheet, {
              row: range.start.row + (table.consolidation && field === 1 ? 0 : 1),
              column: range.start.column + (table.consolidation ? (field === 0 ? 0 : 1) : field),
            })?.numberFormat
          : undefined;
      const date =
        format?.kind === "date" ||
        format?.kind === "time" ||
        (format?.kind === "custom" && /[ydh]/i.test(format.code));
      const initial =
        table.groups?.find((group) => group.field === field) ??
        (date
          ? {
              field,
              kind: "date" as const,
              start: min,
              end: max,
              interval: 1,
              unit: "months" as const,
            }
          : {
              field,
              kind: "number" as const,
              start: min,
              end: max,
              interval: max > min ? Math.pow(10, Math.floor(Math.log10((max - min) / 10))) : 1,
            });
      draft.value = { tableId: table.id, field, name: source.headers[field]!, initial, min, max };
    } catch {
      options.onError();
    }
  }
  function close() {
    draft.value = undefined;
  }
  function apply(group: PivotFieldGroup): boolean {
    if (!draft.value || !allowed()) return false;
    const table = options.selected(draft.value.tableId);
    if (!table || group.field !== draft.value.field) {
      close();
      return false;
    }
    try {
      if (!options.execute(createGroupPivotFieldCommand(options.getSheet().id, table, group)))
        return false;
      close();
      return true;
    } catch {
      options.onError();
      return false;
    }
  }
  function ungroup(id?: string): boolean {
    if (!allowed()) return false;
    const table = options.selected(id),
      field = options.getField();
    if (!table || field === undefined || !table.groups?.some((group) => group.field === field))
      return false;
    try {
      return options.execute(createUngroupPivotFieldCommand(options.getSheet().id, table, field));
    } catch {
      options.onError();
      return false;
    }
  }
  return { draft, open, close, apply, ungroup };
}
