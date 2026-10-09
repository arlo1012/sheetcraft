import { describe, expect, test } from "vitest";
import { buildPivotResult } from "../../pivot-tables.js";
import { createSetPivotTableCommand } from "../../commands/pivot-tables.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { serializeWorkbook, deserializeWorkbook } from "../../serialization.js";
import {
  createSheetEvaluator,
  getCellContent,
  getCellStyle,
  getCellValue,
  setCellContent,
} from "../../workbook.js";
import { getSheetChartData } from "../../sheet-charts.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import { fixture } from "./fixture.js";

function rangeReport() {
  const f = fixture([
    ["title1", "title2", "title3", "title4"],
    ...Array.from({ length: 11 }, (_, index) => {
      const i = index + 1;
      return [i + 1, 2 * i + 1, 3 * i + 1, 4 * i + 1];
    }),
  ]);
  f.table.anchor = { row: 0, column: 0 };
  f.table.filters = [{ field: 0, values: [], all: true }];
  f.table.columnFields = [1];
  f.table.rowFields = [2];
  f.table.values = [{ field: 3, aggregate: "sum", caption: "求和项:title4" }];
  f.table.totalLabel = "总计";
  f.table.reportLayout = {
    rowLabel: "行",
    columnLabel: "列",
    allLabel: "(全部)",
    multipleLabel: "(多项)",
  };
  return f;
}

describe("WPS single-range pivot report", () => {
  test("matches the supplied A1:M16 report with source field captions and sparse intersections", () => {
    const f = rangeReport();
    const result = buildPivotResult(f.workbook, f.table);
    expect(result.matrix).toEqual([
      ["title1", "(全部)", ...Array(11).fill(null)],
      Array(13).fill(null),
      ["求和项:title4", "title2", ...Array(11).fill(null)],
      ["title3", ...Array.from({ length: 11 }, (_, i) => 2 * i + 3), "总计"],
      ...Array.from({ length: 11 }, (_, i) => [
        3 * i + 4,
        ...Array.from({ length: 11 }, (_, column) => (column === i ? 4 * i + 5 : null)),
        4 * i + 5,
      ]),
      ["总计", ...Array.from({ length: 11 }, (_, i) => 4 * i + 5), 275],
    ]);
    expect(result.headerRows).toBe(4);
    expect(result.dataRows).toEqual(Array.from({ length: 11 }, (_, i) => i + 4));
    expect(result.totalRow).toBe(15);
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    expect(f.destination.pivotTables![0]!.outputRange).toEqual({
      start: { row: 0, column: 0 },
      end: { row: 15, column: 12 },
    });
  });

  test("keeps an actual zero while leaving absent row-column combinations blank", () => {
    const f = rangeReport();
    setCellContent(f.source, { row: 1, column: 3 }, { kind: "literal", value: 0 });
    const result = buildPivotResult(f.workbook, f.table);
    expect(result.matrix[4]!.slice(0, 4)).toEqual([4, 0, null, null]);
    expect(result.matrix[5]!.slice(0, 4)).toEqual([7, null, 9, null]);
    expect(result.matrix.at(-1)!.at(-1)).toBe(270);
  });

  test("formats report headers and totals blue while keeping sparse data cells white", () => {
    const f = rangeReport();
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    for (const row of [2, 3, 15]) {
      for (const column of [0, 1, 12]) {
        expect(getCellStyle(f.destination, { row, column })).toMatchObject({
          fillColor: "#dce6f1",
          textColor: "#000000",
          bold: true,
        });
      }
    }
    for (const address of [
      { row: 4, column: 1 },
      { row: 4, column: 2 },
    ]) {
      expect(getCellStyle(f.destination, address)).toMatchObject({
        fillColor: "#ffffff",
        textColor: "#000000",
      });
      expect(getCellStyle(f.destination, address)?.bold).not.toBe(true);
    }
    expect(getCellContent(f.destination, { row: 4, column: 2 })).toBeNull();
    for (const column of [0, 1])
      expect(getCellStyle(f.destination, { row: 0, column })).toMatchObject({
        fillColor: "#dce6f1",
        textColor: "#000000",
      });
    expect(getCellStyle(f.destination, { row: 1, column: 0 })?.fillColor).toBeUndefined();
  });

  test.each(["default", "explicit"] as const)(
    "respects a %s custom pivot style instead of applying report default colors",
    (selection) => {
      const f = rangeReport();
      f.workbook.pivotTableStyles = [
        {
          id: "custom-report",
          name: "Custom report",
          category: "custom",
          elements: {
            wholeTable: { style: { fillColor: "#fff0dd", textColor: "#224466" } },
            headerRow: { style: { fillColor: "#aabbcc" } },
            totalRow: { style: { fillColor: "#bbccdd" } },
            pageFieldLabels: { style: { fillColor: "#ccddee" } },
            pageFieldValues: { style: { fillColor: "#ddeeff" } },
          },
        },
      ];
      if (selection === "default") f.workbook.defaultPivotTableStyleId = "custom-report";
      else f.table.styleId = "custom-report";
      executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
      expect(getCellStyle(f.destination, { row: 2, column: 1 })).toMatchObject({
        fillColor: "#aabbcc",
        textColor: "#224466",
      });
      expect(getCellStyle(f.destination, { row: 4, column: 2 })?.fillColor).toBe("#fff0dd");
      expect(getCellStyle(f.destination, { row: 15, column: 1 })?.fillColor).toBe("#bbccdd");
      expect(getCellStyle(f.destination, { row: 0, column: 0 })?.fillColor).toBe("#ccddee");
      expect(getCellStyle(f.destination, { row: 0, column: 1 })?.fillColor).toBe("#ddeeff");
    },
  );

  test("shows a selected filter value and recomputes the cross-tab for its records", () => {
    const f = rangeReport();
    f.table.filters = [{ field: 0, values: [5] }];
    expect(buildPivotResult(f.workbook, f.table).matrix).toEqual([
      ["title1", 5, null],
      [null, null, null],
      ["求和项:title4", "title2", null],
      ["title3", 9, "总计"],
      [13, 17, 17],
      ["总计", 17, 17],
    ]);
  });

  test("linked charts exclude page fields, split headers and grand totals", () => {
    const f = rangeReport();
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, f.table, { chartId: "range-chart" }),
    );
    const drawing = f.destination.drawings![0] as SheetChartDrawing;
    const data = getSheetChartData(
      f.destination,
      drawing.chart,
      createSheetEvaluator(f.destination),
    );
    expect(data.categories).toEqual(Array.from({ length: 11 }, (_, i) => String(3 * i + 4)));
    expect(data.series).toEqual(
      Array.from({ length: 11 }, (_, i) => ({
        name: `${2 * i + 3} / 求和项:title4`,
        values: Array.from({ length: 11 }, (_, row) => (row === i ? 4 * i + 5 : null)),
      })),
    );
  });

  test("filter refresh undo, redo and serialization preserve the report and its layout", () => {
    const f = rangeReport();
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, {
        ...f.destination.pivotTables![0]!,
        filters: [{ field: 0, values: [5] }],
      }),
    );
    expect(getCellValue(f.destination, { row: 4, column: 1 })).toBe(17);
    const after = serializeWorkbook(f.workbook);
    expect(serializeWorkbook(deserializeWorkbook(after))).toEqual(after);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(getCellValue(f.destination, { row: 15, column: 12 })).toBe(275);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
    expect(f.destination.pivotTables![0]!.reportLayout).toEqual(f.table.reportLayout);
  });
});
