import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { getSheetChartData, type ChartData } from "@sheetcraft/core/sheet-charts";
import { createSheetEvaluator, createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { applyChartFormatIntent } from "../../../modules/charts/chart-format-intents";
import { getChartFormatTargets } from "../../../modules/charts/chart-format-pane";
import { getInstanceByDom } from "echarts/core";
import * as chartRuntime from "../../../modules/charts/chart-runtime";
import {
  CHART_PRINT_MAX_SURFACE_PIXELS,
  renderChartPrintPresentation,
  type ChartPrintPresentationOptions,
} from "../../../modules/charts/chart-print-presentation";

type Paint = {
  operation: "fill" | "stroke" | "text" | "rect";
  fill: string | CanvasGradient | CanvasPattern;
  font: string;
  text?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  baseline?: CanvasTextBaseline;
  path?: string[];
};

/** Typed native DOM/context boundary; ECharts models, layout and CanvasPainter are real. */
class NativeCanvasRecorder {
  readonly paints: Paint[] = [];
  readonly measures: Array<{ text: string; font: string }> = [];
  readonly copies: Array<{ source: HTMLCanvasElement; paints: Paint[] }> = [];
  path: string[] = [];
  failCopy = false;
  readonly context: CanvasRenderingContext2D;
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
        this.paints.push({
          operation: "fill",
          fill: state.fillStyle ?? "",
          font: state.font ?? "",
          path: [...this.path],
        });
      },
      stroke: () => {
        this.paints.push({
          operation: "stroke",
          fill: state.strokeStyle ?? "",
          font: state.font ?? "",
          path: [...this.path],
        });
      },
      fillRect: (x, y, width, height) => {
        this.paints.push({
          operation: "rect",
          fill: state.fillStyle ?? "",
          font: state.font ?? "",
          x,
          y,
          width,
          height,
        });
      },
      fillText: (text, x, y) => {
        this.paints.push({
          operation: "text",
          fill: state.fillStyle ?? "",
          font: state.font ?? "",
          text,
          x,
          y,
          baseline: state.textBaseline,
        });
      },
      strokeText() {},
      measureText: (text) => {
        const font = state.font ?? "10px sans-serif";
        this.measures.push({ text, font });
        allMeasures.push({ text, font });
        const size = Number(/([\d.]+)px/.exec(font)?.[1] ?? 10);
        const factor = [...nativeWidths].find(([family]) => font.includes(family))?.[1] ?? 0.6;
        const width = [...text].length * size * factor;
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
        if (this.failCopy) throw new Error("Copy failed");
        if (!(source instanceof HTMLCanvasElement))
          throw new Error("Only native canvases are expected");
        const recorder = contexts.get(source);
        if (!recorder) throw new Error("Missing native source recorder");
        this.copies.push({ source, paints: recorder.paints.map((paint) => ({ ...paint })) });
      },
    };
    this.context = state as CanvasRenderingContext2D;
  }
}

let contexts: Map<HTMLCanvasElement, NativeCanvasRecorder>;
let allMeasures: Array<{ text: string; font: string }>;
let nativeWidths = new Map<string, number>();
let instances: chartRuntime.EChartsType[];
let nativeLayoutBounds: Array<{ text: string; width: number }>;
let missingContext: number | undefined;
let contextCount: number;
let failSetOption: boolean;
let failDispose: boolean;
const options: ChartPrintPresentationOptions = { document, width: 480, height: 300, density: 2 };
const data: ChartData = {
  categories: ["Alpha", "Beta"],
  series: [{ id: "sales", colorIndex: 0, name: "Sales", values: [2, 4] }],
  records: [],
};
function drawing(changes: Partial<SheetChartDrawing["chart"]> = {}): SheetChartDrawing {
  return {
    id: "chart",
    kind: "chart",
    name: "Sales",
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
      title: "Native sales",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: false,
      labels: false,
      stacked: false,
      showHidden: false,
      ...changes,
    },
  };
}
beforeEach(() => {
  contexts = new Map();
  allMeasures = [];
  nativeWidths = new Map();
  instances = [];
  nativeLayoutBounds = [];
  missingContext = undefined;
  contextCount = 0;
  failSetOption = false;
  failDispose = false;
  const realInit = chartRuntime.init;
  vi.spyOn(chartRuntime, "init").mockImplementation((...args: Parameters<typeof realInit>) => {
    const instance = realInit(...args);
    instances.push(instance);
    const zr = instance.getZr(),
      flush = zr.flush.bind(zr);
    vi.spyOn(zr, "flush").mockImplementation(() => {
      flush();
      for (const item of zr.storage.getDisplayList()) {
        const text: unknown = Object.getOwnPropertyDescriptor(item.style, "text")?.value;
        if (typeof text === "string")
          nativeLayoutBounds.push({ text, width: item.getBoundingRect().width });
      }
    });
    if (failSetOption)
      vi.spyOn(instance, "setOption").mockImplementation(() => {
        throw new Error("Native setOption failed");
      });
    if (failDispose) {
      const dispose = instance.dispose.bind(instance);
      vi.spyOn(instance, "dispose").mockImplementation(() => {
        dispose();
        throw new Error("Native dispose failed");
      });
    }
    return instance;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
    contextId: string,
  ) {
    if (contextId !== "2d") return null;
    let recorder = contexts.get(this);
    if (!recorder) {
      contextCount++;
      if (contextCount === missingContext) return null;
      recorder = new NativeCanvasRecorder(this);
      contexts.set(this, recorder);
    }
    return recorder.context;
  });
});
afterEach(() => {
  for (const instance of instances) if (!instance.isDisposed()) instance.dispose();
  vi.restoreAllMocks();
});

describe("native chart print presentation", () => {
  test("paints real bars and category labels, copies them, then disposes the real engine", () => {
    const snapshot = structuredClone(data);
    const result = renderChartPrintPresentation(drawing(), data, options);
    try {
      expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
      expect([result.canvas.width, result.canvas.height]).toEqual([960, 600]);
      const output = contexts.get(result.canvas)!;
      expect(output.copies).toHaveLength(1);
      const copy = output.copies[0]!;
      expect(
        copy.paints.filter((paint) => paint.operation === "fill" && paint.fill === "#2563eb"),
      ).toHaveLength(2);
      expect(
        copy.paints.filter((paint) => paint.operation === "text").map((paint) => paint.text),
      ).toEqual(expect.arrayContaining(["Alpha", "Beta", "Native sales"]));
      expect(instances).toHaveLength(1);
      expect(instances[0]!.isDisposed()).toBe(true);
      expect(getInstanceByDom(copy.source)).toBeUndefined();
      expect([copy.source.width, copy.source.height]).toEqual([0, 0]);
      expect(data).toEqual(snapshot);
    } finally {
      result.dispose();
      result.dispose();
    }
    expect([result.canvas.width, result.canvas.height]).toEqual([0, 0]);
  });

  test("native paint retains custom axis number formats, signed colors and secondary scale", () => {
    const source: ChartData = {
      ...data,
      series: [
        { id: "sales", colorIndex: 0, name: "Sales", values: [-2, 4] },
        { id: "mass", colorIndex: 1, name: "Mass", values: [200, 400] },
      ],
    };
    const result = renderChartPrintPresentation(
      drawing({
        format: {
          valueAxis: {
            min: -4,
            max: 4,
            majorUnit: 2,
            numberFormat: { kind: "custom", code: '[Green]0.0;[Red](0.0);[Blue]"zero"' },
          },
          secondaryValueAxis: {
            min: 0,
            max: 400,
            majorUnit: 200,
            numberFormat: { kind: "custom", code: '0" kg"' },
          },
          series: [{ id: "mass", axis: "secondary", color: "#445566" }],
        },
      }),
      source,
      options,
    );
    try {
      const paints = contexts.get(result.canvas)!.copies[0]!.paints;
      expect(paints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ operation: "text", text: "(2.0)", fill: "red" }),
          expect.objectContaining({ operation: "text", text: "zero", fill: "blue" }),
          expect.objectContaining({ operation: "text", text: "200 kg" }),
        ]),
      );
      expect(
        paints.filter((paint) => paint.operation === "fill" && paint.fill === "#445566"),
      ).toHaveLength(2);
      expect(instances[0]!.isDisposed()).toBe(true);
    } finally {
      result.dispose();
    }
  });

  test("range-bound formatting paints through the native print data clone without promoting its source", () => {
    const workbook = createWorkbook({ id: "range-print", sheetId: "data" });
    const sheet = getActiveSheet(workbook);
    const values = [
      ["region", "same", "same"],
      ["Alpha", 2, 200],
      ["Beta", 4, 400],
    ];
    values.forEach((row, r) =>
      row.forEach((value, c) =>
        sheet.cells.set(`${r}:${c}`, { content: { kind: "literal", value } }),
      ),
    );
    const source = drawing({ range: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } } });
    const evaluator = createSheetEvaluator(sheet);
    const initial = getSheetChartData(sheet, source.chart, evaluator);
    const target = getChartFormatTargets(source.chart, initial).find(
      (entry) => entry.kind === "series" && entry.rangeBand?.index === 2,
    );
    if (!target || target.kind !== "series") throw new Error("Missing physical range series");
    const chart = applyChartFormatIntent(source.chart, target, {
      kind: "series",
      seriesId: target.seriesId,
      format: { color: "#445566", axis: "secondary" },
    });
    const derived = getSheetChartData(sheet, chart, evaluator);
    const before = structuredClone({ chart, derived });
    const result = renderChartPrintPresentation({ ...source, chart }, derived, options);
    try {
      const paints = contexts.get(result.canvas)!.copies[0]!.paints;
      expect(
        paints.filter((paint) => paint.operation === "fill" && paint.fill === "#445566"),
      ).toHaveLength(2);
      expect(paints.some((paint) => paint.operation === "text" && paint.text === "400")).toBe(true);
      expect(instances[0]!.isDisposed()).toBe(true);
      expect({ chart, derived }).toEqual(before);
      expect(chart.source).toBeUndefined();
      expect(chart.range).toEqual(source.chart.range);
    } finally {
      result.dispose();
    }
  });

  test("already-loaded alias is used by native measurement and actual title/axis painting", () => {
    const alias = "Immutable native font alias";
    const result = renderChartPrintPresentation(
      drawing({
        format: {
          title: { fontFamily: "Original native font", bold: true, italic: true, fontSize: 19 },
          categoryAxis: { text: { fontFamily: "Original native font" } },
          valueAxis: { text: { fontFamily: "Original native font" } },
        },
      }),
      data,
      {
        ...options,
        resolveFontFamily: (family) => (family === "Original native font" ? alias : family),
      },
    );
    try {
      const painted = contexts.get(result.canvas)!.copies[0]!.paints;
      const texts = painted.filter((paint) => paint.operation === "text");
      expect(texts.find((paint) => paint.text === "Native sales")?.font).toBe(
        `italic bold 19px ${alias}`,
      );
      expect(texts.find((paint) => paint.text === "Alpha")?.font).toContain(alias);
      expect(allMeasures.some((entry) => entry.font.includes(alias))).toBe(true);
      expect(texts.some((paint) => paint.font.includes("Original native font"))).toBe(false);
    } finally {
      result.dispose();
    }
  });

  test("a fresh real font-family alias measures and lays out again after a warmed fallback cache", () => {
    const sourceFamily = "ColdCacheOriginalUnique",
      alias = "LoadedPrivatePrintUnique";
    const source = drawing({ format: { title: { fontFamily: sourceFamily, fontSize: 19 } } });
    nativeWidths.set(sourceFamily, 0.25);
    const before = renderChartPrintPresentation(source, data, options);
    const oldTitle = [...nativeLayoutBounds]
      .reverse()
      .find((item) => item.text === "Native sales")!;
    expect(allMeasures.some((entry) => entry.font.includes(sourceFamily))).toBe(true);
    before.dispose();
    // The source cache can retain its earlier fallback width. Private loaded
    // aliases use a genuine new family key in the installed ZRender renderer.
    nativeWidths.set(sourceFamily, 0.9);
    nativeWidths.set(alias, 0.9);
    allMeasures.length = 0;
    const after = renderChartPrintPresentation(source, data, {
      ...options,
      resolveFontFamily: (family) => (family === sourceFamily ? alias : family),
    });
    try {
      const title = contexts
        .get(after.canvas)!
        .copies[0]!.paints.find(
          (paint) => paint.operation === "text" && paint.text === "Native sales",
        )!;
      expect(allMeasures.some((entry) => entry.font.includes(alias))).toBe(true);
      expect(title.font).toContain(alias);
      const titleBounds = [...nativeLayoutBounds]
        .reverse()
        .find((item) => item.text === "Native sales")!;
      expect(titleBounds.width).toBeGreaterThan(oldTitle.width * 2);
      expect(allMeasures.filter((entry) => entry.font.includes(sourceFamily))).toHaveLength(0);
    } finally {
      after.dispose();
    }
  });

  test.each([
    { width: Number.NaN },
    { height: Number.POSITIVE_INFINITY },
    { width: 0 },
    { density: 0 },
    { density: 9 },
    { width: 16385, density: 1 },
    { width: 4096, height: 2049, density: 1 },
    { width: 0.01, density: 1 },
  ])("rejects invalid/budgeted dimensions before canvas allocation: %j", (change) => {
    const create = vi.spyOn(document, "createElement");
    expect(() =>
      renderChartPrintPresentation(drawing(), data, { ...options, ...change }),
    ).toThrow();
    expect(create).not.toHaveBeenCalled();
    expect(instances).toHaveLength(0);
  });

  test("validates numeric source before native initialization and allows the exact pixel boundary", () => {
    expect(() =>
      renderChartPrintPresentation(
        drawing(),
        {
          ...data,
          series: [{ name: "Bad", values: [Number.NaN, 4] }],
        },
        options,
      ),
    ).toThrow(/cached chart data/);
    expect(instances).toHaveLength(0);
    const result = renderChartPrintPresentation(drawing({ type: "wordCloud" }), data, {
      ...options,
      width: 4096,
      height: 2048,
      density: 1,
    });
    expect(result.canvas.width * result.canvas.height).toBe(CHART_PRINT_MAX_SURFACE_PIXELS);
    result.dispose();
  });

  test.each([1, 2])(
    "missing 2D context %i fails without an empty success or retained allocation",
    (missing) => {
      missingContext = missing;
      expect(() => renderChartPrintPresentation(drawing(), data, options)).toThrow(/2D canvas/);
      expect(instances).toHaveLength(0);
      expect(
        [...contexts.keys()].every((canvas) => canvas.width === 0 && canvas.height === 0),
      ).toBe(true);
    },
  );

  test("failed native setOption disposes the engine and both owned canvases", () => {
    failSetOption = true;
    expect(() => renderChartPrintPresentation(drawing(), data, options)).toThrow(
      /Native setOption failed/,
    );
    expect(instances[0]!.isDisposed()).toBe(true);
    expect(
      [...contexts.keys()].slice(0, 2).every((canvas) => canvas.width === 0 && canvas.height === 0),
    ).toBe(true);
  });

  test.each([false, true])(
    "native dispose failure releases both surfaces and preserves earlier paint failure %s",
    (paintFails) => {
      failDispose = true;
      failSetOption = paintFails;
      expect(() => renderChartPrintPresentation(drawing(), data, options)).toThrow(
        paintFails ? /Native setOption failed/ : /Native dispose failed/,
      );
      expect(instances[0]!.isDisposed()).toBe(true);
      expect(
        [...contexts.keys()]
          .slice(0, 2)
          .every((canvas) => canvas.width === 0 && canvas.height === 0),
      ).toBe(true);
    },
  );

  test("numeric axis and graph budgets are checked before native allocation or initialization", () => {
    const create = vi.spyOn(document, "createElement");
    expect(() =>
      renderChartPrintPresentation(
        drawing({
          format: { valueAxis: { min: 0, max: 1000, majorUnit: 0.0001 } },
        }),
        data,
        options,
      ),
    ).toThrow(/2048-tick/);
    expect(() =>
      renderChartPrintPresentation(
        drawing({ type: "sankey" }),
        {
          categories: [],
          series: [],
          records: [
            ["A", "B", 1],
            ["B", "A", 1],
          ],
        },
        options,
      ),
    ).toThrow(/cycle/);
    expect(create).not.toHaveBeenCalled();
    expect(instances).toHaveLength(0);
  });

  test("failed native copy also disposes the engine and output", () => {
    const create = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((...args: Parameters<typeof create>) => {
      const element = create(...args);
      if (element instanceof HTMLCanvasElement && contexts.size === 0) {
        const recorder = new NativeCanvasRecorder(element);
        recorder.failCopy = true;
        contexts.set(element, recorder);
      }
      return element;
    });
    expect(() => renderChartPrintPresentation(drawing(), data, options)).toThrow(/Copy failed/);
    expect(instances[0]!.isDisposed()).toBe(true);
    expect(
      [...contexts.keys()].slice(0, 2).every((canvas) => canvas.width === 0 && canvas.height === 0),
    ).toBe(true);
  });

  test("word cloud draws literal safe text with the same title and word layout", () => {
    const result = renderChartPrintPresentation(
      drawing({
        type: "wordCloud",
        title: "<img src=x>",
        elements: { titlePosition: "above" },
        format: {
          title: { fontFamily: "Arial", fontSize: 21, bold: true, italic: true, color: "#123456" },
        },
      }),
      data,
      options,
    );
    try {
      const output = contexts.get(result.canvas)!;
      expect(instances).toHaveLength(0);
      expect(output.copies).toHaveLength(0);
      expect(output.paints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operation: "text",
            text: "<img src=x>",
            font: "italic bold 21px Arial",
            fill: "#123456",
            x: 240,
            y: 22,
            baseline: "alphabetic",
          }),
          expect.objectContaining({
            operation: "text",
            text: "Beta",
            fill: "#2563eb",
            x: 120,
            y: 162.5,
            baseline: "middle",
          }),
        ]),
      );
      expect(result.canvas.querySelector("img")).toBeNull();
    } finally {
      result.dispose();
    }
  });
});

test("real print data table paints raw values using the leased font before copy and disposal", () => {
  const source: ChartData = {
    categories: ["Alpha", "Beta"],
    series: [
      {
        id: "sales",
        name: "Sales",
        colorIndex: 0,
        values: [2, 4],
        numberFormat: { kind: "custom", code: '0" kg"' },
      },
    ],
    records: [],
  };
  const alias = "Leased table font";
  const result = renderChartPrintPresentation(
    drawing({
      stacked: true,
      presentation: { percentStacked: true },
      elements: { dataTable: "withLegendKeys" },
      format: { categoryAxis: { text: { fontFamily: "Source font" } } },
    }),
    source,
    { ...options, resolveFontFamily: (family) => (family === "Source font" ? alias : family) },
  );
  try {
    const copied = contexts.get(result.canvas)!.copies[0]!.paints;
    const table = copied.filter(
      (p) => p.operation === "text" && ["Sales", "2 kg", "4 kg"].includes(p.text ?? ""),
    );
    expect(table).toHaveLength(3);
    expect(table.every((p) => p.font.includes(alias))).toBe(true);
    expect(instances[0]!.isDisposed()).toBe(true);
  } finally {
    result.dispose();
  }
});
