// 未执行：按用户要求仅编写，待全部功能完成后统一运行。
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Select } from "tdesign-vue-next/es/select";
import type { SheetControlDrawing } from "@sheetcraft/core/sheet-drawings";
import FormControlDialog from "../../../modules/form-controls/components/FormControlDialog.vue";
import { createAppI18n } from "../../../shared/i18n";
import { controlDrawing } from "./fixture";

const wrappers: Array<{ unmount(): void }> = [];
const valueLabel = "Value to write on click";
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
function fixture(value: SheetControlDrawing["control"]["resetValue"] = null) {
  const drawing = controlDrawing("button");
  drawing.control.resetValue = value;
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
  wrappers.push(wrapper);
  return wrapper;
}
type Wrapper = ReturnType<typeof fixture>;
function select(wrapper: Wrapper, label: string) {
  const control = wrapper
    .findAllComponents(Select)
    .find((item) => item.vm.$attrs["aria-label"] === label);
  expect(control).toBeDefined();
  return control!;
}
async function chooseType(wrapper: Wrapper, value: "empty" | "text" | "number" | "boolean") {
  select(wrapper, "Value type").vm.$emit("update:modelValue", value);
  await nextTick();
}
function confirm(wrapper: Wrapper) {
  wrapper.getComponent(Dialog).vm.$emit("confirm");
}
function submittedValue(wrapper: Wrapper) {
  return (wrapper.emitted("confirm")!.at(-1)![0] as SheetControlDrawing).control.resetValue;
}

describe("button click value types", () => {
  test.each([null, "", "001", "true", 1, true, false])(
    "preserves the exact existing value %j when confirming without edits",
    (value) => {
      const wrapper = fixture(value);
      confirm(wrapper);
      expect(submittedValue(wrapper)).toBe(value);
    },
  );

  test.each(["", "001", "true", "false"])("explicit text keeps %j as text", async (value) => {
    const wrapper = fixture(1);
    await chooseType(wrapper, "text");
    const input = wrapper
      .findAllComponents(Input)
      .find((item) => item.vm.$attrs["aria-label"] === valueLabel);
    expect(input).toBeDefined();
    input!.vm.$emit("update:modelValue", value);
    await nextTick();
    confirm(wrapper);
    expect(submittedValue(wrapper)).toBe(value);
  });

  test("explicit number submits a numeric value", async () => {
    const wrapper = fixture("001");
    await chooseType(wrapper, "number");
    const input = wrapper
      .findAllComponents(InputNumber)
      .find((item) => item.vm.$attrs["aria-label"] === valueLabel);
    expect(input).toBeDefined();
    input!.vm.$emit("update:modelValue", -2.5);
    await nextTick();
    confirm(wrapper);
    expect(submittedValue(wrapper)).toBe(-2.5);
  });

  test.each([true, false])("explicit boolean submits %j", async (value) => {
    const wrapper = fixture("true");
    await chooseType(wrapper, "boolean");
    select(wrapper, valueLabel).vm.$emit("update:modelValue", value);
    await nextTick();
    confirm(wrapper);
    expect(submittedValue(wrapper)).toBe(value);
  });

  test("empty removes the value field and submits null", async () => {
    const wrapper = fixture("Keep until cleared");
    await chooseType(wrapper, "empty");
    expect(
      wrapper.findAllComponents(Input).some((item) => item.vm.$attrs["aria-label"] === valueLabel),
    ).toBe(false);
    expect(
      wrapper
        .findAllComponents(InputNumber)
        .some((item) => item.vm.$attrs["aria-label"] === valueLabel),
    ).toBe(false);
    expect(
      wrapper.findAllComponents(Select).some((item) => item.vm.$attrs["aria-label"] === valueLabel),
    ).toBe(false);
    confirm(wrapper);
    expect(submittedValue(wrapper)).toBeNull();
  });

  test.each([undefined, null, "", NaN, Infinity, -Infinity])(
    "rejects empty or non-finite numeric value %j",
    async (value) => {
      const wrapper = fixture(2);
      await chooseType(wrapper, "number");
      const input = wrapper
        .findAllComponents(InputNumber)
        .find((item) => item.vm.$attrs["aria-label"] === valueLabel);
      input!.vm.$emit("update:modelValue", value);
      await nextTick();
      expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ disabled: true });
      expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
        "Enter a valid number.",
      );
      confirm(wrapper);
      expect(wrapper.emitted("confirm")).toBeUndefined();
    },
  );

  test("changing to another control clears its unrelated button value", async () => {
    const wrapper = fixture("001");
    const type = wrapper
      .findAllComponents(Select)
      .find((item) => item.vm.$attrs["aria-label"] === "Control type");
    expect(type).toBeDefined();
    type!.vm.$emit("update:modelValue", "checkbox");
    await nextTick();
    confirm(wrapper);
    expect(submittedValue(wrapper)).toBeNull();
  });

  test("cancel leaves the original value untouched and emits no confirmation", async () => {
    const wrapper = fixture("001");
    await chooseType(wrapper, "empty");
    wrapper.getComponent(Dialog).vm.$emit("close");
    expect(wrapper.emitted("confirm")).toBeUndefined();
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(wrapper.props("drawing").control.resetValue).toBe("001");
  });
});
