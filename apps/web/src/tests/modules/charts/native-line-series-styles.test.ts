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
