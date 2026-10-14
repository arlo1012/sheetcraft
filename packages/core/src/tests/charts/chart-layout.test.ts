import { describe, expect, test } from "vitest";
import { normalizeChartFormat } from "../../chart-format.js";
import { normalizeSheetChart, type ChartType } from "../../sheet-charts.js";
import { normalizeSheetDrawings, type SheetDrawing } from "../../sheet-drawings.js";
import { chartLayoutElements, chartLayoutFormat, layoutDrawing } from "./chart-layout-fixture.js";
import { elementChart, elementDrawing } from "./chart-elements-fixture.js";
import { seriesSource } from "./chart-source-fixture.js";

const chartTypes: ChartType[] = [
  "column",
  "bar",
  "line",
  "area",
  "pie",
  "doughnut",
  "scatter",
  "radar",
  "treemap",
  "sankey",
  "river",
  "wordCloud",
];

function normalizeElements(elements: unknown) {
  return normalizeSheetChart({ ...elementChart(), elements } as ReturnType<typeof elementChart>);
}

describe("sparse ordinary chart table, label and axis layout contract", () => {
  test("retains dormant choices across all types without adding defaults or discarding titles", () => {
    for (const type of chartTypes) {
      const chart = { ...layoutDrawing().chart, type };
      expect(normalizeSheetChart(chart)).toEqual(chart);
      expect(normalizeSheetChart({ ...normalizeSheetChart(chart), type: "column" })).toEqual(
        layoutDrawing().chart,
      );
    }
    expect(normalizeSheetChart(elementChart())).toEqual(elementChart());
    expect(normalizeElements({}).elements).toEqual({});
    expect(
      normalizeChartFormat({ categoryAxis: {}, valueAxis: {}, secondaryValueAxis: {} }),
    ).toEqual({
      categoryAxis: {},
      valueAxis: {},
      secondaryValueAxis: {},
    });
    for (const titleVisible of [true, false])
      for (const axis of ["categoryAxis", "valueAxis", "secondaryValueAxis"])
        expect(normalizeChartFormat({ [axis]: { title: "My title", titleVisible } })).toEqual({
          [axis]: { title: "My title", titleVisible },
        });
  });

  test("canonical order and detached settings preserve explicit false and none", () => {
    const input = layoutDrawing(),
      [output] = normalizeSheetDrawings([input]);
    expect(output).toEqual(input);
    if (output!.kind !== "chart") throw Error("Expected chart");
    expect(output!.chart.elements).not.toBe(input.chart.elements);
    expect(output!.chart.format).not.toBe(input.chart.format);
    expect(output!.chart.format!.valueAxis).not.toBe(input.chart.format!.valueAxis);
    expect(output!.chart.format!.secondaryValueAxis).not.toBe(
      input.chart.format!.secondaryValueAxis,
    );
    const reordered = {
      labelScope: "lastCategory",
      labelContent: "seriesAndValue",
      dataTable: "withLegendKeys",
      labelPosition: "outsideEnd",
      legendOverlay: false,
      legendPosition: "right",
      titlePosition: "above",
    };
    expect(JSON.stringify(normalizeElements(reordered).elements)).toBe(
      JSON.stringify(chartLayoutElements()),
    );
    expect(normalizeElements({ dataTable: "none" }).elements).toEqual({ dataTable: "none" });
    output!.chart.elements!.dataTable = "none";
    output!.chart.format!.valueAxis!.majorGridlines = false;
    output!.chart.format!.categoryAxis!.titleVisible = true;
    expect(input.chart.elements).toEqual(chartLayoutElements());
    expect(input.chart.format).toEqual(chartLayoutFormat());
  });

  test.each([
    { dataTable: "none" },
    { dataTable: "withLegendKeys" },
    { dataTable: "withoutLegendKeys" },
    { labelContent: "value" },
    { labelContent: "seriesAndValue" },
    { labelScope: "all" },
    { labelScope: "lastCategory" },
    { labelScope: "lastSeries" },
  ])("accepts and detaches explicit element choice %j", (elements) => {
    const output = normalizeElements(elements).elements;
    expect(output).toEqual(elements);
    expect(output).not.toBe(elements);
  });

  test("rejects unknown and malformed element choices without reading accessors", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected read");
      },
    };
    for (const key of ["dataTable", "labelContent", "labelScope"])
      for (const value of [undefined, null, true, false, 0, [], {}, "unsupported"])
        expect(() => normalizeElements({ [key]: value })).toThrow();
    for (const key of [
      "dataTable",
      "labelContent",
      "labelScope",
      "layoutId",
      "recipe",
      "unknown",
    ]) {
      expect(() => normalizeElements(Object.defineProperty({}, key, getter))).toThrow();
      expect(() => normalizeElements(Object.create({ [key]: "none" }))).toThrow();
    }
    for (const elements of [{ layoutId: 5 }, { recipe: {} }, { [Symbol("bad")]: "none" }])
      expect(() => normalizeElements(elements)).toThrow();
    expect(reads).toBe(0);
  });

  test("all axis flags reject undefined, inherited fields, getters and misplaced gridlines", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected read");
      },
    };
    for (const axis of ["categoryAxis", "valueAxis", "secondaryValueAxis"])
      for (const key of axis === "categoryAxis"
        ? ["titleVisible"]
        : ["majorGridlines", "minorGridlines", "titleVisible"]) {
        for (const value of [true, false])
          expect(normalizeChartFormat({ [axis]: { [key]: value } })).toEqual({
            [axis]: { [key]: value },
          });
        for (const value of [undefined, null, 0, 1, "true", [], {}])
          expect(() => normalizeChartFormat({ [axis]: { [key]: value } })).toThrow();
        expect(() =>
          normalizeChartFormat({ [axis]: Object.defineProperty({}, key, getter) }),
        ).toThrow();
        expect(() => normalizeChartFormat({ [axis]: Object.create({ [key]: false }) })).toThrow();
      }
    for (const key of ["majorGridlines", "minorGridlines"])
      expect(() => normalizeChartFormat({ categoryAxis: { [key]: false } })).toThrow();
    expect(reads).toBe(0);
  });

  test("new layout truth belongs to a chart payload, never a shape or live source", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("Unexpected read");
      },
    };
    const drawing = layoutDrawing(),
      before = structuredClone(drawing),
      { chart: _chart, kind: _kind, ...withoutOwner } = drawing;
    const inputs = [
      { ...drawing, kind: "shape" },
      Object.defineProperty({ ...drawing }, "kind", getter),
      Object.assign(Object.create({ kind: "chart" }), withoutOwner, { chart: drawing.chart }),
      Object.defineProperty({ ...drawing }, "chart", getter),
      Object.assign(Object.create({ chart: drawing.chart }), withoutOwner, { kind: "chart" }),
    ];
    for (const input of inputs)
      expect(() => normalizeSheetDrawings([input as SheetDrawing])).toThrow(/chart|Chart/);
    for (const dataTable of ["none", "withLegendKeys"])
      expect(() =>
        normalizeSheetChart({
          ...elementChart(),
          range: null,
          source: { ...seriesSource(), dataTable } as ReturnType<typeof seriesSource>,
        }),
      ).toThrow();
    expect(reads).toBe(0);
    expect(drawing).toEqual(before);
    expect(normalizeSheetDrawings([elementDrawing()])).toEqual([elementDrawing()]);
  });
});
