import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select } from "tdesign-vue-next/es/select";
import { AutoComplete } from "tdesign-vue-next/es/auto-complete";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import type { PivotValueCondition } from "@idea10/core/pivot-tables";
import type { FilterConditionAction } from "../../../shared/filter/filter-condition-actions";
import PivotValueFilterDialog from "../../../modules/pivot-tables/components/PivotValueFilterDialog.vue";
import FilterConditionEditor from "../../../shared/filter/components/FilterConditionEditor.vue";
import FilterRankEditor from "../../../shared/filter/components/FilterRankEditor.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function setup(
  action: FilterConditionAction = "greaterThan",
  initial?: PivotValueCondition,
  disabled = false,
) {
  const wrapper = mount(PivotValueFilterDialog, {
    attachTo: document.body,
    props: {
      visible: true,
      action,
      initial,
      initialMeasure: 0,
      disabled,
      measures: [
        { field: 2, aggregate: "sum", caption: "Revenue" },
        { field: 2, aggregate: "count", caption: "Orders" },
      ],
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}
async function confirm(wrapper: ReturnType<typeof setup>) {
  wrapper.findComponent(Dialog).vm.$emit("confirm");
  await flushPromises();
}

describe("pivot value filter dialog", () => {
  test("rank Sum supports a decimal amount above 500 and preserves it when reopened", async () => {
    const condition = {
      kind: "rank",
      bottom: false,
      percent: false,
      mode: "sum",
      count: 950.75,
    } as const;
    const wrapper = setup("rank");
    const editor = wrapper.findComponent(FilterRankEditor);
    editor.findAllComponents(Select)[1]!.vm.$emit("update:modelValue", "sum");
    editor.findComponent(InputNumber).vm.$emit("update:modelValue", condition.count);
    await flushPromises();
    await confirm(wrapper);
    expect(wrapper.emitted("apply")).toEqual([[{ measure: 0, condition }]]);
    await wrapper.setProps({ visible: false, initial: condition });
    await wrapper.setProps({ visible: true });
    await confirm(wrapper);
    expect(wrapper.emitted("apply")?.at(-1)).toEqual([{ measure: 0, condition }]);
  });
  test("not-between opens two numeric boundaries and applies their OR condition", async () => {
    const wrapper = setup("notBetween");
    wrapper.findComponent(Select).vm.$emit("update:modelValue", 1);
    const inputs = wrapper.findComponent(FilterConditionEditor).findAllComponents(AutoComplete);
    inputs[0]!.vm.$emit("update:modelValue", "10");
    inputs[1]!.vm.$emit("update:modelValue", "20");
    await flushPromises();
    await confirm(wrapper);
    expect(wrapper.emitted("apply")).toEqual([
      [
        {
          measure: 1,
          condition: {
            kind: "compound",
            operator: "or",
            conditions: [
              { kind: "number", operator: "lessThan", value: 10 },
              { kind: "number", operator: "greaterThan", value: 20 },
            ],
          },
        },
      ],
    ]);
  });
  test("numeric condition applies the selected aggregate measure only on confirmation", async () => {
    const wrapper = setup();
    wrapper.findComponent(Select).vm.$emit("update:modelValue", 1);
    const condition = { kind: "number", operator: "greaterThan", value: 3 } as const;
    wrapper.findComponent(FilterConditionEditor).vm.$emit("update:condition", condition);
    await flushPromises();
    expect(wrapper.emitted("apply")).toBeUndefined();
    await confirm(wrapper);
    expect(wrapper.emitted("apply")).toEqual([[{ measure: 1, condition }]]);
  });
  test("cancelling measure and condition edits emits no apply; reopening restores initial values", async () => {
    const initial = { kind: "number", operator: "greaterThan", value: 100 } as const;
    const wrapper = setup("custom", initial);
    wrapper.findComponent(Select).vm.$emit("update:modelValue", 1);
    wrapper
      .findComponent(FilterConditionEditor)
      .vm.$emit("update:condition", { kind: "number", operator: "lessThan", value: 4 });
    wrapper.findComponent(Dialog).vm.$emit("close");
    expect(wrapper.emitted("apply")).toBeUndefined();
    expect(wrapper.emitted("close")).toHaveLength(1);
    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    await confirm(wrapper);
    expect(wrapper.emitted("apply")).toEqual([[{ measure: 0, condition: initial }]]);
  });
  test("rank criteria and the chosen measure are confirmed together", async () => {
    const wrapper = setup("rank");
    wrapper.findComponent(Select).vm.$emit("update:modelValue", 1);
    const condition = { kind: "rank", bottom: true, percent: true, count: 25 } as const;
    wrapper.findComponent(FilterRankEditor).vm.$emit("update:condition", condition);
    await flushPromises();
    await confirm(wrapper);
    expect(wrapper.emitted("apply")).toEqual([[{ measure: 1, condition }]]);
  });
  test.each([
    ["aboveAverage", true],
    ["belowAverage", false],
  ] as const)(
    "%s waits for confirmation and includes the chosen measure",
    async (action, above) => {
      const wrapper = setup(action);
      wrapper.findComponent(Select).vm.$emit("update:modelValue", 1);
      await flushPromises();
      expect(wrapper.emitted("apply")).toBeUndefined();
      await confirm(wrapper);
      expect(wrapper.emitted("apply")).toEqual([
        [{ measure: 1, condition: { kind: "average", above } }],
      ]);
    },
  );
  test("an invalid condition cannot be applied", async () => {
    const wrapper = setup();
    wrapper.findComponent(FilterConditionEditor).vm.$emit("update:condition", undefined);
    await flushPromises();
    await confirm(wrapper);
    expect(wrapper.emitted("apply")).toBeUndefined();
  });
  test("disabled editing cannot confirm an otherwise valid condition", async () => {
    const wrapper = setup("aboveAverage", undefined, true);
    await confirm(wrapper);
    expect(wrapper.emitted("apply")).toBeUndefined();
    expect(wrapper.findComponent(Select).props("disabled")).toBe(true);
  });
});
