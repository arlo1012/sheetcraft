import { describe, expect, test } from "vitest";
import { buildPivotResult, normalizePivotTable } from "../../pivot-tables.js";
import { setCellContent } from "../../workbook.js";
import { fixture, records } from "./fixture.js";

describe("pivot aggregation", () => {
  test.each([
    { values: [Number.MAX_VALUE, Number.MAX_VALUE], expected: Number.MAX_VALUE },
    { values: [Number.MAX_VALUE, -Number.MAX_VALUE], expected: 0 },
  ])("averages finite extreme values without overflowing their sum", ({ values, expected }) => {
    const f = fixture([
      ["Region", "Quarter", "Amount"],
      ...values.map((value) => ["East", "Q1", value]),
    ]);
    const result = buildPivotResult(f.workbook, {
      ...f.table,
      rowFields: [],
      columnFields: [],
      values: [{ field: 2, aggregate: "average", caption: "Average" }],
    });
    expect(result.matrix[1]![1]).toBe(expected);
  });
  test("groups row and column fields with independently calculated grand totals", () => {
    const f = fixture();
    expect(buildPivotResult(f.workbook, f.table)).toMatchObject({
      matrix: [
        ["Region", "Q1 / Amount", "Q2 / Amount", "Grand Total / Amount"],
        ["East", 30, 30, 60],
        ["West", 40, 0, 40],
        ["Grand Total", 70, 30, 100],
      ],
      sourceRows: 4,
      totalRow: 3,
      totalColumnStart: 3,
    });
  });
  test("aggregates multiple row, column and value fields without colliding group keys", () => {
    const f = fixture([
      ["Region", "Team", "Quarter", "Product", "Amount", "Units"],
      ["East", "A", "Q1", "X", 10, 2],
      ["East", "A", "Q1", "X", 20, 3],
      ["East", "B", "Q2", "Y", 30, 4],
      ["West", "A", "Q1", "X", 40, 5],
    ]);
    const result = buildPivotResult(f.workbook, {
      ...f.table,
      rowFields: [0, 1],
      columnFields: [2, 3],
      values: [
        { field: 4, aggregate: "sum", caption: "Amount" },
        { field: 5, aggregate: "sum", caption: "Units" },
      ],
    });
    expect(result.matrix).toEqual([
      [
        "Region",
        "Team",
        "Q1 / X / Amount",
        "Q1 / X / Units",
        "Q2 / Y / Amount",
        "Q2 / Y / Units",
        "Grand Total / Amount",
        "Grand Total / Units",
      ],
      ["East", "A", 30, 5, 0, 0, 30, 5],
      ["East", "B", 0, 0, 30, 4, 30, 4],
      ["West", "A", 40, 5, 0, 0, 40, 5],
      ["Grand Total", "", 70, 10, 30, 4, 100, 14],
    ]);
  });
  test("supports sum, count, average, minimum and maximum with nonnumeric values", () => {
    const f = fixture([...records, ["East", "Q1", "text", 6], ["East", "Q1", null, 7]]);
    const result = buildPivotResult(f.workbook, {
      ...f.table,
      rowFields: [],
      columnFields: [],
      values: ["sum", "count", "average", "min", "max"].map((aggregate) => ({
        field: 2,
        aggregate: aggregate as "sum" | "count" | "average" | "min" | "max",
        caption: aggregate,
      })),
    });
    expect(result.matrix[1]).toEqual(["Grand Total", 100, 5, 25, 10, 40]);
  });
  test("applies multiple filters and excludes hidden and wholly blank rows", () => {
    const f = fixture([...records, [null, null, null, null]]);
    f.source.hiddenRows = new Set([2]);
    const table = {
      ...f.table,
      filters: [
        { field: 0, values: ["East"] },
        { field: 1, values: ["Q1"] },
      ],
    };
    expect(buildPivotResult(f.workbook, table)).toMatchObject({
      sourceRows: 1,
      matrix: [
        ["Region", "Q1 / Amount", "Grand Total / Amount"],
        ["East", 10, 10],
        ["Grand Total", 10, 10],
      ],
    });
    expect(buildPivotResult(f.workbook, { ...table, includeHidden: true }).sourceRows).toBe(2);
  });
  test("groups null and empty labels together but preserves typed numeric and text keys", () => {
    const f = fixture([
      ["Key", "Quarter", "Amount"],
      [null, "Q1", 1],
      ["", "Q1", 2],
      [1, "Q1", 3],
      ["1", "Q1", 4],
    ]);
    expect(
      buildPivotResult(f.workbook, { ...f.table, columnFields: [], rowTotals: false }).matrix,
    ).toEqual([
      ["Key", "Amount"],
      ["(blank)", 3],
      [1, 3],
      ["1", 4],
    ]);
  });
  test("propagates source errors for numeric aggregates while count includes nonblank errors", () => {
    const f = fixture();
    setCellContent(
      f.source,
      { row: 1, column: 2 },
      { kind: "formula", formula: { source: "=1/0" } },
    );
    const result = buildPivotResult(f.workbook, {
      ...f.table,
      rowFields: [],
      columnFields: [],
      values: [
        { field: 2, aggregate: "sum", caption: "Sum" },
        { field: 2, aggregate: "count", caption: "Count" },
      ],
    });
    expect(result.matrix[1]![1]).toMatchObject({ kind: "formula-error", code: "DIV0" });
    expect(result.matrix[1]![2]).toBe(4);
  });
  test("uses empty values for averages with no numeric observations and suppresses totals", () => {
    const f = fixture([
      ["Region", "Quarter", "Amount"],
      ["East", "Q1", "text"],
    ]);
    const result = buildPivotResult(f.workbook, {
      ...f.table,
      rowTotals: false,
      columnTotals: false,
      values: [{ field: 2, aggregate: "average", caption: "Average" }],
    });
    expect(result.matrix).toEqual([
      ["Region", "Q1 / Average"],
      ["East", null],
    ]);
    expect(result.totalRow).toBeNull();
    expect(result.totalColumnStart).toBeNull();
  });
  test("sorts group labels independently of source order", () => {
    const f = fixture();
    expect(
      buildPivotResult(f.workbook, {
        ...f.table,
        sort: "descending",
        rowTotals: false,
        columnTotals: false,
      }).matrix,
    ).toEqual([
      ["Region", "Q2 / Amount", "Q1 / Amount"],
      ["West", 0, 40],
      ["East", 30, 30],
    ]);
  });
  test("deep copies pivot definitions", () => {
    const f = fixture();
    f.table.filters = [{ field: 0, values: ["East"] }];
    const clone = normalizePivotTable(f.table);
    clone.anchor.row = 9;
    clone.source!.end.row = 9;
    clone.rowFields[0] = 1;
    clone.values[0]!.caption = "Other";
    clone.filters[0]!.values[0] = "West";
    expect(f.table).toMatchObject({
      anchor: { row: 2 },
      source: { end: { row: 4 } },
      rowFields: [0],
      values: [{ caption: "Amount" }],
      filters: [{ values: ["East"] }],
    });
  });
  test.each(["blank", "duplicate", "merged", "oversized"])(
    "rejects %s source headers or shape",
    (kind) => {
      const f = fixture();
      if (kind === "blank") setCellContent(f.source, { row: 0, column: 0 }, null);
      if (kind === "duplicate")
        setCellContent(f.source, { row: 0, column: 1 }, { kind: "literal", value: "region" });
      if (kind === "merged")
        f.source.mergedCells = [{ start: { row: 1, column: 0 }, end: { row: 1, column: 1 } }];
      if (kind === "oversized") f.table.source!.end.row = 25000;
      expect(() => buildPivotResult(f.workbook, f.table)).toThrow();
    },
  );
  test("rejects a group expansion exceeding the output cell limit", () => {
    const data = [
      ["Region", "Quarter", "Amount"],
      ...Array.from({ length: 5000 }, (_, i) => [`Group${i}`, "Q1", 1]),
    ];
    const f = fixture(data);
    expect(() => buildPivotResult(f.workbook, f.table)).toThrow("10,000");
  });
});
