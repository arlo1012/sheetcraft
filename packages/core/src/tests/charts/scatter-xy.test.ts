// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import { normalizeChartPresentation, scatterStyles } from "../../chart-presentation.js";
import { getSheetChartData, type SheetChart } from "../../sheet-charts.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { createSheetEvaluator, getActiveSheet, setCellContent } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { elementDrawing } from "./chart-elements-fixture.js";

function fixture(seriesBy: "rows" | "columns", x: Array<number | string | null>) {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  const y: Array<number | string | null> = [10, 20, null, "not numeric"];
  const matrix =
    seriesBy === "columns"
      ? [["X", "Y"], ...x.map((value, i) => [value, y[i]!])]
      : [
          ["", "P1", "P2", "P3", "P4"],
          ["X", ...x],
          ["Y", ...y],
        ];
  matrix.forEach((row, r) =>
    row.forEach((value, column) => {
      if (value !== null) setCellContent(sheet, { row: r, column }, { kind: "literal", value });
    }),
  );
  const chart: SheetChart = {
    type: "scatter",
    range: {
      start: { row: 0, column: 0 },
      end: { row: matrix.length - 1, column: matrix[0]!.length - 1 },
    },
    title: "XY",
    headerRow: true,
    headerColumn: seriesBy === "rows",
    seriesBy,
    legend: true,
    labels: true,
    stacked: false,
    showHidden: false,
  };
  return { session, sheet, chart };
}

describe("XY scatter rectangle source and presentation", () => {
  test.each(["rows", "columns"] as const)(
    "a nonempty text X converts the entire %s X vector to one-based ordinals",
    (seriesBy) => {
      const f = fixture(seriesBy, [10, "named point", null, 40]);
      const before = serializeWorkbook(f.session.workbook);
      const source = getSheetChartData(f.sheet, f.chart, createSheetEvaluator(f.sheet));
      expect(source.series.map((series) => series.name)).toEqual(["X", "Y"]);
      expect(source.series[0]!.values).toEqual([1, 2, 3, 4]);
      expect(source.series[1]!.values).toEqual([10, 20, null, null]);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    },
  );

  test("numeric X blanks remain blank while text Y becomes a missing Y, without ordinal fallback", () => {
    const f = fixture("columns", [10, null, 30, 40]);
    const source = getSheetChartData(f.sheet, f.chart, createSheetEvaluator(f.sheet));
    expect(source.series[0]!.values).toEqual([10, null, 30, 40]);
    expect(source.series[1]!.values).toEqual([10, 20, null, null]);
  });

  test.each(scatterStyles)(
    "snapshot V103 saves the explicit %s subtype and live theme accent",
    (scatterStyle) => {
      const f = fixture("columns", [1, 2, 3, 4]);
      const input = elementDrawing();
      input.chart = { ...f.chart, presentation: { scatterStyle, themeAccent: 3 } };
      const original = structuredClone(input);
      expect(
        executeWorkbookCommand(f.session, createSetSheetDrawingsCommand(f.sheet.id, [input])),
      ).toBe(true);
      const snapshot = serializeWorkbook(f.session.workbook);
      expect(snapshot.version).toBe(103);
      const restored = deserializeWorkbook(snapshot);
      expect(restored.sheets.get(f.sheet.id)!.drawings).toEqual([original]);
      expect(serializeWorkbook(restored)).toEqual(snapshot);
      expect(() => deserializeWorkbook({ ...snapshot, version: 102 })).toThrow();
      expect(input).toEqual(original);
    },
  );

  test.each([0, 1, 2, 3, 4, 5])("accepts theme accent slot %s", (themeAccent) => {
    expect(normalizeChartPresentation({ scatterStyle: "marker", themeAccent })).toEqual({
      scatterStyle: "marker",
      themeAccent,
    });
  });

  test.each([
    { scatterStyle: "unknown" },
    { themeAccent: -1 },
    { themeAccent: 6 },
    { themeAccent: 1.5 },
    { themeAccent: NaN },
    { themeAccent: 0, palette: ["#123456"] },
  ])("rejects invalid or ambiguous scatter presentation %j", (presentation) => {
    expect(() => normalizeChartPresentation(presentation)).toThrow();
  });
});
