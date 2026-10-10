import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import {
  applyWorkbookCommand,
  createCreateTableCommand,
  createDeleteSheetAxisCommand,
  createRemoveTableCommand,
  createResizeTableCommand,
  createUpdateTableCommand,
} from "@sheetcraft/core/commands";
import { redoWorkbookCommand, undoWorkbookCommand } from "@sheetcraft/core/history";
import { getPivotTableSource } from "@sheetcraft/core/pivot-tables";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
import {
  getActiveSheet,
  getCellValue,
  createSheet,
  insertSheet,
  setCellContent,
  type CellRange,
} from "@sheetcraft/core/workbook";
import PivotTableDialog from "../../../modules/pivot-tables/components/PivotTableDialog.vue";
import { usePivotActions } from "../../../modules/pivot-tables/usePivotActions";
import { resolvePivotDraftSource } from "../../../modules/pivot-tables/pivot-draft-source";
import { createAppI18n } from "../../../shared/i18n";
import { resolveRangeReference } from "../../../shared/range-reference/formatRangeReference";
import { fixture } from "./fixture";

function tableFixture(
  options: { blankRow?: boolean; headerRow?: boolean; totalRow?: boolean } = {},
) {
  const f = fixture();
  const headerRow = options.headerRow ?? true;
  const totalRow = options.totalRow ?? true;
  const rows = [
    ...(headerRow ? [["Region", "Amount"]] : []),
    ["East", 10],
    ...(options.blankRow ? [[]] : []),
    ["East", 20],
    ...(totalRow ? [["Total", 30]] : []),
  ];
  f.source.cells.clear();
  rows.forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(f.source, { row: r, column }, { kind: "literal", value }),
    ),
  );
  applyWorkbookCommand(
    f.workbook,
    createCreateTableCommand(f.source.id, {
      id: "table",
      name: "Table1",
      range: { start: { row: 0, column: 0 }, end: { row: rows.length - 1, column: 1 } },
      columns: [
        { id: "region", name: "Region" },
        { id: "amount", name: "Amount" },
      ],
      style: createBuiltinTableStyles("#4f81bd")[0]!,
      headerRow,
      totalRow,
      firstColumn: false,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false,
      filterButton: true,
      filter: null,
    }),
  );
  let selection: CellRange = { start: { row: 1, column: 0 }, end: { row: 1, column: 0 } };
  const actions = usePivotActions({
    getWorkbook: () => f.workbook,
    getSheet: () => f.sheet,
    getRange: () => selection,
    isBusy: () => false,
    flush: f.flush,
    execute: f.execute,
    name: () => "Sales",
    total: () => "Grand Total",
    empty: () => "(blank)",
    sumCaption: (field) => `Sum ${field}`,
    onError: f.onError,
  });
  return {
    ...f,
    actions,
    select(range: CellRange) {
      selection = range;
    },
    get sheet() {
      return f.sheet;
    },
  };
}

function configuredTableReport(options: { totalRow?: boolean } = {}) {
  const f = tableFixture(options);
  f.actions.open();
  f.actions.confirm(f.actions.editing.value!);
  const anchor = f.sheet.pivotTables![0]!.anchor;
  f.select({ start: { ...anchor }, end: { ...anchor } });
  expect(
    f.actions.update({
      ...f.sheet.pivotTables![0]!,
      rowFields: [0],
      values: [{ field: 1, aggregate: "sum", caption: "Sum Amount" }],
    }),
  ).toBe(true);
  return f;
}

describe("table-first pivot insertion source", () => {
  test.each([false, true])(
    "captures headers and data without total or touching columns, chart=%s",
    (chart) => {
      const f = tableFixture();
      ["Neighbor", 100, 200, 300].forEach((value, row) =>
        setCellContent(f.source, { row, column: 2 }, { kind: "literal", value }),
      );
      const before = serializeWorkbook(f.workbook);
      f.actions.open(chart);
      const draft = f.actions.editing.value!;
      expect(draft.source).toBe("Table1");
      expect(draft.table).toMatchObject({ sourceSheetId: f.source.id, sourceTableId: "table" });
      expect(draft.chart).toBe(chart);
      expect(getPivotTableSource(f.workbook, draft.table).headers).toEqual(["Region", "Amount"]);
      expect([...getPivotTableSource(f.workbook, draft.table).records()]).toEqual([
        ["East", 10],
        ["East", 20],
      ]);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      f.actions.confirm(draft);
      expect(f.actions.error.value).toBe(false);
      expect(f.sheet.pivotTables![0]!.source).toEqual({
        start: { row: 0, column: 0 },
        end: { row: 2, column: 1 },
      });
      expect(f.sheet.pivotTables![0]!.sourceTableId).toBe("table");
      expect(f.sheet.drawings).toHaveLength(chart ? 1 : 0);
      const empty = serializeWorkbook(f.workbook);
      expect(
        f.actions.update({
          ...f.sheet.pivotTables![0]!,
          rowFields: [0],
          values: [{ field: 1, aggregate: "sum", caption: "Sum Amount" }],
        }),
      ).toBe(true);
      expect(getCellValue(f.sheet, { row: 3, column: 1 })).toBe(30);
      expect(getCellValue(f.sheet, { row: 4, column: 1 })).toBe(30);
      const snapshot = serializeWorkbook(f.workbook);
      const restored = deserializeWorkbook(snapshot);
      expect(serializeWorkbook(restored)).toEqual(snapshot);
      expect(getCellValue(getActiveSheet(restored), { row: 4, column: 1 })).toBe(30);
      expect(getActiveSheet(restored).drawings).toHaveLength(chart ? 1 : 0);
      expect(getActiveSheet(restored).pivotTables![0]!.sourceTableId).toBe("table");
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.workbook)).toEqual(empty);
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );

  test.each([0, 1, 2, 4])(
    "uses the whole table when selecting row %i across an internal blank",
    (row) => {
      const f = tableFixture({ blankRow: true });
      f.select({ start: { row, column: 1 }, end: { row, column: 1 } });
      f.actions.open();
      const draft = f.actions.editing.value!;
      expect(draft.source).toBe("Table1");
      expect(draft.table.source!.end.row).toBe(3);
      expect([...getPivotTableSource(f.workbook, draft.table).records()]).toEqual([
        ["East", 10],
        [null, null],
        ["East", 20],
      ]);
    },
  );

  test("keeps the last data row when the table has no totals", () => {
    const f = tableFixture({ totalRow: false });
    f.actions.open();
    expect(f.actions.editing.value!.source).toBe("Table1");
    expect(f.actions.editing.value!.table.source!.end.row).toBe(2);
  });

  test("keeps the displayed cache and output through row growth until explicit Refresh", () => {
    const f = configuredTableReport({ totalRow: false });
    const original = serializeWorkbook(f.workbook);
    const cache = f.sheet.pivotTables![0]!.dataCache;
    ["East", 40].forEach((value, column) =>
      setCellContent(f.source, { row: 3, column }, { kind: "literal", value }),
    );
    expect(
      f.execute(
        createResizeTableCommand(f.source.id, "table", {
          start: { row: 0, column: 0 },
          end: { row: 3, column: 1 },
        }),
      ),
    ).toBe(true);
    expect(f.sheet.pivotTables![0]!.source!.end.row).toBe(2);
    expect(f.sheet.pivotTables![0]!.dataCache).toEqual(cache);
    expect(getCellValue(f.sheet, { row: 3, column: 1 })).toBe(30);
    const beforeRefresh = serializeWorkbook(f.workbook);
    f.actions.refresh();
    expect(f.sheet.pivotTables![0]!.source!.end.row).toBe(3);
    expect(f.sheet.pivotTables![0]!.dataCache!.records).toHaveLength(3);
    expect(getCellValue(f.sheet, { row: 3, column: 1 })).toBe(70);
    expect(f.execute.mock.calls.at(-1)![0]).not.toHaveProperty("repairSource");
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(beforeRefresh);
    redoWorkbookCommand(f.session);
    expect(getCellValue(f.sheet, { row: 3, column: 1 })).toBe(70);
    expect(serializeWorkbook(f.workbook)).not.toEqual(original);
  });

  test("resolves the captured named table's live geometry at confirmation", () => {
    const f = tableFixture();
    f.actions.open();
    const draft = f.actions.editing.value!;
    f.source.tables![0]!.range.end.row = 5;
    expect(draft.table.source!.end.row).toBe(2);
    f.actions.confirm(draft);
    expect(f.sheet.pivotTables![0]!.source!.end.row).toBe(4);
    expect(f.sheet.pivotTables![0]!.sourceTableId).toBe("table");
  });

  test("rejects same-name replacement of an unchanged captured-create source until reopening", () => {
    const f = tableFixture();
    const sourceTable = f.source.tables![0]!;
    f.actions.open();
    const draft = f.actions.editing.value!;
    f.execute(createRemoveTableCommand(f.source.id, sourceTable.id));
    f.execute(createCreateTableCommand(f.source.id, { ...sourceTable, id: "replacement" }));
    const before = serializeWorkbook(f.workbook);
    const calls = f.execute.mock.calls.length;
    const history = f.session.history.undoStack.length;
    f.actions.confirm({ ...draft, source: "=tAbLe1" });
    expect(f.actions.error.value).toBe(true);
    expect(f.actions.editing.value).toBe(draft);
    expect(f.execute).toHaveBeenCalledTimes(calls);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(history);
    f.actions.close();
    f.actions.open();
    expect(f.actions.editing.value!.table.sourceTableId).toBe("replacement");
    f.actions.confirm(f.actions.editing.value!);
    expect(f.actions.error.value).toBe(false);
    expect(f.sheet.pivotTables![0]!.sourceTableId).toBe("replacement");
  });

  test.each(["OtherSales", "'Source Data'!A1:B3"])(
    "allows an explicit changed create source %s after the captured table is replaced",
    (source) => {
      const f = tableFixture();
      const sourceTable = f.source.tables![0]!;
      f.actions.open();
      const draft = f.actions.editing.value!;
      f.execute(createRemoveTableCommand(f.source.id, sourceTable.id));
      f.execute(
        createCreateTableCommand(f.source.id, {
          ...sourceTable,
          id: "replacement",
          name: "OtherSales",
        }),
      );
      f.actions.confirm({ ...draft, source });
      expect(f.actions.error.value).toBe(false);
      expect(f.sheet.pivotTables![0]!.sourceTableId).toBe(
        source === "OtherSales" ? "replacement" : undefined,
      );
    },
  );

  test("explicit existing Change Source can repair to a same-name replacement table", () => {
    const f = configuredTableReport();
    const sourceTable = f.source.tables![0]!;
    f.execute(createRemoveTableCommand(f.source.id, sourceTable.id));
    f.execute(createCreateTableCommand(f.source.id, { ...sourceTable, id: "replacement" }));
    f.actions.source();
    expect(f.actions.editing.value!.source).toBe("");
    f.actions.confirm({ ...f.actions.editing.value!, source: "Table1" });
    expect(f.actions.error.value).toBe(false);
    expect(f.sheet.pivotTables![0]!.sourceTableId).toBe("replacement");
    expect(f.execute.mock.calls.at(-1)![0]).toMatchObject({ repairSource: true });
  });

  test.each([false, true])("preserves an explicit selected range, chart=%s", (chart) => {
    const f = tableFixture();
    f.select({ start: { row: 3, column: 1 }, end: { row: 0, column: 0 } });
    f.actions.open(chart);
    expect(f.actions.editing.value!.source).toBe("='Source Data'!$A$1:$B$4");
    expect(f.actions.editing.value!.table.sourceTableId).toBeUndefined();
    expect([...getPivotTableSource(f.workbook, f.actions.editing.value!.table).records()]).toEqual([
      ["East", 10],
      ["East", 20],
      ["Total", 30],
    ]);
  });

  test.each([false, true])("retains ordinary current-region boundaries, blank=%s", (blankRow) => {
    const f = tableFixture({ blankRow });
    f.source.tables = [];
    f.actions.open();
    expect(f.actions.editing.value!.source).toBe(
      blankRow ? "='Source Data'!$A$1:$B$2" : "='Source Data'!$A$1:$B$4",
    );
  });

  test("canceling and reopening insertion leaves workbook and history untouched", () => {
    const f = tableFixture();
    const before = serializeWorkbook(f.workbook);
    for (const chart of [false, true, false]) {
      f.actions.open(chart);
      expect(f.actions.editing.value!.source).toBe("Table1");
      f.actions.close();
      expect(f.actions.editing.value).toBeUndefined();
      expect(f.actions.error.value).toBe(false);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
    }
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("opens the current table name after rename and preserves binding through Move", () => {
    const f = configuredTableReport();
    f.execute(createUpdateTableCommand(f.source.id, "table", { name: "RenamedSales" }));
    f.actions.source();
    expect(f.actions.editing.value!.source).toBe("RenamedSales");
    expect(f.actions.editing.value!.table.sourceTableId).toBe("table");
    f.actions.close();
    f.actions.move();
    const before = serializeWorkbook(f.workbook);
    f.actions.confirm({ ...f.actions.editing.value!, destination: "F1", source: "Missing!A1" });
    expect(f.actions.error.value).toBe(false);
    expect(f.sheet.pivotTables![0]).toMatchObject({
      sourceTableId: "table",
      anchor: { row: 0, column: 5 },
    });
    expect(f.execute.mock.calls.at(-1)![0]).not.toHaveProperty("repairSource");
    undoWorkbookCommand(f.session);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("an explicit A1 source clears binding and retains fixed geometry after table resize", () => {
    const f = configuredTableReport({ totalRow: false });
    f.actions.source();
    f.actions.confirm({ ...f.actions.editing.value!, source: "'Source Data'!A1:B3" });
    expect(f.actions.error.value).toBe(false);
    expect(f.sheet.pivotTables![0]!.sourceTableId).toBeUndefined();
    expect(f.execute.mock.calls.at(-1)![0]).not.toHaveProperty("repairSource");
    ["East", 40].forEach((value, column) =>
      setCellContent(f.source, { row: 3, column }, { kind: "literal", value }),
    );
    f.execute(
      createResizeTableCommand(f.source.id, "table", {
        start: { row: 0, column: 0 },
        end: { row: 3, column: 1 },
      }),
    );
    f.actions.refresh();
    expect(f.sheet.pivotTables![0]!.source!.end.row).toBe(2);
    expect(getCellValue(f.sheet, { row: 3, column: 1 })).toBe(30);
  });

  test.each(["delete", "reorder"] as const)(
    "requires explicit same-table repair after %s, remapping cached header identity",
    (operation) => {
      const f = configuredTableReport();
      if (operation === "delete") f.execute(createDeleteSheetAxisCommand(f.source.id, "column", 1));
      else {
        // Represent an already invalidated, reordered live schema, including its physical headers.
        const table = f.source.tables![0]!;
        table.columns.reverse();
        for (let row = table.range.start.row; row <= table.range.end.row; row++) {
          const first = getCellValue(f.source, { row, column: 0 });
          const second = getCellValue(f.source, { row, column: 1 });
          if (first === null || second === null)
            throw new Error("The reordered source fixture must contain literal values.");
          setCellContent(f.source, { row, column: 0 }, { kind: "literal", value: second });
          setCellContent(f.source, { row, column: 1 }, { kind: "literal", value: first });
        }
        f.sheet.pivotTables![0]!.source = null;
      }
      expect(f.sheet.pivotTables![0]!.source).toBeNull();
      expect(f.sheet.pivotTables![0]!.values[0]!.field).toBe(1);
      expect(f.sheet.pivotTables![0]!.dataCache!.headers).toEqual(["Region", "Amount"]);
      const before = serializeWorkbook(f.workbook);
      f.actions.refresh();
      expect(f.onError).toHaveBeenCalledTimes(1);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      f.actions.source();
      expect(f.actions.editing.value!.source).toBe("Table1");
      expect(f.actions.error.value).toBe(true);
      f.actions.confirm(f.actions.editing.value!);
      expect(f.actions.error.value).toBe(false);
      expect(f.execute.mock.calls.at(-1)![0]).toMatchObject({ repairSource: true });
      const repaired = f.sheet.pivotTables![0]!;
      expect(repaired.sourceTableId).toBe("table");
      expect(repaired.source).not.toBeNull();
      expect(repaired.rowFields).toEqual([operation === "delete" ? 0 : 1]);
      expect(repaired.values).toEqual(
        operation === "delete" ? [] : [{ field: 0, aggregate: "sum", caption: "Sum Amount" }],
      );
      undoWorkbookCommand(f.session);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );

  test("repairs a same-table schema change using live headers without the stale-cache guard", () => {
    const f = configuredTableReport();
    f.source.tables![0]!.columns[1]!.name = "Replacement";
    setCellContent(f.source, { row: 0, column: 1 }, { kind: "literal", value: "Replacement" });
    const before = serializeWorkbook(f.workbook);
    f.actions.refresh();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(f.onError).toHaveBeenCalledTimes(1);
    f.actions.move();
    const calls = f.execute.mock.calls.length;
    expect(() => resolvePivotDraftSource(f.workbook, f.actions.editing.value!)).toThrow();
    f.actions.confirm({ ...f.actions.editing.value!, destination: "F1" });
    expect(f.actions.error.value).toBe(true);
    expect(f.execute).toHaveBeenCalledTimes(calls);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    f.actions.close();
    f.actions.source();
    f.actions.confirm(f.actions.editing.value!);
    expect(f.actions.error.value).toBe(false);
    expect(f.sheet.pivotTables![0]!.values).toEqual([]);
    expect(f.sheet.pivotTables![0]!.dataCache!.headers).toEqual(["Region", "Replacement"]);
    expect(f.execute.mock.calls.at(-1)![0]).toMatchObject({ repairSource: true });
  });

  test("a named source still requires matching physical headers and Core table metadata", () => {
    const f = tableFixture();
    f.actions.open();
    setCellContent(f.source, { row: 0, column: 1 }, { kind: "literal", value: "Changed header" });
    const before = serializeWorkbook(f.workbook);
    f.actions.confirm(f.actions.editing.value!);
    expect(f.actions.error.value).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("a deleted bound table opens an invalid empty source and never falls back to its rectangle", () => {
    const f = configuredTableReport();
    f.execute(createRemoveTableCommand(f.source.id, "table"));
    const before = serializeWorkbook(f.workbook);
    const calls = f.execute.mock.calls.length;
    f.actions.source();
    expect(f.actions.editing.value!.source).toBe("");
    expect(f.actions.error.value).toBe(true);
    f.actions.confirm(f.actions.editing.value!);
    expect(f.actions.error.value).toBe(true);
    expect(f.execute).toHaveBeenCalledTimes(calls);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("recognizes a case-insensitive exact table name only in pivot source resolution", () => {
    const f = tableFixture();
    f.actions.open();
    expect(resolveRangeReference(f.workbook, "Table1", f.source.id)).toBeUndefined();
    expect(
      resolvePivotDraftSource(f.workbook, { ...f.actions.editing.value!, source: "=tAbLe1" }),
    ).toMatchObject({ sourceSheetId: f.source.id, sourceTableId: "table" });
    f.workbook.definedNames.set("global:table1", {
      id: "global:table1",
      name: "TABLE1",
      reference: {
        sheetId: f.source.id,
        start: { row: 0, column: 0 },
        end: { row: 2, column: 1 },
      },
    });
    expect(() => resolvePivotDraftSource(f.workbook, f.actions.editing.value!)).toThrow(
      /Ambiguous/,
    );
    f.source.tables = [];
    expect(resolvePivotDraftSource(f.workbook, f.actions.editing.value!)).toEqual({
      sourceSheetId: f.source.id,
      sourceTableId: undefined,
      source: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
      consolidation: undefined,
    });
  });

  test.each(["deleted", "ambiguous"] as const)(
    "rejects a %s table name without mutation",
    (kind) => {
      const f = tableFixture();
      f.actions.open();
      const draft = f.actions.editing.value!;
      if (kind === "deleted") f.source.tables = [];
      else {
        const other = createSheet("Other", "other");
        other.tables = [{ ...f.source.tables![0]!, id: "other-table", name: "TABLE1" }];
        insertSheet(f.workbook, other);
      }
      const before = serializeWorkbook(f.workbook);
      f.actions.confirm(draft);
      expect(f.actions.error.value).toBe(true);
      expect(f.actions.editing.value).toBeDefined();
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );

  test.each(["consolidation", "pivot"] as const)(
    "%s mode clears a prefilling table identity and preserves fixed-range semantics",
    (sourceKind) => {
      const f = configuredTableReport({ totalRow: false });
      const original = f.sheet.pivotTables![0]!;
      const sourcePivot = { sheetId: f.sheet.id, tableId: original.id };
      f.actions.open();
      const draft = f.actions.editing.value!;
      const source = resolvePivotDraftSource(f.workbook, {
        ...draft,
        table: { ...draft.table, sourceTableId: "table" },
        sourceKind,
        sourcePivot,
        sources: ["'Source Data'!A1:B3"],
      });
      expect(source.sourceTableId).toBeUndefined();
      expect(source.source).toEqual(original.source);
      f.actions.confirm({
        ...draft,
        table: { ...draft.table, sourceTableId: "table" },
        sourceKind,
        sourcePivot,
        sources: ["'Source Data'!A1:B3"],
      });
      expect(f.actions.error.value).toBe(false);
      expect(f.sheet.pivotTables![0]!.sourceTableId).toBeUndefined();
      if (sourceKind === "consolidation")
        expect(f.sheet.pivotTables![0]!.consolidation!.ranges).toHaveLength(1);
    },
  );

  test("accepts Table1 in the real dialog without a disabled confirm or input error", async () => {
    const f = tableFixture();
    f.actions.open();
    const wrapper = mount(PivotTableDialog, {
      attachTo: document.body,
      props: {
        initial: f.actions.editing.value!,
        workbook: f.workbook,
        revision: 0,
        disabled: false,
        error: f.actions.error.value,
        suspended: false,
        selectReference: async () => undefined,
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
    try {
      await flushPromises();
      const dialog = document.querySelector(".pivot-create")!.closest(".t-dialog")!;
      expect(
        dialog.querySelector<HTMLInputElement>(".pivot-create__source input.t-input__inner")!.value,
      ).toBe("Table1");
      expect(dialog.querySelector('[role="alert"]')).toBeNull();
      expect(dialog.querySelector(".t-input--status-error")).toBeNull();
      const confirm = dialog.querySelector<HTMLButtonElement>(
        ".t-dialog__footer .t-button--theme-primary",
      )!;
      expect(confirm.disabled).toBe(false);
      confirm.click();
      await flushPromises();
      expect(wrapper.emitted("confirm")?.[0]?.[0]).toMatchObject({
        source: "Table1",
        table: { sourceTableId: "table" },
      });
    } finally {
      wrapper.unmount();
    }
  });

  test.each([false, true])(
    "requires an explicit header-bearing source for a header-disabled table, chart=%s",
    (chart) => {
      const f = tableFixture({ headerRow: false });
      const before = serializeWorkbook(f.workbook);
      f.actions.open(chart);
      const draft = f.actions.editing.value!;
      expect(draft.source).toBe("");
      expect(draft.table.source).toBeNull();
      expect(f.actions.error.value).toBe(true);
      expect(f.actions.errorReason.value).toBe("invalid");
      f.actions.confirm(draft);
      expect(f.actions.editing.value).toBeDefined();
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      f.actions.close();
      expect(f.actions.error.value).toBe(false);
    },
  );

  test("shows existing invalid-source feedback and disables confirmation for hidden headers", async () => {
    const f = tableFixture({ headerRow: false });
    f.actions.open();
    const wrapper = mount(PivotTableDialog, {
      attachTo: document.body,
      props: {
        initial: f.actions.editing.value!,
        workbook: f.workbook,
        revision: 0,
        disabled: false,
        error: f.actions.error.value,
        errorReason: f.actions.errorReason.value,
        suspended: false,
        selectReference: async () => undefined,
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
    try {
      await flushPromises();
      const dialog = document.querySelector(".pivot-create")!.closest(".t-dialog")!;
      expect(dialog.querySelector('[role="alert"]')!.textContent).toContain("source headers");
      expect(
        dialog.querySelector<HTMLButtonElement>(".t-dialog__footer .t-button--theme-primary")!
          .disabled,
      ).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });
});
