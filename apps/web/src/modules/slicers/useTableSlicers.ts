import { computed, provide, shallowRef, watch, type InjectionKey } from "vue";
import {
  createWorkbookEvaluator,
  type CellAddress,
  type Sheet,
  type SheetTable,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { createSetSheetDrawingsCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import type { SheetSlicerDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  getTableSlicerState,
  createTableSlicerFilterCommand,
  type TableSlicerState,
} from "@sheetcraft/core/table-slicers";
import { canUseSheetPermission } from "@sheetcraft/core";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";

export const tableSlicerContext: InjectionKey<{
  state: (owner: Sheet, drawing: SheetSlicerDrawing) => TableSlicerState | undefined;
  editable: (owner: Sheet, drawing: SheetSlicerDrawing) => boolean;
  select: (owner: Sheet, drawing: SheetSlicerDrawing, key?: string, multi?: boolean) => void;
}> = Symbol("tableSlicer");

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
  const id = createBrowserIdFactory();
  const fields = computed(() => {
    void options.revision();
    const view = target.value;
    return view && options.sheet() === view.sheet
      ? view.sheet.tables?.find((table) => table.id === view.tableId)?.columns
      : undefined;
  });
  watch([options.sheet, options.workbook], () => {
    target.value = undefined;
  });
  function open() {
    if (options.busy() || !options.flush()) return;
    const sheet = options.sheet(),
      table = options.table();
    if (table && canUseSheetPermission(sheet, "editObjects"))
      target.value = { sheet, tableId: table.id };
  }
  function insert(selected: readonly string[]) {
    const view = target.value;
    if (
      !view ||
      !fields.value ||
      options.busy() ||
      !canUseSheetPermission(view.sheet, "editObjects")
    )
      return;
    const drawings: SheetSlicerDrawing[] = fields.value
      .filter((field) => selected.includes(field.id))
      .map((field, index) => ({
        id: id("slicer"),
        name: field.name,
        kind: "slicer",
        slicer: { tableId: view.tableId, columnId: field.id },
        anchor: { ...options.address() },
        offsetX: 16 + index * 28,
        offsetY: 16 + index * 28,
        width: 160,
        height: 204,
        text: "",
        shape: "rectangle",
        fill: "#ffffff",
        stroke: "#5b9bd5",
        strokeWidth: 1,
        color: "#202124",
        fontSize: 13,
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
  provide(tableSlicerContext, {
    state,
    editable,
    select(owner, drawing, key, multi) {
      if (owner !== options.sheet() || !editable(owner, drawing) || !options.flush()) return;
      const current = owner.drawings?.find(
        (item) => item.id === drawing.id && item.kind === "slicer",
      );
      if (!current || current.kind !== "slicer") return;
      const currentState = state(owner, current);
      if (currentState) options.execute(createTableSlicerFilterCommand(currentState, key, multi));
    },
  });
  return { target, fields, open, insert };
}
