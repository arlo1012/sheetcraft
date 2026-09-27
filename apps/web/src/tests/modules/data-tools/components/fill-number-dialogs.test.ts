import { mount } from "@vue/test-utils";
import { afterEach, expect, test } from "vitest";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import FillNumberSequenceDialog from "../../../../modules/data-tools/components/FillNumberSequenceDialog.vue";
import FillRankDialog from "../../../../modules/data-tools/components/FillRankDialog.vue";
import RangeReferenceInput from "../../../../shared/range-reference/RangeReferenceInput.vue";
import { createAppI18n } from "../../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;

afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
});

test("number sequence publishes finite start, step, and direction", async () => {
  wrapper = mount(FillNumberSequenceDialog, {
    attachTo: document.body,
    props: { visible: true, initial: { axis: "rows", start: 1, step: 1 } },
    global: { plugins: [createAppI18n("en-US")] },
  });
  const inputs = wrapper.findAllComponents(TInputNumber);
  inputs[0]!.vm.$emit("update:modelValue", -2.5);
  inputs[1]!.vm.$emit("update:modelValue", 0.25);
  wrapper.findComponent(TRadioGroup).vm.$emit("update:modelValue", "columns");
  await wrapper.vm.$nextTick();
  wrapper.findComponent(Dialog).vm.$emit("confirm");
  expect(wrapper.emitted("apply")?.[0]?.[0]).toEqual({
    axis: "columns",
    start: -2.5,
    step: 0.25,
  });
});

test("rank keeps an in-progress draft while the range picker is open", async () => {
  const initial = {
    sourceRange: "=Sheet1!$A$1:$A$3",
    destination: "=Sheet1!$B$1",
    order: "descending" as const,
    ties: "competition" as const,
    overwrite: false,
  };
  wrapper = mount(FillRankDialog, {
    attachTo: document.body,
    props: { visible: true, initial },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrapper
    .findAllComponents(RangeReferenceInput)[0]!
    .vm.$emit("update:modelValue", "=Sheet1!$C$1:$C$3");
  await wrapper.vm.$nextTick();
  await wrapper.setProps({
    picking: true,
    initial: { ...initial, sourceRange: "=Sheet1!$D$1:$D$3" },
  });
  await wrapper.setProps({ picking: false });
  wrapper.findComponent(Dialog).vm.$emit("confirm");
  expect(wrapper.emitted("apply")?.[0]?.[0]).toMatchObject({
    sourceRange: "=Sheet1!$C$1:$C$3",
  });
});

test("rank publishes its order, tie method, and overwrite setting", async () => {
  wrapper = mount(FillRankDialog, {
    attachTo: document.body,
    props: {
      visible: true,
      initial: {
        sourceRange: "=Sheet1!$A$1:$A$3",
        destination: "=Sheet1!$B$1",
        order: "descending",
        ties: "competition",
        overwrite: false,
      },
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrapper.findComponent(TRadioGroup).vm.$emit("update:modelValue", "ascending");
  wrapper.findComponent(TSelect).vm.$emit("update:modelValue", "dense");
  wrapper.findComponent(TCheckbox).vm.$emit("update:modelValue", true);
  await wrapper.vm.$nextTick();
  wrapper.findComponent(Dialog).vm.$emit("confirm");
  expect(wrapper.emitted("apply")?.[0]?.[0]).toMatchObject({
    order: "ascending",
    ties: "dense",
    overwrite: true,
  });
});
