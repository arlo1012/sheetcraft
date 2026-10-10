import { mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSetPivotTableCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createSheet,
  createWorkbook,
  insertSheet,
  setCellContent,
  type Workbook,
} from "@sheetcraft/core/workbook";
import { useSpreadsheetWorkspaceController } from "../../../app/composables/useSpreadsheetWorkspaceController";
import { usePivotActions } from "../../../modules/pivot-tables/usePivotActions";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

function fixture() {
  let workspace!: ReturnType<typeof useSpreadsheetWorkspaceController>;
  let actions!: ReturnType<typeof usePivotActions>;
  const busy = ref(false);
  const generation = ref(0);
  const revision = ref(0);
  const activate = vi.fn();
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
        actions = usePivotActions({
          getWorkbook: () => workbookOverride ?? workspace.session.workbook,
          getSheet: () => workspace.activeSheet.value,
          getRange: () => workspace.activeSelectionRange.value,
          getGeneration: () =>
            workspace.workbookGeneration.value + generation.value + generationOverride,
          getRevision: () => workspace.workbookRevision.value + revision.value,
          isBusy: () => busy.value,
          flush: () => true,
          execute,
          activate,
          name: () => "Sales",
          total: () => "Grand Total",
          empty: () => "(blank)",
          sumCaption: (field) => `Sum ${field}`,
          onError: vi.fn(),
        });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  mounted.push(wrapper);
  const sheet = workspace.activeSheet.value;
  const other = createSheet("Other", "other");
  insertSheet(workspace.session.workbook, other);
  for (const target of [sheet, other]) {
    [
      ["Region", "Amount"],
      ["East", 10],
      ["West", 20],
    ].forEach((row, r) =>
      row.forEach((value, column) =>
        setCellContent(target, { row: r, column }, { kind: "literal", value }),
      ),
    );
  }
  return {
    workspace,
    actions,
    sheet,
    other,
    busy,
    generation,
    revision,
    execute,
    activate,
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
const modes = ["table", "chart", "source", "move"] as const;
type Mode = (typeof modes)[number];

function open(f: Fixture, mode: Mode) {
  if (mode === "source" || mode === "move") {
    if (!f.sheet.pivotTables?.length) {
      expect(
        f.workspace.executeCommand(
          createSetPivotTableCommand(f.sheet.id, {
            id: "report",
            name: "Sales",
            sourceSheetId: f.sheet.id,
            source: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
            anchor: { row: 0, column: 4 },
            outputRange: null,
            rowFields: [0],
            columnFields: [],
            values: [{ field: 1, aggregate: "sum", caption: "Sum Amount" }],
            filters: [],
            rowTotals: true,
            columnTotals: true,
            includeHidden: true,
            sort: "ascending",
            totalLabel: "Grand Total",
            emptyLabel: "(blank)",
          }),
        ),
      ).toBe(true);
    }
    f.actions.open(false, "report", mode);
  } else f.actions.open(mode === "chart");
  const target = f.actions.dialog.value!;
  expect(target).toBeDefined();
  const draft = {
    ...target.initial,
    ...(mode === "source" ? { source: "Other!A1:B3" } : {}),
    ...(mode === "move" ? { destination: `${f.sheet.name}!J1` } : {}),
  };
  return { target, draft, confirm: () => target.confirm(draft), close: target.close };
}

describe("pivot insertion dialog ownership", () => {
  test.each(modes)("canceled %s handlers cannot submit or close a reopened session", (mode) => {
    const f = fixture();
    const old = open(f, mode);
    old.close();
    const current = open(f, mode);
    const before = f.snapshot();
    const history = f.workspace.session.history.undoStack.length;
    f.execute.mockClear();
    old.confirm();
    old.close();
    expect(f.actions.dialog.value).toBe(current.target);
    expect(current.target.dialogId).not.toBe(old.target.dialogId);
    expect(f.actions.error.value).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.activate).not.toHaveBeenCalled();
    expect(f.snapshot()).toEqual(before);
    expect(f.workspace.session.history.undoStack).toHaveLength(history);
  });

  test("rapid source to move reopening of the same report owns a distinct draft and handlers", () => {
    const f = fixture();
    const old = open(f, "source");
    const current = open(f, "move");
    expect(current.target.initial.table.id).toBe(old.target.initial.table.id);
    expect(current.target.dialogId).not.toBe(old.target.dialogId);
    f.execute.mockClear();
    old.confirm();
    old.close();
    f.actions.confirm(old.draft);
    expect(f.actions.dialog.value).toBe(current.target);
    expect(f.actions.editing.value?.mode).toBe("move");
    expect(f.execute).not.toHaveBeenCalled();
    current.confirm();
    expect(f.sheet.pivotTables?.[0]?.anchor).toEqual({ row: 0, column: 9 });
  });

  test.each(modes)(
    "repeated and reentrant %s confirmation records one reversible command",
    (mode) => {
      const f = fixture();
      const dialog = open(f, mode);
      const before = f.snapshot();
      const history = f.workspace.session.history.undoStack.length;
      f.execute.mockClear();
      f.beforeExecute(() => {
        dialog.confirm();
        f.actions.open();
      });
      dialog.confirm();
      dialog.confirm();
      f.beforeExecute();
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.actions.dialog.value).toBeUndefined();
      expect(f.activate).toHaveBeenCalledTimes(1);
      expect(f.workspace.session.history.undoStack).toHaveLength(history + 1);
      const after = f.snapshot();
      f.workspace.undo();
      expect(f.snapshot()).toEqual(before);
      f.workspace.redo();
      expect(f.snapshot()).toEqual(after);
    },
  );

  test.each(modes)("rejected changed %s commands retain the draft and error for retry", (mode) => {
    const f = fixture();
    const dialog = open(f, mode);
    const before = f.snapshot();
    const history = f.workspace.session.history.undoStack.length;
    f.reject(true);
    dialog.confirm();
    expect(f.actions.dialog.value).toBe(dialog.target);
    expect(f.actions.error.value).toBe(true);
    expect(f.activate).not.toHaveBeenCalled();
    expect(f.snapshot()).toEqual(before);
    expect(f.workspace.session.history.undoStack).toHaveLength(history);
    f.reject(false);
    dialog.confirm();
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.actions.error.value).toBe(false);
    expect(f.activate).toHaveBeenCalledTimes(1);
    expect(f.workspace.session.history.undoStack).toHaveLength(history + 1);
  });

  test.each(["source", "move"] as const)(
    "unchanged %s confirmation closes only after Core proves a full-state no-op",
    (mode) => {
      const f = fixture();
      let dialog = open(f, mode);
      dialog.target.confirm(dialog.target.initial);
      dialog = open(f, mode);
      const before = f.snapshot();
      const history = f.workspace.session.history.undoStack.length;
      const report = f.sheet.pivotTables![0]!;
      const cache = report.dataCache;
      f.execute.mockClear();
      f.activate.mockClear();
      dialog.target.confirm(dialog.target.initial);
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.execute.mock.results[0]?.value).toBe(false);
      expect(f.actions.dialog.value).toBeUndefined();
      expect(f.actions.error.value).toBe(false);
      expect(f.activate).not.toHaveBeenCalled();
      expect(f.sheet.pivotTables![0]).toBe(report);
      expect(f.sheet.pivotTables![0]!.dataCache).toBe(cache);
      expect(f.snapshot()).toEqual(before);
      expect(f.workspace.session.history.undoStack).toHaveLength(history);
    },
  );

  test.each(["source value", "output cell"] as const)(
    "rejected unchanged source text with a changed %s retains the draft without mutating actual state",
    (change) => {
      const f = fixture();
      const initial = open(f, "source");
      initial.target.confirm(initial.target.initial);
      const dialog = open(f, "source");
      const report = f.sheet.pivotTables![0]!;
      const cache = report.dataCache;
      const cells = f.sheet.cells;
      const otherCells = f.other.cells;
      setCellContent(
        f.sheet,
        change === "source value" ? { row: 1, column: 1 } : { row: 1, column: 5 },
        { kind: "literal", value: 99 },
      );
      const before = f.snapshot();
      const history = f.workspace.session.history.undoStack.length;
      f.reject(true);
      f.activate.mockClear();
      dialog.target.confirm(dialog.target.initial);
      expect(f.actions.dialog.value).toBe(dialog.target);
      expect(f.actions.error.value).toBe(true);
      expect(f.activate).not.toHaveBeenCalled();
      expect(f.sheet.pivotTables![0]).toBe(report);
      expect(f.sheet.pivotTables![0]!.dataCache).toBe(cache);
      expect(f.sheet.cells).toBe(cells);
      expect(f.other.cells).toBe(otherCells);
      expect(f.snapshot()).toEqual(before);
      expect(f.workspace.session.history.undoStack).toHaveLength(history);
      f.reject(false);
      dialog.target.confirm(dialog.target.initial);
      expect(f.actions.dialog.value).toBeUndefined();
      expect(f.workspace.session.history.undoStack).toHaveLength(history + 1);
    },
  );

  test("protection introduced during execute cannot be mistaken for an unchanged source no-op", () => {
    const f = fixture();
    const initial = open(f, "source");
    initial.target.confirm(initial.target.initial);
    const dialog = open(f, "source");
    f.beforeExecute(() => {
      f.sheet.properties.protected = true;
      f.sheet.protection = { editableRanges: [] };
    });
    f.execute.mockClear();
    f.activate.mockClear();
    const history = f.workspace.session.history.undoStack.length;
    dialog.target.confirm(dialog.target.initial);
    const afterProtection = f.snapshot();
    expect(f.execute.mock.results[0]?.value).toBe(false);
    expect(f.actions.dialog.value).toBe(dialog.target);
    expect(f.actions.errorReason.value).toBe("protected");
    expect(f.activate).not.toHaveBeenCalled();
    expect(f.workspace.session.history.undoStack).toHaveLength(history);
    dialog.target.confirm(dialog.target.initial);
    expect(f.snapshot()).toEqual(afterProtection);
  });

  test("a throwing Core shadow plan retains its rejected draft without changing actual sheets or cache", () => {
    const f = fixture();
    const initial = open(f, "source");
    initial.target.confirm(initial.target.initial);
    const dialog = open(f, "source");
    f.sheet.mergedCells.push({ start: { row: 1, column: 4 }, end: { row: 1, column: 5 } });
    const before = f.snapshot();
    const report = f.sheet.pivotTables![0]!;
    const cache = report.dataCache;
    const history = f.workspace.session.history.undoStack.length;
    f.reject(true);
    f.activate.mockClear();
    dialog.target.confirm(dialog.target.initial);
    expect(f.actions.dialog.value).toBe(dialog.target);
    expect(f.actions.errorReason.value).toBe("merged");
    expect(f.activate).not.toHaveBeenCalled();
    expect(f.sheet.pivotTables![0]).toBe(report);
    expect(f.sheet.pivotTables![0]!.dataCache).toBe(cache);
    expect(f.snapshot()).toEqual(before);
    expect(f.workspace.session.history.undoStack).toHaveLength(history);
  });

  test.each(modes)("busy and protected %s failures retain the captured draft for retry", (mode) => {
    const f = fixture();
    const dialog = open(f, mode);
    const before = f.snapshot();
    const history = f.workspace.session.history.undoStack.length;
    f.execute.mockClear();
    f.busy.value = true;
    dialog.confirm();
    expect(f.actions.dialog.value).toBe(dialog.target);
    expect(f.actions.error.value).toBe(true);
    expect(f.execute).not.toHaveBeenCalled();
    f.busy.value = false;
    if (mode === "table" || mode === "chart")
      f.workspace.session.workbook.structureProtected = true;
    else {
      f.sheet.properties.protected = true;
      f.sheet.protection = { editableRanges: [] };
    }
    dialog.confirm();
    expect(f.actions.dialog.value).toBe(dialog.target);
    expect(f.actions.errorReason.value).toBe("protected");
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.activate).not.toHaveBeenCalled();
    expect(f.workspace.session.history.undoStack).toHaveLength(history);
    f.workspace.session.workbook.structureProtected = false;
    f.sheet.properties.protected = false;
    f.sheet.protection = undefined;
    expect(f.snapshot()).toEqual(before);
    dialog.confirm();
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.workspace.session.history.undoStack).toHaveLength(history + 1);
  });

  test.each(modes)(
    "%s sessions invalidate synchronously on generation and workbook replacement",
    (mode) => {
      for (const replacement of ["generation", "workbook", "identity"] as const) {
        const f = fixture();
        const dialog = open(f, mode);
        f.execute.mockClear();
        if (replacement === "generation") f.generation.value++;
        else {
          const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
          if (replacement === "workbook") f.workspace.replaceWorkbook(workbook);
          else f.workspace.session.workbook = workbook;
        }
        expect(f.actions.dialog.value).toBeUndefined();
        const before = f.snapshot();
        const history = f.workspace.session.history.undoStack.length;
        dialog.confirm();
        dialog.close();
        expect(f.execute).not.toHaveBeenCalled();
        expect(f.activate).not.toHaveBeenCalled();
        expect(f.snapshot()).toEqual(before);
        expect(f.workspace.session.history.undoStack).toHaveLength(history);
      }
    },
  );

  test.each(modes)("%s confirmation checks nonreactive workbook and generation getters", (mode) => {
    for (const replacement of ["generation", "workbook"] as const) {
      const f = fixture();
      const dialog = open(f, mode);
      const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
      if (replacement === "generation") f.advanceUntrackedGeneration();
      else f.replaceUntrackedWorkbook(workbook);
      expect(f.actions.dialog.value).toBe(dialog.target);
      const before = f.snapshot();
      const replacementBefore = serializeWorkbook(workbook);
      const history = f.workspace.session.history.undoStack.length;
      f.execute.mockClear();
      dialog.confirm();
      expect(f.actions.dialog.value).toBeUndefined();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.activate).not.toHaveBeenCalled();
      expect(f.snapshot()).toEqual(before);
      expect(serializeWorkbook(workbook)).toEqual(replacementBefore);
      expect(f.workspace.session.history.undoStack).toHaveLength(history);
    }
  });

  test.each(modes)("%s invalidates removed or same-ID replaced sheets at the revision", (mode) => {
    for (const replacement of [false, true]) {
      const f = fixture();
      const dialog = open(f, mode);
      f.execute.mockClear();
      if (replacement)
        f.workspace.session.workbook.sheets.set(f.sheet.id, createSheet(f.sheet.name, f.sheet.id));
      else f.workspace.session.workbook.sheets.delete(f.sheet.id);
      f.revision.value++;
      expect(f.actions.dialog.value).toBeUndefined();
      const before = f.snapshot();
      dialog.confirm();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.snapshot()).toEqual(before);
    }
  });

  test.each(["source", "move"] as const)(
    "%s invalidates removed or same-ID replaced reports at the revision",
    (mode) => {
      for (const replacement of [false, true]) {
        const f = fixture();
        const dialog = open(f, mode);
        f.execute.mockClear();
        f.sheet.pivotTables = replacement
          ? [{ ...f.sheet.pivotTables![0]!, name: "Replacement" }]
          : [];
        f.revision.value++;
        expect(f.actions.dialog.value).toBeUndefined();
        const before = f.snapshot();
        const history = f.workspace.session.history.undoStack.length;
        dialog.confirm();
        expect(f.execute).not.toHaveBeenCalled();
        expect(f.snapshot()).toEqual(before);
        expect(f.workspace.session.history.undoStack).toHaveLength(history);
      }
    },
  );

  test.each(modes)("unmounted %s sessions discard callbacks and cannot reopen", (mode) => {
    const f = fixture();
    const dialog = open(f, mode);
    const before = f.snapshot();
    const history = f.workspace.session.history.undoStack.length;
    f.execute.mockClear();
    f.unmount();
    dialog.confirm();
    dialog.close();
    f.actions.open();
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.activate).not.toHaveBeenCalled();
    expect(f.snapshot()).toEqual(before);
    expect(f.workspace.session.history.undoStack).toHaveLength(history);
  });

  test.each(modes)("%s retains its captured target while a picker visits another sheet", (mode) => {
    const f = fixture();
    const dialog = open(f, mode);
    f.other.properties.protected = true;
    f.workspace.selectSheet(f.other.id);
    f.execute.mockClear();
    dialog.confirm();
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.other.pivotTables ?? []).toEqual([]);
    expect(f.other.drawings ?? []).toEqual([]);
    if (mode === "source" || mode === "move")
      expect(f.execute.mock.calls[0]?.[0]).toMatchObject({ sheetId: f.sheet.id });
  });

  test.each(modes)("%s does not activate a target invalidated while execute returns", (mode) => {
    const f = fixture();
    const dialog = open(f, mode);
    f.beforeExecute(() => f.generation.value++);
    dialog.confirm();
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.activate).not.toHaveBeenCalled();
  });
});
