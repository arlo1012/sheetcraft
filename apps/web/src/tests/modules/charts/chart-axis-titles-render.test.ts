import { describe, expect, test, vi } from "vitest";
import type { EChartsOption, XAXisComponentOption, YAXisComponentOption } from "echarts";
import type { SheetChart, ChartData } from "@sheetcraft/core/sheet-charts";
import { createChartOption } from "../../../modules/charts/chart-option";
import { getChartFontFamilies } from "../../../modules/charts/chart-script-fonts";
import { createChartDataTablePlan } from "../../../modules/charts/chart-data-table";
import { init } from "../../../modules/charts/chart-runtime";
import { reserveChartAxisTitles } from "../../../modules/charts/chart-axis-title-layout";

const chart: SheetChart = {
  type: "column",
  range: null,
  title: "",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: false,
  labels: false,
  stacked: false,
  showHidden: false,
};
const data: ChartData = {
  categories: ["A", "B"],
  series: [{ name: "Sales", values: [10, 20] }],
  records: [],
  diagnostics: [],
};
const dimensions = { width: 480, height: 300 };
function axis(option: EChartsOption, key: "xAxis" | "yAxis") {
  const entry = option[key];
  if (!entry || Array.isArray(entry)) throw new Error("Expected one axis");
  return entry as XAXisComponentOption | YAXisComponentOption;
}

describe("independent axis title paint", () => {
  test("separates plain title typography from ticks and preserves legacy sharing", () => {
    const text = { fontSize: 18, bold: true, italic: true, color: "#123456" };
    const legacy = createChartOption(
      { ...chart, format: { categoryAxis: { title: "Quarter", text } } },
      data,
    );
    expect(axis(legacy, "xAxis").nameTextStyle).toMatchObject({ fontSize: 18, fontWeight: "bold" });
    const independent = createChartOption(
      {
        ...chart,
        format: {
          categoryAxis: {
            title: "Quarter",
            text,
            titleText: { fontSize: 14, bold: false, color: "#abcdef" },
            titleRotation: 0,
          },
        },
      },
      data,
    );
    expect(axis(independent, "xAxis").nameTextStyle).toMatchObject({
      fontSize: 14,
      fontWeight: "normal",
      color: "#abcdef",
    });
    expect(axis(independent, "xAxis").nameTextStyle?.fontStyle).not.toBe("italic");
    expect(axis(independent, "xAxis").axisLabel).toMatchObject({
      fontSize: 18,
      fontWeight: "bold",
      fontStyle: "italic",
      color: "#123456",
    });
    const cleared = createChartOption(
      { ...chart, format: { categoryAxis: { title: "Quarter", text, titleText: {} } } },
      data,
    );
    expect(axis(cleared, "xAxis").nameTextStyle?.fontWeight).not.toBe("bold");
  });
  test("script-font projection and resource collection include title-only faces", () => {
    const styled: SheetChart = {
      ...chart,
      format: {
        categoryAxis: {
          title: "Quarter季度",
          text: { fontFamily: "Tick Face" },
          titleText: {
            scriptFonts: {
              latin: { kind: "family", family: "Title Face" },
              eastAsia: { kind: "family", family: "Title CJK" },
            },
          },
        },
      },
    };
    const option = createChartOption(styled, data);
    expect(getChartFontFamilies(styled)).toEqual(
      expect.arrayContaining(["Tick Face", "Title Face", "Title CJK"]),
    );
    const x = axis(option, "xAxis");
    expect(x.name).toContain("{sc_latin|Quarter}");
    expect(x.nameTextStyle?.rich?.sc_eastAsia?.fontFamily).toBe("Title CJK");
    expect(x.axisLabel?.rich).toBeUndefined();
    expect(x.axisLabel?.fontFamily).toBe("Tick Face");
  });
  test.each(["column", "bar", "line"] as const)(
    "%s keeps semantic title rotation separate from label angle",
    (type) => {
      const option = createChartOption(
        {
          ...chart,
          type,
          format: {
            categoryAxis: {
              title: "Quarter",
              titleText: { bold: true },
              titleRotation: 0,
              labelAngle: 30,
            },
            valueAxis: { title: "Revenue", titleText: { fontSize: 16 }, titleRotation: -90 },
          },
        },
        data,
        dimensions,
      );
      const category = axis(option, type === "bar" ? "yAxis" : "xAxis");
      const value = axis(option, type === "bar" ? "xAxis" : "yAxis");
      expect(category.nameRotate).toBe(0);
      expect(category.axisLabel?.rotate).toBe(30);
      expect(value.nameRotate).toBe(90);
      const instance = init(null, undefined, { renderer: "svg", ssr: true, ...dimensions });
      try {
        instance.setOption(option);
        for (const name of ["Quarter", "Revenue"]) {
          const element = instance
            .getZr()
            .storage.getDisplayList(true)
            .find((entry) => entry.type === "tspan" && entry.style.text === name);
          expect(element, name).toBeDefined();
          const rect = element!.getBoundingRect().clone();
          const transform = element!.getComputedTransform();
          if (transform) rect.applyTransform(transform);
          expect(rect.x, name).toBeGreaterThanOrEqual(-1);
          expect(rect.y, name).toBeGreaterThanOrEqual(-1);
          expect(rect.x + rect.width, name).toBeLessThanOrEqual(dimensions.width + 1);
          expect(rect.y + rect.height, name).toBeLessThanOrEqual(dimensions.height + 1);
        }
      } finally {
        instance.dispose();
      }
    },
  );
  test("hidden titles retain data but reserve no extra title strip", () => {
    const settings = {
      title: "Saved",
      titleText: { fontSize: 28 },
      titleRotation: -90,
      titleVisible: false,
    };
    const option = createChartOption(
      { ...chart, format: { categoryAxis: settings } },
      data,
      dimensions,
    );
    expect(axis(option, "xAxis").name).toBe("");
    expect(option.grid).toEqual(createChartOption(chart, data, dimensions).grid);
    expect(settings.title).toBe("Saved");
  });
  test("oversized or multiline independent titles reject impossible geometry without losing content", () => {
    for (const settings of [
      { title: "Large", titleText: { fontSize: 256 }, titleRotation: 0 },
      { title: "Line\n".repeat(30), titleText: {}, titleRotation: 0 },
    ]) {
      expect(() =>
        createChartOption({ ...chart, format: { categoryAxis: settings } }, data, dimensions),
      ).toThrow(/96×96/);
      expect(settings.title).not.toBe("");
    }
  });
  test("table clearance measures the same bounded rotated title as native paint", () => {
    const styled: SheetChart = {
      ...chart,
      elements: { dataTable: "withoutLegendKeys" },
      format: {
        categoryAxis: {
          title: "Long title ".repeat(40),
          titleText: { fontSize: 12 },
          titleRotation: 90,
        },
      },
    };
    const surface = { width: 640, height: 480 };
    const context = {
      font: "12px Arial",
      measureText: (text: string) => ({ width: text.length * 7 }),
    };
    const canvas = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    try {
      expect(createChartDataTablePlan(styled, data, surface)?.gap).toBeLessThan(200);
      expect(() => createChartOption(styled, data, surface)).not.toThrow();
    } finally {
      canvas.mockRestore();
    }
  });
  test.each([-90, 0])(
    "bar category title at %s degrees keeps full mixed-language text at the desktop sample size",
    (rotation) => {
      const title = "Quarter 季度 & <channel>";
      const surface = { width: 640, height: 400 };
      const option = createChartOption(
        {
          ...chart,
          type: "bar",
          title: "Independent axis titles: bar",
          format: {
            categoryAxis: {
              title,
              titleText: { fontFamily: "Arial", fontSize: 16, bold: true },
              titleRotation: rotation,
            },
            valueAxis: {
              title: "Revenue 收入",
              titleText: { fontFamily: "Arial", fontSize: 16, bold: true, italic: true },
              titleRotation: 0,
            },
          },
        },
        data,
        surface,
      );
      const instance = init(null, undefined, { renderer: "svg", ssr: true, ...surface });
      try {
        instance.setOption(option);
        const spans = instance
          .getZr()
          .storage.getDisplayList(true)
          .filter((entry) => entry.type === "tspan");
        const element = spans.find((entry) => entry.style.text === title);
        expect(element).toBeDefined();
        expect(spans.some((entry) => String(entry.style.text).includes("…"))).toBe(false);
        const rect = element!.getBoundingRect().clone();
        const transform = element!.getComputedTransform();
        if (transform) rect.applyTransform(transform);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(surface.width);
        expect(rect.y + rect.height).toBeLessThanOrEqual(surface.height);
      } finally {
        instance.dispose();
      }
    },
  );
});

test("short title admission keeps legacy geometry and rejects titles consuming most of a small plot", () => {
  const source: SheetChart = {
    ...chart,
    type: "line",
    title: "Short native chart",
    format: {
      categoryAxis: { title: "Quarter", titleText: { fontSize: 16 }, titleRotation: 0 },
      valueAxis: { title: "Revenue", titleText: { fontSize: 16 }, titleRotation: -90 },
    },
  };
  for (const surface of [
    { width: 320, height: 200 },
    { width: 640, height: 400 },
  ])
    expect(createChartOption(source, data, surface).grid).toEqual({
      top: 45,
      left: 75.2,
      right: 22,
      bottom: 62.2,
    });
  expect(() =>
    createChartOption(
      {
        ...source,
        format: { categoryAxis: { title: "Large", titleText: { fontSize: 64 }, titleRotation: 0 } },
      },
      data,
      { width: 320, height: 200 },
    ),
  ).toThrow(/adaptive plot budget/);
  expect(() => createChartOption(source, data, { width: 80, height: 80 })).toThrow(
    /adaptive plot budget/,
  );
});

test("adaptive admission preserves caller grid offsets and top/right axis placement", () => {
  const option: EChartsOption = {
    grid: { left: "20%", right: "10%", top: 10, bottom: "10%", containLabel: true },
    xAxis: { type: "category", position: "top", name: "Quarter", nameRotate: 0 },
    yAxis: { type: "value", position: "right", name: "Revenue", nameRotate: 90 },
  };
  const before = structuredClone(option);
  const reserved = reserveChartAxisTitles(
    option,
    {
      ...chart,
      format: {
        categoryAxis: { title: "Quarter", titleText: { fontSize: 16 }, titleRotation: 0 },
        valueAxis: { title: "Revenue", titleText: { fontSize: 16 }, titleRotation: -90 },
      },
    },
    { width: 320, height: 200 },
  );
  expect(reserved.grid).toEqual({
    left: "20%",
    right: 59.2,
    top: 37.2,
    bottom: "10%",
    containLabel: true,
  });
  expect(reserved.xAxis).toMatchObject({ position: "top", nameRotate: 0 });
  expect(reserved.yAxis).toMatchObject({ position: "right", nameRotate: 90 });
  expect(option).toEqual(before);
});

test("compact parallel titles use the real midpoint budget instead of truncating a fitting face", () => {
  // Wide glyphs reproduce the browser-metric case that narrower SSR fallback
  // glyphs hid in the mixed-language native fixture.
  const title = "M".repeat(18);
  const source: SheetChart = {
    ...chart,
    type: "line",
    title: "Compact",
    format: {
      categoryAxis: { title, titleText: { fontSize: 16, bold: true }, titleRotation: 0 },
      valueAxis: { title: "Revenue", titleText: { fontSize: 16 }, titleRotation: -90 },
    },
  };
  const surface = { width: 320, height: 200 };
  const option = createChartOption(source, data, surface);
  expect(axis(option, "xAxis").nameTruncate?.maxWidth).toBeCloseTo(258.8);
  expect(
    axis(createChartOption(source, data, { width: 640, height: 400 }), "xAxis").nameTruncate
      ?.maxWidth,
  ).toBe(384);
  const instance = init(null, undefined, { renderer: "svg", ssr: true, ...surface });
  try {
    instance.setOption(option);
    const element = instance
      .getZr()
      .storage.getDisplayList(true)
      .find((entry) => entry.type === "tspan" && entry.style.text === title);
    expect(element).toBeDefined();
    const rect = element!.getBoundingRect().clone();
    const transform = element!.getComputedTransform();
    if (transform) rect.applyTransform(transform);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(surface.width);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(surface.height);
  } finally {
    instance.dispose();
  }
});
