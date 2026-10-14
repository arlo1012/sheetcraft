import { DOMWrapper, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Select } from "tdesign-vue-next/es/select";
import { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
import { normalizeSheetChart } from "@sheetcraft/core/sheet-charts";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { createWorkbook, getActiveSheet, type Sheet } from "@sheetcraft/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import ChartElementsToolbar from "../../../modules/charts/components/ChartElementsToolbar.vue";
import ChartElementsControls from "../../../modules/charts/components/ChartElementsControls.vue";
import ChartFormatPane from "../../../modules/charts/components/ChartFormatPane.vue";
import PagePrintPreview from "../../../modules/page-layout/components/PagePrintPreview.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import { triggerCanvasCell } from "../../app/canvas-interaction";
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
const ChartContentProbe = defineComponent({
  name: "ChartContent",
  props: ["drawing", "sheet", "revision"],
  emits: ["selectElement"],
  setup: () => () => h("div", { "data-chart-content-probe": "" }),
});
const wrappers: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  captured.controller = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function drawing(id: string, title: string): SheetChartDrawing {
  return {
    id,
    kind: "chart",
    name: title,
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
      range: null,
      title,
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
      source: {
        kind: "series",
        categories: { kind: "generated" },
        series: [
          {
            id: "apple",
            colorIndex: 0,
            name: { kind: "literal", text: "apple" },
            values: { kind: "literal", values: [60, 100, 120] },
          },
          {
            id: "pear",
            colorIndex: 1,
            name: { kind: "literal", text: "pear" },
            values: { kind: "literal", values: [70, 80, 90] },
          },
        ],
      },
    },
  };
}
function savedWorkbook() {
  const workbook = createWorkbook({ id: "chart-format-book", sheetId: "source" });
  const sheet = getActiveSheet(workbook);
  sheet.drawings = [drawing("one", "Sales"), drawing("two", "Other")];
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
  wrappers.push(wrapper);
  return wrapper;
}
async function fixture() {
  const wrapper = mountWorkspace(async () => savedWorkbook());
  await flushPromises();
  const controller = captured.controller!;
  const sheet = getActiveSheet(controller.session.workbook);
  await select(wrapper);
  return { wrapper, controller, sheet };
}
function chart(sheet: Sheet, id = "one") {
  const node = sheet.drawings?.find((entry) => entry.id === id);
  if (!node || node.kind !== "chart") throw new Error("Missing chart");
  return node;
}
async function select(wrapper: VueWrapper, id: string | null = "one") {
  wrapper.getComponent(SheetGrid).vm.selectDrawing(id);
  await nextTick();
}
async function format(wrapper: VueWrapper) {
  const button = wrapper.getComponent(ChartElementsToolbar).get('[aria-label="Format selection"]');
  await button.trigger("pointerdown");
  await button.trigger("click");
  await flushPromises();
  return wrapper.getComponent(ChartFormatPane);
}
async function chooseElement(wrapper: VueWrapper, value: string) {
  const select = wrapper.getComponent(ChartElementsToolbar).getComponent(Select);
  const option = select.props("options")?.find((item) => "value" in item && item.value === value);
  if (!option) throw new Error("Missing element");
  await select.get(".t-input__inner").trigger("keydown", { key: "ArrowDown", code: "ArrowDown" });
  await expect
    .poll(() => document.querySelectorAll(".chart-format-options-popup .t-select-option").length)
    .toBeGreaterThan(0);
  const row = [
    ...document.querySelectorAll<HTMLElement>(".chart-format-options-popup .t-select-option"),
  ].find((item) => item.textContent?.trim() === option.label);
  if (!row) throw new Error("Missing native option");
  await new DOMWrapper(row).trigger("pointerdown");
  await new DOMWrapper(row).trigger("click");
  await flushPromises();
  return wrapper.getComponent(ChartFormatPane);
}
async function number(pane: Pick<VueWrapper, "get">, field: string, value: string) {
  const input = pane.get(`[data-chart-format-field="${field}"] input`);
  await input.setValue(value);
  await input.trigger("keydown", { key: "Enter", code: "Enter" });
  await flushPromises();
}
describe("chart formatting real Workspace", () => {
  test("ribbon and native chart element departures preserve an active IME draft", async () => {
    const f = await fixture(),
      pane = await chooseElement(f.wrapper, "valueAxis");
    const input = pane.get('[data-chart-format-field="min"] input');
    await input.trigger("compositionstart");
    await input.setValue("2");
    await chooseElement(f.wrapper, "title");
    expect(pane.props("target")).toEqual({ kind: "valueAxis" });
    expect(input.element).toHaveProperty("value", "2");
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    const probe = f.wrapper
      .findAllComponents(ChartContentProbe)
      .find((item) => item.props("drawing").id === "one")!;
    probe.vm.$emit("selectElement", { kind: "series", seriesId: "pear" }, true);
    await flushPromises();
    expect(pane.props("target")).toEqual({ kind: "valueAxis" });
    expect(input.element).toHaveProperty("value", "2");
    expect(f.controller.session.history.undoStack).toHaveLength(0);
  });

  test("delayed startup and native format entry are history-free", async () => {
    let resolve!: (value: ReturnType<typeof savedWorkbook>) => void;
    const wrapper = mountWorkspace(
      () =>
        new Promise((finish) => {
          resolve = finish;
        }),
    );
    await flushPromises();
    expect(wrapper.findComponent(ChartFormatPane).exists()).toBe(false);
    resolve(savedWorkbook());
    await flushPromises();
    await select(wrapper);
    const pane = await format(wrapper);
    expect(pane.props("target")).toEqual({ kind: "chart" });
    expect(captured.controller!.session.history.undoStack).toHaveLength(0);
    expect(
      chart(getActiveSheet(captured.controller!.session.workbook)).chart.format,
    ).toBeUndefined();
  });
  test("native print-preview entry supplies the current workbook resolver and fails visibly without verified fonts", async () => {
    const f = await fixture();
    const before = serializeWorkbook(f.controller.session.workbook);
    await f.wrapper.get('[data-ribbon-category="page"]').trigger("click");
    await f.wrapper.get('[data-page-tool="print-preview"]').trigger("click");
    await flushPromises();
    const preview = f.wrapper.getComponent(PagePrintPreview);
    const resolver = preview.props("resolveChartSheet");
    expect(resolver).toBeTypeOf("function");
    expect(resolver?.(f.sheet.id)).toBe(preview.props("sheet"));
    expect(resolver?.("missing-sheet")).toBeUndefined();
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/Chart/i);
    expect(serializeWorkbook(f.controller.session.workbook)).toEqual(before);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
  });

  test("real portal keeps owner selection, full numeric draft, one Undo/Redo and source", async () => {
    const f = await fixture(),
      source = normalizeSheetChart(chart(f.sheet).chart).source;
    const pane = await chooseElement(f.wrapper, "valueAxis");
    const input = pane.get('[data-chart-format-field="min"] input');
    await input.setValue("2");
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    await input.setValue("20");
    await input.trigger("keydown", { key: "Enter", code: "Enter" });
    await flushPromises();
    expect(chart(f.sheet).chart.format?.valueAxis?.min).toBe(20);
    expect(chart(f.sheet).chart.source).toEqual(source);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    expect(f.wrapper.findComponent(ChartElementsToolbar).exists()).toBe(true);
    expect(f.controller.undo()).toBe(true);
    await flushPromises();
    expect(chart(f.sheet).chart.format).toBeUndefined();
    expect(f.controller.redo()).toBe(true);
    await flushPromises();
    expect(chart(f.sheet).chart.format?.valueAxis?.min).toBe(20);
  });
  test("invalid bounds and composition retain draft without a document write", async () => {
    const f = await fixture(),
      pane = await chooseElement(f.wrapper, "valueAxis");
    await number(pane, "min", "20");
    const before = serializeWorkbook(f.controller.session.workbook);
    await number(pane, "max", "10");
    expect(pane.get('[data-chart-format-field="max"] input').element).toHaveProperty("value", "10");
    expect(serializeWorkbook(f.controller.session.workbook)).toEqual(before);
    const major = pane.get('[data-chart-format-field="majorUnit"] input');
    await major.trigger("compositionstart");
    await major.setValue("40");
    await major.trigger("keydown", { key: "Enter", code: "Enter", isComposing: true });
    expect(serializeWorkbook(f.controller.session.workbook)).toEqual(before);
  });
  test("stable series element event travels through real drawing layer/grid to pane", async () => {
    const f = await fixture();
    const probe = f.wrapper
      .findAllComponents(ChartContentProbe)
      .find((item) => item.props("drawing").id === "one")!;
    probe.vm.$emit("selectElement", { kind: "series", seriesId: "pear" }, true);
    await flushPromises();
    const pane = f.wrapper.getComponent(ChartFormatPane);
    expect(pane.props("target")).toEqual({ kind: "series", seriesId: "pear" });
    await number(pane, "overlap", "50");
    expect(chart(f.sheet).chart.format?.bar?.overlap).toBe(50);
    expect(f.controller.undo()).toBe(true);
    await flushPromises();
    expect(chart(f.sheet).chart.format).toBeUndefined();
  });
  test("old form callback rejects after actual selection or Undo without retargeting", async () => {
    const f = await fixture(),
      pane = await chooseElement(f.wrapper, "valueAxis"),
      old = pane.props("apply");
    await select(f.wrapper, "two");
    expect(old({ kind: "valueAxis", format: { min: 20 } })).toBe(false);
    expect(chart(f.sheet, "two").chart.format).toBeUndefined();
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    await select(f.wrapper);
    const live = await chooseElement(f.wrapper, "valueAxis"),
      callback = live.props("apply");
    await number(live, "min", "20");
    expect(f.controller.undo()).toBe(true);
    await flushPromises();
    expect(callback({ kind: "valueAxis", format: { min: 30 } })).toBe(false);
    expect(chart(f.sheet).chart.format).toBeUndefined();
  });
  test("pending title applies before opening format and IME blocks that transition", async () => {
    const f = await fixture(),
      toolbar = f.wrapper.getComponent(ChartElementsToolbar);
    await toolbar.get('[aria-label="Add chart element"]').trigger("click");
    await flushPromises();
    const controls = toolbar.getComponent(ChartElementsControls),
      title = controls.get('[aria-label="Title text"] input');
    await title.trigger("compositionstart");
    await title.setValue("New title");
    await toolbar.get('[aria-label="Format selection"]').trigger("click");
    await flushPromises();
    expect(f.wrapper.findComponent(ChartFormatPane).exists()).toBe(false);
    expect(chart(f.sheet).chart.title).toBe("Sales");
    await title.trigger("compositionend", { data: "New title" });
    await toolbar.get('[aria-label="Format selection"]').trigger("click");
    await flushPromises();
    expect(chart(f.sheet).chart.title).toBe("New title");
    expect(f.wrapper.findComponent(ChartFormatPane).exists()).toBe(true);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
  });
  test("actual cell selection closes pane without changing formatted data", async () => {
    const f = await fixture(),
      pane = await chooseElement(f.wrapper, "valueAxis");
    await number(pane, "min", "20");
    const before = serializeWorkbook(f.controller.session.workbook);
    await triggerCanvasCell(f.wrapper, { row: 0, column: 0 }, "pointerdown");
    await flushPromises();
    expect(f.wrapper.findComponent(ChartFormatPane).exists()).toBe(false);
    expect(serializeWorkbook(f.controller.session.workbook)).toEqual(before);
  });
});

test("real format-pane edit cannot commit before table native numeric-fit validation", async () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
    kind: string,
  ) {
    return kind === "2d" && this.width === 1 && this.height === 1
      ? ({
          font: "12px Arial",
          measureText: (value: string) => ({ width: value.length * 7.2 }),
        } as CanvasRenderingContext2D)
      : null;
  });
  const f = await fixture(),
    original = chart(f.sheet);
  const { source: _source, ...unlinked } = original.chart;
  const updated: SheetChartDrawing = {
    ...original,
    chart: {
      ...unlinked,
      elements: { dataTable: "withLegendKeys" },
      dataCache: {
        categories: ["a", "b", "c"],
        series: [
          {
            name: "wide",
            values: [1, 2, 3],
            numberFormat: { kind: "custom", code: "0".repeat(40) },
          },
        ],
        records: [],
      },
    },
  };
  expect(
    f.controller.executeCommand(
      createSetSheetDrawingsCommand(
        f.sheet.id,
        f.sheet.drawings!.map((node) => (node === original ? updated : node)),
      ),
    ),
  ).toBe(true);
  await nextTick();
  await select(f.wrapper);
  const before = serializeWorkbook(f.controller.session.workbook),
    count = f.controller.session.history.undoStack.length;
  const pane = await chooseElement(f.wrapper, "categoryAxis");
  await number(pane, "fontSize", "14");
  expect(serializeWorkbook(f.controller.session.workbook)).toEqual(before);
  expect(f.controller.session.history.undoStack).toHaveLength(count);
  expect(pane.get('[data-chart-format-field="fontSize"] input').element).toHaveProperty(
    "value",
    "14",
  );
});

test("real hidden axis-title and grid controls remain discoverable after a layout and are reversible", async () => {
  const f = await fixture(),
    original = chart(f.sheet);
  expect(
    f.controller.executeCommand(
      createSetSheetDrawingsCommand(
        f.sheet.id,
        f.sheet.drawings!.map((node) =>
          node === original
            ? {
                ...original,
                chart: {
                  ...original.chart,
                  format: {
                    valueAxis: {
                      title: "Saved axis title",
                      titleVisible: false,
                      majorGridlines: true,
                      minorGridlines: false,
                    },
                  },
                },
              }
            : node,
        ),
      ),
    ),
  ).toBe(true);
  await nextTick();
  await select(f.wrapper);
  const pane = await chooseElement(f.wrapper, "valueAxis");
  const before = serializeWorkbook(f.controller.session.workbook);
  await pane.get('[data-chart-format-field="titleVisible"] input').setValue(true);
  expect(chart(f.sheet).chart.format?.valueAxis?.titleVisible).toBe(true);
  expect(chart(f.sheet).chart.format?.valueAxis?.title).toBe("Saved axis title");
  expect(f.controller.undo()).toBe(true);
  await nextTick();
  expect(serializeWorkbook(f.controller.session.workbook)).toEqual(before);
  await chooseElement(f.wrapper, "valueAxis");
  const title = f.wrapper
    .getComponent(ChartFormatPane)
    .get('[data-chart-format-field="axisTitle"] input');
  await title.setValue("Visible edited title");
  await title.trigger("keydown", { key: "Enter", code: "Enter" });
  await flushPromises();
  expect(chart(f.sheet).chart.format?.valueAxis).toMatchObject({
    title: "Visible edited title",
    titleVisible: true,
  });
  expect(f.controller.undo()).toBe(true);
  await nextTick();
  expect(serializeWorkbook(f.controller.session.workbook)).toEqual(before);
  await chooseElement(f.wrapper, "valueAxis");
  const grid = f.wrapper
    .getComponent(ChartFormatPane)
    .get('[data-chart-format-field="minorGridlines"] input');
  await grid.setValue(true);
  await flushPromises();
  expect(chart(f.sheet).chart.format?.valueAxis?.minorGridlines).toBe(true);
  expect(f.controller.undo()).toBe(true);
  expect(serializeWorkbook(f.controller.session.workbook)).toEqual(before);
});
