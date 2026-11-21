// 未执行：按用户低内存约定暂未执行单元测试。
import { describe, expect, test } from "vitest";
import { normalizeSheetChart, type SheetChart } from "../../sheet-charts.js";
import { createWorkbook, getActiveSheet } from "../../workbook.js";
import { serializeWorkbook, deserializeWorkbook } from "../../serialization.js";

function sampleChart(trendline?: NonNullable<SheetChart["elements"]>["trendline"]): SheetChart {
  return {
    type: "column",
    range: { start: { row: 0, column: 0 }, end: { row: 4, column: 1 } },
    title: "Sales",
    headerRow: true,
    headerColumn: true,
    seriesBy: "columns",
    legend: true,
    labels: false,
    stacked: false,
    showHidden: false,
    ...(trendline !== undefined ? { elements: { trendline } } : {}),
  };
}

describe("chart trendline settings", () => {
  test("validates trendline options and persists active trendlines at V115", () => {
    expect(normalizeSheetChart(sampleChart("linear")).elements?.trendline).toBe("linear");
    expect(normalizeSheetChart(sampleChart("exponential")).elements?.trendline).toBe("exponential");
    expect(normalizeSheetChart(sampleChart("movingAverage")).elements?.trendline).toBe(
      "movingAverage",
    );
    expect(() => normalizeSheetChart(sampleChart("polynomial" as never))).toThrow();

    const workbook = createWorkbook({ id: "trendline-wb", sheetId: "sheet-1" });
    const sheet = getActiveSheet(workbook);
    sheet.drawings = [
      {
        id: "chart-1",
        kind: "chart",
        name: "Sales",
        chart: sampleChart("linear"),
        anchor: { row: 0, column: 3 },
        offsetX: 0,
        offsetY: 0,
        width: 420,
        height: 280,
        text: "",
        shape: "rectangle",
        fill: "#ffffff",
        stroke: "#d0d7de",
        strokeWidth: 1,
        color: "#202124",
        fontSize: 12,
        bold: false,
        italic: false,
        rotation: 0,
      },
    ];
    const snapshot = serializeWorkbook(workbook);
    expect(snapshot.version).toBe(115);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 114 })).toThrow();
  });
});
