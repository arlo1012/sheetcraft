import { describe, expect, test } from "vitest";
import {
  buildPivotResult,
  getPivotPresentation,
  normalizePivotTable,
  type PivotPresentation,
} from "../../pivot-tables.js";
import { createSetPivotTableCommand } from "../../commands/pivot-tables.js";
import {
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
} from "../../commands/structure.js";
import { executeWorkbookCommand } from "../../history.js";
import { createSheetEvaluator } from "../../workbook.js";
import { getSheetChartData } from "../../sheet-charts.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import { fixture } from "./fixture.js";

function grouped(patch: Partial<PivotPresentation> = {}) {
  const f = fixture([
    ["Region", "Team", "Amount"],
    ["East", "A", 10],
    ["East", "A", 20],
    ["East", "B", 30],
    ["West", "A", 40],
  ]);
  f.table.rowFields = [0, 1];
  f.table.columnFields = [];
  f.table.presentation = {
    layout: "tabular",
    subtotals: "off",
    repeatLabels: true,
    blankRows: false,
    rowHeaders: true,
    columnHeaders: true,
    bandedRows: true,
    bandedColumns: false,
    ...patch,
  };
  return f;
}
describe("pivot presentation", () => {
  test("preserves legacy tabular repeated labels without subtotals", () => {
    const f = grouped();
    delete f.table.presentation;
    expect(getPivotPresentation(f.table)).toMatchObject({
      layout: "tabular",
      subtotals: "off",
      repeatLabels: true,
    });
    expect(buildPivotResult(f.workbook, f.table).matrix).toEqual([
      ["Region", "Team", "Amount"],
      ["East", "A", 30],
      ["East", "B", 30],
      ["West", "A", 40],
      ["Grand Total", "", 100],
    ]);
  });
  test.each(["top", "bottom"] as const)(
    "computes distinct two-level subtotals at the %s",
    (subtotals) => {
      const f = grouped({ subtotals });
      const result = buildPivotResult(f.workbook, f.table);
      expect(result.subtotalRows.map((index) => result.matrix[index])).toEqual([
        ["East Grand Total", "", 60],
        ["West Grand Total", "", 40],
      ]);
      expect(result.dataRows.map((index) => result.matrix[index]!.at(-1))).toEqual([30, 30, 40]);
      expect(result.rowLabels).toEqual(["East / A", "East / B", "West / A"]);
      expect(result.matrix[result.totalRow!]).toEqual(["Grand Total", "", 100]);
      expect(result.dataRows).toEqual(subtotals === "top" ? [2, 3, 5] : [1, 2, 4]);
    },
  );
  test.each(["compact", "outline", "tabular"] as const)(
    "renders %s labels with unchanged leaf aggregates",
    (layout) => {
      const f = grouped({ layout });
      const result = buildPivotResult(f.workbook, f.table);
      expect(result.rowLabelColumns).toBe(layout === "compact" ? 1 : 2);
      expect(result.matrix[0]).toHaveLength(layout === "compact" ? 2 : 3);
      expect(result.dataRows.map((index) => result.matrix[index]!.at(-1))).toEqual([30, 30, 40]);
      expect(result.rowLabels).toEqual(["East / A", "East / B", "West / A"]);
      if (layout === "compact") {
        expect(result.matrix).toEqual([
          ["Region", "Amount"],
          ["East", null],
          ["A", 30],
          ["B", 30],
          ["West", null],
          ["A", 40],
          ["Grand Total", 100],
        ]);
        expect(result.rowIndents).toEqual([0, 0, 1, 1, 0, 1, 0]);
      } else if (layout === "outline") {
        expect(result.matrix[1]).toEqual(["East", "", null]);
        expect(result.matrix[4]).toEqual(["West", "", null]);
      } else expect(result.matrix).toHaveLength(5);
    },
  );
  test("suppresses repeated tabular row labels and inserts group blank rows", () => {
    const f = grouped({ repeatLabels: false, blankRows: true, subtotals: "bottom" });
    const result = buildPivotResult(f.workbook, f.table);
    expect(result.matrix[1]).toEqual(["East", "A", 30]);
    expect(result.matrix[2]).toEqual(["", "B", 30]);
    expect(result.matrix[4]).toEqual([null, null, null]);
    expect(result.matrix[7]).toEqual([null, null, null]);
    expect(result.dataRows).toEqual([1, 2, 5]);
    expect(result.subtotalRows).toEqual([3, 6]);
    expect(result.totalRow).toBe(8);
  });
  test.each(["compact", "outline", "tabular"] as const)(
    "keeps only leaf rows in linked %s pivot charts",
    (layout) => {
      const f = grouped({ layout, subtotals: "top", repeatLabels: false, blankRows: true });
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(f.destination.id, f.table, { chartId: "chart" }),
      );
      const drawing = f.destination.drawings![0] as SheetChartDrawing;
      expect(
        getSheetChartData(f.destination, drawing.chart, createSheetEvaluator(f.destination)),
      ).toMatchObject({
        categories: ["East / A", "East / B", "West / A"],
        series: [{ name: "Amount", values: [30, 30, 40] }],
      });
      expect(f.destination.pivotTables![0]!.resultLayout!.dataRows).toHaveLength(3);
    },
  );
  test("clones presentation and cached layout data independently", () => {
    const f = grouped();
    f.table.resultLayout = {
      labelColumns: 2,
      dataRows: [1, 2, 3],
      rowLabels: ["East / A", "East / B", "West / A"],
    };
    const clone = normalizePivotTable(f.table);
    clone.presentation!.layout = "compact";
    clone.resultLayout!.dataRows[0] = 5;
    clone.resultLayout!.rowLabels[0] = "Other";
    expect(f.table.presentation!.layout).toBe("tabular");
    expect(f.table.resultLayout!.dataRows[0]).toBe(1);
    expect(f.table.resultLayout!.rowLabels[0]).toBe("East / A");
  });
  test.each(["insert", "delete"] as const)(
    "keeps chart leaf labels and values aligned after a row %s inside the report",
    (operation) => {
      const f = grouped({ subtotals: "top", blankRows: true });
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(f.destination.id, f.table, { chartId: "chart" }),
      );
      const table = f.destination.pivotTables![0]!;
      const secondLeafRow = table.anchor.row + table.resultLayout!.dataRows[1]!;
      executeWorkbookCommand(
        f.session,
        operation === "insert"
          ? createInsertSheetAxisCommand(f.destination.id, "row", secondLeafRow, 1)
          : createDeleteSheetAxisCommand(f.destination.id, "row", secondLeafRow, 1),
      );

      const updated = f.destination.pivotTables![0]!;
      expect(updated.resultLayout).toMatchObject({
        dataRows: operation === "insert" ? [2, 4, 7] : [2, 5],
        rowLabels:
          operation === "insert" ? ["East / A", "East / B", "West / A"] : ["East / A", "West / A"],
      });
      const drawing = f.destination.drawings![0] as SheetChartDrawing;
      expect(
        getSheetChartData(f.destination, drawing.chart, createSheetEvaluator(f.destination)),
      ).toMatchObject({
        categories:
          operation === "insert" ? ["East / A", "East / B", "West / A"] : ["East / A", "West / A"],
        series: [{ name: "Amount", values: operation === "insert" ? [30, 30, 40] : [30, 40] }],
      });
    },
  );
});
