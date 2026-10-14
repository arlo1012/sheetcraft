import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Select } from "tdesign-vue-next/es/select";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  getSheetChartData,
  normalizeSheetChart,
  type SheetChart,
} from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  createSheet,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  insertSheet,
  setCellContent,
} from "@sheetcraft/core/workbook";
import ChartContent from "../../../modules/charts/components/ChartContent.vue";
import ChartSourceDialog from "../../../modules/charts/components/ChartSourceDialog.vue";
import ChartSeriesDialog from "../../../modules/charts/components/ChartSeriesDialog.vue";
import ChartCategoriesDialog from "../../../modules/charts/components/ChartCategoriesDialog.vue";
import { createAppI18n } from "../../../shared/i18n";
import type {
  ChartSourceReferencePicker,
  ChartSourceVisibilityProof,
} from "../../../modules/charts/chart-source-editor";

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
    chart?: Partial<SheetChart>;
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
  Object.assign(drawing.chart, options.chart);
  const original = structuredClone(drawing);
  let result = options.commitResult ?? true;
  let valid = true;
  const commit = vi.fn((draft: SheetChartDrawing, _proof?: ChartSourceVisibilityProof) => {
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

const identityChart: Partial<SheetChart> = {
  rectangleSeries: {
    rows: [{ index: 2, id: "bound-row" }],
    columns: [
      { index: 0, id: "header-column" },
      { index: 1, id: "bound-apple" },
      { index: 2, id: "bound-pear" },
    ],
  },
  format: {
    series: [
      { id: "bound-row", color: "#112233" },
      { id: "header-column", color: "#223344" },
      { id: "bound-apple", color: "#ff0000" },
      { id: "bound-pear", color: "#00ff00" },
      { id: "series-1", color: "#0000ff" },
    ],
  },
};

describe("Select Data sparse rectangle identity", () => {
  test("bound preview and staged promotion keep formatting, while Cancel changes nothing", async () => {
    const f = fixture({ chart: identityChart });
    await settle();
    expect(names()).toEqual(["apple", "pear"]);
    expect(f.drawing).toEqual(f.original);
    await click("[data-source-down]");
    expect(names()).toEqual(["pear", "apple"]);
    await footer(parent, "cancel");
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.drawing).toEqual(f.original);
  });

  test("promotion transfers only active IDs and retry keeps the same detached draft", async () => {
    const f = fixture({ chart: identityChart, commitResult: false });
    await settle();
    await click("[data-source-down]");
    await footer(parent, "confirm");
    const chart = f.commit.mock.calls[0]![0].chart;
    expect(chart.range).toBeNull();
    expect(chart.rectangleSeries).toBeUndefined();
    expect(chart.source?.series.map((entry) => entry.id)).toEqual(["bound-pear", "bound-apple"]);
    expect(chart.format).toEqual(f.original.chart.format);
    f.accept();
    await footer(parent, "confirm");
    expect(f.commit.mock.calls[1]![0]).toEqual(f.commit.mock.calls[0]![0]);
    expect(f.drawing).toEqual(f.original);
  });

  test("same-sheet shrink keeps only intersecting bands and disjoint drafts can return to initial identity", async () => {
    const f = fixture({ chart: identityChart });
    await settle();
    await input(`${parent} [data-chart-source-range] input`, "=Sheet1!A1:B4");
    await click("[data-reset-chart-range]");
    await footer(parent, "confirm");
    const chart = f.commit.mock.calls[0]![0].chart;
    expect(chart.source).toBeUndefined();
    expect(chart.rectangleSeries).toEqual({
      rows: [{ index: 2, id: "bound-row" }],
      columns: [
        { index: 0, id: "header-column" },
        { index: 1, id: "bound-apple" },
      ],
    });
    expect(chart.format).toEqual(f.original.chart.format);
    f.wrapper.unmount();
    const returned = fixture({ chart: identityChart });
    await settle();
    await input(`${parent} [data-chart-source-range] input`, "=Sheet1!A20:C23");
    await click("[data-reset-chart-range]");
    await input(`${parent} [data-chart-source-range] input`, "=Sheet1!A1:C4");
    await click("[data-reset-chart-range]");
    await footer(parent, "confirm");
    expect(returned.commit.mock.calls[0]![0]).toEqual(returned.original);
  });

  test("cross-sheet same coordinates never inherit owner bindings or dormant styles", async () => {
    const f = fixture({ chart: identityChart });
    await settle();
    await input(`${parent} [data-chart-source-range] input`, "=Sheet2!A1:C4");
    await click("[data-reset-chart-range]");
    await footer(parent, "confirm");
    const chart = f.commit.mock.calls[0]![0].chart;
    expect(chart.rectangleSeries).toBeUndefined();
    expect(chart.range).toBeNull();
    expect(chart.source?.series.map((entry) => entry.id)).toEqual(["series-2", "series-3"]);
    expect(
      chart.source?.series.every(
        (entry) => entry.values.kind === "range" && entry.values.sheetId === f.second.id,
      ),
    ).toBe(true);
    expect(chart.format).toEqual(f.original.chart.format);
  });

  test("Remove followed by Add skips the removed series' dormant formatting ID", async () => {
    const f = fixture({
      chart: {
        range: null,
        source: {
          kind: "series",
          categories: { kind: "generated" },
          series: [
            {
              id: "series-1",
              colorIndex: 0,
              name: { kind: "literal", text: "remove" },
              values: { kind: "literal", values: [1, 2, 3] },
            },
            {
              id: "series-2",
              colorIndex: 1,
              name: { kind: "literal", text: "keep" },
              values: { kind: "literal", values: [4, 5, 6] },
            },
          ],
        },
        format: { series: [{ id: "series-1", color: "#ff0000" }] },
      },
    });
    await settle();
    await click("[data-source-remove]");
    await add("replacement", "={10,20,30}");
    await footer(parent, "confirm");
    const chart = f.commit.mock.calls[0]![0].chart;
    expect(chart.source?.series.map((entry) => entry.id)).toEqual(["series-2", "series-3"]);
    expect(chart.source?.series.some((entry) => entry.id === "series-1")).toBe(false);
    expect(chart.format).toEqual(f.original.chart.format);
  });
});

function visibilityInputs(): HTMLInputElement[] {
  return [
    ...element(parent).querySelectorAll<HTMLInputElement>(
      "[data-source-visibility] input[type=checkbox]",
    ),
  ];
}
async function visibility(index: number, checked: boolean) {
  const input = visibilityInputs()[index]!;
  expect(input, "Missing actual series checkbox").toBeDefined();
  if (input.checked !== checked) input.click();
  await settle();
  expect(visibilityInputs()[index]?.checked).toBe(checked);
}
function plotted(f: ReturnType<typeof fixture>) {
  const drawing = f.wrapper.getComponent(ChartContent).props("drawing") as SheetChartDrawing;
  return getSheetChartData(
    f.sheet,
    drawing.chart,
    createWorkbookEvaluator(f.workbook, f.sheet.id),
    (id) => f.workbook.sheets.get(id),
  );
}

describe("Select Data actual series checkboxes", () => {
  test.each(["column", "bar", "line", "area", "radar"] as const)(
    "%s checkbox previews retained definitions, keeps rectangle controls/selection and Cancel writes nothing",
    async (type) => {
      const f = fixture({ chart: { type } });
      await settle();
      expect(visibilityInputs().map((input) => input.checked)).toEqual([true, true]);
      expect(document.querySelector("button [data-source-visibility]")).toBeNull();
      expect(element('[data-source-visibility="band:columns:2"]').getAttribute("aria-label")).toBe(
        "Show pear",
      );
      await visibility(1, false);
      expect(names()).toEqual(["apple", "pear"]);
      expect(plotted(f).series.map((entry) => [entry.name, entry.colorIndex])).toEqual([
        ["apple", 0],
      ]);
      expect(element('[data-source-series="series-1"]').getAttribute("aria-pressed")).toBe("true");
      expect(element('[aria-label="Series direction"]')).toBeDefined();
      expect(element<HTMLInputElement>(`${parent} [data-chart-source-range] input`).value).toBe(
        "=Sheet1!$A$1:$C$4",
      );
      expect(f.drawing).toEqual(f.original);
      expect(f.commit).not.toHaveBeenCalled();
      await footer(parent, "cancel");
      expect(f.commit).not.toHaveBeenCalled();
    },
  );
  test("OK materializes range-band filter atomically, reopening retains unchecked rows and rechecking restores colors", async () => {
    const f = fixture();
    await settle();
    await visibility(0, false);
    await footer(parent, "confirm");
    const hidden = f.commit.mock.calls[0]![0].chart;
    expect(hidden.source).toBeUndefined();
    expect(hidden.range).toEqual(f.original.chart.range);
    expect(hidden.rectangleSeries).toEqual({
      rows: [],
      columns: [{ index: 1, id: "range-series-1" }],
    });
    expect(hidden.seriesFilter).toEqual({ hiddenSeriesIds: ["range-series-1"] });
    expect(hidden.title).toBe("Untouched title");
    expect(hidden.elements).toEqual(f.original.chart.elements);
    expect(f.commit.mock.calls[0]![1]?.changes).toEqual([
      { rangeBand: { seriesBy: "columns", index: 1 }, visible: false },
    ]);
    f.wrapper.unmount();
    const reopened = fixture({ chart: hidden });
    await settle();
    expect(names()).toEqual(["apple", "pear"]);
    expect(visibilityInputs().map((input) => input.checked)).toEqual([false, true]);
    expect(plotted(reopened).series.map((entry) => [entry.name, entry.colorIndex])).toEqual([
      ["pear", 1],
    ]);
    await visibility(0, true);
    expect(plotted(reopened).series.map((entry) => [entry.name, entry.colorIndex])).toEqual([
      ["apple", 0],
      ["pear", 1],
    ]);
    await footer(parent, "confirm");
    expect(reopened.commit.mock.calls[0]![0].chart.seriesFilter).toBeUndefined();
    expect(reopened.commit.mock.calls[0]![0].chart.rectangleSeries).toEqual(hidden.rectangleSeries);
  });
  test("all-hidden keeps raw categories/title and hide-show net-zero commits the exact original without seed IDs", async () => {
    const f = fixture();
    await settle();
    await visibility(0, false);
    await visibility(1, false);
    expect(names()).toEqual(["apple", "pear"]);
    expect(plotted(f).series).toEqual([]);
    expect(plotted(f).categories).toEqual(["east", "north", "south"]);
    expect(element(parent).textContent).toContain("north");
    await visibility(0, true);
    await visibility(1, true);
    await visibility(1, false);
    await visibility(1, true);
    await footer(parent, "confirm");
    expect(f.commit.mock.calls[0]![0]).toEqual(f.original);
    expect(f.commit.mock.calls[0]![1]).toBeUndefined();
  });
  test("hidden rows remain editable and later CRUD promotes real IDs with stable palettes and a retained filter", async () => {
    const f = fixture();
    await settle();
    await visibility(1, false);
    await click('[data-source-series="series-2"]');
    await click("[data-source-edit]");
    await input(`${series} [data-series-name] input`, "hidden pear edited");
    await footer(series, "confirm");
    expect(names()).toEqual(["apple", "hidden pear edited"]);
    expect(visibilityInputs().map((input) => input.checked)).toEqual([true, false]);
    expect(plotted(f).series.map((entry) => entry.name)).toEqual(["apple"]);
    await click("[data-source-up]");
    expect(names()).toEqual(["hidden pear edited", "apple"]);
    await add("bonus", "={1,2,3}");
    expect(visibilityInputs().map((input) => input.checked)).toEqual([false, true, true]);
    await footer(parent, "confirm");
    const chart = f.commit.mock.calls[0]![0].chart;
    expect(chart.source?.series.map((entry) => [entry.id, entry.colorIndex])).toEqual([
      ["range-series-1", 1],
      ["series-1", 0],
      ["series-2", 2],
    ]);
    expect(chart.seriesFilter).toEqual({ hiddenSeriesIds: ["range-series-1"] });
    expect(chart.range).toBeNull();
    expect(chart.rectangleSeries).toBeUndefined();
  });
  test("pending physical selections survive direction/header dormancy and overlapping ranges but disjoint reset retires them", async () => {
    const f = fixture();
    await settle();
    await visibility(1, false);
    f.wrapper.getComponent(Select).vm.$emit("change", "rows");
    await settle();
    expect(visibilityInputs().map((input) => input.checked)).toEqual([true, true, true]);
    f.wrapper.getComponent(Select).vm.$emit("change", "columns");
    await settle();
    expect(visibilityInputs().map((input) => input.checked)).toEqual([true, false]);
    await input(`${parent} [data-chart-source-range] input`, "=Sheet1!B1:C4");
    await click("[data-reset-chart-range]");
    // Column B becomes the header band; column C retains its physical selection.
    expect(visibilityInputs().map((input) => input.checked)).toEqual([false]);
    await input(`${parent} [data-chart-source-range] input`, "=Sheet1!A20:C23");
    await click("[data-reset-chart-range]");
    await input(`${parent} [data-chart-source-range] input`, "=Sheet1!A1:C4");
    await click("[data-reset-chart-range]");
    expect(visibilityInputs().map((input) => input.checked)).toEqual([true, true]);
    await footer(parent, "confirm");
    expect(f.commit.mock.calls[0]![0]).toEqual(f.original);
  });
  test("checkbox draft survives IME, owner failure, rejected commit and retry without document mutation", async () => {
    const f = fixture({ commitResult: false });
    await settle();
    await visibility(1, false);
    const target = element<HTMLInputElement>(`${parent} [data-chart-source-range] input`);
    target.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    await footer(parent, "confirm");
    expect(f.commit).not.toHaveBeenCalled();
    expect(visibilityInputs()[1]?.checked).toBe(false);
    target.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    await footer(parent, "confirm");
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(visibilityInputs()[1]?.checked).toBe(false);
    expect(f.drawing).toEqual(f.original);
    const first = f.commit.mock.calls[0]![0];
    f.accept();
    await footer(parent, "confirm");
    expect(f.commit.mock.calls[1]![0]).toEqual(first);
    f.wrapper.unmount();
    const stale = fixture();
    await settle();
    await visibility(0, false);
    stale.invalidate();
    await footer(parent, "confirm");
    expect(stale.commit).not.toHaveBeenCalled();
    expect(visibilityInputs()[0]?.checked).toBe(false);
  });
});

describe("visibility draft scope across source controls", () => {
  test("inactive physical intents survive promotion, overlapping rectangle reset and switching back", async () => {
    const f = fixture();
    await settle();
    await visibility(1, false);
    f.wrapper.getComponent(Select).vm.$emit("change", "rows");
    await settle();
    await click("[data-source-categories]");
    await input(`${categories} input`, "=Sheet1!B1:C1");
    await footer(categories, "confirm");
    expect(element(parent).querySelector('[aria-label="Series direction"]')).toBeNull();
    await input(`${parent} [data-chart-source-range] input`, "=Sheet1!A1:C4");
    await click("[data-reset-chart-range]");
    f.wrapper.getComponent(Select).vm.$emit("change", "columns");
    await settle();
    expect(visibilityInputs().map((input) => input.checked)).toEqual([true, false]);
    await footer(parent, "confirm");
    const chart = f.commit.mock.calls[0]![0].chart;
    expect(chart.source).toBeUndefined();
    expect(chart.rectangleSeries?.columns).toEqual([{ index: 2, id: "range-series-1" }]);
    expect(chart.seriesFilter).toEqual({ hiddenSeriesIds: ["range-series-1"] });
  });
  test("a pending data band becomes a dormant header without losing its filter selection", async () => {
    const f = fixture({ chart: { headerColumn: false } });
    await settle();
    await visibility(0, false);
    const header = f.wrapper
      .findAllComponents(Checkbox)
      .find((item) => item.text() === "First column contains categories")!;
    header.get<HTMLInputElement>("input").element.click();
    await settle();
    expect(visibilityInputs().map((input) => input.checked)).toEqual([true, true]);
    await footer(parent, "confirm");
    const chart = f.commit.mock.calls[0]![0].chart;
    expect(chart.headerColumn).toBe(true);
    expect(chart.rectangleSeries?.columns).toEqual([{ index: 0, id: "range-series-1" }]);
    expect(chart.seriesFilter).toEqual({ hiddenSeriesIds: ["range-series-1"] });
    f.wrapper.unmount();
    const reopened = fixture({ chart });
    await settle();
    const restore = reopened.wrapper
      .findAllComponents(Checkbox)
      .find((item) => item.text() === "First column contains categories")!;
    restore.get<HTMLInputElement>("input").element.click();
    await settle();
    expect(visibilityInputs().map((input) => input.checked)).toEqual([false, true, true]);
  });
  test("canceled picker and hidden invalid definitions retain the checkbox draft and reject stale data", async () => {
    let resolve: ((value: string | undefined) => void) | undefined;
    const picker = vi.fn(
      () =>
        new Promise<string | undefined>((done) => {
          resolve = done;
        }),
    );
    const f = fixture({ selectReference: picker });
    await settle();
    await visibility(1, false);
    await click('[aria-label="Pick a chart data range"]');
    resolve!(undefined);
    await settle();
    expect(visibilityInputs().map((input) => input.checked)).toEqual([true, false]);
    await footer(parent, "confirm");
    expect(f.commit.mock.calls[0]![0].chart.seriesFilter?.hiddenSeriesIds).toEqual([
      "range-series-1",
    ]);
    f.wrapper.unmount();
    const source = {
      kind: "series" as const,
      categories: { kind: "generated" as const },
      series: [
        {
          id: "hidden-broken",
          colorIndex: 0,
          name: { kind: "literal" as const, text: "broken" },
          values: { kind: "range" as const, sheetId: "missing", range: null },
        },
      ],
    };
    const broken = fixture({
      chart: { range: null, source, seriesFilter: { hiddenSeriesIds: ["hidden-broken"] } },
    });
    await settle();
    expect(names()).toEqual(["broken"]);
    expect(visibilityInputs()[0]?.checked).toBe(false);
    await footer(parent, "confirm");
    expect(broken.commit).not.toHaveBeenCalled();
    expect(element('[role="alert"]').textContent).toContain("valid range in this workbook");
  });
});

test("visibility exhaustion retains the complete draft, selected entry token and nested editor", async () => {
  const f = fixture({
    chart: {
      seriesFilter: {
        hiddenSeriesIds: Array.from({ length: 512 }, (_, index) => `retired-${index}`),
      },
    },
  });
  await settle();
  await visibility(1, false);
  await click("[data-source-remove]");
  expect(names()).toEqual(["apple", "pear"]);
  await click("[data-source-edit]");
  await input(`${series} [data-series-name] input`, "retained edit");
  await footer(series, "confirm");
  expect(f.wrapper.findComponent(ChartSeriesDialog).exists()).toBe(true);
  await footer(series, "cancel");
  expect(names()).toEqual(["apple", "pear"]);
  expect(visibilityInputs()[1]?.checked).toBe(false);
  await visibility(1, true);
  await click("[data-source-edit]");
  await input(`${series} [data-series-name] input`, "allowed edit");
  await footer(series, "confirm");
  expect(names()).toEqual(["allowed edit", "pear"]);
  expect(f.drawing).toEqual(f.original);
  expect(f.commit).not.toHaveBeenCalled();
});

describe("new Add filter lineage stays draft-only", () => {
  test("accepted Add then hide/materialize/remove restores the exact rectangle without an orphan filter or proof", async () => {
    const f = fixture();
    await settle();
    await add("draft only", "={1,2,3}");
    await visibility(2, false);
    await click("[data-source-up]");
    await click("[data-source-down]");
    await click("[data-source-remove]");
    expect(names()).toEqual(["apple", "pear"]);
    expect(visibilityInputs().map((input) => input.checked)).toEqual([true, true]);
    expect(element(parent).querySelector('[aria-label="Series direction"]')).not.toBeNull();
    await footer(parent, "confirm");
    expect(f.commit.mock.calls[0]![0]).toEqual(f.original);
    expect(f.commit.mock.calls[0]![1]).toBeUndefined();
  });
  test("new hidden Add removal preserves captured hidden IDs and unrelated source edits", async () => {
    const source = {
      kind: "series" as const,
      categories: { kind: "generated" as const },
      series: [
        {
          id: "existing-apple",
          colorIndex: 0,
          name: { kind: "literal" as const, text: "apple" },
          values: { kind: "literal" as const, values: [1, 2, 3] },
        },
        {
          id: "existing-pear",
          colorIndex: 1,
          name: { kind: "literal" as const, text: "pear" },
          values: { kind: "literal" as const, values: [4, 5, 6] },
        },
      ],
    };
    const f = fixture({
      chart: {
        range: null,
        source,
        seriesFilter: { hiddenSeriesIds: ["existing-apple", "retired-filter"] },
      },
    });
    await settle();
    await click('[data-source-series="existing-pear"]');
    await click("[data-source-edit]");
    await input(`${series} [data-series-name] input`, "pear edited");
    await footer(series, "confirm");
    await add("new removed", "={7,8,9}");
    await visibility(2, false);
    await click("[data-source-remove]");
    expect(names()).toEqual(["apple", "pear edited"]);
    expect(visibilityInputs().map((input) => input.checked)).toEqual([false, true]);
    await footer(parent, "confirm");
    expect(f.commit.mock.calls[0]![0].chart.seriesFilter).toEqual({
      hiddenSeriesIds: ["existing-apple", "retired-filter"],
    });
    expect(f.commit.mock.calls[0]![0].chart.source?.series).toHaveLength(2);
  });
});

test("fresh Add-hide-remove preserves a captured explicit-empty filter as an exact no-op", async () => {
  const source = {
    kind: "series" as const,
    categories: { kind: "generated" as const },
    series: [
      {
        id: "existing-apple",
        colorIndex: 0,
        name: { kind: "literal" as const, text: "apple" },
        values: { kind: "literal" as const, values: [1, 2, 3] },
      },
      {
        id: "existing-pear",
        colorIndex: 1,
        name: { kind: "literal" as const, text: "pear" },
        values: { kind: "literal" as const, values: [4, 5, 6] },
      },
    ],
  };
  const f = fixture({ chart: { range: null, source, seriesFilter: { hiddenSeriesIds: [] } } });
  await settle();
  await add("new canceled", "={7,8,9}");
  await visibility(2, false);
  await click("[data-source-remove]");
  await footer(parent, "confirm");
  expect(f.commit.mock.calls[0]![0]).toEqual(f.original);
  expect(f.commit.mock.calls[0]![0].chart.seriesFilter).toEqual({ hiddenSeriesIds: [] });
});
