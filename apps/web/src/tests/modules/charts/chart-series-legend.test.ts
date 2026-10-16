import { describe, expect, test } from "vitest";
import type { EChartsOption, SeriesOption } from "echarts";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { init } from "../../../modules/charts/chart-runtime";
import { createChartOption } from "../../../modules/charts/chart-option";
import { applySeriesLegendIdentity } from "../../../modules/charts/chart-series-legend";
import { getChartFormatClickTarget } from "../../../modules/charts/chart-format-selection";
import { comboChart, comboData } from "./combo-fixture";

const chart: SheetChart = {
  type: "bar",
  range: null,
  title: "Sales",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: true,
  labels: true,
  stacked: false,
  showHidden: false,
};
const data: ChartData = {
  categories: ["Positive", "Negative", "Missing"],
  records: [],
  series: [
    {
      id: "apple",
      rangeBand: { seriesBy: "columns", index: 1 },
      colorIndex: 0,
      name: "Apples",
      values: [60, -100, 0],
    },
    {
      id: "pear",
      rangeBand: { seriesBy: "columns", index: 2 },
      colorIndex: 1,
      name: "Pears",
      values: [70, 80, null],
    },
  ],
};
function series(option: EChartsOption) {
  if (!Array.isArray(option.series)) throw new Error("series");
  return option.series;
}
function legend(option: EChartsOption) {
  if (!option.legend || Array.isArray(option.legend)) throw new Error("legend");
  return option.legend;
}
function key(item: SeriesOption) {
  if (typeof item.name !== "string") throw new Error("name");
  return item.name;
}
function labels(option: EChartsOption) {
  const entry = legend(option);
  const formatter = entry.formatter;
  if (typeof formatter !== "function") throw new Error("formatter");
  return entry.data!.map((item) => formatter(typeof item === "string" ? item : item.name!));
}
type NativeSeries = {
  id: string;
  name: string;
  seriesIndex: number;
  getData(): {
    getVisual(name: string): { fill: string };
    getItemGraphicEl(index: number): { currentStates: string[] };
  };
};
type NativeModel = {
  getSeries(): NativeSeries[];
  isSeriesFiltered(series: NativeSeries): boolean;
  getComponent(name: string): { getData(): { get(name: string): string }[] };
};
function render(
  option: EChartsOption,
  inspect: (instance: ReturnType<typeof init>, model: NativeModel) => void,
) {
  const instance = init(null, undefined, { renderer: "svg", ssr: true, width: 640, height: 380 });
  try {
    instance.setOption(option);
    inspect(instance, (instance as unknown as { getModel(): NativeModel }).getModel());
  } finally {
    instance.dispose();
  }
}
function paints(option: EChartsOption) {
  let result: string[] = [];
  render(option, (_instance, model) => {
    result = model.getSeries().map((s) => s.getData().getVisual("style").fill);
  });
  return result;
}

describe("Cartesian legend render identities", () => {
  test.each([undefined, "top", "bottom", "left", "right", "topRight"] as const)(
    "bar-only reverse at %s retains series/source identity",
    (legendPosition) => {
      const snapshot = structuredClone(data);
      const option = createChartOption(
        { ...chart, ...(legendPosition ? { elements: { legendPosition } } : {}) },
        data,
      );
      expect(labels(option)).toEqual(["Pears", "Apples"]);
      expect(
        series(option).map((s) => ({ id: s.id, data: s.type === "bar" ? s.data : [] })),
      ).toEqual(data.series.map((s) => ({ id: s.id, data: s.values })));
      expect(paints(option)).toEqual(["#2563eb", "#16a34a"]);
      render(option, (instance, model) => {
        const names = model
          .getComponent("legend")
          .getData()
          .map((s) => s.get("name"));
        expect(names).toEqual(series(option).map(key).reverse());
        const svg = instance.renderToSVGString();
        expect(svg).toContain("Pears");
        expect(svg).toContain("Apples");
        expect(svg).not.toContain("sheetcraft-series:");
      });
      expect(data).toEqual(snapshot);
    },
  );
  test.each(["column", "line", "area", "scatter"] as const)(
    "%s keeps source legend order and non-bar behavior",
    (type) => {
      const option = createChartOption({ ...chart, type }, data);
      expect(labels(option)).toEqual(type === "scatter" ? ["Pears"] : ["Apples", "Pears"]);
    },
  );
  test.each([
    { names: ["same", "same"] },
    { names: ["", ""] },
    { names: ["same\nname", "same\nname"] },
  ])("equal/empty labels %j retain separate entries and selection", ({ names }) => {
    const source = {
      ...data,
      series: data.series.map((s, i) => ({
        ...s,
        name: names[i]!,
        values: s.values.map((value) => value ?? 0),
      })),
    };
    const activeChart: SheetChart = {
      ...chart,
      elements: { legendPosition: "bottom" },
      source: {
        kind: "series",
        categories: { kind: "generated" },
        series: source.series.map((entry) => ({
          id: entry.id!,
          colorIndex: entry.colorIndex!,
          name: { kind: "literal", text: entry.name },
          values: { kind: "literal", values: entry.values },
        })),
      },
    };
    const option = createChartOption(activeChart, source);
    expect(labels(option)).toEqual([...names].reverse().map((s) => s.replace(/[\r\n]+/g, " ")));
    render(option, (instance, model) => {
      expect(model.getComponent("legend").getData()).toHaveLength(2);
      const [first, second] = model.getSeries();
      expect(first!.id).toBe("apple");
      expect(second!.id).toBe("pear");
      instance.dispatchAction({ type: "legendToggleSelect", name: second!.name });
      expect(model.isSeriesFiltered(first!)).toBe(false);
      expect(model.isSeriesFiltered(second!)).toBe(true);
      instance.dispatchAction({ type: "legendToggleSelect", name: second!.name });
      expect(model.isSeriesFiltered(second!)).toBe(false);
      instance.dispatchAction({ type: "highlight", seriesName: second!.name });
      instance.getZr().animation.update();
      expect(first!.getData().getItemGraphicEl(0).currentStates).not.toContain("emphasis");
      expect(second!.getData().getItemGraphicEl(0).currentStates).toContain("emphasis");
      expect(
        getChartFormatClickTarget(
          { componentType: "series", seriesId: second!.id, seriesIndex: 1 },
          activeChart,
          source,
        ),
      ).toMatchObject({ kind: "series", seriesId: "pear" });
    });
  });
  test("stable IDs/range bands survive rename, reorder and visible-data filtering", () => {
    const first = createChartOption(chart, data);
    const swapped = createChartOption(chart, {
      ...data,
      series: [{ ...data.series[1]!, name: "renamed" }, data.series[0]!],
    });
    expect(series(swapped).map(key)).toEqual(series(first).map(key).reverse());
    const filtered = createChartOption(
      { ...chart, seriesFilter: { hiddenSeriesIds: ["apple"] } },
      { ...data, series: [data.series[1]!] },
    );
    expect(series(filtered).map(key)).toEqual([key(series(first)[1]!)]);
    expect(labels(filtered)).toEqual(["Pears"]);
    expect(paints(filtered)).toEqual(["#16a34a"]);
    const ranges = { ...data, series: data.series.map(({ id: _id, ...s }) => s) };
    expect(
      series(createChartOption(chart, { ...ranges, series: [ranges.series[1]!] })).map(key),
    ).toEqual([key(series(createChartOption(chart, ranges))[1]!)]);
  });
  test("combo equal labels retain independent plain-line icon and color", () => {
    const source = { ...comboData, series: comboData.series.map((s) => ({ ...s, name: "same" })) };
    const option = createChartOption(comboChart(), source);
    expect(labels(option)).toEqual(["same", "same"]);
    expect(legend(option).data).toHaveLength(2);
    expect(legend(option).data![1]).toMatchObject({ icon: "line", itemStyle: { borderWidth: 5 } });
    expect(series(option).map((s) => s.id)).toEqual(["apple", "pear"]);
    expect(paints(option)).toEqual(["#2563eb", "#a1b2c3"]);
  });
  test.each([
    { names: ["same", "same", "other"], explicit: [undefined, undefined, undefined] },
    { names: ["", "", "other"], explicit: [undefined, undefined, undefined] },
    { names: ["same", "same", "other"], explicit: ["#ff0000", undefined, undefined] },
    { names: ["same", "same", "other"], explicit: [undefined, "#ff0000", undefined] },
    { names: ["a", "b", "c"], explicit: ["#ff0000", undefined, "#0000ff"] },
  ])(
    "preserves original ECharts automatic cache and explicit-color skipping %j",
    ({ names, explicit }) => {
      const source: ChartData = {
        categories: ["x"],
        records: [],
        series: names.map((name, i) => ({ name, values: [i + 1] })),
      };
      const original: EChartsOption = {
        animation: false,
        color: ["#123456", "#abcdef", "#778899"],
        xAxis: { type: "category", data: ["x"] },
        yAxis: { type: "value" },
        legend: {},
        series: source.series.map((s, i) => ({
          type: "bar",
          name: s.name,
          data: s.values,
          ...(explicit[i] ? { itemStyle: { color: explicit[i] } } : {}),
        })),
      };
      const projected = applySeriesLegendIdentity(original, { ...chart, type: "column" }, source);
      expect(paints(projected)).toEqual(paints(original));
      expect(new Set(series(projected).map(key)).size).toBe(3);
      expect(labels(projected)).toEqual(names);
    },
  );
  test("tooltip retains raw names, category and number formatting without keys", () => {
    const source = {
      ...data,
      series: data.series.map((s) => ({
        ...s,
        name: "same",
        numberFormat: { kind: "currency" as const, currency: "USD", fractionDigits: 2 },
      })),
    };
    const option = createChartOption(chart, source);
    const item = series(option)[1]!;
    const formatter = item.tooltip?.formatter;
    if (typeof formatter !== "function") throw new Error("tooltip");
    const text = formatter(
      {
        seriesName: key(item),
        name: "Negative",
        dataIndex: 1,
        value: 80,
        marker: "●",
      } as Parameters<typeof formatter>[0],
      "",
      () => {},
    );
    expect(text).toBe("same\n●Negative: $80.00");
    expect(text).not.toContain("sheetcraft-series:");
  });
  test("percentage tooltip keeps raw currency and seriesAndValue labels keep original names", () => {
    const source: ChartData = {
      ...data,
      series: data.series.map((s) => ({
        ...s,
        name: "Same",
        numberFormat: { kind: "currency", currency: "USD", fractionDigits: 2 },
      })),
    };
    const option = createChartOption(
      {
        ...chart,
        stacked: true,
        presentation: { percentStacked: true },
        elements: { labelContent: "seriesAndValue" },
      },
      source,
    );
    const item = series(option)[1]!;
    const tooltip = item.tooltip?.formatter;
    const labelFormatter = item.type === "bar" ? item.label?.formatter : undefined;
    if (typeof tooltip !== "function" || typeof labelFormatter !== "function")
      throw new Error("formatters");
    expect(
      tooltip(
        { name: "Negative", dataIndex: 1, value: 80 / 180 } as Parameters<typeof tooltip>[0],
        "",
        () => {},
      ),
    ).toBe("Same\nNegative: $80.00");
    expect(
      labelFormatter({ dataIndex: 1, value: 80 / 180 } as Parameters<typeof labelFormatter>[0]),
    ).toBe("Same, $80.00");
  });
  test("scatter tooltip retains formatted X/Y values and a blank user name without a key header", () => {
    const source: ChartData = {
      categories: ["x"],
      records: [],
      series: [
        { name: "X", values: [0.5], numberFormat: { kind: "percent", fractionDigits: 0 } },
        {
          name: "",
          values: [12],
          numberFormat: { kind: "currency", currency: "USD", fractionDigits: 2 },
        },
      ],
    };
    const item = series(createChartOption({ ...chart, type: "scatter" }, source))[0]!;
    const tooltip = item.tooltip?.formatter;
    if (typeof tooltip !== "function") throw new Error("formatter");
    expect(
      tooltip(
        { name: "", dataIndex: 0, value: [0.5, 12] } as Parameters<typeof tooltip>[0],
        "",
        () => {},
      ),
    ).toBe("50% / $12.00");
  });
  test.each(["pie", "doughnut", "radar", "river"] as const)(
    "%s data-owned legend is not projected",
    (type) => {
      const option = createChartOption({ ...chart, type }, data);
      expect(JSON.stringify(option)).not.toContain("sheetcraft-series:");
    },
  );
});
