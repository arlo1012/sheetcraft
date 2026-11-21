import { computed, provide, shallowRef, watch, type InjectionKey } from "vue";
import {
  createWorkbookEvaluator,
  type CellAddress,
  type Sheet,
  type SheetTable,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import type { SheetSlicerDrawing, TableSlicerSource } from "@sheetcraft/core/sheet-drawings";
import {
  getTableSlicerState,
  createTableSlicerFilterCommand,
  createTableSlicerRangeFilterCommand,
  type TableSlicerState,
} from "@sheetcraft/core/table-slicers";
import { canUseSheetPermission } from "@sheetcraft/core";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";

export type TableSlicerOptionsPatch = Partial<
  Pick<
    TableSlicerSource,
    "caption" | "showHeader" | "columns" | "styleId" | "sortOrder" | "hideNoData"
  >
>;

export const tableSlicerContext: InjectionKey<{
  state: (owner: Sheet, drawing: SheetSlicerDrawing) => TableSlicerState | undefined;
  editable: (owner: Sheet, drawing: SheetSlicerDrawing) => boolean;
  select: (owner: Sheet, drawing: SheetSlicerDrawing, key?: string, multi?: boolean) => void;
  selectRange: (owner: Sheet, drawing: SheetSlicerDrawing, fromKey: string, toKey: string) => void;
}> = Symbol("tableSlicer");

function isSliceableTable(table: SheetTable): boolean {
  return table.headerRow && table.filterButton && table.columns.length > 0;
}

export function useTableSlicers(options: {
  workbook: () => Workbook;
  sheet: () => Sheet;
  table: () => SheetTable | undefined | null;
  address: () => CellAddress;
  revision: () => number;
  busy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => unknown;
  selectDrawing: (id: string) => void;
}) {
  const target = shallowRef<{ sheet: Sheet; tableId: string }>();
  const settingsTarget = shallowRef<{ sheet: Sheet; drawingId: string }>();
  const id = createBrowserIdFactory();

  const availableTables = computed(() => {
    void options.revision();
    const sheet = options.sheet();
    return (sheet.tables ?? []).filter(isSliceableTable);
  });

  const dialogTables = computed(() => {
    void options.revision();
    const view = target.value;
    if (!view || options.sheet() !== view.sheet) return undefined;
    const tables = (view.sheet.tables ?? []).filter(isSliceableTable);
    return tables.length ? tables : undefined;
  });

  const fields = computed(() => {
    void options.revision();
    const view = target.value;
    return view && options.sheet() === view.sheet
      ? view.sheet.tables?.find((table) => table.id === view.tableId && isSliceableTable(table))
          ?.columns
      : undefined;
  });

  const settingsDrawing = computed<SheetSlicerDrawing | undefined>(() => {
    void options.revision();
    const view = settingsTarget.value;
    if (!view || options.sheet() !== view.sheet) return undefined;
    const found = view.sheet.drawings?.find(
      (item): item is SheetSlicerDrawing => item.id === view.drawingId && item.kind === "slicer",
    );
    return found;
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
    const active = options.table();
    const chosen =
      active && isSliceableTable(active)
        ? active
        : (sheet.tables ?? []).find((item) => isSliceableTable(item));
    if (chosen) target.value = { sheet, tableId: chosen.id };
  }

  function selectTargetTable(tableId: string) {
    const view = target.value;
    if (!view || options.sheet() !== view.sheet) return;
    if (view.sheet.tables?.some((table) => table.id === tableId && isSliceableTable(table)))
      target.value = { sheet: view.sheet, tableId };
  }

  function insert(selected: readonly string[], tableId?: string) {
    const view = target.value;
    if (!view || options.busy() || !canUseSheetPermission(view.sheet, "editObjects")) return;
    const resolvedTableId = tableId ?? view.tableId;
    const table = view.sheet.tables?.find(
      (item) => item.id === resolvedTableId && isSliceableTable(item),
    );
    if (!table) return;
    const drawings: SheetSlicerDrawing[] = table.columns
      .filter((field) => selected.includes(field.id))
      .map((field, index) => ({
        id: id("slicer"),
        name: field.name,
        kind: "slicer",
        slicer: { tableId: table.id, columnId: field.id },
        anchor: { ...options.address() },
        offsetX: 16 + index * 28,
        offsetY: 16 + index * 28,
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
      }));
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

  function state(owner: Sheet, drawing: SheetSlicerDrawing) {
    void options.revision();
    const source = sourceSheet(owner, drawing);
    return (
      source &&
      getTableSlicerState(
        source,
        drawing.slicer,
        createWorkbookEvaluator(options.workbook(), source.id),
      )
    );
  }

  function editable(owner: Sheet, drawing: SheetSlicerDrawing) {
    const source = sourceSheet(owner, drawing);
    return !!source && !options.busy() && canUseSheetPermission(source, "autoFilter");
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
    const merged: TableSlicerSource = { ...current.slicer };
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

  function clearFilter(owner: Sheet, drawing: SheetSlicerDrawing) {
    if (owner !== options.sheet() || !editable(owner, drawing) || !options.flush()) return;
    const current = owner.drawings?.find(
      (item): item is SheetSlicerDrawing => item.id === drawing.id && item.kind === "slicer",
    );
    if (!current) return;
    const currentState = state(owner, current);
    if (currentState?.filtered) options.execute(createTableSlicerFilterCommand(currentState));
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
      if (currentState) options.execute(createTableSlicerFilterCommand(currentState, key, multi));
    },
    selectRange(owner, drawing, fromKey, toKey) {
      if (owner !== options.sheet() || !editable(owner, drawing) || !options.flush()) return;
      const current = owner.drawings?.find(
        (item): item is SheetSlicerDrawing => item.id === drawing.id && item.kind === "slicer",
      );
      if (!current) return;
      const currentState = state(owner, current);
      if (currentState)
        options.execute(createTableSlicerRangeFilterCommand(currentState, fromKey, toKey));
    },
  });

  return {
    target,
    availableTables,
    dialogTables,
    fields,
    settingsTarget,
    settingsDrawing,
    settingsState,
    open,
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
