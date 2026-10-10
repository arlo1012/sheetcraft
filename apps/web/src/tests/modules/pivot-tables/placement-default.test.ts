import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createPivotSheetCommand } from "@sheetcraft/core/commands";
import { redoWorkbookCommand, undoWorkbookCommand } from "@sheetcraft/core/history";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { createSheet, getActiveSheet, getCellValue, insertSheet } from "@sheetcraft/core/workbook";
import PivotTableDialog from "../../../modules/pivot-tables/components/PivotTableDialog.vue";
import type { PivotDraft } from "../../../modules/pivot-tables/usePivotActions";
import { createAppI18n } from "../../../shared/i18n";
import { fixture } from "./fixture";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

function mountPlacementDialog(f: ReturnType<typeof fixture>) {
  const wrapper = mount(PivotTableDialog, {
    attachTo: document.body,
    props: {
      initial: f.actions.editing.value!,
      workbook: f.workbook,
      revision: 0,
      disabled: false,
      error: false,
      suspended: false,
      selectReference: async () => undefined,
      onConfirm: (draft: PivotDraft) => f.actions.confirm(draft),
      onClose: () => f.actions.close(),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}

function editor() {
  return new DOMWrapper(document.querySelector(".pivot-create")!);
}

async function chooseLocation(value: "new" | "existing") {
  await new DOMWrapper(
    editor().get(`input[type="radio"][value="${value}"]`).element.closest("label")!,
  ).trigger("click");
  await flushPromises();
}

async function confirmDialog() {
  editor()
    .element.closest(".t-dialog")!
    .querySelector<HTMLButtonElement>(".t-dialog__footer .t-button--theme-primary")!
    .click();
  await flushPromises();
}

describe("Web PivotTable new-worksheet placement", () => {
  test.each([false, true])("creates an A3 report with atomic history, chart=%s", (chart) => {
    const f = fixture();
    const before = serializeWorkbook(f.workbook);
    f.actions.open(chart);
    expect(f.actions.editing.value).toMatchObject({
      newSheet: true,
      destination: "",
      chart,
      table: { anchor: { row: 2, column: 0 } },
    });
    f.actions.confirm(f.actions.editing.value!);
    const report = f.sheet.pivotTables![0]!;
    expect(report.anchor).toEqual({ row: 2, column: 0 });
    expect(report.outputRange).toBeNull();
    expect(f.sheet.cells.size).toBe(0);
    expect(f.sheet.drawings).toHaveLength(chart ? 1 : 0);
    if (chart) {
      expect(f.sheet.drawings![0]).toMatchObject({
        kind: "chart",
        anchor: { row: 2 },
        chart: { pivotTableId: report.id, range: null },
      });
    }
    expect(f.session.history.undoStack).toHaveLength(1);
    const empty = serializeWorkbook(f.workbook);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(empty);
    expect(
      f.actions.update({
        ...f.sheet.pivotTables![0]!,
        rowFields: [0],
        values: [{ field: 2, aggregate: "sum", caption: "Amount" }],
      }),
    ).toBe(true);
    expect(f.sheet.pivotTables![0]!.outputRange).toEqual({
      start: { row: 2, column: 0 },
      end: { row: 5, column: 1 },
    });
    expect(getCellValue(f.sheet, { row: 0, column: 0 })).toBeNull();
    expect(getCellValue(f.sheet, { row: 1, column: 0 })).toBeNull();
    expect(getCellValue(f.sheet, { row: 3, column: 1 })).toBe(30);
    expect(getCellValue(f.sheet, { row: 5, column: 1 })).toBe(70);
    if (chart)
      expect(f.sheet.drawings![0]).toMatchObject({
        chart: { range: f.sheet.pivotTables![0]!.outputRange },
      });
    const configured = serializeWorkbook(f.workbook);
    expect(serializeWorkbook(deserializeWorkbook(configured))).toEqual(configured);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(empty);
    expect(redoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(configured);
  });

  test.each([false, true])(
    "keeps an explicit existing-sheet A1 after toggling destinations, chart=%s",
    async (chart) => {
      const f = fixture();
      const output = createSheet("Output", "output");
      insertSheet(f.workbook, output);
      f.actions.open(chart);
      mountPlacementDialog(f);
      await flushPromises();
      await chooseLocation("existing");
      await editor().get(".pivot-create__destination input").setValue("Output!$A$1");
      await chooseLocation("new");
      await chooseLocation("existing");
      await confirmDialog();
      expect(f.actions.error.value).toBe(false);
      expect(f.actions.editing.value).toBeUndefined();
      expect(f.workbook.sheets.size).toBe(2);
      expect(output.pivotTables![0]!.anchor).toEqual({ row: 0, column: 0 });
      expect(output.drawings).toHaveLength(chart ? 1 : 0);
      expect(f.session.history.undoStack).toHaveLength(1);
    },
  );

  test.each([false, true])(
    "returns to the A3 default after entering an existing-sheet address, chart=%s",
    async (chart) => {
      const f = fixture();
      f.actions.open(chart);
      mountPlacementDialog(f);
      await flushPromises();
      await chooseLocation("existing");
      await editor().get(".pivot-create__destination input").setValue("'Source Data'!E1");
      await chooseLocation("new");
      await confirmDialog();
      expect(f.actions.error.value).toBe(false);
      expect(f.actions.editing.value).toBeUndefined();
      expect(f.sheet.id).not.toBe(f.source.id);
      expect(f.sheet.pivotTables![0]!.anchor).toEqual({ row: 2, column: 0 });
      expect(f.source.pivotTables ?? []).toEqual([]);
      expect(f.sheet.drawings).toHaveLength(chart ? 1 : 0);
      expect(f.session.history.undoStack).toHaveLength(1);
    },
  );

  test.each([false, true])(
    "canceling changed placement and reopening neither edits nor adds history, chart=%s",
    async (chart) => {
      const f = fixture();
      const before = serializeWorkbook(f.workbook);
      f.actions.open(chart);
      const stale = f.actions.editing.value!;
      const oldConfirm = f.actions.dialog.value!.confirm;
      const wrapper = mountPlacementDialog(f);
      await flushPromises();
      await editor().get(".pivot-create__destination input").setValue("'Source Data'!E1");
      editor()
        .element.closest(".t-dialog")!
        .querySelector<HTMLButtonElement>(".t-dialog__footer .t-button--theme-default")!
        .click();
      await flushPromises();
      expect(f.actions.editing.value).toBeUndefined();
      wrapper.unmount();
      mounted.splice(mounted.indexOf(wrapper), 1);
      f.actions.open(chart);
      expect(f.actions.editing.value).toMatchObject({
        newSheet: true,
        destination: "",
        table: { anchor: { row: 2, column: 0 } },
      });
      oldConfirm(stale);
      expect(f.execute).not.toHaveBeenCalled();
      f.actions.close();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
    },
  );

  test.each(["Output!A1", "='Output'!$B$7", "E1"])(
    "preserves the exact explicit existing-sheet destination %s",
    (destination) => {
      const f = fixture();
      const output = createSheet("Output", "output");
      insertSheet(f.workbook, output);
      f.actions.open();
      f.actions.confirm({ ...f.actions.editing.value!, newSheet: false, destination });
      expect(f.actions.error.value).toBe(false);
      const target = destination === "E1" ? f.source : output;
      expect(target.pivotTables![0]!.anchor).toEqual(
        destination === "E1"
          ? { row: 0, column: 4 }
          : destination.includes("B")
            ? { row: 6, column: 1 }
            : { row: 0, column: 0 },
      );
      expect(f.workbook.sheets.size).toBe(2);
    },
  );

  test("Core A1 targets and older saved A1 reports are not relocated", () => {
    const f = fixture();
    f.actions.open();
    const table = { ...f.actions.editing.value!.table, anchor: { row: 0, column: 0 } };
    f.actions.close();
    expect(
      f.execute(createPivotSheetCommand(f.workbook, table, { id: "legacy", name: "Legacy" })),
    ).toBe(true);
    expect(f.sheet.pivotTables![0]!.anchor).toEqual({ row: 0, column: 0 });
    const snapshot = serializeWorkbook(f.workbook);
    const restored = deserializeWorkbook({ ...snapshot, version: 42 });
    expect(getActiveSheet(restored).pivotTables![0]!.anchor).toEqual({ row: 0, column: 0 });
    f.selectOutput();
    f.actions.source();
    expect(f.actions.editing.value!.table.anchor).toEqual({ row: 0, column: 0 });
    f.actions.confirm(f.actions.editing.value!);
    expect(f.sheet.pivotTables![0]!.anchor).toEqual({ row: 0, column: 0 });
    expect(f.session.history.undoStack).toHaveLength(1);
    f.actions.move();
    expect(f.actions.editing.value!.destination).toBe("=Legacy!$A$1");
    f.actions.close();
    expect(f.sheet.pivotTables![0]!.anchor).toEqual({ row: 0, column: 0 });
  });

  test.each([false, true])(
    "structure protection rejects A3 creation atomically, chart=%s",
    (chart) => {
      const f = fixture();
      f.actions.open(chart);
      f.workbook.structureProtected = true;
      const before = serializeWorkbook(f.workbook);
      f.actions.confirm(f.actions.editing.value!);
      expect(f.actions.error.value).toBe(true);
      expect(f.actions.errorReason.value).toBe("protected");
      expect(f.actions.editing.value).toBeDefined();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );
});
