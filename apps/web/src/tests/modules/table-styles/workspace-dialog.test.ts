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
import CreateTableDialog from "../../../modules/table-styles/components/CreateTableDialog.vue";
import TableSettingsDialog from "../../../modules/table-styles/components/TableSettingsDialog.vue";
import ResizeTableDialog from "../../../modules/table-styles/components/ResizeTableDialog.vue";
import TableToolsToolbar from "../../../modules/table-styles/components/TableToolsToolbar.vue";
import type {
  CreateTableDraft,
  TableSettingsDraft,
} from "../../../modules/table-styles/table-ui-types";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import RangeReferencePicker from "../../../shared/range-reference/RangeReferencePicker.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

async function fixture() {
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
  await wrapper.get('[data-insert-tool="table"]').trigger("click");
  return { wrapper, source };
}

function listener<T extends (...args: never[]) => void>(
  dialog: Pick<VueWrapper, "vm">,
  name: string,
): T {
  const callback = dialog.vm.$.vnode.props?.[name];
  expect(callback).toBeTypeOf("function");
  return callback as T;
}

describe("table dialog workspace integration", () => {
  test("rapid create reopening resets its draft and late old handlers cannot submit or cancel it", async () => {
    const { wrapper, source } = await fixture();
    const old = wrapper.getComponent(CreateTableDialog);
    const oldConfirm = listener<(draft: CreateTableDraft) => void>(old, "onConfirm");
    const oldCancel = listener<() => void>(old, "onCancel");
    const original = old.props("initial");
    await old.getComponent(RangeReferenceInput).get("input").setValue("D1:E3");
    old.getComponent(Dialog).vm.$emit("close");
    wrapper.get<HTMLButtonElement>('[data-insert-tool="table"]').element.click();
    await nextTick();
    const current = wrapper.getComponent(CreateTableDialog);
    expect(current.vm.$.uid).not.toBe(old.vm.$.uid);
    expect(current.getComponent(RangeReferenceInput).props("modelValue")).toBe(original.range);
    oldConfirm({ ...original, range: "D1:E3" });
    oldCancel();
    await nextTick();
    expect(wrapper.getComponent(CreateTableDialog).vm.$.uid).toBe(current.vm.$.uid);
    expect(source.tables).toEqual([]);
    current.getComponent(Dialog).vm.$emit("confirm");
    current.getComponent(Dialog).vm.$emit("confirm");
    await nextTick();
    expect(wrapper.findComponent(CreateTableDialog).exists()).toBe(false);
    expect(source.tables).toHaveLength(1);
    await wrapper.get('[data-ribbon-category="home"]').trigger("click");
    await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
    expect(source.tables).toEqual([]);
    await wrapper.get('[data-ribbon-action="redo"]').trigger("click");
    expect(source.tables).toHaveLength(1);
  });

  test("picker suspension and cancellation keep the draft and editable captured sheet across navigation", async () => {
    const { wrapper, source } = await fixture();
    const dialog = wrapper.getComponent(CreateTableDialog);
    const input = dialog.getComponent(RangeReferenceInput);
    const original = input.props("modelValue");
    await input.get("[data-select-formula-reference]").trigger("click");
    await flushPromises();
    expect(dialog.props("suspended")).toBe(true);
    expect(dialog.getComponent(Dialog).props("visible")).toBe(false);
    await wrapper.get('[role="tab"][title="Other (double-click to rename)"]').trigger("click");
    const other = wrapper.getComponent(SheetGrid).props("sheet") as Sheet;
    expect(other.id).toBe("other");
    expect(other.properties.protected).toBe(true);
    wrapper.getComponent(RangeReferencePicker).vm.$emit("cancel");
    await flushPromises();
    expect(wrapper.getComponent(CreateTableDialog).vm.$.uid).toBe(dialog.vm.$.uid);
    expect(dialog.props("suspended")).toBe(false);
    expect(input.props("modelValue")).toBe(original);
    dialog.getComponent(Dialog).vm.$emit("confirm");
    await flushPromises();
    expect(wrapper.findComponent(CreateTableDialog).exists()).toBe(false);
    expect(source.tables).toHaveLength(1);
    expect(other.tables).toEqual([]);
    await wrapper.get('[data-ribbon-category="home"]').trigger("click");
    await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
    expect(source.tables).toEqual([]);
    expect(other.tables).toEqual([]);
  });

  test("settings and resize use captured handlers and preserve one undo per confirmation", async () => {
    const { wrapper, source } = await fixture();
    wrapper.getComponent(CreateTableDialog).getComponent(Dialog).vm.$emit("confirm");
    await nextTick();
    await wrapper.get('[data-ribbon-category="table"]').trigger("click");
    let toolbar = wrapper.getComponent(TableToolsToolbar);
    toolbar.vm.$emit("settings");
    await nextTick();
    const oldSettings = wrapper.getComponent(TableSettingsDialog);
    const settingsConfirm = listener<(draft: TableSettingsDraft) => void>(oldSettings, "onConfirm");
    const settingsConvert = listener<() => void>(oldSettings, "onConvert");
    const settingsCancel = listener<() => void>(oldSettings, "onCancel");
    oldSettings.getComponent(Dialog).vm.$emit("close");
    toolbar.vm.$emit("settings");
    await nextTick();
    const settings = wrapper.getComponent(TableSettingsDialog);
    expect(settings.vm.$.uid).not.toBe(oldSettings.vm.$.uid);
    settingsConfirm({ ...oldSettings.props("initial"), name: "Old" });
    settingsConvert();
    settingsCancel();
    await nextTick();
    expect(wrapper.getComponent(TableSettingsDialog).vm.$.uid).toBe(settings.vm.$.uid);
    expect(source.tables?.[0]?.name).toBe("Table1");
    const updated = { ...settings.props("initial"), name: "Sales", totalRow: true };
    settings.vm.$emit("confirm", updated);
    settings.vm.$emit("confirm", updated);
    await nextTick();
    expect(source.tables?.[0]).toMatchObject({ name: "Sales", totalRow: true });
    await wrapper.get('[data-ribbon-category="home"]').trigger("click");
    await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
    expect(source.tables?.[0]).toMatchObject({ name: "Table1", totalRow: false });
    await wrapper.get('[data-ribbon-category="table"]').trigger("click");
    toolbar = wrapper.getComponent(TableToolsToolbar);
    toolbar.vm.$emit("resize");
    await nextTick();
    const oldResize = wrapper.getComponent(ResizeTableDialog);
    const resizeConfirm = listener<(range: string) => void>(oldResize, "onConfirm");
    const resizeCancel = listener<() => void>(oldResize, "onCancel");
    oldResize.getComponent(Dialog).vm.$emit("close");
    toolbar.vm.$emit("resize");
    await nextTick();
    const resize = wrapper.getComponent(ResizeTableDialog);
    expect(resize.vm.$.uid).not.toBe(oldResize.vm.$.uid);
    resizeConfirm("A1:B6");
    resizeCancel();
    await nextTick();
    expect(wrapper.getComponent(ResizeTableDialog).vm.$.uid).toBe(resize.vm.$.uid);
    expect(source.tables?.[0]?.range.end.row).toBe(2);
    resize.vm.$emit("confirm", "A1:B4");
    resize.vm.$emit("confirm", "A1:B4");
    await nextTick();
    expect(source.tables?.[0]?.range.end.row).toBe(3);
    await wrapper.get('[data-ribbon-category="home"]').trigger("click");
    await wrapper.get('[data-ribbon-action="undo"]').trigger("click");
    expect(source.tables?.[0]?.range.end.row).toBe(2);
  });
});
