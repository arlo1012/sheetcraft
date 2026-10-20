import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { EChartsOption } from "echarts";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import {
  CHART_DATA_TABLE_LIMITS,
  countChartDataTableText,
  createChartDataTablePlan,
  prepareChartDataTableOption,
} from "../../../modules/charts/chart-data-table";
import { createChartOption } from "../../../modules/charts/chart-option";
import { comboChart, comboData } from "./combo-fixture";

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
  records: [["ignored", "text", "does not reconstruct a cell"]],
};
const dimensions = { width: 640, height: 400 };
let measureScale = 0.6;
const measurementCanvases: HTMLCanvasElement[] = [];
beforeEach(() => {
  measureScale = 0.6;
  measurementCanvases.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
    kind: string,
  ) {
    if (kind !== "2d") return null;
    measurementCanvases.push(this);
    const state = {
      font: "10px sans-serif",
      measureText(value: string) {
        const size = Number(/([\d.]+)px/.exec(state.font)?.[1] ?? 10);
        return { width: [...value].length * size * measureScale } as TextMetrics;
      },
    };
    return state as CanvasRenderingContext2D;
  });
});
afterEach(() => vi.restoreAllMocks());

function required(chartValue = chart, dataValue = data, size = dimensions) {
  const plan = createChartDataTablePlan(chartValue, dataValue, size);
  if (!plan) throw new Error("Expected data table plan");
  return plan;
}

describe("bounded complete raw chart data table plans", () => {
  test("Combo keys match columns, plain lines and marked lines without changing raw cells", () => {
    const source = { ...comboChart(), elements: { dataTable: "withLegendKeys" as const } };
    const plain = required(source, comboData);
    expect(plain.rows.map((row) => [row.key, row.strokeWidth])).toEqual([
      ["column", 2],
      ["line", 5],
    ]);
    const marked = createChartDataTablePlan(source, comboData, dimensions, [
      { seriesId: "pear", drawType: "line", axis: "secondary", markers: true },
    ]);
    expect(marked?.rows[1]?.key).toBe("markerLine");
    expect(marked?.rows.map((row) => row.cells)).toEqual(plain.rows.map((row) => row.cells));
    expect(source.format?.series?.[0]?.markers).toBe(false);
  });
  test("baseline keeps all categories, source row identities and values without mutating source", () => {
    const source = structuredClone(data),
      originalChart = structuredClone(chart);
    const plan = required();
    expect(plan.categories.map((entry) => [entry.sourceOrdinal, entry.label.text])).toEqual([
      [0, "east"],
      [1, "north"],
      [2, "south"],
    ]);
    expect(
      plan.rows.map((row) => [
        row.seriesIndex,
        row.id,
        row.label.text,
        row.cells.map((cell) => cell.label.text),
      ]),
    ).toEqual([
      [0, "apple", "apple", ["60", "100", "120"]],
      [1, "pear", "pear", ["70", "80", "90"]],
    ]);
    expect(plan.tableHeight).toBe(60);
    expect(plan.fontSize).toBe(12);
    expect(plan.generatedTextUnits).toBe(37);
    expect(plan.primitiveUpperBound).toBeLessThan(CHART_DATA_TABLE_LIMITS.primitives);
    expect(data).toEqual(source);
    expect(chart).toEqual(originalChart);
  });

  test("each series retains original format, null remains blank, records/errors never become zero", () => {
    const source: ChartData = {
      categories: ["duplicate", "duplicate", "42"],
      records: [["#DIV/0!", "arbitrary text", 999]],
      series: [
        {
          id: "money",
          name: "same",
          values: [12.5, -2, null],
          numberFormat: { kind: "number", fractionDigits: 2 },
        },
        {
          id: "percent",
          name: "same",
          values: [0.25, 0, null],
          numberFormat: { kind: "percent", fractionDigits: 0 },
        },
      ],
    };
    const plan = required(
      {
        ...chart,
        stacked: true,
        presentation: { percentStacked: true },
        format: {
          categoryAxis: { reverse: true },
          valueAxis: { numberFormat: { kind: "percent", fractionDigits: 1 } },
          series: [{ id: "percent", axis: "secondary" }],
        },
      },
      source,
    );
    expect(plan.rows.map((row) => row.cells.map((cell) => [cell.value, cell.label.text]))).toEqual([
      [
        [12.5, "12.50"],
        [-2, "-2.00"],
        [null, ""],
      ],
      [
        [0.25, "25%"],
        [0, "0%"],
        [null, ""],
      ],
    ]);
    expect(plan.categories.map((category) => category.sourceOrdinal)).toEqual([0, 1, 2]);
    expect(plan.rows.map((row) => row.id)).toEqual(["money", "percent"]);
  });

  test("every generated run resolves its current family before its native measurement", () => {
    const resolveFontFamily = vi.fn((original: string) =>
      original === "Source Face" ? "Verified Print Face" : original,
    );
    const plan = createChartDataTablePlan(
      { ...chart, format: { categoryAxis: { text: { fontFamily: "Source Face" } } } },
      data,
      { ...dimensions, resolveFontFamily },
    )!;
    const runs = [
      ...plan.categories.map((entry) => entry.label),
      ...plan.rows.flatMap((row) => [row.label, ...row.cells.map((cell) => cell.label)]),
    ];
    expect(resolveFontFamily).toHaveBeenCalledTimes(runs.length);
    expect(runs.every((run) => run.fontFamily === "Verified Print Face")).toBe(true);
    expect(resolveFontFamily.mock.calls.every(([family]) => family === "Source Face")).toBe(true);
  });

  test("fresh bounded measurement sessions observe same-family width changes and release success/failure canvases", () => {
    const first = required();
    expect(measurementCanvases).toHaveLength(1);
    expect([measurementCanvases[0]!.width, measurementCanvases[0]!.height]).toEqual([0, 0]);
    measureScale = 0.9;
    const second = required();
    expect(second.rows[0]!.cells[0]!.label.width).toBeGreaterThan(
      first.rows[0]!.cells[0]!.label.width,
    );
    expect(measurementCanvases).toHaveLength(2);
    expect(() =>
      required(chart, { ...data, categories: ["x".repeat(4097), "north", "south"] }),
    ).toThrow(/4096/);
    expect(
      measurementCanvases.every(
        (canvas) => canvas.width === 0 && canvas.height === 0 && !canvas.isConnected,
      ),
    ).toBe(true);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(() => required()).toThrow(/native 2D text measurement context/);
  });

  test("dark surface text and independent with/without keys keep source rows intact", () => {
    const keyed = required({ ...chart, presentation: { background: "#202936" } });
    expect(keyed).toMatchObject({
      textColor: "#e8eef7",
      backgroundColor: "#202936",
      gridColor: "#64748b",
    });
    const unkeyed = required({ ...chart, elements: { dataTable: "withoutLegendKeys" } });
    expect(unkeyed.rows).toEqual(required().rows);
    expect(keyed.primitiveUpperBound - unkeyed.primitiveUpperBound).toBe(data.series.length);
  });

  test("legacy/off/empty source and dormant unsupported types get no plan", () => {
    expect(
      createChartDataTablePlan({ ...chart, elements: undefined }, data, dimensions),
    ).toBeUndefined();
    expect(
      createChartDataTablePlan({ ...chart, elements: { dataTable: "none" } }, data, dimensions),
    ).toBeUndefined();
    expect(
      createChartDataTablePlan(chart, { ...data, categories: [], series: [] }, dimensions),
    ).toBeUndefined();
    for (const type of ["bar", "pie", "scatter", "radar"] as const)
      expect(createChartDataTablePlan({ ...chart, type }, data, dimensions)).toBeUndefined();
    for (const type of ["line", "area"] as const)
      expect(required({ ...chart, type }).rows).toHaveLength(2);
  });

  test("source errors, incomplete vectors and nonfinite values fail the entire table", () => {
    expect(() =>
      required(chart, {
        ...data,
        diagnostics: [{ code: "broken-reference", seriesId: "apple", role: "values" }],
      }),
    ).toThrow(/source is unavailable/);
    expect(() => required(chart, { ...data, series: [{ name: "short", values: [1] }] })).toThrow(
      /mismatched lengths/,
    );
    expect(() =>
      required(chart, { ...data, series: [{ name: "bad", values: [1, Infinity, 3] }] }),
    ).toThrow(/finite/);
  });

  test("32 categories/8 series/256 slots admit the full table, one over never takes first N", () => {
    const source: ChartData = {
      categories: Array.from({ length: 32 }, (_, index) => String(index)),
      series: Array.from({ length: 8 }, (_, index) => ({
        name: String(index),
        values: Array(32).fill(index),
      })),
      records: [],
    };
    expect(
      required(chart, source, { width: 2000, height: 600 }).rows.flatMap((row) => row.cells),
    ).toHaveLength(256);
    expect(() =>
      required(
        chart,
        { ...source, categories: [...source.categories, "over"] },
        { width: 2200, height: 600 },
      ),
    ).toThrow(/32-category, 8-series, 256-cell/);
    expect(() =>
      required(
        chart,
        { ...source, series: [...source.series, source.series[0]!] },
        { width: 2200, height: 600 },
      ),
    ).toThrow(/32-category, 8-series, 256-cell/);
  });

  test("label, formatted number and geometry budgets have resize/format hints", () => {
    expect(
      required(chart, { ...data, categories: ["x".repeat(4096), "north", "south"] }).categories[0]!
        .label.text,
    ).toHaveLength(4096);
    expect(() =>
      required(chart, { ...data, categories: ["x".repeat(4097), "north", "south"] }),
    ).toThrow(/4096-character.*Resize/);
    expect(() =>
      required(chart, {
        ...data,
        series: [
          {
            name: "format",
            values: [1, 2, 3],
            numberFormat: { kind: "custom", code: '"' + "a".repeat(256) + '"0' },
          },
        ],
      }),
    ).toThrow(/256-character/);
    expect(() => required(chart, data, { width: 220, height: 150 })).toThrow(/readable.*Resize/);
    expect(() => required(chart, data, { width: NaN, height: 400 })).toThrow(/finite positive/);
    expect(() =>
      createChartDataTablePlan(chart, data, { ...dimensions, resolveFontFamily: () => "" }),
    ).toThrow(/valid resolved font/);
  });
});

describe("table-only option reservation after full chart formatting", () => {
  test("clones the formatted option, preserves axes/series/title/legend, suppresses duplicate category labels", () => {
    const value = {
      ...chart,
      legend: true,
      elements: { ...chart.elements, legendPosition: "right" as const },
      format: {
        valueAxis: { title: "Value Axis", min: -20, max: 140 },
        categoryAxis: { title: "Categories", reverse: true, text: { color: "#123456" } },
        series: [{ id: "pear", axis: "secondary" as const, color: "#abcdef" }],
      },
    };
    const input = createChartOption(value, data, dimensions);
    const before = { ...input },
      plan = required(value);
    const result = prepareChartDataTableOption(input, plan);
    expect(result).not.toBe(input);
    expect(result.series).toBe(input.series);
    expect(result.title).toBe(input.title);
    expect(result.legend).toBe(input.legend);
    expect(input).toEqual(before);
    const originalX = Array.isArray(input.xAxis) ? input.xAxis : [input.xAxis];
    const x = result.xAxis as Array<{
      type: string;
      inverse?: boolean;
      axisLabel?: { show?: boolean };
      min?: number;
      max?: number;
    }>;
    expect(x).toHaveLength(originalX.length + 1);
    expect(
      x.slice(0, -1).every((axis) => axis.inverse === true && axis.axisLabel?.show === false),
    ).toBe(true);
    expect(x.at(-1)).toMatchObject({ type: "value", min: 1, max: 2, show: false, scale: true });
    const originalY = Array.isArray(input.yAxis) ? input.yAxis : [input.yAxis];
    expect((result.yAxis as unknown[]).slice(0, -1)).toEqual(
      originalY.map((axis) => ({
        ...axis,
        axisLine: { ...axis?.axisLine, show: false },
        axisTick: { ...axis?.axisTick, show: false },
      })),
    );
    expect((result.grid as { bottom: number }).bottom).toBe(
      (input.grid as { bottom: number }).bottom + plan.tableHeight + plan.gap,
    );
  });

  test("off leaves old option identity unchanged and no probe can leak into it", () => {
    const option: EChartsOption = { series: [] };
    expect(prepareChartDataTableOption(option, undefined)).toBe(option);
  });

  test("existing title/legend strips and endpoint cells require readable remaining plot", () => {
    const option: EChartsOption = {
      grid: { left: 48, right: 22, top: 45, bottom: 35 },
      xAxis: { type: "category", boundaryGap: false, data: data.categories },
      yAxis: { type: "value" },
      series: [{ type: "line", data: [1, 2, 3] }],
    };
    const result = prepareChartDataTableOption(option, required());
    expect((result.grid as { left: number }).left).toBeGreaterThan(48 + required().labelGutter);
    expect(() =>
      prepareChartDataTableOption({ ...option, grid: { ...option.grid, top: 300 } }, required()),
    ).toThrow(/96×96px/);
  });
});

test("count-only print capture never measures before fonts are prepared and matches full plan text budget", () => {
  const expected = required().generatedTextUnits;
  vi.restoreAllMocks();
  const canvas = vi.spyOn(document, "createElement");
  expect(countChartDataTableText(chart, data)).toBe(expected);
  expect(canvas).not.toHaveBeenCalled();
  expect(countChartDataTableText({ ...chart, elements: { dataTable: "none" } }, data)).toBe(0);
});

test("point marker size leaves normalized data-table key layout and resource budgets unchanged", () => {
  const baseline: SheetChart = {
    ...chart,
    type: "line",
    format: {
      series: [
        { id: "apple", markers: true },
        { id: "pear", markers: false },
      ],
    },
  };
  const sized: SheetChart = {
    ...baseline,
    format: {
      series: [
        { id: "apple", markers: true, markerSizePt: 72 },
        { id: "pear", markers: false, markerSizePt: 2 },
      ],
    },
  };
  expect(required(sized)).toEqual(required(baseline));
  expect(countChartDataTableText(sized, data)).toBe(countChartDataTableText(baseline, data));
});

test("square data-table key changes geometry only, not cells, layout, text or primitive budgets", () => {
  const source: SheetChart = {
    ...chart,
    type: "line",
    format: { series: [{ id: "apple", markers: true, markerSizePt: 9 }] },
  };
  const baseline = required(source);
  const shaped = required({
    ...source,
    format: { series: [{ id: "apple", markers: true, markerSizePt: 9, markerSymbol: "square" }] },
  });
  expect(shaped.rows[0]?.markerSymbol).toBe("square");
  const { markerSymbol: _, ...row } = shaped.rows[0]!;
  expect({ ...shaped, rows: [row, ...shaped.rows.slice(1)] }).toEqual(baseline);
  const hidden = required({
    ...source,
    format: { series: [{ id: "apple", markers: false, markerSizePt: 9, markerSymbol: "square" }] },
  });
  expect(hidden.rows[0]?.key).toBe("line");
  expect(hidden.rows[0]).not.toHaveProperty("markerSymbol");
});
