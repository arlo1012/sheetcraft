import { computed, provide, shallowRef, watch, type InjectionKey } from "vue";
import {
  MAX_SHEET_COLUMNS,
  createWorkbookEvaluator,
  type CellAddress,
  type Sheet,
  type SheetTable,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import {
  isPivotSlicerSource,
  type SheetSlicerDrawing,
  type SheetSlicerSource,
  type SlicerDisplayOptions,
} from "@sheetcraft/core/sheet-drawings";
import {
  getPivotSlicerState,
  getTableSlicerState,
  createPivotSlicerFilterCommand,
  createPivotSlicerRangeFilterCommand,
  createTableSlicerFilterCommand,
  createTableSlicerRangeFilterCommand,
  type SheetSlicerState,
} from "@sheetcraft/core/table-slicers";
import {
  getPivotTableRange,
  getPivotTableSource,
  type SheetPivotTable,
} from "@sheetcraft/core/pivot-tables";
import { canUseSheetPermission } from "@sheetcraft/core";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";

export type TableSlicerOptionsPatch = Partial<
  Pick<
    SlicerDisplayOptions,
    "caption" | "showHeader" | "columns" | "styleId" | "sortOrder" | "hideNoData"
  >
>;

export type SlicerTargetOption = {
  key: string;
  kind: "table" | "pivot";
  id: string;
  name: string;
  fields: readonly { id: string; name: string }[];
};

export const tableSlicerContext: InjectionKey<{
  state: (owner: Sheet, drawing: SheetSlicerDrawing) => SheetSlicerState | undefined;
  editable: (owner: Sheet, drawing: SheetSlicerDrawing) => boolean;
  select: (owner: Sheet, drawing: SheetSlicerDrawing, key?: string, multi?: boolean) => void;
  selectRange: (owner: Sheet, drawing: SheetSlicerDrawing, fromKey: string, toKey: string) => void;
}> = Symbol("tableSlicer");

function isSliceableTable(table: SheetTable): boolean {
  return table.headerRow && table.filterButton && table.columns.length > 0;
}

function getSliceablePivotFields(
  workbook: Workbook,
  pivot: SheetPivotTable,
): readonly { id: string; name: string }[] {
  try {
    const source = getPivotTableSource(workbook, pivot);
    return source.headers.map((name, index) => ({ id: String(index), name }));
  } catch {
    return [];
  }
}

function listSheetSlicerTargets(workbook: Workbook, sheet: Sheet): SlicerTargetOption[] {
  const targets: SlicerTargetOption[] = [];
  for (const table of sheet.tables ?? []) {
    if (!isSliceableTable(table)) continue;
    targets.push({
      key: `table:${table.id}`,
      kind: "table",
      id: table.id,
      name: table.name,
      fields: table.columns,
    });
  }
  for (const pivot of sheet.pivotTables ?? []) {
    const fields = getSliceablePivotFields(workbook, pivot);
    if (!fields.length) continue;
    targets.push({
      key: `pivot:${pivot.id}`,
      kind: "pivot",
      id: pivot.id,
      name: pivot.name,
      fields,
    });
  }
  return targets;
}

export function useTableSlicers(options: {
  workbook: () => Workbook;
  sheet: () => Sheet;
  table: () => SheetTable | undefined | null;
  pivot?: () => SheetPivotTable | undefined | null;
  address: () => CellAddress;
  revision: () => number;
  busy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  selectDrawing: (id: string) => void;
}) {
  const target = shallowRef<{ sheet: Sheet; targetKey: string }>();
  const settingsTarget = shallowRef<{ sheet: Sheet; drawingId: string }>();
  const id = createBrowserIdFactory();

  const availableTargets = computed(() => {
    void options.revision();
    return listSheetSlicerTargets(options.workbook(), options.sheet());
  });

  const dialogTables = computed(() => {
    void options.revision();
    const view = target.value;
    if (!view || options.sheet() !== view.sheet) return undefined;
    const targets = listSheetSlicerTargets(options.workbook(), view.sheet);
    return targets.length ? targets.map((item) => ({ id: item.key, name: item.name })) : undefined;
  });

  const fields = computed(() => {
    void options.revision();
    const view = target.value;
    if (!view || options.sheet() !== view.sheet) return undefined;
    return listSheetSlicerTargets(options.workbook(), view.sheet).find(
      (item) => item.key === view.targetKey,
    )?.fields;
  });

  const settingsDrawing = computed<SheetSlicerDrawing | undefined>(() => {
    void options.revision();
    const view = settingsTarget.value;
    if (!view || options.sheet() !== view.sheet) return undefined;
    return view.sheet.drawings?.find(
      (item): item is SheetSlicerDrawing => item.id === view.drawingId && item.kind === "slicer",
    );
  });

  const settingsState = computed(() => {
    const drawing = settingsDrawing.value;
    const view = settingsTarget.value;
    return drawing && view ? state(view.sheet, drawing) : undefined;
  });

  watch([options.sheet, options.workbook], () => {
    target.value = undefined;
    settingsTarget.value = undefined;
  });

  function open() {
    if (options.busy() || !options.flush()) return;
    const sheet = options.sheet();
    if (!canUseSheetPermission(sheet, "editObjects")) return;
    const targets = listSheetSlicerTargets(options.workbook(), sheet);
    if (!targets.length) return;
    const activePivot = options.pivot?.();
    const activeTable = options.table();
    const preferredKey = activePivot
      ? `pivot:${activePivot.id}`
      : activeTable && isSliceableTable(activeTable)
        ? `table:${activeTable.id}`
        : undefined;
    const chosen = targets.find((item) => item.key === preferredKey) ?? targets[0]!;
    target.value = { sheet, targetKey: chosen.key };
  }

  function openForPivot(pivot: SheetPivotTable | undefined | null) {
    if (!pivot || options.busy() || !options.flush()) return;
    const sheet = options.sheet();
    if (!canUseSheetPermission(sheet, "editObjects")) return;
    const key = `pivot:${pivot.id}`;
    if (listSheetSlicerTargets(options.workbook(), sheet).some((item) => item.key === key))
      target.value = { sheet, targetKey: key };
  }

  function selectTargetTable(targetKey: string) {
    const view = target.value;
    if (!view || options.sheet() !== view.sheet) return;
    if (
      listSheetSlicerTargets(options.workbook(), view.sheet).some((item) => item.key === targetKey)
    )
      target.value = { sheet: view.sheet, targetKey };
  }

  function insert(selected: readonly string[], targetKey?: string) {
    const view = target.value;
    if (!view || options.busy() || !canUseSheetPermission(view.sheet, "editObjects")) return;
    const resolvedKey = targetKey ?? view.targetKey;
    const chosen = listSheetSlicerTargets(options.workbook(), view.sheet).find(
      (item) => item.key === resolvedKey,
    );
    if (!chosen) return;
    let baseAnchor: CellAddress = { ...options.address() };
    if (chosen.kind === "table") {
      const sourceTable = view.sheet.tables?.find((item) => item.id === chosen.id);
      if (sourceTable) {
        baseAnchor = {
          row: sourceTable.range.start.row,
          column: Math.min(MAX_SHEET_COLUMNS - 1, sourceTable.range.end.column + 1),
        };
      }
    } else {
      const sourcePivot = view.sheet.pivotTables?.find((item) => item.id === chosen.id);
      if (sourcePivot) {
        const pivotRange = getPivotTableRange(sourcePivot);
        baseAnchor = {
          row: pivotRange.start.row,
          column: Math.min(MAX_SHEET_COLUMNS - 1, pivotRange.end.column + 1),
        };
      }
    }
    const existingAtAnchor = (view.sheet.drawings ?? []).filter(
      (item) =>
        item.kind === "slicer" &&
        item.anchor.row === baseAnchor.row &&
        item.anchor.column === baseAnchor.column,
    ).length;
    const drawings: SheetSlicerDrawing[] = chosen.fields
      .filter((field) => selected.includes(field.id))
      .map((field, index) => {
        const slot = existingAtAnchor + index;
        return {
          id: id("slicer"),
          name: field.name,
          kind: "slicer",
          slicer:
            chosen.kind === "pivot"
              ? { pivotTableId: chosen.id, fieldIndex: Number(field.id) }
              : { tableId: chosen.id, columnId: field.id },
          anchor: { ...baseAnchor },
          offsetX: 12 + (slot % 3) * 180,
          offsetY: Math.floor(slot / 3) * 224,
          width: 168,
          height: 210,
          text: "",
          shape: "rectangle",
          fill: "#ffffff",
          stroke: "#5b9bd5",
          strokeWidth: 1,
          color: "#202124",
          fontSize: 12,
          bold: false,
          italic: false,
          rotation: 0,
        };
      });
    if (!drawings.length) return;
    options.execute(
      createSetSheetDrawingsCommand(view.sheet.id, [...(view.sheet.drawings ?? []), ...drawings]),
    );
    options.selectDrawing(drawings[0]!.id);
    target.value = undefined;
  }

  function sourceSheet(owner: Sheet, drawing: SheetSlicerDrawing) {
    return options.workbook().sheets.get(drawing.slicer.sourceSheetId ?? owner.id);
  }

  function state(owner: Sheet, drawing: SheetSlicerDrawing): SheetSlicerState | undefined {
    void options.revision();
    const source = sourceSheet(owner, drawing);
    if (!source) return undefined;
    if (isPivotSlicerSource(drawing.slicer))
      return getPivotSlicerState(options.workbook(), source, drawing.slicer);
    return getTableSlicerState(
      source,
      drawing.slicer,
      createWorkbookEvaluator(options.workbook(), source.id),
    );
  }

  function editable(owner: Sheet, drawing: SheetSlicerDrawing) {
    const source = sourceSheet(owner, drawing);
    if (!source || options.busy()) return false;
    return isPivotSlicerSource(drawing.slicer)
      ? canUseSheetPermission(source, "pivotTables")
      : canUseSheetPermission(source, "autoFilter");
  }

  function canEditSlicerObject(owner: Sheet) {
    return (
      owner === options.sheet() && !options.busy() && canUseSheetPermission(owner, "editObjects")
    );
  }

  function updateOptions(owner: Sheet, drawingId: string, patch: TableSlicerOptionsPatch): boolean {
    if (!canEditSlicerObject(owner) || !options.flush()) return false;
    const drawings = owner.drawings ?? [];
    const index = drawings.findIndex(
      (item): item is SheetSlicerDrawing => item.id === drawingId && item.kind === "slicer",
    );
    if (index < 0) return false;
    const current = drawings[index] as SheetSlicerDrawing;
    const merged: SheetSlicerSource = { ...current.slicer };
    if ("caption" in patch) {
      const trimmed = patch.caption?.trim();
      if (trimmed) merged.caption = trimmed;
      else delete merged.caption;
    }
    if ("showHeader" in patch) {
      if (patch.showHeader === false) merged.showHeader = false;
      else delete merged.showHeader;
    }
    if ("columns" in patch) {
      if (patch.columns !== undefined && patch.columns > 1) merged.columns = patch.columns;
      else delete merged.columns;
    }
    if ("styleId" in patch) {
      if (patch.styleId && patch.styleId !== "light-blue") merged.styleId = patch.styleId;
      else delete merged.styleId;
    }
    if ("sortOrder" in patch) {
      if (patch.sortOrder === "desc") merged.sortOrder = "desc";
      else delete merged.sortOrder;
    }
    if ("hideNoData" in patch) {
      if (patch.hideNoData === true) merged.hideNoData = true;
      else delete merged.hideNoData;
    }
    if (JSON.stringify(merged) === JSON.stringify(current.slicer)) return true;
    const next = drawings.map((item, idx) =>
      idx === index ? { ...current, slicer: merged } : item,
    );
    options.execute(createSetSheetDrawingsCommand(owner.id, next));
    return true;
  }

  function applyFilterCommand(currentState: SheetSlicerState, key?: string, multi?: boolean) {
    options.execute(
      currentState.kind === "pivot"
        ? createPivotSlicerFilterCommand(currentState, key, multi)
        : createTableSlicerFilterCommand(currentState, key, multi),
    );
  }

  function clearFilter(owner: Sheet, drawing: SheetSlicerDrawing) {
    if (owner !== options.sheet() || !editable(owner, drawing) || !options.flush()) return;
    const current = owner.drawings?.find(
      (item): item is SheetSlicerDrawing => item.id === drawing.id && item.kind === "slicer",
    );
    if (!current) return;
    const currentState = state(owner, current);
    if (currentState?.filtered) applyFilterCommand(currentState);
  }

  function openSettings(drawing: SheetSlicerDrawing) {
    const sheet = options.sheet();
    if (!canEditSlicerObject(sheet) || !options.flush()) return;
    if (!sheet.drawings?.some((item) => item.id === drawing.id && item.kind === "slicer")) return;
    settingsTarget.value = { sheet, drawingId: drawing.id };
  }

  function closeSettings() {
    settingsTarget.value = undefined;
  }

  function applySettings(patch: TableSlicerOptionsPatch) {
    const view = settingsTarget.value;
    if (!view || view.sheet !== options.sheet()) {
      settingsTarget.value = undefined;
      return;
    }
    if (updateOptions(view.sheet, view.drawingId, patch)) settingsTarget.value = undefined;
  }

  provide(tableSlicerContext, {
    state,
    editable,
    select(owner, drawing, key, multi) {
      if (owner !== options.sheet() || !editable(owner, drawing) || !options.flush()) return;
      const current = owner.drawings?.find(
        (item): item is SheetSlicerDrawing => item.id === drawing.id && item.kind === "slicer",
      );
      if (!current) return;
      const currentState = state(owner, current);
      if (currentState) applyFilterCommand(currentState, key, multi);
    },
    selectRange(owner, drawing, fromKey, toKey) {
      if (owner !== options.sheet() || !editable(owner, drawing) || !options.flush()) return;
      const current = owner.drawings?.find(
        (item): item is SheetSlicerDrawing => item.id === drawing.id && item.kind === "slicer",
      );
      if (!current) return;
      const currentState = state(owner, current);
      if (currentState)
        options.execute(
          currentState.kind === "pivot"
            ? createPivotSlicerRangeFilterCommand(currentState, fromKey, toKey)
            : createTableSlicerRangeFilterCommand(currentState, fromKey, toKey),
        );
    },
  });

  return {
    target,
    availableTargets,
    dialogTables,
    fields,
    settingsTarget,
    settingsDrawing,
    settingsState,
    open,
    openForPivot,
    selectTargetTable,
    insert,
    state,
    editable,
    updateOptions,
    clearFilter,
    openSettings,
    closeSettings,
    applySettings,
  };
}
