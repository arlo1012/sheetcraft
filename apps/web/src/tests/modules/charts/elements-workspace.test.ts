import { DOMWrapper, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Select } from "tdesign-vue-next/es/select";
import { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
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
import ChartEditorDialog from "../../../modules/charts/components/ChartEditorDialog.vue";
import ChartSourceDialog from "../../../modules/charts/components/ChartSourceDialog.vue";
import ChartElementsControls from "../../../modules/charts/components/ChartElementsControls.vue";
import ChartElementsToolbar from "../../../modules/charts/components/ChartElementsToolbar.vue";
import ChartSubtypeControls from "../../../modules/charts/components/ChartSubtypeControls.vue";
import ChartStyleGallery from "../../../modules/charts/components/ChartStyleGallery.vue";
import type { ChartElementPatch } from "../../../modules/charts/chart-element-controls";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import { triggerCanvasCell } from "../../app/canvas-interaction";

// Capture the real command/history controller. Startup, composables, watches,
// Ribbon, SheetGrid, chart toolbar, menu and all editing controls remain real.
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

describe("chart design real Workspace context", () => {
  async function openDesign(wrapper: VueWrapper, label: "Chart subtypes" | "Chart styles") {
    const trigger = wrapper
      .getComponent(ChartElementsToolbar)
      .get<HTMLButtonElement>(`[aria-label="${label}"]`);
    await trigger.trigger("pointerdown");
    trigger.element.focus();
    await trigger.trigger("click");
    await flushPromises();
    const menu = new DOMWrapper(document.body).get(`[role="menu"][aria-label="${label}"]`);
    return { trigger, menu };
  }

  test.each([
    { label: "Chart subtypes", selector: '[data-chart-variant="percentStacked"]' },
    { label: "Chart styles", selector: '[data-chart-style="dark"]' },
  ] as const)(
    "actual $label popup preserves source/frame and commits one exact Undo/Redo",
    async ({ label, selector }) => {
      const f = await fixture();
      await selectChart(f.wrapper);
      const before = serializeWorkbook(f.workbook);
      const original = chart(f.sheet);
      const other = chart(f.sheet, "chart-two");
      const raw = renderData(renderProbe(f.wrapper));
      const { menu } = await openDesign(f.wrapper, label);
      const option = menu.get(selector);
      await option.trigger("pointerdown");
      await option.trigger("click");
      await flushPromises();
      expect(chart(f.sheet).chart.presentation).toMatchObject(
        label === "Chart subtypes" ? { percentStacked: true } : { background: "#202936" },
      );
      expect({ ...chart(f.sheet), chart: original.chart }).toEqual(original);
      expect(chart(f.sheet, "chart-two")).toEqual(other);
      expect(renderData(renderProbe(f.wrapper))).toEqual(raw);
      expect(f.controller.session.history.undoStack).toHaveLength(1);
      expect(document.querySelector(`[role="menu"][aria-label="${label}"]`)).toBeNull();
      const changed = serializeWorkbook(f.workbook);
      expect(f.controller.undo()).toBe(true);
      await nextTick();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.controller.redo()).toBe(true);
      await nextTick();
      expect(serializeWorkbook(f.workbook)).toEqual(changed);
    },
  );

  test("pending title and actual gallery click are atomic; composition never commits a partial title", async () => {
    const f = await fixture();
    await selectChart(f.wrapper);
    const before = serializeWorkbook(f.workbook);
    const controls = await openElements(f.wrapper);
    const title = controls.get<HTMLInputElement>('[aria-label="Title text"] input');
    title.element.focus();
    await title.trigger("compositionstart");
    await title.setValue("Quarter draft");
    const { menu } = await openDesign(f.wrapper, "Chart styles");
    const option = menu.get('[data-chart-style="forest"]');
    await option.trigger("pointerdown");
    await option.trigger("click");
    await flushPromises();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    await title.trigger("compositionend");
    await title.setValue("Quarter complete");
    await option.trigger("pointerdown");
    await option.trigger("click");
    await flushPromises();
    expect(chart(f.sheet).chart).toMatchObject({
      title: "Quarter complete",
      presentation: { background: "#f6faf5" },
    });
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    expect(f.controller.undo()).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test.each(["Chart subtypes", "Chart styles"] as const)(
    "keyboard %s opens and Escape returns focus without history",
    async (label) => {
      const f = await fixture();
      await selectChart(f.wrapper);
      const before = serializeWorkbook(f.workbook);
      const trigger = f.wrapper
        .getComponent(ChartElementsToolbar)
        .get<HTMLButtonElement>(`[aria-label="${label}"]`);
      trigger.element.focus();
      await trigger.trigger("keydown", { key: "ArrowDown", code: "ArrowDown" });
      await flushPromises();
      const menu = new DOMWrapper(document.body).get(`[role="menu"][aria-label="${label}"]`);
      expect(menu.element.contains(document.activeElement)).toBe(true);
      await menu.trigger("keydown", { key: "Escape", code: "Escape" });
      await flushPromises();
      expect(document.activeElement).toBe(trigger.element);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.controller.session.history.undoStack).toHaveLength(0);
    },
  );

  test.each(["sheet", "selection", "same-id", "undo"] as const)(
    "retained real design menu and owner reject after %s",
    async (change) => {
      const f = await fixture();
      await selectChart(f.wrapper);
      const oldOwner = f.wrapper.getComponent(ChartElementsToolbar).props("applyDesign")!;
      await openDesign(f.wrapper, "Chart styles");
      const oldStyle = f.wrapper.getComponent(ChartStyleGallery).props("apply");
      if (change === "sheet") {
        await f.wrapper
          .findAll(".workbook-sheet-tabs__tab")
          .find((item) => item.text() === "Other Sheet")!
          .trigger("click");
        await selectChart(f.wrapper);
      } else if (change === "selection") {
        await selectChart(f.wrapper, "chart-two");
      } else if (change === "same-id") {
        const original = chart(f.sheet);
        expect(
          f.controller.executeCommand(
            createSetSheetDrawingsCommand(
              f.sheet.id,
              f.sheet.drawings!.map((item) =>
                item.id === original.id
                  ? { ...original, chart: { ...original.chart, title: "Replaced" } }
                  : item,
              ),
            ),
          ),
        ).toBe(true);
      } else {
        expect(oldOwner({ kind: "style", style: "forest" })).toBe(true);
        expect(f.controller.undo()).toBe(true);
      }
      await flushPromises();
      const before = serializeWorkbook(f.workbook);
      const undoCount = f.controller.session.history.undoStack.length;
      const redoCount = f.controller.session.history.redoStack.length;
      expect(oldStyle({ kind: "style", style: "dark" })).toBe(false);
      expect(oldOwner({ kind: "variant", variant: "percentStacked" })).toBe(false);
      await flushPromises();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.controller.session.history.undoStack).toHaveLength(undoCount);
      expect(f.controller.session.history.redoStack).toHaveLength(redoCount);
    },
  );

  test("real line submenu presents all six variants and switches markers without changing raw data", async () => {
    const f = await fixture({ type: "line" });
    await selectChart(f.wrapper);
    const raw = renderData(renderProbe(f.wrapper));
    const { menu } = await openDesign(f.wrapper, "Chart subtypes");
    expect(menu.findAll("[data-chart-variant]")).toHaveLength(6);
    expect(f.wrapper.getComponent(ChartSubtypeControls).props("variant")).toBe("standardMarkers");
    await menu.get('[data-chart-variant="percentStacked"]').trigger("click");
    await flushPromises();
    expect(chart(f.sheet).chart).toMatchObject({
      stacked: true,
      presentation: { percentStacked: true, lineMarkers: false },
    });
    expect(renderData(renderProbe(f.wrapper))).toEqual(raw);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
  });
});

// ECharts SVG/option behavior has its own real-renderer regressions. This probe
// observes the exact live sheet, evaluator, drawing and revision reaching it.
const ChartContentProbe = defineComponent({
  name: "ChartContent",
  props: ["drawing", "sheet", "evaluator", "revision"],
  setup: () => () => h("div", { "data-chart-content-probe": "" }),
});
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  captured.controller = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function drawing(
  id: string,
  title: string,
  overrides: Partial<SheetChart> = {},
): SheetChartDrawing {
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
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
      title,
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
      ...overrides,
    },
  };
}
function workbookFixture(overrides: Partial<SheetChart> = {}) {
  const workbook = createWorkbook({ id: "chart-elements-book", sheetId: "source" });
  const sheet = getActiveSheet(workbook);
  sheet.name = "Source Data";
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
  sheet.drawings = [drawing("chart-one", "Sales", overrides), drawing("chart-two", "Other")];
  const other = createSheet("Other Sheet", "other");
  // Deliberately reuse the chart ID on another sheet: ownership includes sheet.
  other.drawings = [drawing("chart-one", "Other sheet chart")];
  insertSheet(workbook, other);
  return workbook;
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
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: { ChartContent: ChartContentProbe },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}
function savedWorkbook(workbook: ReturnType<typeof createWorkbook>) {
  return { revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) };
}
async function fixture(overrides: Partial<SheetChart> = {}) {
  const initial = workbookFixture(overrides);
  const wrapper = mountWorkspace(async () => savedWorkbook(initial));
  await flushPromises();
  const controller = captured.controller!;
  const workbook = controller.session.workbook;
  const sheet = workbook.sheets.get("source")!;
  expect(controller.session.history.undoStack).toHaveLength(0);
  return { wrapper, controller, workbook, sheet };
}
function chart(sheet: Sheet, id = "chart-one") {
  const result = sheet.drawings?.find((item) => item.id === id);
  if (!result || result.kind !== "chart") throw new Error(`Missing chart ${id}`);
  return result;
}
async function selectChart(wrapper: VueWrapper, id: string | null = "chart-one") {
  wrapper.getComponent(SheetGrid).vm.selectDrawing(id);
  await nextTick();
  if (id) {
    expect(wrapper.getComponent(SpreadsheetRibbon).props("hasChart")).toBe(true);
    expect(wrapper.get('[data-ribbon-category="chart"]').attributes("aria-selected")).toBe("true");
    expect(wrapper.getComponent(ChartElementsToolbar).props("chart").title).toBe(
      chart(wrapper.getComponent(SheetGrid).props("sheet"), id).chart.title,
    );
  }
}
async function openElements(wrapper: VueWrapper) {
  const toolbar = wrapper.getComponent(ChartElementsToolbar);
  const trigger = toolbar.get('[aria-label="Add chart element"]');
  await trigger.trigger("pointerdown");
  await trigger.trigger("click");
  await flushPromises();
  const controls = toolbar.getComponent(ChartElementsControls);
  expect(
    new DOMWrapper(document.body).find('[role="menu"][aria-label="Chart elements"]').exists(),
  ).toBe(true);
  return controls;
}
async function choose(
  controls: Pick<
    VueWrapper<InstanceType<typeof ChartElementsControls>>,
    "findAllComponents" | "vm"
  >,
  label: string,
  value: string,
) {
  const select = controls
    .findAllComponents(Select)
    .find((item) => item.attributes("aria-label") === label);
  if (!select) throw new Error(`Missing chart selector ${label}`);
  const selectedOption = select
    .props("options")
    ?.find((item) => "value" in item && item.value === value);
  if (!selectedOption || !("label" in selectedOption) || typeof selectedOption.label !== "string") {
    throw new Error(`Missing text option ${label}: ${value}`);
  }
  const optionLabel = selectedOption.label;
  await select.get(".t-input__inner").trigger("keydown", { key: "ArrowDown", code: "ArrowDown" });
  const options = () =>
    controls.vm
      .popupElements()
      .flatMap((popup) => [...popup.querySelectorAll<HTMLElement>(".t-select-option")]);
  await expect.poll(() => options().map((item) => item.textContent?.trim())).toContain(optionLabel);
  const option = options().find((item) => item.textContent?.trim() === optionLabel)!;
  // Exercise shared menu's real outside-pointer/focus rules with the portal.
  await new DOMWrapper(option).trigger("pointerdown");
  await new DOMWrapper(option).trigger("click");
  await flushPromises();
}
function renderProbe(wrapper: VueWrapper, id = "chart-one") {
  const probe = wrapper
    .findAllComponents(ChartContentProbe)
    .find((item) => (item.props("drawing") as SheetChartDrawing).id === id)!;
  expect(probe).toBeDefined();
  return probe;
}
function renderData(probe: Pick<ReturnType<typeof renderProbe>, "props">) {
  return getSheetChartData(
    probe.props("sheet") as Sheet,
    (probe.props("drawing") as SheetChartDrawing).chart,
    probe.props("evaluator") as SheetEvaluator,
  );
}
async function openSource(wrapper: VueWrapper) {
  const trigger = wrapper.getComponent(ChartElementsToolbar).get('[aria-label="Select data"]');
  await trigger.trigger("pointerdown");
  await trigger.trigger("click");
  await flushPromises();
  return wrapper.getComponent(ChartSourceDialog);
}
async function clickDialogFooter(label: "OK" | "Cancel", source = false) {
  // Workspace also owns mounted-but-hidden library dialogs. Target the real
  // chart editor's enclosing native dialog, never a document-wide first match.
  const dialog = document
    .querySelector(source ? "[data-chart-source-dialog]" : ".chart-editor")
    ?.closest(".t-dialog");
  expect(dialog).toBeDefined();
  const button = new DOMWrapper(dialog!)
    .findAll(".t-dialog__footer button")
    .find((item) => item.text() === label);
  expect(button).toBeDefined();
  await button!.trigger("click");
  await flushPromises();
}

describe("chart elements real Workspace context", () => {
  test("real startup settles after delayed persistence, then selection activates keyboard-navigable context and exits", async () => {
    let resolve!: (value: ReturnType<typeof savedWorkbook>) => void;
    const wrapper = mountWorkspace(
      () =>
        new Promise((finish) => {
          resolve = finish;
        }),
    );
    expect(wrapper.findComponent(ChartElementsToolbar).exists()).toBe(false);
    await flushPromises();
    resolve(savedWorkbook(workbookFixture()));
    await flushPromises();
    const controller = captured.controller!;
    const sheet = controller.session.workbook.sheets.get("source")!;
    expect(chart(sheet).chart.elements).toBeUndefined();
    await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
    await selectChart(wrapper);
    const tab = wrapper.get('[data-ribbon-category="chart"]');
    expect(tab.text()).toBe("Chart Tools");
    expect(wrapper.get('[role="tabpanel"]').attributes("aria-labelledby")).toBe(
      tab.attributes("id"),
    );
    await tab.trigger("keydown", { key: "Home" });
    expect(wrapper.get('[data-ribbon-category="home"]').attributes("aria-selected")).toBe("true");
    await wrapper.get('[data-ribbon-category="home"]').trigger("keydown", { key: "End" });
    expect(tab.attributes("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab.element);
    await selectChart(wrapper, null);
    expect(wrapper.find('[data-ribbon-category="chart"]').exists()).toBe(false);
    expect(wrapper.findComponent(ChartElementsToolbar).exists()).toBe(false);
    expect(wrapper.get('[data-ribbon-category="home"]').attributes("aria-selected")).toBe("true");
    await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
    await selectChart(wrapper);
    await selectChart(wrapper, null);
    expect(wrapper.get('[data-ribbon-category="insert"]').attributes("aria-selected")).toBe("true");
    expect(chart(sheet).chart.elements).toBeUndefined();
    expect(controller.session.history.undoStack).toHaveLength(0);
  });

  test.each([
    {
      label: "Title position",
      value: "overlay",
      expected: { elements: { titlePosition: "overlay" } },
    },
    {
      label: "Legend position",
      value: "right",
      expected: { legend: true, elements: { legendPosition: "right" } },
    },
    {
      label: "Legend position",
      value: "topRight",
      expected: { legend: true, elements: { legendPosition: "topRight" } },
    },
    {
      label: "Data label position",
      value: "outsideEnd",
      expected: { labels: true, elements: { labelPosition: "outsideEnd" } },
    },
  ])(
    "real $label popup applies $value to only the selected chart as one undoable command",
    async ({ label, value, expected }) => {
      const f = await fixture();
      const before = serializeWorkbook(f.workbook);
      const original = chart(f.sheet);
      const other = chart(f.sheet, "chart-two");
      await selectChart(f.wrapper);
      const controls = await openElements(f.wrapper);
      await choose(controls, label, value);
      expect(chart(f.sheet).chart).toMatchObject(expected);
      expect({ ...chart(f.sheet), chart: original.chart }).toEqual(original);
      expect(chart(f.sheet, "chart-two")).toEqual(other);
      expect(f.controller.session.history.undoStack).toHaveLength(1);
      expect(document.querySelector('[role="menu"][aria-label="Chart elements"]')).toBeNull();
      const changed = serializeWorkbook(f.workbook);
      expect(f.controller.undo()).toBe(true);
      await nextTick();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.controller.undo()).toBe(false);
      expect(f.controller.redo()).toBe(true);
      await nextTick();
      expect(serializeWorkbook(f.workbook)).toEqual(changed);
    },
  );

  test("legend non-overlap is a real checkbox command and preserves dormant title/label settings", async () => {
    const elements = {
      titlePosition: "overlay",
      legendPosition: "topRight",
      legendOverlay: true,
      labelPosition: "insideBase",
    } as const;
    const f = await fixture({ elements });
    await selectChart(f.wrapper);
    const controls = await openElements(f.wrapper);
    const checkbox = controls
      .findAllComponents(Checkbox)
      .find((item) => item.text() === "Show legend without overlapping the chart")!;
    await checkbox.get('input[type="checkbox"]').setValue(true);
    await flushPromises();
    expect(chart(f.sheet).chart.elements).toEqual({ ...elements, legendOverlay: false });
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    expect(f.controller.undo()).toBe(true);
    expect(chart(f.sheet).chart.elements).toEqual(elements);
    expect(f.controller.redo()).toBe(true);
    expect(chart(f.sheet).chart.elements).toEqual({ ...elements, legendOverlay: false });
  });

  test.each(["enter", "blur"] as const)(
    "title %s commits a complete value once, with no per-keystroke history",
    async (commit) => {
      const f = await fixture();
      const before = serializeWorkbook(f.workbook);
      await selectChart(f.wrapper);
      const controls = await openElements(f.wrapper);
      const input = controls.get<HTMLInputElement>('[aria-label="Title text"] input');
      await input.setValue("Quarter");
      await input.setValue("Quarter 4 · apple and pear revenue");
      expect(chart(f.sheet).chart.title).toBe("Sales");
      expect(f.controller.session.history.undoStack).toHaveLength(0);
      if (commit === "enter") await input.trigger("keydown", { key: "Enter", code: "Enter" });
      else await input.trigger("blur");
      await input.trigger("blur");
      await flushPromises();
      expect(chart(f.sheet).chart.title).toBe("Quarter 4 · apple and pear revenue");
      expect(f.controller.session.history.undoStack).toHaveLength(1);
      expect(controls.emitted("patch")).toEqual([
        [{ title: "Quarter 4 · apple and pear revenue" }],
      ]);
      expect(f.controller.undo()).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.controller.redo()).toBe(true);
      expect(chart(f.sheet).chart.title).toBe("Quarter 4 · apple and pear revenue");
    },
  );

  test("title ordering keeps same-owner focus local and merges the complete title with one legend command", async () => {
    const f = await fixture();
    await selectChart(f.wrapper);
    const before = serializeWorkbook(f.workbook);
    const controls = await openElements(f.wrapper);
    const title = controls.get<HTMLInputElement>('[aria-label="Title text"] input');
    title.element.focus();
    await title.setValue("Revenue after same-owner focus");
    const legend = controls
      .findAllComponents(Select)
      .find((item) => item.attributes("aria-label") === "Legend position")!;
    legend.get<HTMLInputElement>("input").element.focus();
    await nextTick();
    expect(chart(f.sheet).chart.title).toBe("Sales");
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    expect(f.wrapper.findComponent(ChartElementsToolbar).exists()).toBe(true);
    await choose(controls, "Legend position", "right");
    expect(chart(f.sheet).chart).toMatchObject({
      title: "Revenue after same-owner focus",
      legend: true,
      elements: { legendPosition: "right" },
    });
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    expect(document.querySelector('[role="menu"][aria-label="Chart elements"]')).toBeNull();
    expect(f.controller.undo()).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.redo()).toBe(true);
    expect(chart(f.sheet).chart.title).toBe("Revenue after same-owner focus");
  });

  test("title ordering flushes outside pointerdown before drawing selection and blur dismiss the owner", async () => {
    const f = await fixture();
    await selectChart(f.wrapper);
    const before = serializeWorkbook(f.workbook);
    const controls = await openElements(f.wrapper);
    const title = controls.get<HTMLInputElement>('[aria-label="Title text"] input');
    title.element.focus();
    await title.setValue("Revenue saved on outside pointer");
    const home = f.wrapper.get<HTMLButtonElement>('[data-ribbon-category="home"]');
    await home.trigger("pointerdown");
    home.element.focus();
    await title.trigger("blur");
    await home.trigger("click");
    await flushPromises();
    expect(chart(f.sheet).chart.title).toBe("Revenue saved on outside pointer");
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    expect(f.wrapper.findComponent(ChartElementsToolbar).exists()).toBe(false);
    expect(document.querySelector('[role="menu"][aria-label="Chart elements"]')).toBeNull();
    expect(home.attributes("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(home.element);
    expect(f.controller.undo()).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.redo()).toBe(true);
    expect(chart(f.sheet).chart.title).toBe("Revenue saved on outside pointer");
  });

  test.each([
    { action: "source", label: "Select data" },
    { action: "edit", label: "Change chart type" },
    { action: "switch", label: "Switch row/column" },
  ] as const)(
    "pending toolbar title then $action uses the exact replacement owner and one history command",
    async ({ action, label }) => {
      const elements = {
        titlePosition: "overlay",
        legendPosition: "right",
        labelPosition: "outsideEnd",
      } as const;
      const f = await fixture({ elements, labels: true });
      await selectChart(f.wrapper);
      const before = serializeWorkbook(f.workbook);
      const original = chart(f.sheet);
      const other = chart(f.sheet, "chart-two");
      const controls = await openElements(f.wrapper);
      const title = controls.get<HTMLInputElement>('[aria-label="Title text"] input');
      title.element.focus();
      const complete = `Complete pending ${action} title`;
      await title.setValue(complete);
      expect(chart(f.sheet).chart.title).toBe("Sales");
      expect(f.controller.session.history.undoStack).toHaveLength(0);
      const trigger = f.wrapper
        .getComponent(ChartElementsToolbar)
        .get<HTMLElement>(`[aria-label="${label}"]`);
      await trigger.trigger("pointerdown");
      trigger.element.focus();
      await nextTick();
      expect(f.controller.session.history.undoStack).toHaveLength(0);
      await trigger.trigger("click");
      await flushPromises();
      const replacement = chart(f.sheet);
      expect(replacement).not.toBe(original);
      expect(replacement.chart).toMatchObject({
        title: complete,
        seriesBy: action === "switch" ? "rows" : "columns",
        elements,
        labels: true,
      });
      expect({ ...replacement, chart: original.chart }).toEqual(original);
      expect(chart(f.sheet, "chart-two")).toEqual(other);
      expect(f.sheet.drawings).toHaveLength(2);
      expect(f.controller.session.history.undoStack).toHaveLength(1);
      if (action === "switch") {
        expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
        expect(renderData(renderProbe(f.wrapper)).categories).toEqual(["apple", "pear"]);
      } else {
        const editor =
          action === "source"
            ? f.wrapper.getComponent(ChartSourceDialog)
            : f.wrapper.getComponent(ChartEditorDialog);
        expect(editor.props().drawing).toBe(replacement);
        expect(
          (editor.getComponent(ChartContentProbe).props("drawing") as SheetChartDrawing).chart
            .title,
        ).toBe(complete);
        await clickDialogFooter("Cancel", action === "source");
        expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
        expect(f.wrapper.findComponent(ChartSourceDialog).exists()).toBe(false);
        expect(f.controller.session.history.undoStack).toHaveLength(1);
      }
      const changed = serializeWorkbook(f.workbook);
      expect(f.controller.undo()).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.controller.redo()).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(changed);
    },
  );

  test("source cell edits refresh real render inputs while preserving configured elements and source undo", async () => {
    const elements = {
      titlePosition: "overlay",
      legendPosition: "right",
      legendOverlay: false,
      labelPosition: "outsideEnd",
    } as const;
    const f = await fixture({ elements, labels: true });
    await selectChart(f.wrapper);
    const before = serializeWorkbook(f.workbook);
    const probe = renderProbe(f.wrapper);
    const revision = probe.props("revision");
    expect(renderData(probe).series[0]!.values[0]).toBe(60);
    await triggerCanvasCell(f.wrapper, { row: 1, column: 1 }, "mousedown");
    expect(f.wrapper.findComponent(ChartElementsToolbar).exists()).toBe(false);
    expect(f.controller.commitCellValue({ address: { row: 1, column: 1 }, value: 160 })).toBe(true);
    await nextTick();
    expect(probe.props("revision")).not.toBe(revision);
    expect(renderData(probe).series[0]!.values[0]).toBe(160);
    expect((probe.props("drawing") as SheetChartDrawing).chart.elements).toEqual(elements);
    expect(chart(f.sheet).chart.labels).toBe(true);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    expect(f.controller.undo()).toBe(true);
    await nextTick();
    expect(renderData(probe).series[0]!.values[0]).toBe(60);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.redo()).toBe(true);
    await nextTick();
    expect(renderData(probe).series[0]!.values[0]).toBe(160);
    expect(chart(f.sheet).chart.elements).toEqual(elements);
  });

  test("source dialog stages direction and range, retaining title/elements until real Cancel", async () => {
    const elements = {
      titlePosition: "overlay",
      legendPosition: "right",
      labelPosition: "outsideEnd",
    } as const;
    const f = await fixture({ elements, labels: true });
    await selectChart(f.wrapper);
    const before = serializeWorkbook(f.workbook);
    const editor = await openSource(f.wrapper);
    await editor.get("[data-chart-source-range] input").setValue("='Source Data'!$A$1:$B$4");
    const direction = editor
      .findAllComponents(Select)
      .find((item) => item.attributes("aria-label") === "Series direction")!;
    await direction
      .get(".t-input__inner")
      .trigger("keydown", { key: "ArrowDown", code: "ArrowDown" });
    await expect
      .poll(() =>
        new DOMWrapper(document.body).findAll(".t-select-option").map((item) => item.text()),
      )
      .toContain("Each row is a series");
    const option = new DOMWrapper(document.body)
      .findAll(".t-select-option")
      .find((item) => item.text() === "Each row is a series")!;
    expect(option).toBeDefined();
    expect(
      f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId"),
      "before source direction portal pointerdown",
    ).toBe("chart-one");
    expect(f.wrapper.getComponent(SpreadsheetRibbon).props("hasChart")).toBe(true);
    await option.trigger("pointerdown");
    expect(
      f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId"),
      "after source direction portal pointerdown",
    ).toBe("chart-one");
    expect(f.wrapper.getComponent(SpreadsheetRibbon).props("hasChart")).toBe(true);
    await option.trigger("click");
    await flushPromises();
    expect(f.wrapper.getComponent(SpreadsheetRibbon).props("hasChart")).toBe(true);
    const preview = editor.getComponent(ChartContentProbe);
    expect((preview.props("drawing") as SheetChartDrawing).chart).toMatchObject({
      seriesBy: "rows",
      title: "Sales",
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
      elements,
    });
    expect(editor.find('[aria-label="Title text"]').exists()).toBe(false);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    await clickDialogFooter("Cancel", true);
    expect(f.wrapper.findComponent(ChartSourceDialog).exists()).toBe(false);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    expect(
      f.wrapper.getComponent(SheetDrawingLayer).props("selectedDrawingId"),
      "after source Cancel",
    ).toBe("chart-one");
    expect(f.wrapper.getComponent(SpreadsheetRibbon).props("hasChart")).toBe(true);
    const reopened = await openSource(f.wrapper);
    expect(
      (reopened.getComponent(ChartContentProbe).props("drawing") as SheetChartDrawing).chart,
    ).toMatchObject({ seriesBy: "columns", title: "Sales", elements });
    await clickDialogFooter("Cancel", true);
  });

  test("source dialog OK flushes an unblurred complete range into one command, preserving title", async () => {
    const f = await fixture({ elements: { legendPosition: "right" } });
    await selectChart(f.wrapper);
    const before = serializeWorkbook(f.workbook);
    const editor = await openSource(f.wrapper);
    await editor.get("[data-chart-source-range] input").setValue("='Source Data'!$A$1:$B$4");
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    expect(chart(f.sheet).chart.title).toBe("Sales");
    await clickDialogFooter("OK", true);
    expect(f.wrapper.findComponent(ChartSourceDialog).exists()).toBe(false);
    expect(chart(f.sheet).chart).toMatchObject({
      title: "Sales",
      elements: { legendPosition: "right" },
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } },
    });
    expect(f.sheet.drawings).toHaveLength(2);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    expect(f.controller.undo()).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.redo()).toBe(true);
    expect(chart(f.sheet).chart.title).toBe("Sales");
    expect(chart(f.sheet).chart.range?.end.column).toBe(1);
  });

  test("real Switch row/column retains title, legend and labels in one reversible command", async () => {
    const elements = {
      titlePosition: "overlay",
      legendPosition: "right",
      labelPosition: "outsideEnd",
    } as const;
    const f = await fixture({ elements, labels: true });
    await selectChart(f.wrapper);
    const before = serializeWorkbook(f.workbook);
    const trigger = f.wrapper
      .getComponent(ChartElementsToolbar)
      .get('[aria-label="Switch row/column"]');
    await trigger.trigger("pointerdown");
    await trigger.trigger("click");
    await nextTick();
    expect(chart(f.sheet).chart).toMatchObject({
      seriesBy: "rows",
      title: "Sales",
      legend: true,
      labels: true,
      elements,
    });
    expect(renderData(renderProbe(f.wrapper))).toMatchObject({
      categories: ["apple", "pear"],
      series: [{ name: "east" }, { name: "north" }, { name: "south" }],
    });
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    expect(f.controller.undo()).toBe(true);
    await nextTick();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(renderData(renderProbe(f.wrapper)).categories).toEqual(["east", "north", "south"]);
    expect(f.controller.redo()).toBe(true);
    expect(chart(f.sheet).chart.elements).toEqual(elements);
  });

  test.each(["sheet", "selection", "delete", "undo", "same-id"] as const)(
    "stale real menu/action handlers cannot mutate another chart after %s",
    async (change) => {
      const f = await fixture();
      await selectChart(f.wrapper);
      const toolbar = f.wrapper.getComponent(ChartElementsToolbar);
      const oldApply = toolbar.props("apply");
      const oldEdit = toolbar.props("onEdit")!;
      const oldSource = toolbar.props("onSource")!;
      const oldDirection = toolbar.props("onSwitchDirection")!;
      const controls = await openElements(f.wrapper);
      const oldPatch = controls.vm.$.vnode.props?.onPatch as (patch: ChartElementPatch) => void;
      expect(oldPatch).toBeTypeOf("function");
      if (change === "sheet") {
        await f.wrapper
          .findAll(".workbook-sheet-tabs__tab")
          .find((item) => item.text() === "Other Sheet")!
          .trigger("click");
        await selectChart(f.wrapper);
      } else if (change === "selection") {
        await selectChart(f.wrapper, "chart-two");
      } else if (change === "delete") {
        expect(
          f.controller.executeCommand(
            createSetSheetDrawingsCommand(
              f.sheet.id,
              f.sheet.drawings!.filter((item) => item.id !== "chart-one"),
            ),
          ),
        ).toBe(true);
      } else if (change === "same-id") {
        const original = chart(f.sheet);
        expect(
          f.controller.executeCommand(
            createSetSheetDrawingsCommand(
              f.sheet.id,
              f.sheet.drawings!.map((item) =>
                item.id === original.id
                  ? { ...original, chart: { ...original.chart, title: "Replacement owner" } }
                  : item,
              ),
            ),
          ),
        ).toBe(true);
      } else {
        await choose(controls, "Legend position", "right");
        expect(f.controller.undo()).toBe(true);
      }
      await nextTick();
      const before = serializeWorkbook(f.workbook);
      const undoCount = f.controller.session.history.undoStack.length;
      const redoCount = f.controller.session.history.redoStack.length;
      oldPatch({
        title: "Stale menu title",
        labels: true,
        elements: { labelPosition: "outsideEnd" },
      });
      expect(oldApply({ title: "Stale direct title" })).toBe(false);
      oldEdit();
      oldSource();
      oldDirection();
      await flushPromises();
      expect(f.wrapper.findComponent(ChartEditorDialog).exists()).toBe(false);
      expect(f.wrapper.findComponent(ChartSourceDialog).exists()).toBe(false);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.controller.session.history.undoStack).toHaveLength(undoCount);
      expect(f.controller.session.history.redoStack).toHaveLength(redoCount);
    },
  );
});
