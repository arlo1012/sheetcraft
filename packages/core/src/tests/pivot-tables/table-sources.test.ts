import { describe, expect, test } from "vitest";
import {
  buildPivotResult,
  getPivotDetails,
  normalizePivotTable,
  resolvePivotTableSource,
} from "../../pivot-tables.js";
import {
  createPivotDetailsSheetCommand,
  createSetPivotTableCommand,
} from "../../commands/pivot-tables.js";
import {
  createDeleteSheetAxisCommand,
  createInsertSheetAxisCommand,
  createMoveSheetAxisCommand,
  createDuplicateSheetCommand,
  createSetCellContentCommand,
} from "../../commands/index.js";
import {
  createCreateTableCommand,
  createRemoveTableCommand,
  createResizeTableCommand,
  createUpdateTableCommand,
} from "../../tables.js";
import { createBuiltinTableStyles } from "../../table-styles.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import { getCellStyle, setCellContent, setCellStyle, type SheetTable } from "../../workbook.js";
import { fixture, records } from "./fixture.js";

function boundFixture(options: { self?: boolean; offset?: boolean; fixed?: boolean } = {}) {
  const f = fixture(records, options.offset ? { row: 2, column: 2 } : undefined);
  const sourceTable: SheetTable = {
    id: "source-table",
    name: "Table1",
    range: f.table.source!,
    columns: records[0]!.map((name, index) => ({ id: `field-${index}`, name: String(name) })),
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
  executeWorkbookCommand(f.session, createCreateTableCommand(f.source.id, sourceTable));
  const destination = options.self ? f.source : f.destination;
  const table = {
    ...f.table,
    ...(options.fixed ? {} : { sourceTableId: sourceTable.id }),
    ...(options.self ? { anchor: { row: 10, column: 0 } } : {}),
  };
  executeWorkbookCommand(f.session, createSetPivotTableCommand(destination.id, table));
  const current = () => destination.pivotTables![0]!;
  const refresh = () =>
    executeWorkbookCommand(f.session, createSetPivotTableCommand(destination.id, current()));
  return { ...f, destination, sourceTable, current, refresh };
}

describe("explicit table-backed pivot sources", () => {
  test("uses live row growth and shrink only on refresh, with atomic undo and redo", () => {
    const f = boundFixture();
    const pivot = normalizePivotTable(f.current());
    const output = serializeSheet(f.destination);
    ["West", "Q2", 50, 6].forEach((value, column) =>
      setCellContent(f.source, { row: 5, column }, { kind: "literal", value }),
    );
    executeWorkbookCommand(
      f.session,
      createResizeTableCommand(f.source.id, f.sourceTable.id, {
        start: { row: 0, column: 0 },
        end: { row: 5, column: 3 },
      }),
    );
    expect(f.current()).toEqual(pivot);
    expect(serializeSheet(f.destination)).toEqual(output);
    expect(resolvePivotTableSource(f.workbook, f.current()).range.end.row).toBe(5);
    expect(
      getPivotDetails(f.workbook, f.current(), f.current().outputRange!.end).records,
    ).toHaveLength(4);
    const beforeRefresh = serializeWorkbook(f.workbook);
    f.refresh();
    expect(f.current().source!.end.row).toBe(5);
    expect(f.current().dataCache!.records).toHaveLength(5);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(beforeRefresh);
    redoWorkbookCommand(f.session);
    expect(f.current().dataCache!.records).toHaveLength(5);
    executeWorkbookCommand(
      f.session,
      createResizeTableCommand(f.source.id, f.sourceTable.id, {
        start: { row: 0, column: 0 },
        end: { row: 2, column: 3 },
      }),
    );
    expect(f.current().dataCache!.records).toHaveLength(5);
    expect(f.current().source!.end.row).toBe(5);
    f.refresh();
    expect(f.current().source!.end.row).toBe(2);
    expect(f.current().dataCache!.records).toHaveLength(2);
  });

  test("automatically appended rows do not clear cache or rewrite the report", () => {
    const f = boundFixture();
    const output = serializeSheet(f.destination);
    executeWorkbookCommand(
      f.session,
      createSetCellContentCommand(
        f.source.id,
        { row: 5, column: 0 },
        { kind: "literal", value: "North" },
      ),
    );
    expect(f.source.tables![0]!.range.end.row).toBe(5);
    expect(serializeSheet(f.destination)).toEqual(output);
    f.refresh();
    expect(f.current().dataCache!.records).toHaveLength(5);
  });

  test("renames remain bound by identity and totals are excluded on every refresh", () => {
    const f = boundFixture();
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(
      f.session,
      createUpdateTableCommand(f.source.id, f.sourceTable.id, {
        name: "RenamedTable",
        totalRow: true,
      }),
    );
    expect(f.current().sourceTableId).toBe(f.sourceTable.id);
    expect(f.current().dataCache!.records).toHaveLength(4);
    expect(resolvePivotTableSource(f.workbook, f.current()).sourceTable!.name).toBe("RenamedTable");
    const refreshed = f.refresh();
    expect(f.current().source!.end.row).toBe(4);
    expect(f.current().dataCache!.records).toHaveLength(4);
    if (refreshed) undoWorkbookCommand(f.session);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    redoWorkbookCommand(f.session);
    expect(resolvePivotTableSource(f.workbook, f.current()).sourceTable!.name).toBe("RenamedTable");
    executeWorkbookCommand(
      f.session,
      createUpdateTableCommand(f.source.id, f.sourceTable.id, { totalRow: false }),
    );
    f.refresh();
    expect(f.current().dataCache!.records).toHaveLength(4);
  });

  test("missing or headerless tables fail without rectangle or name fallback; undo restores binding", () => {
    const f = boundFixture();
    executeWorkbookCommand(f.session, createRemoveTableCommand(f.source.id, f.sourceTable.id));
    const removed = serializeWorkbook(f.workbook);
    expect(() => f.refresh()).toThrow();
    expect(serializeWorkbook(f.workbook)).toEqual(removed);
    expect(
      getPivotDetails(f.workbook, f.current(), f.current().outputRange!.end).records,
    ).toHaveLength(4);
    undoWorkbookCommand(f.session);
    expect(resolvePivotTableSource(f.workbook, f.current()).sourceTable!.id).toBe(f.sourceTable.id);
    redoWorkbookCommand(f.session);
    expect(() => resolvePivotTableSource(f.workbook, f.current())).toThrow();
    undoWorkbookCommand(f.session);
    executeWorkbookCommand(
      f.session,
      createUpdateTableCommand(f.source.id, f.sourceTable.id, { headerRow: false }),
    );
    expect(() => f.refresh()).toThrow();
    expect(f.current().dataCache!.records).toHaveLength(4);
    undoWorkbookCommand(f.session);
    f.refresh();
  });

  test.each(["insert", "delete", "reorder"] as const)(
    "invalidates unsafe %s columns while retaining old cache and field indices",
    (operation) => {
      const f = boundFixture({ offset: true });
      const before = serializeWorkbook(f.workbook);
      const cache = f.current().dataCache;
      const command =
        operation === "insert"
          ? createInsertSheetAxisCommand(f.source.id, "column", 3)
          : operation === "delete"
            ? createDeleteSheetAxisCommand(f.source.id, "column", 4)
            : createMoveSheetAxisCommand(f.source.id, "column", 4, 1, 3);
      executeWorkbookCommand(f.session, command);
      expect(f.current().source).toBeNull();
      expect(f.current().dataCache).toEqual(cache);
      expect(f.current().values[0]!.field).toBe(2);
      expect(f.current().columnFields).toEqual([1]);
      expect(() => f.refresh()).toThrow();
      expect(
        getPivotDetails(f.workbook, f.current(), f.current().outputRange!.end).records,
      ).toHaveLength(4);
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      redoWorkbookCommand(f.session);
      expect(f.current().source).toBeNull();
    },
  );

  test("tracks live structural geometry after a safe move without rewriting stored refresh geometry", () => {
    const f = boundFixture({ offset: true });
    const pivot = normalizePivotTable(f.current());
    executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.source.id, "row", 0, 4));
    expect(f.current()).toEqual(pivot);
    expect(resolvePivotTableSource(f.workbook, f.current()).range.start.row).toBe(6);
    executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.source.id, "row", 8));
    expect(f.current()).toEqual(pivot);
    executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.source.id, "row", 6));
    expect(f.current().source).toBeNull();
    expect(f.current().dataCache).toEqual(pivot.dataCache);
  });

  test("structural row insertion and deletion keep the cached report until refresh", () => {
    const f = boundFixture();
    const cache = f.current().dataCache;
    const output = serializeSheet(f.destination);
    executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.source.id, "row", 2));
    expect(f.current().dataCache).toEqual(cache);
    expect(serializeSheet(f.destination)).toEqual(output);
    expect(resolvePivotTableSource(f.workbook, f.current()).range.end.row).toBe(5);
    executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.source.id, "row", 3));
    expect(f.current().dataCache).toEqual(cache);
    expect(f.current().source).not.toBeNull();
    f.refresh();
    expect(f.current().dataCache!.records).toHaveLength(4);
    expect(f.current().dataCache!.records).not.toEqual(cache!.records);
  });

  test("never substitutes a same-name table or a table on another source sheet", () => {
    const f = boundFixture();
    executeWorkbookCommand(f.session, createRemoveTableCommand(f.source.id, f.sourceTable.id));
    executeWorkbookCommand(
      f.session,
      createCreateTableCommand(f.source.id, { ...f.sourceTable, id: "replacement" }),
    );
    expect(() => resolvePivotTableSource(f.workbook, f.current())).toThrow(/missing/);
    expect(() =>
      resolvePivotTableSource(f.workbook, { ...f.current(), sourceSheetId: f.destination.id }),
    ).toThrow(/missing/);
  });

  test("column growth and renamed headers reject even a cache-free refresh payload", () => {
    const f = boundFixture();
    executeWorkbookCommand(
      f.session,
      createSetCellContentCommand(
        f.source.id,
        { row: 0, column: 2 },
        { kind: "literal", value: "Revenue" },
      ),
    );
    const changed = serializeWorkbook(f.workbook);
    expect(() =>
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(f.destination.id, { ...f.current(), dataCache: undefined }),
      ),
    ).toThrow();
    expect(serializeWorkbook(f.workbook)).toEqual(changed);
    const repair = createSetPivotTableCommand(
      f.destination.id,
      { ...f.current(), source: f.source.tables![0]!.range },
      { repairSource: true },
    );
    executeWorkbookCommand(f.session, repair);
    expect(f.current().dataCache!.headers[2]).toBe("Revenue");
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(changed);
    undoWorkbookCommand(f.session);
    setCellContent(f.source, { row: 0, column: 4 }, { kind: "literal", value: "NewField" });
    executeWorkbookCommand(
      f.session,
      createResizeTableCommand(f.source.id, f.sourceTable.id, {
        start: { row: 0, column: 0 },
        end: { row: 4, column: 4 },
      }),
    );
    expect(() => f.refresh()).toThrow();
  });

  test("invalid null sentinels cannot be revived by ordinary set; explicit repair revalidates live columns", () => {
    const f = boundFixture();
    executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.source.id, "column", 2));
    expect(f.current().source).toBeNull();
    const range = f.source.tables![0]!.range;
    expect(() =>
      executeWorkbookCommand(
        f.session,
        createSetPivotTableCommand(f.destination.id, {
          ...f.current(),
          source: range,
          dataCache: undefined,
        }),
      ),
    ).toThrow();
    const before = serializeWorkbook(f.workbook);
    executeWorkbookCommand(
      f.session,
      createSetPivotTableCommand(
        f.destination.id,
        { ...f.current(), source: range },
        { repairSource: true },
      ),
    );
    expect(f.current().dataCache!.headers).toEqual(["Region", "Quarter", "Units"]);
    expect(f.current().values[0]!.field).toBe(2);
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("protects dynamically grown sources before any report mutation", () => {
    const f = boundFixture({ self: true });
    // Imported or externally supplied live table geometry can already contain the report.
    f.source.tables![0]!.range = { start: { row: 0, column: 0 }, end: { row: 12, column: 3 } };
    const before = serializeWorkbook(f.workbook);
    expect(() => f.refresh()).toThrow(/sourceOverlap/);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("duplicates same-sheet binding pairs and leaves external pairs unchanged", () => {
    const f = boundFixture({ self: true });
    const duplicate = createDuplicateSheetCommand(f.workbook, f.source.id, {
      id: "copy",
      name: "Copy",
    });
    executeWorkbookCommand(f.session, duplicate);
    const copy = f.workbook.sheets.get("copy")!;
    const bound = copy.pivotTables![0]!;
    expect(bound.sourceSheetId).toBe(copy.id);
    expect(bound.sourceTableId).toBe(copy.tables![0]!.id);
    expect(bound.sourceTableId).not.toBe(f.sourceTable.id);
    expect(resolvePivotTableSource(f.workbook, bound).sourceTable!.name).toBe(
      copy.tables![0]!.name,
    );
    const g = boundFixture();
    executeWorkbookCommand(
      g.session,
      createDuplicateSheetCommand(g.workbook, g.destination.id, {
        id: "output-copy",
        name: "OutputCopy",
      }),
    );
    expect(g.workbook.sheets.get("output-copy")!.pivotTables![0]!.sourceTableId).toBe(
      g.sourceTable.id,
    );
    expect(g.workbook.sheets.get("output-copy")!.pivotTables![0]!.sourceSheetId).toBe(g.source.id);
  });

  test("details formatting samples safe live coordinates, or skips invalid sources", () => {
    const f = boundFixture({ offset: true });
    setCellStyle(
      f.source,
      { row: 3, column: 4 },
      { numberFormat: { kind: "custom", code: "0.00" } },
    );
    executeWorkbookCommand(f.session, createInsertSheetAxisCommand(f.source.id, "column", 0, 2));
    setCellStyle(f.source, { row: 3, column: 4 }, { numberFormat: { kind: "custom", code: "0%" } });
    const details = deserializeSheet(
      createPivotDetailsSheetCommand(
        f.workbook,
        f.destination.id,
        f.current().id,
        f.current().outputRange!.end,
        { id: "details" },
      ).sheet,
    );
    expect(getCellStyle(details, { row: 1, column: 2 })?.numberFormat).toEqual({
      kind: "custom",
      code: "0.00",
    });
    executeWorkbookCommand(f.session, createDeleteSheetAxisCommand(f.source.id, "column", 6));
    const invalidDetails = deserializeSheet(
      createPivotDetailsSheetCommand(
        f.workbook,
        f.destination.id,
        f.current().id,
        f.current().outputRange!.end,
        { id: "invalid-details" },
      ).sheet,
    );
    expect(getCellStyle(invalidDetails, { row: 1, column: 2 })?.numberFormat).toBeUndefined();
  });

  test("round trips V43 binding and rejects binding fields in every old protocol", () => {
    const f = boundFixture();
    const snapshot = serializeWorkbook(f.workbook);
    expect(snapshot.version).toBe(43);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    const standalone = serializeSheet(f.destination);
    expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    expect(() => deserializeWorkbook({ ...snapshot, version: 42 })).toThrow(/version 43/);
    for (let version = 1; version <= 42; version++) {
      expect(() => deserializeWorkbook({ ...snapshot, version })).toThrow();
    }
    expect(() => normalizePivotTable({ ...f.current(), sourceTableId: "" })).toThrow();
    expect(() =>
      normalizePivotTable({
        ...f.current(),
        consolidation: {
          ranges: [{ sheetId: f.source.id, range: f.table.source, label: "Area" }],
          labels: ["Row", "Column", "Value", "Area"],
        },
      }),
    ).toThrow();
    f.current().source = null;
    expect(
      serializeWorkbook(deserializeWorkbook(serializeWorkbook(f.workbook))).sheets[1]!
        .pivotTables![0]!.source,
    ).toBeNull();
  });

  test("V42 range pivots never auto-bind an intersecting live table", () => {
    const f = boundFixture({ fixed: true });
    const snapshot = serializeWorkbook(f.workbook);
    const restored = deserializeWorkbook({ ...snapshot, version: 42 });
    const old = restored.sheets.get(f.destination.id)!.pivotTables![0]!;
    expect(old.sourceTableId).toBeUndefined();
    executeWorkbookCommand(
      f.session,
      createSetCellContentCommand(
        f.source.id,
        { row: 5, column: 0 },
        { kind: "literal", value: "North" },
      ),
    );
    f.refresh();
    expect(f.current().dataCache!.records).toHaveLength(4);
    expect(buildPivotResult(f.workbook, f.current()).dataCache.records).toHaveLength(4);
  });
});
