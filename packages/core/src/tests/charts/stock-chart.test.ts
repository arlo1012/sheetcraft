// 未执行：按用户约定仅编写回归测试，待插入与打印功能完成后统一运行。
import { describe, expect, test } from "vitest";
import { normalizeChartPresentation } from "../../chart-presentation.js";
import {
  getSheetChartData,
  normalizeChartDataCache,
  normalizeSheetChart,
  type SheetChart,
} from "../../sheet-charts.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import {
  createWorkbookEvaluator,
  getActiveSheet,
  setCellContent,
  setCellStyle,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { elementDrawing } from "./chart-elements-fixture.js";

const styles = ["hlc", "ohlc", "vhlc", "vohlc"] as const;
const dateFormat = { kind: "date", code: "yyyy-mm-dd" } as const;
function fixture(seriesBy: "rows" | "columns" = "columns") {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  const columns: Array<Array<string | number>> = [
    ["Date", 46001, 46002, 46005, 46006],
    ["High", 14, 15, 16, 17],
    ["Low", 7, 8, 9, 10],
    ["Close", 10, 11, 12, 13],
  ];
  columns.forEach((band, column) =>
    band.forEach((value, row) =>
      setCellContent(
        sheet,
        seriesBy === "columns" ? { row, column } : { row: column, column: row },
        { kind: "literal", value },
      ),
    ),
  );
  const chart: SheetChart = {
    type: "stock",
    range: {
      start: { row: 0, column: 0 },
      end: seriesBy === "columns" ? { row: 4, column: 3 } : { row: 3, column: 4 },
    },
    title: "Prices",
    headerRow: true,
    headerColumn: true,
    seriesBy,
    legend: true,
    labels: false,
    stacked: false,
    showHidden: false,
    presentation: { stockStyle: "hlc" },
  };
  return { session, sheet, chart };
}

describe("stock chart sources and snapshot presentation", () => {
  test.each(["rows", "columns"] as const)(
    "retains each physical %s price series and ordered categories",
    (seriesBy) => {
      const f = fixture(seriesBy);
      const before = serializeWorkbook(f.session.workbook);
      const data = getSheetChartData(
        f.sheet,
        f.chart,
        createWorkbookEvaluator(f.session.workbook, f.sheet.id),
      );
      expect(data.categories).toEqual(["46001", "46002", "46005", "46006"]);
      expect(data.series.map((series) => ({ name: series.name, values: series.values }))).toEqual([
        { name: "High", values: [14, 15, 16, 17] },
        { name: "Low", values: [7, 8, 9, 10] },
        { name: "Close", values: [10, 11, 12, 13] },
      ]);
      expect(data.stockDateAxis).toBeUndefined();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    },
  );

  test.each(["rows", "columns"] as const)(
    "dates in %s categories carry the source format and date system",
    (seriesBy) => {
      const f = fixture(seriesBy);
      f.session.workbook.dateSystem = "1904";
      for (let index = 1; index <= 4; index++)
        setCellStyle(
          f.sheet,
          seriesBy === "columns" ? { row: index, column: 0 } : { row: 0, column: index },
          { numberFormat: dateFormat },
        );
      const data = getSheetChartData(
        f.sheet,
        f.chart,
        createWorkbookEvaluator(f.session.workbook, f.sheet.id),
      );
      expect(data.stockDateAxis).toEqual({
        values: [46001, 46002, 46005, 46006],
        format: dateFormat,
        dateSystem: "1904",
      });
    },
  );

  test("date cache projection clones values and retains the original date system", () => {
    const data = {
      categories: ["Day 1", "Day 4"],
      series: [{ name: "High", values: [12, 14] }],
      records: [],
      stockDateAxis: { values: [1, 4], format: dateFormat, dateSystem: "1904" as const },
    };
    const normalized = normalizeChartDataCache(data);
    expect(normalized.stockDateAxis).toEqual(data.stockDateAxis);
    expect(normalized.stockDateAxis).not.toBe(data.stockDateAxis);
    expect(normalized.stockDateAxis!.values).not.toBe(data.stockDateAxis.values);
  });

  test("text dates stay categorical even when the cells have a date number format", () => {
    const f = fixture();
    for (const [index, text] of [
      "2025-12-10",
      "2025-12-11",
      "2025-12-14",
      "2025-12-15",
    ].entries()) {
      setCellContent(f.sheet, { row: index + 1, column: 0 }, { kind: "literal", value: text });
      setCellStyle(f.sheet, { row: index + 1, column: 0 }, { numberFormat: dateFormat });
    }
    const data = getSheetChartData(
      f.sheet,
      f.chart,
      createWorkbookEvaluator(f.session.workbook, f.sheet.id),
    );
    expect(data.stockDateAxis).toBeUndefined();
  });

  test("stock prices distinguish genuine blanks and errors from text and boolean values", () => {
    const f = fixture();
    f.chart.range!.end.row = 7;
    const values = [
      null,
      { kind: "literal", value: "text" },
      { kind: "literal", value: true },
      { kind: "literal", value: false },
      { kind: "literal", value: "" },
      { kind: "formula", formula: { source: '=""' } },
      { kind: "formula", formula: { source: "=1/0" } },
    ] as const;
    values.forEach((value, index) => {
      const address = { row: index + 1, column: 1 };
      setCellContent(f.sheet, address, value);
    });
    const data = getSheetChartData(
      f.sheet,
      f.chart,
      createWorkbookEvaluator(f.session.workbook, f.sheet.id),
    );
    expect(data.series[0]!.values).toEqual([null, 0, 1, 0, 0, 0, null]);
  });

  test.each(styles)("V107 saves and restores the %s subtype", (stockStyle) => {
    const f = fixture();
    const drawing = elementDrawing();
    drawing.chart = { ...f.chart, presentation: { stockStyle } };
    const original = structuredClone(drawing);
    expect(
      executeWorkbookCommand(f.session, createSetSheetDrawingsCommand(f.sheet.id, [drawing])),
    ).toBe(true);
    const snapshot = serializeWorkbook(f.session.workbook);
    expect(snapshot.version).toBe(107);
    const restored = deserializeWorkbook(snapshot);
    expect(restored.sheets.get(f.sheet.id)!.drawings).toEqual([original]);
    expect(serializeWorkbook(restored)).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 106 })).toThrow();
    expect(drawing).toEqual(original);
  });

  test("stock presentation is validated at the chart boundary", () => {
    expect(() => normalizeChartPresentation({ stockStyle: "unknown" })).toThrow();
    const f = fixture();
    expect(() =>
      normalizeSheetChart({ ...f.chart, type: "line", presentation: { stockStyle: "ohlc" } }),
    ).toThrow();
  });
});
