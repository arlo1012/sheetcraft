import { mount } from "@vue/test-utils";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { describe, expect, test } from "vitest";
import { defineComponent, ref } from "vue";
import { createDefaultSelectionCellStyleState } from "@sheetcraft/core/style-state";
import type { CellStylePatch } from "@sheetcraft/core/style";
import FontFormatPanel from "../../../../shared/font-format/FontFormatPanel.vue";
import { createAppI18n } from "../../../../shared/i18n";

function mountPanel() {
  const Harness = defineComponent({
    components: { FontFormatPanel },
    setup() {
      const patch = ref<CellStylePatch>({});
      return { state: createDefaultSelectionCellStyleState(), patch };
    },
    template: `<FontFormatPanel :state="state" :patch="patch" :sample-value="'AaBbCc'" @update:patch="patch = { ...patch, ...$event }" />`,
  });
  const wrapper = mount(Harness, { global: { plugins: [createAppI18n("en-US")] } });
  return { wrapper, panel: wrapper.getComponent(FontFormatPanel) };
}

describe("font input location", () => {
  test.each([
    {
      field: "family",
      query: "AR",
      match: "Arial",
      count: 6,
      value: "Arial",
      patch: { fontFamily: "Arial" },
    },
    {
      field: "style",
      query: "iTa",
      match: "italic",
      count: 4,
      value: "Italic",
      patch: { bold: null, italic: true },
    },
    { field: "size", query: "2", match: "20", count: 17, value: "20", patch: { fontSize: 20 } },
  ])(
    "locates $field without hiding options and confirms the match on Enter",
    async ({ field, query, match, count, value, patch }) => {
      const { wrapper, panel } = mountPanel();
      try {
        const input = panel.get(`[data-cell-format-font-${field}]`).getComponent(TInput);
        const list = panel.get(`[data-cell-format-font-${field}-list]`);
        input.vm.$emit("change", query);
        await wrapper.vm.$nextTick();
        expect(list.findAll('[role="option"]')).toHaveLength(count);
        expect(list.get("[data-option-list-match]").attributes("data-option-list-value")).toBe(
          match,
        );
        expect(input.props("modelValue")).toBe(query);
        expect(panel.props("patch")).toEqual({});
        input.vm.$emit("enter");
        await wrapper.vm.$nextTick();
        expect(panel.props("patch")).toEqual(patch);
        expect(input.props("modelValue")).toBe(value);
        expect(list.findAll('[role="option"]')).toHaveLength(count);
      } finally {
        wrapper.unmount();
      }
    },
  );

  test("scrolls to a matching size outside the visible portion of the list", async () => {
    const { wrapper, panel } = mountPanel();
    try {
      const list = panel.get<HTMLElement>("[data-cell-format-font-size-list]");
      Object.defineProperty(list.element, "clientHeight", { value: 160 });
      list.findAll<HTMLElement>("button").forEach((button, index) => {
        Object.defineProperty(button.element, "offsetTop", { value: index * 24 });
        Object.defineProperty(button.element, "offsetHeight", { value: 24 });
      });
      panel.get("[data-cell-format-font-size]").getComponent(TInput).vm.$emit("change", "72");
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();
      expect(list.get("[data-option-list-match]").attributes("data-option-list-value")).toBe("72");
      expect(list.element.scrollTop).toBeGreaterThan(0);
      expect(list.findAll("button")).toHaveLength(17);
    } finally {
      wrapper.unmount();
    }
  });
});
