import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { normalizeSheetChart } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  createSheet,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  insertSheet,
  setCellContent,
} from "@sheetcraft/core/workbook";
import ChartSourceDialog from "../../../modules/charts/components/ChartSourceDialog.vue";
import ChartSeriesDialog from "../../../modules/charts/components/ChartSeriesDialog.vue";
import ChartCategoriesDialog from "../../../modules/charts/components/ChartCategoriesDialog.vue";
import { createAppI18n } from "../../../shared/i18n";
import type { ChartSourceReferencePicker } from "../../../modules/charts/chart-source-editor";

// Use the actual SVG renderer without relying on happy-dom layout or a browser canvas.
vi.mock("../../../modules/charts/chart-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../modules/charts/chart-runtime")>();
  return {
    ...actual,
    init: (_root: unknown, _theme: unknown, options: { width: number; height: number }) =>
      actual.init(null, undefined, { ...options, renderer: "svg", ssr: true }),
  };
});
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
});
function fixture(
  options: {
    commitResult?: boolean;
    selectReference?: ChartSourceReferencePicker;
    locale?: "en-US" | "zh-CN";
  } = {},
) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const workbook = createWorkbook({ id: "source-dialog", sheetId: "first", sheetName: "Sheet1" });
  const sheet = getActiveSheet(workbook);
  const second = createSheet("Sheet2", "second");
  insertSheet(workbook, second);
  for (const [target, rows] of [
    [
      sheet,
      [
        ["region", "apple", "pear"],
        ["east", 60, 70],
        ["north", 100, 80],
        ["south", 120, 90],
      ],
    ],
    [
      second,
      [
        ["category", "extra"],
        ["red", 15],
        ["green", 25],
        ["blue", 35],
      ],
    ],
  ] as const) {
    rows.forEach((row, r) =>
      row.forEach((value, column) =>
        setCellContent(target, { row: r, column }, { kind: "literal", value }),
      ),
    );
  }
  const drawing: SheetChartDrawing = {
    id: "chart",
    kind: "chart",
    name: "Chart1",
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
      title: "Untouched title",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
      elements: { titlePosition: "overlay" },
    },
  };
  const original = structuredClone(drawing);
  let result = options.commitResult ?? true;
  let valid = true;
  const commit = vi.fn((draft: SheetChartDrawing) => {
    normalizeSheetChart(draft.chart);
    return result;
  });
  const wrapper = mount(ChartSourceDialog, {
    attachTo: document.body,
    props: {
      drawing,
      sheet,
      workbook,
      evaluator: createWorkbookEvaluator(workbook, sheet.id),
      revision: 0,
      disabled: false,
      ownerValid: () => valid,
      commit,
      selectReference: options.selectReference,
    },
    global: { plugins: [createAppI18n(options.locale ?? "en-US")] },
  });
  mounted.push(wrapper);
  return {
    wrapper,
    drawing,
    original,
    workbook,
    sheet,
    second,
    commit,
    accept: () => {
      result = true;
    },
    invalidate: () => {
      valid = false;
    },
  };
}
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing native DOM element: ${selector}`);
  return found;
}
async function settle() {
  await nextTick();
  await flushPromises();
}
async function click(selector: string) {
  element<HTMLButtonElement>(selector).click();
  await settle();
}
async function input(selector: string, text: string) {
  const target = element<HTMLInputElement>(selector);
  target.value = text;
  target.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
}
async function footer(root: string, action: "confirm" | "cancel") {
  const buttons = element(root)
    .closest(".t-dialog")!
    .querySelectorAll<HTMLButtonElement>(".t-dialog__footer button");
  expect(buttons.length).toBe(2);
  buttons[action === "cancel" ? 0 : 1]!.click();
  await settle();
}
const parent = "[data-chart-source-dialog]";
const series = "[data-chart-series-dialog]";
const categories = "[data-chart-categories-dialog]";
const names = () =>
  [...element(parent).querySelectorAll("[data-source-series]")].map((item) =>
    item.textContent?.trim().replace(/^\d+\s*/, ""),
  );
async function add(name: string, values: string) {
  await click("[data-source-add]");
  await input(`${series} [data-series-name] input`, name);
  await input(`${series} [data-series-values] input`, values);
  await footer(series, "confirm");
}

describe("Select Data actual TDesign DOM", () => {
  test("initial ordered lists resolve through Core, and nested Add Cancel changes nothing", async () => {
    const f = fixture();
    await settle();
    expect(names()).toEqual(["apple", "pear"]);
    expect(element(parent).textContent).toContain("east");
    expect(
      element<HTMLInputElement>(`${parent} [data-chart-source-range] input`).labels?.[0]
        ?.textContent,
    ).toContain("Chart data range");
    expect(document.querySelector('[aria-label="Pick a chart data range"]')).toBeNull();
    await click("[data-source-add]");
    await input(`${series} [data-series-name] input`, "bonus");
    await input(`${series} [data-series-values] input`, "={10,20,30}");
    expect(element("[data-series-values-preview]").textContent).toBe("10, 20, 30");
    await footer(series, "cancel");
    expect(names()).toEqual(["apple", "pear"]);
    await footer(parent, "cancel");
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.drawing).toEqual(f.original);
  });

  test("Add constant values is staged, makes the source complex, and outer Cancel preserves title/styles", async () => {
    const f = fixture({ locale: "zh-CN" });
    await settle();
    await add("bonus", "={10,20,30}");
    expect(names()).toEqual(["apple", "pear", "bonus"]);
    expect(element(parent).textContent).toContain("数据区域过于复杂");
    expect(element(parent).querySelector('[aria-label="系列生成方向"]')).toBeNull();
    expect(f.commit).not.toHaveBeenCalled();
    await footer(parent, "cancel");
    expect(f.drawing).toEqual(f.original);
  });

  test("typed cross-sheet add, Edit Cancel/Enter, categories, reorder and rejected outer retry stay atomic", async () => {
    const f = fixture({ commitResult: false });
    await settle();
    await add("=sheet2!b1", "=sheet2!b2:b4");
    expect(names()).toEqual(["apple", "pear", "extra"]);
    await click("[data-source-edit]");
    expect(element<HTMLInputElement>(`${series} [data-series-values] input`).value).toBe(
      "=Sheet2!$B$2:$B$4",
    );
    await input(`${series} [data-series-name] input`, "canceled");
    await footer(series, "cancel");
    expect(names()).toEqual(["apple", "pear", "extra"]);
    await click("[data-source-edit]");
    const target = element<HTMLInputElement>(`${series} [data-series-name] input`);
    // Confirm sees the native complete value even before a deferred view-model update.
    target.value = "revised";
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }),
    );
    await settle();
    expect(names()).toEqual(["apple", "pear", "revised"]);
    await click("[data-source-categories]");
    await input(`${categories} input`, "=sheet2!a2:a4");
    expect(element("[data-categories-preview]").textContent).toBe("red, green, blue");
    await footer(categories, "cancel");
    expect(element(parent).textContent).toContain("east");
    await click("[data-source-categories]");
    await input(`${categories} input`, "=sheet2!a2:a4");
    await footer(categories, "confirm");
    await click("[data-source-up]");
    expect(names()).toEqual(["apple", "revised", "pear"]);
    await click("[data-source-down]");
    expect(names()).toEqual(["apple", "pear", "revised"]);
    await click("[data-source-up]");
    await footer(parent, "confirm");
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.wrapper.emitted("close")).toBeUndefined();
    expect(element('[role="alert"]').textContent).toContain("draft is retained");
    const first = f.commit.mock.calls[0]![0];
    expect(first.chart.source!.series.map((entry) => [entry.id, entry.colorIndex])).toEqual([
      ["series-1", 0],
      ["series-3", 2],
      ["series-2", 1],
    ]);
    expect(first.chart.source!.categories).toMatchObject({ kind: "range", sheetId: f.second.id });
    expect(first.chart.title).toBe("Untouched title");
    expect(f.drawing).toEqual(f.original);
    f.accept();
    await footer(parent, "confirm");
    expect(f.commit).toHaveBeenCalledTimes(2);
    expect(f.commit.mock.calls[1]![0]).toEqual(first);
    expect(f.wrapper.emitted("close")).toEqual([[]]);
  });

  test("Remove through zero is a valid blank chart, and zero cancellation restores the original", async () => {
    const f = fixture();
    await settle();
    await click("[data-source-remove]");
    await click("[data-source-remove]");
    expect(names()).toEqual([]);
    expect(element(parent).textContent).toContain("Confirming keeps a blank chart");
    expect(element(parent).querySelectorAll(".chart-source-editor__categories li")).toHaveLength(1);
    await footer(parent, "confirm");
    expect(f.commit.mock.calls[0]![0].chart.source!.series).toEqual([]);
    expect(f.commit.mock.calls[0]![0].chart.title).toBe("Untouched title");
    expect(f.drawing).toEqual(f.original);
    f.wrapper.unmount();
    const canceled = fixture();
    await settle();
    await click("[data-source-remove]");
    await click("[data-source-remove]");
    await footer(parent, "cancel");
    expect(canceled.commit).not.toHaveBeenCalled();
    expect(canceled.drawing).toEqual(canceled.original);
  });

  test("stale nested callbacks never retarget removed/reordered entries or a reopened child", async () => {
    const f = fixture();
    await settle();
    await click("[data-source-edit]");
    const child = f.wrapper.getComponent(ChartSeriesDialog);
    const capturedApply = child.props("apply");
    const oldEntry = child.props("entry");
    const capturedClose = child.vm.$.vnode.props!.onClose as () => void;
    await footer(series, "cancel");
    await click("[data-source-remove]");
    await click("[data-source-edit]");
    capturedClose();
    await settle();
    expect(f.wrapper.getComponent(ChartSeriesDialog).props("entry").id).toBe("series-2");
    expect(capturedApply({ ...oldEntry, name: { kind: "literal", text: "wrong" } })).toBe(false);
    await footer(series, "cancel");
    expect(names()).toEqual(["pear"]);
    await click("[data-source-categories]");
    const staleCategories = f.wrapper.getComponent(ChartCategoriesDialog).props("apply");
    await footer(categories, "cancel");
    await footer(parent, "cancel");
    expect(staleCategories({ kind: "generated" })).toBe(false);
    expect(f.commit).not.toHaveBeenCalled();
  });

  test("invalid vectors/references cannot apply a previous source or the worksheet selection", async () => {
    const f = fixture();
    await settle();
    await click("[data-source-add]");
    await input(`${series} [data-series-name] input`, "bad");
    await input(`${series} [data-series-values] input`, "=Sheet2!A2:B4");
    await footer(series, "confirm");
    expect(f.wrapper.findComponent(ChartSeriesDialog).exists()).toBe(true);
    expect(element(`${series} [role="alert"]`).textContent).toContain(
      "valid name and numeric vector",
    );
    await input(`${series} [data-series-values] input`, "={10,20}");
    await footer(series, "confirm");
    expect(f.wrapper.findComponent(ChartSeriesDialog).exists()).toBe(true);
    await footer(series, "cancel");
    await input(`${parent} [data-chart-source-range] input`, "=Missing!A1:C4");
    await click("[data-source-add]");
    expect(f.wrapper.findComponent(ChartSeriesDialog).exists()).toBe(false);
    await footer(parent, "confirm");
    expect(f.commit).not.toHaveBeenCalled();
    expect(names()).toEqual(["apple", "pear"]);
  });

  test("IME composition rejects native Enter and footer actions until the complete name is ready", async () => {
    const f = fixture();
    await settle();
    await click("[data-source-edit]");
    const target = element<HTMLInputElement>(`${series} [data-series-name] input`);
    target.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    target.value = "苹果";
    target.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertCompositionText", data: "苹果" }),
    );
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true }),
    );
    await footer(series, "confirm");
    expect(f.wrapper.findComponent(ChartSeriesDialog).exists()).toBe(true);
    expect(element(`${series} [role="alert"]`).textContent).toContain("Finish composing");
    target.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    await settle();
    await footer(series, "confirm");
    expect(names()).toEqual(["苹果", "pear"]);
    expect(f.commit).not.toHaveBeenCalled();
  });

  test("picker callback replaces the whole field and a canceled/reopened editor rejects its delayed result", async () => {
    let resolve: ((value: string | undefined) => void) | undefined;
    const picker = vi.fn(
      () =>
        new Promise<string | undefined>((done) => {
          resolve = done;
        }),
    );
    fixture({ selectReference: picker });
    await settle();
    await click("[data-source-edit]");
    await input(`${series} [data-series-values] input`, "={10,20,30}");
    await click(`${series} [aria-label="Pick a values range"]`);
    expect(picker).toHaveBeenCalledWith("={10,20,30}", "series-values");
    resolve!("=Sheet2!B2:B4");
    await settle();
    expect(element<HTMLInputElement>(`${series} [data-series-values] input`).value).toBe(
      "=Sheet2!B2:B4",
    );
    await click(`${series} [aria-label="Pick a values range"]`);
    const oldResolve = resolve!;
    await footer(series, "cancel");
    await click("[data-source-edit]");
    oldResolve("=Sheet2!B2:B4");
    await settle();
    expect(element<HTMLInputElement>(`${series} [data-series-values] input`).value).toBe(
      "=Sheet1!$B$2:$B$4",
    );
  });

  test("owner invalidation and disabled reject nested and outer actions", async () => {
    const f = fixture();
    await settle();
    await click("[data-source-edit]");
    const child = f.wrapper.getComponent(ChartSeriesDialog);
    const apply = child.props("apply"),
      entry = child.props("entry");
    f.invalidate();
    await input(`${series} [data-series-name] input`, "stale");
    await footer(series, "confirm");
    expect(apply(entry)).toBe(false);
    expect(f.wrapper.findComponent(ChartSeriesDialog).exists()).toBe(true);
    await footer(series, "cancel");
    await footer(parent, "confirm");
    expect(f.commit).not.toHaveBeenCalled();
    f.wrapper.unmount();
    const disabled = fixture();
    await settle();
    await disabled.wrapper.setProps({ disabled: true });
    await click("[data-source-add]");
    await footer(parent, "confirm");
    expect(disabled.wrapper.findComponent(ChartSeriesDialog).exists()).toBe(false);
    expect(disabled.commit).not.toHaveBeenCalled();
  });

  test("rectangle rebuild clears custom edits explicitly and direction/header changes regenerate ordered sources", async () => {
    const f = fixture();
    await settle();
    await add("bonus", "={10,20,30}");
    await input(`${parent} [data-chart-source-range] input`, "=Sheet1!A1:C4");
    await click("[data-reset-chart-range]");
    expect(names()).toEqual(["apple", "pear"]);
    expect(element(parent).querySelector('[aria-label="Series direction"]')).not.toBeNull();
    await footer(parent, "confirm");
    expect(f.commit.mock.calls[0]![0].chart.source).toBeUndefined();
    expect(f.drawing).toEqual(f.original);
  });
  test("category-only and reorder-only promotions commit through the real exclusive-source normalizer", async () => {
    const reordered = fixture();
    await settle();
    await click("[data-source-down]");
    expect(names()).toEqual(["pear", "apple"]);
    await footer(parent, "confirm");
    const moved = reordered.commit.mock.calls[0]![0].chart;
    expect(moved.range).toBeNull();
    expect(moved.source!.series.map((entry) => [entry.id, entry.colorIndex])).toEqual([
      ["series-2", 1],
      ["series-1", 0],
    ]);
    reordered.wrapper.unmount();
    const edited = fixture();
    await settle();
    await click("[data-source-categories]");
    await input(`${categories} input`, "=Sheet2!A2:A4");
    await footer(categories, "confirm");
    await footer(parent, "confirm");
    const changed = edited.commit.mock.calls[0]![0].chart;
    expect(changed.range).toBeNull();
    expect(changed.source!.categories).toMatchObject({ kind: "range", sheetId: edited.second.id });
    expect(changed.source!.series).toHaveLength(2);
  });

  test("cross-sheet rectangle rebuild derives references then clears the exclusive legacy range", async () => {
    const f = fixture();
    await settle();
    await input(`${parent} [data-chart-source-range] input`, "=sheet2!a1:b4");
    await click("[data-reset-chart-range]");
    expect(names()).toEqual(["extra"]);
    expect(element(parent).textContent).toContain("green");
    await footer(parent, "confirm");
    const chart = f.commit.mock.calls[0]![0].chart;
    expect(chart.range).toBeNull();
    expect(chart.source!.categories).toMatchObject({ kind: "range", sheetId: f.second.id });
    expect(chart.source!.series[0]!.values).toMatchObject({ kind: "range", sheetId: f.second.id });
    expect(f.drawing).toEqual(f.original);
  });
});
