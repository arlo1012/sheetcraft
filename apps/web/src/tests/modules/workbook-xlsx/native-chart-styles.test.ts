import { init } from "echarts";
import { describe, expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet, setCellContent } from "@sheetcraft/core/workbook";
import { normalizeSheetDrawing, type SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { encodeXlsx, decodeXlsx } from "@sheetcraft/xlsx-io";
import { unsupportedNativeChartStyles } from "@sheetcraft/xlsx-io/chart-capabilities";
import {
  assertXlsxPictureGeometrySupport,
  prepareXlsxImages,
} from "../../../modules/workbook-xlsx/prepareXlsxImages";
import { createChartOption } from "../../../modules/charts/chart-option";
import { getSheetChartData } from "@sheetcraft/core/sheet-charts";
import { createWorkbookEvaluator } from "@sheetcraft/core/workbook";

function fixture() {
  const workbook = createWorkbook({ id: "native-styles", sheetId: "data", sheetName: "Data" }),
    sheet = getActiveSheet(workbook);
  [
    ["region", "apple", "pear"],
    ["east", 60, 70],
    ["west", 80, 90],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(sheet, { row: r, column }, { kind: "literal", value }),
    ),
  );
  const drawing = normalizeSheetDrawing({
    id: "style-chart",
    name: "Style",
    kind: "chart",
    anchor: { row: 5, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 480,
    height: 300,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#000000",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
    chart: {
      type: "column",
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
      title: "Styles",
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
      presentation: { palette: ["#2468ac", "#d15a28"] },
      format: {
        title: { fontFamily: "Arial", fontSize: 15, bold: false, color: "#123456" },
        categoryAxis: { text: { fontFamily: "Arial", fontSize: 12, bold: true, color: "#234567" } },
        valueAxis: { text: { fontFamily: "Arial", fontSize: 16, bold: false, color: "#345678" } },
      },
    },
  }) as SheetChartDrawing;
  sheet.drawings = [drawing];
  return { workbook, sheet, drawing };
}

describe("native chart style Web preparation", () => {
  test.each(["column", "bar", "line"] as const)(
    "%s reaches real prepare + encode + import with shared styles",
    async (type) => {
      const f = fixture();
      f.drawing.chart.type = type;
      expect(unsupportedNativeChartStyles(f.drawing.chart)).toEqual([]);
      expect(() => assertXlsxPictureGeometrySupport(f.workbook)).not.toThrow();
      const before = serializeWorkbook(f.workbook),
        get = vi.fn();
      expect(await prepareXlsxImages(before, { get, put: vi.fn() })).toEqual([]);
      expect(get).not.toHaveBeenCalled();
      const out = await encodeXlsx(f.workbook),
        read = await decodeXlsx(out.bytes);
      const chart = [...read.workbook.sheets.values()][0]!.drawings?.find(
        (d) => d.kind === "chart",
      );
      if (!chart || chart.kind !== "chart") throw new Error("No native chart");
      expect(chart.chart.format).toEqual(f.drawing.chart.format);
      expect(chart.chart.presentation).toEqual(f.drawing.chart.presentation);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      const option = createChartOption(
        f.drawing.chart,
        getSheetChartData(
          f.sheet,
          f.drawing.chart,
          createWorkbookEvaluator(f.workbook, f.sheet.id),
        ),
      );
      expect(option.color).toEqual(["#2468ac", "#d15a28"]);
      expect(option.title).toMatchObject({
        textStyle: { fontFamily: "Arial", fontSize: 15, fontWeight: "normal", color: "#123456" },
      });
      const renderer = init(null, undefined, {
        renderer: "svg",
        ssr: true,
        width: 480,
        height: 300,
      });
      try {
        renderer.setOption({ ...option, animation: false });
        const svg = renderer.renderToSVGString();
        expect(svg).toContain("#2468ac");
        expect(svg).toContain("#d15a28");
        expect(svg).toContain("#123456");
        expect(svg).toMatch(/font-size:\s*15px/);
        expect(svg).toContain("Arial");
      } finally {
        renderer.dispose();
      }
    },
  );
  test("unsupported mixed leaves fail before resource preparation at the same native paths", async () => {
    const f = fixture(),
      get = vi.fn();
    f.drawing.chart.format!.title!.fontFamily = "Arial, sans-serif";
    f.drawing.chart.format!.valueAxis!.min = 0;
    const fields = unsupportedNativeChartStyles(f.drawing.chart);
    expect(fields).toEqual(["format.title.fontFamily", "format.valueAxis.min"]);
    await expect(
      prepareXlsxImages(serializeWorkbook(f.workbook), { get, put: vi.fn() }),
    ).rejects.toMatchObject({
      report: {
        issues: [
          {
            locations: fields.map(
              (field) => `${f.sheet.name}.drawings["style-chart"].chart.${field}`,
            ),
          },
        ],
      },
    });
    expect(get).not.toHaveBeenCalled();
  });
});
