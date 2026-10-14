import { describe, expect, test } from "vitest";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { createWordCloudLayout } from "../../../modules/charts/chart-wordcloud-layout";

const chart: SheetChart = {
  type: "wordCloud",
  range: null,
  title: "Words",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: false,
  labels: false,
  stacked: false,
  showHidden: false,
};
const data: ChartData = {
  categories: ["Small", "😀😀", "Excluded", "Medium"],
  series: [{ name: "Count", values: [1, 9, -1, 4] }],
  records: [],
};

describe("shared word cloud layout", () => {
  test("preserves sorting, Unicode character sizing, grid coordinates and original palette", () => {
    const layout = createWordCloudLayout(chart, data, { width: 180, height: 100 });
    expect(layout.title).toEqual({ show: true, offset: 30 });
    expect(layout.words).toEqual([
      { text: "😀😀", value: 9, x: 30, y: 62.5, size: 45, color: "#2563eb" },
      { text: "Medium", value: 4, x: 90, y: 62.5, size: 15, color: "#16a34a" },
      { text: "Small", value: 1, x: 150, y: 62.5, size: 18, color: "#8b5cf6" },
    ]);
    expect(data.categories).toEqual(["Small", "😀😀", "Excluded", "Medium"]);
  });
  test("uses exactly legacy, above, overlay and none title offsets even at small sizes", () => {
    const dimensions = { width: 100, height: 50 };
    expect(createWordCloudLayout(chart, data, dimensions).title.offset).toBe(30);
    expect(
      createWordCloudLayout({ ...chart, elements: { titlePosition: "above" } }, data, dimensions)
        .title,
    ).toEqual({ show: true, offset: 12 });
    expect(
      createWordCloudLayout({ ...chart, elements: { titlePosition: "overlay" } }, data, dimensions)
        .title,
    ).toEqual({ show: true, offset: 0 });
    expect(
      createWordCloudLayout({ ...chart, elements: { titlePosition: "none" } }, data, dimensions)
        .title,
    ).toEqual({ show: false, offset: 0 });
    expect(
      createWordCloudLayout(
        { ...chart, title: "", elements: { titlePosition: "above" } },
        data,
        dimensions,
      ).title.offset,
    ).toBe(0);
  });
  test("retains at most 100 positive words and keeps the six-pixel lower bound", () => {
    const categories = Array.from({ length: 105 }, (_, index) => `${index}`.repeat(10));
    const layout = createWordCloudLayout(
      chart,
      {
        categories,
        series: [{ name: "Count", values: categories.map(() => 1) }],
        records: [],
      },
      { width: 5, height: 5 },
    );
    expect(layout.words).toHaveLength(100);
    expect(layout.words.every((word) => word.size === 6)).toBe(true);
    expect(
      createWordCloudLayout(
        chart,
        { categories: [], series: [], records: [] },
        { width: 100, height: 100 },
      ).words,
    ).toEqual([]);
  });
});
