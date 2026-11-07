// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import { getSheetChartData, normalizeSheetChart, type SheetChart } from "../../sheet-charts.js";
import { createSheetEvaluator, getActiveSheet, setCellContent } from "../../workbook.js";
import { serializeWorkbook } from "../../serialization.js";
import { createTestWorkbookSession } from "../helpers.js";

function fixture(headers: string[], columns: Array<Array<number | string | null>>) {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  headers.forEach((value, column) =>
    setCellContent(sheet, { row: 0, column }, { kind: "literal", value }),
  );
  columns.forEach((values, column) =>
    values.forEach((value, index) => {
      if (value !== null)
        setCellContent(sheet, { row: index + 1, column }, { kind: "literal", value });
    }),
  );
  const chart: SheetChart = {
    type: "bubble",
    range: {
      start: { row: 0, column: 0 },
      end: { row: columns[0]!.length, column: headers.length - 1 },
    },
    title: "Bubble",
    headerRow: true,
    headerColumn: false,
    seriesBy: "columns",
    legend: true,
    labels: false,
    stacked: false,
    showHidden: false,
  };
  return { session, sheet, chart };
}

describe("bubble chart physical rectangle sources", () => {
  test.each([
    {
      headers: ["Y1"],
      columns: [[10, 20]],
    },
    {
      headers: ["Y1", "Size1"],
      columns: [
        [10, 20],
        [4, 9],
      ],
    },
    {
      headers: ["Y1", "Size1", "Y2", "Size2"],
      columns: [
        [10, 20],
        [4, 9],
        [30, 40],
        [16, 25],
      ],
    },
    {
      headers: ["X", "Y1", "Size1"],
      columns: [
        [2, 8],
        [10, 20],
        [4, 9],
      ],
    },
    {
      headers: ["X", "Y1", "Size1", "Y2", "Size2"],
      columns: [
        [2, 8],
        [10, 20],
        [4, 9],
        [30, 40],
        [16, 25],
      ],
    },
  ])(
    "retains all physical series in $headers without inserting or consuming an X vector",
    ({ headers, columns }) => {
      const f = fixture(headers, columns);
      const before = serializeWorkbook(f.session.workbook);
      const data = getSheetChartData(f.sheet, f.chart, createSheetEvaluator(f.sheet));
      expect(data.series.map((series) => series.name)).toEqual(headers);
      expect(data.series.map((series) => series.values)).toEqual(columns);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    },
  );

  test("text and empty X/Y remain missing, and nonpositive sizes remain raw source values for rendering admission", () => {
    const f = fixture(
      ["X", "Y", "Size"],
      [
        [2, "text X", null],
        [10, "text Y", 30],
        [4, 0, -1],
      ],
    );
    const data = getSheetChartData(f.sheet, f.chart, createSheetEvaluator(f.sheet));
    expect(data.series.map((series) => series.values)).toEqual([
      [2, null, null],
      [10, null, 30],
      [4, 0, -1],
    ]);
    const normalized = normalizeSheetChart({ ...f.chart, presentation: { bubbleShading: true } });
    expect(normalized.type).toBe("bubble");
    expect(normalized.presentation?.bubbleShading).toBe(true);
    expect(normalized.range).toEqual(f.chart.range);
  });
});
