import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { AutoComplete } from "tdesign-vue-next/es/auto-complete";
import { Select } from "tdesign-vue-next/es/select";
import FilterConditionEditor from "../../../../shared/filter/components/FilterConditionEditor.vue";
import { createAppI18n } from "../../../../shared/i18n";

describe("inline filter condition editor", () => {
  test.each(["doesNotBeginWith", "doesNotEndWith"] as const)(
    "numeric label %s applies a text comparison",
    async (action) => {
      const wrapper = mount(FilterConditionEditor, {
        props: { kind: "number", dateSystem: "1900", values: [], action },
        global: { plugins: [createAppI18n("en-US")] },
      });
      try {
        wrapper.findAllComponents(AutoComplete)[0]!.vm.$emit("update:modelValue", "12");
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted("update:condition")?.at(-1)).toEqual([
          { kind: "text", operator: action, value: "12" },
        ]);
      } finally {
        wrapper.unmount();
      }
    },
  );
  test.each([
    ["between", "and", "greaterThanOrEqual", "lessThanOrEqual"],
    ["notBetween", "or", "lessThan", "greaterThan"],
  ] as const)("text %s edits both lexical boundaries", async (action, operator, first, second) => {
    const wrapper = mount(FilterConditionEditor, {
      props: { kind: "text", dateSystem: "1900", values: [], action },
      global: { plugins: [createAppI18n("en-US")] },
    });
    try {
      const inputs = wrapper.findAllComponents(AutoComplete);
      inputs[0]!.vm.$emit("update:modelValue", "Apple");
      inputs[1]!.vm.$emit("update:modelValue", "Pear");
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("update:condition")?.at(-1)).toEqual([
        {
          kind: "compound",
          operator,
          conditions: [
            { kind: "text", operator: first, value: "Apple" },
            { kind: "text", operator: second, value: "Pear" },
          ],
        },
      ]);
    } finally {
      wrapper.unmount();
    }
  });
  test("emits a valid numeric draft, invalidates it when cleared and resets to a replacement condition", async () => {
    const wrapper = mount(FilterConditionEditor, {
      props: {
        kind: "number",
        dateSystem: "1900",
        values: [],
        strictKind: true,
        initial: { kind: "number", operator: "greaterThan", value: 10 },
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
    try {
      expect(wrapper.emitted("update:condition")?.at(-1)).toEqual([
        { kind: "number", operator: "greaterThan", value: 10 },
      ]);
      const options = wrapper.findComponent(Select).props("options") as Array<{ value: string }>;
      expect(options.some((option) => option.value === "contains")).toBe(false);
      expect(wrapper.find(".filter-condition-editor__hint").exists()).toBe(false);
      wrapper.findAllComponents(AutoComplete)[0]!.vm.$emit("update:modelValue", "");
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("update:condition")?.at(-1)).toEqual([undefined]);
      await wrapper.setProps({ initial: { kind: "number", operator: "lessThan", value: 20 } });
      expect(wrapper.emitted("update:condition")?.at(-1)).toEqual([
        { kind: "number", operator: "lessThan", value: 20 },
      ]);
    } finally {
      wrapper.unmount();
    }
  });
});
