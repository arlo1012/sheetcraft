import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSetSheetFilterCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { setCellContent } from "@sheetcraft/core/workbook";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import { useTableStylesController } from "../../../modules/table-styles/useTableStylesController";
import { createAppI18n } from "../../../shared/i18n";
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function fixture() {
  let workspace!: ReturnType<typeof useSpreadsheetWorkspaceController>;
  let tables!: ReturnType<typeof useTableStylesController>;
  let reject = true;
  const execute = vi.fn((command: WorkbookCommand) =>
    reject ? false : workspace.executeCommand(command),
  );
  const wrapper = mount(
    defineComponent({
      setup() {
        workspace = useSpreadsheetWorkspaceController({
          idFactory: createSequentialIdFactory(),
        });
        tables = useTableStylesController({
          getWorkbook: () => workspace.session.workbook,
          getSheet: () => workspace.activeSheet.value,
          getAddress: () => workspace.activeAddress.value,
          getSelection: () => workspace.activeSelectionRange.value,
          getGeneration: () => workspace.workbookGeneration.value,
          getRevision: () => workspace.workbookRevision.value,
          isBusy: () => false,
          finishEditing: () => true,
          execute,
          focus: vi.fn(),
        });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  mounted.push(wrapper);
  const sheet = workspace.activeSheet.value;
  [
    ["Region", "Amount"],
    ["East", 10],
    ["West", 20],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(sheet, { row: r, column }, { kind: "literal", value }),
    ),
  );
  return {
    workspace,
    tables,
    sheet,
    execute,
    setReject(value: boolean) {
      reject = value;
    },
    snapshot: () => serializeWorkbook(workspace.session.workbook),
  };
}
const failed = "Unable to apply the table settings. Check the name and range.";
describe("rejected table commands", () => {
  test("rejected creation retains its dialog and error without modifying the workbook or history", () => {
    const f = fixture();
    f.tables.requestCreate();
    const draft = {
      ...f.tables.createInitial.value!,
      range: "A1:B3",
      hasHeaders: true,
    };
    const before = f.snapshot();
    f.tables.confirmCreate(draft);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.tables.modalOpen.value).toBe(true);
    expect(f.tables.createInitial.value).toBeDefined();
    expect(f.tables.error.value).toBe(failed);
    expect(f.snapshot()).toEqual(before);
    expect(f.workspace.session.history.undoStack).toHaveLength(0);
    f.setReject(false);
    f.tables.confirmCreate(draft);
    expect(f.tables.modalOpen.value).toBe(false);
    expect(f.sheet.tables).toHaveLength(1);
    expect(f.workspace.session.history.undoStack).toHaveLength(1);
  });
  test("rejected settings preserve the captured table and dialog for a successful retry", () => {
    const f = fixture();
    f.setReject(false);
    f.tables.requestCreate();
    f.tables.confirmCreate({
      ...f.tables.createInitial.value!,
      range: "A1:B3",
      hasHeaders: true,
    });
    f.tables.openSettings();
    const target = f.tables.settingsTarget.value!;
    const draft = { ...target.initial, name: "Sales", bandedColumns: true };
    const before = f.snapshot();
    const history = f.workspace.session.history.undoStack.length;
    f.setReject(true);
    f.tables.confirmSettings(draft);
    expect(f.tables.modalOpen.value).toBe(true);
    expect(f.tables.settingsTarget.value).toBe(target);
    expect(f.tables.error.value).toBe(failed);
    expect(f.snapshot()).toEqual(before);
    expect(f.workspace.session.history.undoStack).toHaveLength(history);
    f.setReject(false);
    f.tables.confirmSettings(draft);
    expect(f.tables.modalOpen.value).toBe(false);
    expect(f.sheet.tables?.[0]).toMatchObject({
      name: "Sales",
      bandedColumns: true,
    });
    expect(f.workspace.session.history.undoStack).toHaveLength(history + 1);
  });
  test("actual advanced-filter row rejection retains settings target, draft, snapshot and history with a clear message", () => {
    const f = fixture();
    f.setReject(false);
    f.tables.requestCreate();
    f.tables.confirmCreate({ ...f.tables.createInitial.value!, range: "A1:B3", hasHeaders: true });
    f.workspace.executeCommand(
      createSetSheetFilterCommand(f.sheet.id, {
        range: f.sheet.tables![0]!.range,
        columns: [],
        advanced: { uniqueOnly: false, hiddenRows: [{ start: 1, end: 1 }] },
      }),
    );
    f.tables.openSettings();
    const target = f.tables.settingsTarget.value!;
    const draft = { ...target.initial, headerRow: false, name: "DraftSales" };
    const before = f.snapshot();
    const history = f.workspace.session.history.undoStack.length;
    f.tables.confirmSettings(draft);
    expect(f.tables.modalOpen.value).toBe(true);
    expect(f.tables.settingsTarget.value).toBe(target);
    expect(draft).toMatchObject({ headerRow: false, name: "DraftSales" });
    expect(f.tables.error.value).toBe(
      "This row change cannot preserve the active advanced filter. Clear that filter first. Your data is unchanged.",
    );
    expect(f.snapshot()).toEqual(before);
    expect(f.workspace.session.history.undoStack).toHaveLength(history);
    f.tables.confirmSettings({ ...draft, headerRow: true });
    expect(f.tables.modalOpen.value).toBe(false);
    expect(f.sheet.tables![0]!.name).toBe("DraftSales");
  });
});
