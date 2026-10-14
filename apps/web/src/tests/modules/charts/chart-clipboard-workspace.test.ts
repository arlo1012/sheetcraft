import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, nextTick, toRaw } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createChartSourceFromRange } from "@sheetcraft/core/chart-source";
import { createSetCellContentCommand } from "@sheetcraft/core/commands";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  createSheet,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  insertSheet,
  setCellValue,
  type Sheet,
} from "@sheetcraft/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetDrawingLayer from "../../../modules/sheet-drawings/components/SheetDrawingLayer.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import { triggerCanvasCell } from "../../app/canvas-interaction";

// Forward the controller unchanged so cold startup, SheetGrid, object selection,
// keyboard/menu wiring, the chart-source hook and Core history are all exercised.
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
  props: ["drawing", "sheet", "evaluator", "revision", "resolveSheet"],
  setup: () => () => h("div", { "data-chart-content-probe": "" }),
});
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  captured.controller = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function drawing(id = "source-chart"): SheetChartDrawing {
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
      format: {
        title: { color: "#123456", fontSize: 22, bold: true },
        valueAxis: { min: 0, max: 160, title: "Amount", linkedToSource: false },
        series: [{ id: "dormant", color: "#445566", axis: "secondary" }],
      },
    },
  };
}
function workbookFixture(options: { protectedTarget?: boolean; cached?: boolean } = {}) {
  const workbook = createWorkbook({
    id: "chart-clipboard-workspace",
    sheetId: "source",
    sheetName: "Source",
  });
  const source = getActiveSheet(workbook),
    target = createSheet("Target", "target");
  for (const sheet of [source, target]) {
    const bonus = sheet === source ? 0 : 1000;
    [
      ["Region", "Apple", "Pear"],
      ["East", 60 + bonus, 70 + bonus],
      ["North", 100 + bonus, 80 + bonus],
      ["South", 120 + bonus, 90 + bonus],
    ].forEach((row, r) =>
      row.forEach((value, column) => setCellValue(sheet, { row: r, column }, value)),
    );
  }
  const root = drawing();
  if (options.cached) {
    root.chart.range = null;
    root.chart.dataCache = {
      categories: ["Frozen"],
      series: [{ name: "Cache", values: [42] }],
      records: [["Frozen", 42]],
    };
  }
  source.drawings = [root];
  target.drawings = [drawing("target-chart")];
  if (options.protectedTarget) {
    target.properties.protected = true;
    target.protection = { editableRanges: [] };
  }
  insertSheet(workbook, target);
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
async function fixture(options: Parameters<typeof workbookFixture>[0] = {}) {
  const wrapper = mountWorkspace(async () => savedWorkbook(workbookFixture(options)));
  await flushPromises();
  return state(wrapper);
}
function state(wrapper: VueWrapper) {
  const controller = captured.controller!,
    workbook = controller.session.workbook,
    source = workbook.sheets.get("source")!,
    target = workbook.sheets.get("target")!;
  expect(controller.session.history.undoStack).toHaveLength(0);
  return { wrapper, controller, workbook, source, target };
}
function chart(sheet: Sheet, id = "source-chart") {
  const result = sheet.drawings?.find((item) => item.id === id);
  if (!result || result.kind !== "chart") throw new Error(`Missing chart ${id}`);
  return result;
}
function data(f: ReturnType<typeof state>, sheet: Sheet, root: SheetChartDrawing) {
  const result = getSheetChartData(
    sheet,
    root.chart,
    createWorkbookEvaluator(f.workbook, sheet.id),
    (id) => f.workbook.sheets.get(id),
  );
  return {
    categories: result.categories,
    series: result.series.map(({ name, values }) => ({ name, values })),
  };
}
function pointer(type: string) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 40,
    clientY: 150,
  });
  Object.defineProperty(event, "pointerId", { value: 7 });
  return event;
}
async function select(wrapper: VueWrapper, id = "source-chart") {
  wrapper.get(`[data-sheet-drawing-id="${id}"]`).element.dispatchEvent(pointer("pointerdown"));
  window.dispatchEvent(pointer("pointercancel"));
  await flushPromises();
  expect(wrapper.getComponent(SheetGrid).vm.getSelectedShapeObjects()).toEqual([[id]]);
}
async function shortcut(wrapper: VueWrapper, key: "c" | "x" | "v", id?: string) {
  const object = id
    ? wrapper.get(`[data-sheet-drawing-id="${id}"]`)
    : wrapper.get(".sheet-grid__scroller");
  await object.trigger("keydown", { key, code: `Key${key.toUpperCase()}`, ctrlKey: true });
  await flushPromises();
}
async function openMenu(wrapper: VueWrapper, id = "source-chart") {
  await wrapper.get(`[data-sheet-drawing-id="${id}"]`).trigger("contextmenu", {
    clientX: 40,
    clientY: 150,
    button: 2,
  });
  await flushPromises();
  expect(document.querySelector('[role="menu"][aria-label="Chart actions"]')).not.toBeNull();
}
function menuItem(wrapper: VueWrapper, label: "Copy" | "Cut" | "Paste") {
  const item = wrapper.findAllComponents(MenuItem).find((entry) => entry.text() === label);
  expect(item, `Missing ${label} Chart command`).toBeDefined();
  return item!;
}
async function activate(wrapper: VueWrapper, label: "Copy" | "Cut" | "Paste") {
  await menuItem(wrapper, label).trigger("click");
  await flushPromises();
}
async function tab(wrapper: VueWrapper, name: "Source" | "Target") {
  const item = wrapper.findAll(".workbook-sheet-tabs__tab").find((entry) => entry.text() === name)!;
  expect(item).toBeDefined();
  await item.trigger("pointerdown");
  await item.trigger("click");
  await flushPromises();
}
function pending(wrapper: VueWrapper) {
  return wrapper.getComponent(SheetDrawingLayer).props("canPasteObjects");
}

describe("Chart clipboard through real Workspace startup and native entry", () => {
  test("cold delayed startup binds menu handlers; same-sheet Copy/Paste preserves the complete chart and one undo", async () => {
    let finish!: (value: ReturnType<typeof savedWorkbook>) => void;
    const wrapper = mountWorkspace(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await flushPromises();
    expect(wrapper.find('[data-sheet-drawing-id="source-chart"]').exists()).toBe(false);
    finish(savedWorkbook(workbookFixture()));
    await flushPromises();
    const f = state(wrapper),
      before = serializeWorkbook(f.workbook),
      source = structuredClone(toRaw(chart(f.source)));
    await openMenu(wrapper);
    expect(wrapper.getComponent(SheetGrid).vm.getSelectedShapeObjects()).toEqual([
      ["source-chart"],
    ]);
    await activate(wrapper, "Copy");
    expect(pending(wrapper)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    await openMenu(wrapper);
    await activate(wrapper, "Paste");
    expect(f.source.drawings).toHaveLength(2);
    const inserted = f.source.drawings!.at(-1)!;
    expect(inserted.kind).toBe("chart");
    expect(inserted.id).not.toBe(source.id);
    if (inserted.kind !== "chart") throw new Error("Expected Chart copy");
    expect(inserted.chart).toEqual(source.chart);
    expect(inserted.chart).not.toBe(chart(f.source).chart);
    expect(pending(wrapper)).toBe(true);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(f.workbook);
    expect(f.controller.undo()).toBe(true);
    await flushPromises();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.redo()).toBe(true);
    await flushPromises();
    expect(serializeWorkbook(f.workbook)).toEqual(after);
  });

  test("native keyboard cross-sheet Copy pins live range sources instead of reading the target cells", async () => {
    const f = await fixture(),
      original = structuredClone(toRaw(chart(f.source))),
      expected = data(f, f.source, chart(f.source));
    await select(f.wrapper);
    await shortcut(f.wrapper, "c", "source-chart");
    expect(pending(f.wrapper)).toBe(true);
    await tab(f.wrapper, "Target");
    await triggerCanvasCell(f.wrapper, { row: 4, column: 3 }, "mousedown", {
      button: 0,
      buttons: 1,
    });
    await triggerCanvasCell(f.wrapper, { row: 4, column: 3 }, "mouseup", { button: 0 });
    await shortcut(f.wrapper, "v");
    expect(f.target.drawings).toHaveLength(2);
    const inserted = f.target.drawings!.at(-1)!;
    if (inserted.kind !== "chart") throw new Error("Expected Chart copy");
    expect(inserted.chart.range).toBeNull();
    expect(inserted.chart.source).toEqual(
      createChartSourceFromRange(f.source.id, original.chart, f.source),
    );
    expect(inserted.chart.format).toEqual(original.chart.format);
    expect(inserted.chart.elements).toEqual(original.chart.elements);
    expect(data(f, f.target, inserted)).toEqual(expected);
    expect(data(f, f.target, chart(f.target, "target-chart"))).not.toEqual(expected);
    expect(chart(f.source)).toEqual(original);
    expect(pending(f.wrapper)).toBe(true);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    await shortcut(f.wrapper, "v");
    expect(f.target.drawings).toHaveLength(3);
    expect(f.controller.session.history.undoStack).toHaveLength(2);
  });

  test("native keyboard cross-sheet Cut moves both collections atomically and Undo/Redo restores provenance", async () => {
    const f = await fixture(),
      before = serializeWorkbook(f.workbook),
      expected = data(f, f.source, chart(f.source));
    await select(f.wrapper);
    await shortcut(f.wrapper, "x", "source-chart");
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    await tab(f.wrapper, "Target");
    await shortcut(f.wrapper, "v");
    expect(f.source.drawings).toEqual([]);
    expect(f.target.drawings).toHaveLength(2);
    const inserted = f.target.drawings!.at(-1)!;
    if (inserted.kind !== "chart") throw new Error("Expected Chart transfer");
    expect(data(f, f.target, inserted)).toEqual(expected);
    expect(inserted.chart.source?.categories).toMatchObject({ kind: "range", sheetId: "source" });
    expect(pending(f.wrapper)).toBe(false);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(f.workbook);
    expect(f.controller.undo()).toBe(true);
    await flushPromises();
    expect(serializeWorkbook(f.workbook).sheets).toEqual(before.sheets);
    expect(f.controller.redo()).toBe(true);
    await flushPromises();
    expect(serializeWorkbook(f.workbook)).toEqual(after);
  });

  test("a protected target rejects native Cut/Paste without consuming the old clipboard, source or history", async () => {
    const f = await fixture({ protectedTarget: true });
    await select(f.wrapper);
    await shortcut(f.wrapper, "x", "source-chart");
    await tab(f.wrapper, "Target");
    const before = serializeWorkbook(f.workbook),
      source = chart(f.source);
    await shortcut(f.wrapper, "v");
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(chart(f.source)).toBe(source);
    expect(pending(f.wrapper)).toBe(true);
    expect(f.controller.session.history.undoStack).toHaveLength(0);
    // Permission recheck alone does not alter the cut's document-history lease.
    f.target.properties.protected = false;
    await nextTick();
    await shortcut(f.wrapper, "v");
    expect(f.source.drawings).toEqual([]);
    expect(f.target.drawings).toHaveLength(2);
    expect(pending(f.wrapper)).toBe(false);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
  });

  test("cross-sheet native Copy preserves detached cache authority", async () => {
    const f = await fixture({ cached: true }),
      original = structuredClone(toRaw(chart(f.source).chart)),
      expected = data(f, f.source, chart(f.source));
    await openMenu(f.wrapper);
    await activate(f.wrapper, "Copy");
    await tab(f.wrapper, "Target");
    await openMenu(f.wrapper, "target-chart");
    await activate(f.wrapper, "Paste");
    const inserted = f.target.drawings!.at(-1)!;
    if (inserted.kind !== "chart") throw new Error("Expected detached Chart copy");
    expect(inserted.chart).toEqual(original);
    expect(inserted.chart.source).toBeUndefined();
    expect(inserted.chart.range).toBeNull();
    expect(data(f, f.target, inserted)).toEqual(expected);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
  });

  test("retained Workspace menu callbacks reject sheet and revision changes without clearing the earlier Copy", async () => {
    const f = await fixture();
    await openMenu(f.wrapper);
    await activate(f.wrapper, "Copy");
    await openMenu(f.wrapper);
    const oldCopy = menuItem(f.wrapper, "Copy").vm.$.vnode.props!.onSelect as () => boolean;
    await tab(f.wrapper, "Target");
    const targetBefore = serializeWorkbook(f.workbook);
    expect(oldCopy()).toBe(false);
    expect(serializeWorkbook(f.workbook)).toEqual(targetBefore);
    expect(pending(f.wrapper)).toBe(true);
    await openMenu(f.wrapper, "target-chart");
    const oldPaste = menuItem(f.wrapper, "Paste").vm.$.vnode.props!.onSelect as () => boolean;
    expect(
      f.controller.executeCommand(
        createSetCellContentCommand(
          f.target.id,
          { row: 0, column: 6 },
          { kind: "literal", value: "new revision" },
        ),
      ),
    ).toBe(true);
    await flushPromises();
    const revised = serializeWorkbook(f.workbook);
    expect(oldPaste()).toBe(false);
    expect(serializeWorkbook(f.workbook)).toEqual(revised);
    expect(pending(f.wrapper)).toBe(true);
    expect(f.controller.session.history.undoStack).toHaveLength(1);
    await openMenu(f.wrapper, "target-chart");
    await activate(f.wrapper, "Paste");
    expect(f.target.drawings).toHaveLength(2);
    expect(f.controller.session.history.undoStack).toHaveLength(2);
  });
});
