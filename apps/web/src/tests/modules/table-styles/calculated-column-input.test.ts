import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createCreateTableCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createBuiltinTableStyles } from "@sheetcraft/core/table-styles";
import { createWorkbook, getCellContent, setCellContent } from "@sheetcraft/core/workbook";
import { createSheetGridViewState } from "@sheetcraft/sheet-engine/view-state";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import { useTableStylesController } from "../../../modules/table-styles/useTableStylesController";
import { createAppI18n } from "../../../shared/i18n";
import { useCellEditSession } from "../../../shared/cell-editing/useCellEditSession";
import WorkbookFormulaBar from "../../../modules/workbook/components/WorkbookFormulaBar.vue";
import CellEditor from "../../../modules/sheet-grid/components/CellEditor.vue";
import CalculatedColumnDialog from "../../../modules/table-styles/components/CalculatedColumnDialog.vue";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

function fixture() {
  let workspace!: ReturnType<typeof useSpreadsheetWorkspaceController>;
  let tables!: ReturnType<typeof useTableStylesController>;
  const busy = ref(false);
  let reject = false;
  const execute = vi.fn((command: WorkbookCommand) =>
    reject ? false : workspace.executeCommand(command),
  );
  const host = mount(
    defineComponent({
      setup() {
        workspace = useSpreadsheetWorkspaceController({ idFactory: createSequentialIdFactory() });
        tables = useTableStylesController({
          getWorkbook: () => workspace.session.workbook,
          getSheet: () => workspace.activeSheet.value,
          getAddress: () => workspace.activeAddress.value,
          getSelection: () => workspace.activeSelectionRange.value,
          getGeneration: () => workspace.workbookGeneration.value,
          getRevision: () => workspace.workbookRevision.value,
          isBusy: () => busy.value,
          finishEditing: () => true,
          execute,
          focus: vi.fn(),
        });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  mounted.push(host);
  const sheet = workspace.activeSheet.value;
  for (let row = 1; row <= 3; row++)
    setCellContent(sheet, { row, column: 1 }, { kind: "literal", value: row + 1 });
  workspace.executeCommand(
    createCreateTableCommand(sheet.id, {
      id: "sales",
      name: "Sales",
      range: { start: { row: 0, column: 0 }, end: { row: 3, column: 2 } },
      columns: ["Item", "Qty", "Result"].map((name, index) => ({ id: `col-${index}`, name })),
      style: createBuiltinTableStyles()[1]!,
      headerRow: true,
      totalRow: false,
      firstColumn: false,
      lastColumn: false,
      bandedRows: true,
      bandedColumns: false,
      filterButton: true,
      filter: null,
    }),
  );
  const address = { row: 1, column: 2 };
  workspace.updateActiveSheetViewState(
    createSheetGridViewState({
      selection: { active: address, anchor: address, focus: address, mode: "cells" },
    }),
  );
  const edit = useCellEditSession({ onCommit: workspace.commitCell });
  return {
    workspace,
    tables,
    sheet,
    address,
    edit,
    busy,
    execute,
    setReject(value: boolean) {
      reject = value;
    },
    snapshot: () => serializeWorkbook(workspace.session.workbook),
  };
}

describe("calculated-column Web editing and explicit replacement", () => {
  test("accepting an original-cell warning keeps manual origin without silently bypassing another member's rule", () => {
    const f = fixture();
    f.sheet.dataValidations = [
      {
        id: "original-warning",
        range: { start: f.address, end: f.address },
        type: "whole",
        operator: "between",
        formula1: "1",
        formula2: "3",
        errorStyle: "warning",
        allowBlank: false,
      },
    ];
    expect(f.workspace.commitCell({ address: f.address, input: "=B2*2" })).toBe(false);
    expect(f.workspace.validationFeedback.value?.style).toBe("warning");
    expect(f.workspace.acceptValidationInput()).toBe(true);
    expect(getCellContent(f.sheet, { row: 3, column: 2 })).toMatchObject({
      formula: { source: "=B4*2" },
    });
  });
  test("manual editor commit fills the empty column in one undoable transaction", () => {
    const f = fixture();
    const before = f.snapshot();
    f.edit.begin(
      { sheetId: f.sheet.id, address: f.address, input: "" },
      { surface: "grid", mode: "replace" },
    );
    f.edit.setDraft("=B2*2");
    expect(f.edit.finish()).toBe(true);
    expect(f.sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBe("=B2*2");
    expect(getCellContent(f.sheet, { row: 3, column: 2 })).toMatchObject({
      formula: { source: "=B4*2" },
    });
    f.workspace.undo();
    expect(f.snapshot()).toEqual(before);
  });

  test.each(["grid", "formula-bar"] as const)(
    "native %s paste followed by Enter remains target-only",
    async (surface) => {
      const f = fixture();
      const wrapper =
        surface === "grid"
          ? mount(CellEditor, {
              props: {
                modelValue: "",
                addressLabel: "C2",
                displayValue: "",
                editing: true,
                composing: false,
                wrapText: false,
                cellRect: { x: 0, y: 0, width: 80, height: 24 },
                viewportSize: { width: 400, height: 300 },
                editSession: f.edit,
                "onUpdate:modelValue": (value: string) => f.edit.setDraft(value),
              },
              global: { plugins: [createAppI18n("en-US")] },
            })
          : mount(WorkbookFormulaBar, {
              props: {
                address: f.address,
                addressLabel: "C2",
                inputValue: "",
                sheetId: f.sheet.id,
                editSession: f.edit,
              },
              global: { plugins: [createAppI18n("en-US")] },
            });
      mounted.push(wrapper);
      f.edit.begin(
        { sheetId: f.sheet.id, address: f.address, input: "" },
        { surface, mode: "replace" },
      );
      const input = wrapper.get("textarea");
      await input.trigger("focus");
      await input.trigger("paste");
      await input.setValue("=B2*2");
      expect(f.edit.finish()).toBe(true);
      expect(getCellContent(f.sheet, f.address)).toMatchObject({ formula: { source: "=B2*2" } });
      expect(getCellContent(f.sheet, { row: 2, column: 2 })).toBeNull();
      expect(f.sheet.tables![0]!.columns[2]!.calculatedColumnFormula).toBeUndefined();
    },
  );

  test("existing values and single-cell exceptions remain until an explicit whole-column apply", () => {
    const f = fixture();
    setCellContent(f.sheet, { row: 2, column: 2 }, { kind: "literal", value: 99 });
    expect(f.workspace.commitCell({ address: f.address, input: "=B2*2" })).toBe(true);
    expect(getCellContent(f.sheet, { row: 2, column: 2 })).toMatchObject({ value: 99 });
    expect(getCellContent(f.sheet, { row: 3, column: 2 })).toBeNull();
    const before = f.snapshot();
    f.tables.openCalculatedColumn();
    expect(f.tables.calculatedColumnTarget.value).toMatchObject({
      initial: "=B2*2",
      rangeLabel: "C2:C4",
      anchorLabel: "C2",
    });
    f.tables.calculatedColumnTarget.value!.confirm("=B2*3");
    expect(f.tables.modalOpen.value).toBe(false);
    expect(getCellContent(f.sheet, { row: 2, column: 2 })).toMatchObject({
      formula: { source: "=B3*3" },
    });
    const after = f.snapshot();
    f.workspace.undo();
    expect(f.snapshot()).toEqual(before);
    f.workspace.redo();
    expect(f.snapshot()).toEqual(after);
  });

  test("cancel and denied/invalid apply retain the correct draft target without writing", () => {
    const f = fixture();
    const before = f.snapshot();
    f.tables.openCalculatedColumn();
    const old = f.tables.calculatedColumnTarget.value!;
    old.cancel();
    old.confirm("=B2*2");
    expect(f.snapshot()).toEqual(before);
    f.tables.openCalculatedColumn();
    const target = f.tables.calculatedColumnTarget.value!;
    f.setReject(true);
    target.confirm("=B2*2");
    expect(f.tables.calculatedColumnTarget.value).toBe(target);
    expect(f.tables.error.value).not.toBe("");
    expect(f.snapshot()).toEqual(before);
    f.setReject(false);
    target.confirm("99");
    expect(f.snapshot()).toEqual(before);
    target.confirm("=B2*");
    expect(f.tables.error.value).toBe("Enter a valid formula beginning with =.");
    expect(f.tables.calculatedColumnTarget.value).toBe(target);
    expect(f.snapshot()).toEqual(before);
    target.confirm("=B2*2");
    expect(f.tables.modalOpen.value).toBe(false);
  });

  test("permission denial, newer workbook edits, repeated confirm and document replacement cannot reuse a stale target", () => {
    const f = fixture();
    f.tables.openCalculatedColumn();
    let target = f.tables.calculatedColumnTarget.value!;
    const before = f.snapshot();
    f.sheet.properties.protected = true;
    target.confirm("=B2*2");
    expect(getCellContent(f.sheet, f.address)).toBeNull();
    f.sheet.properties.protected = false;
    expect(f.snapshot()).toEqual(before);
    f.workspace.commitCell({ address: { row: 8, column: 8 }, input: "Newer" });
    const newer = f.snapshot();
    target.confirm("=B2*2");
    expect(f.snapshot()).toEqual(newer);
    expect(f.tables.error.value).toContain("changed");
    target.cancel();
    f.tables.openCalculatedColumn();
    target = f.tables.calculatedColumnTarget.value!;
    target.confirm("=B2*2");
    const applied = f.snapshot();
    target.confirm("=B2*3");
    expect(f.snapshot()).toEqual(applied);
    f.tables.openCalculatedColumn();
    target = f.tables.calculatedColumnTarget.value!;
    f.workspace.replaceWorkbook(createWorkbook({ idFactory: createSequentialIdFactory() }));
    const replaced = f.snapshot();
    target.confirm("=B2*3");
    expect(f.snapshot()).toEqual(replaced);
    expect(f.tables.modalOpen.value).toBe(false);
  });

  test("whole-column dialog describes overwrite scope and preserves its formula draft on rejected confirmation", async () => {
    const wrapper = mount(CalculatedColumnDialog, {
      props: {
        initial: "=B2*2",
        tableName: "Sales",
        columnName: "Result",
        rangeLabel: "C2:C4",
        anchorLabel: "C2",
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(wrapper);
    expect(wrapper.text()).toContain(
      "existing values, formulas, blank exceptions and filtered rows",
    );
    const input = wrapper.get("textarea");
    await input.setValue("=B2*3");
    const dialog = wrapper.findComponent({ name: "TDialog" });
    dialog.vm.$emit("confirm");
    await wrapper.setProps({ error: "Denied" });
    await nextTick();
    expect(wrapper.get("textarea").element.value).toBe("=B2*3");
    expect(wrapper.get('[role="alert"]').text()).toBe("Denied");
  });
});
