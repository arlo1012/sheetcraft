import { describe, expect, test } from "vitest";
import {
  buildPivotResult,
  normalizePivotTable,
  type PivotAggregate,
  type PivotValueField,
} from "../../pivot-tables.js";
import { createSetPivotTableCommand } from "../../commands/pivot-tables.js";
import { executeWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { createFormulaError } from "../../formula/types.js";
import { getCellStyle, setCellContent, type CellValue } from "../../workbook.js";
import { fixture } from "./fixture.js";
import { createInsertSheetAxisCommand, createSetCellContentCommand } from "../../commands/index.js";

function result(display: PivotValueField["display"], options: { totals?: boolean } = {}) {
  const f = fixture();
  return buildPivotResult(f.workbook, {
    ...f.table,
    rowTotals: options.totals ?? true,
    columnTotals: options.totals ?? true,
    values: [{ ...f.table.values[0]!, display }],
  });
}
function aggregate(aggregate: PivotAggregate, values: CellValue[]) {
  const f = fixture([
    ["Region", "Quarter", "Amount"],
    ...values.map((value) => ["East", "Q1", value]),
  ]);
  return buildPivotResult(f.workbook, {
    ...f.table,
    values: [{ field: 2, caption: "Value", aggregate }],
  }).matrix[1]![1];
}

describe("pivot value aggregation settings", () => {
  test.each([
    ["product", 8],
    ["countNums", 3],
    ["stdev", Math.sqrt(7 / 3)],
    ["stdevp", Math.sqrt(14 / 9)],
    ["var", 7 / 3],
    ["varp", 14 / 9],
  ] as const)("computes %s from numeric records", (method, expected) => {
    expect(aggregate(method, [1, 2, 4])).toBeCloseTo(expected);
  });

  test.each(["stdev", "var"] as const)(
    "returns DIV0 for %s with fewer than two numbers",
    (method) => {
      expect(aggregate(method, [5, "text", null])).toEqual(createFormulaError("DIV0"));
      expect(aggregate(method, [null, "text"])).toEqual(createFormulaError("DIV0"));
    },
  );

  test.each(["stdevp", "varp"] as const)(
    "population %s is zero for a single number and DIV0 for none",
    (method) => {
      expect(aggregate(method, [5])).toBe(0);
      expect(aggregate(method, [null, "text"])).toEqual(createFormulaError("DIV0"));
    },
  );

  test("numeric count ignores text, booleans, blanks and formula errors", () => {
    const f = fixture([
      ["Region", "Quarter", "Amount"],
      ["East", "Q1", 1],
      ["East", "Q1", "2"],
      ["East", "Q1", true],
      ["East", "Q1", null],
      ["East", "Q1", ""],
      ["East", "Q1", 5],
    ]);
    setCellContent(
      f.source,
      { row: 6, column: 2 },
      { kind: "formula", formula: { source: "=1/0" } },
    );
    const value = buildPivotResult(f.workbook, {
      ...f.table,
      values: [{ field: 2, aggregate: "countNums", caption: "Numeric" }],
    }).matrix[1]![1];
    expect(value).toBe(1);
  });

  test("distinct count uses typed values, one blank member, and recomputes totals across overlapping groups", () => {
    const f = fixture([
      ["Region", "Quarter", "Amount"],
      ["East", "Q1", 1],
      ["East", "Q1", "1"],
      ["East", "Q1", true],
      ["East", "Q1", null],
      ["East", "Q1", ""],
      ["East", "Q1", 1],
      ["West", "Q1", 1],
      ["West", "Q1", "1"],
      ["West", "Q1", null],
    ]);
    const matrix = buildPivotResult(f.workbook, {
      ...f.table,
      values: [{ field: 2, aggregate: "distinctCount", caption: "Distinct" }],
    }).matrix;
    expect(matrix[1]).toEqual(["East", 4, 4]);
    expect(matrix[2]).toEqual(["West", 3, 3]);
    expect(matrix[3]).toEqual(["Grand Total", 4, 4]);
  });
});

describe("pivot value display settings", () => {
  test("normal display preserves original aggregates", () => {
    expect(result({ type: "normal" }).matrix).toEqual(result(undefined).matrix);
    expect(result({ type: "normal" }).matrix[1]).toEqual(["East", 30, 30, 60]);
  });

  test.each([
    ["percentOfTotal", 0.3, 0.3, 0.4],
    ["percentOfRow", 0.5, 0.5, 1],
    ["percentOfCol", 3 / 7, 1, 4 / 7],
  ] as const)("computes %s even when totals are hidden", (type, eastQ1, eastQ2, westQ1) => {
    const matrix = result({ type }, { totals: false }).matrix;
    expect(matrix).toHaveLength(3);
    expect(matrix[0]).toHaveLength(3);
    expect(matrix[1]![1]).toBeCloseTo(eastQ1);
    expect(matrix[1]![2]).toBeCloseTo(eastQ2);
    expect(matrix[2]![1]).toBeCloseTo(westQ1);
  });

  test("row and column percentage totals have meaningful denominators", () => {
    const rows = result({ type: "percentOfRow" }).matrix;
    expect(rows[1]![3]).toBe(1);
    expect(rows.at(-1)![1]).toBeCloseTo(0.7);
    const columns = result({ type: "percentOfCol" }).matrix;
    expect(columns.at(-1)![1]).toBe(1);
    expect(columns[1]![3]).toBeCloseTo(0.6);
    expect(result({ type: "percentOfTotal" }).matrix.at(-1)!.at(-1)).toBe(1);
  });

  test("difference compares the previous row member and explicit column member", () => {
    const previous = result({
      type: "difference",
      baseField: 0,
      baseItem: { kind: "previous" },
    }).matrix;
    expect(previous[1]![1]).toBeNull();
    expect(previous[2]![1]).toBe(10);
    expect(previous[2]![2]).toBe(-30);
    const explicit = result({
      type: "difference",
      baseField: 1,
      baseItem: { kind: "value", value: "Q1" },
    }).matrix;
    expect(explicit[1]![1]).toBeNull();
    expect(explicit[1]![2]).toBe(0);
    expect(explicit[2]![2]).toBe(-40);
  });

  test("next compares against the following sorted column member", () => {
    const matrix = result({ type: "difference", baseField: 1, baseItem: { kind: "next" } }).matrix;
    expect(matrix[1]![1]).toBe(0);
    expect(matrix[2]![1]).toBe(40);
  });

  test.each([
    ["percent", 4 / 3],
    ["percentDiff", 1 / 3],
  ] as const)("computes %s from an explicit base row member", (type, expected) => {
    const matrix = result({
      type,
      baseField: 0,
      baseItem: { kind: "value", value: "East" },
    }).matrix;
    expect(matrix[2]![1]).toBeCloseTo(expected);
  });

  test("running totals follow displayed sorted order and restart for each measure", () => {
    const f = fixture();
    const matrix = buildPivotResult(f.workbook, {
      ...f.table,
      sortFields: [{ axis: "rows", field: 0, order: "descending" }],
      values: [
        {
          field: 2,
          aggregate: "sum",
          caption: "Amount",
          display: { type: "runTotal", baseField: 0 },
        },
        {
          field: 3,
          aggregate: "sum",
          caption: "Units",
          display: { type: "runTotal", baseField: 0 },
        },
      ],
    }).matrix;
    expect(matrix[1]!.slice(0, 3)).toEqual(["West", 40, 5]);
    expect(matrix[2]!.slice(0, 3)).toEqual(["East", 70, 10]);
  });

  test("index divides cell times grand aggregate by row and column aggregates", () => {
    const matrix = result({ type: "index" }, { totals: false }).matrix;
    expect(matrix[1]![1]).toBeCloseTo((30 * 100) / (60 * 70));
    expect(matrix[1]![2]).toBeCloseTo((30 * 100) / (60 * 30));
    expect(matrix[2]![1]).toBeCloseTo((40 * 100) / (40 * 70));
  });

  test.each(["percentOfParentRow", "percentOfParent"] as const)(
    "%s uses the immediate row parent with hidden totals",
    (type) => {
      const f = fixture([
        ["Region", "Team", "Amount"],
        ["East", "A", 10],
        ["East", "B", 30],
        ["West", "A", 2],
        ["West", "B", 7],
      ]);
      const result = buildPivotResult(f.workbook, {
        ...f.table,
        rowFields: [0, 1],
        columnFields: [],
        rowTotals: false,
        columnTotals: false,
        values: [
          {
            field: 2,
            aggregate: "sum",
            caption: "Share",
            display: { type, baseField: type === "percentOfParent" ? 1 : undefined },
          },
        ],
      });
      expect(result.matrix[result.dataRows[0]!]!.at(-1)).toBeCloseTo(0.25);
      expect(result.matrix[result.dataRows[1]!]!.at(-1)).toBeCloseTo(0.75);
      expect(result.matrix[result.dataRows[2]!]!.at(-1)).toBeCloseTo(2 / 9);
      expect(result.matrix[result.dataRows[3]!]!.at(-1)).toBeCloseTo(7 / 9);
    },
  );

  test("parent-column percentages use the immediate column hierarchy parent", () => {
    const f = fixture([
      ["Region", "Team", "Amount"],
      ["East", "A", 10],
      ["East", "B", 30],
      ["West", "A", 2],
      ["West", "B", 7],
    ]);
    const matrix = buildPivotResult(f.workbook, {
      ...f.table,
      rowFields: [],
      columnFields: [0, 1],
      rowTotals: false,
      columnTotals: false,
      values: [
        { field: 2, aggregate: "sum", caption: "Share", display: { type: "percentOfParentCol" } },
      ],
    }).matrix;
    expect(matrix.at(-1)).toEqual(["Grand Total", 0.25, 0.75, 2 / 9, 7 / 9]);
  });

  test("running percentages end at one in displayed order", () => {
    const f = fixture();
    const matrix = buildPivotResult(f.workbook, {
      ...f.table,
      sortFields: [{ axis: "rows", field: 0, order: "descending" }],
      values: [{ ...f.table.values[0]!, display: { type: "percentOfRunningTotal", baseField: 0 } }],
    }).matrix;
    expect(matrix[1]![1]).toBeCloseTo(4 / 7);
    expect(matrix[2]![1]).toBe(1);
    expect(matrix[2]![2]).toBe(1);
  });

  test.each([
    ["rankAscending", [1, 2, 2, 4]],
    ["rankDescending", [4, 2, 2, 1]],
  ] as const)("%s uses competition ranks for tied aggregates", (type, expected) => {
    const f = fixture([
      ["Region", "Quarter", "Amount"],
      ["A", "Q1", 10],
      ["B", "Q1", 20],
      ["C", "Q1", 20],
      ["D", "Q1", 40],
    ]);
    const result = buildPivotResult(f.workbook, {
      ...f.table,
      columnFields: [],
      values: [{ ...f.table.values[0]!, display: { type, baseField: 0 } }],
    });
    expect(result.dataRows.map((row) => result.matrix[row]![1])).toEqual(expected);
  });

  test("difference resolves sibling members within each row hierarchy parent", () => {
    const f = fixture([
      ["Region", "Team", "Amount"],
      ["East", "A", 10],
      ["East", "B", 30],
      ["West", "A", 2],
      ["West", "B", 7],
    ]);
    const result = buildPivotResult(f.workbook, {
      ...f.table,
      rowFields: [0, 1],
      columnFields: [],
      values: [
        {
          field: 2,
          aggregate: "sum",
          caption: "Delta",
          display: { type: "difference", baseField: 1, baseItem: { kind: "previous" } },
        },
      ],
    });
    expect(result.matrix[result.dataRows[1]!]!.at(-1)).toBe(20);
    expect(result.matrix[result.dataRows[3]!]!.at(-1)).toBe(5);
  });
});

describe("pivot value settings protocol and formatting", () => {
  test("normalization clones nested display base items", () => {
    const f = fixture();
    const display: NonNullable<PivotValueField["display"]> = {
      type: "percent",
      baseField: 0,
      baseItem: { kind: "value", value: "East" },
    };
    const table = normalizePivotTable({
      ...f.table,
      values: [
        {
          ...f.table.values[0]!,
          display,
          numberFormat: { kind: "custom" as const, code: "0.00%" },
        },
      ],
    });
    expect(table.values[0]!.display).not.toBe(display);
    expect(table.values[0]!.display!.baseItem).not.toBe(display.baseItem);
    expect(table.values[0]!.display).toEqual(display);
  });

  test("rejects a display base field outside row and column axes", () => {
    const f = fixture();
    expect(() =>
      normalizePivotTable({
        ...f.table,
        values: [
          {
            ...f.table.values[0]!,
            display: { type: "difference", baseField: 3, baseItem: { kind: "previous" } },
          },
        ],
      }),
    ).toThrow(RangeError);
  });

  test("rejects nonstring number format codes", () => {
    const f = fixture();
    expect(() =>
      normalizePivotTable({
        ...f.table,
        values: [{ ...f.table.values[0]!, numberFormat: 42 } as unknown as PivotValueField],
      }),
    ).toThrow();
  });

  test.each([
    { field: 2, aggregate: "distinctCount", caption: "Distinct" },
    {
      field: 2,
      aggregate: "sum",
      caption: "Percent",
      display: { type: "percentOfTotal" },
      numberFormat: { kind: "custom" as const, code: "0.00%" },
    },
  ] as PivotValueField[])(
    "round trips new V41 value settings and gates them in V40 %#",
    (value) => {
      const f = fixture();
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(f.destination.id, { ...f.table, values: [value] }),
      );
      const snapshot = serializeWorkbook(f.workbook);
      expect(snapshot.version).toBe(43);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      expect(() => deserializeWorkbook({ ...snapshot, version: 40 })).toThrow();
    },
  );

  test("maps display base fields through source column insertion and undo", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, {
        ...f.table,
        values: [
          {
            ...f.table.values[0]!,
            display: { type: "difference", baseField: 1, baseItem: { kind: "previous" } },
          },
        ],
      }),
    );
    const before = serializeWorkbook(f.workbook);
    const originalMatrix = buildPivotResult(f.workbook, f.destination.pivotTables![0]!, {
      useCache: true,
    }).matrix;
    executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.source.id, "column", 1, 1));
    const mapped = f.destination.pivotTables![0]!;
    expect(mapped.columnFields).toEqual([2]);
    expect(mapped.values[0]!.field).toBe(3);
    expect(mapped.values[0]!.display).toEqual({
      type: "difference",
      baseField: 2,
      baseItem: { kind: "previous" },
    });
    setCellContent(f.source, { row: 0, column: 1 }, { kind: "literal", value: "Inserted" });
    expect(buildPivotResult(f.workbook, mapped).matrix).toEqual(originalMatrix);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("applies value number formats to result cells across refresh and undo", () => {
    const f = fixture();
    const table = {
      ...f.table,
      values: [
        {
          ...f.table.values[0]!,
          numberFormat: { kind: "custom" as const, code: "0.00%" },
          display: { type: "percentOfTotal" as const },
        },
      ],
    };
    executeWorkbookCommand(f.session, createSetPivotTableCommand(f.destination.id, table));
    const address = { row: table.anchor.row + 1, column: table.anchor.column + 1 };
    const format = getCellStyle(f.destination, address)?.numberFormat;
    expect(format).toEqual({ kind: "custom", code: "0.00%" });
    executeWorkbookCommand(
      f.session,
      createSetCellContentCommand(
        f.source.id,
        { row: 1, column: 2 },
        { kind: "literal", value: 100 },
      ),
    );
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(f.destination.id, f.destination.pivotTables![0]!),
    );
    expect(getCellStyle(f.destination, address)?.numberFormat).toEqual(format);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
});
