// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { createChartOption } from "../../../modules/charts/chart-option";
import { init } from "../../../modules/charts/chart-runtime";

const palette = ["#123456", "#654321", "#abcdef"];
const chart: SheetChart = {
  type: "pie",
  range: null,
  title: "",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: true,
  labels: true,
  stacked: false,
  showHidden: false,
  presentation: { palette },
};
const dimensions = { width: 640, height: 400 };
type Option = ReturnType<typeof createChartOption>;
type Slice = {
  name: string;
  value: number | "-";
  label?: { formatter?: () => string };
};
type GraphicNode = { type: string; children?: GraphicNode[]; style?: { text?: string } };
type PieSeries = {
  type: string;
  radius: string | number | [string | number, string | number];
  data: Slice[];
  label?: {
    formatter?: (params: { value: number; dataIndex: number; data: Slice }) => string;
  };
  renderItem?: (params: { dataIndex: number }) => GraphicNode | undefined;
};
function series(option: Option) {
  return option.series as unknown as PieSeries[];
}
function data(
  values: Array<Array<number | null>>,
  categories = ["Alpha", "Beta", "Gamma"],
): ChartData {
  return {
    categories,
    records: [],
    series: values.map((values, index) => ({
      id: `series-${index}`,
      name: `Y${index + 1}`,
      colorIndex: index,
      values,
      numberFormat: { kind: "number", fractionDigits: 1 },
    })),
  };
}
function radius(value: string | number) {
  return typeof value === "number" ? value : Number.parseFloat(value);
}
function graphicNodes(node: GraphicNode | undefined): GraphicNode[] {
  return node ? [node, ...(node.children ?? []).flatMap(graphicNodes)] : [];
}
function labelAt(entry: PieSeries, index: number) {
  const slice = entry.data[index]!;
  if (slice.label?.formatter) return slice.label.formatter();
  if (entry.type === "custom")
    return graphicNodes(entry.renderItem?.({ dataIndex: index }))
      .filter((node) => node.type === "text")
      .map((node) => node.style?.text ?? "")
      .join("");
  return entry.label?.formatter?.({ value: slice.value as number, dataIndex: index, data: slice });
}
type NativeData = {
  count(): number;
  getName(index: number): string;
  getItemVisual(index: number, key: string): { fill: string };
};
type NativeModel = {
  getSeries(): Array<{ getData(): NativeData }>;
  getComponent(name: string): { getData(): Array<{ get(name: string): string }> };
};
function rendered(option: Option) {
  const instance = init(null, undefined, { renderer: "svg", ssr: true, ...dimensions });
  try {
    instance.setOption(option);
    const model = (instance as unknown as { getModel(): NativeModel }).getModel();
    return {
      legend: model
        .getComponent("legend")
        .getData()
        .map((entry) => entry.get("name")),
      colors: model.getSeries().map((entry) => {
        const values = entry.getData();
        return Object.fromEntries(
          Array.from({ length: values.count() }, (_, index) => [
            values.getName(index),
            values.getItemVisual(index, "style").fill,
          ]),
        );
      }),
    };
  } finally {
    instance.dispose();
  }
}

describe("pie and doughnut chart WPS behavior", () => {
  test("ordinary pie plots only the first Y series", () => {
    const source = data([
      [2, 4, 6],
      [10, 20, 30],
    ]);
    const before = structuredClone(source);
    const plotted = series(createChartOption(chart, source, dimensions));
    expect(plotted).toHaveLength(1);
    expect(plotted[0]).toMatchObject({ type: "pie" });
    expect(plotted[0]!.data.map(({ name, value }) => ({ name, value }))).toEqual([
      { name: "Alpha", value: 2 },
      { name: "Beta", value: 4 },
      { name: "Gamma", value: 6 },
    ]);
    expect(source).toEqual(before);
  });

  test("doughnut puts the first Y innermost with a 50 percent hole and equally wide adjacent rings", () => {
    const source = data([
      [2, 4, 6],
      [10, 20, 30],
      [7, 8, 9],
    ]);
    const plotted = series(createChartOption({ ...chart, type: "doughnut" }, source, dimensions));
    expect(plotted).toHaveLength(3);
    expect(plotted.map((entry) => entry.data.map((slice) => slice.value))).toEqual(
      source.series.map((entry) => entry.values),
    );
    const rings = plotted.map((entry) => {
      expect(Array.isArray(entry.radius)).toBe(true);
      const [inner, outer] = entry.radius as [string | number, string | number];
      return [radius(inner), radius(outer)] as const;
    });
    expect(rings[0]![0] / rings[2]![1]).toBeCloseTo(0.5);
    const widths = rings.map(([inner, outer]) => outer - inner);
    expect(widths[0]).toBeGreaterThan(0);
    for (let index = 1; index < rings.length; index++) {
      expect(rings[index]![0]).toBeCloseTo(rings[index - 1]![1]);
      expect(widths[index]).toBeCloseTo(widths[0]!);
    }
  });

  test.each(["pie", "doughnut"] as const)(
    "%s uses absolute slice sizes while labels and source values retain their signs",
    (type) => {
      const source = data([[null, -3, 0, 9]], ["Missing", "Negative", "Zero", "Positive"]);
      const before = structuredClone(source);
      const plotted = series(createChartOption({ ...chart, type }, source, dimensions))[0]!;
      const numericSlices = plotted.data.filter(
        (slice): slice is Slice & { value: number } => typeof slice.value === "number",
      );
      expect(numericSlices.map(({ name, value }) => ({ name, value }))).toEqual([
        { name: "Negative", value: 3 },
        { name: "Zero", value: 0 },
        { name: "Positive", value: 9 },
      ]);
      const total = numericSlices.reduce((sum, slice) => sum + slice.value, 0);
      const negativeIndex = plotted.data.findIndex((slice) => slice.name === "Negative");
      const positiveIndex = plotted.data.findIndex((slice) => slice.name === "Positive");
      expect((plotted.data[negativeIndex]!.value as number) / total).toBeCloseTo(0.25);
      expect((plotted.data[positiveIndex]!.value as number) / total).toBeCloseTo(0.75);
      const formatter = plotted.label?.formatter;
      expect(typeof formatter).toBe("function");
      expect(
        formatter!({ value: 3, dataIndex: negativeIndex, data: plotted.data[negativeIndex]! }),
      ).toBe("-3.0");
      expect(
        formatter!({ value: 9, dataIndex: positiveIndex, data: plotted.data[positiveIndex]! }),
      ).toBe("9.0");
      expect(source).toEqual(before);
    },
  );

  test.each(["pie", "doughnut"] as const)("%s retains a zero category in its legend", (type) => {
    const source = data([[-3, 0, 9]], ["Negative", "Zero", "Positive"]);
    expect(rendered(createChartOption({ ...chart, type }, source, dimensions)).legend).toEqual([
      "Negative",
      "Zero",
      "Positive",
    ]);
  });

  test.each(["pie", "doughnut"] as const)(
    "%s colors categories consistently when the chosen Y series changes",
    (type) => {
      const source = data([
        [2, 4, 6],
        [10, 20, 30],
      ]);
      const first = rendered(createChartOption({ ...chart, type }, source, dimensions));
      const second = rendered(
        createChartOption(
          { ...chart, type },
          {
            ...source,
            series: [source.series[1]!],
          },
          dimensions,
        ),
      );
      const expected = { Alpha: palette[0], Beta: palette[1], Gamma: palette[2] };
      for (const colors of first.colors) expect(colors).toEqual(expected);
      expect(second.colors).toEqual([expected]);
    },
  );

  test.each([
    { type: "pie" as const, pieStyle: undefined },
    { type: "pie" as const, pieStyle: "threeD" as const },
    { type: "doughnut" as const, pieStyle: undefined },
  ])("$type/$pieStyle percent labels retain the original negative sign", ({ type, pieStyle }) => {
    for (const pieLabels of ["percent", "categoryPercent"] as const) {
      const source = data([[-3, 9]], ["Negative", "Positive"]);
      const before = structuredClone(source);
      const plotted = series(
        createChartOption(
          {
            ...chart,
            type,
            presentation: { palette, pieLabels, ...(pieStyle ? { pieStyle } : {}) },
          },
          source,
          dimensions,
        ),
      );
      const visible =
        pieStyle === "threeD" ? plotted.find((entry) => entry.type === "custom")! : plotted[0]!;
      expect(labelAt(visible, 0)).toBe(pieLabels === "percent" ? "-25%" : "Negative\n-25%");
      expect(labelAt(visible, 1)).toBe(pieLabels === "percent" ? "75%" : "Positive\n75%");
      expect(source).toEqual(before);
    }
  });

  test.each(["pieOfPie", "barOfPie"] as const)(
    "%s splits the last rounded-up third into a real secondary series and labels the aggregate share",
    (pieStyle) => {
      for (const count of [4, 7]) {
        const values = Array.from(
          { length: count },
          (_, index) => (index % 2 ? 1 : -1) * (index + 1),
        );
        const categories = values.map((_, index) => `Category ${index + 1}`);
        const source = data([values], categories);
        const before = structuredClone(source);
        const firstTail = count - Math.ceil(count / 3);
        const absolute = values.map(Math.abs);
        const total = absolute.reduce((sum, value) => sum + value, 0);
        const aggregate = absolute.slice(firstTail).reduce((sum, value) => sum + value, 0);
        for (const pieLabels of ["percent", "categoryPercent"] as const) {
          const plotted = series(
            createChartOption(
              {
                ...chart,
                presentation: { palette, pieStyle, pieLabels },
              },
              source,
              dimensions,
            ),
          );
          expect(plotted).toHaveLength(2);
          const [main, secondary] = plotted as [PieSeries, PieSeries];
          expect(main.type).toBe("pie");
          expect(main.data.slice(0, count).map((slice) => slice.value)).toEqual(
            absolute.map((value, index) => (index < firstTail ? value : 0)),
          );
          const sumIndex = main.data.findIndex((slice) => slice.name === "Σ");
          expect(main.data[sumIndex]!.value).toBe(aggregate);
          expect(labelAt(main, sumIndex)).toBe(`${Math.round((aggregate / total) * 100)}%`);
          expect(labelAt(main, 0)).toBe(
            `${pieLabels === "categoryPercent" ? `${categories[0]}\n` : ""}${Math.round((absolute[0]! / total) * 100)}%`,
          );
          expect(secondary.type).toBe(pieStyle === "pieOfPie" ? "pie" : "custom");
          expect(secondary.data.map(({ name, value }) => ({ name, value }))).toEqual(
            categories
              .slice(firstTail)
              .map((name, index) => ({ name, value: absolute[firstTail + index] })),
          );
          secondary.data.forEach((_slice, index) => {
            const categoryIndex = firstTail + index;
            expect(labelAt(secondary, index)).toBe(
              `${pieLabels === "categoryPercent" ? `${categories[categoryIndex]}\n` : ""}${Math.round((absolute[categoryIndex]! / total) * 100)}%`,
            );
            if (pieStyle === "barOfPie")
              expect(
                graphicNodes(secondary.renderItem?.({ dataIndex: index })).some(
                  (node) => node.type === "rect",
                ),
              ).toBe(true);
          });
          expect(source).toEqual(before);
        }
      }
    },
  );
});
