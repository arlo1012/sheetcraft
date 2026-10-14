import { describe, expect, test } from "vitest";
import type { EChartsOption, SeriesOption } from "echarts";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { applyChartDesignIntent } from "../../../modules/charts/chart-design-intents";
import { applyChartCommonFormat } from "../../../modules/charts/chart-format-render";
import { createChartOption } from "../../../modules/charts/chart-option";
import { getChartPresentationTextColor } from "../../../modules/charts/chart-presentation-render";
import { init } from "../../../modules/charts/chart-runtime";

const chart: SheetChart = {
  type: "column",
  range: null,
  title: "Styled chart",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: true,
  labels: true,
  stacked: false,
  showHidden: false,
};
const data: ChartData = {
  categories: ["First category", "Second category", "Third category"],
  series: [
    { id: "revenue", colorIndex: 0, name: "Revenue", values: [2, 4, 8] },
    { id: "profit", colorIndex: 1, name: "Profit", values: [3, 6, 7] },
  ],
  records: [["Source node", "Target node", 2]],
};
function series(option: EChartsOption): SeriesOption[] {
  return Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];
}
function render(option: EChartsOption, inspect: (document: Document) => void) {
  const instance = init(null, undefined, { renderer: "svg", ssr: true, width: 480, height: 300 });
  try {
    instance.setOption(option);
    const markup = instance.renderToSVGString();
    expect(markup).not.toMatch(/NaN|Infinity/);
    inspect(new DOMParser().parseFromString(markup, "text/html"));
  } finally {
    instance.dispose();
  }
}

describe("recipe text defaults on opaque presentation backgrounds", () => {
  test.each([
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
  ] as const)("%s actually paints readable dark-recipe legend, labels and axis text", (type) => {
    const styled = applyChartDesignIntent({ ...chart, type }, { kind: "style", style: "dark" });
    const option = createChartOption(styled, data);
    expect(option.tooltip).toMatchObject({
      renderMode: "richText",
      backgroundColor: "#202936",
      textStyle: { color: "#e8eef7" },
    });
    expect(option.tooltip).not.toHaveProperty("formatter");
    render(option, (document) => {
      const text = Array.from(document.querySelectorAll("text"));
      expect(text.length).toBeGreaterThanOrEqual(3);
      expect(text.every((element) => element.getAttribute("fill") === "#e8eef7")).toBe(true);
      if (type === "radar")
        expect(text.some((element) => element.textContent === "First category")).toBe(true);
      if (type === "sankey")
        expect(text.some((element) => element.textContent === "Source node")).toBe(true);
      if (type === "treemap")
        expect(text.some((element) => element.textContent === "First category")).toBe(true);
      if (type === "column")
        expect(text.some((element) => element.textContent === "Revenue")).toBe(true);
    });
  });

  test.each(["dark", "office"] as const)(
    "%s title-only color edits leave actual non-title SVG text and tooltip defaults unchanged",
    (style) => {
      for (const type of ["column", "radar", "sankey", "treemap"] as const) {
        const styled = applyChartDesignIntent({ ...chart, type }, { kind: "style", style });
        const before = createChartOption(styled, data);
        const changed: SheetChart = {
          ...styled,
          format: {
            ...styled.format,
            title: { ...styled.format?.title, color: style === "dark" ? "#000000" : "#ffffff" },
          },
        };
        const after = createChartOption(changed, data);
        expect(after.legend).toEqual(before.legend);
        expect(after.tooltip).toEqual(before.tooltip);
        expect(after.radar).toEqual(before.radar);
        const labelSettings = (entry: SeriesOption) => {
          const label = "label" in entry ? entry.label : undefined;
          if (!label) return undefined;
          return "formatter" in label && typeof label.formatter === "function"
            ? { ...label, formatter: "callback" }
            : { ...label };
        };
        expect(series(after).map(labelSettings)).toEqual(series(before).map(labelSettings));
        let baseline: Array<{ text: string | null; fill: string | null }> = [];
        render(before, (document) => {
          baseline = Array.from(document.querySelectorAll("text"))
            .filter((element) => element.textContent !== chart.title)
            .map((element) => ({ text: element.textContent, fill: element.getAttribute("fill") }));
        });
        render(after, (document) => {
          const text = Array.from(document.querySelectorAll("text"));
          expect(
            text.find((element) => element.textContent === chart.title)?.getAttribute("fill"),
          ).toBe(changed.format!.title!.color);
          expect(
            text
              .filter((element) => element.textContent !== chart.title)
              .map((element) => ({
                text: element.textContent,
                fill: element.getAttribute("fill"),
              })),
          ).toEqual(baseline);
        });
      }
    },
  );

  test("opaque RGB background alone selects independent contrast defaults; palette alone keeps native defaults", () => {
    for (const background of ["#000", "#202936"]) {
      const styled: SheetChart = { ...chart, presentation: { background } };
      expect(getChartPresentationTextColor(styled)).toBe("#e8eef7");
      const option = createChartOption(styled, data);
      expect(option.legend).toMatchObject({ textStyle: { color: "#e8eef7" } });
      expect(option.tooltip).toMatchObject({
        backgroundColor: background,
        textStyle: { color: "#e8eef7" },
      });
    }
    for (const background of ["#fff", "#ffffff", "#f4f9fc"])
      expect(getChartPresentationTextColor({ ...chart, presentation: { background } })).toBe(
        "#333333",
      );
    const paletteOnly: SheetChart = {
      ...chart,
      presentation: { palette: ["#123456"] },
      format: { title: { color: "#ffffff" } },
    };
    expect(getChartPresentationTextColor(paletteOnly)).toBeUndefined();
    const option = createChartOption(paletteOnly, data);
    expect(option.legend).not.toHaveProperty("textStyle.color");
    expect(option.tooltip).not.toHaveProperty("textStyle.color");
    expect(series(option)[0]).not.toHaveProperty("label.color");
  });

  test("explicit legend/label/tooltip colors, labels and graphic series colors remain intact", () => {
    const styled = applyChartDesignIntent(chart, { kind: "style", style: "dark" });
    const formatter = () => "Raw label";
    const label = { show: true, color: "#000001", position: "inside" as const, formatter };
    const input: EChartsOption = {
      ...createChartOption(styled, data),
      legend: {
        type: "scroll",
        textStyle: { color: "#000002" },
        pageTextStyle: { color: "#000003" },
      },
      tooltip: {
        renderMode: "richText",
        backgroundColor: "#ffffff",
        textStyle: { color: "#333333" },
      },
      series: [{ type: "bar", data: [2, 4, 8], label, itemStyle: { color: "#000004" } }],
    };
    const before = structuredClone({
      label: { ...label, formatter: undefined },
      tooltip: input.tooltip,
      legend: input.legend,
    });
    const result = applyChartCommonFormat(input, styled, data);
    expect(result.legend).toEqual(before.legend);
    expect(result.tooltip).toEqual(before.tooltip);
    const first = series(result)[0];
    if (first?.type !== "bar") throw new Error("Missing bar.");
    expect(first.label).toEqual(label);
    expect(first.label?.formatter).toBe(formatter);
    expect(first.itemStyle?.color).toBe("#000004");
    expect(input.series).toEqual([
      { type: "bar", data: [2, 4, 8], label, itemStyle: { color: "#000004" } },
    ]);
  });

  test("an explicit half of a tooltip scheme retains its already-readable other half", () => {
    const styled = applyChartDesignIntent(chart, { kind: "style", style: "dark" });
    for (const tooltip of [{ backgroundColor: "#ffffff" }, { textStyle: { color: "#333333" } }]) {
      const input: EChartsOption = { ...createChartOption(styled, data), tooltip };
      expect(applyChartCommonFormat(input, styled, data).tooltip).toEqual(tooltip);
    }
  });

  test("title-only formatting without presentation retains the old text consumers", () => {
    const plain: SheetChart = { ...chart, format: { title: { color: "#e8eef7" } } };
    const option = createChartOption(plain, data);
    expect(option.textStyle).toEqual({ fontFamily: "Arial, sans-serif" });
    expect(option.legend).not.toHaveProperty("textStyle.color");
    expect(option.tooltip).not.toHaveProperty("backgroundColor");
    expect(option.tooltip).not.toHaveProperty("textStyle.color");
    expect(series(option)[0]).not.toHaveProperty("label.color");
    render(option, (document) => {
      const revenue = Array.from(document.querySelectorAll("text")).find(
        (element) => element.textContent === "Revenue",
      );
      expect(revenue).toBeDefined();
      expect(revenue?.getAttribute("fill")).not.toBe("#e8eef7");
    });
  });
});
