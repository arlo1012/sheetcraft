import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { EChartsOption, EChartsType } from "echarts";
import { use } from "echarts/core";
import { GraphicComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import {
  CHART_DATA_TABLE_GRAPHIC_ID,
  applyChartDataTableGraphics,
  createChartDataTablePlan,
  prepareChartDataTableOption,
} from "../../../modules/charts/chart-data-table";
import { createChartOption } from "../../../modules/charts/chart-option";
import { init } from "../../../modules/charts/chart-runtime";
import * as chartRuntime from "../../../modules/charts/chart-runtime";
import { preflightChartDataTable } from "../../../modules/charts/chart-data-table-preflight";

use([GraphicComponent, CanvasRenderer]);
const chart: SheetChart = {
  type: "column",
  range: null,
  title: "Chart Title",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: false,
  labels: false,
  stacked: false,
  showHidden: false,
  elements: { dataTable: "withLegendKeys" },
};
const data: ChartData = {
  categories: ["east", "north", "south"],
  series: [
    { id: "apple", name: "apple", colorIndex: 0, values: [60, 100, 120] },
    { id: "pear", name: "pear", colorIndex: 1, values: [70, 80, 90] },
  ],
  records: [],
};
const dimensions = { width: 640, height: 400 };
type Primitive = {
  id?: string;
  parentId?: string;
  type?: string;
  children?: Primitive[];
  shape?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    x1?: number;
    x2?: number;
    y1?: number;
    y2?: number;
  };
  style?: { text?: string; x?: number; y?: number; fill?: string; fontFamily?: string };
};
function tableElements(instance: EChartsType): Primitive[] {
  const entries =
    (instance.getOption().graphic as Array<{ elements: Primitive[] }> | undefined)?.flatMap(
      (component) => component.elements,
    ) ?? [];
  const group = entries.find((entry) => entry.id === CHART_DATA_TABLE_GRAPHIC_ID);
  if (!group) return [];
  return (
    group.children ?? entries.filter((entry) => entry.parentId === CHART_DATA_TABLE_GRAPHIC_ID)
  );
}
const instances: EChartsType[] = [];
function baseInstance(renderer: "svg" | "canvas" = "svg", size = dimensions): EChartsType {
  const instance = init(renderer === "svg" ? null : document.createElement("canvas"), undefined, {
    renderer,
    ssr: renderer === "svg",
    ...size,
  });
  instances.push(instance);
  return instance;
}
function render(
  value = chart,
  source = data,
  size = dimensions,
  resolveFontFamily?: (family: string) => string,
  renderer: "svg" | "canvas" = "svg",
) {
  const plan = createChartDataTablePlan(value, source, { ...size, resolveFontFamily });
  const option = prepareChartDataTableOption(createChartOption(value, source, size), plan);
  const instance = baseInstance(renderer, size);
  instance.setOption(option, { notMerge: true, lazyUpdate: false, silent: true });
  instance.getZr().flush();
  applyChartDataTableGraphics(instance, plan);
  instance.getZr().flush();
  return { instance, plan, option };
}
function svg(instance: EChartsType) {
  const markup = instance.renderToSVGString();
  expect(markup).not.toMatch(/NaN|Infinity/);
  return new DOMParser().parseFromString(markup, "text/html");
}
beforeEach(() => {
  const contexts = new Map<HTMLCanvasElement, CanvasRenderingContext2D>();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
    kind: string,
  ) {
    if (kind !== "2d") return null;
    if (!contexts.has(this)) contexts.set(this, recordingContext(this));
    return contexts.get(this)!;
  });
});
afterEach(() => {
  for (const instance of instances.splice(0)) if (!instance.isDisposed()) instance.dispose();
  vi.restoreAllMocks();
});

describe("installed ECharts SVG data table scene", () => {
  test("E05 baseline has real native grid/text/key primitives and each complete value aligned to native categories", () => {
    const original = structuredClone(data),
      originalChart = structuredClone(chart);
    const { instance } = render({ ...chart, format: { valueAxis: { title: "Axis Title" } } });
    const document = svg(instance),
      texts = Array.from(document.querySelectorAll("text"));
    for (const text of [
      "east",
      "north",
      "south",
      "apple",
      "pear",
      "60",
      "100",
      "120",
      "70",
      "80",
      "90",
      "Axis Title",
    ]) {
      const tableTexts = tableElements(instance).filter((entry) => entry.style?.text === text);
      if (text === "Axis Title")
        expect(texts.filter((node) => node.textContent === text)).toHaveLength(1);
      else expect(tableTexts).toHaveLength(1);
      if (data.categories.includes(text) || ["apple", "pear"].includes(text))
        expect(texts.filter((node) => node.textContent === text)).toHaveLength(1);
    }
    const primitives = tableElements(instance);
    expect(primitives.filter((entry) => entry.type === "line")).toHaveLength(9);
    expect(primitives.filter((entry) => entry.type === "rect")).toHaveLength(3);
    expect(primitives.filter((entry) => entry.type === "text")).toHaveLength(11);
    for (const [ordinal, text] of ["60", "100", "120"].entries()) {
      expect(primitives.find((entry) => entry.style?.text === text)?.style?.x).toBeCloseTo(
        instance.convertToPixel({ xAxisIndex: 0 }, ordinal) as number,
        6,
      );
    }
    expect(document.querySelectorAll("path").length).toBeGreaterThan(6);
    expect(data).toEqual(original);
    expect(chart).toEqual(originalChart);
  });

  test.each(["column", "line", "area"] as const)(
    "%s supports single, duplicate and numeric category labels using integer ordinal conversion",
    (type) => {
      for (const categories of [["one"], ["same", "same", "42"]]) {
        const source: ChartData = {
          categories,
          series: [{ name: "only", values: categories.map((_, index) => 21 + index) }],
          records: [],
        };
        const plan = createChartDataTablePlan({ ...chart, type }, source, dimensions)!;
        const instance = baseInstance();
        instance.setOption(
          prepareChartDataTableOption(
            createChartOption({ ...chart, type }, source, dimensions),
            plan,
          ),
        );
        const convert = vi.spyOn(instance, "convertToPixel");
        applyChartDataTableGraphics(instance, plan);
        expect(
          convert.mock.calls.every(
            ([, value]) => typeof value === "number" && Number.isInteger(value),
          ),
        ).toBe(true);
        expect(tableElements(instance).filter((entry) => entry.type === "text")).toHaveLength(
          categories.length * 2 + 1,
        );
        expect(svg(instance).querySelector("text")).not.toBeNull();
      }
    },
  );

  test("reversed category order and secondary percentage series keep raw values and exact stable-id paints", () => {
    const value: SheetChart = {
      ...chart,
      stacked: true,
      presentation: { percentStacked: true, palette: ["#123456", "#654321"] },
      format: {
        categoryAxis: { reverse: true },
        valueAxis: { min: 0, max: 100 },
        series: [{ id: "pear", axis: "secondary", color: "#aabbcc" }],
      },
    };
    const { instance } = render(value);
    const table = tableElements(instance);
    const headers = table
      .filter((entry) => data.categories.includes(entry.style?.text ?? ""))
      .sort((a, b) => a.style!.x! - b.style!.x!);
    expect(headers.map((entry) => entry.style?.text)).toEqual(["south", "north", "east"]);
    const numeric = table
      .filter((entry) => ["60", "100", "120"].includes(entry.style?.text ?? ""))
      .sort((a, b) => a.style!.x! - b.style!.x!);
    expect(numeric.map((entry) => entry.style?.text)).toEqual(["120", "100", "60"]);
    const keys = table.filter((entry) => entry.type === "rect" && entry.shape?.width === 10);
    expect(keys.map((entry) => entry.style?.fill)).toEqual([
      instance.getVisual({ seriesIndex: 0 }, "color"),
      instance.getVisual({ seriesIndex: 1 }, "color"),
    ]);
    expect(keys[1]?.style?.fill).toBe("#aabbcc");
    for (let ordinal = 0; ordinal < 3; ordinal++)
      expect(instance.convertToPixel({ xAxisIndex: 0 }, ordinal)).toBeCloseTo(
        instance.convertToPixel({ xAxisIndex: 1 }, ordinal) as number,
        6,
      );
    expect(data.series[0]!.values).toEqual([60, 100, 120]);
  });

  test("duplicate/name-cached automatic colors, explicit colors, reordered IDs and all-null rows use actual series visuals", () => {
    const source: ChartData = {
      categories: ["x", "y"],
      series: [
        { id: "explicit", name: "custom", colorIndex: 4, values: [2, 3] },
        { id: "automatic-a", name: "duplicate", values: [null, null] },
        { id: "automatic-b", name: "duplicate", values: [4, 5] },
      ],
      records: [],
    };
    const { instance } = render(
      { ...chart, format: { series: [{ id: "explicit", color: "#010203" }] } },
      source,
    );
    const keys = tableElements(instance).filter(
      (entry) => entry.type === "rect" && entry.shape?.width === 10,
    );
    expect(keys.map((entry) => entry.style?.fill)).toEqual(
      source.series.map((_, seriesIndex) => instance.getVisual({ seriesIndex }, "color")),
    );
    expect(keys.map((entry) => entry.style?.fill)).toEqual(["#010203", "#2563eb", "#2563eb"]);
    expect(
      tableElements(instance).filter((entry) => entry.style?.text === "duplicate"),
    ).toHaveLength(2);
  });

  test("hidden non-zero probes do not change real axes, series geometry, scale or zero crossings", () => {
    for (const values of [
      [-4, 0, 8],
      [2, 4, 8],
    ]) {
      const source: ChartData = {
        ...data,
        series: [
          { ...data.series[0]!, values },
          { ...data.series[1]!, values: [6, 8, 12] },
        ],
      };
      const value: SheetChart = {
        ...chart,
        format: {
          valueAxis: { reverse: true },
          categoryAxis: { reverse: true },
          series: [{ id: "pear", axis: "secondary" }],
        },
      };
      const plan = createChartDataTablePlan(value, source, dimensions)!;
      const prepared = prepareChartDataTableOption(
        createChartOption(value, source, dimensions),
        plan,
      );
      const withProbe = baseInstance(),
        withoutProbe = baseInstance();
      withProbe.setOption(prepared);
      const x = prepared.xAxis as unknown[],
        y = prepared.yAxis as unknown[];
      withoutProbe.setOption({
        ...prepared,
        xAxis: x.slice(0, -1),
        yAxis: y.slice(0, -1),
      } as EChartsOption);
      expect(
        withProbe
          .renderToSVGString()
          .replace(/zr\d+/g, "native")
          .replace(/cls-\d+/g, "cls"),
      ).toBe(
        withoutProbe
          .renderToSVGString()
          .replace(/zr\d+/g, "native")
          .replace(/cls-\d+/g, "cls"),
      );
      for (let ordinal = 0; ordinal < 3; ordinal++) {
        for (const seriesIndex of [0, 1])
          expect(
            withProbe.convertToPixel({ seriesIndex }, [
              ordinal,
              source.series[seriesIndex]!.values[ordinal]!,
            ]),
          ).toEqual(
            withoutProbe.convertToPixel({ seriesIndex }, [
              ordinal,
              source.series[seriesIndex]!.values[ordinal]!,
            ]),
          );
      }
      const before = [0, 1, 2].map((ordinal) =>
        withProbe.convertToPixel({ xAxisIndex: 0 }, ordinal),
      );
      applyChartDataTableGraphics(withProbe, plan);
      expect(
        [0, 1, 2].map((ordinal) => withProbe.convertToPixel({ xAxisIndex: 0 }, ordinal)),
      ).toEqual(before);
    }
  });

  test("native endpoint geometry uses complete cells, and singleton uses the native plot span", () => {
    const value = { ...chart, type: "line" as const };
    const plan = createChartDataTablePlan(value, data, dimensions)!;
    const option = createChartOption(value, data, dimensions);
    const xAxis = option.xAxis as { type: "category"; data: string[] };
    const instance = baseInstance();
    instance.setOption(
      prepareChartDataTableOption({ ...option, xAxis: { ...xAxis, boundaryGap: false } }, plan),
    );
    applyChartDataTableGraphics(instance, plan);
    const vertical = tableElements(instance).filter(
      (entry) => entry.type === "line" && entry.shape?.x1 === entry.shape?.x2,
    );
    const positions = vertical.map((entry) => entry.shape!.x1!);
    const first = instance.convertToPixel({ xAxisIndex: 0 }, 0) as number;
    const next = instance.convertToPixel({ xAxisIndex: 0 }, 1) as number;
    expect(positions[1]).toBeCloseTo(first - (next - first) / 2, 6);
    expect(positions.every((position) => position >= 8 && position <= 632)).toBe(true);
  });

  test("off, empty, dormant type and failed pass 2 erase the owned scene and preserve unrelated graphics", () => {
    const { instance, plan } = render();
    instance.setOption({
      graphic: {
        elements: [{ id: "unrelated", type: "rect", shape: { x: 2, y: 2, width: 1, height: 1 } }],
      },
    });
    expect(
      () => applyChartDataTableGraphics(instance, undefined),
      "first owned clear",
    ).not.toThrow();
    expect(tableElements(instance)).toEqual([]);
    expect(
      (instance.getOption().graphic as Array<{ elements: Primitive[] }>)[0]!.elements.some(
        (entry) => entry.id === "unrelated",
      ),
    ).toBe(true);
    expect(() => applyChartDataTableGraphics(instance, plan), "rebuild after clear").not.toThrow();
    expect(tableElements(instance).length).toBeGreaterThan(0);
    vi.spyOn(instance, "convertToPixel").mockReturnValue(NaN);
    expect(() => applyChartDataTableGraphics(instance, plan)).toThrow(
      /coordinates are unavailable/,
    );
    expect(tableElements(instance)).toEqual([]);
    expect(createChartDataTablePlan({ ...chart, type: "bar" }, data, dimensions)).toBeUndefined();
  });

  test("full numeric text must fit final contained columns; no clipped first-N or microscopic scene survives", () => {
    const source: ChartData = {
      categories: ["a", "b", "c"],
      series: [{ name: "wide", values: [1.2345678901234567e100, 2, 3] }],
      records: [],
    };
    const plan = createChartDataTablePlan(chart, source, dimensions)!;
    const instance = baseInstance();
    instance.setOption(
      prepareChartDataTableOption(createChartOption(chart, source, dimensions), plan),
    );
    const converted = instance.convertToPixel.bind(instance);
    vi.spyOn(instance, "convertToPixel").mockImplementation((finder, value) => {
      if (
        typeof finder === "object" &&
        "xAxisIndex" in finder &&
        finder.xAxisIndex === 0 &&
        typeof value === "number"
      )
        return 300 + value * 50;
      const scalarValue: unknown = value;
      if (typeof finder === "object" && "xAxisIndex" in finder && finder.xAxisIndex === 1)
        return typeof scalarValue === "number" && scalarValue === 1 ? 275 : 425;
      return converted(finder, value);
    });
    expect(() => applyChartDataTableGraphics(instance, plan)).toThrow(/numeric text does not fit/);
    expect(tableElements(instance)).toEqual([]);
  });
});

type Paint = { text?: string; fill: unknown; font: string; path?: number[][] };
const paints: Paint[] = [];
const measures: Array<{ text: string; font: string }> = [];
function recordingContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  let path: number[][] = [];
  const state: Partial<CanvasRenderingContext2D> = {
    canvas,
    font: "10px sans-serif",
    fillStyle: "#000000",
    strokeStyle: "#000000",
    globalAlpha: 1,
    textAlign: "start",
    textBaseline: "alphabetic",
    save() {},
    restore() {},
    setTransform() {},
    transform() {},
    translate() {},
    scale() {},
    rotate() {},
    clip() {},
    clearRect() {},
    setLineDash() {},
    getLineDash: () => [],
    beginPath() {
      path = [];
    },
    closePath() {},
    moveTo(x, y) {
      path.push([x, y]);
    },
    lineTo(x, y) {
      path.push([x, y]);
    },
    rect(x, y, width, height) {
      path.push([x, y, width, height]);
    },
    arc() {},
    bezierCurveTo() {},
    quadraticCurveTo() {},
    fill() {
      paints.push({ fill: state.fillStyle, font: state.font!, path: [...path] });
    },
    stroke() {
      paints.push({ fill: state.strokeStyle, font: state.font!, path: [...path] });
    },
    fillRect(x, y, width, height) {
      paints.push({ fill: state.fillStyle, font: state.font!, path: [[x, y, width, height]] });
    },
    fillText(text) {
      paints.push({ text, fill: state.fillStyle, font: state.font! });
    },
    strokeText() {},
    measureText(text) {
      const font = state.font!;
      measures.push({ text, font });
      const size = Number(/([\d.]+)px/.exec(font)?.[1] ?? 10);
      return { width: [...text].length * size * 0.6 } as TextMetrics;
    },
    createLinearGradient() {
      return { addColorStop() {} } as CanvasGradient;
    },
    createRadialGradient() {
      return { addColorStop() {} } as CanvasGradient;
    },
    drawImage() {},
  };
  return state as CanvasRenderingContext2D;
}

describe("installed ECharts Canvas table scene and mapped fonts", () => {
  beforeEach(() => {
    paints.length = 0;
    measures.length = 0;
    const contexts = new Map<HTMLCanvasElement, CanvasRenderingContext2D>();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
      this: HTMLCanvasElement,
      kind: string,
    ) {
      if (kind !== "2d") return null;
      if (!contexts.has(this)) contexts.set(this, recordingContext(this));
      return contexts.get(this)!;
    });
  });
  test("same complete scene paints actual table text/keys with alias families before measurement and paint", () => {
    const source: ChartData = {
      categories: ["Unique Canvas East", "Unique Canvas North"],
      series: [
        {
          id: "sales",
          name: "Canvas Sales",
          values: [13579.25, null],
          numberFormat: { kind: "number", fractionDigits: 2, useGrouping: true },
        },
      ],
      records: [],
    };
    const value: SheetChart = {
      ...chart,
      presentation: { background: "#202936" },
      format: {
        categoryAxis: { text: { fontFamily: "Source Local Face" } },
        series: [{ id: "sales", color: "#ab12cd" }],
      },
    };
    const original = structuredClone(source);
    const { instance, plan } = render(
      value,
      source,
      dimensions,
      () => "Verified Canvas Table Face",
      "canvas",
    );
    const scene = tableElements(instance);
    expect(
      scene.filter((entry) => entry.type === "text").map((entry) => entry.style?.text),
    ).toEqual(["Unique Canvas East", "Unique Canvas North", "Canvas Sales", "13,579.25"]);
    const tableTexts = scene
      .filter((entry) => entry.type === "text")
      .map((entry) => entry.style!.text!);
    for (const text of tableTexts) {
      expect(
        paints.some(
          (paint) =>
            paint.text === text &&
            paint.font.includes("Verified Canvas Table Face") &&
            paint.fill === "#e8eef7",
        ),
      ).toBe(true);
      expect(
        measures.some(
          (measurement) =>
            measurement.text === text && measurement.font.includes("Verified Canvas Table Face"),
        ),
      ).toBe(true);
    }
    expect(
      scene.find((entry) => entry.type === "rect" && entry.shape?.width === 10)?.style?.fill,
    ).toBe("#ab12cd");
    expect(plan?.fontSize).toBe(12);
    expect(source).toEqual(original);
  });
});

describe("complete table native preflight", () => {
  test("second-pass numeric fit failure disposes detached native engine and leaves source untouched", () => {
    const source: ChartData = {
      categories: ["a", "b", "c"],
      series: [
        { name: "wide", values: [1, 2, 3], numberFormat: { kind: "custom", code: "0".repeat(40) } },
      ],
      records: [],
    };
    const before = structuredClone(source);
    expect(createChartDataTablePlan(chart, source, dimensions)).toBeDefined();
    const engines: EChartsType[] = [];
    const actual = chartRuntime.init;
    vi.spyOn(chartRuntime, "init").mockImplementation((...args: Parameters<typeof actual>) => {
      const engine = actual(...args);
      engines.push(engine);
      return engine;
    });
    expect(() => preflightChartDataTable(chart, source, dimensions)).toThrow(
      /numeric text does not fit/,
    );
    expect(engines).toHaveLength(1);
    expect(engines[0]!.isDisposed()).toBe(true);
    expect(source).toEqual(before);
    preflightChartDataTable(chart, data, dimensions);
    expect(engines).toHaveLength(2);
    expect(engines.every((engine) => engine.isDisposed())).toBe(true);
  });
});
