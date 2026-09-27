import { mount } from "@vue/test-utils";
import { afterEach, expect, test } from "vitest";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { DatePicker as TDatePicker } from "tdesign-vue-next/es/date-picker";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { InputNumber as TInputNumber } from "tdesign-vue-next/es/input-number";
import { RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import FillSeriesDialog from "../../../../modules/data-tools/components/FillSeriesDialog.vue";
import FillTextDialog from "../../../../modules/data-tools/components/FillTextDialog.vue";
import { createAppI18n } from "../../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;
const series = () => ({
  axis: "rows" as const,
  type: "linear" as const,
  step: 1,
  stop: "",
  dateUnit: "day" as const,
  trend: false,
});

afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
});

test("series accepts a negative step and clears trend for date or autofill", async () => {
  wrapper = mount(FillSeriesDialog, {
    attachTo: document.body,
    props: { visible: true, initial: series() },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrapper.findComponent(TInputNumber).vm.$emit("update:modelValue", -2);
  await wrapper.vm.$nextTick();
  wrapper.findComponent(Dialog).vm.$emit("confirm");
  expect(wrapper.emitted("apply")?.[0]?.[0]).toMatchObject({ step: -2, trend: false });

  wrapper.findComponent(TCheckbox).vm.$emit("update:modelValue", true);
  wrapper.findAllComponents(TRadioGroup)[1]!.vm.$emit("update:modelValue", "date");
  await wrapper.vm.$nextTick();
  expect(wrapper.findComponent(TCheckbox).props("disabled")).toBe(true);
  wrapper.findComponent(Dialog).vm.$emit("confirm");
  expect(wrapper.emitted("apply")?.[1]?.[0]).toMatchObject({ type: "date", trend: false });

  wrapper.findAllComponents(TRadioGroup)[1]!.vm.$emit("update:modelValue", "auto");
  await wrapper.vm.$nextTick();
  expect(wrapper.findComponent(TCheckbox).props("disabled")).toBe(true);
  wrapper.findComponent(Dialog).vm.$emit("confirm");
  expect(wrapper.emitted("apply")?.[2]?.[0]).toMatchObject({ type: "auto", trend: false });
});

test("series resets its draft after closing without applying", async () => {
  wrapper = mount(FillSeriesDialog, {
    attachTo: document.body,
    props: { visible: true, initial: series() },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrapper.findComponent(TInputNumber).vm.$emit("update:modelValue", 7);
  await wrapper.vm.$nextTick();
  await wrapper.setProps({ visible: false });
  await wrapper.setProps({ visible: true });
  wrapper.findComponent(Dialog).vm.$emit("confirm");
  expect(wrapper.emitted("apply")?.[0]?.[0]).toMatchObject({ step: 1 });
});

test("text fill publishes index position parameters", async () => {
  const initial = { position: "start" as const, from: "left" as const, index: 0, text: "" };
  wrapper = mount(FillTextDialog, {
    attachTo: document.body,
    props: { visible: true, initial },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrapper.findComponent(TInput).vm.$emit("update:modelValue", "ID-");
  wrapper.findComponent(TRadioGroup).vm.$emit("update:modelValue", "index");
  await wrapper.vm.$nextTick();
  wrapper.findAllComponents(TRadioGroup)[1]!.vm.$emit("update:modelValue", "right");
  wrapper.findComponent(TInputNumber).vm.$emit("update:modelValue", 3);
  await wrapper.vm.$nextTick();
  wrapper.findComponent(Dialog).vm.$emit("confirm");
  expect(wrapper.emitted("apply")?.[0]?.[0]).toEqual({
    position: "index",
    from: "right",
    index: 3,
    text: "ID-",
  });
  expect(initial).toEqual({ position: "start", from: "left", index: 0, text: "" });
});

test("date limits switch between date, month and year panels without mixing numeric limits", async () => {
  wrapper = mount(FillSeriesDialog, {
    attachTo: document.body,
    props: { visible: true, initial: { ...series(), type: "date", stop: "2026-09-17" } },
    global: { plugins: [createAppI18n("en-US")] },
  });
  expect(wrapper.findComponent(TDatePicker).props("mode")).toBe("date");
  const units = wrapper.findAllComponents(TRadioGroup)[2]!;
  units.vm.$emit("update:modelValue", "year");
  await wrapper.vm.$nextTick();
  expect(wrapper.findComponent(TDatePicker).props()).toMatchObject({
    mode: "year",
    format: "YYYY",
    valueType: "YYYY",
    value: "2026",
  });
  wrapper.findComponent(TDatePicker).vm.$emit("change", "2028");
  wrapper.findComponent(Dialog).vm.$emit("confirm");
  expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({ dateUnit: "year", stop: "2028" });
  units.vm.$emit("update:modelValue", "month");
  await wrapper.vm.$nextTick();
  expect(wrapper.findComponent(TDatePicker).props()).toMatchObject({
    mode: "month",
    format: "YYYY-MM",
    value: "2028-01",
  });
  wrapper.findComponent(TDatePicker).vm.$emit("change", "2028-02");
  wrapper.findComponent(Dialog).vm.$emit("confirm");
  expect(wrapper.emitted("apply")?.at(-1)?.[0]).toMatchObject({
    dateUnit: "month",
    stop: "2028-02",
  });
  units.vm.$emit("update:modelValue", "weekday");
  await wrapper.vm.$nextTick();
  expect(wrapper.findComponent(TDatePicker).props()).toMatchObject({
    mode: "date",
    format: "YYYY-MM-DD",
    value: "2028-02-01",
  });
  wrapper.findAllComponents(TRadioGroup)[1]!.vm.$emit("update:modelValue", "linear");
  await wrapper.vm.$nextTick();
  expect(wrapper.findComponent(TDatePicker).exists()).toBe(false);
  expect(wrapper.findAllComponents(TInputNumber)[1]!.props("modelValue")).toBe("");
});
