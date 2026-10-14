import { describe, expect, test } from "vitest";
import {
  normalizeSheetChart,
  type ChartElementSettings,
  type SheetChart,
} from "../../sheet-charts.js";
import { normalizeSheetDrawing, type SheetChartDrawing } from "../../sheet-drawings.js";
import { elementChart, elementDrawing } from "./chart-elements-fixture.js";

function normalize(elements: unknown) {
  return normalizeSheetChart({ ...elementChart(), elements } as SheetChart);
}

describe("sparse chart element settings", () => {
  test("absent settings preserve the exact legacy payload and do not add defaults", () => {
    const chart = elementChart();
    expect(JSON.stringify(normalizeSheetChart(chart))).toBe(JSON.stringify(chart));
    expect(Object.hasOwn(normalizeSheetChart(chart), "elements")).toBe(false);
    expect(normalize({}).elements).toEqual({});
    expect(normalize({ titlePosition: "none" })).toMatchObject({
      title: "Sales",
      legend: true,
      labels: true,
      elements: { titlePosition: "none" },
    });
  });

  test.each<ChartElementSettings>([
    { titlePosition: "none" },
    { titlePosition: "above" },
    { titlePosition: "overlay" },
    { legendPosition: "top" },
    { legendPosition: "bottom" },
    { legendPosition: "left" },
    { legendPosition: "right" },
    { legendPosition: "topRight" },
    { legendOverlay: false },
    { legendOverlay: true },
    { labelPosition: "center" },
    { labelPosition: "insideEnd" },
    { labelPosition: "insideBase" },
    { labelPosition: "outsideEnd" },
  ])("preserves each supported own choice: %j", (elements) => {
    const chart = normalize(elements);
    expect(chart.elements).toEqual(elements);
    expect(chart.elements).not.toBe(elements);
  });

  test("clones complete settings independently through chart and drawing normalization", () => {
    const elements: ChartElementSettings = {
      titlePosition: "overlay",
      legendPosition: "topRight",
      legendOverlay: false,
      labelPosition: "outsideEnd",
    };
    const input = elementDrawing(elements),
      chart = normalizeSheetChart(input.chart),
      drawing = normalizeSheetDrawing(input) as SheetChartDrawing;
    elements.titlePosition = "above";
    chart.elements!.legendPosition = "left";
    drawing.chart.elements!.labelPosition = "center";
    expect(input.chart.elements).toEqual({ ...elements });
    expect(chart.elements!.titlePosition).toBe("overlay");
    expect(chart.elements!.labelPosition).toBe("outsideEnd");
    expect(drawing.chart.elements!.legendPosition).toBe("topRight");
  });

  test("accepts frozen and null-prototype data while returning ordinary isolated settings", () => {
    const settings = Object.freeze(
      Object.assign(Object.create(null) as ChartElementSettings, {
        legendPosition: "right",
        legendOverlay: false,
      }),
    );
    const result = normalize(settings).elements!;
    expect(result).toEqual(settings);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    result.legendOverlay = true;
    expect(settings.legendOverlay).toBe(false);
  });

  test.each([
    undefined,
    null,
    false,
    0,
    "above",
    [],
    new Date(0),
    () => ({}),
    { titlePosition: "top" },
    { titlePosition: undefined },
    { titlePosition: null },
    { titlePosition: 0 },
    { legendPosition: "top-right" },
    { legendPosition: undefined },
    { legendPosition: null },
    { legendOverlay: undefined },
    { legendOverlay: 0 },
    { legendOverlay: "false" },
    { labelPosition: "top" },
    { labelPosition: undefined },
    { labelPosition: false },
    { labelPosition: { toString: (): string => "center" } },
    { titlePosition: "above", unknown: true },
    { legend: true },
  ])("rejects malformed settings without silent defaults: %j", (elements) => {
    expect(() => normalize(elements)).toThrow();
  });

  test("rejects unknown, symbolic, non-enumerable and accessor fields without reading them", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected getter read");
      },
    };
    for (const elements of [
      Object.defineProperty({}, "titlePosition", getter),
      Object.defineProperty({}, "unknown", getter),
      Object.defineProperty({}, "legendOverlay", { set() {} }),
      Object.defineProperty({}, "hidden", { value: true }),
      { [Symbol("position")]: "above" },
    ])
      expect(() => normalize(elements)).toThrow();
    expect(reads).toBe(0);
  });

  test("rejects inherited settings and inherited/accessor elements ownership without reads", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected getter read");
      },
    };
    for (const elements of [
      Object.create({ titlePosition: "above" }),
      Object.create(Object.defineProperty({}, "legendPosition", getter)),
      Object.assign(Object.create({ unknown: true }), { legendOverlay: false }),
    ])
      expect(() => normalize(elements)).toThrow();
    const inherited = Object.assign(
      Object.create(Object.defineProperty({}, "elements", getter)),
      elementChart(),
    );
    expect(() => normalizeSheetChart(inherited)).toThrow();
    expect(() =>
      normalizeSheetChart(Object.defineProperty(elementChart(), "elements", getter)),
    ).toThrow();
    expect(reads).toBe(0);
  });
});
