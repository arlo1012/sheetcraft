import { describe, expect, test } from "vitest";
import {
  buildPivotResult,
  getPivotDetails,
  normalizePivotTable,
  type SheetPivotTable,
} from "../../pivot-tables.js";
import { createSetPivotTableCommand } from "../../commands/pivot-tables.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import { getCellValue, setCellContent } from "../../workbook.js";
import { fixture } from "./fixture.js";

describe("explicit pivot member order", () => {
  test("orders both axes explicitly and appends unknown members in source order", () => {
    const f = fixture();
    const table: SheetPivotTable = {
      ...f.table,
      sortFields: [
        { axis: "rows", field: 0, order: "manual", members: ["Unused", "West", "East"] },
        { axis: "columns", field: 1, order: "manual", members: ["Q2"] },
      ],
    };
    const result = buildPivotResult(f.workbook, table);
    expect(result.rowLabels).toEqual(["West", "East"]);
    expect(result.seriesLabels).toEqual(["Q2 / Amount", "Q1 / Amount", "Grand Total / Amount"]);
    expect(result.matrix[1]).toEqual(["West", 0, 40, 40]);
  });

  test("applies independent manual orders at multiple row hierarchy levels", () => {
    const f = fixture([
      ["Region", "Team", "Amount"],
      ["East", "A", 5],
      ["West", "B", 10],
      ["East", "B", 30],
      ["West", "A", 40],
      ["West", "C", 7],
      ["East", "D", 9],
    ]);
    const result = buildPivotResult(f.workbook, {
      ...f.table,
      rowFields: [0, 1],
      columnFields: [],
      sortFields: [
        { axis: "rows", field: 0, order: "manual", members: ["West", "East"] },
        { axis: "rows", field: 1, order: "manual", members: ["B", "A"] },
      ],
    });
    expect(result.rowLabels).toEqual([
      "West / B",
      "West / A",
      "West / C",
      "East / B",
      "East / A",
      "East / D",
    ]);
  });

  test("distinguishes typed members while canonicalizing duplicate blank members", () => {
    const f = fixture([
      ["Member", "Series", "Amount"],
      [1, "x", 1],
      ["1", "x", 2],
      [true, "x", 3],
      [null, "x", 4],
    ]);
    const table: SheetPivotTable = {
      ...f.table,
      sortFields: [{ axis: "rows", field: 0, order: "manual", members: [true, "1", null, 1] }],
    };
    expect(buildPivotResult(f.workbook, table).rowLabels).toEqual(["true", "1", "(blank)", "1"]);
    expect(() =>
      normalizePivotTable({
        ...table,
        sortFields: [{ ...table.sortFields![0]!, members: [null, ""] }],
      }),
    ).toThrow();
  });

  test.each([
    { order: "manual", members: ["East", "East"] },
    { order: "manual" },
    { order: "manual", members: [Infinity] },
    { order: "manual", members: Array(1) },
    { order: "manual", members: ["East"], measure: 0 },
    { order: "ascending", members: ["East"] },
    { order: "unknown", members: ["East"] },
  ])("rejects invalid manual order %#", (rule) => {
    const f = fixture();
    expect(() =>
      normalizePivotTable({
        ...f.table,
        sortFields: [
          { axis: "rows", field: 0, ...rule } as NonNullable<SheetPivotTable["sortFields"]>[number],
        ],
      }),
    ).toThrow();
  });

  test("clones member lists and keeps stale details, explicit refresh, undo and redo in displayed order", () => {
    const f = fixture();
    const table: SheetPivotTable = {
      ...f.table,
      sortFields: [{ axis: "rows", field: 0, order: "manual", members: ["West", "East"] }],
    };
    const clone = normalizePivotTable(table);
    clone.sortFields![0]!.members![0] = "Changed";
    expect(table.sortFields![0]!.members).toEqual(["West", "East"]);
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, table));
    const address = { row: table.anchor.row + 1, column: table.anchor.column + 1 };
    expect(getCellValue(f.destination, address)).toBe(40);
    expect(
      getPivotDetails(f.workbook, f.destination.pivotTables![0]!, address).records[0]![0],
    ).toBe("West");
    setCellContent(f.source, { row: 4, column: 2 }, { kind: "literal", value: 50 });
    expect(
      getPivotDetails(f.workbook, f.destination.pivotTables![0]!, address).records[0]![2],
    ).toBe(40);
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, f.destination.pivotTables![0]!),
    );
    expect(getCellValue(f.destination, address)).toBe(50);
    expect(
      getPivotDetails(f.workbook, f.destination.pivotTables![0]!, address).records[0]![2],
    ).toBe(50);
    undoWorkbookCommand(f.session);
    expect(getCellValue(f.destination, address)).toBe(40);
    redoWorkbookCommand(f.session);
    expect(getCellValue(f.destination, address)).toBe(50);
  });

  test("writes V44 only for manual members, rejects old envelopes, and still reads V43 without them", () => {
    const f = fixture();
    const ordinary = serializeWorkbook(f.workbook);
    expect(ordinary.version).toBe(43);
    expect(serializeWorkbook(deserializeWorkbook(ordinary)).version).toBe(43);
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, {
        ...f.table,
        sortFields: [{ axis: "rows", field: 0, order: "manual", members: ["West", "East"] }],
      }),
    );
    const current = serializeWorkbook(f.workbook);
    expect(current.version).toBe(44);
    expect(serializeWorkbook(deserializeWorkbook(current))).toEqual(current);
    for (const version of [38, 42, 43])
      expect(() => deserializeWorkbook({ ...current, version })).toThrow(/version 44/);
    const sheet = deserializeSheet(serializeSheet(f.destination));
    expect(sheet.pivotTables![0]!.sortFields![0]!.members).toEqual(["West", "East"]);
  });

  test("appends a newly refreshed member without changing known order or drill-through membership", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, {
        ...f.table,
        sortFields: [{ axis: "rows", field: 0, order: "manual", members: ["West", "East"] }],
      }),
    );
    setCellContent(f.source, { row: 1, column: 0 }, { kind: "literal", value: "North" });
    const stale = f.destination.pivotTables![0]!;
    expect(buildPivotResult(f.workbook, stale, { useCache: true }).rowLabels).toEqual([
      "West",
      "East",
    ]);
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, stale));
    const fresh = f.destination.pivotTables![0]!;
    const result = buildPivotResult(f.workbook, fresh, { useCache: true });
    expect(result.rowLabels).toEqual(["West", "East", "North"]);
    const details = getPivotDetails(f.workbook, fresh, {
      row: fresh.anchor.row + result.dataRows[2]!,
      column: fresh.anchor.column + 1,
    });
    expect(details.records).toHaveLength(1);
    expect(details.records[0]![0]).toBe("North");
    expect(details.records[0]![2]).toBe(10);
  });
});
