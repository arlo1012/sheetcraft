// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test } from "vitest";
import {
  createSparklineValueResolver,
  getSparklineValues,
  type CellSparkline,
} from "../../sparklines.js";
import {
  createAddSheetOutlineGroupCommand,
  createSetSheetFilterCriteriaCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand } from "../../history.js";
import { createCreateTableCommand } from "../../tables.js";
import { createBuiltinTableStyles } from "../../table-styles.js";
import { serializeWorkbook } from "../../serialization.js";
import {
  createSheetEvaluator,
  getActiveSheet,
  setCellContent,
  type CellAddress,
  type CellRange,
  type SheetEvaluator,
  type SheetTable,
} from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";

function sparkline(source: CellRange, empty: CellSparkline["empty"] = "gap"): CellSparkline {
  return {
    type: "line",
    source,
    color: "#2563eb",
    negativeColor: "#ff0000",
    markers: false,
    axis: false,
    showHidden: false,
    empty,
  };
}

function filteredFixture() {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  const rows = [
    ["Sheet category", "Value", "", "Table category", "Table value"],
    ["keep", 10, "", "keep", 100],
    ["keep", 20, "", "drop", 200],
    ["drop", 30, "", "keep", 300],
    ["keep", 40, "", "keep", 400],
    ["keep", null, "", "keep", 500],
    ["keep", 60, "", "keep", 600],
  ];
  rows.forEach((values, row) =>
    values.forEach((value, column) => {
      if (value !== null) setCellContent(sheet, { row, column }, { kind: "literal", value });
    }),
  );
  const table: SheetTable = {
    id: "visibility-table",
    name: "VisibilityTable",
    range: { start: { row: 0, column: 3 }, end: { row: 6, column: 4 } },
    columns: [
      { id: "category", name: "Table category" },
      { id: "value", name: "Table value" },
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
  executeWorkbookCommand(session, createCreateTableCommand(sheet.id, table));
  executeWorkbookCommand(
    session,
    createSetSheetFilterCriteriaCommand(
      sheet.id,
      { start: { row: 0, column: 0 }, end: { row: 6, column: 1 } },
      [{ column: 0, allowedValues: [{ kind: "string", value: "keep" }] }],
    ),
  );
  executeWorkbookCommand(
    session,
    createSetSheetFilterCriteriaCommand(sheet.id, table.range, [
      { column: 3, allowedValues: [{ kind: "string", value: "keep" }] },
    ]),
  );
  sheet.hiddenRows = new Set([4]);
  executeWorkbookCommand(
    session,
    createAddSheetOutlineGroupCommand(sheet.id, {
      id: "collapsed-rows",
      axis: "row",
      start: 6,
      end: 6,
      collapsed: true,
    }),
  );
  return { session, sheet };
}

describe("sparkline source visibility", () => {
  test.each(["gap", "zero"] as const)(
    "unites worksheet/table filters, manual rows and collapsed rows before applying %s to visible blanks",
    (empty) => {
      const f = filteredFixture();
      const definition = sparkline(
        { start: { row: 1, column: 1 }, end: { row: 6, column: 1 } },
        empty,
      );
      const originalDefinition = structuredClone(definition);
      const before = serializeWorkbook(f.session.workbook);
      const historyLength = f.session.history.undoStack.length;
      const blank = empty === "zero" ? 0 : null;

      expect(f.sheet.filter?.columns[0]?.column).toBe(0);
      expect(f.sheet.tables?.[0]?.filter?.columns[0]?.column).toBe(3);
      expect(getSparklineValues(f.sheet, definition, createSheetEvaluator(f.sheet))).toEqual([
        10,
        blank,
      ]);
      expect(
        getSparklineValues(
          f.sheet,
          { ...definition, showHidden: true },
          createSheetEvaluator(f.sheet),
        ),
      ).toEqual([10, 20, 30, 40, blank, 60]);
      expect(definition).toEqual(originalDefinition);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(historyLength);
    },
  );

  test.each(["gap", "zero"] as const)(
    "omits manual and collapsed columns rather than adding hidden points in %s mode",
    (empty) => {
      const session = createTestWorkbookSession();
      const sheet = getActiveSheet(session.workbook);
      [11, 22, null, 44, 55].forEach((value, index) => {
        if (value !== null)
          setCellContent(sheet, { row: 8, column: index + 1 }, { kind: "literal", value });
      });
      sheet.hiddenColumns = new Set([2]);
      executeWorkbookCommand(
        session,
        createAddSheetOutlineGroupCommand(sheet.id, {
          id: "collapsed-columns",
          axis: "column",
          start: 4,
          end: 4,
          collapsed: true,
        }),
      );
      const definition = sparkline(
        { start: { row: 8, column: 1 }, end: { row: 8, column: 5 } },
        empty,
      );
      const before = serializeWorkbook(session.workbook);
      const blank = empty === "zero" ? 0 : null;

      expect(getSparklineValues(sheet, definition, createSheetEvaluator(sheet))).toEqual([
        11,
        blank,
        55,
      ]);
      expect(
        getSparklineValues(sheet, { ...definition, showHidden: true }, createSheetEvaluator(sheet)),
      ).toEqual([11, 22, blank, 44, 55]);
      expect(serializeWorkbook(session.workbook)).toEqual(before);
    },
  );

  test.each(["gap", "zero"] as const)(
    "returns no point for an entirely filtered blank source in %s mode",
    (empty) => {
      const f = filteredFixture();
      setCellContent(f.sheet, { row: 2, column: 1 }, null);
      const definition = sparkline(
        { start: { row: 2, column: 1 }, end: { row: 2, column: 1 } },
        empty,
      );
      const before = serializeWorkbook(f.session.workbook);
      const resolve = createSparklineValueResolver(f.sheet, createSheetEvaluator(f.sheet));

      expect(resolve(definition)).toEqual([]);
      expect(getSparklineValues(f.sheet, definition, createSheetEvaluator(f.sheet))).toEqual([]);
      expect(resolve({ ...definition, showHidden: true })).toEqual([empty === "zero" ? 0 : null]);
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    },
  );

  test("reuses one filter derivation across sparkline sources and refreshes visibility in a new resolver", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    ["keep", "drop", "keep", "keep"].forEach((category, index) => {
      const row = index + 1;
      setCellContent(sheet, { row, column: 0 }, { kind: "literal", value: category });
      setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: row * 10 });
      setCellContent(sheet, { row, column: 2 }, { kind: "literal", value: row * 100 });
    });
    const filterRange = { start: { row: 0, column: 0 }, end: { row: 4, column: 2 } };
    executeWorkbookCommand(
      session,
      createSetSheetFilterCriteriaCommand(sheet.id, filterRange, [
        { column: 0, allowedValues: [{ kind: "string", value: "keep" }] },
      ]),
    );
    const first = sparkline({ start: { row: 1, column: 1 }, end: { row: 4, column: 1 } });
    const second = sparkline({ start: { row: 1, column: 2 }, end: { row: 4, column: 2 } });
    const actualEvaluator = createSheetEvaluator(sheet);
    const reads: CellAddress[] = [];
    const recordingEvaluator: SheetEvaluator = {
      ...actualEvaluator,
      getComputedValue(address) {
        reads.push({ ...address });
        return actualEvaluator.getComputedValue(address);
      },
    };
    const before = serializeWorkbook(session.workbook);
    const resolve = createSparklineValueResolver(sheet, recordingEvaluator);

    expect(resolve({ ...first, showHidden: true })).toEqual([10, 20, 30, 40]);
    expect(reads.filter(({ column }) => column === 0)).toHaveLength(0);
    expect(resolve(first)).toEqual([10, 30, 40]);
    const filterReads = reads.filter(({ column }) => column === 0).length;
    expect(filterReads).toBeGreaterThan(0);
    expect(resolve(second)).toEqual([100, 300, 400]);
    expect(resolve(first)).toEqual([10, 30, 40]);
    expect(reads.filter(({ column }) => column === 0)).toHaveLength(filterReads);
    expect(serializeWorkbook(session.workbook)).toEqual(before);

    executeWorkbookCommand(
      session,
      createSetSheetFilterCriteriaCommand(sheet.id, filterRange, [
        {
          column: 0,
          allowedValues: [
            { kind: "string", value: "keep" },
            { kind: "string", value: "drop" },
          ],
        },
      ]),
    );
    executeWorkbookCommand(
      session,
      createAddSheetOutlineGroupCommand(sheet.id, {
        id: "newly-collapsed",
        axis: "row",
        start: 3,
        end: 3,
        collapsed: true,
      }),
    );
    const afterChanges = serializeWorkbook(session.workbook);
    const refreshed = createSparklineValueResolver(sheet, createSheetEvaluator(sheet));
    expect(refreshed(first)).toEqual([10, 20, 40]);
    expect(refreshed(second)).toEqual([100, 200, 400]);
    expect(refreshed({ ...first, showHidden: true })).toEqual([10, 20, 30, 40]);
    expect(serializeWorkbook(session.workbook)).toEqual(afterChanges);
  });
});
