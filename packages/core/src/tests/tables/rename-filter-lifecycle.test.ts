import { describe, expect, test } from "vitest";
import { createSetCellContentCommand } from "../../commands/values.js";
import {
  createSetSheetFilterCommand,
  createSetSheetFilterCriteriaCommand,
} from "../../commands/filter.js";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  redoWorkbookCommand,
  undoWorkbookCommand,
} from "../../history.js";
import { deserializeWorkbook, serializeWorkbook } from "../../serialization.js";
import { createBuiltinTableStyles } from "../../table-styles.js";
import {
  createCreateTableCommand,
  createResizeTableCommand,
  createUpdateTableCommand,
} from "../../tables.js";
import {
  createSheet,
  createWorkbook,
  createWorkbookEvaluator,
  getCellContent,
  setCellContent,
  type CellRange,
  type SheetTable,
} from "../../workbook.js";

function fixture(filtered = false, totals = false) {
  const workbook = createWorkbook({ id: "book", sheetId: "sheet" });
  const sheet = workbook.sheets.get("sheet")!;
  [
    ["Region", "Qty", "Amount"],
    ["North", 2, 10],
    ["South", 3, 20],
    ["North", 4, 30],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(sheet, { row: r, column }, { kind: "literal", value }),
    ),
  );
  const table: SheetTable = {
    id: "sales",
    name: "Sales",
    range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
    columns: [
      { id: "region", name: "Region" },
      { id: "qty", name: "Qty" },
      { id: "amount", name: "Amount" },
    ],
    style: createBuiltinTableStyles("#4f81bd")[1]!,
    headerRow: true,
    totalRow: false,
    firstColumn: false,
    lastColumn: false,
    bandedRows: true,
    bandedColumns: false,
    filterButton: true,
    filter: null,
  };
  const session = createWorkbookSession({ workbook, idFactory: () => "test" });
  executeWorkbookCommand(session, createCreateTableCommand(sheet.id, table));
  if (filtered)
    executeWorkbookCommand(
      session,
      createSetSheetFilterCriteriaCommand(sheet.id, table.range, [
        { column: 0, allowedValues: [{ kind: "string", value: "North" }] },
        {
          column: 2,
          allowedValues: [
            { kind: "number", value: 10 },
            { kind: "number", value: 30 },
          ],
        },
      ]),
    );
  if (totals)
    executeWorkbookCommand(
      session,
      createUpdateTableCommand(sheet.id, table.id, { totalRow: true }),
    );
  return { workbook, sheet, table, session };
}

function setFormula(f: ReturnType<typeof fixture>, row: number, column: number, source: string) {
  executeWorkbookCommand(
    f.session,
    createSetCellContentCommand(
      f.sheet.id,
      { row, column },
      { kind: "formula", formula: { source } },
    ),
  );
}

describe("observed table rename and filtered-resize lifecycle", () => {
  test.each([
    ["=[@Qty]*10", "=[@Units]*10"],
    ["=SUM([Qty])", "=SUM([Units])"],
    ["=SUM([[#Data],[Qty]])", "=SUM([[#Data],[Units]])"],
    ['="[@Qty]"&[@Qty]', '="[@Qty]"&[@Units]'],
  ])("renames the owning table's implicit selector: %s", (source, expected) => {
    const f = fixture();
    setFormula(f, 1, 2, source);
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(
      f.session,
      createSetCellContentCommand(
        f.sheet.id,
        { row: 0, column: 1 },
        { kind: "literal", value: "Units" },
      ),
    );
    expect(getCellContent(f.sheet, { row: 1, column: 2 })).toMatchObject({
      formula: { source: expected },
    });
    expect(getCellContent(f.sheet, { row: 2, column: 2 })).toEqual({ kind: "literal", value: 20 });
    const after = serializeWorkbook(f.workbook);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
  });

  test("updates implicit references only inside the edited table and named references across sheets", () => {
    const f = fixture();
    const otherSheet = createSheet("Other sheet", "other");
    f.workbook.sheets.set(otherSheet.id, otherSheet);
    const otherTable = { ...f.table, id: "other-table", name: "Other", filter: null };
    executeWorkbookCommand(f.session, createCreateTableCommand(otherSheet.id, otherTable));
    setFormula(f, 1, 2, "=[@Qty]+Other[Qty]");
    setFormula(f, 1, 4, "=[@Qty]");
    executeWorkbookCommand(
      f.session,
      createSetCellContentCommand(
        otherSheet.id,
        { row: 1, column: 2 },
        {
          kind: "formula",
          formula: { source: "=[@Qty]+SUM(Sales[Qty])" },
        },
      ),
    );
    executeWorkbookCommand(
      f.session,
      createSetCellContentCommand(
        f.sheet.id,
        { row: 0, column: 1 },
        { kind: "literal", value: "Units" },
      ),
    );
    expect(getCellContent(f.sheet, { row: 1, column: 2 })).toMatchObject({
      formula: { source: "=[@Units]+Other[Qty]" },
    });
    expect(getCellContent(f.sheet, { row: 1, column: 4 })).toMatchObject({
      formula: { source: "=[@Qty]" },
    });
    expect(getCellContent(otherSheet, { row: 1, column: 2 })).toMatchObject({
      formula: { source: "=[@Qty]+SUM(Sales[Units])" },
    });
    expect(
      createWorkbookEvaluator(f.workbook, f.sheet.id).getComputedValue({ row: 2, column: 2 }),
    ).toBe(20);
  });

  test.each([false, true])(
    "filtered row shrink stays serializable and reversible (settings=%s)",
    (settings) => {
      const f = fixture(true);
      const before = serializeWorkbook(f.workbook);
      const criteria = f.sheet.tables![0]!.filter!.columns.map((column) => ({ ...column }));
      const range: CellRange = { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } };
      executeWorkbookCommand(
        f.session,
        settings
          ? createUpdateTableCommand(f.sheet.id, f.table.id, { range })
          : createResizeTableCommand(f.sheet.id, f.table.id, range),
      );
      const resized = f.sheet.tables![0]!;
      expect(resized.filter!.range).toEqual(range);
      expect(resized.filter!.columns).toEqual(criteria);
      const after = serializeWorkbook(f.workbook);
      expect(deserializeWorkbook(after).sheets.get(f.sheet.id)!.tables![0]).toEqual(resized);
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      redoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.workbook)).toEqual(after);
    },
  );

  test("horizontal shrink drops only excluded filter criteria", () => {
    const f = fixture(true);
    const range = { start: { row: 0, column: 0 }, end: { row: 3, column: 1 } };
    executeWorkbookCommand(f.session, createResizeTableCommand(f.sheet.id, f.table.id, range));
    expect(f.sheet.tables![0]!.filter).toMatchObject({
      range,
      columns: [{ column: 0, allowedValues: [{ kind: "string", value: "North" }] }],
    });
    expect(() => serializeWorkbook(f.workbook)).not.toThrow();
  });

  test("expansion keeps selected values and covers new rows, excluding totals", () => {
    const f = fixture(true, true);
    const range = { start: { row: 0, column: 0 }, end: { row: 6, column: 2 } };
    executeWorkbookCommand(f.session, createResizeTableCommand(f.sheet.id, f.table.id, range));
    expect(f.sheet.tables![0]!.filter!.range).toEqual({ ...range, end: { ...range.end, row: 5 } });
    expect(f.sheet.tables![0]!.filter!.columns[0]).toEqual({
      column: 0,
      allowedValues: [{ kind: "string", value: "North" }],
    });
    expect(() => deserializeWorkbook(serializeWorkbook(f.workbook))).not.toThrow();
  });

  test.each([false, true])(
    "totals-enabled shrink clips the filter to data and retains history (settings=%s)",
    (settings) => {
      const f = fixture(true, true);
      const before = serializeWorkbook(f.workbook);
      const range = { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } };
      executeWorkbookCommand(
        f.session,
        settings
          ? createUpdateTableCommand(f.sheet.id, f.table.id, { range })
          : createResizeTableCommand(f.sheet.id, f.table.id, range),
      );
      expect(f.sheet.tables![0]!.filter!.range.end.row).toBe(2);
      expect(getCellContent(f.sheet, { row: 3, column: 2 })).toMatchObject({
        formula: { source: "=SUBTOTAL(109,C2:C3)" },
      });
      const after = serializeWorkbook(f.workbook);
      expect(() => deserializeWorkbook(after)).not.toThrow();
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      redoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.workbook)).toEqual(after);
    },
  );

  test("advanced hidden-row intervals are clipped without moving their external criteria", () => {
    const f = fixture(true);
    const criteria = {
      sheetId: f.sheet.id,
      range: { start: { row: 6, column: 0 }, end: { row: 7, column: 0 } },
    };
    executeWorkbookCommand(
      f.session,
      createSetSheetFilterCommand(f.sheet.id, {
        ...f.sheet.tables![0]!.filter!,
        advanced: { criteria, uniqueOnly: false, hiddenRows: [{ start: 2, end: 3 }] },
      }),
    );
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(
      f.session,
      createResizeTableCommand(f.sheet.id, f.table.id, {
        start: { row: 0, column: 0 },
        end: { row: 2, column: 2 },
      }),
    );
    expect(f.sheet.tables![0]!.filter!.advanced).toEqual({
      criteria,
      uniqueOnly: false,
      hiddenRows: [{ start: 2, end: 2 }],
    });
    expect(() => deserializeWorkbook(serializeWorkbook(f.workbook))).not.toThrow();
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("overlap rejection leaves filtered table bounds, values and history unchanged", () => {
    const f = fixture(true);
    executeWorkbookCommand(
      f.session,
      createCreateTableCommand(f.sheet.id, {
        ...f.table,
        id: "neighbor",
        name: "Neighbor",
        range: {
          start: { row: 5, column: 0 },
          end: { row: 7, column: 2 },
        },
      }),
    );
    const before = serializeWorkbook(f.workbook);
    expect(() =>
      executeWorkbookCommand(
        f.session,
        createResizeTableCommand(f.sheet.id, f.table.id, {
          start: { row: 0, column: 0 },
          end: { row: 6, column: 2 },
        }),
      ),
    ).toThrow();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("resize does not add a filter to an unfiltered table", () => {
    const f = fixture();
    executeWorkbookCommand(
      f.session,
      createResizeTableCommand(f.sheet.id, f.table.id, {
        start: { row: 0, column: 0 },
        end: { row: 2, column: 2 },
      }),
    );
    expect(f.sheet.tables![0]!.filter).toBeNull();
    expect(() => serializeWorkbook(f.workbook)).not.toThrow();
  });

  test("header toggles move advanced hidden rows with data and retain their external source", () => {
    const f = fixture(true);
    const source = createSheet("Criteria", "criteria");
    f.workbook.sheets.set(source.id, source);
    setCellContent(source, { row: 6, column: 0 }, { kind: "literal", value: "Region" });
    setCellContent(source, { row: 7, column: 0 }, { kind: "literal", value: "North" });
    const criteria = {
      sheetId: source.id,
      range: { start: { row: 6, column: 0 }, end: { row: 7, column: 0 } },
    };
    executeWorkbookCommand(
      f.session,
      createSetSheetFilterCommand(f.sheet.id, {
        ...f.sheet.tables![0]!.filter!,
        advanced: { criteria, uniqueOnly: false, hiddenRows: [{ start: 2, end: 3 }] },
      }),
    );
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(
      f.session,
      createUpdateTableCommand(f.sheet.id, f.table.id, { headerRow: false }),
    );
    expect(f.sheet.tables![0]!.filter!.advanced).toEqual({
      criteria,
      uniqueOnly: false,
      hiddenRows: [{ start: 1, end: 2 }],
    });
    expect(() => deserializeWorkbook(serializeWorkbook(f.workbook))).not.toThrow();
    executeWorkbookCommand(
      f.session,
      createUpdateTableCommand(f.sheet.id, f.table.id, { headerRow: true }),
    );
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    undoWorkbookCommand(f.session);
    expect(f.sheet.tables![0]!.filter!.advanced!.hiddenRows).toEqual([{ start: 1, end: 2 }]);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test.each([false, true])(
    "header visibility change keeps an existing filter serializable and undoable (criteria=%s)",
    (criteria) => {
      const f = fixture(true);
      if (!criteria)
        executeWorkbookCommand(
          f.session,
          createSetSheetFilterCommand(f.sheet.id, {
            range: f.table.range,
            columns: [],
          }),
        );
      const before = serializeWorkbook(f.workbook);
      executeWorkbookCommand(
        f.session,
        createUpdateTableCommand(f.sheet.id, f.table.id, { headerRow: false }),
      );
      expect(f.sheet.tables![0]!.filter!.range.end.row).toBe(2);
      const after = serializeWorkbook(f.workbook);
      expect(() => deserializeWorkbook(after)).not.toThrow();
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      redoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.workbook)).toEqual(after);
    },
  );
  test.each([
    [false, 0],
    [true, 0],
    [false, 3],
    [true, 3],
  ] as const)(
    "rejects losing the first advanced-hidden data row before any header/totals mutation (totals=%s,start=%s)",
    (totals, start) => {
      const f = fixture(true, totals);
      if (start)
        executeWorkbookCommand(
          f.session,
          createResizeTableCommand(f.sheet.id, f.table.id, {
            start: { row: start, column: 0 },
            end: { row: f.sheet.tables![0]!.range.end.row + start, column: 2 },
          }),
        );
      executeWorkbookCommand(
        f.session,
        createSetSheetFilterCommand(f.sheet.id, {
          ...f.sheet.tables![0]!.filter!,
          advanced: { uniqueOnly: false, hiddenRows: [{ start: start + 1, end: start + 2 }] },
        }),
      );
      const before = serializeWorkbook(f.workbook);
      expect(() =>
        executeWorkbookCommand(
          f.session,
          createUpdateTableCommand(f.sheet.id, f.table.id, {
            headerRow: false,
            totalRow: !totals,
          }),
        ),
      ).toThrow(/first data row/);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      undoWorkbookCommand(f.session);
      expect(f.sheet.tables![0]!.headerRow).toBe(true);
      redoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );

  test("rejects header shifts on a sheet used by table-owned advanced criteria without moving its source", () => {
    const f = fixture(true);
    const criteria = {
      sheetId: f.sheet.id,
      range: { start: { row: 6, column: 0 }, end: { row: 7, column: 0 } },
    };
    setCellContent(f.sheet, { row: 6, column: 0 }, { kind: "literal", value: "Region" });
    setCellContent(f.sheet, { row: 7, column: 0 }, { kind: "literal", value: "North" });
    executeWorkbookCommand(
      f.session,
      createSetSheetFilterCommand(f.sheet.id, {
        ...f.sheet.tables![0]!.filter!,
        advanced: { criteria, uniqueOnly: false, hiddenRows: [{ start: 2, end: 3 }] },
      }),
    );
    const before = serializeWorkbook(f.workbook);
    expect(() =>
      executeWorkbookCommand(
        f.session,
        createUpdateTableCommand(f.sheet.id, f.table.id, { headerRow: false }),
      ),
    ).toThrow(/advanced filter criteria/);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("totals-only update normalizes a readable legacy filter that included the total row", () => {
    const f = fixture(true, true);
    executeWorkbookCommand(
      f.session,
      createSetSheetFilterCommand(f.sheet.id, {
        ...f.sheet.tables![0]!.filter!,
        range: f.sheet.tables![0]!.range,
      }),
    );
    const before = serializeWorkbook(f.workbook);
    expect(() => deserializeWorkbook(before)).not.toThrow();
    executeWorkbookCommand(
      f.session,
      createUpdateTableCommand(f.sheet.id, f.table.id, { totalRow: false }),
    );
    expect(f.sheet.tables![0]!.filter!.range.end.row).toBe(f.sheet.tables![0]!.range.end.row);
    const after = serializeWorkbook(f.workbook);
    expect(() => deserializeWorkbook(after)).not.toThrow();
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    redoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(after);
  });
});
