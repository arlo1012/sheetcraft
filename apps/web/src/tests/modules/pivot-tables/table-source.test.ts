import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { applyWorkbookCommand, createCreateTableCommand } from "@sheetcraft/core/commands";
import { undoWorkbookCommand } from "@sheetcraft/core/history";
import { getPivotTableSource } from "@sheetcraft/core/pivot-tables";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
import {
  getActiveSheet,
  getCellValue,
  setCellContent,
  type CellRange,
} from "@sheetcraft/core/workbook";
import PivotTableDialog from "../../../modules/pivot-tables/components/PivotTableDialog.vue";
import { usePivotActions } from "../../../modules/pivot-tables/usePivotActions";
import { createAppI18n } from "../../../shared/i18n";
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
      name: "StructuredSales",
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
      expect(draft.source).toBe("='Source Data'!$A$1:$B$3");
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
      expect(f.sheet.drawings).toHaveLength(chart ? 1 : 0);
      const empty = serializeWorkbook(f.workbook);
      expect(
        f.actions.update({
          ...f.sheet.pivotTables![0]!,
          rowFields: [0],
          values: [{ field: 1, aggregate: "sum", caption: "Sum Amount" }],
        }),
      ).toBe(true);
      expect(getCellValue(f.sheet, { row: 1, column: 1 })).toBe(30);
      expect(getCellValue(f.sheet, { row: 2, column: 1 })).toBe(30);
      const snapshot = serializeWorkbook(f.workbook);
      const restored = deserializeWorkbook(snapshot);
      expect(serializeWorkbook(restored)).toEqual(snapshot);
      expect(getCellValue(getActiveSheet(restored), { row: 2, column: 1 })).toBe(30);
      expect(getActiveSheet(restored).drawings).toHaveLength(chart ? 1 : 0);
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
      expect(draft.source).toBe("='Source Data'!$A$1:$B$4");
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
    expect(f.actions.editing.value!.source).toBe("='Source Data'!$A$1:$B$3");
  });

  test("captures a range without linking it to later table growth", () => {
    const f = tableFixture();
    f.actions.open();
    const draft = f.actions.editing.value!;
    f.source.tables![0]!.range.end.row = 5;
    expect(draft.table.source!.end.row).toBe(2);
    f.actions.confirm(draft);
    expect(f.sheet.pivotTables![0]!.source!.end.row).toBe(2);
  });

  test.each([false, true])("preserves an explicit selected range, chart=%s", (chart) => {
    const f = tableFixture();
    f.select({ start: { row: 3, column: 1 }, end: { row: 0, column: 0 } });
    f.actions.open(chart);
    expect(f.actions.editing.value!.source).toBe("='Source Data'!$A$1:$B$4");
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
      expect(f.actions.editing.value!.source).toBe("='Source Data'!$A$1:$B$3");
      f.actions.close();
      expect(f.actions.editing.value).toBeUndefined();
      expect(f.actions.error.value).toBe(false);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
    }
    expect(f.execute).not.toHaveBeenCalled();
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
