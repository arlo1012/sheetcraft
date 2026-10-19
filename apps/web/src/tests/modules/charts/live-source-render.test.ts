import { displayedSeriesName, withDisplayedSeriesNames } from "./chart-render-labels";
import type { EChartsOption } from "echarts";
// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createChartSourceFromRange, type ChartSeriesSource } from "@sheetcraft/core/chart-source";
import { getSheetChartData, type ChartData, type SheetChart } from "@sheetcraft/core/sheet-charts";
import {
  createSheet,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  insertSheet,
  setCellContent,
  type CellRange,
} from "@sheetcraft/core/workbook";
import { init, type EChartsType } from "../../../modules/charts/chart-runtime";
import { createChartOption } from "../../../modules/charts/chart-option";

const dimensions = { width: 480, height: 300 };
const chart: SheetChart = {
  type: "column",
  range: null,
  title: "Retained title",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: true,
  labels: true,
  stacked: false,
  showHidden: false,
};
const range = (column: number): CellRange => ({
  start: { row: 1, column },
  end: { row: 3, column },
});
function fixture() {
  const workbook = createWorkbook({ id: "live-chart", sheetId: "sheet-one", sheetName: "Sheet1" });
  const first = getActiveSheet(workbook);
  const second = createSheet("Sheet2", "sheet-two");
  insertSheet(workbook, second);
  [
    ["region", "apple", "pear"],
    ["east", 60, 70],
    ["north", 100, 80],
    ["south", 120, 90],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(first, { row: r, column }, { kind: "literal", value }),
    ),
  );
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
    categories: { kind: "range", sheetId: second.id, range: range(0) },
    series: [
      {
        id: "apple",
        colorIndex: 0,
        name: { kind: "cell", sheetId: first.id, cell: { row: 0, column: 1 } },
        values: { kind: "range", sheetId: first.id, range: range(1) },
      },
      {
        id: "pear",
        colorIndex: 1,
        name: { kind: "cell", sheetId: first.id, cell: { row: 0, column: 2 } },
        values: { kind: "range", sheetId: first.id, range: range(2) },
      },
      {
        id: "extra",
        colorIndex: 2,
        name: { kind: "cell", sheetId: second.id, cell: { row: 0, column: 1 } },
        values: { kind: "range", sheetId: second.id, range: range(1) },
      },
    ],
  };
  const read = (next: SheetChart = { ...chart, source }) =>
    getSheetChartData(first, next, createWorkbookEvaluator(workbook, first.id), (id) =>
      workbook.sheets.get(id),
    );
  return { workbook, first, second, source, read };
}
type RenderedData = {
  count(): number;
  getName(index: number): string;
  getRawDataItem(index: number): unknown;
  getItemVisual(index: number, key: "style"): { fill?: string; stroke?: string };
};
type Model = {
  getSeries(): Array<{ id: string; name: string; getData(): RenderedData }>;
};
function model(instance: EChartsType): Model {
  return (instance as unknown as { getModel(): Model }).getModel();
}
function renderedColors(instance: EChartsType, radar: boolean) {
  const series = model(instance).getSeries();
  if (radar) {
    const data = series[0]!.getData();
    return Array.from({ length: data.count() }, (_, index) => ({
      name: data.getName(index),
      color: data.getItemVisual(index, "style").fill,
    }));
  }
  return series.map((entry) => ({
    name: displayedSeriesName(instance.getOption() as EChartsOption, entry.name),
    color: entry.getData().getItemVisual(0, "style").fill,
  }));
}
function render(next: SheetChart, data: ChartData, inspect: (instance: EChartsType) => void) {
  const instance = init(null, undefined, { renderer: "svg", ssr: true, ...dimensions });
  try {
    instance.setOption(createChartOption(next, data, dimensions), { notMerge: true });
    expect(instance.renderToSVGString()).toContain("<svg");
    inspect(instance);
  } finally {
    instance.dispose();
  }
}

describe("live ordered series SVG rendering", () => {
  test.each(["column", "bar", "line", "area", "radar"] as const)(
    "%s retains original colors while bars/points and legend follow reordered sources",
    (type) => {
      const f = fixture();
      const next = { ...chart, type, source: f.source };
      const reordered = {
        ...next,
        source: {
          ...f.source,
          series: [f.source.series[0]!, f.source.series[2]!, f.source.series[1]!],
        },
      };
      const expected = [
        { name: "apple", color: "#2563eb" },
        { name: "pear", color: "#16a34a" },
        { name: "extra", color: "#f59e0b" },
      ];
      render(next, f.read(next), (instance) => {
        expect(renderedColors(instance, type === "radar")).toEqual(
          type === "bar" ? [...expected].reverse() : expected,
        );
      });
      render(reordered, f.read(reordered), (instance) => {
        const ordered = [expected[0], expected[2], expected[1]];
        expect(renderedColors(instance, type === "radar")).toEqual(
          type === "bar" ? ordered.reverse() : ordered,
        );
        const svg = instance.renderToSVGString();
        const order = type === "bar" ? ["pear", "extra", "apple"] : ["apple", "extra", "pear"];
        expect(svg.indexOf(`>${order[0]}<`)).toBeLessThan(svg.indexOf(`>${order[1]}<`));
        expect(svg.indexOf(`>${order[1]}<`)).toBeLessThan(svg.indexOf(`>${order[2]}<`));
        for (const text of ["red", "green", "blue", "apple", "extra", "pear"])
          expect(svg).toContain(`>${text}<`);
      });
    },
  );

  test("renders same-workbook named sheets and live value/name/category mutations", () => {
    const f = fixture();
    const next = { ...chart, source: f.source };
    const before = f.read(next);
    expect(before.categories).toEqual(["red", "green", "blue"]);
    expect(before.series.map((entry) => entry.values)).toEqual([
      [60, 100, 120],
      [70, 80, 90],
      [15, 25, 35],
    ]);
    render(next, before, (instance) => {
      const data = model(instance).getSeries()[2]!.getData();
      expect([0, 1, 2].map((index) => data.getRawDataItem(index))).toEqual([15, 25, 35]);
      expect(instance.renderToSVGString()).toContain(">25<");
    });
    setCellContent(f.second, { row: 0, column: 1 }, { kind: "literal", value: "revised" });
    setCellContent(f.second, { row: 2, column: 0 }, { kind: "literal", value: "renamed category" });
    setCellContent(f.second, { row: 2, column: 1 }, { kind: "literal", value: 205 });
    const after = f.read(next);
    render(next, after, (instance) => {
      expect(renderedColors(instance, false)[2]).toEqual({ name: "revised", color: "#f59e0b" });
      const svg = instance.renderToSVGString();
      for (const text of ["revised", "renamed category", "205"]) expect(svg).toContain(`>${text}<`);
      expect(svg).not.toContain(">extra<");
    });
  });

  test("renders a constant values vector with its literal name and generated categories", () => {
    const f = fixture();
    const source: ChartSeriesSource = {
      kind: "series",
      categories: { kind: "generated" },
      series: [
        {
          id: "bonus",
          colorIndex: 2,
          name: { kind: "literal", text: "bonus" },
          values: { kind: "literal", values: [10, 20, 30] },
        },
      ],
    };
    const next = { ...chart, source };
    const data = f.read(next);
    expect(data.categories).toEqual(["1", "2", "3"]);
    render(next, data, (instance) => {
      expect(renderedColors(instance, false)).toEqual([{ name: "bonus", color: "#f59e0b" }]);
      const rendered = model(instance).getSeries()[0]!.getData();
      expect([0, 1, 2].map((index) => rendered.getRawDataItem(index))).toEqual([10, 20, 30]);
      for (const text of ["bonus", "10", "20", "30"])
        expect(instance.renderToSVGString()).toContain(`>${text}<`);
    });
  });

  test("preserves ordinal pairing for hidden rows, errors, real zero and gaps", () => {
    const f = fixture();
    setCellContent(f.second, { row: 1, column: 1 }, { kind: "literal", value: 0 });
    setCellContent(
      f.second,
      { row: 3, column: 1 },
      {
        kind: "formula",
        formula: { source: "=1/0" },
      },
    );
    f.second.hiddenRows = new Set([2]);
    const next = { ...chart, type: "line" as const, source: f.source };
    const data = f.read(next);
    expect(data.categories).toEqual(["red", "blue"]);
    expect(data.series.map((entry) => entry.values)).toEqual([
      [60, 120],
      [70, 90],
      [0, null],
    ]);
    render(next, data, (instance) => {
      const extra = model(instance).getSeries()[2]!.getData();
      expect([0, 1].map((index) => extra.getRawDataItem(index))).toEqual([0, null]);
      const svg = instance.renderToSVGString();
      expect(svg).toContain(">0<");
      expect(svg).not.toContain(">green<");
    });
    expect(f.read({ ...next, showHidden: true }).series[2]!.values).toEqual([0, 25, null]);
  });

  test("zero explicit series clears all chart interior without falling back to an old range", () => {
    const f = fixture();
    const next = { ...chart, source: { ...f.source, series: [] } };
    const data = f.read(next);
    render(next, data, (instance) => {
      expect(model(instance).getSeries()).toEqual([]);
      const svg = instance.renderToSVGString();
      expect(svg).not.toContain("<text");
      expect(svg).not.toContain("<path");
      expect(createChartOption(next, data)).toEqual({
        animation: false,
        backgroundColor: "#ffffff",
        series: [],
      });
    });
  });

  test("does not render fabricated data from broken, missing-sheet or mismatched sources", () => {
    const f = fixture();
    const broken: ChartSeriesSource = {
      ...f.source,
      series: [
        { ...f.source.series[0]!, values: { kind: "range", sheetId: f.first.id, range: null } },
      ],
    };
    const missing: ChartSeriesSource = {
      ...f.source,
      categories: { kind: "range", sheetId: "missing-sheet", range: range(0) },
    };
    const mismatch: ChartSeriesSource = {
      ...f.source,
      series: [{ ...f.source.series[0]!, values: { kind: "literal", values: [1, 2] } }],
    };
    for (const source of [broken, missing, mismatch]) {
      const next = { ...chart, source };
      const data = f.read(next);
      expect(data.series).toEqual([]);
      expect(() => createChartOption(next, data)).toThrow(/unavailable|mismatched/);
    }
  });

  test.each(["pie", "doughnut", "scatter", "treemap", "sankey", "river", "wordCloud"] as const)(
    "explicitly rejects an ordered categorical source for %s",
    (type) => {
      const f = fixture();
      expect(() => createChartOption({ ...chart, type, source: f.source }, f.read())).toThrow(
        /does not support/,
      );
    },
  );

  test("legacy rectangular and detached-cache options retain original geometry/palette", () => {
    const f = fixture();
    const legacy = {
      ...chart,
      labels: false,
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
    };
    const data = f.read(legacy);
    const expected = {
      animation: false,
      color: ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#db2777"],
      backgroundColor: "#ffffff",
      title: {
        text: "Retained title",
        left: "center",
        textStyle: { fontSize: 15, fontWeight: "normal" },
      },
      tooltip: { trigger: "item", renderMode: "richText", confine: true },
      legend: { show: true, bottom: 0, type: "scroll" },
      textStyle: { fontFamily: "Arial, sans-serif" },
      grid: { top: 45, left: 48, right: 22, bottom: 58 },
      xAxis: { type: "category", data: ["east", "north", "south"] },
      yAxis: { type: "value" },
      series: [
        { type: "bar", name: "apple", data: [60, 100, 120], label: { show: false } },
        { type: "bar", name: "pear", data: [70, 80, 90], label: { show: false } },
      ],
    };
    expect(withDisplayedSeriesNames(createChartOption(legacy, data))).toMatchObject(expected);
    const detached = { ...legacy, range: null, dataCache: data };
    expect(withDisplayedSeriesNames(createChartOption(detached, f.read(detached)))).toMatchObject(
      expected,
    );
    for (const next of [legacy, detached])
      render(next, f.read(next), (instance) => {
        expect(renderedColors(instance, false)).toEqual([
          { name: "apple", color: "#2563eb" },
          { name: "pear", color: "#16a34a" },
        ]);
        expect(instance.renderToSVGString()).toContain(">Retained title<");
      });
  });

  test.each(["columns", "rows"] as const)(
    "%s promotion retains the old first visible series color when preceding vectors are hidden",
    (seriesBy) => {
      const f = fixture();
      if (seriesBy === "columns") f.first.hiddenColumns = new Set([1]);
      else f.first.hiddenRows = new Set([1]);
      const legacy: SheetChart = {
        ...chart,
        seriesBy,
        range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
      };
      const name = seriesBy === "columns" ? "pear" : "north";
      render(legacy, f.read(legacy), (instance) => {
        expect(renderedColors(instance, false)[0]).toEqual({ name, color: "#2563eb" });
      });
      const source = createChartSourceFromRange(f.first.id, legacy, f.first);
      source.series[1]!.name = { kind: "literal", text: "renamed" };
      const promoted = { ...legacy, range: null, source };
      render(promoted, f.read(promoted), (instance) => {
        expect(renderedColors(instance, false)[0]).toEqual({ name: "renamed", color: "#2563eb" });
      });
      f.first.hiddenColumns?.clear();
      f.first.hiddenRows?.clear();
      render(promoted, f.read(promoted), (instance) => {
        expect(renderedColors(instance, false).find((entry) => entry.name === "renamed")).toEqual({
          name: "renamed",
          color: "#2563eb",
        });
      });
    },
  );

  test.each(["columns", "rows"] as const)(
    "%s promotion keeps labels readable when their header stripe is hidden",
    (seriesBy) => {
      const f = fixture();
      if (seriesBy === "columns") f.first.hiddenColumns = new Set([0]);
      else f.first.hiddenRows = new Set([0]);
      const legacy: SheetChart = {
        ...chart,
        seriesBy,
        range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
      };
      const source = createChartSourceFromRange(f.first.id, legacy, f.first);
      const promoted = { ...legacy, range: null, source };
      const before = f.read(legacy);
      const after = f.read(promoted);
      expect(after.categories).toEqual(before.categories);
      expect(after.series.map((entry) => ({ name: entry.name, values: entry.values }))).toEqual(
        before.series,
      );
      render(promoted, after, (instance) => {
        expect(model(instance).getSeries()).toHaveLength(before.series.length);
        for (const category of before.categories)
          expect(instance.renderToSVGString()).toContain(`>${category}<`);
      });
    },
  );
});
