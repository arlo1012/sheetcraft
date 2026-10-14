// @vitest-environment node
import { describe, expect, test } from "vitest";
import { createSheet, createSheetEvaluator } from "@sheetcraft/core/workbook";
import { createPrintPreviewDocument } from "../../../modules/page-layout/page-print-renderer";

describe("Chart print source safety", () => {
  test("never silently prints a chart-only sheet without an actual chart consumer", () => {
    const sheet = createSheet("Chart only", "sheet");
    sheet.drawings = [
      {
        id: "chart",
        name: "Chart",
        kind: "chart",
        anchor: { row: 50, column: 20 },
        offsetX: 0,
        offsetY: 0,
        width: 480,
        height: 300,
        text: "",
        shape: "rectangle",
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 0,
        color: "#000000",
        fontSize: 11,
        bold: false,
        italic: false,
        rotation: 0,
        chart: {
          type: "column",
          range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
          title: "Sales",
          headerRow: true,
          headerColumn: true,
          seriesBy: "columns",
          legend: true,
          labels: false,
          stacked: false,
          showHidden: false,
        },
      },
    ];
    const before = JSON.stringify(sheet.drawings);
    expect(() =>
      createPrintPreviewDocument({ sheet, evaluator: createSheetEvaluator(sheet) }),
    ).toThrow(/chart/i);
    expect(JSON.stringify(sheet.drawings)).toBe(before);
  });
  test("a sheet without charts retains its existing print path", () => {
    const sheet = createSheet("Empty", "sheet");
    expect(
      createPrintPreviewDocument({ sheet, evaluator: createSheetEvaluator(sheet) }).pages.length,
    ).toBeGreaterThan(0);
  });
});
