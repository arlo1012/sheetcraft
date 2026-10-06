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
  type PivotReportLayout,
  type PivotAggregate,
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
  consolidationPageMode: "single" | "custom";
  consolidationPageCount: number;
  consolidationPageItems: string[][];
  consolidationItemPrefix: string;
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
  pageItemPrefix?: () => string;
  valueCaption?: (aggregate: PivotAggregate, field: string) => string;
  reportLayout?: () => PivotReportLayout;
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
      consolidationLabels: table.consolidation?.pageFields
        ? [
            ...table.consolidation.labels,
            ...defaultConsolidationLabels().slice(table.consolidation.labels.length),
          ]
        : defaultConsolidationLabels(),
      consolidationPageMode: table.consolidation?.pageFields?.mode ?? "single",
      consolidationPageCount: table.consolidation?.pageFields?.count ?? 1,
      consolidationPageItems:
        table.consolidation?.ranges.map((area) => [...(area.pageItems ?? [])]) ?? [],
      consolidationItemPrefix: options.pageItemPrefix?.() ?? "Item",
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
      let source = resolvePivotDraftSource(target.workbook, draft);
      if (source.consolidation && !source.consolidation.pageFields) {
        const upgraded = upgradeLegacyConsolidation({ ...draft.table, ...source });
        source = { ...source, consolidation: upgraded.consolidation };
      }
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
      let fields = upgradeLegacyConsolidation(draft.table);
      if (!draft.existing && source.consolidation) {
        const records = getPivotTableSource(target.workbook, {
          ...draft.table,
          ...source,
        }).records();
        let numeric = true,
          hasNumber = false;
        for (const record of records) {
          if (typeof record[2] !== "number") numeric = false;
          else hasNumber = true;
        }
        const aggregate = numeric && hasNumber ? "sum" : "count";
        fields = {
          ...draft.table,
          reportLayout: defaultReportLayout(),
          rowFields: [0],
          columnFields: [1],
          values: [
            {
              field: 2,
              aggregate,
              caption:
                options.valueCaption?.(aggregate, source.consolidation.labels[2]!) ??
                (aggregate === "sum"
                  ? options.sumCaption(source.consolidation.labels[2]!)
                  : `Count of ${source.consolidation.labels[2]}`),
            },
          ],
          filters: source.consolidation.labels
            .slice(3)
            .map((_, index) => ({ field: index + 3, values: [], all: true })),
        };
      }
      if (draft.existing && draft.mode === "source") {
        let before: string[] | undefined;
        try {
          before = getPivotTableSource(target.workbook, draft.table).headers;
        } catch {
          /* A deleted source can be repaired with a new range. */
        }
        const previous = fields;
        const oldConsolidation = previous.consolidation;
        const nextConsolidation = source.consolidation;
        const remap = (index: number) =>
          oldConsolidation && nextConsolidation
            ? index < after.length
              ? index
              : -1
            : before
              ? after.indexOf(before[index] ?? "")
              : index < after.length
                ? index
                : -1;
        fields = {
          ...previous,
          rowFields: previous.rowFields.map(remap).filter((index) => index >= 0),
          columnFields: previous.columnFields.map(remap).filter((index) => index >= 0),
          values: previous.values.flatMap((value) =>
            remap(value.field) < 0 ? [] : [{ ...value, field: remap(value.field) }],
          ),
          filters: previous.filters.flatMap((filter) => {
            const field = remap(filter.field);
            if (field < 0) return [];
            if (!oldConsolidation || !nextConsolidation || field < 3 || filter.all)
              return [{ ...filter, field }];
            const axis = field - 3;
            // Keep the selected source areas when page items are renamed or automatic items renumber.
            const values = filter.values.flatMap((value) => {
              const areas = oldConsolidation.ranges.filter(
                (area) => area.pageItems?.[axis] === value,
              );
              if (!areas.length) return [value];
              return areas.flatMap((area) =>
                nextConsolidation.ranges
                  .filter(
                    (next) =>
                      next.sheetId === area.sheetId &&
                      JSON.stringify(next.range) === JSON.stringify(area.range),
                  )
                  .flatMap((next) =>
                    next.pageItems?.[axis] === undefined ? [] : [next.pageItems[axis]!],
                  ),
              );
            });
            return [{ ...filter, field, values: [...new Set(values)] }];
          }),
        };
        if (oldConsolidation && nextConsolidation)
          for (
            let field = oldConsolidation.labels.length;
            field < nextConsolidation.labels.length;
            field++
          )
            fields.filters.push({ field, values: [], all: true });
      }
      const table = normalizePivotTable({
        ...fields,
        ...(source.consolidation && !fields.reportLayout
          ? { reportLayout: defaultReportLayout() }
          : {}),
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
  function defaultConsolidationLabels(): string[] {
    return (
      options.consolidationLabels?.() ?? [
        "Row",
        "Column",
        "Value",
        "Page1",
        "Page2",
        "Page3",
        "Page4",
      ]
    );
  }
  function upgradeLegacyConsolidation(table: SheetPivotTable): SheetPivotTable {
    if (table.consolidation && !table.consolidation.pageFields) {
      const legacy = table.consolidation;
      const items = legacy.ranges.map(
        (_, index) => `${options.pageItemPrefix?.() ?? "Item"}${index + 1}`,
      );
      const labels = [...legacy.labels.slice(0, 3), options.consolidationLabels?.()[3] ?? "Page1"];
      table = {
        ...table,
        consolidation: {
          ...legacy,
          labels,
          pageFields: { mode: "single", count: 1 },
          ranges: legacy.ranges.map((area, index) => ({ ...area, pageItems: [items[index]!] })),
        },
        filters: table.filters.map((filter) =>
          filter.field === 3
            ? {
                ...filter,
                values: filter.values.map(
                  (value) =>
                    items[legacy.ranges.findIndex((area) => area.label === value)] ?? value,
                ),
              }
            : filter,
        ),
        values: table.values.map((value) =>
          value.field === 2 &&
          value.caption === options.sumCaption(legacy.labels[2]!) &&
          options.valueCaption
            ? { ...value, caption: options.valueCaption(value.aggregate, labels[2]!) }
            : value,
        ),
      };
    }
    return table;
  }
  function defaultReportLayout(): PivotReportLayout {
    return (
      options.reportLayout?.() ?? {
        rowLabel: "Row",
        columnLabel: "Column",
        allLabel: "(All)",
        multipleLabel: "(Multiple Items)",
      }
    );
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
      table = upgradeLegacyConsolidation(table);
      if (table.consolidation && !table.reportLayout)
        table = { ...table, reportLayout: defaultReportLayout() };
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
