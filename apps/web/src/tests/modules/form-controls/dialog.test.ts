import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { applyWorkbookCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { createWorkbook, getActiveSheet, createSheetEvaluator } from "@sheetcraft/core/workbook";
import type { SheetControlDrawing } from "@sheetcraft/core/sheet-drawings";
import FormControlDialog from "../../../modules/form-controls/components/FormControlDialog.vue";
import { useFormControlActions } from "../../../modules/form-controls/useFormControlActions";
import { createAppI18n } from "../../../shared/i18n";
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function fixture() {
  const workbook = createWorkbook({ id: "dialog", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  let rejected = true;
  const execute = vi.fn((command: WorkbookCommand): unknown =>
    rejected ? false : applyWorkbookCommand(workbook, command),
  );
  const actions = useFormControlActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getAddress: () => ({ row: 0, column: 0 }),
    getEvaluator: () => createSheetEvaluator(sheet),
    isBusy: () => false,
    flush: () => true,
    execute,
    name: () => "Control",
  });
  const host = defineComponent({
    setup: () => () => {
      const current = actions.dialog.value;
      return current
        ? h(FormControlDialog, {
            key: current.dialogId,
            drawing: current.initial,
            disabled: false,
            sheetName: sheet.name,
            error: actions.error.value,
            suspended: false,
            selectReference: async () => undefined,
            onConfirm: current.confirm,
            onClose: current.close,
          })
        : null;
    },
  });
  actions.open();
  const wrapper = mount(host, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return {
    actions,
    wrapper,
    sheet,
    execute,
    accept: () => {
      rejected = false;
    },
  };
}
describe("form-controls concrete editor confirmation lifecycle", () => {
  test("execute=false keeps edited fields and the same mounted editor for retry", async () => {
    const f = fixture();
    const initial = f.wrapper.getComponent(FormControlDialog).vm.$.uid;
    const name = f.wrapper
      .findAllComponents(Input)
      .find((input) => input.props("modelValue") === "Control")!;
    name.vm.$emit("update:modelValue", "Unsaved name");
    await nextTick();
    f.wrapper.getComponent(Dialog).vm.$emit("confirm");
    await nextTick();
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.sheet.drawings ?? []).toEqual([]);
    expect(f.wrapper.getComponent(FormControlDialog).vm.$.uid).toBe(initial);
    expect(
      f.wrapper
        .findAllComponents(Input)
        .some((input) => input.props("modelValue") === "Unsaved name"),
    ).toBe(true);
    f.accept();
    f.wrapper.getComponent(Dialog).vm.$emit("confirm");
    await nextTick();
    expect(f.sheet.drawings![0]!.name).toBe("Unsaved name");
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.wrapper.findComponent(FormControlDialog).exists()).toBe(false);
  });
  test("cancel discards uncommitted fields and detaches its callbacks", async () => {
    const f = fixture();
    const captured = f.actions.dialog.value!;
    const name = f.wrapper
      .findAllComponents(Input)
      .find((input) => input.props("modelValue") === "Control")!;
    name.vm.$emit("update:modelValue", "Canceled name");
    await nextTick();
    f.wrapper.getComponent(Dialog).vm.$emit("close");
    await nextTick();
    captured.close();
    expect(f.actions.dialog.value).toBeUndefined();
    expect(f.wrapper.findComponent(FormControlDialog).exists()).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.sheet.drawings ?? []).toEqual([]);
  });
  test("same-ID reopen mounts a fresh editor without carrying the prior local fields", async () => {
    const f = fixture();
    f.accept();
    f.wrapper.getComponent(Dialog).vm.$emit("confirm");
    await nextTick();
    const saved = f.sheet.drawings![0] as SheetControlDrawing;
    f.actions.open(saved);
    await nextTick();
    const old = f.wrapper.getComponent(FormControlDialog).vm.$.uid;
    const captured = f.actions.dialog.value!;
    const name = f.wrapper
      .findAllComponents(Input)
      .find((input) => input.props("modelValue") === "Control")!;
    name.vm.$emit("update:modelValue", "Stale local name");
    await nextTick();
    f.actions.open(saved);
    await nextTick();
    expect(f.wrapper.getComponent(FormControlDialog).vm.$.uid).not.toBe(old);
    expect(
      f.wrapper
        .findAllComponents(Input)
        .some((input) => input.props("modelValue") === "Stale local name"),
    ).toBe(false);
    const current = f.actions.dialog.value;
    captured.close();
    expect(f.actions.dialog.value).toBe(current);
    f.actions.close();
  });
});
