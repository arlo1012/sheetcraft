import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { Select } from "tdesign-vue-next/es/select";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import FilterRankEditor from "../../../shared/filter/components/FilterRankEditor.vue";
import { createAppI18n } from "../../../shared/i18n";

describe("ordinary filter rank editor", () => {
  test("offers only Items and Percent and retains the ordinary 500 integer item limit", async () => {
    const wrapper = mount(FilterRankEditor, { global: { plugins: [createAppI18n("en-US")] } });
    try {
      const options = wrapper.findAllComponents(Select).at(1)!.props("options") ?? [];
      expect(options.map((option) => ("value" in option ? option.value : undefined))).toEqual([
        "items",
        "percent",
      ]);
      expect(wrapper.emitted("update:condition")?.at(-1)).toEqual([
        { kind: "rank", bottom: false, percent: false, count: 10 },
      ]);
      for (const count of [500.5, 501]) {
        wrapper.findComponent(InputNumber).vm.$emit("update:modelValue", count);
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted("update:condition")?.at(-1)).toEqual([undefined]);
      }
      wrapper.findComponent(InputNumber).vm.$emit("update:modelValue", 500);
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("update:condition")?.at(-1)).toEqual([
        { kind: "rank", bottom: false, percent: false, count: 500 },
      ]);
    } finally {
      wrapper.unmount();
    }
  });
});
