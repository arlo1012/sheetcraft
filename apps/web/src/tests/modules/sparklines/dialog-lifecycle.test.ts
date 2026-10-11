import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref, shallowRef } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WorkbookDomainError } from "@sheetcraft/core/errors";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  getCellSparkline,
  insertSheet,
  setCellContent,
} from "@sheetcraft/core/workbook";
import SparklineDialog from "../../../modules/sparklines/components/SparklineDialog.vue";
import {
  useSparklineActions,
  type SparklineDraft,
} from "../../../modules/sparklines/useSparklineActions";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
function fixture() {
  const workbook = createWorkbook({ id: "sparkline-lifecycle", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  for (let row = 0; row < 2; row++)
    for (let column = 0; column < 3; column++)
      setCellContent(sheet, { row, column }, { kind: "literal", value: (row + 1) * (column + 2) });
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const currentWorkbook = shallowRef(workbook);
  const currentSheet = shallowRef(sheet);
  const range = ref({ start: { row: 0, column: 0 }, end: { row: 1, column: 2 } });
  const generation = ref(0);
  const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) =>
    executeWorkbookCommand(session, command),
  );
  let actions!: ReturnType<typeof useSparklineActions>;
  const wrapper = mount(
    defineComponent({
      setup() {
        const options = {
          getWorkbook: () => currentWorkbook.value,
          getSheet: () => currentSheet.value,
          getRange: () => range.value,
          getGeneration: () => generation.value,
          flush: () => true,
          isBusy: () => false,
          execute,
        };
        actions = useSparklineActions(options);
        // The fallback reproduces the old concrete production binding before the fix.
        const binding = actions as typeof actions & {
          dialog?: {
            value?: {
              dialogId: number;
              initial: SparklineDraft;
              confirm: (value: SparklineDraft) => void;
              close: () => void;
            };
          };
        };
        return () => {
          const target = binding.dialog?.value;
          const initial = target?.initial ?? actions.draft.value;
          return initial
            ? h(SparklineDialog, {
                key: target?.dialogId,
                initial,
                disabled: false,
                error: actions.error.value,
                failed: actions.failed.value,
                suspended: false,
                selectReference: async () => undefined,
                onConfirm: target?.confirm ?? actions.confirm,
                onClose: target?.close ?? actions.close,
              })
            : null;
        };
      },
    }),
    { attachTo: document.body, global: { plugins: [createAppI18n("en-US")] } },
  );
  mounted.push(wrapper);
  return {
    workbook,
    sheet,
    session,
    currentWorkbook,
    currentSheet,
    generation,
    range,
    actions,
    wrapper,
    execute,
  };
}
function callbacks(f: ReturnType<typeof fixture>) {
  const p = f.wrapper.getComponent(SparklineDialog).vm.$.vnode.props!;
  return {
    confirm: p.onConfirm as (value: SparklineDraft) => void,
    close: p.onClose as () => void,
  };
}
function snapshot(f: ReturnType<typeof fixture>) {
  return serializeWorkbook(f.session.workbook);
}
function changed(f: ReturnType<typeof fixture>): SparklineDraft {
  return {
    ...f.actions.draft.value!,
    source: "A1:C2",
    destination: "D1:D2",
    sparkline: { ...f.actions.draft.value!.sparkline, color: "#00aa66", markers: true },
  };
}
async function open(f: ReturnType<typeof fixture>) {
  f.actions.open();
  await nextTick();
}

describe("sparkline concrete dialog bounded lifecycle", () => {
  test("disposed owner makes retained confirmation inert", async () => {
    const f = fixture();
    await open(f);
    const old = callbacks(f);
    const value = changed(f);
    const before = snapshot(f);
    f.wrapper.unmount();
    old.confirm(value);
    old.close();
    await nextTick();
    expect(f.execute).not.toHaveBeenCalled();
    expect(snapshot(f)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
  test("real Core unchanged confirmation is false without adding history and still closes", async () => {
    const f = fixture();
    await open(f);
    f.wrapper.getComponent(SparklineDialog).vm.$emit("confirm", changed(f));
    await nextTick();
    f.range.value = { start: { row: 0, column: 3 }, end: { row: 0, column: 3 } };
    await open(f);
    const before = snapshot(f);
    const depth = f.session.history.undoStack.length;
    f.wrapper.getComponent(SparklineDialog).vm.$emit("confirm", f.actions.draft.value!);
    await nextTick();
    expect(f.execute.mock.results.at(-1)?.value).toBe(false);
    expect(snapshot(f)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(depth);
    expect(f.wrapper.findComponent(SparklineDialog).exists()).toBe(false);
  });
  test("real Core protection refusal at execute boundary keeps fields, instance and command history", async () => {
    const f = fixture();
    await open(f);
    const current = f.wrapper.getComponent(SparklineDialog);
    const uid = current.vm.$.uid;
    const inputs = f.wrapper.findAll(".sparkline-dialog input");
    await inputs[0]!.setValue("A1:C2");
    await inputs[1]!.setValue("D1:D2");
    let beforeCore!: ReturnType<typeof serializeWorkbook>;
    let refusal: string | undefined;
    // Ordinary locked targets are blocked by the controller's precheck. This hook
    // injects a permission revocation between that check and the actual Core guard.
    f.execute.mockImplementation((command) => {
      f.sheet.properties.protected = true;
      f.sheet.protection = { formatCells: true, editableRanges: [] };
      beforeCore = snapshot(f);
      try {
        return executeWorkbookCommand(f.session, command);
      } catch (error) {
        if (error instanceof WorkbookDomainError && error.data.code === "sheet_protected") {
          refusal = error.data.code;
          return false;
        }
        throw error;
      }
    });
    current.vm.$emit("confirm", changed(f));
    await nextTick();
    expect(refusal).toBe("sheet_protected");
    expect(snapshot(f)).toEqual(beforeCore);
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(f.session.history.redoStack).toHaveLength(0);
    expect(f.wrapper.getComponent(SparklineDialog).vm.$.uid).toBe(uid);
    expect(f.actions.error.value).toBe(true);
    expect(f.wrapper.get('[role="alert"]').text()).toContain("Your draft is kept");
    expect(
      f.wrapper
        .findAll(".sparkline-dialog input")
        .slice(0, 2)
        .map((e) => (e.element as HTMLInputElement).value),
    ).toEqual(["A1:C2", "D1:D2"]);
    f.sheet.properties.protected = false;
    f.execute.mockImplementation((command) => executeWorkbookCommand(f.session, command));
    current.vm.$emit("confirm", changed(f));
    await nextTick();
    expect(f.wrapper.findComponent(SparklineDialog).exists()).toBe(false);
    expect(f.session.history.undoStack).toHaveLength(1);
  });
  test.each(["confirm", "close"] as const)(
    "obsolete %s cannot affect a newly reopened dialog",
    async (action) => {
      const f = fixture();
      await open(f);
      const old = callbacks(f);
      const value = changed(f);
      old.close();
      await nextTick();
      await open(f);
      const uid = f.wrapper.getComponent(SparklineDialog).vm.$.uid;
      const before = snapshot(f);
      if (action === "confirm") old.confirm(value);
      else old.close();
      await nextTick();
      expect(snapshot(f)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.wrapper.getComponent(SparklineDialog).vm.$.uid).toBe(uid);
    },
  );
  test("same-address open replaces local fields with a fresh keyed instance", async () => {
    const f = fixture();
    await open(f);
    const uid = f.wrapper.getComponent(SparklineDialog).vm.$.uid;
    await f.wrapper.findAll(".sparkline-dialog input")[0]!.setValue("Unsaved invalid range");
    f.actions.open();
    await nextTick();
    expect(f.wrapper.getComponent(SparklineDialog).vm.$.uid).not.toBe(uid);
    expect(
      (f.wrapper.findAll(".sparkline-dialog input")[0]!.element as HTMLInputElement).value,
    ).toBe(f.actions.draft.value!.source);
  });
  test.each(["generation", "sheet", "workbook"] as const)(
    "context %s invalidates the mounted dialog and old callbacks",
    async (context) => {
      const f = fixture();
      await open(f);
      const old = callbacks(f);
      const value = changed(f);
      if (context === "generation") f.generation.value++;
      if (context === "sheet") {
        const other = createSheet("Other", "other");
        insertSheet(f.workbook, other);
        f.currentSheet.value = other;
      }
      if (context === "workbook") {
        const replacement = createWorkbook({ id: "replacement", sheetId: f.sheet.id });
        f.session.workbook = replacement;
        f.currentWorkbook.value = replacement;
        f.currentSheet.value = getActiveSheet(replacement);
      }
      const before = snapshot(f);
      old.confirm(value);
      await nextTick();
      expect(snapshot(f)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(f.wrapper.findComponent(SparklineDialog).exists()).toBe(false);
    },
  );
  test("thrown confirmation keeps same local fields and no command history", async () => {
    const f = fixture();
    await open(f);
    const uid = f.wrapper.getComponent(SparklineDialog).vm.$.uid;
    await f.wrapper.findAll(".sparkline-dialog input")[0]!.setValue("A1:C2");
    const before = snapshot(f);
    f.execute.mockImplementation(() => {
      throw new Error("Synthetic executor failure");
    });
    f.wrapper.getComponent(SparklineDialog).vm.$emit("confirm", changed(f));
    await nextTick();
    expect(f.wrapper.getComponent(SparklineDialog).vm.$.uid).toBe(uid);
    expect(f.actions.error.value).toBe(true);
    expect(snapshot(f)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
  test("reentrant new dialog survives older successful confirmation", async () => {
    const f = fixture();
    await open(f);
    const old = callbacks(f);
    const value = changed(f);
    f.execute.mockImplementation((command) => {
      const accepted = executeWorkbookCommand(f.session, command);
      f.actions.open();
      return accepted;
    });
    old.confirm(value);
    await nextTick();
    expect(f.actions.draft.value).toBeDefined();
    expect(f.wrapper.findComponent(SparklineDialog).exists()).toBe(true);
    expect(getCellSparkline(f.sheet, { row: 0, column: 3 })?.color).toBe("#00aa66");
    expect(f.session.history.undoStack).toHaveLength(1);
  });
  test("locked targets are denied before execute without losing draft", async () => {
    const f = fixture();
    await open(f);
    const value = changed(f);
    f.sheet.properties.protected = true;
    f.sheet.protection = { formatCells: true, editableRanges: [] };
    const before = snapshot(f);
    f.wrapper.getComponent(SparklineDialog).vm.$emit("confirm", value);
    await nextTick();
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.draft.value).toBeDefined();
    expect(f.actions.error.value).toBe(true);
    expect(snapshot(f)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
  });
});
