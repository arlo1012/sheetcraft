import { shallowRef, ref } from "vue";
import {
  createSetPivotTableCommand,
  createPivotSheetCommand,
  createRemovePivotTableCommand,
  type WorkbookCommand,
} from "@idea10/core/commands";
import {
  getPivotSource,
  addressInRange,
  normalizePivotTable,
  type SheetPivotTable,
} from "@idea10/core/pivot-tables";
import { canUseSheetPermission } from "@idea10/core";
import { resolveDataRange } from "@idea10/core/data-range";
import { type Workbook, type Sheet, type CellRange, getNextSheetName } from "@idea10/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
export type PivotDraft = {
  table: SheetPivotTable;
  source: string;
  destination: string;
  newSheet: boolean;
  newSheetName: string;
  overwrite: boolean;
  chart: boolean;
  referenceSheetId: string;
  existing: boolean;
};
export function usePivotActions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getRange: () => CellRange;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  name: () => string;
  total: () => string;
  empty: () => string;
  sumCaption: (field: string) => string;
  onError: () => void;
}) {
  const editing = shallowRef<PivotDraft>();
  const error = ref(false);
  const idFactory = createBrowserIdFactory();
  let target: { workbook: Workbook; sheetId: string; existing: boolean } | undefined;
  function selected(id?: string) {
    const sheet = options.getSheet(),
      address = options.getRange().start;
    return sheet.pivotTables?.find((table) =>
      id
        ? table.id === id
        : table.outputRange
          ? addressInRange(address, table.outputRange)
          : table.anchor.row === address.row && table.anchor.column === address.column,
    );
  }
  function open(chart = false, id?: string) {
    if (options.isBusy() || !options.flush()) return;
    const workbook = options.getWorkbook(),
      sheet = options.getSheet(),
      existing = selected(id);
    if (existing && !canUseSheetPermission(sheet, "pivotTables")) return;
    target = { workbook, sheetId: sheet.id, existing: !!existing };
    let sourceRange = resolveDataRange(sheet, options.getRange()) ?? options.getRange();
    let headers: string[] = [];
    try {
      headers = getPivotSource(workbook, sheet.id, sourceRange).headers;
    } catch {
      /* Editor accepts a corrected range. */
    }
    const field = Math.max(0, headers.length - 1);
    const table: SheetPivotTable = existing
      ? normalizePivotTable(existing)
      : {
          id: idFactory("pivot"),
          name: options.name(),
          sourceSheetId: sheet.id,
          source: sourceRange,
          anchor: { row: 0, column: 0 },
          outputRange: null,
          rowFields: field > 0 ? [0] : [],
          columnFields: [],
          values: [{ field, aggregate: "sum", caption: options.sumCaption(headers[field] ?? "") }],
          filters: [],
          rowTotals: true,
          columnTotals: true,
          includeHidden: true,
          sort: "ascending",
          totalLabel: options.total(),
          emptyLabel: options.empty(),
          ...(workbook.defaultPivotTableStyleId
            ? { styleId: workbook.defaultPivotTableStyleId }
            : {}),
        };
    const sourceSheet = workbook.sheets.get(table.sourceSheetId);
    sourceRange = table.source ?? sourceRange;
    editing.value = {
      table,
      source: formatRangeReference(sourceSheet?.name ?? sheet.name, sourceRange),
      destination: formatRangeReference(sheet.name, { start: table.anchor, end: table.anchor }),
      newSheet: !existing,
      newSheetName: getNextSheetName(workbook),
      overwrite: false,
      chart,
      referenceSheetId: sheet.id,
      existing: !!existing,
    };
    error.value = false;
  }
  function confirm(draft: PivotDraft) {
    if (
      options.isBusy() ||
      !target ||
      target.workbook !== options.getWorkbook() ||
      editing.value?.table.id !== draft.table.id
    )
      return;
    const source = resolveRangeReference(target.workbook, draft.source, draft.referenceSheetId);
    const destination = resolveRangeReference(
      target.workbook,
      draft.destination,
      draft.referenceSheetId,
    );
    if (
      !source ||
      (!draft.newSheet &&
        (!destination ||
          destination.range.start.row !== destination.range.end.row ||
          destination.range.start.column !== destination.range.end.column)) ||
      (target.existing && (draft.newSheet || destination?.sheetId !== target.sheetId))
    ) {
      error.value = true;
      return;
    }
    if (
      target.existing &&
      !target.workbook.sheets
        .get(target.sheetId)
        ?.pivotTables?.some((table) => table.id === draft.table.id)
    ) {
      close();
      return;
    }
    try {
      const table = normalizePivotTable({
        ...draft.table,
        sourceSheetId: source.sheetId,
        source: source.range,
        anchor: draft.newSheet ? { row: 0, column: 0 } : destination!.range.start,
      });
      const chartId = draft.chart ? idFactory("pivot-chart") : undefined;
      const command = draft.newSheet
        ? createPivotSheetCommand(target.workbook, table, {
            id: idFactory("sheet"),
            name: draft.newSheetName || undefined,
            chartId,
          })
        : createSetPivotTableCommand(destination!.sheetId, table, {
            overwrite: draft.overwrite,
            chartId,
          });
      const destinationSheet = destination
        ? target.workbook.sheets.get(destination.sheetId)
        : undefined;
      if (
        (draft.newSheet && target.workbook.structureProtected) ||
        (!draft.newSheet &&
          destinationSheet?.properties.protected &&
          (!target.existing || !canUseSheetPermission(destinationSheet, "pivotTables")))
      ) {
        error.value = true;
        return;
      }
      options.execute(command);
      close();
    } catch {
      error.value = true;
    }
  }
  function refresh() {
    if (options.isBusy() || !options.flush()) return;
    const table = selected();
    if (!table || !canUseSheetPermission(options.getSheet(), "pivotTables")) return;
    try {
      options.execute(createSetPivotTableCommand(options.getSheet().id, table));
    } catch {
      options.onError();
    }
  }
  function remove() {
    if (options.isBusy() || !options.flush()) return;
    const table = selected();
    if (table && canUseSheetPermission(options.getSheet(), "pivotTables"))
      options.execute(createRemovePivotTableCommand(options.getSheet().id, table.id));
  }
  function close() {
    editing.value = undefined;
    target = undefined;
    error.value = false;
  }
  return { editing, error, open, confirm, refresh, remove, selected, close };
}
