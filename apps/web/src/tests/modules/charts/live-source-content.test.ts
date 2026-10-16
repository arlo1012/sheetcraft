import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ChartSeriesSource } from "@sheetcraft/core/chart-source";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  createSheet,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  insertSheet,
  setCellContent,
} from "@sheetcraft/core/workbook";
import type { ECElementEvent } from "echarts";
import type { EChartsType } from "../../../modules/charts/chart-runtime";
import ChartContent from "../../../modules/charts/components/ChartContent.vue";
import { getChartLegendLayout } from "../../../modules/charts/chart-element-layout";
import { createAppI18n } from "../../../shared/i18n";

const rendered = vi.hoisted(() => ({ instances: [] as EChartsType[] }));
// Keep the actual ECharts SVG renderer and only adapt its target to in-memory SSR.
vi.mock("../../../modules/charts/chart-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../modules/charts/chart-runtime")>();
  return {
    ...actual,
    init: (_element: unknown, _theme: unknown, options: { width: number; height: number }) => {
      const instance = actual.init(null, undefined, { ...options, renderer: "svg", ssr: true });
      rendered.instances.push(instance);
      return instance;
    },
  };
});
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  rendered.instances.length = 0;
  vi.unstubAllGlobals();
});
function fixture() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const workbook = createWorkbook({
    id: "live-render-book",
    sheetId: "first",
    sheetName: "Sheet1",
  });
  const sheet = getActiveSheet(workbook);
  const second = createSheet("Sheet2", "second");
  insertSheet(workbook, second);
  [
    ["category", "extra"],
    ["red", 15],
    ["green", 25],
    ["blue", 35],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(second, { row: r, column }, { kind: "literal", value }),
    ),
  );
  const source: ChartSeriesSource = {
    kind: "series",
    categories: {
      kind: "range",
      sheetId: second.id,
      range: { start: { row: 1, column: 0 }, end: { row: 3, column: 0 } },
    },
    series: [
      {
        id: "extra",
        colorIndex: 2,
        name: { kind: "cell", sheetId: second.id, cell: { row: 0, column: 1 } },
        values: {
          kind: "range",
          sheetId: second.id,
          range: { start: { row: 1, column: 1 }, end: { row: 3, column: 1 } },
        },
      },
    ],
  };
  const drawing: SheetChartDrawing = {
    id: "chart-object",
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
      range: null,
      source,
      title: "Chart Title",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: true,
      stacked: false,
      showHidden: false,
    },
  };
  const resolveSheet = vi.fn((id: string) => workbook.sheets.get(id));
  const evaluator = createWorkbookEvaluator(workbook, sheet.id);
  const wrapper = mount(ChartContent, {
    props: { drawing, sheet, evaluator, resolveSheet, revision: 0 },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  const svg = () => rendered.instances.at(-1)!.renderToSVGString();
  return { workbook, sheet, second, source, drawing, resolveSheet, wrapper, svg };
}

function nativeEvent(input: Partial<ECElementEvent>): ECElementEvent {
  return {
    type: "click",
    componentType: "series",
    componentSubType: "bar",
    componentIndex: 0,
    name: "point",
    dataIndex: 0,
    data: 1,
    value: 1,
    $vars: ["name", "value"],
    ...input,
  };
}
describe("live chart content lifecycle", () => {
  test("editable legend selects and opens its pane without toggling data; pagination stays native", async () => {
    const f = fixture();
    await f.wrapper.setProps({ editableLegend: true, selectedElement: { kind: "legend" } });
    const instance = rendered.instances.at(-1)!;
    const option = instance.getOption() as {
      legend: {
        selectedMode?: boolean;
        formatter?: (key: string) => string;
        borderWidth: number;
        borderColor: string;
      }[];
      series: { name: string }[];
    };
    expect(option.legend[0]?.selectedMode).toBe(false);
    expect(option.legend[0]?.formatter?.(option.series[0]!.name)).toBe("extra");
    expect(option.legend[0]?.borderWidth).toBe(0);
    expect(f.wrapper.find(".chart-content__legend-selection").exists()).toBe(true);
    const repaint = vi.spyOn(instance, "setOption");
    await f.wrapper.setProps({ selectedElement: { kind: "legend" } });
    expect(repaint).not.toHaveBeenCalled();
    repaint.mockRestore();
    const point = getChartLegendLayout(
      f.drawing.chart,
      {
        categories: ["red", "green", "blue"],
        records: [],
        series: [{ name: "extra", values: [15, 25, 35] }],
      },
      f.drawing,
    )!.bounds;
    const x = point.x + point.width / 2,
      y = point.y + point.height / 2;
    instance.getZr().trigger("click", { offsetX: x, offsetY: y });
    const canvas = f.wrapper.get(".chart-content__canvas").element;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 480,
      height: 300,
    } as DOMRect);
    canvas.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: x, clientY: y }));
    expect(f.wrapper.emitted("selectElement")).toEqual([
      [{ kind: "legend" }, false],
      [{ kind: "legend" }, true],
    ]);
    instance.trigger("legendscroll", { type: "legendscroll", scrollDataIndex: 1 });
    instance.getZr().trigger("click", { offsetX: 450, offsetY: 285 });
    await Promise.resolve();
    instance.getZr().trigger("dblclick", { offsetX: 450, offsetY: 285 });
    canvas.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 450, clientY: 285 }));
    expect(f.wrapper.emitted("selectElement")).toHaveLength(2);
    instance.setOption({ legend: { scrollDataIndex: 1 } });
    const beforeSelection = instance.getOption() as {
      legend: {
        left: number;
        top: number;
        width: number;
        height: number;
        scrollDataIndex: number;
      }[];
    };
    await f.wrapper.setProps({ selectedElement: { kind: "chart" } });
    const afterSelection = instance.getOption() as typeof beforeSelection;
    for (const key of ["left", "top", "width", "height", "scrollDataIndex"] as const)
      expect(afterSelection.legend[0]?.[key]).toEqual(beforeSelection.legend[0]?.[key]);
    expect(f.wrapper.find(".chart-content__legend-selection").exists()).toBe(false);
    await f.wrapper.setProps({
      drawing: { ...f.drawing, chart: { ...f.drawing.chart, legend: false } },
    });
    instance.getZr().trigger("click", { offsetX: x, offsetY: y });
    expect(f.wrapper.emitted("selectElement")).toHaveLength(2);
  });
  test("real DOM legend pointer input bypasses the outer drawing drag handler without cancelling native input", async () => {
    const f = fixture();
    await f.wrapper.setProps({ editableLegend: true });
    const canvas = f.wrapper.get(".chart-content__canvas").element;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 214,
      top: 193,
      width: 480,
      height: 300,
    } as DOMRect);
    const outer = document.createElement("div");
    outer.append(f.wrapper.element);
    const drag = vi.fn((event: Event) => event.preventDefault());
    outer.addEventListener("pointerdown", drag);
    const bounds = getChartLegendLayout(
      f.drawing.chart,
      {
        categories: ["red", "green", "blue"],
        records: [],
        series: [{ name: "extra", values: [15, 25, 35] }],
      },
      f.drawing,
    )!.bounds;
    const inside = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: 214 + bounds.x + bounds.width / 2,
      clientY: 193 + bounds.y + bounds.height / 2,
    });
    canvas.dispatchEvent(inside);
    expect(drag).not.toHaveBeenCalled();
    expect(inside.defaultPrevented).toBe(false);
    canvas.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: 220,
        clientY: 200,
      }),
    );
    expect(drag).toHaveBeenCalledOnce();
  });
  test("first legend selection may replace SVG children before native container double-click", async () => {
    const f = fixture();
    await f.wrapper.setProps({ editableLegend: true, selectedElement: { kind: "chart" } });
    const canvas = f.wrapper.get(".chart-content__canvas").element;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 480,
      height: 300,
    } as DOMRect);
    const bounds = getChartLegendLayout(
      f.drawing.chart,
      {
        categories: ["red", "green", "blue"],
        records: [],
        series: [{ name: "extra", values: [15, 25, 35] }],
      },
      f.drawing,
    )!.bounds;
    const x = bounds.x + bounds.width / 2,
      y = bounds.y + bounds.height / 2;
    const instance = rendered.instances.at(-1)!;
    const firstTarget = document.createElement("span");
    canvas.append(firstTarget);
    instance.getZr().trigger("click", { offsetX: x, offsetY: y });
    await f.wrapper.setProps({ selectedElement: { kind: "legend" } });
    firstTarget.remove();
    canvas.append(document.createElement("span"));
    instance.getZr().trigger("click", { offsetX: x, offsetY: y });
    canvas.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: x, clientY: y }));
    expect(f.wrapper.emitted("selectElement")).toEqual([
      [{ kind: "legend" }, false],
      [{ kind: "legend" }, false],
      [{ kind: "legend" }, true],
    ]);
  });
  test("two native legend clicks open once when SVG repaint prevents dblclick", async () => {
    const f = fixture();
    await f.wrapper.setProps({ editableLegend: true, selectedElement: { kind: "chart" } });
    const bounds = getChartLegendLayout(
      f.drawing.chart,
      {
        categories: ["red", "green", "blue"],
        records: [],
        series: [{ name: "extra", values: [15, 25, 35] }],
      },
      f.drawing,
    )!.bounds;
    const x = bounds.x + bounds.width / 2,
      y = bounds.y + bounds.height / 2;
    const instance = rendered.instances.at(-1)!;
    instance
      .getZr()
      .trigger("click", { offsetX: x, offsetY: y, event: new MouseEvent("click", { detail: 1 }) });
    await f.wrapper.setProps({ selectedElement: { kind: "legend" } });
    instance
      .getZr()
      .trigger("click", { offsetX: x, offsetY: y, event: new MouseEvent("click", { detail: 2 }) });
    expect(f.wrapper.emitted("selectElement")).toEqual([
      [{ kind: "legend" }, false],
      [{ kind: "legend" }, true],
    ]);
    const canvas = f.wrapper.get(".chart-content__canvas").element;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 480,
      height: 300,
    } as DOMRect);
    canvas.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: x, clientY: y }));
    expect(f.wrapper.emitted("selectElement")).toHaveLength(2);
    instance.trigger("legendscroll", { type: "legendscroll", scrollDataIndex: 1 });
    instance
      .getZr()
      .trigger("click", { offsetX: x, offsetY: y, event: new MouseEvent("click", { detail: 2 }) });
    expect(f.wrapper.emitted("selectElement")).toHaveLength(2);
  });
  test("selection outline preserves real legend fill, border and native page state", async () => {
    const f = fixture();
    const drawing = {
      ...f.drawing,
      chart: {
        ...f.drawing.chart,
        format: {
          legend: {
            text: { fontSize: 20, bold: true, italic: true },
            surface: { fill: "#fff4cc", stroke: "#b91c1c", strokeWidth: 5 },
          },
        },
      },
    };
    await f.wrapper.setProps({
      drawing,
      editableLegend: true,
      selectedElement: { kind: "legend" },
    });
    const instance = rendered.instances.at(-1)!;
    const read = () => (instance.getOption() as { legend: Record<string, unknown>[] }).legend[0]!;
    expect(read()).toMatchObject({
      borderWidth: 5,
      borderColor: "#b91c1c",
      backgroundColor: "#fff4cc",
    });
    expect(f.wrapper.find(".chart-content__legend-selection").exists()).toBe(true);
    const repaint = vi.spyOn(instance, "setOption");
    await f.wrapper.setProps({ selectedElement: { kind: "chart" } });
    expect(f.wrapper.find(".chart-content__legend-selection").exists()).toBe(false);
    await f.wrapper.setProps({ selectedElement: { kind: "legend" } });
    expect(repaint).not.toHaveBeenCalled();
    expect(read()).toMatchObject({
      borderWidth: 5,
      borderColor: "#b91c1c",
      backgroundColor: "#fff4cc",
    });
    expect(drawing.chart.format.legend.surface.stroke).toBe("#b91c1c");
  });

  test("preview legend retains native selection behavior", () => {
    const f = fixture();
    const option = rendered.instances.at(-1)!.getOption() as {
      legend: { selectedMode: boolean }[];
    };
    expect(option.legend[0]?.selectedMode).not.toBe(false);
    expect(f.wrapper.find(".chart-content__legend-selection").exists()).toBe(false);
  });
  test("native component events resolve stable elements and do not target a series index", async () => {
    const f = fixture(),
      instance = rendered.instances.at(-1)!;
    // Chart content must opt back into input beneath the drawing layer's
    // pointer-transparent common content wrapper.
    expect(f.wrapper.get(".chart-content").attributes("style")).toContain("pointer-events: auto");
    instance.trigger(
      "click",
      nativeEvent({ componentType: "series", seriesId: "extra", seriesIndex: 99 }),
    );
    expect(f.wrapper.emitted("selectElement")).toEqual([
      [{ kind: "series", seriesId: "extra" }, false],
    ]);
    instance.trigger(
      "dblclick",
      nativeEvent({ type: "dblclick", componentType: "yAxis", componentIndex: 0 }),
    );
    expect(f.wrapper.emitted("selectElement")?.at(-1)).toEqual([{ kind: "valueAxis" }, true]);
    instance.trigger(
      "click",
      nativeEvent({ componentType: "series", seriesIndex: 0, seriesId: "stale" }),
    );
    expect(f.wrapper.emitted("selectElement")).toHaveLength(2);
    const replacement = {
      ...f.drawing,
      chart: { ...f.drawing.chart, source: { ...f.source, series: [] } },
    };
    await f.wrapper.setProps({ drawing: replacement, revision: 1 });
    instance.trigger("click", nativeEvent({ componentType: "series", seriesId: "extra" }));
    expect(f.wrapper.emitted("selectElement")).toHaveLength(2);
  });
  test("actual chart title and value-axis format redraw without changing source", async () => {
    const f = fixture();
    await f.wrapper.setProps({
      drawing: {
        ...f.drawing,
        chart: {
          ...f.drawing.chart,
          format: {
            title: { color: "#ff0000", fontSize: 22, bold: true },
            valueAxis: {
              min: 20,
              max: 180,
              majorUnit: 40,
              minorUnit: 8,
              numberFormat: { kind: "number", fractionDigits: 1, useGrouping: false },
            },
          },
        },
      },
      revision: 1,
    });
    const svg = f.svg();
    expect(svg).toContain(">180.0<");
    expect(svg).toContain("#ff0000");
    expect(svg).toContain("22px");
    expect(f.wrapper.find(".chart-content__error").exists()).toBe(false);
  });
  test("word-cloud SVG also consumes saved title formatting and native title selection", async () => {
    const f = fixture();
    const { source: _source, ...unlinked } = f.drawing.chart;
    await f.wrapper.setProps({
      drawing: {
        ...f.drawing,
        chart: {
          ...unlinked,
          type: "wordCloud",
          dataCache: {
            categories: ["word"],
            series: [{ name: "weight", values: [20] }],
            records: [],
          },
          format: { title: { color: "#ff0000", fontSize: 22, bold: true, italic: true } },
        },
      },
      revision: 1,
    });
    const title = f.wrapper.findAll("svg text")[0]!;
    expect(title.attributes("font-size")).toBe("22");
    expect(title.attributes("fill")).toBe("#ff0000");
    expect(title.attributes("font-weight")).toBe("bold");
    await title.trigger("dblclick");
    expect(f.wrapper.emitted("selectElement")?.at(-1)).toEqual([{ kind: "title" }, true]);
  });

  test("passes the workbook resolver and redraws values, name and labels on revision", async () => {
    const f = fixture();
    expect(f.resolveSheet).toHaveBeenCalledWith(f.second.id);
    expect(f.wrapper.find(".chart-content__error").exists()).toBe(false);
    expect(f.svg()).toContain(">25<");
    setCellContent(f.second, { row: 0, column: 1 }, { kind: "literal", value: "revised" });
    setCellContent(f.second, { row: 2, column: 0 }, { kind: "literal", value: "changed" });
    setCellContent(f.second, { row: 2, column: 1 }, { kind: "literal", value: 125 });
    await f.wrapper.setProps({
      evaluator: createWorkbookEvaluator(f.workbook, f.sheet.id),
      revision: 1,
    });
    for (const text of ["revised", "changed", "125"]) expect(f.svg()).toContain(`>${text}<`);
    expect(f.svg()).not.toContain(">extra<");
    expect(f.svg()).toContain("#f59e0b");
  });

  test("removing the last explicit series retains its drawing and produces a blank interior", async () => {
    const f = fixture();
    const empty = {
      ...f.drawing,
      chart: { ...f.drawing.chart, source: { ...f.source, series: [] } },
    };
    await f.wrapper.setProps({ drawing: empty, revision: 1 });
    expect(f.wrapper.find(".chart-content__error").exists()).toBe(false);
    expect(f.wrapper.find(".chart-content__canvas").exists()).toBe(true);
    expect(f.wrapper.props("drawing")).toMatchObject({
      id: "chart-object",
      width: 480,
      height: 300,
      stroke: "#d1d5db",
      chart: { title: "Chart Title", source: { series: [] } },
    });
    expect(f.svg()).not.toContain("<text");
    expect(f.svg()).not.toContain("<path");
  });

  test("shows invalid source and clears stale graphics after a referenced sheet disappears", async () => {
    const f = fixture();
    f.workbook.sheets.delete(f.second.id);
    await f.wrapper.setProps({
      evaluator: createWorkbookEvaluator(f.workbook, f.sheet.id),
      revision: 1,
    });
    expect(f.wrapper.find(".chart-content__error").text()).toMatch(/source/i);
    expect(f.svg()).not.toContain(">extra<");
    expect(f.svg()).not.toContain(">25<");
  });

  test("all hidden values stay valid and recover original values/color when shown again", async () => {
    const f = fixture();
    f.second.hiddenColumns = new Set([1]);
    await f.wrapper.setProps({
      evaluator: createWorkbookEvaluator(f.workbook, f.sheet.id),
      revision: 1,
    });
    expect(f.wrapper.find(".chart-content__error").exists()).toBe(false);
    expect(f.svg()).not.toContain(">extra<");
    f.second.hiddenColumns.clear();
    await f.wrapper.setProps({
      evaluator: createWorkbookEvaluator(f.workbook, f.sheet.id),
      revision: 2,
    });
    expect(f.wrapper.find(".chart-content__error").exists()).toBe(false);
    expect(f.svg()).toContain(">extra<");
    expect(f.svg()).toContain(">25<");
    expect(f.svg()).toContain("#f59e0b");
  });

  test("shows invalid source for a broken reference, length mismatch and unsupported role", async () => {
    const f = fixture();
    for (const source of [
      {
        ...f.source,
        categories: { kind: "range" as const, sheetId: f.second.id, range: null },
      },
      {
        ...f.source,
        series: [{ ...f.source.series[0]!, values: { kind: "literal" as const, values: [1, 2] } }],
      },
    ]) {
      await f.wrapper.setProps({
        drawing: { ...f.drawing, chart: { ...f.drawing.chart, source } },
      });
      expect(f.wrapper.find(".chart-content__error").exists()).toBe(true);
    }
    await f.wrapper.setProps({
      drawing: { ...f.drawing, chart: { ...f.drawing.chart, type: "scatter" } },
    });
    expect(f.wrapper.find(".chart-content__error").exists()).toBe(true);
  });

  test("legacy null source remains invalid and a valid explicit source recovers", async () => {
    const f = fixture();
    const legacy = { ...f.drawing.chart };
    delete legacy.source;
    await f.wrapper.setProps({ drawing: { ...f.drawing, chart: legacy } });
    expect(f.wrapper.find(".chart-content__error").exists()).toBe(true);
    await f.wrapper.setProps({ drawing: f.drawing });
    expect(f.wrapper.find(".chart-content__error").exists()).toBe(false);
    expect(f.svg()).toContain(">extra<");
  });
});

test("table error cannot leak into a later invalid source or word-cloud render on the same component", async () => {
  const f = fixture();
  await f.wrapper.setProps({
    drawing: {
      ...f.drawing,
      chart: { ...f.drawing.chart, elements: { dataTable: "withLegendKeys" } },
    },
  });
  expect(f.wrapper.text()).toContain("data table");
  await f.wrapper.setProps({
    drawing: {
      ...f.drawing,
      chart: {
        ...f.drawing.chart,
        source: {
          ...f.source,
          categories: {
            kind: "range",
            sheetId: "deleted",
            range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
          },
        },
      },
    },
  });
  expect(f.wrapper.text()).not.toContain("data table");
  const { source: _source, ...unlinked } = f.drawing.chart;
  await f.wrapper.setProps({
    drawing: {
      ...f.drawing,
      chart: {
        ...unlinked,
        type: "wordCloud",
        dataCache: { categories: ["word"], series: [{ name: "weight", values: [4] }], records: [] },
        range: null,
      },
    },
  });
  expect(f.wrapper.find(".chart-content__error").exists()).toBe(false);
});
