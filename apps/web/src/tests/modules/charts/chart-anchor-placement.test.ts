import { describe, expect, test } from "vitest";
import {
  createSheet,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type Sheet,
} from "@sheetcraft/core/workbook";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { resolveNewChartAnchor } from "../../../modules/charts/useChartActions";

function dummyChart(id: string, row: number, column: number): SheetChartDrawing {
  return {
    id,
    kind: "chart",
    name: id,
    anchor: { row, column },
    offsetX: 8,
    offsetY: 8,
    width: 480,
    height: 300,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#d1d5db",
    strokeWidth: 1,
    color: "#111827",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
    chart: {
      type: "column",
      range: null,
      title: id,
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
    },
  };
}

describe("resolveNewChartAnchor", () => {
  test("places new chart to the right of its source range without covering source data", () => {
    const sheet: Sheet = createSheet("sheet-1", "Sheet1");
    const placement = resolveNewChartAnchor(
      sheet,
      { start: { row: 1, column: 0 }, end: { row: 5, column: 3 } },
      { row: 1, column: 0 },
    );
    expect(placement).toEqual({
      anchor: { row: 1, column: 5 },
      offsetX: 8,
      offsetY: 8,
    });
  });

  test("falls back below source range when near the rightmost column", () => {
    const sheet: Sheet = createSheet("sheet-1", "Sheet1");
    const placement = resolveNewChartAnchor(
      sheet,
      {
        start: { row: 2, column: MAX_SHEET_COLUMNS - 3 },
        end: { row: 6, column: MAX_SHEET_COLUMNS - 1 },
      },
      { row: 2, column: MAX_SHEET_COLUMNS - 3 },
    );
    expect(placement).toEqual({
      anchor: { row: 8, column: MAX_SHEET_COLUMNS - 3 },
      offsetX: 8,
      offsetY: 8,
    });
  });

  test("falls back to the provided anchor when source range is null or spans max bounds", () => {
    const sheet: Sheet = createSheet("sheet-1", "Sheet1");
    expect(resolveNewChartAnchor(sheet, null, { row: 3, column: 4 })).toEqual({
      anchor: { row: 3, column: 4 },
      offsetX: 8,
      offsetY: 8,
    });
    expect(
      resolveNewChartAnchor(
        sheet,
        {
          start: { row: 0, column: 0 },
          end: { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
        },
        { row: 0, column: 0 },
      ),
    ).toEqual({
      anchor: { row: 0, column: 0 },
      offsetX: 8,
      offsetY: 8,
    });
  });

  test("staggers offsetX and offsetY when charts already exist at the resolved anchor", () => {
    const sheet: Sheet = createSheet("sheet-1", "Sheet1");
    sheet.drawings = [dummyChart("chart-1", 1, 5), dummyChart("chart-2", 1, 5)];
    const placement = resolveNewChartAnchor(
      sheet,
      { start: { row: 1, column: 0 }, end: { row: 5, column: 3 } },
      { row: 1, column: 0 },
    );
    expect(placement).toEqual({
      anchor: { row: 1, column: 5 },
      offsetX: 56,
      offsetY: 56,
    });
  });
});
