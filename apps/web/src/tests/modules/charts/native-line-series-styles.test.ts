// @vitest-environment node
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { decodeXlsx } from "@sheetcraft/xlsx-io";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import { createWorkbookEvaluator } from "@sheetcraft/core/workbook";
import { createChartOption } from "../../../modules/charts/chart-option";
import { init } from "../../../modules/charts/chart-runtime";

test("actual WPS line widths and circle/none choices reach rendered SVG", async () => {
  const input = await readFile(
    new URL(
      "../../../../../../packages/xlsx-io/src/tests/charts/fixtures/wps-native-line-series-styles.xlsx",
      import.meta.url,
    ),
  );
  const { workbook } = await decodeXlsx(new Uint8Array(input));
  const sheet = [...workbook.sheets.values()][0]!;
  const drawing = sheet.drawings?.find((entry) => entry.kind === "chart");
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing line");
  const data = getSheetChartData(sheet, drawing.chart, createWorkbookEvaluator(workbook, sheet.id));
  const option = createChartOption(drawing.chart, data);
  if (!Array.isArray(option.series)) throw new Error("Missing series");
  expect(option.series[0]).toMatchObject({
    type: "line",
    lineStyle: { width: 2 },
    symbol: "circle",
    showSymbol: true,
  });
  expect(option.series[1]).toMatchObject({
    type: "line",
    lineStyle: { width: 4 },
    symbol: "none",
    showSymbol: false,
  });
  const engine = init(null, undefined, { renderer: "svg", ssr: true, width: 640, height: 400 });
  try {
    engine.setOption(option);
    const paths = engine.renderToSVGString().match(/<path\b[^>]*>/g) ?? [];
    expect(
      paths.some((path) => path.includes('stroke="#2563eb"') && path.includes('stroke-width="2"')),
    ).toBe(true);
    expect(
      paths.some((path) => path.includes('stroke="#16a34a"') && path.includes('stroke-width="4"')),
    ).toBe(true);
    expect(paths.filter((path) => path.includes('fill="#2563eb"'))).toHaveLength(3);
    expect(paths.filter((path) => path.includes('fill="#16a34a"'))).toHaveLength(0);
  } finally {
    engine.dispose();
  }
});

test.each([
  {
    name: "actual WPS all-hidden markers",
    path: "packages/xlsx-io/src/tests/charts/fixtures/wps-native-marker-symbol-none.xlsx",
    firstSymbol: "none",
    firstMarkers: false,
    firstPointCount: 0,
  },
  {
    name: "WPS-proven mixed square/none markers with family marker=0",
    path: "docs/acceptance/evidence/native-hidden-markers-20261020/mixed-family0-source.xlsx",
    firstSymbol: "rect",
    firstMarkers: true,
    firstPointCount: 3,
  },
])("$name retain both lines and independent legend entries in SVG", async (fixture) => {
  const input = await readFile(new URL(`../../../../../../${fixture.path}`, import.meta.url));
  const { workbook, report } = await decodeXlsx(new Uint8Array(input));
  const sheet = [...workbook.sheets.values()][0]!;
  const drawing = sheet.drawings?.find((entry) => entry.kind === "chart");
  if (!drawing || drawing.kind !== "chart") throw new Error("Missing ordinary line");
  expect(drawing.chart.type).toBe("line");
  expect(
    report.issues
      .filter((issue) => issue.code === "feature-omitted")
      .flatMap((issue) => issue.locations),
  ).not.toContain("xl/charts/chart1.xml");
  const data = getSheetChartData(sheet, drawing.chart, createWorkbookEvaluator(workbook, sheet.id));
  expect(data.series.map(({ name, values }) => ({ name, values }))).toEqual([
    { name: "apple", values: [60, 100, 120] },
    { name: "pear", values: [70, 80, 90] },
  ]);
  const before = structuredClone(drawing.chart);
  const option = createChartOption(drawing.chart, data);
  if (!Array.isArray(option.series)) throw new Error("Missing series");
  expect(option.series).toHaveLength(2);
  expect(option.series).toMatchObject([
    {
      type: "line",
      lineStyle: { width: 2 },
      symbol: fixture.firstSymbol,
      showSymbol: fixture.firstMarkers,
      ...(fixture.firstMarkers ? { symbolSize: 12 } : {}),
    },
    { type: "line", lineStyle: { width: 4 }, symbol: "none", showSymbol: false },
  ]);

  const engine = init(null, undefined, { renderer: "svg", ssr: true, width: 640, height: 400 });
  try {
    engine.setOption(option);
    const paths = engine.renderToSVGString().match(/<path\b[^>]*>/g) ?? [];
    for (const [color, width] of [
      ["#2563eb", 2],
      ["#16a34a", 4],
    ] as const)
      expect(
        paths.filter(
          (path) => path.includes(`stroke="${color}"`) && path.includes(`stroke-width="${width}"`),
        ),
      ).toHaveLength(1);
    expect(paths.filter((path) => path.includes('fill="#2563eb"'))).toHaveLength(
      fixture.firstPointCount,
    );
    expect(paths.filter((path) => path.includes('fill="#16a34a"'))).toHaveLength(0);

    const withLegend = createChartOption({ ...drawing.chart, legend: true }, data);
    const legend = withLegend.legend;
    if (!legend || Array.isArray(legend) || typeof legend.formatter !== "function")
      throw new Error("Missing independent legend");
    const formatter = legend.formatter;
    const names = legend.data?.map((entry) => (typeof entry === "string" ? entry : entry.name!));
    expect(names).toEqual(option.series.map((series) => series.name));
    expect(new Set(names).size).toBe(2);
    expect(names?.map((name) => formatter(name))).toEqual(["apple", "pear"]);
    expect(legend.data).toMatchObject([
      fixture.firstMarkers ? {} : { icon: "line", itemStyle: { borderWidth: 2 } },
      { icon: "line", itemStyle: { borderWidth: 4 } },
    ]);
    engine.setOption(withLegend, { notMerge: true });
    const svg = engine.renderToSVGString();
    expect(svg).toContain("apple");
    expect(svg).toContain("pear");
    expect(svg).not.toContain("sheetcraft-series:");
    expect(drawing.chart).toEqual(before);
  } finally {
    engine.dispose();
  }
});
