import { describe, expect, test } from "vitest";
import { buildPivotResult, getPivotTableSource, normalizePivotTable } from "../../pivot-tables.js";
import { createSetPivotTableCommand } from "../../commands/pivot-tables.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import {
  createSheet,
  insertSheet,
  setCellContent,
  getCellValue,
  createSheetEvaluator,
} from "../../workbook.js";
import { getSheetChartData } from "../../sheet-charts.js";
import type { SheetChartDrawing } from "../../sheet-drawings.js";
import { fixture } from "./fixture.js";

function report(count = 1) {
  const f = fixture([
    ["Region", "Q1"],
    ["East", 0],
    ["West", 10],
  ]);
  const second = createSheet("Second", "second");
  insertSheet(f.workbook, second);
  [
    ["District", "Q2"],
    ["East", 20],
  ].forEach((row, r) =>
    row.forEach((value, c) =>
      setCellContent(second, { row: r, column: c }, { kind: "literal", value }),
    ),
  );
  f.table.consolidation = {
    ranges: [
      {
        sheetId: f.source.id,
        range: f.table.source,
        label: "First",
        pageItems: Array.from({ length: count }, (_, i) => `Group${i + 1}`),
      },
      {
        sheetId: second.id,
        range: { start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
        label: "Second",
        pageItems: Array.from({ length: count }, (_, i) => `Group${i + 1}`),
      },
    ],
    labels: ["Row", "Column", "Value", ...Array.from({ length: count }, (_, i) => `Page${i + 1}`)],
    pageFields: { mode: count === 1 ? "single" : "custom", count },
  };
  f.table.reportLayout = {
    rowLabel: "Row",
    columnLabel: "Column",
    allLabel: "(All)",
    multipleLabel: "(Multiple Items)",
  };
  f.table.values = [{ field: 2, aggregate: "sum", caption: "Sum of Value" }];
  f.table.filters = Array.from({ length: count }, (_, i) => ({
    field: i + 3,
    values: [],
    all: true,
  }));
  return { ...f, second, current: () => f.destination.pivotTables![0]! };
}

describe("WPS pivot report layout", () => {
  test("matches the three-area WPS example by labels and grand totals", () => {
    const data = [
      Array.from({ length: 11 }, (_, i) => `title${i + 1}`),
      ...Array.from({ length: 11 }, (_, i) =>
        Array.from({ length: 11 }, (_, k) => (k + 1) * (i + 1) + 1),
      ),
    ];
    const f = fixture(data, { row: 2, column: 1 });
    f.table.consolidation = {
      ranges: [
        [1, 4],
        [5, 8],
        [9, 11],
      ].map(([start, end], index) => ({
        sheetId: f.source.id,
        range: { start: { row: 2, column: start! }, end: { row: 13, column: end! } },
        label: `Area${index + 1}`,
        pageItems: [],
      })),
      labels: ["Row", "Column", "Value"],
      pageFields: { mode: "custom", count: 0 },
    };
    f.table.reportLayout = report(0).table.reportLayout;
    f.table.sort = "ascending";
    const result = buildPivotResult(f.workbook, f.table);
    expect(result.matrix[1]).toEqual([
      "Row",
      "title10",
      "title11",
      "title2",
      "title3",
      "title4",
      "title6",
      "title7",
      "title8",
      "Grand Total",
    ]);
    expect(result.matrix.at(-1)).toEqual([
      "Grand Total",
      671,
      737,
      143,
      209,
      275,
      407,
      473,
      539,
      3454,
    ]);
    expect(result.matrix.find((row) => row[0] === 6)).toEqual([
      6,
      null,
      null,
      11,
      16,
      21,
      7,
      8,
      9,
      72,
    ]);
    expect(result.matrix.find((row) => row[0] === 46)).toEqual([
      46,
      51,
      56,
      null,
      null,
      null,
      55,
      64,
      73,
      299,
    ]);
  });

  test("writes a page selection, spacer, split headers and sparse cross-tab cells", () => {
    const f = report();
    const result = buildPivotResult(f.workbook, f.table);
    expect(result.matrix).toEqual([
      ["Page1", "(All)", null, null],
      [null, null, null, null],
      ["Sum of Value", "Column", null, null],
      ["Row", "Q1", "Q2", "Grand Total"],
      ["East", 0, 20, 20],
      ["West", 10, null, 10],
      ["Grand Total", 10, 20, 30],
    ]);
    expect(result.headerRows).toBe(4);
    expect(result.dataRows).toEqual([4, 5]);
    expect(result.seriesLabels).toEqual([
      "Q1 / Sum of Value",
      "Q2 / Sum of Value",
      "Grand Total / Sum of Value",
    ]);
  });

  test.each([0, 1, 4])("exposes exactly %i configured page fields", (count) => {
    const f = report(count);
    const source = getPivotTableSource(f.workbook, f.table);
    expect(source.headers).toHaveLength(3 + count);
    expect([...source.records()].every((record) => record.length === 3 + count)).toBe(true);
    const result = buildPivotResult(f.workbook, f.table);
    expect(result.headerRows).toBe(count ? count + 3 : 2);
    expect(result.matrix.slice(0, count).map((row) => row.slice(0, 2))).toEqual(
      Array.from({ length: count }, (_, i) => [`Page${i + 1}`, "(All)"]),
    );
    expect(result.matrix[result.headerRows]).toEqual(["East", 0, 20, 20]);
  });

  test("a shared custom page item selects records from both source areas", () => {
    const f = report(4);
    f.table.filters = [
      { field: 3, values: ["Group1"] },
      { field: 6, values: ["Group4"] },
    ];
    const result = buildPivotResult(f.workbook, f.table);
    expect(result.sourceRows).toBe(3);
    expect(result.matrix.slice(0, 2).map((row) => row.slice(0, 2))).toEqual([
      ["Page1", "Group1"],
      ["Page4", "Group4"],
    ]);
    expect(result.matrix.at(-1)).toEqual(["Grand Total", 10, 20, 30]);
    const excluded = buildPivotResult(f.workbook, {
      ...f.table,
      filters: [{ field: 3, values: ["Missing"] }],
    });
    expect(excluded.sourceRows).toBe(0);
    expect(excluded.matrix[0]!.slice(0, 2)).toEqual(["Page1", "Missing"]);
    const multiple = buildPivotResult(f.workbook, {
      ...f.table,
      filters: [{ field: 3, values: ["Group1", "Other"] }],
    });
    expect(multiple.matrix[0]!.slice(0, 2)).toEqual(["Page1", "(Multiple Items)"]);
  });

  test("keeps separate header levels for multiple column dimensions", () => {
    const f = report();
    f.table.filters = [];
    f.table.columnFields = [1, 3];
    const result = buildPivotResult(f.workbook, f.table);
    expect(result.matrix.slice(0, 3)).toEqual([
      ["Sum of Value", "Column", null, null],
      [null, "Q1", "Q2", "Grand Total"],
      ["Row", "Group1", "Group1", null],
    ]);
    expect(result.headerRows).toBe(3);
    expect(result.matrix[3]).toEqual(["East", 0, 20, 20]);
    expect(result.seriesLabels.slice(0, 2)).toEqual([
      "Q1 / Group1 / Sum of Value",
      "Q2 / Group1 / Sum of Value",
    ]);
  });

  test("rejects malformed page-field counts and range item assignments", () => {
    const f = report(4);
    for (const count of [-1, 5, 1.5])
      expect(() =>
        normalizePivotTable({
          ...f.table,
          consolidation: { ...f.table.consolidation!, pageFields: { mode: "custom", count } },
        }),
      ).toThrow();
    expect(() =>
      normalizePivotTable({
        ...f.table,
        consolidation: { ...f.table.consolidation!, pageFields: { mode: "single", count: 4 } },
      }),
    ).toThrow();
    for (const pageItems of [undefined, ["Group1"], ["Group1", "Group2", "Group3", ""]]) {
      expect(() =>
        normalizePivotTable({
          ...f.table,
          consolidation: {
            ...f.table.consolidation!,
            ranges: f.table.consolidation!.ranges.map((area, index) =>
              index ? area : { ...area, pageItems },
            ),
          },
        }),
      ).toThrow();
    }
    const normalized = normalizePivotTable(f.table);
    normalized.consolidation!.ranges[0]!.pageItems![0] = "Changed";
    expect(f.table.consolidation!.ranges[0]!.pageItems![0]).toBe("Group1");
  });

  test("charts read data and series captions without page headers or grand totals", () => {
    const f = report();
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, f.table, { chartId: "chart" }),
    );
    const drawing = f.destination.drawings![0] as SheetChartDrawing;
    const data = getSheetChartData(
      f.destination,
      drawing.chart,
      createSheetEvaluator(f.destination),
    );
    expect(data.categories).toEqual(["East", "West"]);
    expect(data.series).toEqual([
      { name: "Q1 / Sum of Value", values: [0, 10] },
      { name: "Q2 / Sum of Value", values: [20, null] },
    ]);
    expect(f.current().resultLayout).toMatchObject({ headerRows: 4, dataRows: [4, 5] });
  });

  test("refresh, undo and redo preserve output values and report layout", () => {
    const f = report();
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    setCellContent(f.second, { row: 1, column: 1 }, { kind: "literal", value: 120 });
    const address = { row: 6, column: 4 };
    expect(getCellValue(f.destination, address)).toBe(20);
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.current()));
    expect(getCellValue(f.destination, address)).toBe(120);
    const after = serializeWorkbook(f.workbook);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(getCellValue(f.destination, address)).toBe(20);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
    expect(getCellValue(f.destination, address)).toBe(120);
  });

  test("round trips V35 workbook and standalone sheet and rejects V34 metadata", () => {
    const f = report(4);
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    const snapshot = serializeWorkbook(f.workbook);
    expect(snapshot.version).toBe(38);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    const standalone = serializeSheet(f.destination);
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    expect(() => deserializeWorkbook({ ...snapshot, version: 34 })).toThrow();
  });
});
