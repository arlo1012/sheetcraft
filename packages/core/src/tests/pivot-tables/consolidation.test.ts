import { describe, expect, test } from "vitest";
import { buildPivotResult, getPivotTableSource, normalizePivotTable } from "../../pivot-tables.js";
import { createSetPivotTableCommand } from "../../commands/pivot-tables.js";
import {
  createDeleteSheetAxisCommand,
  createDuplicateSheetCommand,
  createInsertSheetAxisCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { serializeWorkbook, deserializeWorkbook } from "../../serialization.js";
import {
  createSheet,
  insertSheet,
  setCellContent,
  getCellValue,
  type CellValue,
} from "../../workbook.js";
import { fixture } from "./fixture.js";

function matrices() {
  const f = fixture([
    ["Region", "Q1", "Q2"],
    ["East", 10, 20],
    ["West", 30, 40],
  ]);
  const second = createSheet("Second", "second");
  insertSheet(f.workbook, second);
  const data: CellValue[][] = [
    ["District", "Q2", "Q1"],
    ["East", 60, 50],
  ];
  data.forEach((row, r) =>
    row.forEach((value, c) =>
      setCellContent(second, { row: r + 4, column: c + 2 }, { kind: "literal", value }),
    ),
  );
  f.table.consolidation = {
    ranges: [
      { sheetId: f.source.id, range: f.table.source, label: "First" },
      {
        sheetId: second.id,
        range: { start: { row: 4, column: 2 }, end: { row: 5, column: 4 } },
        label: "Second",
      },
    ],
    labels: ["Row", "Column", "Value", "Area"],
  };
  return { ...f, second, current: () => f.destination.pivotTables![0]! };
}

describe("pivot matrix consolidation", () => {
  test("combines differently ordered labeled matrices across sheets", () => {
    const f = matrices();
    const source = getPivotTableSource(f.workbook, f.table);
    expect(source.headers).toEqual(["Row", "Column", "Value", "Area"]);
    expect([...source.records()]).toEqual([
      ["East", "Q1", 10, "First"],
      ["East", "Q2", 20, "First"],
      ["West", "Q1", 30, "First"],
      ["West", "Q2", 40, "First"],
      ["East", "Q2", 60, "Second"],
      ["East", "Q1", 50, "Second"],
    ]);
    expect(buildPivotResult(f.workbook, f.table).matrix).toEqual([
      ["Row", "Q1 / Amount", "Q2 / Amount", "Grand Total / Amount"],
      ["East", 60, 80, 140],
      ["West", 30, 40, 70],
      ["Grand Total", 90, 120, 210],
    ]);
  });

  test("filters by source area and averages underlying cells", () => {
    const f = matrices();
    expect(
      buildPivotResult(f.workbook, { ...f.table, filters: [{ field: 3, values: ["Second"] }] })
        .matrix[1],
    ).toEqual(["East", 60, 50, 110]);
    const average = buildPivotResult(f.workbook, {
      ...f.table,
      rowFields: [],
      columnFields: [],
      values: [{ field: 2, aggregate: "average", caption: "Average" }],
    });
    expect(average.sourceRows).toBe(6);
    expect(average.matrix[1]![1]).toBe(35);
  });

  test("canonicalizes and deeply clones source ranges", () => {
    const f = matrices();
    const next = normalizePivotTable({ ...f.table, sourceSheetId: "obsolete", source: null });
    expect(next.sourceSheetId).toBe(f.source.id);
    expect(next.source).toEqual(f.table.source);
    next.consolidation!.ranges[0]!.range!.start.row = 99;
    expect(f.table.consolidation!.ranges[0]!.range!.start.row).toBe(0);
  });

  test("excludes hidden matrix rows and columns until included", () => {
    const f = matrices();
    f.source.hiddenRows = new Set([2]);
    f.source.hiddenColumns = new Set([2]);
    expect([...getPivotTableSource(f.workbook, f.table).records()]).toEqual([
      ["East", "Q1", 10, "First"],
      ["East", "Q2", 60, "Second"],
      ["East", "Q1", 50, "Second"],
    ]);
    expect([
      ...getPivotTableSource(f.workbook, { ...f.table, includeHidden: true }).records(),
    ]).toHaveLength(6);
  });

  test("rejects blank matrix labels and repeated overlapping areas", () => {
    const f = matrices();
    setCellContent(f.second, { row: 4, column: 3 }, null);
    expect(() => getPivotTableSource(f.workbook, f.table)).toThrow();
    setCellContent(f.second, { row: 4, column: 3 }, { kind: "literal", value: "Q2" });
    setCellContent(f.second, { row: 5, column: 2 }, null);
    expect(() => getPivotTableSource(f.workbook, f.table)).toThrow();
    setCellContent(f.second, { row: 5, column: 2 }, { kind: "literal", value: "East" });
    f.table.consolidation!.ranges.push({
      ...f.table.consolidation!.ranges[0]!,
      label: "Duplicate",
    });
    expect(() => getPivotTableSource(f.workbook, f.table)).toThrow();
  });

  test("refreshes changed source values with reversible output", () => {
    const f = matrices();
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    expect(getCellValue(f.destination, { row: 3, column: 4 })).toBe(80);
    setCellContent(f.second, { row: 5, column: 3 }, { kind: "literal", value: 160 });
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.current()));
    const after = serializeWorkbook(f.workbook);
    expect(after).not.toEqual(before);
    expect(getCellValue(f.destination, { row: 3, column: 4 })).toBe(180);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(getCellValue(f.destination, { row: 3, column: 4 })).toBe(80);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
    expect(getCellValue(f.destination, { row: 3, column: 4 })).toBe(180);
  });

  test("rejects destination overlap with a secondary source without mutation", () => {
    const f = matrices();
    const before = serializeWorkbook(f.workbook);
    expect(() =>
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(
          f.second.id,
          { ...f.table, anchor: { row: 4, column: 2 } },
          { overwrite: true },
        ),
      ),
    ).toThrow();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("moves secondary sources and invalidates deleted matrix headers with undo", () => {
    const f = matrices();
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.second.id, "row", 2, 2));
    expect(f.current().consolidation!.ranges[1]!.range!.start.row).toBe(6);
    expect(f.current().rowFields).toEqual([0]);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.second.id, "row", 4));
    expect(f.current().consolidation!.ranges[1]!.range).toBeNull();
    expect(() => buildPivotResult(f.workbook, f.current())).toThrow();
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("retargets consolidation references inside duplicated sheets", () => {
    const f = matrices();
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.second.id, { ...f.table, anchor: { row: 10, column: 0 } }),
    );
    executeWorkbookCommand(
      f.session,
      createDuplicateSheetCommand(f.workbook, f.second.id, { id: "copy", name: "Copy" }),
    );
    const copy = f.workbook.sheets.get("copy")!.pivotTables![0]!;
    expect(copy.consolidation!.ranges.map((area) => area.sheetId)).toEqual([f.source.id, "copy"]);
    expect(f.second.pivotTables![0]!.consolidation!.ranges[1]!.sheetId).toBe(f.second.id);
  });

  test("round trips V34 consolidation and rejects its payload in V33", () => {
    const f = matrices();
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    const snapshot = serializeWorkbook(f.workbook);
    expect(snapshot.version).toBe(35);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 33 })).toThrow();
  });
});
