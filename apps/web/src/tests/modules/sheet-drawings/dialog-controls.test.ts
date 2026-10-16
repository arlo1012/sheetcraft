import { DOMWrapper, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { SelectInput } from "tdesign-vue-next/es/select-input";
import { Textarea } from "tdesign-vue-next/es/textarea";
import { ColorPickerPanel } from "tdesign-vue-next/es/color-picker";
import type { SheetGraphicDrawing, SheetGraphicKind } from "@sheetcraft/core/sheet-drawings";
import DrawingEditorDialog from "../../../modules/sheet-drawings/components/DrawingEditorDialog.vue";
import DrawingContent from "../../../modules/sheet-drawings/components/DrawingContent.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
  localStorage.clear();
});

function fixture(
  kind: SheetGraphicKind,
  disabled = false,
  colors: Partial<SheetGraphicDrawing> = {},
) {
  const confirmDrawing = vi.fn((_drawing: SheetGraphicDrawing) => false);
  const drawing = {
    ...createGraphicDrawing("drawing", kind, "Drawing", { row: 0, column: 0 }),
    ...colors,
  };
  const wrapper = mount(DrawingEditorDialog, {
    attachTo: document.body,
    props: {
      drawing,
      disabled,
      confirmDrawing,
    },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: { DrawingContent: true },
    },
  });
  mounted.push(wrapper);
  return { wrapper, confirmDrawing, drawing };
}

async function openPalette(control: VueWrapper) {
  const input = control.getComponent(SelectInput).getComponent(Input);
  Object.defineProperties(input.element, {
    getBoundingClientRect: { value: () => new DOMRect(0, 0, 64, 28), configurable: true },
    offsetWidth: { value: 64, configurable: true },
  });
  const trigger = input.get<HTMLInputElement>("input");
  trigger.element.focus();
  await trigger.trigger("keydown", { key: "Enter", code: "Enter" });
  await new Promise((resolve) => window.setTimeout(resolve));
  await flushPromises();
  return new DOMWrapper(document.body).get(".color-palette");
}

function preview(wrapper: VueWrapper): SheetGraphicDrawing {
  return wrapper.findAllComponents(DrawingContent).at(-1)!.props("drawing");
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
    for (const color of wrapper.findAllComponents(ColorPaletteSelect)) {
      expect(color.props("disabled")).toBe(true);
      expect(color.get("input").attributes("disabled")).toBeDefined();
    }
    for (const element of document.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      ".drawing-editor__shapes button",
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
  for (const color of wrapper.findAllComponents(ColorPaletteSelect))
    color.vm.$emit("select", "#ff0000");
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

test("shared palette RGB choices update only the preview draft until confirmation", async () => {
  const { wrapper, drawing, confirmDrawing } = fixture("icon");
  const original = structuredClone(drawing);
  const colors = wrapper.findAllComponents(ColorPaletteSelect);
  expect(colors).toHaveLength(3);
  expect(document.querySelector('.drawing-editor input[type="color"]')).toBeNull();
  for (const [index, color] of ["#4472c4", "#ffc000", "#7030a0"].entries()) {
    const control = colors[index]!;
    expect(control.props("showDefault")).toBe(false);
    expect(control.element.closest("label")).toBeNull();
    expect(control.element.closest('[role="group"]')?.getAttribute("aria-label")).toBe(
      control.props("label"),
    );
    const palette = await openPalette(control);
    expect(palette.find('[data-color-action="default"]').exists()).toBe(false);
    await palette.get(`[data-color-swatch="${color}"]`).trigger("click");
    expect(control.get("input").attributes("aria-expanded")).toBe("false");
  }
  expect(preview(wrapper)).toMatchObject({ fill: "#4472c4", stroke: "#ffc000", color: "#7030a0" });
  expect(drawing).toEqual(original);
  expect(confirmDrawing).not.toHaveBeenCalled();
  wrapper.getComponent(Dialog).vm.$emit("confirm");
  expect(confirmDrawing).toHaveBeenCalledExactlyOnceWith(preview(wrapper));
  expect(drawing).toEqual(original);
});

test("custom RGB palette choice can be canceled without changing its source", async () => {
  const { wrapper, drawing, confirmDrawing } = fixture("icon");
  const original = structuredClone(drawing);
  const control = wrapper.findAllComponents(ColorPaletteSelect)[0]!;
  const palette = await openPalette(control);
  await palette.get('[data-color-action="more"]').trigger("click");
  wrapper.getComponent(ColorPalette).getComponent(ColorPickerPanel).vm.$emit("change", "#123456");
  await nextTick();
  await palette.get('[data-color-action="apply"]').trigger("click");
  expect(preview(wrapper).fill).toBe("#123456");
  wrapper.getComponent(Dialog).vm.$emit("close");
  expect(wrapper.emitted("close")).toHaveLength(1);
  expect(confirmDrawing).not.toHaveBeenCalled();
  expect(drawing).toEqual(original);
});

test("transparent colors and the existing no-fill toggle keep their own semantics", async () => {
  const { wrapper: current, drawing: transparent } = fixture("icon", false, {
    fill: "transparent",
    stroke: "transparent",
    color: "transparent",
  });
  for (const color of current.findAllComponents(ColorPaletteSelect)) {
    expect(color.props("modelValue")).toBe("transparent");
    for (const value of [null, "transparent", "#abc", "invalid"]) color.vm.$emit("select", value);
  }
  await nextTick();
  expect(preview(current)).toMatchObject(transparent);
  const noFill = current.findAllComponents(Checkbox).find((checkbox) => checkbox.props("checked"))!;
  noFill.vm.$emit("change", false);
  await nextTick();
  expect(preview(current).fill).toBe("#ffffff");
  noFill.vm.$emit("change", true);
  await nextTick();
  expect(preview(current).fill).toBe("transparent");
  expect(preview(current).stroke).toBe("transparent");
  expect(preview(current).color).toBe("transparent");
});

test("a replaced owner rejects late palette callbacks even with the same drawing ID", async () => {
  const { wrapper, drawing, confirmDrawing } = fixture("icon");
  const before = JSON.parse(JSON.stringify(preview(wrapper)));
  const color = wrapper.findAllComponents(ColorPaletteSelect)[0]!;
  await openPalette(color);
  const lateSelect = color.vm.$.vnode.props!.onSelect as (value: string | null) => void;
  await wrapper.setProps({ drawing: { ...drawing, name: "Replacement" } });
  lateSelect("#ff0000");
  color.vm.$emit("select", "#00ff00");
  await nextTick();
  expect(preview(wrapper)).toEqual(before);
  await wrapper.setProps({ drawing });
  wrapper.getComponent(Dialog).vm.$emit("confirm");
  expect(confirmDrawing).toHaveBeenCalledExactlyOnceWith(before);
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
