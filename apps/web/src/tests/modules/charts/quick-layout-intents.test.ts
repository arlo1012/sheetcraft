// 未执行：本轮补写条形图快速布局回归，按用户要求不运行测试。
import { describe, expect, test } from "vitest";
import {
  normalizeSheetChart,
  type ChartData,
  type SheetChart,
} from "@sheetcraft/core/sheet-charts";
import {
  applyChartQuickLayout,
  getChartQuickLayout,
  type ChartQuickLayoutId,
} from "../../../modules/charts/chart-quick-layout";
import { createChartOption } from "../../../modules/charts/chart-option";

const data: ChartData = {
  categories: ["east", "north", "south"],
  series: [
    { id: "a", name: "apple", values: [60, 100, 120] },
    { id: "b", name: "pear", values: [70, 80, 90] },
  ],
  records: [],
};
function chart(): SheetChart {
  return normalizeSheetChart({
    type: "column",
    range: null,
    dataCache: data,
    title: "User chart title",
    headerRow: true,
    headerColumn: true,
    seriesBy: "columns",
    legend: true,
    labels: false,
    stacked: false,
    showHidden: true,
    presentation: { palette: ["#ff0000", "#00ff00"], background: "#222222" },
    format: {
      categoryAxis: { title: "User categories", reverse: true },
      valueAxis: {
        title: "User amount",
        min: 0,
        max: 200,
        majorUnit: 20,
        numberFormat: { kind: "custom", code: "0.00" },
      },
      secondaryValueAxis: { title: "Secondary", max: 300 },
      series: [{ id: "a", color: "#aa1234" }],
    },
  });
}

describe("eleven concrete quick-layout patches", () => {
  test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const)(
    "layout %s is a matched concrete patch without source or appearance loss",
    (id) => {
      const original = chart(),
        before = JSON.stringify(original);
      const next = applyChartQuickLayout(original, id, "坐标轴标题");
      expect(getChartQuickLayout(next)).toBe(id);
      expect(JSON.stringify(original)).toBe(before);
      expect(next.title).toBe(original.title);
      expect(next.dataCache).toEqual(original.dataCache);
      expect(next.dataCache).not.toBe(original.dataCache);
      expect(next.presentation).toEqual(original.presentation);
      expect(next.format?.series).toEqual(original.format?.series);
      expect(next.format?.secondaryValueAxis).toEqual(original.format?.secondaryValueAxis);
      expect(next.format?.categoryAxis?.title).toBe("User categories");
      expect(next.format?.valueAxis?.title).toBe("User amount");
      expect(next.format?.valueAxis?.numberFormat).toEqual(
        original.format?.valueAxis?.numberFormat,
      );
      expect(next.format?.valueAxis?.max).toBe(200);
      expect(Object.hasOwn(next, "layoutId")).toBe(false);
    },
  );
  test("table, gap-free and overlapping recipes have actual truth fields", () => {
    expect(applyChartQuickLayout(chart(), 5, "Axis Title").elements?.dataTable).toBe(
      "withLegendKeys",
    );
    expect(applyChartQuickLayout(chart(), 8, "Axis Title").format?.bar).toEqual({
      gapWidth: 0,
      overlap: 0,
    });
    const overlapping = applyChartQuickLayout(chart(), 10, "Axis Title");
    expect(overlapping.elements?.labelScope).toBe("lastSeries");
    expect(overlapping.format?.bar?.overlap).toBe(50);
  });
  test("hiding axis titles preserves their source text and painting consumes visibility", () => {
    const next = applyChartQuickLayout(chart(), 1, "Axis Title");
    const option = createChartOption(next, data);
    expect(!Array.isArray(option.xAxis) && option.xAxis?.name).toBe("");
    expect(!Array.isArray(option.yAxis) && option.yAxis?.name).toBe("");
    const shown = applyChartQuickLayout(next, 9, "Axis Title");
    const visible = createChartOption(shown, data);
    expect(!Array.isArray(visible.xAxis) && visible.xAxis?.name).toBe("User categories");
    expect(!Array.isArray(visible.yAxis) && visible.yAxis?.name).toBe("User amount");
  });
  test("gridline controls hide major lines or add bounded minor lines", () => {
    const hidden = createChartOption(applyChartQuickLayout(chart(), 8, "Axis Title"), data).yAxis;
    expect(!Array.isArray(hidden) && hidden?.splitLine?.show).toBe(false);
    const fine = createChartOption(applyChartQuickLayout(chart(), 7, "Axis Title"), data).yAxis;
    expect(!Array.isArray(fine) && fine?.minorSplitLine?.show).toBe(true);
    expect(!Array.isArray(fine) && fine?.minorTick?.splitNumber).toBe(5);
  });
  test("last-category and last-series labels render only the declared scope with raw formatted values", () => {
    function label(id: ChartQuickLayoutId, seriesIndex: number, categoryIndex: number) {
      const option = createChartOption(applyChartQuickLayout(chart(), id, "Axis Title"), data);
      const series = Array.isArray(option.series) ? option.series[seriesIndex] : option.series;
      if (!series || series.type !== "bar") throw new Error("Missing actual bar labels");
      const formatter =
        series.label && "formatter" in series.label ? series.label.formatter : undefined;
      if (typeof formatter !== "function") throw new Error("Missing actual label formatter");
      return formatter({
        componentType: "series",
        componentIndex: 0,
        componentSubType: "bar",
        seriesType: "bar",
        seriesIndex,
        seriesName: data.series[seriesIndex]!.name,
        name: data.categories[categoryIndex]!,
        dataIndex: categoryIndex,
        data: data.series[seriesIndex]!.values[categoryIndex]!,
        value: data.series[seriesIndex]!.values[categoryIndex]!,
        color: "#ffffff",
        $vars: [],
      });
    }
    expect(label(6, 0, 0)).toBe("");
    expect(label(6, 0, 2)).toBe("apple, 120");
    expect(label(10, 0, 1)).toBe("");
    expect(label(10, 1, 1)).toBe("80");
  });
  test("missing axis-title text gets only the requested localized placeholder", () => {
    const base = chart();
    delete base.format?.categoryAxis?.title;
    delete base.format?.valueAxis?.title;
    const next = applyChartQuickLayout(base, 9, "坐标轴标题");
    expect(next.format?.categoryAxis?.title).toBe("坐标轴标题");
    expect(next.format?.valueAxis?.title).toBe("坐标轴标题");
  });
  test("unsupported types, malformed IDs and placeholders do not mutate the source", () => {
    const base = chart(),
      before = JSON.stringify(base);
    expect(() => applyChartQuickLayout(base, 0 as ChartQuickLayoutId, "Axis Title")).toThrow();
    expect(() => applyChartQuickLayout(base, 1, "")).toThrow();
    expect(() => applyChartQuickLayout({ ...base, type: "line" }, 1, "Axis Title")).toThrow();
    expect(JSON.stringify(base)).toBe(before);
  });
  test("manual changes make the effective layout custom", () => {
    const base = applyChartQuickLayout(chart(), 1, "Axis Title");
    expect(
      getChartQuickLayout({ ...base, elements: { ...base.elements, legendPosition: "left" } }),
    ).toBeUndefined();
  });
});

describe("ten WPS horizontal-bar quick layouts", () => {
  function bar(): SheetChart {
    return { ...chart(), type: "bar" };
  }

  test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const)(
    "layout %s matches without changing the bar type, raw source, user text, or unrelated appearance",
    (id) => {
      const source = bar();
      const before = structuredClone(source);
      const next = applyChartQuickLayout(source, id, "Axis Title");
      expect(getChartQuickLayout(next)).toBe(id);
      expect(next.type).toBe("bar");
      expect(next.dataCache).toEqual(before.dataCache);
      expect(next.range).toEqual(before.range);
      expect(next.title).toBe(before.title);
      expect(next.headerRow).toBe(before.headerRow);
      expect(next.headerColumn).toBe(before.headerColumn);
      expect(next.seriesBy).toBe(before.seriesBy);
      expect(next.showHidden).toBe(before.showHidden);
      expect(next.presentation).toEqual(before.presentation);
      expect(next.format?.series).toEqual(before.format?.series);
      expect(next.format?.valueAxis?.min).toBe(before.format?.valueAxis?.min);
      expect(next.format?.valueAxis?.max).toBe(before.format?.valueAxis?.max);
      expect(next.format?.valueAxis?.numberFormat).toEqual(before.format?.valueAxis?.numberFormat);
      expect(source).toEqual(before);
    },
  );

  test("bar layout 5 shows a keyed data table with both axis titles hidden", () => {
    const next = applyChartQuickLayout(bar(), 5, "Axis Title");
    expect(next.elements?.dataTable).toBe("withLegendKeys");
    expect(next.format?.categoryAxis?.titleVisible).toBe(false);
    expect(next.format?.valueAxis?.titleVisible).toBe(false);
    expect(next.format?.categoryAxis?.title).toBe("User categories");
    expect(next.format?.valueAxis?.title).toBe("User amount");
  });

  test("bar layouts 6, 8, 9, and 10 retain their distinct WPS element choices", () => {
    const six = applyChartQuickLayout(bar(), 6, "Axis Title");
    expect(six.labels).toBe(true);
    expect(six.elements).toMatchObject({
      labelScope: "lastCategory",
      labelContent: "seriesAndValue",
    });
    expect(six.format?.valueAxis?.titleVisible).toBe(true);
    expect(six.format?.categoryAxis?.titleVisible).toBe(false);
    const eight = applyChartQuickLayout(bar(), 8, "Axis Title");
    expect(eight.legend).toBe(true);
    expect(eight.elements?.legendPosition).toBe("right");
    expect(eight.format?.categoryAxis?.titleVisible).toBe(true);
    expect(eight.format?.valueAxis?.titleVisible).toBe(true);
    const nine = applyChartQuickLayout(bar(), 9, "Axis Title");
    expect(nine.labels).toBe(true);
    expect(nine.elements).toMatchObject({
      labelScope: "lastSeries",
      labelPosition: "insideEnd",
      labelContent: "value",
    });
    expect(nine.format?.bar?.overlap).toBeGreaterThan(0);
    const ten = applyChartQuickLayout(bar(), 10, "Axis Title");
    expect(ten.elements?.titlePosition).toBe("none");
    expect(ten.legend).toBe(true);
    expect(ten.elements?.legendPosition).toBe("right");
    expect(ten.title).toBe("User chart title");
  });

  test.each([2, 4, 6] as const)(
    "bar layout %s places clustered labels outside and stacked or percentage labels at the center",
    (id) => {
      for (const variant of ["clustered", "stacked", "percent"] as const) {
        const base = bar();
        const source: SheetChart = {
          ...base,
          stacked: variant !== "clustered",
          presentation: {
            ...base.presentation,
            ...(variant === "percent" ? { percentStacked: true } : {}),
          },
        };
        const before = structuredClone(source);
        const next = applyChartQuickLayout(source, id, "Axis Title");
        expect(next.elements?.labelPosition).toBe(
          variant === "clustered" ? "outsideEnd" : "center",
        );
        expect(next.type).toBe("bar");
        expect(next.stacked).toBe(source.stacked);
        expect(next.presentation?.percentStacked).toBe(source.presentation?.percentStacked);
        expect(next.dataCache).toEqual(before.dataCache);
        const option = createChartOption(next, data);
        const series = option.series as unknown as Array<{
          type: string;
          data: Array<{ label: { position: string } }>;
        }>;
        for (const entry of series) {
          expect(entry.type).toBe("bar");
          expect(entry.data.map((point) => point.label.position)).toEqual(
            data.categories.map(() => (variant === "clustered" ? "right" : "inside")),
          );
        }
        expect(source).toEqual(before);
      }
    },
  );

  test("bar layout 6 labels only the last category and layout 9 only the last series", () => {
    function label(id: 6 | 9, seriesIndex: number, categoryIndex: number) {
      const option = createChartOption(applyChartQuickLayout(bar(), id, "Axis Title"), data);
      const series = option.series as unknown as Array<{
        label: { formatter: (params: { value: number | null; dataIndex: number }) => string };
      }>;
      return series[seriesIndex]!.label.formatter({
        value: data.series[seriesIndex]!.values[categoryIndex]!,
        dataIndex: categoryIndex,
      });
    }
    expect(label(6, 0, 0)).toBe("");
    expect(label(6, 1, 1)).toBe("");
    expect(label(6, 0, 2)).toBe("apple, 120");
    expect(label(6, 1, 2)).toBe("pear, 90");
    expect(label(9, 0, 1)).toBe("");
    expect(label(9, 1, 1)).toBe("80");
  });

  test("layout 11 is rejected for horizontal bars without mutating its source", () => {
    const source = bar();
    const before = structuredClone(source);
    expect(() => applyChartQuickLayout(source, 11, "Axis Title")).toThrow();
    expect(source).toEqual(before);
  });
});

test("Layout3 separated pair spacing differs from touching-series layouts", () => {
  const layout3 = applyChartQuickLayout(chart(), 3, "Axis Title");
  expect(layout3.format?.bar?.overlap).toBe(-25);
  expect(getChartQuickLayout(layout3)).toBe(3);
});

test("quick layout initializes only new titles and retains hidden title typography", () => {
  const original = chart();
  original.format = { categoryAxis: { text: { color: "#ff0000" } } };
  const shown = applyChartQuickLayout(original, 7, "Axis Title");
  expect(shown.format?.categoryAxis).toMatchObject({
    title: "Axis Title",
    titleVisible: true,
    titleRotation: 0,
    text: { color: "#ff0000" },
    titleText: { fontSize: 40 / 3, bold: true },
  });
  expect(shown.format?.valueAxis).toMatchObject({ titleRotation: -90, titleText: { bold: true } });
  const hidden = applyChartQuickLayout(shown, 1, "Axis Title");
  expect(hidden.format?.categoryAxis).toMatchObject({
    titleVisible: false,
    title: "Axis Title",
    titleRotation: 0,
  });
  expect(hidden.format?.categoryAxis?.titleText).toEqual(shown.format?.categoryAxis?.titleText);
  const restored = applyChartQuickLayout(hidden, 7, "Different placeholder");
  expect(restored.format?.categoryAxis?.titleText).toEqual(shown.format?.categoryAxis?.titleText);
  expect(restored.format?.categoryAxis?.title).toBe("Axis Title");
});
