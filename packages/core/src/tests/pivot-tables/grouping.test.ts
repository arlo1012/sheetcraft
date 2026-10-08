import { describe, expect, test } from "vitest";
import {
  buildPivotResult,
  getPivotDetails,
  getPivotTableSource,
  getRawPivotTableSource,
  getPivotGroupedValue,
  getPivotGroupLabels,
  normalizePivotTable,
  type PivotFieldGroup,
  type SheetPivotTable,
} from "../../pivot-tables.js";
import {
  createGroupPivotFieldCommand,
  createUngroupPivotFieldCommand,
  createSetPivotTableCommand,
} from "../../commands/pivot-tables.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { fixture } from "./fixture.js";
import { createSetCellContentCommand } from "../../commands/index.js";

const numberGroup: PivotFieldGroup = {
  field: 0,
  kind: "number",
  start: -10,
  end: 10,
  interval: 10,
};
function numeric(patch: Partial<SheetPivotTable> = {}) {
  const f = fixture([
    ["Band", "Quarter", "Amount"],
    [-12, "Q1", 1],
    [-10, "Q1", 2],
    [-1, "Q1", 3],
    [0, "Q1", 4],
    [9, "Q1", 5],
    [10, "Q1", 6],
    [11, "Q1", 7],
  ]);
  return { ...f, table: { ...f.table, columnFields: [], groups: [numberGroup], ...patch } };
}

describe("pivot field grouping", () => {
  test("groups negative numbers and boundary members without changing source records", () => {
    const f = numeric();
    const before = serializeWorkbook(f.workbook);
    const result = buildPivotResult(f.workbook, f.table);
    expect(result.rowLabels).toEqual(["<-10", "-10--1", "0-10", ">10"]);
    expect(result.matrix.slice(1).map((row) => row[1])).toEqual([1, 5, 15, 7, 28]);
    expect([...getPivotTableSource(f.workbook, f.table).records()].map((row) => row[0])).toEqual([
      "<-10",
      "-10--1",
      "-10--1",
      "0-10",
      "0-10",
      "0-10",
      ">10",
    ]);
    expect([...getRawPivotTableSource(f.workbook, f.table).records()].map((row) => row[0])).toEqual(
      [-12, -10, -1, 0, 9, 10, 11],
    );
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("puts decimal boundaries into the next interval without floating point drift", () => {
    const group: PivotFieldGroup = {
      kind: "number",
      field: 0,
      start: -0.2,
      end: 0.3,
      interval: 0.1,
    };
    expect(
      [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4].map((value) =>
        getPivotGroupedValue(value, group, "1900"),
      ),
    ).toEqual(["<-0.2", "-0.2--0.1", "-0.1-0", "0-0.1", "0.1-0.2", "0.2-0.3", "0.2-0.3", ">0.3"]);
  });

  test("includes an exact ending boundary in the previous numeric bin", () => {
    const group: PivotFieldGroup = { field: 0, kind: "number", start: 0, end: 20, interval: 10 };
    expect(getPivotGroupLabels(group, "1900")).toEqual(["<0", "0-9", "10-20", ">20"]);
    expect([9, 10, 20, 21].map((value) => getPivotGroupedValue(value, group, "1900"))).toEqual([
      "0-9",
      "10-20",
      "10-20",
      ">20",
    ]);
    const fractional = { ...group, end: 25 };
    expect(getPivotGroupLabels(fractional, "1900").slice(-2)).toEqual(["20-25", ">25"]);
    expect(getPivotGroupLabels({ ...fractional, autoEnd: true }, "1900").slice(-2)).toEqual([
      "20-29",
      ">25",
    ]);
    expect(getPivotGroupedValue(26, { ...fractional, autoEnd: true }, "1900")).toBe(">25");
  });

  test("fractional source values use continuous numeric labels even with an integer interval", () => {
    const f = fixture([
      ["Band", "Quarter", "Amount"],
      [9.5, "Q1", 2],
      [20, "Q1", 3],
    ]);
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, {
        ...f.table,
        columnFields: [],
        groups: [{ field: 0, kind: "number", start: 0, end: 20, interval: 10 }],
      }),
    );
    const current = f.destination.pivotTables![0]!;
    expect(current.groups![0]).toMatchObject({ integerOnly: false });
    expect(buildPivotResult(f.workbook, current, { useCache: true }).rowLabels).toEqual([
      "0-10",
      "10-20",
    ]);
    expect(
      getPivotDetails(f.workbook, current, {
        row: current.anchor.row + 1,
        column: current.anchor.column + 1,
      }).records,
    ).toEqual([[9.5, "Q1", 2]]);
  });

  test("aggregates raw numbers when the same field is both grouped dimension and measure", () => {
    const f = numeric({
      values: [
        { field: 0, aggregate: "sum", caption: "Sum" },
        { field: 0, aggregate: "count", caption: "Count" },
        { field: 0, aggregate: "average", caption: "Average" },
      ],
    });
    const result = buildPivotResult(f.workbook, f.table);
    expect(result.matrix[2]).toEqual(["-10--1", -11, 2, -5.5]);
    expect(result.matrix[3]!.slice(0, 3)).toEqual(["0-10", 19, 3]);
    expect(result.matrix[3]![3]).toBeCloseTo(19 / 3);
    expect(result.matrix.at(-1)!.slice(0, 3)).toEqual(["Grand Total", 7, 7]);
    expect(result.matrix.at(-1)![3]).toBeCloseTo(1);
  });

  test("ranks and sorts groups by raw aggregate values", () => {
    const f = numeric({
      values: [{ field: 0, aggregate: "sum", caption: "Sum" }],
      sortFields: [{ axis: "rows", field: 0, order: "descending", measure: 0 }],
    });
    expect(buildPivotResult(f.workbook, f.table).rowLabels).toEqual([
      "0-10",
      ">10",
      "-10--1",
      "<-10",
    ]);
    const ranked = buildPivotResult(f.workbook, {
      ...f.table,
      axisFilters: [
        {
          axis: "rows",
          field: 0,
          valueCondition: {
            measure: 0,
            condition: { kind: "rank", bottom: false, percent: false, count: 2 },
          },
        },
      ],
    });
    expect(ranked.rowLabels).toEqual(["0-10", ">10"]);
    expect(ranked.matrix.at(-1)).toEqual(["Grand Total", 30]);
  });

  test("filters grouped members while detail records and refresh cache retain raw numbers", () => {
    const f = numeric({ filters: [{ field: 0, values: ["-10--1"] }] });
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    const table = f.destination.pivotTables![0]!;
    const result = buildPivotResult(f.workbook, table, { useCache: true });
    expect(result.rowLabels).toEqual(["-10--1"]);
    expect(table.dataCache!.records.map((row) => row[0])).toEqual([-12, -10, -1, 0, 9, 10, 11]);
    expect(
      getPivotDetails(f.workbook, table, {
        row: table.anchor.row + 1,
        column: table.anchor.column + 1,
      }).records,
    ).toEqual([
      [-10, "Q1", 2],
      [-1, "Q1", 3],
    ]);
  });

  test("group and ungroup commands clear only the changed field's conditions and are reversible", () => {
    const f = numeric({
      groups: [{ field: 2, kind: "number", start: 0, end: 10, interval: 5 }],
      rowFields: [0, 2],
      filters: [
        { field: 0, values: [-10] },
        { field: 2, values: ["0-4"] },
      ],
      axisFilters: [
        { axis: "rows", field: 0, values: [-10] },
        { axis: "rows", field: 2, values: ["0-4"] },
      ],
    });
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(
      f.session,
      createGroupPivotFieldCommand(f.destination.id, f.destination.pivotTables![0]!, numberGroup),
    );
    const grouped = f.destination.pivotTables![0]!;
    expect(grouped.groups).toEqual([f.table.groups![0], numberGroup]);
    expect(grouped.filters.find((filter) => filter.field === 0)?.values).toEqual([]);
    expect(grouped.filters.find((filter) => filter.field === 2)?.values).toEqual(["0-4"]);
    expect(grouped.axisFilters).toEqual([{ axis: "rows", field: 2, values: ["0-4"] }]);
    const after = serializeWorkbook(f.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
    executeWorkbookCommand(
      f.session,
      createUngroupPivotFieldCommand(f.destination.id, f.destination.pivotTables![0]!, 0),
    );
    expect(f.destination.pivotTables![0]!.groups).toEqual(f.table.groups);
  });

  test.each([
    ["1900", 60, "days", "1900-02-29"],
    ["1904", 0, "days", "1904-01-01"],
    ["1900", 60, "months", "Feb"],
    ["1900", 92, "quarters", "Q2"],
    ["1904", 366, "years", "1905"],
    ["1900", 1.5, "hours", "12"],
    ["1900", 1 + 30 / 1440, "minutes", "30"],
    ["1900", 1 + 15 / 86400, "seconds", "15"],
  ] as const)("groups %s serial %s by %s", (system, serial, unit, expected) => {
    const group: PivotFieldGroup = {
      field: 0,
      kind: "date",
      start: 0,
      end: 400,
      unit,
      interval: 1,
    };
    expect(getPivotGroupedValue(serial, group, system)).toBe(expected);
  });

  test.each(["1900", "1904"] as const)(
    "groups date columns with the workbook %s epoch and keeps raw serial details",
    (system) => {
      const f = fixture([
        ["Region", "Date", "Amount"],
        ["East", 0, 10],
        ["East", 60, 20],
        ["West", 92, 30],
      ]);
      f.workbook.dateSystem = system;
      const table: SheetPivotTable = {
        ...f.table,
        groups: [{ field: 1, kind: "date", unit: "months", start: 0, end: 400, interval: 1 }],
      };
      executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, table));
      const current = f.destination.pivotTables![0]!;
      const result = buildPivotResult(f.workbook, current, { useCache: true });
      const month = system === "1900" ? "Feb" : "Mar";
      const column = result.matrix[0]!.indexOf(`${month} / Amount`);
      expect(column).toBeGreaterThan(0);
      expect(result.matrix[1]![column]).toBe(20);
      expect(
        getPivotDetails(f.workbook, current, {
          row: current.anchor.row + 1,
          column: current.anchor.column + column,
        }).records,
      ).toEqual([["East", 60, 20]]);
      expect(current.dataCache!.records).toEqual([
        ["East", 0, 10],
        ["East", 60, 20],
        ["West", 92, 30],
      ]);
    },
  );

  test("groups dates in multi-day intervals and excludes values outside bounds", () => {
    const group: PivotFieldGroup = {
      field: 0,
      kind: "date",
      start: 59,
      end: 64,
      unit: "days",
      interval: 2,
    };
    expect(
      [58, 59, 60, 61, 62, 63, 64, 65].map((value) => getPivotGroupedValue(value, group, "1900")),
    ).toEqual([
      "<1900-02-28",
      "1900-02-28",
      "1900-02-28",
      "1900-03-01",
      "1900-03-01",
      "1900-03-03",
      "1900-03-03",
      ">1900-03-04",
    ]);
  });

  test.each([null, "text", ""])("rejects mixed or blank grouped fields: %s", (value) => {
    const f = fixture([
      ["Band", "Quarter", "Amount"],
      [1, "Q1", 10],
      [value, "Q1", 20],
    ]);
    expect(() => buildPivotResult(f.workbook, { ...f.table, groups: [numberGroup] })).toThrow(
      RangeError,
    );
  });

  test.each([
    { ...numberGroup, interval: 0 },
    { ...numberGroup, start: 11 },
    { ...numberGroup, field: 20 },
    { ...numberGroup, interval: Number.NaN },
    { kind: "date", field: 0, start: 0, end: 100, interval: 2, unit: "months" },
    { kind: "date", field: 0, start: -1, end: 100, interval: 1, unit: "days" },
  ] as PivotFieldGroup[])("rejects invalid group configuration %#", (group) => {
    const f = numeric();
    expect(() => normalizePivotTable({ ...f.table, groups: [group] })).toThrow(RangeError);
  });

  test("rejects duplicate definitions and new grouping of a measure-only field", () => {
    const f = numeric();
    expect(() => normalizePivotTable({ ...f.table, groups: [numberGroup, numberGroup] })).toThrow(
      RangeError,
    );
    const measureGroup: PivotFieldGroup = { ...numberGroup, field: 2 };
    expect(() => createGroupPivotFieldCommand(f.destination.id, f.table, measureGroup)).toThrow(
      RangeError,
    );
    expect(normalizePivotTable({ ...f.table, groups: [measureGroup] }).groups).toEqual([
      measureGroup,
    ]);
  });

  test("retains inactive groups through refresh and serialization while aggregating raw measure values", () => {
    const f = numeric({
      rowFields: [1],
      values: [{ field: 0, aggregate: "sum", caption: "Raw sum" }],
    });
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    const current = f.destination.pivotTables![0]!;
    expect(current.groups).toEqual([numberGroup]);
    const result = buildPivotResult(f.workbook, current, { useCache: true });
    expect(result.rowLabels).toEqual(["Q1"]);
    expect(result.matrix[1]).toEqual(["Q1", 7]);
    expect(result.matrix.at(-1)).toEqual(["Grand Total", 7]);
    expect(current.dataCache!.records.map((record) => record[0])).toEqual([
      -12, -10, -1, 0, 9, 10, 11,
    ]);
    const restored = deserializeWorkbook(serializeWorkbook(f.workbook));
    expect(restored.sheets.get(f.destination.id)!.pivotTables![0]!.groups).toEqual([numberGroup]);
  });

  test("keeps inactive group definitions when the report temporarily has no fields", () => {
    const f = numeric({ rowFields: [], columnFields: [], values: [], filters: [] });
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    const current = f.destination.pivotTables![0]!;
    expect(current.groups).toEqual([numberGroup]);
    expect(buildPivotResult(f.workbook, current).matrix).toEqual([]);
    const restored = deserializeWorkbook(serializeWorkbook(f.workbook));
    expect(restored.sheets.get(f.destination.id)!.pivotTables![0]!.groups).toEqual([numberGroup]);
  });

  test("refreshes automatic bounds from extended source values while cached inspection and undo retain old bounds", () => {
    const f = numeric({ groups: [{ ...numberGroup, autoStart: true, autoEnd: true }] });
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    const old = f.destination.pivotTables![0]!;
    expect(old.groups![0]).toMatchObject({ start: -12, end: 11 });
    executeWorkbookCommand(
      f.session,
      createSetCellContentCommand(
        f.source.id,
        { row: 7, column: 0 },
        { kind: "literal", value: 35 },
      ),
    );
    const beforeRefresh = serializeWorkbook(f.workbook);
    const cached = buildPivotResult(f.workbook, old, { useCache: true });
    expect(cached.groups![0]).toMatchObject({ start: -12, end: 11 });
    expect(cached.dataCache.records.at(-1)![0]).toBe(11);
    const live = buildPivotResult(f.workbook, old);
    expect(live.groups![0]).toMatchObject({ start: -12, end: 35 });
    expect(live.dataCache.records.at(-1)![0]).toBe(35);
    expect(old.groups![0]).toMatchObject({ start: -12, end: 11 });
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, old));
    expect(f.destination.pivotTables![0]!.groups![0]).toMatchObject({ start: -12, end: 35 });
    const afterRefresh = serializeWorkbook(f.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(beforeRefresh);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(afterRefresh);
  });

  test.each([
    { autoStart: true, autoEnd: false, start: -12, end: 10, outside: ">10" },
    { autoStart: false, autoEnd: true, start: -10, end: 11, outside: "<-10" },
  ])("recalculates only the automatic bound %#", ({ autoStart, autoEnd, start, end, outside }) => {
    const f = numeric({ groups: [{ ...numberGroup, autoStart, autoEnd }] });
    const result = buildPivotResult(f.workbook, f.table);
    expect(result.groups![0]).toMatchObject({ start, end, autoStart, autoEnd });
    expect(result.rowLabels).toContain(outside);
  });

  test.each(["true", 1, null])("rejects a nonboolean automatic boundary flag: %s", (value) => {
    const f = numeric();
    for (const flag of ["autoStart", "autoEnd"] as const) {
      expect(() =>
        normalizePivotTable({
          ...f.table,
          groups: [{ ...numberGroup, [flag]: value } as unknown as PivotFieldGroup],
        }),
      ).toThrow(RangeError);
    }
  });

  test("keeps localized month members while regenerating automatic boundary labels", () => {
    const months = [
      "一月",
      "二月",
      "三月",
      "四月",
      "五月",
      "六月",
      "七月",
      "八月",
      "九月",
      "十月",
      "十一月",
      "十二月",
    ];
    const f = fixture([
      ["Region", "Date", "Amount"],
      ["East", 1, 10],
      ["East", 92, 20],
    ]);
    const group: PivotFieldGroup = {
      field: 1,
      kind: "date",
      unit: "months",
      start: 32,
      end: 60,
      interval: 1,
      autoStart: true,
      autoEnd: true,
      labels: ["old below", ...months, "old above"],
    };
    const table: SheetPivotTable = { ...f.table, groups: [group] };
    const result = buildPivotResult(f.workbook, table);
    expect(result.groups![0]).toMatchObject({
      start: 1,
      end: 92,
      labels: ["<1900-01-01", ...months, ">1900-04-01"],
    });
    expect(result.matrix[0]).toEqual([
      "Region",
      "一月 / Amount",
      "四月 / Amount",
      "Grand Total / Amount",
    ]);
    expect(group.labels).toEqual(["old below", ...months, "old above"]);
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, table));
    expect(f.destination.pivotTables![0]!.groups).toEqual(result.groups);
  });

  test("round trips V40 grouping and rejects it in V39 snapshots", () => {
    const f = numeric();
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, f.table));
    const snapshot = serializeWorkbook(f.workbook);
    expect(snapshot.version).toBe(42);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    expect(() => deserializeWorkbook({ ...snapshot, version: 39 })).toThrow();
  });
});
