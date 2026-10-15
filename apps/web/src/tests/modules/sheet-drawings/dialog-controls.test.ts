import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Textarea } from "tdesign-vue-next/es/textarea";
import type { SheetGraphicDrawing, SheetGraphicKind } from "@sheetcraft/core/sheet-drawings";
import DrawingEditorDialog from "../../../modules/sheet-drawings/components/DrawingEditorDialog.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { createAppI18n } from "../../../shared/i18n";

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function fixture(kind: SheetGraphicKind, disabled = false) {
  const confirmDrawing = vi.fn((_drawing: SheetGraphicDrawing) => false);
  const wrapper = mount(DrawingEditorDialog, {
    attachTo: document.body,
    props: {
      drawing: createGraphicDrawing("drawing", kind, "Drawing", { row: 0, column: 0 }),
      disabled,
      confirmDrawing,
    },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: { DrawingContent: true },
    },
  });
  mounted.push(wrapper);
  return { wrapper, confirmDrawing };
}

test.each(["shape", "textBox", "wordArt", "icon", "equation"] as const)(
  "%s disabled editor disables every editable field while retaining close",
  async (kind) => {
    const { wrapper, confirmDrawing } = fixture(kind, true);
    for (const input of wrapper.findAllComponents(Input))
      expect(input.props("disabled")).toBe(true);
    for (const input of wrapper.findAllComponents(InputNumber))
      expect(input.props("disabled")).toBe(true);
    for (const checkbox of wrapper.findAllComponents(Checkbox))
      expect(checkbox.props("disabled")).toBe(true);
    for (const textarea of wrapper.findAllComponents(Textarea))
      expect(textarea.props("disabled")).toBe(true);
    for (const element of document.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      '.drawing-editor input[type="color"], .drawing-editor__shapes button',
    ))
      expect(element.disabled).toBe(true);
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    await nextTick();
    expect(confirmDrawing).not.toHaveBeenCalled();
    wrapper.getComponent(Dialog).vm.$emit("close");
    expect(wrapper.emitted("close")).toHaveLength(1);
  },
);

test("late field events cannot mutate the local draft while the editor is disabled", async () => {
  const { wrapper, confirmDrawing } = fixture("icon");
  wrapper.getComponent(Dialog).vm.$emit("confirm");
  const original = JSON.parse(JSON.stringify(confirmDrawing.mock.calls[0]![0]));
  confirmDrawing.mockClear();
  await wrapper.setProps({ disabled: true });
  wrapper.getComponent(Input).vm.$emit("update:modelValue", "Late name");
  wrapper.getComponent(Textarea).vm.$emit("update:modelValue", "Late text");
  for (const number of wrapper.findAllComponents(InputNumber)) {
    number.vm.$emit("update:modelValue", 32);
    number.vm.$emit("change", 32);
  }
  for (const checkbox of wrapper.findAllComponents(Checkbox)) {
    checkbox.vm.$emit("update:modelValue", true);
    checkbox.vm.$emit("change", true);
  }
  for (const color of document.querySelectorAll<HTMLInputElement>(
    '.drawing-editor input[type="color"]',
  )) {
    color.value = "#ff0000";
    color.dispatchEvent(new Event("input", { bubbles: true }));
  }
  document
    .querySelector<HTMLButtonElement>(".drawing-editor__shapes button")!
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  wrapper.getComponent(Dialog).vm.$emit("confirm");
  await nextTick();
  expect(confirmDrawing).not.toHaveBeenCalled();
  await wrapper.setProps({ disabled: false });
  wrapper.getComponent(Dialog).vm.$emit("confirm");
  expect(confirmDrawing).toHaveBeenCalledExactlyOnceWith(original);
});

test("number controls use the shared column treatment and labelled groups without label forwarding", () => {
  const { wrapper } = fixture("icon");
  const numbers = wrapper.findAllComponents(InputNumber);
  expect(numbers).toHaveLength(5);
  for (const number of numbers) {
    expect(number.props("theme")).toBe("column");
    expect(number.classes()).toContain("sheetcraft-input-number--persistent-controls");
    expect(number.element.closest("label")).toBeNull();
    const group = number.element.closest('[role="group"]');
    expect(group?.getAttribute("aria-label")).toBeTruthy();
    expect(number.attributes("aria-label")).toBe(group?.getAttribute("aria-label"));
  }
});
