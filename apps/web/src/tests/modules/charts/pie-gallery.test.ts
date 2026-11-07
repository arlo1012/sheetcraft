// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import type { PieFamily } from "@sheetcraft/core/chart-presentation";
import type { ChartPresentationSettings } from "@sheetcraft/core/chart-presentation";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { pieCardsByFamily } from "../../../modules/charts/chart-pie-cards";
import {
  applyPieInsertChoice,
  normalizeChartInsertIntent,
  type PieInsertChoice,
} from "../../../modules/charts/chart-design-intents";
import { createChartOption } from "../../../modules/charts/chart-option";

const galleryCounts: Array<{ family: PieFamily; count: number }> = [
  { family: "pie", count: 36 },
  { family: "threeD", count: 18 },
  { family: "pieOfPie", count: 31 },
  { family: "barOfPie", count: 27 },
  { family: "doughnut", count: 36 },
];
const chart: SheetChart = {
  type: "pie",
  range: null,
  title: "",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: true,
  labels: false,
  stacked: false,
  showHidden: false,
};
const data: ChartData = {
  categories: ["Alpha", "Beta", "Gamma", "Delta"],
  series: [{ name: "Values", values: [10, 20, 30, 40] }],
  records: [],
};
function choice(family: PieFamily, card: number): PieInsertChoice {
  return {
    type: family === "doughnut" ? "doughnut" : "pie",
    pieFamily: family,
    card,
    followTheme: false,
  };
}
function apply(family: PieFamily, card: number) {
  return applyPieInsertChoice(chart, choice(family, card));
}
type Slice = {
  name: string;
  value: number | "-";
  itemStyle?: { color?: unknown; borderColor?: string; decal?: unknown };
  label?: { backgroundColor?: string; borderColor?: string };
};
type GalleryNode = {
  type: string;
  z2?: number;
  style?: {
    fill?: unknown;
    stroke?: string;
    decal?: unknown;
    backgroundColor?: string;
    borderColor?: string;
  };
  children?: GalleryNode[];
};
type GallerySeries = {
  type: string;
  radius?: number | string | [number | string, number | string];
  label?: { position?: string; backgroundColor?: unknown; borderColor?: string };
  labelLine?: { show?: boolean };
  renderItem?: (params: { dataIndex: number }) => GalleryNode | undefined;
  data: Slice[];
};
function series(result: ReturnType<typeof createChartOption>) {
  return result.series as unknown as GallerySeries[];
}
function option(family: PieFamily, card: number) {
  return createChartOption(apply(family, card), data, { width: 640, height: 400 });
}
function holeRatio(card: number) {
  const radii = series(option("doughnut", card))[0]!.radius as [string, string];
  return Number.parseFloat(radii[0]) / Number.parseFloat(radii[1]);
}
function nodes(node: GalleryNode | undefined): GalleryNode[] {
  return node ? [node, ...(node.children ?? []).flatMap(nodes)] : [];
}

describe("complete pie insertion gallery", () => {
  test.each(galleryCounts)(
    "$family has $count cards with independent insertion bounds",
    ({ family, count }) => {
      expect(pieCardsByFamily[family]).toHaveLength(count);
      for (const card of [0, count - 1]) {
        const input = choice(family, card);
        expect(normalizeChartInsertIntent(input)).toEqual(input);
      }
      for (const card of [-1, count, count + 1, 0.5])
        expect(() => normalizeChartInsertIntent(choice(family, card))).toThrow();
    },
  );

  test.each(galleryCounts)(
    "every $family card produces a renderable option and preserves its input",
    ({ family, count }) => {
      const before = structuredClone(chart);
      const sourceBefore = structuredClone(data);
      for (let index = 0; index < count; index++) {
        const selected = apply(family, index);
        expect(selected.type).toBe(family === "doughnut" ? "doughnut" : "pie");
        expect(selected.presentation?.pieStyle).toBe(
          family === "pie" || family === "doughnut" ? undefined : family,
        );
        const rendered = series(createChartOption(selected, data, { width: 640, height: 400 }));
        expect(rendered.length).toBeGreaterThan(0);
        expect(rendered.some((entry) => entry.data.length > 0)).toBe(true);
      }
      expect(chart).toEqual(before);
      expect(data).toEqual(sourceBefore);
    },
  );

  test("doughnut cards 1, 4 and 19 use successively smaller physical holes", () => {
    const large = holeRatio(0);
    const small = holeRatio(3);
    const smallest = holeRatio(18);
    expect(large).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(smallest);
    expect(smallest).toBeGreaterThan(0);
    expect(large).toBeLessThan(1);
    expect(apply("doughnut", 0).presentation?.doughnutHole).toBe(72);
    expect(apply("doughnut", 3).presentation?.doughnutHole).toBe(40);
    expect(apply("doughnut", 18).presentation?.doughnutHole).toBe(26);
    expect(large).toBeCloseTo(0.72);
    expect(small).toBeCloseTo(0.4);
    expect(smallest).toBeCloseTo(0.26);
  });

  test.each<{
    family: PieFamily;
    card: number;
    format: ChartPresentationSettings;
  }>([
    { family: "pie", card: 4, format: { pieLabelPlacement: "boxedOutside", pieStroke: "light" } },
    {
      family: "pie",
      card: 18,
      format: {
        pieExploded: true,
        pieLabelPlacement: "outside",
        pieFill: "hatchGradient",
        pieStroke: "light",
      },
    },
    { family: "pie", card: 16, format: { pieFocusFirst: true } },
    {
      family: "threeD",
      card: 7,
      format: {
        pieStyle: "threeD",
        pieLabelPlacement: "boxedInside",
        pieFill: "hatch",
        pieStroke: "light",
      },
    },
    { family: "pieOfPie", card: 4, format: { pieStyle: "pieOfPie", pieFill: "checker" } },
    {
      family: "barOfPie",
      card: 3,
      format: { pieStyle: "barOfPie", pieLabelPlacement: "boxedInside", pieFill: "hatchGradient" },
    },
    { family: "doughnut", card: 11, format: { doughnutRim: true } },
  ])("$family card $card applies its actual gallery recipe", ({ family, card, format }) => {
    const selected = apply(family, card);
    expect(selected.presentation).toMatchObject(format);
    expect(selected.presentation?.palette).toEqual(pieCardsByFamily[family][card]!.colors);
    expect(selected.labels).toBe(true);
  });

  test("selecting a plain pie card clears the previous gallery geometry, fill and labels", () => {
    const decorated: SheetChart = {
      ...chart,
      type: "doughnut",
      labels: true,
      presentation: {
        pieLabels: "categoryPercent",
        pieExploded: true,
        pieLabelPlacement: "boxedOutside",
        pieFill: "hatchGradient",
        pieStroke: "dark",
        pieFocusFirst: true,
        doughnutHole: 75,
        doughnutRim: true,
      },
    };
    const before = structuredClone(decorated);
    const selected = applyPieInsertChoice(decorated, choice("pie", 0));
    expect(selected.labels).toBe(false);
    expect(selected.presentation).toEqual({ palette: pieCardsByFamily.pie[0]!.colors });
    expect(decorated).toEqual(before);
  });

  test("pie card 5 renders boxed outside labels and light sector borders", () => {
    const plotted = series(option("pie", 4))[0]!;
    expect(plotted.label?.position).toBe("outside");
    expect(plotted.labelLine?.show).toBe(true);
    expect(plotted.data[0]).toMatchObject({
      itemStyle: { color: "#ff963f", borderColor: "#ffffff" },
      label: { backgroundColor: "#ffffff", borderColor: "#ff963f" },
    });
  });

  test("pie card 19 renders its texture, gradient and external labels", () => {
    const plotted = series(option("pie", 18))[0]!;
    expect(plotted.label?.position).toBe("outside");
    expect(plotted.data[0]).toMatchObject({
      selected: true,
      itemStyle: {
        color: { type: "linear" },
        borderColor: "#ffffff",
        decal: { symbol: "rect", rotation: -Math.PI / 4 },
      },
    });
  });

  test("three-dimensional card 8 paints the visible projected top and boxed text", () => {
    const projected = series(option("threeD", 7)).find((entry) => entry.type === "custom")!;
    const painted = nodes(projected.renderItem?.({ dataIndex: 0 }));
    expect(painted.find((node) => node.type === "path" && node.z2 === 1)?.style).toMatchObject({
      stroke: "#ffffff",
      decal: { symbol: "rect" },
    });
    expect(painted.find((node) => node.type === "text")?.style).toMatchObject({
      backgroundColor: "#ffffff",
      borderColor: "#d8faff",
    });
  });

  test("pie-of-pie card 5 carries its checker paint into both real pie series", () => {
    const plotted = series(option("pieOfPie", 4));
    expect(plotted.map((entry) => entry.type)).toEqual(["pie", "pie"]);
    for (const entry of plotted)
      expect(entry.data[0]!.itemStyle?.decal).toMatchObject({
        symbol: "rect",
        dashArrayX: [3, 3],
        dashArrayY: [3, 3],
        rotation: 0,
      });
  });

  test("bar-of-pie card 4 paints the actual secondary bar and boxed text", () => {
    const plotted = series(option("barOfPie", 3));
    expect(plotted.map((entry) => entry.type)).toEqual(["pie", "custom"]);
    const painted = nodes(plotted[1]!.renderItem?.({ dataIndex: 0 }));
    expect(painted.find((node) => node.type === "rect")?.style).toMatchObject({
      fill: { type: "linear" },
      decal: { symbol: "rect", rotation: -Math.PI / 4 },
    });
    expect(painted.find((node) => node.type === "text")?.style).toMatchObject({
      backgroundColor: "#ffffff",
    });
  });

  test("focus cards keep only the first category colored and rim cards draw both ring contours", () => {
    const focused = series(option("pie", 16))[0]!;
    expect(focused.data.map((slice) => slice.itemStyle?.color)).toEqual([
      "#376cbd",
      "#d9dce2",
      "#d9dce2",
      "#d9dce2",
    ]);
    const rim = option("doughnut", 11).graphic as Array<{
      type: string;
      shape: { r: number };
      style: { fill: string; stroke: string };
    }>;
    expect(rim).toHaveLength(2);
    for (const circle of rim) {
      expect(circle.type).toBe("circle");
      expect(circle.shape.r).toBeGreaterThan(0);
      expect(circle.style).toMatchObject({ fill: "none", stroke: "#fb9d36" });
    }
  });

  test("gradient, dot, outline and dark-border recipes reach the sector paints", () => {
    expect(series(option("pie", 6))[0]!.data[0]!.itemStyle?.color).toMatchObject({
      type: "linear",
    });
    expect(series(option("threeD", 10))[0]!.data[0]!.itemStyle?.decal).toMatchObject({
      symbol: "circle",
      rotation: 0,
    });
    expect(series(option("doughnut", 35))[0]!.data[0]!.itemStyle).toMatchObject({
      borderColor: "#daf8fc",
      borderWidth: 1.6,
    });
    expect(series(option("pie", 31))[0]!.data[0]!.itemStyle?.borderColor).toBe("#273243");
  });
});
