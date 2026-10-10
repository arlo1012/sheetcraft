import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  insertSheet,
  setCellContent,
  type Sheet,
} from "@sheetcraft/core/workbook";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import SheetGrid from "../../../modules/sheet-grid/components/SheetGrid.vue";
import PivotTableDialog from "../../../modules/pivot-tables/components/PivotTableDialog.vue";
import PivotAnalysisToolbar from "../../../modules/pivot-tables/components/PivotAnalysisToolbar.vue";
import WorkbookFileActions from "../../../modules/workbook-persistence/components/WorkbookFileActions.vue";
import WorkbookFileFeedback from "../../../modules/workbook-persistence/components/WorkbookFileFeedback.vue";
import type { PivotDraft } from "../../../modules/pivot-tables/usePivotActions";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import RangeReferencePicker from "../../../shared/range-reference/RangeReferencePicker.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

async function fixture(chart = false) {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  [
    ["Region", "Amount"],
    ["East", 10],
    ["West", 20],
  ].forEach((row, r) =>
    row.forEach((value, column) =>
      setCellContent(sheet, { row: r, column }, { kind: "literal", value }),
    ),
  );
  const other = createSheet("Other", "other");
  other.properties.protected = true;
  insertSheet(workbook, other);
  const wrapper = mount(SpreadsheetWorkspace, {
    attachTo: document.body,
    props: {
      workbookStore: {
        load: async () => ({ revision: 1, savedAt: 1, snapshot: serializeWorkbook(workbook) }),
        save: vi.fn(async () => ({ revision: 2, savedAt: 2 })),
        replace: async () => ({ revision: 2, savedAt: 2 }),
      },
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await flushPromises();
  const source = wrapper.getComponent(SheetGrid).props("sheet") as Sheet;
  await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
  const selector = `[data-insert-tool="${chart ? "pivot-chart" : "pivot-table"}"]`;
  await wrapper.get(selector).trigger("click");
  return { wrapper, source, selector };
}

function listener<T extends (...args: never[]) => void>(
  dialog: Pick<VueWrapper, "vm">,
  name: string,
): T {
  const callback = dialog.vm.$.vnode.props?.[name];
  expect(callback).toBeTypeOf("function");
  return callback as T;
}

describe("pivot dialog workspace integration", () => {
  test.each([false, true])(
    "rapid Insert reopening binds only the current draft and creates one undoable chart=%s command",
    async (chart) => {
      const { wrapper, source, selector } = await fixture(chart);
      const old = wrapper.getComponent(PivotTableDialog);
      const oldConfirm = listener<(draft: PivotDraft) => void>(old, "onConfirm");
      const oldClose = listener<() => void>(old, "onClose");
      const oldPick = old.props("selectReference");
      const initial = old.props("initial");
      await old.findAllComponents(RangeReferenceInput)[0]!.get("input").setValue("D1:E3");
      old.getComponent(Dialog).vm.$emit("close");
      wrapper.get<HTMLButtonElement>(selector).element.click();
      await nextTick();
      const current = wrapper.getComponent(PivotTableDialog);
      expect(current.vm.$.uid).not.toBe(old.vm.$.uid);
      expect(current.findAllComponents(RangeReferenceInput)[0]!.props("modelValue")).toBe(
        initial.source,
      );
      oldConfirm({ ...initial, source: "D1:E3" });
      oldClose();
      expect(await oldPick("A1")).toBeUndefined();
      await nextTick();
      expect(wrapper.getComponent(PivotTableDialog).vm.$.uid).toBe(current.vm.$.uid);
      expect(wrapper.findComponent(RangeReferencePicker).exists()).toBe(false);
      expect(source.pivotTables ?? []).toEqual([]);
      current.getComponent(Dialog).vm.$emit("confirm");
      current.getComponent(Dialog).vm.$emit("confirm");
      await flushPromises();
      expect(wrapper.findComponent(PivotTableDialog).exists()).toBe(false);
      const output = wrapper.getComponent(SheetGrid).props("sheet") as Sheet;
      expect(output.id).not.toBe(source.id);
      expect(output.pivotTables).toHaveLength(1);
      expect(output.drawings).toHaveLength(Number(chart));
      await wrapper.get('[data-ribbon-category="home"]').trigger("click");
      await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
      expect((wrapper.getComponent(SheetGrid).props("sheet") as Sheet).id).toBe(source.id);
      expect(source.pivotTables ?? []).toEqual([]);
      await wrapper.get('[data-ribbon-action="redo"]').trigger("click");
      const restored = wrapper.getComponent(SheetGrid).props("sheet") as Sheet;
      expect(restored.pivotTables).toHaveLength(1);
      expect(restored.drawings).toHaveLength(Number(chart));
    },
  );

  test("rapid same-report source to move reopening remounts the real dialog and ignores old events", async () => {
    const { wrapper, source } = await fixture();
    const create = wrapper.getComponent(PivotTableDialog);
    await create.findAllComponents(RangeReferenceInput)[1]!.get("input").setValue("E1");
    create.getComponent(Dialog).vm.$emit("confirm");
    await flushPromises();
    expect(source.pivotTables?.[0]?.anchor).toEqual({ row: 0, column: 4 });
    await wrapper.get('[data-ribbon-category="pivot-analysis"]').trigger("click");
    const toolbar = wrapper.getComponent(PivotAnalysisToolbar);
    toolbar.vm.$emit("source");
    await nextTick();
    const old = wrapper.getComponent(PivotTableDialog);
    const oldConfirm = listener<(draft: PivotDraft) => void>(old, "onConfirm");
    const oldClose = listener<() => void>(old, "onClose");
    await old.getComponent(RangeReferenceInput).get("input").setValue("Sheet1!A1:B8");
    old.getComponent(Dialog).vm.$emit("close");
    toolbar.vm.$emit("move");
    await nextTick();
    const current = wrapper.getComponent(PivotTableDialog);
    expect(current.vm.$.uid).not.toBe(old.vm.$.uid);
    expect(current.props("initial").table.id).toBe(old.props("initial").table.id);
    expect(current.props("initial").mode).toBe("move");
    expect(current.findAllComponents(RangeReferenceInput)).toHaveLength(1);
    expect(current.getComponent(RangeReferenceInput).props("modelValue")).toBe("=Sheet1!$E$1");
    oldConfirm({ ...old.props("initial"), source: "Sheet1!A1:B8" });
    oldClose();
    await nextTick();
    expect(wrapper.getComponent(PivotTableDialog).vm.$.uid).toBe(current.vm.$.uid);
    await current.getComponent(RangeReferenceInput).get("input").setValue("J1");
    current.getComponent(Dialog).vm.$emit("confirm");
    current.getComponent(Dialog).vm.$emit("confirm");
    await flushPromises();
    expect(source.pivotTables?.[0]?.anchor).toEqual({ row: 0, column: 9 });
    expect(source.pivotTables?.[0]?.source).toEqual({
      start: { row: 0, column: 0 },
      end: { row: 2, column: 1 },
    });
    await wrapper.get('[data-ribbon-category="home"]').trigger("click");
    await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
    expect(source.pivotTables?.[0]?.anchor).toEqual({ row: 0, column: 4 });
    await wrapper.get('[data-ribbon-action="redo"]').trigger("click");
    expect(source.pivotTables?.[0]?.anchor).toEqual({ row: 0, column: 9 });
  });

  test("picker suspension retains the captured editable sheet while viewing a protected sheet", async () => {
    const { wrapper, source } = await fixture();
    const dialog = wrapper.getComponent(PivotTableDialog);
    const sourceInput = dialog.findAllComponents(RangeReferenceInput)[0]!;
    const original = sourceInput.props("modelValue");
    await sourceInput.get("[data-select-formula-reference]").trigger("click");
    await flushPromises();
    expect(dialog.props("suspended")).toBe(true);
    expect(dialog.getComponent(Dialog).props("visible")).toBe(false);
    await wrapper.get('[role="tab"][title="Other (double-click to rename)"]').trigger("click");
    const other = wrapper.getComponent(SheetGrid).props("sheet") as Sheet;
    expect(other.id).toBe("other");
    wrapper.getComponent(RangeReferencePicker).vm.$emit("cancel");
    await flushPromises();
    expect(wrapper.getComponent(PivotTableDialog).vm.$.uid).toBe(dialog.vm.$.uid);
    expect(dialog.props("suspended")).toBe(false);
    expect(sourceInput.props("modelValue")).toBe(original);
    await dialog.findAllComponents(RangeReferenceInput)[1]!.get("input").setValue("Sheet1!E1");
    dialog.getComponent(Dialog).vm.$emit("confirm");
    await flushPromises();
    expect(wrapper.findComponent(PivotTableDialog).exists()).toBe(false);
    expect(source.pivotTables).toHaveLength(1);
    expect(other.pivotTables ?? []).toEqual([]);
    expect(other.drawings ?? []).toEqual([]);
    await wrapper.get('[data-ribbon-category="home"]').trigger("click");
    await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
    expect(source.pivotTables).toEqual([]);
    expect(other.pivotTables ?? []).toEqual([]);
  });

  test("same-ID workbook reload discards an old dialog and its callbacks before reopening", async () => {
    const { wrapper, source, selector } = await fixture();
    const old = wrapper.getComponent(PivotTableDialog);
    const oldConfirm = listener<(draft: PivotDraft) => void>(old, "onConfirm");
    const oldClose = listener<() => void>(old, "onClose");
    const oldPick = old.props("selectReference");
    wrapper.getComponent(WorkbookFileActions).vm.$emit("reload");
    await nextTick();
    wrapper.getComponent(WorkbookFileFeedback).vm.$emit("confirm");
    await flushPromises();
    expect(wrapper.findComponent(PivotTableDialog).exists()).toBe(false);
    const replacement = wrapper.getComponent(SheetGrid).props("sheet") as Sheet;
    expect(replacement.id).toBe(source.id);
    expect(replacement).not.toBe(source);
    await wrapper.get(selector).trigger("click");
    const current = wrapper.getComponent(PivotTableDialog);
    oldConfirm(old.props("initial"));
    oldClose();
    expect(await oldPick("A1")).toBeUndefined();
    await nextTick();
    expect(wrapper.getComponent(PivotTableDialog).vm.$.uid).toBe(current.vm.$.uid);
    expect(replacement.pivotTables ?? []).toEqual([]);
    expect(source.pivotTables ?? []).toEqual([]);
    expect(wrapper.findComponent(RangeReferencePicker).exists()).toBe(false);
  });

  test("protected creation keeps the real component draft and feedback until a successful retry", async () => {
    const { wrapper, source } = await fixture();
    const dialog = wrapper.getComponent(PivotTableDialog);
    const input = dialog.findAllComponents(RangeReferenceInput)[0]!;
    await input.get("input").setValue("Sheet1!A1:B3");
    dialog.props("workbook").structureProtected = true;
    dialog.getComponent(Dialog).vm.$emit("confirm");
    await nextTick();
    expect(wrapper.getComponent(PivotTableDialog).vm.$.uid).toBe(dialog.vm.$.uid);
    expect(dialog.props("error")).toBe(true);
    expect(dialog.props("errorReason")).toBe("protected");
    expect(input.props("modelValue")).toBe("Sheet1!A1:B3");
    expect(source.pivotTables ?? []).toEqual([]);
    dialog.props("workbook").structureProtected = false;
    dialog.getComponent(Dialog).vm.$emit("confirm");
    await flushPromises();
    expect(wrapper.findComponent(PivotTableDialog).exists()).toBe(false);
    expect((wrapper.getComponent(SheetGrid).props("sheet") as Sheet).pivotTables).toHaveLength(1);
    await wrapper.get('[data-ribbon-category="home"]').trigger("click");
    await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
    expect((wrapper.getComponent(SheetGrid).props("sheet") as Sheet).id).toBe(source.id);
  });

  test("ordinary sheet navigation invalidates old events synchronously before another Insert opens", async () => {
    const { wrapper, source, selector } = await fixture();
    const old = wrapper.getComponent(PivotTableDialog);
    const oldConfirm = listener<(draft: PivotDraft) => void>(old, "onConfirm");
    const oldClose = listener<() => void>(old, "onClose");
    wrapper
      .get<HTMLButtonElement>('[role="tab"][title="Other (double-click to rename)"]')
      .element.click();
    oldConfirm(old.props("initial"));
    wrapper.get<HTMLButtonElement>(selector).element.click();
    await nextTick();
    const current = wrapper.getComponent(PivotTableDialog);
    expect(current.vm.$.uid).not.toBe(old.vm.$.uid);
    expect(current.props("initial").referenceSheetId).toBe("other");
    oldClose();
    await nextTick();
    expect(wrapper.getComponent(PivotTableDialog).vm.$.uid).toBe(current.vm.$.uid);
    expect(source.pivotTables ?? []).toEqual([]);
  });
});
