import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { applyWorkbookCommand, createSetPivotTableCommand } from "@sheetcraft/core/commands";
import { serializeSheet, serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  insertSheet,
  setActiveSheet,
  setCellContent,
  type Sheet,
} from "@sheetcraft/core/workbook";
import type { SheetPivotTable } from "@sheetcraft/core/pivot-tables";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import ChartEditorDialog from "../../../modules/charts/components/ChartEditorDialog.vue";
import PivotTableDialog from "../../../modules/pivot-tables/components/PivotTableDialog.vue";
import PivotAnalysisToolbar from "../../../modules/pivot-tables/components/PivotAnalysisToolbar.vue";
import WorkbookFileActions from "../../../modules/workbook-persistence/components/WorkbookFileActions.vue";
import WorkbookFileFeedback from "../../../modules/workbook-persistence/components/WorkbookFileFeedback.vue";
import WorkbookFormulaBar from "../../../modules/workbook/components/WorkbookFormulaBar.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import RangeReferencePicker from "../../../shared/range-reference/RangeReferencePicker.vue";
import { createAppI18n } from "../../../shared/i18n";
import { triggerCanvasCell } from "../../app/canvas-interaction";

// Observe the real controller's history without replacing its behavior or any
// ribbon, editor, picker, or workbook command implementation.
const captured = vi.hoisted(() => ({
  controller: undefined as
    | ReturnType<
        typeof import("../../../app/composables/useSpreadsheetWorkspaceController").useSpreadsheetWorkspaceController
      >
    | undefined,
}));
vi.mock("../../../app/composables/useSpreadsheetWorkspaceController", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../app/composables/useSpreadsheetWorkspaceController")
    >();
  return {
    ...actual,
    useSpreadsheetWorkspaceController(
      ...args: Parameters<typeof actual.useSpreadsheetWorkspaceController>
    ) {
      const controller = actual.useSpreadsheetWorkspaceController(...args);
      captured.controller = controller;
      return controller;
    },
  };
});

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  captured.controller = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const selectedCell = { row: 1, column: 1 };
const pivotChartSelector = '[data-insert-tool="pivot-chart"]';

async function fixture(
  options: {
    protected?: boolean;
    editObjects?: boolean;
    pivotTables?: boolean;
    source?: "valid" | "invalid" | "deleted";
  } = {},
) {
  const workbook = createWorkbook({ id: "existing-pivot-book", sheetId: "source" });
  const source = getActiveSheet(workbook);
  source.name = "Source Data";
  [
    ["Region", "Amount"],
    ["East", 10],
    ["East", 20],
    ["West", 40],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(source, { row: r, column }, { kind: "literal", value }),
    ),
  );
  const output = createSheet("Report Output", "output");
  insertSheet(workbook, output);
  const table: SheetPivotTable = {
    id: "sales-pivot",
    name: "Sales report",
    sourceSheetId: source.id,
    source: { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
    anchor: { row: 0, column: 0 },
    outputRange: null,
    rowFields: [0],
    columnFields: [],
    values: [{ field: 1, aggregate: "sum", caption: "Sum Amount" }],
    filters: [],
    rowTotals: true,
    columnTotals: true,
    includeHidden: false,
    sort: "source",
    totalLabel: "Grand Total",
    emptyLabel: "(blank)",
  };
  applyWorkbookCommand(workbook, createSetPivotTableCommand(output.id, table));
  if (options.source === "invalid") source.cells.clear();
  if (options.source === "deleted") workbook.sheets.delete(source.id);
  output.properties.protected = options.protected ?? false;
  output.protection = {
    editableRanges: [],
    ...(options.editObjects !== false ? { editObjects: true as const } : {}),
    ...(options.pivotTables !== false ? { pivotTables: true as const } : {}),
  };
  setActiveSheet(workbook, output.id);
  const snapshot = serializeWorkbook(workbook);
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: vi.fn(async () => ({ revision: 1, savedAt: 1, snapshot })),
        save: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
        replace: async () => ({ revision: 2, savedAt: 2 }),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: { ChartContent: true },
    },
  });
  mounted.push(wrapper);
  await flushPromises();
  const controller = captured.controller!;
  const loaded = controller.session.workbook;
  const result = loaded.sheets.get(output.id)!;
  wrapper.getComponent(SheetGrid).vm.navigateToCell(selectedCell);
  await nextTick();
  await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
  expect(result.pivotTables).toHaveLength(1);
  expect(result.pivotTables![0]!.outputRange).not.toBeNull();
  expect(controller.session.history.undoStack).toHaveLength(0);
  return {
    wrapper,
    controller,
    workbook: loaded,
    output: result,
    source: loaded.sheets.get(source.id),
    report: result.pivotTables![0]!,
    snapshot: serializeWorkbook(loaded),
  };
}

function listener<T extends (...args: never[]) => void>(
  dialog: Pick<VueWrapper, "vm">,
  name: string,
): T {
  const callback = dialog.vm.$.vnode.props?.[name];
  expect(callback).toBeTypeOf("function");
  return callback as T;
}

async function openPivotChart(wrapper: VueWrapper) {
  await wrapper.get(pivotChartSelector).trigger("click");
  await flushPromises();
  await vi.waitFor(() => expect(wrapper.findComponent(ChartEditorDialog).exists()).toBe(true));
  expect(wrapper.findComponent(PivotTableDialog).exists()).toBe(false);
  return wrapper.getComponent(ChartEditorDialog);
}

function withoutDrawings(sheet: Sheet) {
  const snapshot = serializeSheet(sheet);
  return { ...snapshot, drawings: [] };
}

function expectReportSelection(wrapper: VueWrapper) {
  expect(wrapper.getComponent(WorkbookFormulaBar).props("address")).toEqual(selectedCell);
}

describe("existing-pivot Insert PivotChart workspace integration", () => {
  test.each([
    { editObjects: true, pivotTables: false },
    { editObjects: true, pivotTables: true },
    { editObjects: false, pivotTables: true },
  ])(
    "uses editObjects=$editObjects independently of pivotTables=$pivotTables",
    async ({ editObjects, pivotTables }) => {
      const f = await fixture({ protected: true, editObjects, pivotTables });
      expect(f.wrapper.get('[data-insert-tool="table"]').attributes("aria-disabled")).toBe("true");
      expect(f.wrapper.get('[data-insert-tool="pivot-table"]').attributes("aria-disabled")).toBe(
        "true",
      );
      expect(f.wrapper.get(pivotChartSelector).attributes("aria-disabled")).toBe(
        editObjects ? "false" : "true",
      );
      if (editObjects) {
        const dialog = await openPivotChart(f.wrapper);
        expect(dialog.props("sheet").id).toBe(f.output.id);
        expect(dialog.props("drawing").chart).toMatchObject({
          pivotTableId: f.report.id,
          range: f.report.outputRange,
        });
        expect(dialog.getComponent(RangeReferenceInput).props("disabled")).toBe(true);
        dialog.getComponent(Dialog).vm.$emit("confirm");
        await nextTick();
        expect(f.output.drawings).toHaveLength(1);
        expect(f.controller.session.history.undoStack).toHaveLength(1);
      } else {
        await f.wrapper.get(pivotChartSelector).trigger("click");
        expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
        expect(f.output.drawings ?? []).toEqual([]);
        expect(f.controller.session.history.undoStack).toHaveLength(0);
      }
      expect(f.output.pivotTables).toHaveLength(1);
      expectReportSelection(f.wrapper);
    },
  );

  test("cancel and Edit Pivot reveal fields without changing source, output, sheets, or history", async () => {
    const f = await fixture();
    const dialog = await openPivotChart(f.wrapper);
    expect(serializeWorkbook(f.workbook)).toEqual(f.snapshot);
    expectReportSelection(f.wrapper);
    dialog.getComponent(Dialog).vm.$emit("close");
    await nextTick();
    expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
    expect(serializeWorkbook(f.workbook)).toEqual(f.snapshot);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    expectReportSelection(f.wrapper);

    const reopened = await openPivotChart(f.wrapper);
    await reopened.get(".chart-editor > p button").trigger("click");
    await nextTick();
    expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
    expect(f.wrapper.findComponent(PivotTableDialog).exists()).toBe(false);
    expect(f.wrapper.find(".pivot-fields-pane").exists()).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(f.snapshot);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
  });

  test.each(["valid", "invalid", "deleted"] as const)(
    "appends only one linked chart from materialized output with a %s source",
    async (source) => {
      const f = await fixture({ source });
      const sourceBefore = f.source && serializeSheet(f.source);
      const outputBefore = withoutDrawings(f.output);
      const sheetIds = [...f.workbook.sheets.keys()];
      const dialog = await openPivotChart(f.wrapper);
      expect(f.controller.session.history.undoStack).toHaveLength(0);
      dialog.getComponent(Dialog).vm.$emit("confirm");
      dialog.getComponent(Dialog).vm.$emit("confirm");
      await flushPromises();
      expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
      expect(f.output.drawings).toHaveLength(1);
      const drawing = f.output.drawings![0] as SheetChartDrawing;
      expect(drawing.chart.pivotTableId).toBe(f.report.id);
      expect(drawing.chart.range).toEqual(f.report.outputRange);
      expect(drawing.chart.dataCache).toBeUndefined();
      expect([...f.workbook.sheets.keys()]).toEqual(sheetIds);
      expect(withoutDrawings(f.output)).toEqual(outputBefore);
      if (f.source) expect(serializeSheet(f.source)).toEqual(sourceBefore);
      expect(f.controller.session.history.undoStack).toHaveLength(1);
      expectReportSelection(f.wrapper);
      expect(f.controller.undo()).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(f.snapshot);
      expect(f.controller.undo()).toBe(false);
      expect(f.controller.redo()).toBe(true);
      expect(f.output.drawings).toHaveLength(1);
      expect(withoutDrawings(f.output)).toEqual(outputBefore);
    },
  );

  test("rapid reopening remounts the draft and ignores every previous dialog callback", async () => {
    const f = await fixture();
    const old = await openPivotChart(f.wrapper);
    const confirm = listener<(drawing: SheetChartDrawing, source: string) => void>(
      old,
      "onConfirm",
    );
    const close = listener<() => void>(old, "onClose");
    const editPivot = listener<(id: string) => void>(old, "onEditPivot");
    const pick = old.props("selectReference");
    await old.findAllComponents(Input).at(-1)!.get("input").setValue("Discarded title");
    old.getComponent(Dialog).vm.$emit("close");
    f.wrapper.get<HTMLButtonElement>(pivotChartSelector).element.click();
    await nextTick();
    const current = f.wrapper.getComponent(ChartEditorDialog);
    expect(current.vm.$.uid).not.toBe(old.vm.$.uid);
    expect(current.findAllComponents(Input).at(-1)!.props("modelValue")).not.toBe(
      "Discarded title",
    );
    confirm(old.props("drawing"), "'Report Output'!A1:B4");
    close();
    editPivot(f.report.id);
    expect(await pick("A1")).toBeUndefined();
    await nextTick();
    expect(f.wrapper.getComponent(ChartEditorDialog).vm.$.uid).toBe(current.vm.$.uid);
    expect(f.wrapper.findComponent(RangeReferencePicker).exists()).toBe(false);
    expect(serializeWorkbook(f.workbook)).toEqual(f.snapshot);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    current.getComponent(Dialog).vm.$emit("confirm");
    await nextTick();
    expect(f.output.drawings).toHaveLength(1);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
  });

  test("same-ID chart editing remounts and late confirm or close cannot alter the current session", async () => {
    const f = await fixture();
    (await openPivotChart(f.wrapper)).getComponent(Dialog).vm.$emit("confirm");
    await nextTick();
    const drawing = f.output.drawings![0] as SheetChartDrawing;
    const grid = f.wrapper.getComponent(SheetGrid);
    grid.vm.$emit("editDrawing", drawing);
    await nextTick();
    const old = f.wrapper.getComponent(ChartEditorDialog);
    const confirm = listener<(drawing: SheetChartDrawing, source: string) => void>(
      old,
      "onConfirm",
    );
    const close = listener<() => void>(old, "onClose");
    const pick = old.props("selectReference");
    old.getComponent(Dialog).vm.$emit("close");
    grid.vm.$emit("editDrawing", drawing);
    await nextTick();
    const current = f.wrapper.getComponent(ChartEditorDialog);
    expect(current.props("drawing").id).toBe(drawing.id);
    expect(current.vm.$.uid).not.toBe(old.vm.$.uid);
    confirm({ ...drawing, chart: { ...drawing.chart, title: "Stale title" } }, "A1:B4");
    close();
    expect(await pick("A1")).toBeUndefined();
    await nextTick();
    expect(f.wrapper.getComponent(ChartEditorDialog).vm.$.uid).toBe(current.vm.$.uid);
    expect((f.output.drawings![0] as SheetChartDrawing).chart.title).not.toBe("Stale title");
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    const before = serializeSheet(f.output);
    current.getComponent(Dialog).vm.$emit("confirm");
    await nextTick();
    expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
    expect(serializeSheet(f.output)).toEqual(before);
    expect(f.output.drawings![0]).toBe(drawing);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
  });

  test.each(["reload", "generation"] as const)(
    "same-ID workbook %s invalidates old callbacks before a new report chart opens",
    async (change) => {
      const f = await fixture();
      const old = await openPivotChart(f.wrapper);
      const confirm = listener<(drawing: SheetChartDrawing, source: string) => void>(
        old,
        "onConfirm",
      );
      const close = listener<() => void>(old, "onClose");
      const editPivot = listener<(id: string) => void>(old, "onEditPivot");
      const pick = old.props("selectReference");
      if (change === "reload") {
        f.wrapper.getComponent(WorkbookFileActions).vm.$emit("reload");
        await nextTick();
        f.wrapper.getComponent(WorkbookFileFeedback).vm.$emit("confirm");
        await flushPromises();
      } else {
        f.controller.replaceWorkbook(f.workbook);
        await nextTick();
      }
      expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
      const replacement = f.wrapper.getComponent(SheetGrid).props("sheet") as Sheet;
      expect(replacement.id).toBe(f.output.id);
      if (change === "reload") expect(replacement).not.toBe(f.output);
      else expect(replacement).toBe(f.output);
      f.wrapper.getComponent(SheetGrid).vm.navigateToCell(selectedCell);
      await nextTick();
      const current = await openPivotChart(f.wrapper);
      confirm(old.props("drawing"), "A1:B4");
      close();
      editPivot(f.report.id);
      expect(await pick("A1")).toBeUndefined();
      await nextTick();
      expect(f.wrapper.getComponent(ChartEditorDialog).vm.$.uid).toBe(current.vm.$.uid);
      expect(f.output.drawings ?? []).toEqual([]);
      expect(replacement.drawings ?? []).toEqual([]);
      expect(f.controller.session.history.undoStack).toHaveLength(0);
      current.getComponent(Dialog).vm.$emit("confirm");
      await nextTick();
      expect(replacement.drawings).toHaveLength(1);
      if (change === "reload") expect(f.output.drawings ?? []).toEqual([]);
    },
  );

  test("same-ID report replacement closes its old chart and preserves the replacement session", async () => {
    const f = await fixture();
    const old = await openPivotChart(f.wrapper);
    const confirm = listener<(drawing: SheetChartDrawing, source: string) => void>(
      old,
      "onConfirm",
    );
    const close = listener<() => void>(old, "onClose");
    const editPivot = listener<(id: string) => void>(old, "onEditPivot");
    await f.wrapper.get('[data-ribbon-category="pivot-analysis"]').trigger("click");
    f.wrapper.getComponent(PivotAnalysisToolbar).vm.$emit("rename", "Replacement report");
    await nextTick();
    expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
    const replacement = f.output.pivotTables![0]!;
    expect(replacement.id).toBe(f.report.id);
    expect(replacement).not.toBe(f.report);
    expect(replacement.name).toBe("Replacement report");
    await f.wrapper.get('[data-ribbon-category="insert"]').trigger("click");
    const current = await openPivotChart(f.wrapper);
    expect(current.props("drawing").chart.pivotTableId).toBe(replacement.id);
    const snapshot = serializeWorkbook(f.workbook);
    confirm(old.props("drawing"), "A1:B4");
    close();
    editPivot(f.report.id);
    await nextTick();
    expect(f.wrapper.getComponent(ChartEditorDialog).vm.$.uid).toBe(current.vm.$.uid);
    expect(serializeWorkbook(f.workbook)).toEqual(snapshot);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    current.getComponent(Dialog).vm.$emit("confirm");
    await nextTick();
    expect(f.output.drawings).toHaveLength(1);
    expect(f.controller.session.history.undoStack).toHaveLength(2);
  });

  test("deleting the captured report prevents stale confirmation from adding an orphan chart", async () => {
    const f = await fixture();
    const dialog = await openPivotChart(f.wrapper);
    const confirm = listener<(drawing: SheetChartDrawing, source: string) => void>(
      dialog,
      "onConfirm",
    );
    await f.wrapper.get('[data-ribbon-category="pivot-analysis"]').trigger("click");
    f.wrapper.getComponent(PivotAnalysisToolbar).vm.$emit("remove");
    await nextTick();
    expect(f.output.pivotTables ?? []).toEqual([]);
    const historyLength = f.controller.session.history.undoStack.length;
    const deleted = serializeWorkbook(f.workbook);
    confirm(dialog.props("drawing"), "A1:B4");
    await nextTick();
    expect(f.output.drawings ?? []).toEqual([]);
    expect(serializeWorkbook(f.workbook)).toEqual(deleted);
    expect(f.controller.session.history.undoStack).toHaveLength(historyLength);
  });

  test("ordinary chart range picking survives same-sheet selection and cancels on a sheet switch", async () => {
    const f = await fixture();
    await f.wrapper
      .get('.chart-insert-tools [role="button"][aria-label="Column"]')
      .trigger("click");
    await flushPromises();
    const dialog = f.wrapper.getComponent(ChartEditorDialog);
    const input = dialog.getComponent(RangeReferenceInput);
    const original = input.props("modelValue");
    await input.get("[data-select-formula-reference]").trigger("click");
    await flushPromises();
    expect(dialog.props("suspended")).toBe(true);
    expect(dialog.getComponent(Dialog).props("visible")).toBe(false);
    const firstPicker = f.wrapper.getComponent(RangeReferencePicker);
    const oldPickConfirm = listener<() => void>(firstPicker, "onConfirm");
    const oldPickCancel = listener<() => void>(firstPicker, "onCancel");
    firstPicker.vm.$emit("cancel");
    await flushPromises();
    expect(input.props("modelValue")).toBe(original);
    await input.get("[data-select-formula-reference]").trigger("click");
    await flushPromises();
    const secondPicker = f.wrapper.getComponent(RangeReferencePicker);
    expect(secondPicker.vm.$.uid).not.toBe(firstPicker.vm.$.uid);
    oldPickConfirm();
    oldPickCancel();
    await nextTick();
    expect(f.wrapper.getComponent(RangeReferencePicker).vm.$.uid).toBe(secondPicker.vm.$.uid);
    expect(dialog.props("suspended")).toBe(true);
    await triggerCanvasCell(f.wrapper, { row: 1, column: 0 }, "mousedown", {
      button: 0,
      buttons: 1,
    });
    await triggerCanvasCell(f.wrapper, { row: 2, column: 1 }, "mousemove", { buttons: 1 });
    await triggerCanvasCell(f.wrapper, { row: 2, column: 1 }, "mouseup", { button: 0 });
    expect(f.wrapper.getComponent(RangeReferencePicker).props("reference")).toBe(
      "='Report Output'!$A$2:$B$3",
    );
    f.wrapper.getComponent(RangeReferencePicker).vm.$emit("confirm");
    await flushPromises();
    expect(f.wrapper.getComponent(ChartEditorDialog).vm.$.uid).toBe(dialog.vm.$.uid);
    expect(dialog.props("suspended")).toBe(false);
    expect(input.props("modelValue")).not.toBe(original);
    expect(input.props("modelValue")).toBe("='Report Output'!$A$2:$B$3");
    await input.get("[data-select-formula-reference]").trigger("click");
    await flushPromises();
    const pendingPicker = f.wrapper.getComponent(RangeReferencePicker);
    const pickConfirm = listener<() => void>(pendingPicker, "onConfirm");
    const staleConfirm = listener<(drawing: SheetChartDrawing, source: string) => void>(
      dialog,
      "onConfirm",
    );
    await f.wrapper
      .get('[role="tab"][title="Source Data (double-click to rename)"]')
      .trigger("click");
    await flushPromises();
    expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
    expect(f.wrapper.findComponent(RangeReferencePicker).exists()).toBe(false);
    pickConfirm();
    staleConfirm(dialog.props("drawing"), "A1:B4");
    await nextTick();
    expect(f.output.drawings ?? []).toEqual([]);
    expect(f.source!.drawings ?? []).toEqual([]);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
  });
});
