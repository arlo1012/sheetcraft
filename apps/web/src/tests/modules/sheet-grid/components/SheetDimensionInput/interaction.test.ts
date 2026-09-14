import { mount } from "@vue/test-utils";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import SheetDimensionInput from "../../../../../modules/sheet-grid/components/SheetDimensionInput.vue";
import { createAppI18n } from "../../../../../shared/i18n";

function mountDimensionInput(
  props: Partial<InstanceType<typeof SheetDimensionInput>["$props"]> = {},
) {
  return mount(SheetDimensionInput, {
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      axis: "row",
      modelValue: 96,
      minimum: 12,
      maximum: 120,
      ...props,
    },
  });
}

describe("SheetDimensionInput", () => {
  test("changes the displayed unit without writing or committing a new dimension", async () => {
    const wrapper = mountDimensionInput();
    const select = wrapper.getComponent(TSelect);
    await select.vm.$emit("change", "in");
    await nextTick();

    expect(wrapper.getComponent(TInputNumber).props("modelValue")).toBe(1);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("commit")).toBeUndefined();

    await select.vm.$emit("change", "px");
    await nextTick();
    expect(wrapper.getComponent(TInputNumber).props("modelValue")).toBe(96);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("commit")).toBeUndefined();
  });

  test("converts decimal physical input to a rounded canonical pixel value", async () => {
    const wrapper = mountDimensionInput();
    const number = wrapper.getComponent(TInputNumber);
    await number.vm.$emit("change", 10, {});

    expect(wrapper.emitted("update:modelValue")).toEqual([[13]]);

    const event = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    await number.vm.$emit("enter", 10, { e: event });
    expect(wrapper.emitted("commit")).toEqual([[13]]);
    expect(wrapper.emitted("enter")).toEqual([[13]]);
    expect(event.defaultPrevented).toBe(true);
  });

  test("commits native numeric input after Enter", async () => {
    const wrapper = mountDimensionInput({ axis: "column", minimum: 32, maximum: 320 });
    await wrapper.getComponent(TSelect).vm.$emit("change", "cm");
    await nextTick();

    const input = wrapper.get<HTMLInputElement>("[data-sheet-dimension-number] input");
    expect(input.element.value).toBe("2.54");
    await input.setValue("5.08");
    await input.trigger("keydown", { key: "Enter" });
    await nextTick();

    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([192]);
    expect(wrapper.emitted("commit")?.at(-1)).toEqual([192]);
    expect(wrapper.emitted("enter")?.at(-1)).toEqual([192]);
  });

  test("retains the original pixel size across repeated unit changes", async () => {
    const wrapper = mountDimensionInput({ axis: "column", minimum: 32, maximum: 320 });
    const select = wrapper.getComponent(TSelect);

    await select.vm.$emit("change", "char");
    await select.vm.$emit("change", "cm");
    await select.vm.$emit("change", "pt");
    await select.vm.$emit("change", "px");
    await nextTick();

    expect(wrapper.getComponent(TInputNumber).props("modelValue")).toBe(96);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("commit")).toBeUndefined();
  });

  test("commits the retained pixel value after a dirty edit and a unit switch", async () => {
    const wrapper = mountDimensionInput({ axis: "column", minimum: 32, maximum: 320 });
    const number = wrapper.getComponent(TInputNumber);
    const select = wrapper.getComponent(TSelect);

    await select.vm.$emit("change", "char");
    await number.vm.$emit("change", 13.1, {});
    await select.vm.$emit("change", "in");
    await nextTick();
    const displayValue = number.props("modelValue");
    await number.vm.$emit("enter", displayValue, {
      e: new KeyboardEvent("keydown", { key: "Enter", cancelable: true }),
    });

    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([97]);
    expect(wrapper.emitted("commit")).toEqual([[97]]);
    expect(wrapper.emitted("enter")).toEqual([[97]]);
  });

  test("reports blank and out-of-range drafts as invalid", async () => {
    const wrapper = mountDimensionInput();
    const number = wrapper.getComponent(TInputNumber);

    await number.vm.$emit("change", "", {});
    await number.vm.$emit("change", 8.5, {});
    await number.vm.$emit("change", 90.5, {});

    expect(wrapper.emitted("update:modelValue")).toEqual([[undefined], [undefined], [undefined]]);
    expect(wrapper.emitted("commit")).toBeUndefined();
  });

  test("does not commit a dirty numeric field when focus moves to the unit selector", async () => {
    const wrapper = mountDimensionInput();
    const number = wrapper.getComponent(TInputNumber);
    await number.vm.$emit("change", 10, {});
    await number.vm.$emit("blur", 10, {
      e: { relatedTarget: wrapper.getComponent(TSelect).element },
    });
    await nextTick();

    expect(wrapper.emitted("commit")).toBeUndefined();
  });

  test("disables both controls and ignores attempted edits", async () => {
    const wrapper = mountDimensionInput({ disabled: true });
    const number = wrapper.getComponent(TInputNumber);
    const select = wrapper.getComponent(TSelect);
    expect(number.props("disabled")).toBe(true);
    expect(select.props("disabled")).toBe(true);

    await number.vm.$emit("change", 10, {});
    await select.vm.$emit("change", "in");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("commit")).toBeUndefined();
  });
});
