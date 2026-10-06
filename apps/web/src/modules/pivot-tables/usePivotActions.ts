import { shallowRef, ref } from "vue";
import {
  createSetPivotTableCommand,
  createPivotSheetCommand,
  createRemovePivotTableCommand,
  type WorkbookCommand,
} from "@idea10/core/commands";
import {
  getPivotTableSource,
  type PivotConsolidation,
  addressInRange,
  getPivotTableRange,
  normalizePivotTable,
  type SheetPivotTable,
} from "@idea10/core/pivot-tables";
import { WorkbookDomainError } from "@idea10/core/errors";
import { canUseSheetPermission } from "@idea10/core";
import { resolveDataRange } from "@idea10/core/data-range";
import { type Workbook, type Sheet, type CellRange, getNextSheetName } from "@idea10/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
import { resolvePivotDraftSource } from "./pivot-draft-source";
export type PivotDraft = {
  table: SheetPivotTable;
  source: string;
  sourceKind: "range" | "consolidation" | "pivot";
  sources: string[];
  consolidationLabels: PivotConsolidation["labels"];
  sourcePivot?: { sheetId: string; tableId: string };
  destination: string;
  newSheet: boolean;
  newSheetName: string;
  overwrite: boolean;
  chart: boolean;
  referenceSheetId: string;
  existing: boolean;
  mode: "create" | "source" | "move";
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
  consolidationLabels?: () => PivotConsolidation["labels"];
  activate?: (sheetId: string, table: SheetPivotTable) => void;
  onError: () => void;
}) {
  const editing = shallowRef<PivotDraft>();
  const error = ref(false);
  const errorReason = ref<
    | "invalid"
    | "overwrite"
    | "sourceOverlap"
    | "merged"
    | "spill"
    | "tableOverlap"
    | "protected"
    | "destination"
  >("invalid");
  const idFactory = createBrowserIdFactory();
  let target: { workbook: Workbook; sheetId: string; existing: boolean } | undefined;
  function selected(id?: string) {
    const sheet = options.getSheet(),
      address = options.getRange().start;
    return sheet.pivotTables?.find((table) =>
      id ? table.id === id : addressInRange(address, getPivotTableRange(table)),
    );
  }
  function open(chart = false, id?: string, mode: PivotDraft["mode"] = "create") {
    if (options.isBusy() || !options.flush()) return;
    const workbook = options.getWorkbook(),
      sheet = options.getSheet(),
      existing = mode === "create" ? undefined : selected(id);
    if (existing && !canUseSheetPermission(sheet, "pivotTables")) return;
    target = { workbook, sheetId: sheet.id, existing: !!existing };
    let sourceRange = resolveDataRange(sheet, options.getRange()) ?? options.getRange();
    const names = new Set(
      [...workbook.sheets.values()].flatMap((sheet) =>
        (sheet.pivotTables ?? []).map((table) => table.name),
      ),
    );
    let number = 1;
    while (names.has(`${options.name()}${number}`)) number++;

    const table: SheetPivotTable = existing
      ? normalizePivotTable(existing)
      : {
          id: idFactory("pivot"),
          name: `${options.name()}${number}`,
          sourceSheetId: sheet.id,
          source: sourceRange,
          anchor: { row: 0, column: 0 },
          outputRange: null,
          rowFields: [],
          columnFields: [],
          values: [],
          filters: [],
          rowTotals: true,
          columnTotals: true,
          includeHidden: true,
          sort: "ascending",
          presentation: {
            layout: "compact",
            subtotals: "bottom",
            repeatLabels: false,
            blankRows: false,
            rowHeaders: true,
            columnHeaders: true,
            bandedRows: false,
            bandedColumns: false,
          },
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
      sourceKind: table.consolidation ? "consolidation" : "range",
      sources:
        table.consolidation?.ranges.map((area) =>
          area.range
            ? formatRangeReference(
                workbook.sheets.get(area.sheetId)?.name ?? area.sheetId,
                area.range,
              )
            : "",
        ) ?? [],
      consolidationLabels: table.consolidation?.labels ??
        options.consolidationLabels?.() ?? ["Row", "Column", "Value", "Area"],
      destination: formatRangeReference(sheet.name, { start: table.anchor, end: table.anchor }),
      newSheet: !existing,
      newSheetName: getNextSheetName(workbook),
      overwrite: false,
      chart,
      referenceSheetId: sheet.id,
      existing: !!existing,
      mode,
    };
    error.value = false;
    errorReason.value = "invalid";
  }
  function confirm(draft: PivotDraft) {
    if (
      options.isBusy() ||
      !target ||
      target.workbook !== options.getWorkbook() ||
      editing.value?.table.id !== draft.table.id
    )
      return;
    errorReason.value = "invalid";
    const destination = resolveRangeReference(
      target.workbook,
      draft.destination,
      draft.referenceSheetId,
    );
    if (
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
      const source = resolvePivotDraftSource(target.workbook, draft);
      const after = getPivotTableSource(
        target.workbook,
        normalizePivotTable({
          ...draft.table,
          ...source,
          rowFields: [],
          columnFields: [],
          values: [],
          filters: [],
        }),
      ).headers;
      // Source changes retain fields by header identity; missing fields are removed, never rebound by index.
      let fields = draft.table;
      if (!draft.existing && source.consolidation) {
        fields = {
          ...draft.table,
          rowFields: [0],
          columnFields: [1],
          values: [
            {
              field: 2,
              aggregate: "sum",
              caption: options.sumCaption(source.consolidation.labels[2]),
            },
          ],
          filters: [{ field: 3, values: [], all: true }],
        };
      }
      if (draft.existing && draft.mode === "source") {
        let before: string[] | undefined;
        try {
          before = getPivotTableSource(target.workbook, draft.table).headers;
        } catch {
          /* A deleted source can be repaired with a new range. */
        }
        const remap = (index: number) =>
          before ? after.indexOf(before[index] ?? "") : index < after.length ? index : -1;
        fields = {
          ...draft.table,
          rowFields: draft.table.rowFields.map(remap).filter((index) => index >= 0),
          columnFields: draft.table.columnFields.map(remap).filter((index) => index >= 0),
          values: draft.table.values.flatMap((value) =>
            remap(value.field) < 0 ? [] : [{ ...value, field: remap(value.field) }],
          ),
          filters: draft.table.filters.flatMap((filter) =>
            remap(filter.field) < 0 ? [] : [{ ...filter, field: remap(filter.field) }],
          ),
        };
      }
      const table = normalizePivotTable({
        ...fields,
        ...source,
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
        errorReason.value = "protected";
        return;
      }
      options.execute(command);
      const sheetId = command.type === "addSheet" ? command.sheet.id : destination!.sheetId;
      const created = target.workbook.sheets
        .get(sheetId)
        ?.pivotTables?.find((item) => item.id === table.id);
      if (created) options.activate?.(sheetId, created);
      close();
    } catch (cause) {
      error.value = true;
      const field = cause instanceof WorkbookDomainError ? cause.data.details?.field : undefined;
      if (
        field === "overwrite" ||
        field === "sourceOverlap" ||
        field === "merged" ||
        field === "spill" ||
        field === "tableOverlap" ||
        field === "protected" ||
        field === "destination"
      )
        errorReason.value = field;
    }
  }
  function update(table: SheetPivotTable, chart = false): boolean {
    if (options.isBusy() || !options.flush()) return false;
    const sheet = options.getSheet();
    if (
      !sheet.pivotTables?.some((item) => item.id === table.id) ||
      !canUseSheetPermission(sheet, "pivotTables")
    )
      return false;
    try {
      options.execute(
        createSetPivotTableCommand(
          sheet.id,
          table,
          chart ? { chartId: idFactory("pivot-chart") } : {},
        ),
      );
      const current = sheet.pivotTables?.find((item) => item.id === table.id);
      if (current && !addressInRange(options.getRange().start, getPivotTableRange(current)))
        options.activate?.(sheet.id, current);
      return true;
    } catch {
      options.onError();
      return false;
    }
  }
  function refresh() {
    const table = selected();
    if (table) update(table);
  }
  function clear() {
    const table = selected();
    if (table) update({ ...table, rowFields: [], columnFields: [], values: [], filters: [] });
  }
  function remove(clearOutput = false) {
    if (options.isBusy() || !options.flush()) return;
    const table = selected();
    if (table && canUseSheetPermission(options.getSheet(), "pivotTables"))
      options.execute(createRemovePivotTableCommand(options.getSheet().id, table.id, clearOutput));
  }
  function source() {
    const table = selected();
    if (table) open(false, table.id, "source");
  }
  function move() {
    const table = selected();
    if (table) open(false, table.id, "move");
  }
  function chart() {
    const table = selected();
    if (table) update(table, true);
  }
  function close() {
    editing.value = undefined;
    target = undefined;
    error.value = false;
    errorReason.value = "invalid";
  }
  return {
    editing,
    error,
    errorReason,
    open,
    confirm,
    refresh,
    remove,
    selected,
    close,
    update,
    clear,
    source,
    move,
    chart,
  };
}
