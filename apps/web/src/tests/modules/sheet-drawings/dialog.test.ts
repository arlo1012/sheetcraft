import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { applyWorkbookCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import DrawingEditorDialog from "../../../modules/sheet-drawings/components/DrawingEditorDialog.vue";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import { createAppI18n } from "../../../shared/i18n";
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function fixture(kind: "shape" | "textBox" | "wordArt" | "icon" | "equation" = "shape") {
  const workbook = createWorkbook({ id: "dialog", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  let rejected = true;
  const execute = vi.fn((command: WorkbookCommand): unknown =>
    rejected ? false : applyWorkbookCommand(workbook, command),
  );
  const actions = useDrawingActions({
    getWorkbook: () => workbook,
    getSheet: () => sheet,
    getAddress: () => ({ row: 0, column: 0 }),
    isBusy: () => false,
    flush: () => true,
    execute,
    name: () => "Shape",
  });
  const host = defineComponent({
    setup: () => () => {
      const current = actions.dialog.value;
      return current
        ? h(DrawingEditorDialog, {
            key: current.dialogId,
            drawing: current.initial,
            disabled: false,
            confirmDrawing: (drawing: SheetGraphicDrawing) => actions.confirm(drawing, current),
            onConfirm: current.confirm,
            onClose: current.close,
          })
        : null;
    },
  });
  actions.insert(kind);
  const wrapper = mount(host, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")], stubs: { DrawingContent: true, TTextarea: true } },
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
describe("sheet-drawings concrete editor confirmation lifecycle", () => {
  test.each(["shape", "textBox", "wordArt", "icon", "equation"] as const)(
    "%s execute=false keeps edited fields and the same mounted editor for retry",
    async (kind) => {
      const f = fixture(kind);
      const initial = f.wrapper.getComponent(DrawingEditorDialog).vm.$.uid;
      const name = f.wrapper
        .findAllComponents(Input)
        .find((input) => input.props("modelValue") === "Shape")!;
      name.vm.$emit("update:modelValue", "Unsaved name");
      await nextTick();
      f.wrapper.getComponent(Dialog).vm.$emit("confirm");
      await nextTick();
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.sheet.drawings ?? []).toEqual([]);
      expect(f.wrapper.getComponent(DrawingEditorDialog).vm.$.uid).toBe(initial);
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
      expect(f.wrapper.findComponent(DrawingEditorDialog).exists()).toBe(false);
    },
  );
  test.each(["shape", "textBox", "wordArt", "icon", "equation"] as const)(
    "%s cancel discards uncommitted fields and detaches its callbacks",
    async (kind) => {
      const f = fixture(kind);
      const captured = f.actions.dialog.value!;
      const name = f.wrapper
        .findAllComponents(Input)
        .find((input) => input.props("modelValue") === "Shape")!;
      name.vm.$emit("update:modelValue", "Canceled name");
      await nextTick();
      f.wrapper.getComponent(Dialog).vm.$emit("close");
      await nextTick();
      captured.close();
      expect(f.actions.dialog.value).toBeUndefined();
      expect(f.wrapper.findComponent(DrawingEditorDialog).exists()).toBe(false);
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.sheet.drawings ?? []).toEqual([]);
    },
  );
  test.each(["shape", "textBox", "wordArt", "icon", "equation"] as const)(
    "%s same-ID reopen mounts a fresh editor without carrying the prior local fields",
    async (kind) => {
      const f = fixture(kind);
      f.accept();
      f.wrapper.getComponent(Dialog).vm.$emit("confirm");
      await nextTick();
      const saved = f.sheet.drawings![0] as SheetGraphicDrawing;
      f.actions.edit(saved);
      await nextTick();
      const old = f.wrapper.getComponent(DrawingEditorDialog).vm.$.uid;
      const captured = f.actions.dialog.value!;
      const name = f.wrapper
        .findAllComponents(Input)
        .find((input) => input.props("modelValue") === "Shape")!;
      name.vm.$emit("update:modelValue", "Stale local name");
      await nextTick();
      f.actions.edit(saved);
      await nextTick();
      expect(f.wrapper.getComponent(DrawingEditorDialog).vm.$.uid).not.toBe(old);
      expect(
        f.wrapper
          .findAllComponents(Input)
          .some((input) => input.props("modelValue") === "Stale local name"),
      ).toBe(false);
      const current = f.actions.dialog.value;
      captured.close();
      expect(f.actions.dialog.value).toBe(current);
      f.actions.close();
    },
  );
});
