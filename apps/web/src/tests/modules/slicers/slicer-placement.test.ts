import { describe, expect, test, vi } from "vitest";
import { createApp, defineComponent } from "vue";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createThemedTableStyles } from "@sheetcraft/core/table-styles";
import {
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  setCellContent,
  type SheetTable,
} from "@sheetcraft/core/workbook";
import { useTableSlicers } from "../../../modules/slicers/useTableSlicers";
import { useFormControlActions } from "../../../modules/form-controls/useFormControlActions";
import { useCameraActions } from "../../../modules/camera/useCameraActions";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";

function mountComposable<T>(setup: () => T): { value: T; unmount: () => void } {
  let result!: T;
  const host = document.createElement("div");
  const app = createApp(
    defineComponent({
      setup() {
        result = setup();
        return () => null;
      },
    }),
  );
  app.mount(host);
  return { value: result, unmount: () => app.unmount() };
}

describe("Insert core placement & post-insert selection", () => {
  test("staggers repeated slicer insertions in a 3-column grid without overlap", () => {
    const workbook = createWorkbook({ id: "slicers", sheetId: "sheet-1" });
    const sheet = getActiveSheet(workbook);
    setCellContent(sheet, { row: 0, column: 0 }, { kind: "literal", value: "Region" });
    setCellContent(sheet, { row: 0, column: 1 }, { kind: "literal", value: "Product" });
    setCellContent(sheet, { row: 0, column: 2 }, { kind: "literal", value: "Owner" });
    setCellContent(sheet, { row: 0, column: 3 }, { kind: "literal", value: "Quarter" });
    const table: SheetTable = {
      id: "table-1",
      name: "Table1",
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 3 } },
      style: createThemedTableStyles()[0]!,
      headerRow: true,
      totalRow: false,
      bandedRows: true,
      bandedColumns: false,
      firstColumn: false,
      lastColumn: false,
      filterButton: true,
      filter: null,
      columns: [
        { id: "c1", name: "Region" },
        { id: "c2", name: "Product" },
        { id: "c3", name: "Owner" },
        { id: "c4", name: "Quarter" },
      ],
    };
    sheet.tables = [table];
    const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
    const selectDrawing = vi.fn();

    const mounted = mountComposable(() =>
      useTableSlicers({
        workbook: () => workbook,
        sheet: () => sheet,
        table: () => table,
        address: () => ({ row: 0, column: 0 }),
        revision: () => 1,
        busy: () => false,
        flush: () => true,
        execute: (command) => executeWorkbookCommand(session, command),
        selectDrawing,
      }),
    );

    mounted.value.open();
    mounted.value.insert(["c1", "c2"]);
    mounted.value.open();
    mounted.value.insert(["c3", "c4"]);

    const slicers = (sheet.drawings ?? []).filter((item) => item.kind === "slicer");
    expect(slicers).toHaveLength(4);
    expect(slicers.map((item) => ({ x: item.offsetX, y: item.offsetY }))).toEqual([
      { x: 12, y: 0 },
      { x: 192, y: 0 },
      { x: 372, y: 0 },
      { x: 12, y: 224 },
    ]);
    expect(selectDrawing).toHaveBeenCalledTimes(2);
    mounted.unmount();
  });

  test("staggers repeated form controls at the same cell and selects newly created controls", () => {
    const workbook = createWorkbook({ id: "controls", sheetId: "sheet-1" });
    const sheet = getActiveSheet(workbook);
    const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
    const selectDrawing = vi.fn();
    const actions = useFormControlActions({
      getWorkbook: () => workbook,
      getSheet: () => sheet,
      getAddress: () => ({ row: 1, column: 1 }),
      getEvaluator: () => createWorkbookEvaluator(workbook, sheet.id),
      selectDrawing,
      isBusy: () => false,
      flush: () => true,
      execute: (command) => executeWorkbookCommand(session, command),
      name: (type) => type,
    });

    actions.insert("checkbox");
    actions.confirm(actions.dialog.value!.initial, "", "");
    actions.insert("button");
    actions.confirm(actions.dialog.value!.initial, "", "");

    const controls = (sheet.drawings ?? []).filter((item) => item.kind === "control");
    expect(controls).toHaveLength(2);
    expect(controls[0]).toMatchObject({ anchor: { row: 1, column: 1 }, offsetX: 8, offsetY: 8 });
    expect(controls[1]).toMatchObject({ anchor: { row: 1, column: 1 }, offsetX: 28, offsetY: 28 });
    expect(selectDrawing).toHaveBeenNthCalledWith(1, controls[0]!.id);
    expect(selectDrawing).toHaveBeenNthCalledWith(2, controls[1]!.id);
  });

  test("staggers repeated camera snapshots and invokes onInserted", () => {
    const workbook = createWorkbook({ id: "cameras", sheetId: "sheet-1" });
    const sheet = getActiveSheet(workbook);
    const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
    const onInserted = vi.fn();
    const actions = useCameraActions({
      getWorkbook: () => workbook,
      getSheet: () => sheet,
      getRange: () => ({ start: { row: 0, column: 0 }, end: { row: 2, column: 2 } }),
      isBusy: () => false,
      flush: () => true,
      execute: (command) => executeWorkbookCommand(session, command),
      onInserted,
      name: () => "Camera",
    });

    actions.open();
    actions.confirm(actions.dialog.value!.initial, "A1:C3");
    actions.open();
    actions.confirm(actions.dialog.value!.initial, "A1:C3");

    const cameras = (sheet.drawings ?? []).filter((item) => item.kind === "camera");
    expect(cameras).toHaveLength(2);
    expect(cameras[0]).toMatchObject({ anchor: { row: 0, column: 0 }, offsetX: 16, offsetY: 16 });
    expect(cameras[1]).toMatchObject({ anchor: { row: 0, column: 0 }, offsetX: 40, offsetY: 40 });
    expect(onInserted).toHaveBeenNthCalledWith(1, cameras[0]!.id);
    expect(onInserted).toHaveBeenNthCalledWith(2, cameras[1]!.id);
  });

  test("staggers consecutive icons inserted at the same active cell", () => {
    const workbook = createWorkbook({ id: "icons", sheetId: "sheet-1" });
    const sheet = getActiveSheet(workbook);
    const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
    const onIconInserted = vi.fn();
    const actions = useDrawingActions({
      getWorkbook: () => workbook,
      getSheet: () => sheet,
      getAddress: () => ({ row: 2, column: 2 }),
      isBusy: () => false,
      flush: () => true,
      execute: (command) => executeWorkbookCommand(session, command),
      onIconInserted,
      name: (kind) => kind,
    });

    expect(actions.insertIcon("heart")).toBe(true);
    expect(actions.insertIcon("star")).toBe(true);

    const icons = (sheet.drawings ?? []).filter((item) => item.kind === "icon");
    expect(icons).toHaveLength(2);
    expect(icons[0]).toMatchObject({ anchor: { row: 2, column: 2 }, offsetX: 8, offsetY: 8 });
    expect(icons[1]).toMatchObject({ anchor: { row: 2, column: 2 }, offsetX: 28, offsetY: 28 });
    expect(onIconInserted).toHaveBeenCalledTimes(2);
  });
});
