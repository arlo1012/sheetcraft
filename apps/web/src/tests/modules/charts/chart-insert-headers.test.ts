import { describe, expect, test } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  createSheetEvaluator,
  setCellContent,
} from "@sheetcraft/core/workbook";
import { getSheetChartSourceData, type SheetChart } from "@sheetcraft/core/sheet-charts";
import { inferChartInsertHeaders } from "../../../modules/charts/chart-insert-headers";
function fixture(values: (string | number)[][]) {
  const workbook = createWorkbook({ id: "headers", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  values.forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(sheet, { row: r, column }, { kind: "literal", value }),
    ),
  );
  const evaluator = createSheetEvaluator(sheet);
  const chart: SheetChart = {
    type: "column",
    range: {
      start: { row: 0, column: 0 },
      end: { row: values.length - 1, column: Math.max(...values.map((row) => row.length)) - 1 },
    },
    title: "Chart",
    headerRow: true,
    headerColumn: true,
    seriesBy: "columns",
    legend: true,
    labels: false,
    stacked: false,
    showHidden: false,
  };
  return { sheet, chart, evaluator, infer: () => inferChartInsertHeaders(sheet, chart, evaluator) };
}
describe("new chart initial range interpretation", () => {
  test("single numeric column previews every original value", () => {
    const f = fixture([[1], [2], [3]]);
    const next = { ...f.chart, ...f.infer() };
    expect(next.headerRow).toBe(false);
    expect(next.headerColumn).toBe(false);
    expect(getSheetChartSourceData(f.sheet, next, f.evaluator).series[0]?.values).toEqual([
      1, 2, 3,
    ]);
  });
  test("single numeric row does not consume its only data row", () => {
    const f = fixture([[1, 2, 3]]);
    expect(f.infer()).toEqual({ headerRow: false, headerColumn: false });
  });
  test("a conventional text heading and category band remain headers", () => {
    const f = fixture([
      ["Month", "Sales"],
      ["Jan", 1],
      ["Feb", 2],
    ]);
    expect(f.infer()).toEqual({ headerRow: true, headerColumn: true });
  });
  test("mixed first row and numeric date serial are data", () => {
    const f = fixture([
      ["Jan", 45292],
      ["Feb", 45293],
    ]);
    expect(f.infer()).toEqual({ headerRow: false, headerColumn: true });
  });
  test("formula headings are evaluated before deciding", () => {
    const f = fixture([[1], [2], [3]]);
    setCellContent(
      f.sheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=1+1" } },
    );
    expect(f.infer()).toEqual({ headerRow: false, headerColumn: false });
  });
  test("hidden first row and column are never silently designated as headers", () => {
    const f = fixture([
      ["Month", "Sales"],
      ["Jan", 1],
      ["Feb", 2],
    ]);
    f.sheet.hiddenRows = new Set([0]);
    f.sheet.hiddenColumns = new Set([0]);
    expect(f.infer()).toEqual({ headerRow: false, headerColumn: false });
    f.chart.showHidden = true;
    expect(f.infer()).toEqual({ headerRow: true, headerColumn: true });
  });
  test("blank and error first cells do not become a title", () => {
    const f = fixture([
      ["", 1],
      ["", 2],
    ]);
    expect(f.infer()).toEqual({ headerRow: false, headerColumn: false });
    setCellContent(
      f.sheet,
      { row: 0, column: 0 },
      { kind: "formula", formula: { source: "=1/0" } },
    );
    expect(f.infer()).toEqual({ headerRow: false, headerColumn: false });
  });
  test("linked and cached ownership retain saved interpretation", () => {
    const f = fixture([[1], [2], [3]]);
    f.chart.pivotTableId = "pivot";
    expect(f.infer()).toEqual({ headerRow: true, headerColumn: true });
  });
});

describe("new chart title defaults", () => {
  test("the initial title is separate from the object name and existing edit preserves its title", async () => {
    const { useChartActions } = await import("../../../modules/charts/useChartActions");
    const workbook = createWorkbook({ id: "titles", sheetId: "sheet" });
    const sheet = getActiveSheet(workbook);
    [1, 2, 3].forEach((value, row) =>
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value }),
    );
    const actions = useChartActions({
      getWorkbook: () => workbook,
      getSheet: () => sheet,
      getRange: () => ({ start: { row: 0, column: 0 }, end: { row: 2, column: 0 } }),
      getEvaluator: () => createSheetEvaluator(sheet),
      isBusy: () => false,
      flush: () => true,
      execute: () => true,
      name: () => "Charts",
      title: () => "Chart Title",
    });
    actions.insert("column");
    const initial = actions.dialog.value!.initial;
    expect(initial.name).toBe("Charts");
    expect(initial.chart.title).toBe("Chart Title");
    actions.close();
    const existing = { ...initial, chart: { ...initial.chart, title: "User's title" } };
    sheet.drawings = [existing];
    actions.edit(existing);
    expect(actions.dialog.value!.initial.chart.title).toBe("User's title");
    actions.close();
  });
});
