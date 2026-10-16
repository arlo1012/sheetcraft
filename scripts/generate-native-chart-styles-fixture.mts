import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { nativeColumnFixture } from "../packages/xlsx-io/src/tests/charts/native-column-fixture.js";
import { normalizeSheetDrawing, type SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import { createWorkbookEvaluator } from "@sheetcraft/core/workbook";
import { encodeXlsx } from "../packages/xlsx-io/src/index.js";
import { createChartOption } from "../apps/web/src/modules/charts/chart-option.js";
import { init } from "../apps/web/node_modules/echarts/index.js";

const destination = resolve(process.argv[2] ?? "/tmp/sheetcraft-native-styles");
await mkdir(destination, { recursive: true });
const f = nativeColumnFixture();
f.sheet.drawings = (["column", "bar", "line"] as const).map(
  (type, index) =>
    normalizeSheetDrawing({
      ...f.drawing,
      id: `native-style-${type}`,
      name: `Native style ${type}`,
      anchor: { row: 6, column: index * 9 },
      width: 480,
      height: 320,
      chart: {
        ...f.drawing.chart,
        type,
        title: `RGB ${type} 11.25pt`,
        presentation: { palette: ["#2468ac", "#d15a28"] },
        format: {
          title: { fontFamily: "Arial", fontSize: 15, bold: false, color: "#123456" },
          categoryAxis: {
            text: { fontFamily: "Arial", fontSize: 12, bold: true, color: "#234567" },
          },
          valueAxis: { text: { fontFamily: "Arial", fontSize: 16, bold: false, color: "#345678" } },
        },
      },
    }) as SheetChartDrawing,
);
const out = await encodeXlsx(f.workbook);
await Bun.write(`${destination}/native-chart-styles-rgb-11.25pt.xlsx`, out.bytes);
await Bun.write(
  `${destination}/native-chart-styles-source.json`,
  JSON.stringify(serializeWorkbook(f.workbook), null, 2),
);
await Bun.write(
  `${destination}/native-chart-styles-export-report.json`,
  JSON.stringify(out.report, null, 2),
);
for (const drawing of f.sheet.drawings) {
  if (drawing.kind !== "chart") continue;
  const option = createChartOption(
    drawing.chart,
    getSheetChartData(f.sheet, drawing.chart, createWorkbookEvaluator(f.workbook, f.sheet.id)),
  );
  const renderer = init(null, undefined, { renderer: "svg", ssr: true, width: 480, height: 320 });
  try {
    renderer.setOption({ ...option, animation: false });
    await Bun.write(`${destination}/${drawing.id}-web-ssr.svg`, renderer.renderToSVGString());
  } finally {
    renderer.dispose();
  }
}
console.log(
  JSON.stringify({ destination, charts: 3, sourceB2: 60, exportIssues: out.report.issues }),
);
