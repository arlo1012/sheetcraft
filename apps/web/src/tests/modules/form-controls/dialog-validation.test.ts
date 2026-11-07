// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Select } from "tdesign-vue-next/es/select";
import type { FormControlType } from "@sheetcraft/core/form-controls";
import type { SheetControlDrawing } from "@sheetcraft/core/sheet-drawings";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import FormControlDialog from "../../../modules/form-controls/components/FormControlDialog.vue";
import { createAppI18n } from "../../../shared/i18n";
import { controlDrawing } from "./fixture";

const mountedWrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function fixture(
  type: FormControlType = "spinner",
  values: Partial<SheetControlDrawing["control"]> = {},
) {
  const drawing = controlDrawing(type);
  drawing.control = { ...drawing.control, ...values };
  const wrapper = mount(FormControlDialog, {
    attachTo: document.body,
    props: {
      drawing,
      sheetName: "Sheet1",
      disabled: false,
      error: false,
      suspended: false,
      selectReference: vi.fn(async () => undefined),
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

async function setNumber(wrapper: ReturnType<typeof fixture>, label: string, value: number) {
  const input = wrapper
    .findAllComponents(InputNumber)
    .find((candidate) => candidate.vm.$attrs["aria-label"] === label);
  expect(input).toBeDefined();
  input!.vm.$emit("update:modelValue", value);
  await nextTick();
}
async function setType(wrapper: ReturnType<typeof fixture>, type: FormControlType) {
  wrapper.getComponent(Select).vm.$emit("update:modelValue", type);
  await nextTick();
}
function confirm(wrapper: ReturnType<typeof fixture>) {
  wrapper.getComponent(Dialog).vm.$emit("confirm");
}
function confirmedDrawing(wrapper: ReturnType<typeof fixture>) {
  return wrapper.emitted("confirm")!.at(-1)![0] as SheetControlDrawing;
}

describe.each(["spinner", "scrollbar"] as const)("%s editor numeric validation", (type) => {
  test.each([
    ["Minimum", NaN, "numeric bounds"],
    ["Maximum", Infinity, "numeric bounds"],
    ["Minimum", 11, "minimum no greater than the maximum"],
    ["Step", 0, "step greater than zero"],
    ["Step", -1, "step greater than zero"],
    ["Step", NaN, "step greater than zero"],
    ["Step", Infinity, "step greater than zero"],
  ] as const)("does not submit invalid %s = %s", async (field, value, message) => {
    const wrapper = fixture(type);
    await setNumber(wrapper, field, value);

    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: true });
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(message);
    confirm(wrapper);
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });

  test("allows corrected bounds and a positive step to be submitted", async () => {
    const wrapper = fixture(type);
    await setNumber(wrapper, "Minimum", 20);
    confirm(wrapper);
    expect(wrapper.emitted("confirm")).toBeUndefined();
    await setNumber(wrapper, "Maximum", 30);
    await setNumber(wrapper, "Step", 0.5);

    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: false });
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    confirm(wrapper);
    expect(confirmedDrawing(wrapper).control).toMatchObject({ type, min: 20, max: 30, step: 0.5 });
  });
});

describe("optional control cell links", () => {
  test.each(["checkbox", "radio", "combo", "list", "spinner", "scrollbar", "button"] as const)(
    "can submit a %s after clearing the linked-cell field",
    async (type) => {
      const wrapper = fixture(type);
      wrapper.findAllComponents(RangeReferenceInput)[0]!.vm.$emit("update:modelValue", "");
      await nextTick();
      expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: false });
      confirm(wrapper);
      expect(wrapper.emitted("confirm")!.at(-1)![1]).toBe("");
    },
  );
});

describe("form control editor type-specific validation", () => {
  test("explains automatic radio grouping without a custom selected-value input", () => {
    const wrapper = fixture("radio");
    expect(wrapper.findAllComponents(InputNumber)).toHaveLength(0);
    expect(document.body.textContent).toMatch(/group/i);
    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: false });
    confirm(wrapper);
    expect(confirmedDrawing(wrapper).control.type).toBe("radio");
  });

  test("ignores invalid old numeric fields after changing a numeric control to a checkbox", async () => {
    const wrapper = fixture("spinner");
    await setNumber(wrapper, "Minimum", Infinity);
    await setNumber(wrapper, "Step", 0);
    await setType(wrapper, "checkbox");

    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: false });
    expect(document.body.querySelector('[role="alert"]')).toBeNull();
    confirm(wrapper);
    expect(confirmedDrawing(wrapper).control).toMatchObject({
      type: "checkbox",
      min: 0,
      max: 100,
      step: 1,
      optionValue: 1,
      resetValue: null,
    });
  });

  test("discards an invalid old radio value when switching to a numeric control", async () => {
    const wrapper = fixture("radio", { optionValue: Infinity });
    await setType(wrapper, "scrollbar");
    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: false });
    confirm(wrapper);
    expect(confirmedDrawing(wrapper).control).toMatchObject({
      type: "scrollbar",
      min: 0,
      max: 10,
      step: 2,
      optionValue: 1,
      resetValue: null,
    });
  });

  test("clears an old button reset value and restores unrelated defaults for a passive label", async () => {
    const wrapper = fixture("button", {
      resetValue: "Previous action",
      min: -10,
      max: 50,
      step: 5,
      optionValue: 9,
    });
    await setType(wrapper, "label");
    confirm(wrapper);
    expect(confirmedDrawing(wrapper).control).toMatchObject({
      type: "label",
      min: 0,
      max: 100,
      step: 1,
      optionValue: 1,
      resetValue: null,
    });
  });

  test("does not submit even valid fields while the owner disables the editor", async () => {
    const wrapper = fixture();
    await wrapper.setProps({ disabled: true });
    confirm(wrapper);
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });
});
