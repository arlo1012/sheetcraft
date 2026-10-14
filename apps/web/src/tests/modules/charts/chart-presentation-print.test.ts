import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  EChartsOption,
  SeriesOption,
  XAXisComponentOption,
  YAXisComponentOption,
} from "echarts";
import { getInstanceByDom } from "echarts/core";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import * as chartRuntime from "../../../modules/charts/chart-runtime";
import { applyChartDesignIntent } from "../../../modules/charts/chart-design-intents";
import {
  renderChartPrintPresentation,
  type ChartPrintPresentation,
} from "../../../modules/charts/chart-print-presentation";

type Paint = {
  operation: "fill" | "stroke" | "text" | "rect";
  color: string | CanvasGradient | CanvasPattern;
  text?: string;
  width?: number;
  height?: number;
  path?: string[];
};

/** Only the native DOM canvas boundary is recorded; ECharts models and paint stay real. */
class PrintCanvasRecorder {
  readonly paints: Paint[] = [];
  readonly copies: Array<{ source: HTMLCanvasElement; paints: Paint[] }> = [];
  readonly context: CanvasRenderingContext2D;
  path: string[] = [];
  failCopy = false;

  constructor(readonly canvas: HTMLCanvasElement) {
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
      beginPath: () => {
        this.path = [];
      },
      closePath: () => {
        this.path.push("close");
      },
      moveTo: (x, y) => {
        this.path.push(`move:${x},${y}`);
      },
      lineTo: (x, y) => {
        this.path.push(`line:${x},${y}`);
      },
      rect: (x, y, width, height) => {
        this.path.push(`rect:${x},${y},${width},${height}`);
      },
      arc: (x, y, radius) => {
        this.path.push(`arc:${x},${y},${radius}`);
      },
      bezierCurveTo() {},
      quadraticCurveTo() {},
      fill: () => {
        this.paints.push({ operation: "fill", color: state.fillStyle ?? "", path: [...this.path] });
      },
      stroke: () => {
        this.paints.push({
          operation: "stroke",
          color: state.strokeStyle ?? "",
          path: [...this.path],
        });
      },
      fillRect: (_x, _y, width, height) => {
        this.paints.push({ operation: "rect", color: state.fillStyle ?? "", width, height });
      },
      fillText: (text) => {
        this.paints.push({ operation: "text", color: state.fillStyle ?? "", text });
      },
      strokeText() {},
      measureText: (text) => {
        const size = Number(/([\d.]+)px/.exec(state.font ?? "")?.[1] ?? 10);
        const width = [...text].length * size * 0.6;
        return {
          width,
          actualBoundingBoxLeft: 0,
          actualBoundingBoxRight: width,
          actualBoundingBoxAscent: size * 0.8,
          actualBoundingBoxDescent: size * 0.2,
          fontBoundingBoxAscent: size,
          fontBoundingBoxDescent: 0,
          emHeightAscent: size,
          emHeightDescent: 0,
          hangingBaseline: 0,
          alphabeticBaseline: 0,
          ideographicBaseline: 0,
        };
      },
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      drawImage: (source) => {
        if (this.failCopy) throw new Error("Presentation copy failed");
        if (!(source instanceof HTMLCanvasElement)) throw new Error("Expected a native canvas");
        const recorder = contexts.get(source);
        if (!recorder) throw new Error("Missing native canvas recorder");
        this.copies.push({ source, paints: recorder.paints.map((paint) => ({ ...paint })) });
      },
    };
    this.context = state as CanvasRenderingContext2D;
  }
}

let contexts: Map<HTMLCanvasElement, PrintCanvasRecorder>;
let instances: chartRuntime.EChartsType[];
let nativeOptions: EChartsOption[];
const options = { document, width: 480, height: 300, density: 2 };
const source: ChartData = {
  categories: ["Alpha", "Beta"],
  series: [
    { id: "a", colorIndex: 0, name: "Duplicate", values: [25, 75] },
    { id: "b", colorIndex: 1, name: "Duplicate", values: [75, 25] },
  ],
  records: [],
};

function drawing(changes: Partial<SheetChart> = {}): SheetChartDrawing {
  return {
    id: "print-presentation",
    kind: "chart",
    name: "Presentation",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 480,
    height: 300,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#000000",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
    chart: {
      type: "column",
      range: null,
      title: "",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: false,
      labels: false,
      stacked: true,
      showHidden: false,
      ...changes,
    },
  };
}

function lastNativeOption(): EChartsOption {
  const option = nativeOptions.at(-1);
  if (!option) throw new Error("No actual native setOption/flush completed");
  return option;
}

function nativeSeries(): SeriesOption[] {
  const series = lastNativeOption().series;
  return series ? (Array.isArray(series) ? series : [series]) : [];
}

function nativeAxes(
  dimension: "xAxis" | "yAxis",
): Array<XAXisComponentOption | YAXisComponentOption> {
  const axis = lastNativeOption()[dimension];
  return axis ? (Array.isArray(axis) ? axis : [axis]) : [];
}

function outputRecorder(result: ChartPrintPresentation): PrintCanvasRecorder {
  const recorder = contexts.get(result.canvas);
  if (!recorder) throw new Error("Missing detached output recorder");
  return recorder;
}

function copiedPaints(result: ChartPrintPresentation): Paint[] {
  const copy = outputRecorder(result).copies[0];
  if (!copy) throw new Error("Native canvas was not copied");
  return copy.paints;
}

beforeEach(() => {
  contexts = new Map();
  instances = [];
  nativeOptions = [];
  const realInit = chartRuntime.init;
  vi.spyOn(chartRuntime, "init").mockImplementation((...args: Parameters<typeof realInit>) => {
    const instance = realInit(...args);
    instances.push(instance);
    const zr = instance.getZr(),
      flush = zr.flush.bind(zr);
    vi.spyOn(zr, "flush").mockImplementation(() => {
      flush();
      // Snapshot the real normalized engine option while the model is still alive.
      nativeOptions.push(instance.getOption() as EChartsOption);
    });
    return instance;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
    kind: string,
  ) {
    if (kind !== "2d") return null;
    let recorder = contexts.get(this);
    if (!recorder) {
      recorder = new PrintCanvasRecorder(this);
      contexts.set(this, recorder);
    }
    return recorder.context;
  });
});

afterEach(() => {
  for (const instance of instances) if (!instance.isDisposed()) instance.dispose();
  vi.restoreAllMocks();
});

describe("native print chart-wide presentation", () => {
  test.each(["column", "bar", "line", "area"] as const)(
    "%s sends finite signed/null/extreme ratios to the actual native engine, per stable-ID axis group",
    (type) => {
      const values: ChartData = {
        categories: ["Signed", "Missing", "Zero", "Overflow", "Subnormal"],
        series: [
          {
            id: "s-small",
            colorIndex: 2,
            name: "Duplicate",
            values: [2, null, 0, Number.MAX_VALUE, Number.MIN_VALUE],
          },
          {
            id: "p-large",
            colorIndex: 1,
            name: "Duplicate",
            values: [-3, 1, 0, Number.MAX_VALUE, -Number.MIN_VALUE],
          },
          {
            id: "s-large",
            colorIndex: 3,
            name: "Duplicate",
            values: [6, 4, 0, Number.MAX_VALUE, Number.MIN_VALUE],
          },
          {
            id: "p-small",
            colorIndex: 0,
            name: "Duplicate",
            values: [1, null, 0, Number.MAX_VALUE, Number.MIN_VALUE],
          },
        ],
        records: [],
      };
      const item = drawing({
        type,
        presentation: { percentStacked: true },
        format: {
          // Order intentionally differs from the detached source; names all collide.
          series: [
            { id: "s-large", axis: "secondary" },
            { id: "s-small", axis: "secondary" },
          ],
        },
      });
      const before = structuredClone({ item, values });
      for (const series of values.series) Object.freeze(series.values);
      Object.freeze(values.series);
      const result = renderChartPrintPresentation(item, values, options);
      try {
        const expected = [
          { id: "s-small", data: [0.25, null, 0, 0.5, 0.5], stack: "secondary-total" },
          { id: "p-large", data: [-0.75, 1, 0, 0.5, -0.5], stack: "primary-total" },
          { id: "s-large", data: [0.75, 1, 0, 0.5, 0.5], stack: "secondary-total" },
          { id: "p-small", data: [0.25, null, 0, 0.5, 0.5], stack: "primary-total" },
        ];
        expect(nativeSeries()).toMatchObject(expected);
        const valueAxis = type === "bar" ? "xAxisIndex" : "yAxisIndex";
        expect(
          nativeSeries().map((series) => Object.getOwnPropertyDescriptor(series, valueAxis)?.value),
        ).toEqual([1, 0, 1, 0]);
        const paints = copiedPaints(result);
        expect(
          paints.some((paint) => paint.operation === "fill" || paint.operation === "stroke"),
        ).toBe(true);
        expect(
          paints.some((paint) => paint.operation === "text" && paint.text?.endsWith("%")),
        ).toBe(true);
        expect(paints.flatMap((paint) => paint.path ?? []).join(" ")).not.toMatch(/NaN|Infinity/);
        expect({ item, values }).toEqual(before);
        expect(instances).toHaveLength(1);
        expect(instances[0]!.isDisposed()).toBe(true);
      } finally {
        result.dispose();
      }
    },
  );

  test("manual percentage-point axis controls paint percentage ticks while labels retain raw currency", () => {
    const values: ChartData = {
      ...source,
      series: source.series.map((series) => ({
        ...series,
        numberFormat: { kind: "currency" as const, currency: "USD", fractionDigits: 2 },
      })),
    };
    const item = drawing({
      labels: true,
      presentation: { percentStacked: true },
      format: {
        valueAxis: {
          min: -100,
          max: 100,
          majorUnit: 25,
          minorUnit: 5,
          linkedToSource: true,
          numberFormat: { kind: "currency", currency: "USD", fractionDigits: 2 },
        },
      },
    });
    const before = structuredClone(item);
    const result = renderChartPrintPresentation(item, values, options);
    try {
      expect(nativeAxes("yAxis")[0]).toMatchObject({
        min: -1,
        max: 1,
        interval: 0.25,
        minorTick: { show: true, splitNumber: 5 },
        minorSplitLine: { show: true },
      });
      const texts = copiedPaints(result)
        .filter((paint) => paint.operation === "text")
        .map((paint) => paint.text);
      expect(texts).toEqual(expect.arrayContaining(["-100%", "0%", "100%", "$25.00", "$75.00"]));
      expect(texts).not.toContain("$0.25");
      const bar = nativeSeries()[0];
      if (bar?.type !== "bar") throw new Error("Expected a real native bar series");
      const tooltip = bar.tooltip?.valueFormatter;
      if (typeof tooltip !== "function") throw new Error("Missing raw tooltip formatter");
      expect(tooltip(0.25, 0)).toBe("$25.00");
      expect(tooltip(0.75, 1)).toBe("$75.00");
      expect(item).toEqual(before);
    } finally {
      result.dispose();
    }
  });

  test("secondary percentage-point controls use their own converted native axis", () => {
    const result = renderChartPrintPresentation(
      drawing({
        type: "bar",
        presentation: { percentStacked: true },
        format: {
          valueAxis: { min: 0, max: 100, majorUnit: 25, minorUnit: 5 },
          secondaryValueAxis: { min: 0, max: 100, majorUnit: 50, minorUnit: 10 },
          series: [{ id: "b", axis: "secondary" }],
        },
      }),
      source,
      options,
    );
    try {
      expect(nativeAxes("xAxis")).toMatchObject([
        { min: 0, max: 1, interval: 0.25, minorTick: { show: true, splitNumber: 5 } },
        { min: 0, max: 1, interval: 0.5, minorTick: { show: true, splitNumber: 5 } },
      ]);
      expect(nativeSeries()).toMatchObject([{ data: [1, 1] }, { data: [1, 1] }]);
      expect(
        copiedPaints(result)
          .filter((paint) => paint.operation === "text")
          .map((paint) => paint.text),
      ).toContain("50%");
    } finally {
      result.dispose();
    }
  });

  test("native paint keeps explicit palette slots after reordering and per-series color overrides", () => {
    const values: ChartData = {
      ...source,
      series: [source.series[1]!, source.series[0]!],
    };
    const result = renderChartPrintPresentation(
      drawing({
        stacked: false,
        presentation: { palette: ["#123456", "#654321"], background: "#172635" },
        format: { series: [{ id: "a", color: "#aabbcc" }] },
      }),
      values,
      options,
    );
    try {
      expect(nativeSeries()).toMatchObject([
        { id: "b", itemStyle: { color: "#654321" } },
        { id: "a", itemStyle: { color: "#aabbcc" } },
      ]);
      const output = outputRecorder(result);
      expect(output.paints[0]).toMatchObject({
        operation: "rect",
        color: "#172635",
        width: 960,
        height: 600,
      });
      expect(lastNativeOption().backgroundColor).toBe("#172635");
      const paints = copiedPaints(result);
      expect(
        paints.filter((paint) => paint.operation === "fill" && paint.color === "#654321"),
      ).toHaveLength(2);
      expect(
        paints.filter((paint) => paint.operation === "fill" && paint.color === "#aabbcc"),
      ).toHaveLength(2);
      expect(paints.some((paint) => paint.operation === "rect" && paint.color === "#172635")).toBe(
        true,
      );
    } finally {
      result.dispose();
    }
  });

  test("global line-marker choices change actual native symbol painting", () => {
    const values: ChartData = { ...source, series: [{ id: "a", name: "Line", values: [10, 20] }] };
    const symbolPaints: number[] = [];
    for (const lineMarkers of [false, true]) {
      const result = renderChartPrintPresentation(
        drawing({
          type: "line",
          stacked: false,
          presentation: { lineMarkers, palette: ["#123456"] },
        }),
        values,
        options,
      );
      try {
        expect(nativeSeries()[0]).toMatchObject({ type: "line", showSymbol: lineMarkers });
        symbolPaints.push(
          copiedPaints(result).filter((paint) =>
            paint.path?.some((part) => part.startsWith("arc:")),
          ).length,
        );
        expect(
          copiedPaints(result).some(
            (paint) => paint.operation === "stroke" && paint.color === "#123456",
          ),
        ).toBe(true);
      } finally {
        result.dispose();
      }
    }
    expect(symbolPaints[0]).toBe(0);
    expect(symbolPaints[1]).toBeGreaterThan(0);
  });

  test("word-cloud print shares the explicit palette and opaque nonwhite background", () => {
    const result = renderChartPrintPresentation(
      drawing({
        type: "wordCloud",
        presentation: { background: "#172635", palette: ["#123456", "#654321"] },
      }),
      { ...source, series: [source.series[0]!] },
      options,
    );
    try {
      const output = outputRecorder(result);
      expect(instances).toHaveLength(0);
      expect(output.copies).toHaveLength(0);
      expect(output.paints[0]).toMatchObject({ operation: "rect", color: "#172635" });
      expect(output.paints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ operation: "text", text: "Beta", color: "#123456" }),
          expect.objectContaining({ operation: "text", text: "Alpha", color: "#654321" }),
        ]),
      );
      expect(
        output.paints.some((paint) => paint.operation === "rect" && paint.color === "#ffffff"),
      ).toBe(false);
    } finally {
      result.dispose();
    }
  });

  test.each(["column", "radar", "sankey", "treemap"] as const)(
    "%s native print isolates an edited title color from dark-background text defaults",
    (type) => {
      const item = drawing({ type, title: "Dark recipe", labels: true, legend: true });
      item.chart = applyChartDesignIntent(item.chart, { kind: "style", style: "dark" });
      item.chart.format!.title!.color = "#000000";
      const values: ChartData = {
        categories: ["Alpha", "Beta", "Gamma"],
        series: [{ id: "a", colorIndex: 0, name: "Revenue", values: [2, 4, 8] }],
        records: [["Source", "Target", 2]],
      };
      const result = renderChartPrintPresentation(item, values, options);
      try {
        const text = copiedPaints(result).filter((paint) => paint.operation === "text");
        expect(text.length).toBeGreaterThanOrEqual(3);
        expect(text.find((paint) => paint.text === "Dark recipe")?.color).toBe("#000000");
        expect(
          text
            .filter((paint) => paint.text !== "Dark recipe")
            .every((paint) => paint.color === "#e8eef7"),
        ).toBe(true);
      } finally {
        result.dispose();
      }
    },
  );

  test("an empty explicit source retains an opaque presentation background and disposes the native engine", () => {
    const result = renderChartPrintPresentation(
      drawing({
        source: { kind: "series", categories: { kind: "generated" }, series: [] },
        presentation: { background: "#172635", palette: ["#123456"] },
      }),
      { categories: [], series: [], records: [] },
      options,
    );
    const copy = outputRecorder(result).copies[0]!;
    expect(nativeSeries()).toEqual([]);
    expect(lastNativeOption().backgroundColor).toBe("#172635");
    expect(outputRecorder(result).paints[0]).toMatchObject({
      operation: "rect",
      color: "#172635",
      width: 960,
      height: 600,
    });
    expect(copy.paints.some((paint) => paint.operation === "text")).toBe(false);
    // A native empty display list can remain transparent. Its copy must leave
    // the destination's opaque presentation fill visible rather than paint white.
    expect(
      copy.paints.some((paint) => paint.operation === "rect" && paint.color === "#ffffff"),
    ).toBe(false);
    expect(instances[0]!.isDisposed()).toBe(true);
    expect(getInstanceByDom(copy.source)).toBeUndefined();
    expect([copy.source.width, copy.source.height]).toEqual([0, 0]);
    result.dispose();
    result.dispose();
    expect([result.canvas.width, result.canvas.height]).toEqual([0, 0]);
  });

  test.each([
    { percentStacked: false },
    { lineMarkers: 1 },
    { background: "#ffffff00" },
    { background: "transparent" },
    { palette: [] },
    { palette: ["#123456", "rgba(0,0,0,0)"] },
    { unknown: true },
  ])("invalid presentation %j is rejected before canvas allocation", (presentation) => {
    const item = drawing();
    Object.defineProperty(item.chart, "presentation", { value: presentation, enumerable: true });
    const create = vi.spyOn(document, "createElement");
    expect(() => renderChartPrintPresentation(item, source, options)).toThrow();
    expect(create).not.toHaveBeenCalled();
    expect(instances).toHaveLength(0);
  });

  test.each([
    { type: "pie" as const, stacked: true, presentation: { percentStacked: true as const } },
    { type: "column" as const, stacked: false, presentation: { percentStacked: true as const } },
    { type: "area" as const, presentation: { lineMarkers: false } },
  ])("inapplicable chart-wide presentation %j fails before allocation", (changes) => {
    const create = vi.spyOn(document, "createElement");
    expect(() => renderChartPrintPresentation(drawing(changes), source, options)).toThrow();
    expect(create).not.toHaveBeenCalled();
    expect(instances).toHaveLength(0);
  });

  test.each(["column", "wordCloud"] as const)(
    "%s rejects presentation accessors without invoking them",
    (type) => {
      const item = drawing({ type });
      const getter = vi.fn(() => ({ background: "#172635" }));
      Object.defineProperty(item.chart, "presentation", { get: getter });
      const create = vi.spyOn(document, "createElement");
      expect(() => renderChartPrintPresentation(item, source, options)).toThrow(/own data field/);
      expect(getter).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      expect(instances).toHaveLength(0);
    },
  );

  test("nested presentation accessors fail without reading their values or allocating", () => {
    const item = drawing();
    const getter = vi.fn(() => "#172635");
    const presentation = Object.defineProperty({}, "background", { get: getter });
    Object.defineProperty(item.chart, "presentation", { value: presentation });
    const create = vi.spyOn(document, "createElement");
    expect(() => renderChartPrintPresentation(item, source, options)).toThrow(/own data fields/);
    expect(getter).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  test("empty explicit sources validate presentation before their early-return path or allocation", () => {
    const item = drawing({
      source: { kind: "series", categories: { kind: "generated" }, series: [] },
    });
    Object.defineProperty(item.chart, "presentation", { value: { background: "transparent" } });
    const create = vi.spyOn(document, "createElement");
    expect(() =>
      renderChartPrintPresentation(item, { categories: [], series: [], records: [] }, options),
    ).toThrow();
    expect(create).not.toHaveBeenCalled();
    expect(instances).toHaveLength(0);
  });

  test("copy failure after presentation painting releases both canvases and the real engine", () => {
    const create = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((...args: Parameters<typeof create>) => {
      const element = create(...args);
      if (element instanceof HTMLCanvasElement && contexts.size === 0) {
        const recorder = new PrintCanvasRecorder(element);
        recorder.failCopy = true;
        contexts.set(element, recorder);
      }
      return element;
    });
    expect(() =>
      renderChartPrintPresentation(
        drawing({
          presentation: { percentStacked: true, background: "#172635", palette: ["#123456"] },
        }),
        source,
        options,
      ),
    ).toThrow(/Presentation copy failed/);
    expect(instances).toHaveLength(1);
    expect(instances[0]!.isDisposed()).toBe(true);
    expect(
      [...contexts.keys()].slice(0, 2).every((canvas) => canvas.width === 0 && canvas.height === 0),
    ).toBe(true);
  });
});
