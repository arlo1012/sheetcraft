import { DOMWrapper, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Select } from "tdesign-vue-next/es/select";
import { createChartSourceFromRange } from "@sheetcraft/core/chart-source";
import {
  resolveChartComboSeriesSettings,
  type ChartComboSeriesChange,
} from "@sheetcraft/core/chart-combo";
import {
  createSetCellContentCommand,
  createSetSheetDrawingsCommand,
  createSetSheetProtectionCommand,
} from "@sheetcraft/core/commands";
import { getSheetChartData, type SheetChart } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  insertSheet,
  setCellContent,
  type Sheet,
  type SheetEvaluator,
} from "@sheetcraft/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SpreadsheetRibbon from "../../../app/SpreadsheetRibbon.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
import ChartFormatPane from "../../../modules/charts/components/ChartFormatPane.vue";
import ChartSourceDialog from "../../../modules/charts/components/ChartSourceDialog.vue";
import ChartSeriesDialog from "../../../modules/charts/components/ChartSeriesDialog.vue";
import ChartCategoriesDialog from "../../../modules/charts/components/ChartCategoriesDialog.vue";
import ChartElementsToolbar from "../../../modules/charts/components/ChartElementsToolbar.vue";
import ChartEditorDialog from "../../../modules/charts/components/ChartEditorDialog.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import RangeReferencePicker from "../../../shared/range-reference/RangeReferencePicker.vue";
import { createAppI18n } from "../../../shared/i18n";
import { triggerCanvasCell } from "../../app/canvas-interaction";

// Forward the actual controller: startup, watches, commands, history, Ribbon,
// grid, toolbar, source dialogs and range picker all retain their real wiring.
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
// Renderer behavior is separately exercised with real ECharts SVG SSR. This
// probe captures the exact live source resolver/evaluator delivered by Workspace.
const ChartContentProbe = defineComponent({
  name: "ChartContent",
  props: ["drawing", "sheet", "evaluator", "revision", "resolveSheet", "comboSeriesChanges"],
  setup: () => () => h("div", { "data-chart-content-probe": "" }),
});
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  captured.controller = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function drawing(id = "chart-one", overrides: Partial<SheetChart> = {}): SheetChartDrawing {
  return {
    id,
    kind: "chart",
    name: "Sales",
    anchor: { row: 5, column: 0 },
    offsetX: 8,
    offsetY: 9,
    width: 480,
    height: 300,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#d1d5db",
    strokeWidth: 1,
    color: "#111827",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
    chart: {
      type: "column",
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
      title: "Sales",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: true,
      stacked: false,
      showHidden: false,
      elements: { titlePosition: "overlay", legendPosition: "right", labelPosition: "outsideEnd" },
      ...overrides,
      ...(overrides.source ? { range: null } : {}),
    },
  };
}
function workbookFixture(overrides: Partial<SheetChart> = {}) {
  const workbook = createWorkbook({
    id: "chart-source-book",
    sheetId: "source",
    sheetName: "Source Data",
  });
  const sheet = getActiveSheet(workbook);
  [
    ["region", "apple", "pear"],
    ["east", 60, 70],
    ["north", 100, 80],
    ["south", 120, 90],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(sheet, { row: r, column }, { kind: "literal", value }),
    ),
  );
  sheet.drawings = [drawing("chart-one", overrides), drawing("chart-two")];
  const other = createSheet("Other Sheet", "other");
  [
    ["category", "external", "extra"],
    ["red", 15, 1],
    ["green", 25, 2],
    ["blue", 35, 3],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(other, { row: r, column }, { kind: "literal", value }),
    ),
  );
  other.drawings = [drawing()];
  insertSheet(workbook, other);
  return workbook;
}
function savedWorkbook(workbook: ReturnType<typeof createWorkbook>) {
  return { revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) };
}
function mountWorkspace(load: () => Promise<ReturnType<typeof savedWorkbook> | undefined>) {
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load,
        save: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
        replace: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
      },
      imageAssetStore: createMemoryImageAssetStore(),
    },
    global: { plugins: [createAppI18n("en-US")], stubs: { ChartContent: ChartContentProbe } },
  });
  mounted.push(wrapper);
  return wrapper;
}
async function fixture(overrides: Partial<SheetChart> = {}) {
  const wrapper = mountWorkspace(async () => savedWorkbook(workbookFixture(overrides)));
  await flushPromises();
  const controller = captured.controller!,
    workbook = controller.session.workbook;
  const sheet = workbook.sheets.get("source")!,
    other = workbook.sheets.get("other")!;
  expect(controller.session.history.undoStack).toHaveLength(0);
  return { wrapper, controller, workbook, sheet, other };
}
function chart(sheet: Sheet, id = "chart-one") {
  const result = sheet.drawings?.find((item) => item.id === id);
  if (!result || result.kind !== "chart") throw new Error(`Missing chart ${id}`);
  return result;
}
async function selectChart(wrapper: VueWrapper) {
  wrapper.getComponent(SheetGrid).vm.selectDrawing("chart-one");
  await nextTick();
  expect(wrapper.getComponent(SpreadsheetRibbon).props("hasChart")).toBe(true);
  expect(wrapper.get('[data-ribbon-category="chart"]').attributes("aria-selected")).toBe("true");
}
async function openSource(wrapper: VueWrapper) {
  await selectChart(wrapper);
  const trigger = wrapper.getComponent(ChartElementsToolbar).get('[aria-label="Select data"]');
  await trigger.trigger("pointerdown");
  await trigger.trigger("click");
  await flushPromises();
  expect(wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
  return wrapper.getComponent(ChartSourceDialog);
}
async function footer(
  root: "source" | "series" | "categories" | "picker" | "editor",
  label: "OK" | "Cancel",
) {
  const selector =
    root === "picker"
      ? ".range-reference-picker"
      : root === "editor"
        ? ".chart-selector"
        : `[data-chart-${root}-dialog]`;
  const dialog = document.querySelector(selector)?.closest(".t-dialog");
  expect(dialog, `Missing ${root} native dialog`).toBeDefined();
  const button = new DOMWrapper(dialog!)
    .findAll(".t-dialog__footer button")
    .find((item) => item.text() === label);
  expect(button, `Missing ${root} ${label} footer`).toBeDefined();
  await button!.trigger("click");
  await flushPromises();
}
type SourceDialogAccess = Pick<Awaited<ReturnType<typeof openSource>>, "getComponent">;
function sourceProbe(source: SourceDialogAccess) {
  return source.getComponent(ChartContentProbe);
}
function sourceDraft(source: SourceDialogAccess) {
  return sourceProbe(source).props("drawing") as SheetChartDrawing;
}
function renderData(probe: Pick<ReturnType<typeof ownerProbe>, "props">) {
  const props = probe.props();
  return getSheetChartData(
    props.sheet as Sheet,
    (props.drawing as SheetChartDrawing).chart,
    props.evaluator as SheetEvaluator,
    props.resolveSheet as (id: string) => Sheet | undefined,
  );
}
function ownerProbe(wrapper: VueWrapper) {
  const probe = wrapper
    .findAllComponents(ChartContentProbe)
    .find(
      (item) =>
        (item.props("drawing") as SheetChartDrawing).id === "chart-one" &&
        (item.props("drawing") as SheetChartDrawing).width === 480,
    )!;
  expect(probe).toBeDefined();
  return probe;
}
async function tab(wrapper: VueWrapper, name: string) {
  const target = wrapper.findAll(".workbook-sheet-tabs__tab").find((item) => item.text() === name)!;
  expect(target.attributes("disabled")).toBeUndefined();
  await target.trigger("pointerdown");
  await target.trigger("click");
  await flushPromises();
}
async function pickCells(wrapper: VueWrapper, start: { row: number; column: number }, end = start) {
  await triggerCanvasCell(wrapper, start, "mousedown", { button: 0, buttons: 1 });
  if (start.row !== end.row || start.column !== end.column)
    await triggerCanvasCell(wrapper, end, "mousemove", { buttons: 1 });
  await triggerCanvasCell(wrapper, end, "mouseup", { button: 0 });
  await flushPromises();
}

describe("Select Data through real Workspace", () => {
  test("delayed startup then native toolbar opens the dedicated source dialog and nested Cancel preserves every chart field", async () => {
    let finish!: (value: ReturnType<typeof savedWorkbook>) => void;
    const wrapper = mountWorkspace(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await flushPromises();
    expect(wrapper.findComponent(ChartElementsToolbar).exists()).toBe(false);
    finish(savedWorkbook(workbookFixture()));
    await flushPromises();
    const controller = captured.controller!,
      before = serializeWorkbook(controller.session.workbook);
    const source = await openSource(wrapper);
    expect(source.get("[data-chart-source-range] input").element).toBeInstanceOf(HTMLInputElement);
    expect(source.find('[aria-label="Title text"]').exists()).toBe(false);
    expect(source.findAll("[data-source-series]")).toHaveLength(2);
    await source.get("[data-source-add]").trigger("click");
    const adding = source.getComponent(ChartSeriesDialog);
    await adding.get("[data-series-name] input").setValue("Discarded literal");
    await adding.get("[data-series-values] input").setValue("={10,20,30}");
    expect(adding.get("[data-series-values-preview]").text()).toBe("10, 20, 30");
    await footer("series", "Cancel");
    expect(source.findAll("[data-source-series]")).toHaveLength(2);
    await source.get("[data-source-edit]").trigger("click");
    const editing = source.getComponent(ChartSeriesDialog);
    await editing.get("[data-series-name] input").setValue("Discarded edit");
    await editing.get("[data-series-values] input").setValue("={9,8,7}");
    await footer("series", "Cancel");
    expect(sourceDraft(source).chart.source).toBeUndefined();
    await source.get("[data-source-categories]").trigger("click");
    await source
      .getComponent(ChartCategoriesDialog)
      .get("input")
      .setValue("='Other Sheet'!$A$2:$A$4");
    await footer("categories", "Cancel");
    await source.get("[data-source-down]").trigger("click");
    expect(sourceDraft(source).chart.source?.series.map((entry) => entry.id)).toEqual([
      "series-2",
      "series-1",
    ]);
    await footer("source", "Cancel");
    expect(wrapper.findComponent(ChartSourceDialog).exists()).toBe(false);
    expect(serializeWorkbook(controller.session.workbook)).toEqual(before);
    expect(controller.session.history.undoStack).toHaveLength(0);
  });

  test("cross-sheet name/value/category edits, literal Add and reorder commit together with stable colors and one UndoRedo", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.workbook),
      original = chart(f.sheet),
      other = chart(f.sheet, "chart-two");
    const source = await openSource(f.wrapper);
    await source.get("[data-source-edit]").trigger("click");
    const editing = source.getComponent(ChartSeriesDialog);
    await editing.get("[data-series-name] input").setValue("='Other Sheet'!$B$1");
    await editing.get("[data-series-values] input").setValue("='Other Sheet'!$B$2:$B$4");
    expect(editing.get("[data-series-name-preview]").text()).toBe("external");
    expect(editing.get("[data-series-values-preview]").text()).toBe("15, 25, 35");
    await footer("series", "OK");
    await source.get("[data-source-categories]").trigger("click");
    const categories = source.getComponent(ChartCategoriesDialog);
    await categories.get("input").setValue("='Other Sheet'!$A$2:$A$4");
    expect(categories.get("[data-categories-preview]").text()).toBe("red, green, blue");
    await footer("categories", "OK");
    await source.get("[data-source-add]").trigger("click");
    const adding = source.getComponent(ChartSeriesDialog);
    await adding.get("[data-series-name] input").setValue("Benchmark");
    await adding.get("[data-series-values] input").setValue("={10,20,30}");
    await footer("series", "OK");
    await source.get("[data-source-up]").trigger("click");
    expect(
      sourceDraft(source).chart.source?.series.map((entry) => [entry.id, entry.colorIndex]),
    ).toEqual([
      ["series-1", 0],
      ["series-3", 2],
      ["series-2", 1],
    ]);
    expect(renderData(sourceProbe(source))).toMatchObject({
      categories: ["red", "green", "blue"],
      series: [
        { id: "series-1", name: "external", values: [15, 25, 35] },
        { id: "series-3", name: "Benchmark", values: [10, 20, 30] },
        { id: "series-2", name: "pear", values: [70, 80, 90] },
      ],
    });
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    await footer("source", "OK");
    expect(f.wrapper.findComponent(ChartSourceDialog).exists()).toBe(false);
    expect({ ...chart(f.sheet), chart: original.chart }).toEqual(original);
    expect(chart(f.sheet).chart).toMatchObject({
      title: original.chart.title,
      type: original.chart.type,
      elements: original.chart.elements,
    });
    expect(chart(f.sheet, "chart-two")).toEqual(other);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    const changed = serializeWorkbook(f.workbook);
    expect(f.controller.undo()).toBe(true);
    await nextTick();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.redo()).toBe(true);
    await nextTick();
    expect(serializeWorkbook(f.workbook)).toEqual(changed);
    expect(renderData(ownerProbe(f.wrapper)).series.map((entry) => entry.id)).toEqual([
      "series-1",
      "series-3",
      "series-2",
    ]);
  });

  test("native range rebuild reads an external sheet and Confirm flushes the complete unblurred source input once", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.workbook);
    const source = await openSource(f.wrapper);
    await source.get("[data-chart-source-range] input").setValue("='Other Sheet'!$A$1:$B$4");
    await footer("source", "OK");
    expect(chart(f.sheet).chart.source?.series).toHaveLength(1);
    expect(renderData(ownerProbe(f.wrapper))).toMatchObject({
      categories: ["red", "green", "blue"],
      series: [{ name: "external", values: [15, 25, 35] }],
    });
    expect(chart(f.sheet).chart.title).toBe("Sales");
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    expect(f.controller.undo()).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("native Change Type popup keeps the custom-source owner selected, then Line OK preserves sources and Undo", async () => {
    const configured = createChartSourceFromRange("other", drawing().chart);
    configured.series.reverse();
    const f = await fixture({ source: configured }),
      before = serializeWorkbook(f.workbook),
      original = chart(f.sheet);
    const order = configured.series.map((entry) => [entry.id, entry.colorIndex]);
    await selectChart(f.wrapper);
    const trigger = f.wrapper
      .getComponent(ChartElementsToolbar)
      .get('[aria-label="Change chart type"]');
    await trigger.trigger("pointerdown");
    await trigger.trigger("click");
    await flushPromises();
    expect(f.wrapper.findComponent(ChartSourceDialog).exists()).toBe(false);
    const editor = f.wrapper.getComponent(ChartEditorDialog);
    const type = editor
      .findAllComponents(Select)
      .find((item) => item.attributes("aria-label") === "Chart type")!;
    expect(type).toBeDefined();
    await type.get(".t-input__inner").trigger("keydown", { key: "ArrowDown", code: "ArrowDown" });
    await expect
      .poll(() =>
        new DOMWrapper(document.body).findAll(".t-select-option").map((item) => item.text()),
      )
      .toContain("Line");
    const option = new DOMWrapper(document.body)
      .findAll(".t-select-option")
      .find((item) => item.text() === "Line")!;
    expect(
      f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId"),
      "before native type option",
    ).toBe("chart-one");
    expect(f.wrapper.getComponent(SpreadsheetRibbon).props("hasChart")).toBe(true);
    await option.trigger("pointerdown");
    expect(
      f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId"),
      "after native type option pointerdown",
    ).toBe("chart-one");
    expect(f.wrapper.getComponent(SpreadsheetRibbon).props("hasChart")).toBe(true);
    await option.trigger("click");
    await flushPromises();
    const preview = editor.getComponent(ChartContentProbe).props("drawing") as SheetChartDrawing;
    expect(preview.chart.type).toBe("line");
    expect(preview.chart.source).toEqual(configured);
    expect(preview.chart.source?.series.map((entry) => [entry.id, entry.colorIndex])).toEqual(
      order,
    );
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    await footer("editor", "OK");
    expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
    expect(chart(f.sheet).chart.type).toBe("line");
    expect(chart(f.sheet).chart.source).toEqual(configured);
    expect(
      chart(f.sheet).chart.source?.series.map((entry) => [entry.id, entry.colorIndex]),
    ).toEqual(order);
    expect({ ...chart(f.sheet), chart: original.chart }).toEqual(original);
    expect(chart(f.sheet).chart).toMatchObject({
      title: original.chart.title,
      elements: original.chart.elements,
    });
    expect(f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId")).toBe("chart-one");
    expect(f.wrapper.getComponent(SpreadsheetRibbon).props("hasChart")).toBe(true);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    expect(f.controller.undo()).toBe(true);
    await nextTick();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(
      chart(f.sheet).chart.source?.series.map((entry) => [entry.id, entry.colorIndex]),
    ).toEqual(order);
    expect(f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId")).toBe("chart-one");
  });

  test("native source range IME blocks real OK until composition ends, then commits once and Undo restores", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.workbook);
    const source = await openSource(f.wrapper);
    const input = source.get<HTMLInputElement>("[data-chart-source-range] input").element;
    const originalDraft = JSON.parse(JSON.stringify(sourceDraft(source).chart)) as SheetChart;
    const complete = "='Source Data'!$A$1:$B$4";
    input.focus();
    input.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: complete }),
    );
    input.value = complete;
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: complete,
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );
    await nextTick();
    await footer("source", "OK");
    expect(f.wrapper.findComponent(ChartSourceDialog).exists()).toBe(true);
    expect(input.value).toBe(complete);
    expect(sourceDraft(source).chart).toEqual(originalDraft);
    expect(source.get('[role="alert"]').text()).toContain("Finish composing the input first");
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    expect(f.controller.session.history.redoStack).toHaveLength(0);
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: complete }));
    await nextTick();
    await footer("source", "OK");
    expect(f.wrapper.findComponent(ChartSourceDialog).exists()).toBe(false);
    expect(chart(f.sheet).chart.range).toEqual({
      start: { row: 0, column: 0 },
      end: { row: 3, column: 1 },
    });
    expect(chart(f.sheet).chart).toMatchObject({
      title: originalDraft.title,
      elements: originalDraft.elements,
    });
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    expect(f.controller.undo()).toBe(true);
    await nextTick();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("Remove through zero keeps a blank chart, source IDs and geometry recover exactly on Undo", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.workbook);
    const source = await openSource(f.wrapper);
    await source.get("[data-source-remove]").trigger("click");
    await source.get("[data-source-remove]").trigger("click");
    expect(source.findAll("[data-source-series]")).toHaveLength(0);
    expect(source.text()).toContain("Confirming keeps a blank chart");
    await footer("source", "OK");
    expect(f.sheet.drawings).toHaveLength(2);
    expect(chart(f.sheet).chart.source?.series).toEqual([]);
    expect(renderData(ownerProbe(f.wrapper)).series).toEqual([]);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    expect(f.controller.undo()).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.redo()).toBe(true);
    expect(chart(f.sheet).chart.source?.series).toEqual([]);
  });

  test("opening and unchanged Confirm keep a real redo branch and do not promote the rectangle", async () => {
    const f = await fixture(),
      original = chart(f.sheet);
    expect(
      f.controller.executeCommand(
        createSetSheetDrawingsCommand(f.sheet.id, [
          { ...original, chart: { ...original.chart, title: "Redo this" } },
          chart(f.sheet, "chart-two"),
        ]),
      ),
    ).toBe(true);
    expect(f.controller.undo()).toBe(true);
    await nextTick();
    const before = serializeWorkbook(f.workbook),
      redo = [...f.controller.session.history.redoStack];
    await openSource(f.wrapper);
    await footer("source", "OK");
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(chart(f.sheet).chart.source).toBeUndefined();
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    expect(f.controller.session.history.redoStack).toEqual(redo);
    expect(f.controller.redo()).toBe(true);
    expect(chart(f.sheet).chart.title).toBe("Redo this");
  });

  test("exact live resolver reaches grid and source preview, refreshing cross-sheet cells without changing configured source", async () => {
    const initialSource = createChartSourceFromRange("other", drawing().chart);
    const f = await fixture({ source: initialSource });
    const probe = ownerProbe(f.wrapper),
      revision = probe.props("revision");
    expect(probe.props("resolveSheet")("other")).toBe(f.other);
    expect(renderData(probe).series[0]?.values).toEqual([15, 25, 35]);
    const source = await openSource(f.wrapper);
    const draftBefore = sourceDraft(source).chart.source;
    expect(
      f.controller.executeCommand(
        createSetCellContentCommand(
          f.other.id,
          { row: 1, column: 1 },
          { kind: "literal", value: 115 },
        ),
      ),
    ).toBe(true);
    await nextTick();
    expect(probe.props("revision")).not.toBe(revision);
    expect(renderData(probe).series[0]?.values).toEqual([115, 25, 35]);
    expect(renderData(sourceProbe(source)).series[0]?.values).toEqual([115, 25, 35]);
    expect(sourceDraft(source).chart.source).toEqual(draftBefore);
    expect(chart(f.sheet).chart.source).toEqual(initialSource);
    await footer("source", "Cancel");
    expect(f.controller.undo()).toBe(true);
    await nextTick();
    expect(renderData(probe).series[0]?.values).toEqual([15, 25, 35]);
  });

  test("actual name and values pickers allow cross-sheet tab navigation and return to the captured owner before editing resumes", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.workbook);
    const source = await openSource(f.wrapper);
    await source.get("[data-source-edit]").trigger("click");
    const series = source.getComponent(ChartSeriesDialog);
    await series.get('[aria-label="Pick a name cell"]').trigger("click");
    await flushPromises();
    expect(f.wrapper.findComponent(RangeReferencePicker).exists()).toBe(true);
    await tab(f.wrapper, "Other Sheet");
    expect(f.controller.activeSheet.value.id).toBe("other");
    await pickCells(f.wrapper, { row: 0, column: 1 }, { row: 2, column: 1 });
    expect(f.wrapper.getComponent(RangeReferencePicker).props("reference")).toBe(
      "='Other Sheet'!$B$1",
    );
    await footer("picker", "OK");
    expect(f.controller.activeSheet.value.id).toBe("source");
    expect(f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId")).toBe("chart-one");
    expect(f.wrapper.getComponent(SpreadsheetRibbon).props("hasChart")).toBe(true);
    expect(series.get<HTMLInputElement>("[data-series-name] input").element.value).toBe(
      "='Other Sheet'!$B$1",
    );
    await series.get('[aria-label="Pick a values range"]').trigger("click");
    await flushPromises();
    await tab(f.wrapper, "Other Sheet");
    await pickCells(f.wrapper, { row: 1, column: 1 }, { row: 3, column: 1 });
    expect(f.wrapper.getComponent(RangeReferencePicker).props("reference")).toBe(
      "='Other Sheet'!$B$2:$B$4",
    );
    await footer("picker", "OK");
    expect(f.controller.activeSheet.value.id).toBe("source");
    expect(f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId")).toBe("chart-one");
    expect(f.wrapper.getComponent(SpreadsheetRibbon).props("hasChart")).toBe(true);
    expect(series.get<HTMLInputElement>("[data-series-values] input").element.value).toBe(
      "='Other Sheet'!$B$2:$B$4",
    );
    await footer("series", "OK");
    expect(renderData(sourceProbe(source)).series[0]?.values).toEqual([15, 25, 35]);
    await source.get("[data-source-categories]").trigger("click");
    const categories = source.getComponent(ChartCategoriesDialog);
    await categories.get('[aria-label="Pick a category range"]').trigger("click");
    await flushPromises();
    await tab(f.wrapper, "Other Sheet");
    await pickCells(f.wrapper, { row: 1, column: 0 }, { row: 3, column: 0 });
    expect(f.wrapper.getComponent(RangeReferencePicker).props("reference")).toBe(
      "='Other Sheet'!$A$2:$A$4",
    );
    await footer("picker", "OK");
    expect(f.controller.activeSheet.value.id).toBe("source");
    expect(f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId")).toBe("chart-one");
    expect(f.wrapper.getComponent(SpreadsheetRibbon).props("hasChart")).toBe(true);
    expect(categories.get<HTMLInputElement>("input").element.value).toBe(
      "='Other Sheet'!$A$2:$A$4",
    );
    await footer("categories", "OK");
    expect(renderData(sourceProbe(source)).categories).toEqual(["red", "green", "blue"]);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    await footer("source", "Cancel");
    expect(f.controller.session.history.undoStack).toHaveLength(0);
  });

  test("outer source range picker navigates across tabs, restores chart selection, and leaves a draft until Confirm", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.workbook);
    const source = await openSource(f.wrapper);
    await source.get('[aria-label="Pick a chart data range"]').trigger("click");
    await flushPromises();
    await tab(f.wrapper, "Other Sheet");
    await pickCells(f.wrapper, { row: 0, column: 0 }, { row: 3, column: 1 });
    expect(f.wrapper.getComponent(RangeReferencePicker).props("reference")).toBe(
      "='Other Sheet'!$A$1:$B$4",
    );
    await footer("picker", "OK");
    expect(f.controller.activeSheet.value.id).toBe("source");
    expect(f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId")).toBe("chart-one");
    expect(f.wrapper.getComponent(SpreadsheetRibbon).props("hasChart")).toBe(true);
    expect(source.get<HTMLInputElement>("[data-chart-source-range] input").element.value).toBe(
      "='Other Sheet'!$A$1:$B$4",
    );
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    await footer("source", "OK");
    expect(renderData(ownerProbe(f.wrapper))).toMatchObject({
      categories: ["red", "green", "blue"],
      series: [{ name: "external", values: [15, 25, 35] }],
    });
    expect(f.controller.session.history.undoStack).toHaveLength(1);
  });

  test.each(["delete", "same-id", "generation", "permission"] as const)(
    "captured picker, nested apply and source commit cannot mutate an old target after %s",
    async (kind) => {
      const f = await fixture(),
        source = await openSource(f.wrapper);
      const oldCommit = source.props("commit");
      const candidate = {
        ...chart(f.sheet),
        chart: {
          ...chart(f.sheet).chart,
          range: null,
          source: createChartSourceFromRange(f.sheet.id, chart(f.sheet).chart),
        },
      };
      await source.get("[data-source-edit]").trigger("click");
      const series = source.getComponent(ChartSeriesDialog),
        oldApply = series.props("apply"),
        entry = series.props("entry");
      const oldValuesInput = series.get<HTMLInputElement>("[data-series-values] input").element;
      await series.get('[aria-label="Pick a values range"]').trigger("click");
      await flushPromises();
      const picker = f.wrapper.getComponent(RangeReferencePicker);
      const oldConfirm = picker.vm.$.vnode.props?.onConfirm as () => void;
      await tab(f.wrapper, "Other Sheet");
      await pickCells(f.wrapper, { row: 1, column: 1 }, { row: 3, column: 1 });
      if (kind === "delete")
        expect(
          f.controller.executeCommand(
            createSetSheetDrawingsCommand(f.sheet.id, [chart(f.sheet, "chart-two")]),
          ),
        ).toBe(true);
      if (kind === "same-id")
        expect(
          f.controller.executeCommand(
            createSetSheetDrawingsCommand(f.sheet.id, [
              {
                ...chart(f.sheet),
                chart: { ...chart(f.sheet).chart, title: "Replacement target" },
              },
              chart(f.sheet, "chart-two"),
            ]),
          ),
        ).toBe(true);
      if (kind === "generation") f.controller.replaceWorkbook(workbookFixture());
      if (kind === "permission")
        expect(f.controller.executeCommand(createSetSheetProtectionCommand(f.sheet.id, true))).toBe(
          true,
        );
      await nextTick();
      const before = serializeWorkbook(f.controller.session.workbook);
      const undo = f.controller.session.history.undoStack.length,
        redo = f.controller.session.history.redoStack.length;
      oldConfirm();
      await flushPromises();
      expect(oldApply({ ...entry, name: { kind: "literal", text: "Late wrong owner" } })).toBe(
        false,
      );
      expect(oldCommit(candidate)).toBe(false);
      expect(serializeWorkbook(f.controller.session.workbook)).toEqual(before);
      expect(f.controller.session.history.undoStack).toHaveLength(undo);
      expect(f.controller.session.history.redoStack).toHaveLength(redo);
      expect(f.wrapper.findComponent(ChartSourceDialog).exists()).toBe(false);
      expect(oldValuesInput.value).toBe("='Source Data'!$B$2:$B$4");
      if (kind === "permission") expect(f.controller.activeSheet.value.id).toBe("other");
    },
  );
});

async function seriesVisible(source: Pick<VueWrapper, "findAll">, index: number, visible: boolean) {
  const inputs = source.findAll<HTMLInputElement>("[data-source-visibility] input[type=checkbox]");
  expect(inputs[index], "Missing actual Workspace series checkbox").toBeDefined();
  if (inputs[index]!.element.checked !== visible) inputs[index]!.element.click();
  await flushPromises();
  expect(
    source.findAll<HTMLInputElement>("[data-source-visibility] input[type=checkbox]")[index]!
      .element.checked,
  ).toBe(visible);
}
async function chooseFormatElement(wrapper: VueWrapper, value: string) {
  const select = wrapper.getComponent(ChartElementsToolbar).getComponent(Select);
  const option = select.props("options")?.find((item) => "value" in item && item.value === value);
  if (!option) throw new Error("Missing chart format element");
  await select.get(".t-input__inner").trigger("keydown", { key: "ArrowDown", code: "ArrowDown" });
  await expect
    .poll(() => document.querySelectorAll(".chart-format-options-popup .t-select-option").length)
    .toBeGreaterThan(0);
  const row = [
    ...document.querySelectorAll<HTMLElement>(".chart-format-options-popup .t-select-option"),
  ].find((item) => item.textContent?.trim() === option.label);
  if (!row) throw new Error("Missing native chart format option");
  await new DOMWrapper(row).trigger("pointerdown");
  await new DOMWrapper(row).trigger("click");
  await flushPromises();
  return wrapper.getComponent(ChartFormatPane);
}

describe("series filters through actual Workspace Select Data", () => {
  test("real Cancel writes nothing, all-hidden OK keeps range/title and reopening/show/UndoRedo are exact", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.workbook),
      original = chart(f.sheet);
    let source = await openSource(f.wrapper);
    await seriesVisible(source, 1, false);
    expect(renderData(sourceProbe(source)).series.map((entry) => entry.name)).toEqual(["apple"]);
    expect(chart(f.sheet)).toEqual(original);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    await footer("source", "Cancel");
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    source = await openSource(f.wrapper);
    await seriesVisible(source, 0, false);
    await seriesVisible(source, 1, false);
    expect(renderData(sourceProbe(source))).toMatchObject({
      categories: ["east", "north", "south"],
      series: [],
    });
    await footer("source", "OK");
    expect(f.wrapper.findComponent(ChartSourceDialog).exists()).toBe(false);
    expect(chart(f.sheet).chart.source).toBeUndefined();
    expect(chart(f.sheet).chart.range).toEqual(original.chart.range);
    expect(chart(f.sheet).chart.title).toBe("Sales");
    expect(chart(f.sheet).chart.rectangleSeries?.columns).toEqual([
      { index: 1, id: "range-series-1" },
      { index: 2, id: "range-series-2" },
    ]);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    const hidden = serializeWorkbook(f.workbook);
    expect(f.controller.undo()).toBe(true);
    await nextTick();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.redo()).toBe(true);
    await nextTick();
    expect(serializeWorkbook(f.workbook)).toEqual(hidden);
    source = await openSource(f.wrapper);
    expect(
      source.findAll("[data-source-series]").map((row) => row.text().replace(/^\d+\s*/, "")),
    ).toEqual(["apple", "pear"]);
    expect(
      source
        .findAll<HTMLInputElement>("[data-source-visibility] input")
        .map((input) => input.element.checked),
    ).toEqual([false, false]);
    await seriesVisible(source, 1, true);
    await footer("source", "OK");
    expect(
      renderData(ownerProbe(f.wrapper)).series.map((entry) => [entry.name, entry.colorIndex]),
    ).toEqual([["pear", 1]]);
    expect(f.controller.session.history.undoStack).toHaveLength(2);
    expect(f.controller.undo()).toBe(true);
    await nextTick();
    expect(serializeWorkbook(f.workbook)).toEqual(hidden);
    expect(f.controller.undo()).toBe(true);
    await nextTick();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("hide-show net-zero retains a real redo branch and never persists preview seed IDs", async () => {
    const f = await fixture(),
      original = chart(f.sheet);
    expect(
      f.controller.executeCommand(
        createSetSheetDrawingsCommand(f.sheet.id, [
          { ...original, chart: { ...original.chart, title: "Redo title" } },
          chart(f.sheet, "chart-two"),
        ]),
      ),
    ).toBe(true);
    expect(f.controller.undo()).toBe(true);
    await nextTick();
    const before = serializeWorkbook(f.workbook),
      redo = [...f.controller.session.history.redoStack];
    const source = await openSource(f.wrapper);
    await seriesVisible(source, 0, false);
    await seriesVisible(source, 1, false);
    await seriesVisible(source, 0, true);
    await seriesVisible(source, 1, true);
    expect(sourceDraft(source).chart.source).toBeUndefined();
    expect(sourceDraft(source).chart.rectangleSeries).toBeUndefined();
    await footer("source", "OK");
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    expect(f.controller.session.history.redoStack).toEqual(redo);
    expect(f.controller.redo()).toBe(true);
    expect(chart(f.sheet).chart.title).toBe("Redo title");
  });
  test("hidden Edit and reorder promote planned band IDs in one command without altering the old document", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.workbook),
      source = await openSource(f.wrapper);
    await seriesVisible(source, 1, false);
    await source.get('[data-source-series="series-2"]').trigger("click");
    await source.get("[data-source-edit]").trigger("click");
    const editor = source.getComponent(ChartSeriesDialog);
    await editor.get("[data-series-name] input").setValue("Hidden pear");
    await footer("series", "OK");
    await source.get("[data-source-up]").trigger("click");
    expect(renderData(sourceProbe(source)).series.map((entry) => entry.name)).toEqual(["apple"]);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    await footer("source", "OK");
    expect(f.wrapper.findComponent(ChartSourceDialog).exists()).toBe(false);
    expect(
      chart(f.sheet).chart.source?.series.map((entry) => [entry.id, entry.colorIndex]),
    ).toEqual([
      ["range-series-1", 1],
      ["series-1", 0],
    ]);
    expect(chart(f.sheet).chart.seriesFilter).toEqual({ hiddenSeriesIds: ["range-series-1"] });
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    expect(f.controller.undo()).toBe(true);
    await nextTick();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("inactive column intent survives row promotion and overlapping source reset in the real dialog owner", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.workbook),
      source = await openSource(f.wrapper);
    await seriesVisible(source, 1, false);
    source.getComponent(Select).vm.$emit("change", "rows");
    await flushPromises();
    await source.get("[data-source-categories]").trigger("click");
    await source.getComponent(ChartCategoriesDialog).get("input").setValue("='Source Data'!B1:C1");
    await footer("categories", "OK");
    await source.get("[data-chart-source-range] input").setValue("='Source Data'!A1:C4");
    await source.get("[data-reset-chart-range]").trigger("click");
    source.getComponent(Select).vm.$emit("change", "columns");
    await flushPromises();
    expect(
      source
        .findAll<HTMLInputElement>("[data-source-visibility] input")
        .map((input) => input.element.checked),
    ).toEqual([true, false]);
    await footer("source", "OK");
    expect(f.wrapper.findComponent(ChartSourceDialog).exists()).toBe(false);
    expect(chart(f.sheet).chart.source).toBeUndefined();
    expect(chart(f.sheet).chart.rectangleSeries?.columns).toEqual([
      { index: 2, id: "range-series-1" },
    ]);
    expect(chart(f.sheet).chart.seriesFilter).toEqual({ hiddenSeriesIds: ["range-series-1"] });
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    expect(f.controller.undo()).toBe(true);
    await nextTick();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("hidden series stays selectable for formatting and its color persists after showing it", async () => {
    const f = await fixture(),
      source = await openSource(f.wrapper);
    await seriesVisible(source, 1, false);
    await footer("source", "OK");
    const targetSelect = f.wrapper.getComponent(ChartElementsToolbar).getComponent(Select);
    expect(
      targetSelect
        .props("options")
        ?.find((item) => "value" in item && item.value === "range-series:columns:2")?.label,
    ).toContain("pear");
    const pane = await chooseFormatElement(f.wrapper, "range-series:columns:2");
    const color = pane
      .findAllComponents(ColorPaletteSelect)
      .find((item) => item.props("label") === "Series color")!;
    expect(color).toBeDefined();
    color.vm.$emit("select", "#f12345");
    await flushPromises();
    const id = chart(f.sheet).chart.rectangleSeries!.columns[0]!.id;
    expect(chart(f.sheet).chart.format?.series).toContainEqual({ id, color: "#f12345" });
    expect(renderData(ownerProbe(f.wrapper)).series.map((entry) => entry.name)).toEqual(["apple"]);
    const reopen = await openSource(f.wrapper);
    await seriesVisible(reopen, 1, true);
    await footer("source", "OK");
    expect(chart(f.sheet).chart.seriesFilter).toBeUndefined();
    expect(chart(f.sheet).chart.format?.series).toContainEqual({ id, color: "#f12345" });
    expect(renderData(ownerProbe(f.wrapper)).series.map((entry) => entry.name)).toEqual([
      "apple",
      "pear",
    ]);
    expect(renderData(ownerProbe(f.wrapper)).series[1]?.id).toBe(id);
  });
  test("all-hidden source opens Change Type and unchanged OK retains the filtered owner without invalid-source failure", async () => {
    const f = await fixture(),
      source = await openSource(f.wrapper);
    await seriesVisible(source, 0, false);
    await seriesVisible(source, 1, false);
    await footer("source", "OK");
    const before = serializeWorkbook(f.workbook),
      undo = f.controller.session.history.undoStack.length;
    const trigger = f.wrapper
      .getComponent(ChartElementsToolbar)
      .get('[aria-label="Change chart type"]');
    await trigger.trigger("pointerdown");
    await trigger.trigger("click");
    await flushPromises();
    expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(true);
    await footer("editor", "OK");
    expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.session.history.undoStack).toHaveLength(undo);
  });
});

describe("new Add filter lineage through Workspace", () => {
  test("pure accepted Add-hide-remove restores the original rectangle and preserves the existing redo branch", async () => {
    const f = await fixture(),
      original = chart(f.sheet);
    expect(
      f.controller.executeCommand(
        createSetSheetDrawingsCommand(f.sheet.id, [
          { ...original, chart: { ...original.chart, title: "Redo title" } },
          chart(f.sheet, "chart-two"),
        ]),
      ),
    ).toBe(true);
    expect(f.controller.undo()).toBe(true);
    await nextTick();
    const before = serializeWorkbook(f.workbook),
      redo = [...f.controller.session.history.redoStack];
    const source = await openSource(f.wrapper);
    await source.get("[data-source-add]").trigger("click");
    const adding = source.getComponent(ChartSeriesDialog);
    await adding.get("[data-series-name] input").setValue("Temporary added");
    await adding.get("[data-series-values] input").setValue("={1,2,3}");
    await footer("series", "OK");
    await seriesVisible(source, 2, false);
    await source.get("[data-source-up]").trigger("click");
    await source.get("[data-source-down]").trigger("click");
    await source.get("[data-source-remove]").trigger("click");
    expect(source.findAll("[data-source-series]")).toHaveLength(2);
    expect(sourceDraft(source).chart.source).toBeUndefined();
    expect(sourceDraft(source).chart.seriesFilter).toBeUndefined();
    await footer("source", "OK");
    expect(f.wrapper.findComponent(ChartSourceDialog).exists()).toBe(false);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    expect(f.controller.session.history.redoStack).toEqual(redo);
    expect(f.controller.redo()).toBe(true);
    expect(chart(f.sheet).chart.title).toBe("Redo title");
  });
});

async function openComboEditor(wrapper: VueWrapper) {
  await selectChart(wrapper);
  const trigger = wrapper
    .getComponent(ChartElementsToolbar)
    .get('[aria-label="Change chart type"]');
  await trigger.trigger("pointerdown");
  await trigger.trigger("click");
  await flushPromises();
  return wrapper.getComponent(ChartEditorDialog);
}
async function chooseComboOption(root: Pick<VueWrapper, "get">, selector: string, label: string) {
  const optionSelector =
    selector === "[data-chart-editor-type]"
      ? ".chart-editor-options-popup .t-select-option"
      : ".t-select-option";
  await root
    .get(selector)
    .get(".t-input__inner")
    .trigger("keydown", { key: "ArrowDown", code: "ArrowDown" });
  await expect
    .poll(() =>
      new DOMWrapper(document.body).findAll(optionSelector).some((entry) => entry.text() === label),
    )
    .toBe(true);
  const option = new DOMWrapper(document.body)
    .findAll(optionSelector)
    .find((entry) => entry.text() === label)!;
  await option.trigger("pointerdown");
  await option.trigger("click");
  await flushPromises();
}

describe("bounded Combo through real Workspace initialization and native controls", () => {
  test("Combo recipe then final Pie commits without hidden Combo edits or promoting the range", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.workbook),
      editor = await openComboEditor(f.wrapper);
    await chooseComboOption(editor, "[data-chart-editor-type]", "Column–Line Combo");
    await chooseComboOption(editor, "[data-chart-editor-type]", "Pie");
    await footer("editor", "OK");
    expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
    const saved = chart(f.sheet).chart;
    expect(saved.type).toBe("pie");
    expect(saved.source).toBeUndefined();
    expect(saved.range).toEqual(drawing().chart.range);
    expect(saved.format?.series?.some((entry) => entry.drawType === "line")).not.toBe(true);
    expect(saved.rectangleSeries).toBeUndefined();
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    expect(f.controller.undo()).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("a final stacked markerless Line variant does not acquire hidden Combo marker choices", async () => {
    const f = await fixture(),
      editor = await openComboEditor(f.wrapper);
    await chooseComboOption(editor, "[data-chart-editor-type]", "Column–Line Combo");
    await chooseComboOption(
      editor,
      '[data-chart-combo-type="band:columns:2"]',
      "Line with Markers",
    );
    await chooseComboOption(editor, "[data-chart-editor-type]", "Line");
    await editor.get('[data-chart-variant="percentStacked"]').trigger("click");
    await footer("editor", "OK");
    expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
    expect(chart(f.sheet).chart).toMatchObject({
      type: "line",
      stacked: true,
      presentation: { percentStacked: true, lineMarkers: false },
    });
    expect(chart(f.sheet).chart.source).toBeUndefined();
    expect(chart(f.sheet).chart.rectangleSeries).toBeUndefined();
    expect(f.controller.session.history.undoStack).toHaveLength(1);
  });
  test("native Combo recipe previews without identity/source/history writes and Cancel keeps exact workbook", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.workbook),
      editor = await openComboEditor(f.wrapper);
    await chooseComboOption(editor, "[data-chart-editor-type]", "Column–Line Combo");
    const probe = editor.getComponent(ChartContentProbe),
      preview = probe.props("drawing") as SheetChartDrawing;
    expect(preview.chart.type).toBe("combo");
    expect(preview.chart.source).toBeUndefined();
    expect(preview.chart.rectangleSeries).toBeUndefined();
    expect(probe.props("comboSeriesChanges")).toEqual([
      {
        rangeBand: { seriesBy: "columns", index: 1 },
        drawType: "column",
        axis: "primary",
        markers: false,
      },
      {
        rangeBand: { seriesBy: "columns", index: 2 },
        drawType: "line",
        axis: "primary",
        markers: false,
      },
    ]);
    expect(f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId")).toBe("chart-one");
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    await footer("editor", "Cancel");
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("OK/reopen marker and secondary Cancel/OK use exact owner and one Undo per edit", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.workbook),
      sibling = before.sheets
        .find((sheet) => sheet.id === "source")!
        .drawings!.find((drawing) => drawing.id === "chart-two")!;
    let editor = await openComboEditor(f.wrapper);
    await chooseComboOption(editor, "[data-chart-editor-type]", "Column–Line Combo");
    await footer("editor", "OK");
    expect(chart(f.sheet).chart.type).toBe("combo");
    expect(chart(f.sheet).chart.source).toBeUndefined();
    const first = serializeWorkbook(f.workbook);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    editor = await openComboEditor(f.wrapper);
    await chooseComboOption(
      editor,
      '[data-chart-combo-type="band:columns:2"]',
      "Line with Markers",
    );
    editor
      .get<HTMLInputElement>('[data-chart-combo-secondary="band:columns:2"] input[type=checkbox]')
      .element.click();
    await flushPromises();
    expect(serializeWorkbook(f.workbook)).toEqual(first);
    await footer("editor", "Cancel");
    expect(serializeWorkbook(f.workbook)).toEqual(first);
    editor = await openComboEditor(f.wrapper);
    await chooseComboOption(
      editor,
      '[data-chart-combo-type="band:columns:2"]',
      "Line with Markers",
    );
    editor
      .get<HTMLInputElement>('[data-chart-combo-secondary="band:columns:2"] input[type=checkbox]')
      .element.click();
    await flushPromises();
    await footer("editor", "OK");
    const final = serializeWorkbook(f.workbook);
    expect(
      resolveChartComboSeriesSettings(chart(f.sheet).chart, {
        rangeBand: { seriesBy: "columns", index: 2 },
      }),
    ).toEqual({ drawType: "line", axis: "secondary", markers: true });
    expect(chart(f.sheet, "chart-two")).toEqual(sibling);
    expect(f.controller.session.history.undoStack).toHaveLength(2);
    expect(f.controller.undo()).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(first);
    expect(f.controller.undo()).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.redo()).toBe(true);
    expect(f.controller.redo()).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(final);
  });
  test("a hidden first raw source remains recipe column; visible next series is plain line", async () => {
    const source = createChartSourceFromRange("source", drawing().chart);
    const hidden = source.series[0]!.id;
    const f = await fixture({ source, seriesFilter: { hiddenSeriesIds: [hidden] } }),
      editor = await openComboEditor(f.wrapper);
    await chooseComboOption(editor, "[data-chart-editor-type]", "Column–Line Combo");
    const choices = editor
      .getComponent(ChartContentProbe)
      .props("comboSeriesChanges") as ChartComboSeriesChange[];
    expect(choices).toMatchObject([
      { seriesId: hidden, drawType: "column" },
      { seriesId: source.series[1]!.id, drawType: "line", markers: false },
    ]);
    await footer("editor", "OK");
    expect(chart(f.sheet).chart.source).toEqual(source);
    expect(chart(f.sheet).chart.seriesFilter).toEqual({ hiddenSeriesIds: [hidden] });
    expect(renderData(ownerProbe(f.wrapper)).series.map((entry) => entry.id)).toEqual([
      source.series[1]!.id,
    ]);
  });
});

describe("main chart picker captured selection", () => {
  test("main picker restores the existing chart after both confirm and cancel without writing the draft", async () => {
    const f = await fixture();
    const before = serializeWorkbook(f.workbook);
    const editor = await openComboEditor(f.wrapper);
    await editor.get("[data-select-formula-reference]").trigger("click");
    await flushPromises();
    await pickCells(f.wrapper, { row: 0, column: 0 }, { row: 2, column: 2 });
    expect(f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId")).toBeNull();
    await footer("picker", "OK");
    expect(f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId")).toBe("chart-one");
    const source = editor.get<HTMLInputElement>(".chart-selector__source-controls input");
    expect(source.element.value).toBe("='Source Data'!$A$1:$C$3");
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    await editor.get("[data-select-formula-reference]").trigger("click");
    await flushPromises();
    await pickCells(f.wrapper, { row: 0, column: 0 }, { row: 1, column: 1 });
    expect(f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId")).toBeNull();
    await footer("picker", "Cancel");
    expect(f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId")).toBe("chart-one");
    expect(source.element.value).toBe("='Source Data'!$A$1:$C$3");
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    await footer("editor", "OK");
    expect(chart(f.sheet).chart.range).toEqual({
      start: { row: 0, column: 0 },
      end: { row: 2, column: 2 },
    });
    expect(f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId")).toBe("chart-one");
    expect(f.controller.session.history.undoStack).toHaveLength(1);
  });

  test("main picker does not select an uninserted chart draft", async () => {
    const f = await fixture();
    const before = serializeWorkbook(f.workbook);
    await f.wrapper.get('[data-ribbon-category="insert"]').trigger("click");
    await f.wrapper
      .get('.chart-insert-tools [role="button"][aria-label="Column"]')
      .trigger("click");
    await flushPromises();
    const editor = f.wrapper.getComponent(ChartEditorDialog);
    expect(editor.props("mode")).toBe("insert");
    await editor.get("[data-select-formula-reference]").trigger("click");
    await flushPromises();
    await pickCells(f.wrapper, { row: 0, column: 0 }, { row: 2, column: 2 });
    await footer("picker", "OK");
    expect(f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId")).toBeNull();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    await footer("editor", "Cancel");
    expect(f.controller.session.history.undoStack).toHaveLength(0);
  });

  test("main picker never restores a stale chart after switching sheets", async () => {
    const f = await fixture();
    const before = serializeWorkbook(f.workbook);
    const editor = await openComboEditor(f.wrapper);
    await editor.get("[data-select-formula-reference]").trigger("click");
    await flushPromises();
    const picker = f.wrapper.getComponent(RangeReferencePicker);
    const oldConfirm = picker.vm.$.vnode.props?.onConfirm as () => void;
    await pickCells(f.wrapper, { row: 0, column: 0 }, { row: 2, column: 2 });
    await tab(f.wrapper, "Other Sheet");
    oldConfirm();
    await flushPromises();
    expect(f.controller.activeSheet.value.id).toBe("other");
    expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
    expect(f.wrapper.findComponent(RangeReferencePicker).exists()).toBe(false);
    expect(f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId")).toBeNull();
    expect(serializeWorkbook(f.workbook)).toEqual({ ...before, activeSheetId: "other" });
    expect(f.controller.session.history.undoStack).toHaveLength(0);
  });
});
