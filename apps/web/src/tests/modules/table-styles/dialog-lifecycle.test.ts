import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createSheet,
  createWorkbook,
  setCellContent,
  type Workbook,
} from "@sheetcraft/core/workbook";
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
  const busy = ref(false);
  const generation = ref(0);
  const focus = vi.fn();
  let reject = false;
  let workbookOverride: Workbook | undefined;
  let generationOverride = 0;
  let beforeExecute: (() => void) | undefined;
  const execute = vi.fn((command: WorkbookCommand) => {
    beforeExecute?.();
    return reject ? false : workspace.executeCommand(command);
  });
  const wrapper = mount(
    defineComponent({
      setup() {
        workspace = useSpreadsheetWorkspaceController({ idFactory: createSequentialIdFactory() });
        tables = useTableStylesController({
          getWorkbook: () => workbookOverride ?? workspace.session.workbook,
          getSheet: () => workspace.activeSheet.value,
          getAddress: () => workspace.activeAddress.value,
          getSelection: () => workspace.activeSelectionRange.value,
          getGeneration: () =>
            workspace.workbookGeneration.value + generation.value + generationOverride,
          getRevision: () => workspace.workbookRevision.value,
          isBusy: () => busy.value,
          finishEditing: () => true,
          execute,
          focus,
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
    busy,
    generation,
    execute,
    focus,
    reject(value: boolean) {
      reject = value;
    },
    beforeExecute(value?: () => void) {
      beforeExecute = value;
    },
    unmount() {
      mounted.splice(mounted.indexOf(wrapper), 1);
      wrapper.unmount();
    },
    replaceUntrackedWorkbook(value: Workbook) {
      workbookOverride = value;
    },
    advanceUntrackedGeneration() {
      generationOverride++;
    },
    snapshot: () => serializeWorkbook(workspace.session.workbook),
  };
}

type Fixture = ReturnType<typeof fixture>;
const modes = ["create", "appearance", "settings", "resize", "convert"] as const;
type Mode = (typeof modes)[number];

function open(f: Fixture, mode: Mode) {
  if (mode === "create" || mode === "appearance") {
    f.tables.requestCreate();
    const target = f.tables.createTarget.value!;
    const draft = {
      ...f.tables.createInitial.value!,
      ...(mode === "appearance" ? { mode: "styleOnly" as const } : {}),
    };
    return {
      target,
      confirm: () => target.confirm(draft),
      cancel: target.cancel,
      current: () => f.tables.createTarget.value,
    };
  }
  if (!f.sheet.tables?.length) {
    f.tables.requestCreate();
    f.tables.confirmCreate(f.tables.createInitial.value!);
  }
  if (mode === "resize") {
    f.tables.openResize();
    const target = f.tables.resizeTarget.value!;
    return {
      target,
      confirm: () => target.confirm("A1:B4"),
      cancel: target.cancel,
      current: () => f.tables.resizeTarget.value,
    };
  }
  f.tables.openSettings();
  const target = f.tables.settingsTarget.value!;
  return {
    target,
    confirm:
      mode === "convert"
        ? target.convert
        : () => target.confirm({ ...target.initial, name: "Sales", totalRow: true }),
    cancel: target.cancel,
    current: () => f.tables.settingsTarget.value,
  };
}

const failed = "Unable to apply the table settings. Check the name and range.";
describe("table dialog ownership", () => {
  test.each(modes)("unmounted %s dialogs discard callbacks and pending focus", async (mode) => {
    const f = fixture();
    const dialog = open(f, mode);
    const before = f.snapshot();
    const history = f.workspace.session.history.undoStack.length;
    f.execute.mockClear();
    f.unmount();
    dialog.confirm();
    dialog.cancel();
    await nextTick();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.focus).not.toHaveBeenCalled();
    expect(f.tables.modalOpen.value).toBe(false);
    expect(f.snapshot()).toEqual(before);
    expect(f.workspace.session.history.undoStack).toHaveLength(history);
  });

  test("ignores confirmations after cancellation even through the direct controller API", () => {
    const f = fixture();
    f.tables.requestCreate();
    const draft = f.tables.createInitial.value!;
    f.tables.close();
    expect(() => f.tables.confirmCreate(draft)).not.toThrow();
    expect(() =>
      f.tables.confirmSettings({
        name: "Sales",
        range: "A1:B3",
        headerRow: true,
        totalRow: false,
        firstColumn: false,
        lastColumn: false,
        bandedRows: true,
        bandedColumns: false,
        filterButton: true,
      }),
    ).not.toThrow();
    expect(() => f.tables.confirmResize("A1:B4")).not.toThrow();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.workspace.session.history.undoStack).toHaveLength(0);
  });

  test.each(modes)("canceled %s handlers cannot submit or close a reopened dialog", (mode) => {
    const f = fixture();
    const old = open(f, mode);
    old.cancel();
    const current = open(f, mode);
    const before = f.snapshot();
    const history = f.workspace.session.history.undoStack.length;
    f.execute.mockClear();
    old.confirm();
    old.cancel();
    expect(current.current()).toBe(current.target);
    expect(f.tables.modalOpen.value).toBe(true);
    expect(f.tables.error.value).toBe("");
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.snapshot()).toEqual(before);
    expect(f.workspace.session.history.undoStack).toHaveLength(history);
  });

  test.each(modes)(
    "%s confirmation creates one reversible history entry despite repeats",
    (mode) => {
      const f = fixture();
      const dialog = open(f, mode);
      const before = f.snapshot();
      const history = f.workspace.session.history.undoStack.length;
      f.execute.mockClear();
      f.beforeExecute(dialog.confirm);
      dialog.confirm();
      dialog.confirm();
      f.beforeExecute();
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.tables.modalOpen.value).toBe(false);
      expect(f.workspace.session.history.undoStack).toHaveLength(history + 1);
      const after = f.snapshot();
      f.workspace.undo();
      expect(f.snapshot()).toEqual(before);
      f.workspace.redo();
      expect(f.snapshot()).toEqual(after);
    },
  );

  test.each(modes)(
    "%s rechecks nonreactive workbook and generation getters at confirmation",
    (mode) => {
      for (const replacement of ["generation", "workbook"] as const) {
        const f = fixture();
        const dialog = open(f, mode);
        f.execute.mockClear();
        const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
        if (replacement === "generation") f.advanceUntrackedGeneration();
        else f.replaceUntrackedWorkbook(workbook);
        // Getter contracts do not require reactivity. Safety cannot depend on watch flushing.
        expect(f.tables.modalOpen.value).toBe(true);
        const before = f.snapshot();
        const replacementBefore = serializeWorkbook(workbook);
        const history = f.workspace.session.history.undoStack.length;
        dialog.confirm();
        expect(f.execute).not.toHaveBeenCalled();
        expect(f.tables.modalOpen.value).toBe(false);
        expect(f.snapshot()).toEqual(before);
        expect(serializeWorkbook(workbook)).toEqual(replacementBefore);
        expect(f.workspace.session.history.undoStack).toHaveLength(history);
      }
    },
  );

  test.each(modes)(
    "busy and protected %s targets retain a retryable draft without commands",
    (mode) => {
      const f = fixture();
      const dialog = open(f, mode);
      const before = f.snapshot();
      const history = f.workspace.session.history.undoStack.length;
      f.execute.mockClear();
      f.busy.value = true;
      dialog.confirm();
      expect(f.execute).not.toHaveBeenCalled();
      expect(dialog.current()).toBe(dialog.target);
      expect(f.tables.error.value).toBe(failed);
      f.busy.value = false;
      f.sheet.properties.protected = true;
      // These permissions do not authorize Core's structured-table commands.
      f.sheet.protection = { editableRanges: [], formatCells: true, editObjects: true };
      dialog.confirm();
      expect(f.execute).not.toHaveBeenCalled();
      expect(dialog.current()).toBe(dialog.target);
      expect(f.workspace.session.history.undoStack).toHaveLength(history);
      f.sheet.properties.protected = false;
      f.sheet.protection = undefined;
      expect(f.snapshot()).toEqual(before);
      dialog.confirm();
      expect(f.tables.modalOpen.value).toBe(false);
      expect(f.workspace.session.history.undoStack).toHaveLength(history + 1);
    },
  );

  test.each(modes)(
    "rejected %s commands preserve ownership and error for a successful retry",
    (mode) => {
      const f = fixture();
      const dialog = open(f, mode);
      const before = f.snapshot();
      const history = f.workspace.session.history.undoStack.length;
      f.reject(true);
      dialog.confirm();
      expect(dialog.current()).toBe(dialog.target);
      expect(f.tables.error.value).toBe(failed);
      expect(f.snapshot()).toEqual(before);
      expect(f.workspace.session.history.undoStack).toHaveLength(history);
      f.reject(false);
      dialog.confirm();
      expect(f.tables.modalOpen.value).toBe(false);
      expect(f.workspace.session.history.undoStack).toHaveLength(history + 1);
    },
  );

  test.each(modes)(
    "%s drafts are invalid immediately on generation or same-ID workbook replacement",
    (mode) => {
      for (const replacement of ["generation", "workbook", "identity"] as const) {
        const f = fixture();
        const dialog = open(f, mode);
        f.execute.mockClear();
        if (replacement === "generation") f.generation.value++;
        else {
          const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
          expect([...workbook.sheets.keys()][0]).toBe(f.sheet.id);
          if (replacement === "workbook") f.workspace.replaceWorkbook(workbook);
          else f.workspace.session.workbook = workbook;
        }
        expect(f.tables.modalOpen.value).toBe(false);
        const before = f.snapshot();
        const history = f.workspace.session.history.undoStack.length;
        dialog.confirm();
        expect(f.execute).not.toHaveBeenCalled();
        expect(f.snapshot()).toEqual(before);
        expect(f.workspace.session.history.undoStack).toHaveLength(history);
      }
    },
  );

  test.each(modes)("%s rejects removed and same-ID replaced target sheets", (mode) => {
    for (const replacement of [false, true]) {
      const f = fixture();
      const dialog = open(f, mode);
      f.execute.mockClear();
      if (replacement)
        f.workspace.session.workbook.sheets.set(f.sheet.id, createSheet(f.sheet.name, f.sheet.id));
      else f.workspace.session.workbook.sheets.delete(f.sheet.id);
      const before = f.snapshot();
      const history = f.workspace.session.history.undoStack.length;
      dialog.confirm();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.tables.modalOpen.value).toBe(false);
      expect(f.snapshot()).toEqual(before);
      expect(f.workspace.session.history.undoStack).toHaveLength(history);
    }
  });

  test.each(["settings", "resize", "convert"] as const)(
    "%s rejects removed and same-ID replaced tables",
    (mode) => {
      for (const replacement of [false, true]) {
        const f = fixture();
        const dialog = open(f, mode);
        f.execute.mockClear();
        f.sheet.tables = replacement ? [{ ...f.sheet.tables![0]!, name: "Replacement" }] : [];
        const before = f.snapshot();
        const history = f.workspace.session.history.undoStack.length;
        dialog.confirm();
        expect(f.execute).not.toHaveBeenCalled();
        expect(f.tables.modalOpen.value).toBe(false);
        expect(f.snapshot()).toEqual(before);
        expect(f.workspace.session.history.undoStack).toHaveLength(history);
      }
    },
  );

  test.each(modes)("%s keeps its captured target while the picker visits another sheet", (mode) => {
    const f = fixture();
    const dialog = open(f, mode);
    const other = createSheet("Other", "other");
    other.properties.protected = true;
    f.workspace.session.workbook.sheets.set(other.id, other);
    f.workspace.selectSheet(other.id);
    const before = f.snapshot();
    const history = f.workspace.session.history.undoStack.length;
    f.execute.mockClear();
    dialog.confirm();
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.execute.mock.calls[0]?.[0]).toMatchObject({ sheetId: f.sheet.id });
    expect(f.tables.modalOpen.value).toBe(false);
    expect(other.tables).toEqual([]);
    expect(f.workspace.session.history.undoStack).toHaveLength(history + 1);
    f.workspace.undo();
    expect(f.snapshot()).toEqual(before);
  });
});
