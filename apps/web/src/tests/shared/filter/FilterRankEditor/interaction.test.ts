import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import FilterRankEditor from "../../../../shared/filter/components/FilterRankEditor.vue";
import { createAppI18n } from "../../../../shared/i18n";

describe("inline filter rank editor", () => {
  test("invalidates a cleared count and resets when the initial condition changes", async () => {
    const wrapper = mount(FilterRankEditor, {
      props: { initial: { kind: "rank", bottom: false, percent: false, count: 10 } },
      global: { plugins: [createAppI18n("en-US")] },
    });
    try {
      expect(wrapper.emitted("update:condition")?.at(-1)).toEqual([
        { kind: "rank", bottom: false, percent: false, count: 10 },
      ]);
      wrapper.findComponent(InputNumber).vm.$emit("update:modelValue", undefined);
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("update:condition")?.at(-1)).toEqual([undefined]);
      await wrapper.setProps({
        initial: { kind: "rank", bottom: true, percent: true, count: 12.5 },
      });
      expect(wrapper.emitted("update:condition")?.at(-1)).toEqual([
        { kind: "rank", bottom: true, percent: true, count: 12.5 },
      ]);
    } finally {
      wrapper.unmount();
    }
  });
});
