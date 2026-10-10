import { computed, getCurrentScope, onScopeDispose, shallowRef, ref, watch } from "vue";
import {
  createSetPivotTableCommand,
  applyWorkbookCommand,
  createPivotDetailsSheetCommand,
  createPivotSheetCommand,
  createRemovePivotTableCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import {
  getPivotTableSource,
  type PivotConsolidation,
  type PivotReportLayout,
  type PivotAggregate,
  addressInRange,
  getPivotTableRange,
  normalizePivotTable,
  type SheetPivotTable,
} from "@sheetcraft/core/pivot-tables";
import { WorkbookDomainError } from "@sheetcraft/core/errors";
import { deserializeSheet, serializeSheet } from "@sheetcraft/core/serialization";
import { canUseSheetPermission } from "@sheetcraft/core";
import { resolveDataRange } from "@sheetcraft/core/data-range";
import { getTableAtAddress } from "@sheetcraft/core/table-styles";
import {
  type Workbook,
  type Sheet,
  type CellRange,
  type CellAddress,
  getNextSheetName,
} from "@sheetcraft/core/workbook";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
import { reconcilePivotAxisFilters } from "./pivot-field-edits";
import { getPivotReportColors } from "./pivot-report-colors";
import { resolvePivotDraftSource } from "./pivot-draft-source";
// WPS places a new-worksheet report at A3; existing-sheet addresses remain explicit.
const newSheetPivotAnchor: CellAddress = { row: 2, column: 0 };
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
type PivotDialogTarget = {
  dialogId: number;
  workbook: Workbook;
  generation: number | undefined;
  sheet: Sheet;
  sheetId: string;
  report?: SheetPivotTable;
  initial: PivotDraft;
  confirm: (draft: PivotDraft) => void;
  close: () => void;
};
export function usePivotActions(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getRange: () => CellRange;
  getGeneration?: () => number;
  getRevision?: () => number;
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
  activateDetails?: (sheetId: string) => void;
  onDetailsError?: (reason: "cache" | "protected" | "invalid") => void;
}) {
  const dialog = shallowRef<PivotDialogTarget>();
  const editing = computed(() => dialog.value?.initial);
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
  let dialogId = 0;
  let confirming = false;
  let confirmingSheetId: string | undefined;
  let disposed = false;
  function hasTargetIdentity(target: PivotDialogTarget, includeReport = true): boolean {
    return (
      target.workbook === options.getWorkbook() &&
      target.generation === options.getGeneration?.() &&
      target.workbook.sheets.get(target.sheetId) === target.sheet &&
      (!includeReport ||
        !target.report ||
        target.sheet.pivotTables?.includes(target.report) === true)
    );
  }
  if (getCurrentScope()) {
    watch([options.getWorkbook, () => options.getGeneration?.()], () => close(), { flush: "sync" });
    watch(
      () => {
        void options.getRevision?.();
        return !dialog.value || hasTargetIdentity(dialog.value);
      },
      (valid) => {
        if (!valid && !confirming) close();
      },
      { flush: "sync" },
    );
    onScopeDispose(() => {
      disposed = true;
      close();
    });
  }
  function selected(id?: string) {
    const sheet = options.getSheet(),
      address = options.getRange().start;
    return sheet.pivotTables?.find((table) =>
      id ? table.id === id : addressInRange(address, getPivotTableRange(table)),
    );
  }
  function open(chart = false, id?: string, mode: PivotDraft["mode"] = "create") {
    if (
      confirming ||
      disposed ||
      options.isBusy() ||
      !options.flush() ||
      options.isBusy() ||
      disposed
    )
      return;
    const workbook = options.getWorkbook(),
      sheet = options.getSheet(),
      existing = mode === "create" ? undefined : selected(id);
    if (mode !== "create" && !existing) return;
    if (existing && !canUseSheetPermission(sheet, "pivotTables")) return;
    const selection = options.getRange();
    const sourceTable =
      mode === "create" &&
      selection.start.row === selection.end.row &&
      selection.start.column === selection.end.column
        ? getTableAtAddress(sheet, selection.start)
        : undefined;
    // Capture the table's header/data range, independent of adjacent cells or blank data rows.
    let sourceRange = sourceTable
      ? {
          start: { ...sourceTable.range.start },
          end: {
            ...sourceTable.range.end,
            row: sourceTable.range.end.row - Number(sourceTable.totalRow),
          },
        }
      : resolveDataRange(sheet, selection);
    // Range sources require physical headers; let the existing invalid-source editor repair this.
    const sourceNeedsHeaders = sourceTable?.headerRow === false;
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
          ...(sourceTable && !sourceNeedsHeaders ? { sourceTableId: sourceTable.id } : {}),
          source: sourceNeedsHeaders ? null : sourceRange,
          anchor: { ...newSheetPivotAnchor },
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
          reportLayout: defaultReportLayout(),
          ...(workbook.defaultPivotTableStyleId
            ? { styleId: workbook.defaultPivotTableStyleId }
            : {}),
        };
    const sourceSheet = workbook.sheets.get(table.sourceSheetId);
    const boundSourceTable =
      table.sourceTableId === undefined
        ? undefined
        : sourceSheet?.tables?.find((item) => item.id === table.sourceTableId);
    let invalidBoundSource = false;
    if (existing && table.sourceTableId !== undefined) {
      try {
        getPivotTableSource(workbook, table);
      } catch {
        invalidBoundSource = true;
      }
    }
    sourceRange = table.source ?? sourceRange;
    const initial: PivotDraft = {
      table,
      source:
        table.sourceTableId !== undefined
          ? (boundSourceTable?.name ?? "")
          : sourceNeedsHeaders
            ? ""
            : formatRangeReference(sourceSheet?.name ?? sheet.name, sourceRange),
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
      destination: existing
        ? formatRangeReference(sheet.name, { start: table.anchor, end: table.anchor })
        : "",
      newSheet: !existing,
      newSheetName: getNextSheetName(workbook),
      overwrite: false,
      chart,
      referenceSheetId: sheet.id,
      existing: !!existing,
      mode,
    };
    const target: PivotDialogTarget = {
      dialogId: ++dialogId,
      workbook,
      generation: options.getGeneration?.(),
      sheet,
      sheetId: sheet.id,
      report: existing,
      initial,
      confirm: (draft) => confirm(draft, target),
      close: () => close(target),
    };
    dialog.value = target;
    error.value = sourceNeedsHeaders || invalidBoundSource;
    errorReason.value = "invalid";
  }
  function confirm(draft: PivotDraft, target = dialog.value) {
    if (!target || dialog.value !== target || confirming || disposed) return;
    if (!hasTargetIdentity(target)) {
      close(target);
      return;
    }
    if (
      draft.table.id !== target.initial.table.id ||
      draft.existing !== !!target.report ||
      draft.mode !== target.initial.mode ||
      draft.referenceSheetId !== target.sheetId
    )
      return;
    if (options.isBusy()) {
      error.value = true;
      errorReason.value = "invalid";
      return;
    }
    if (target.report && !canUseSheetPermission(target.sheet, "pivotTables")) {
      error.value = true;
      errorReason.value = "protected";
      return;
    }
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
      (target.report && (draft.newSheet || destination?.sheetId !== target.sheetId))
    ) {
      error.value = true;
      return;
    }
    confirming = true;
    try {
      let source = resolvePivotDraftSource(target.workbook, draft);
      const initialSource = target.initial.table;
      const normalizedSourceName = (value: string) => value.trim().replace(/^=/, "").toLowerCase();
      if (
        !target.report &&
        draft.sourceKind === "range" &&
        initialSource.sourceTableId !== undefined &&
        normalizedSourceName(draft.source) === normalizedSourceName(target.initial.source) &&
        (source.sourceSheetId !== initialSource.sourceSheetId ||
          source.sourceTableId !== initialSource.sourceTableId)
      )
        throw new RangeError("The captured pivot source table no longer exists.");
      if (source.consolidation && !source.consolidation.pageFields) {
        const upgraded = upgradeLegacyConsolidation({ ...draft.table, ...source });
        source = { ...source, consolidation: upgraded.consolidation };
      }
      const after = getPivotTableSource(
        target.workbook,
        normalizePivotTable({
          ...draft.table,
          ...source,
          dataCache: undefined,
          groups: undefined,
          rowFields: [],
          columnFields: [],
          values: [],
          filters: [],
          axisFilters: undefined,
          sortFields: undefined,
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
          // Bound source mutations preserve the displayed schema until an explicit repair.
          before = draft.table.dataCache?.headers;
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
              : previous.sourceTableId !== undefined
                ? -1
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
        fields.sortFields = previous.sortFields?.flatMap((rule) =>
          remap(rule.field) < 0 ? [] : [{ ...rule, field: remap(rule.field) }],
        );
        fields.groups = previous.groups?.flatMap((group) =>
          remap(group.field) < 0 ? [] : [{ ...group, field: remap(group.field) }],
        );
        fields.axisFilters = previous.axisFilters?.flatMap((filter) =>
          remap(filter.field) < 0 ? [] : [{ ...filter, field: remap(filter.field) }],
        );
        reconcilePivotAxisFilters(
          fields,
          previous.values.flatMap((value, index) => (remap(value.field) < 0 ? [] : [index])),
        );
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
        reportLayout: {
          ...(fields.reportLayout ?? defaultReportLayout()),
          ...getPivotReportColors(),
        },
        ...source,
        dataCache: undefined,
        anchor: draft.newSheet ? { ...newSheetPivotAnchor } : destination!.range.start,
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
            ...(draft.existing && draft.mode === "source" && source.sourceTableId !== undefined
              ? { repairSource: true }
              : {}),
          });
      const destinationSheet = destination
        ? target.workbook.sheets.get(destination.sheetId)
        : undefined;
      if (
        (draft.newSheet && target.workbook.structureProtected) ||
        (!draft.newSheet &&
          destinationSheet?.properties.protected &&
          (!target.report || !canUseSheetPermission(destinationSheet, "pivotTables")))
      ) {
        error.value = true;
        errorReason.value = "protected";
        return;
      }
      confirmingSheetId = command.type === "addSheet" ? command.sheet.id : undefined;
      if (!options.execute(command)) {
        if (dialog.value !== target || disposed) return;
        error.value = true;
        if (target.report && !canUseSheetPermission(target.sheet, "pivotTables"))
          errorReason.value = "protected";
        else if (
          target.report &&
          command.type === "setPivotTable" &&
          !draft.chart &&
          hasTargetIdentity(target)
        ) {
          const shadowSheet = deserializeSheet(serializeSheet(target.sheet));
          const shadow: Workbook = {
            ...target.workbook,
            sheets: new Map([...target.workbook.sheets, [shadowSheet.id, shadowSheet]]),
          };
          if (!applyWorkbookCommand(shadow, command)) close(target);
        }
        return;
      }
      if (dialog.value !== target || disposed || !hasTargetIdentity(target, false)) return;
      const sheetId = command.type === "addSheet" ? command.sheet.id : destination!.sheetId;
      const created = target.workbook.sheets
        .get(sheetId)
        ?.pivotTables?.find((item) => item.id === table.id);
      if (created) options.activate?.(sheetId, created);
      close(target);
    } catch (cause) {
      if (dialog.value !== target) return;
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
    } finally {
      confirmingSheetId = undefined;
      confirming = false;
      if (dialog.value === target && !hasTargetIdentity(target)) close(target);
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
    return {
      ...(options.reportLayout?.() ?? {
        rowLabel: "Row",
        columnLabel: "Column",
        allLabel: "(All)",
        multipleLabel: "(Multiple Items)",
      }),
      ...getPivotReportColors(),
    };
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
      if (!table.reportLayout) {
        const headers = getPivotTableSource(options.getWorkbook(), table).headers;
        table = {
          ...table,
          reportLayout: defaultReportLayout(),
          values: table.values.map((value) => {
            const field = headers[value.field]!;
            return value.aggregate === "sum" && value.caption === options.sumCaption(field)
              ? { ...value, caption: options.valueCaption?.("sum", field) ?? value.caption }
              : value;
          }),
        };
      }
      table = { ...table, reportLayout: { ...table.reportLayout!, ...getPivotReportColors() } };
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
  function showDetails(id?: string, address?: CellAddress): boolean {
    if (options.isBusy() || !options.flush()) return false;
    const table = selected(id);
    if (!table) return false;
    const workbook = options.getWorkbook();
    const fail = (reason: "cache" | "protected" | "invalid") => {
      if (options.onDetailsError) options.onDetailsError(reason);
      else options.onError();
      return false;
    };
    if (workbook.structureProtected || !canUseSheetPermission(options.getSheet(), "pivotTables"))
      return fail("protected");
    if (!table.dataCache) return fail("cache");
    try {
      const command = createPivotDetailsSheetCommand(
        workbook,
        options.getSheet().id,
        table.id,
        address ?? options.getRange().start,
        { id: idFactory("pivot-details") },
      );
      if (!options.execute(command)) return false;
      options.activateDetails?.(command.activeSheetId);
      return true;
    } catch {
      return fail("invalid");
    }
  }
  function refresh() {
    const table = selected();
    if (table) update(table);
  }
  function clear() {
    const table = selected();
    if (table)
      update({
        ...table,
        rowFields: [],
        columnFields: [],
        values: [],
        filters: [],
        axisFilters: undefined,
        sortFields: undefined,
        groups: undefined,
      });
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
  function closeOnSheetChange() {
    // A new-sheet command activates its own destination before confirm can finish.
    // Other navigation and explicit close/cancel still invalidate the dialog.
    if (confirming && confirmingSheetId === options.getSheet().id) return;
    close();
  }
  function close(target = dialog.value) {
    if (target !== dialog.value) return;
    dialog.value = undefined;
    error.value = false;
    errorReason.value = "invalid";
  }
  return {
    dialog,
    editing,
    error,
    errorReason,
    open,
    confirm,
    refresh,
    showDetails,
    remove,
    selected,
    close,
    closeOnSheetChange,
    update,
    clear,
    source,
    move,
    chart,
  };
}
