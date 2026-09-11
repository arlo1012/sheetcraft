import { flushPromises, mount } from "@vue/test-utils";
import { AutoComplete as TAutoComplete } from "tdesign-vue-next/es/auto-complete";
import { describe, expect, test, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { createDefaultSelectionCellStyleState } from "@idea10/core/style-state";
import type { CellStylePatch } from "@idea10/core/style";
import CellFormatFontPanel from "../../../../../modules/cell-format/components/CellFormatFontPanel.vue";
import { createAppI18n } from "../../../../../shared/i18n";

function mountPanel() {
  const host = document.createElement("div");
  document.body.append(host);
  const Harness = defineComponent({
    components: { CellFormatFontPanel },
    setup() {
      const patch = ref<CellStylePatch>({});
      return { state: createDefaultSelectionCellStyleState(), patch };
    },
    template: `<CellFormatFontPanel :state="state" :patch="patch" :sample-value="'AaBbCc'" @update:patch="patch = { ...patch, ...$event }" />`,
  });
  const wrapper = mount(Harness, {
    attachTo: host,
    global: { plugins: [createAppI18n("en-US")] },
  });
  return { host, wrapper, panel: wrapper.getComponent(CellFormatFontPanel) };
}

describe("font format autocomplete", () => {
  test.each([
    {
      field: "family",
      query: "AR",
      matches: ["Arial"],
      selected: "Arial",
      patch: { fontFamily: "Arial" },
    },
    {
      field: "style",
      query: "iTa",
      matches: ["Italic", "Bold italic"],
      selected: "Bold italic",
      patch: { bold: true, italic: true },
    },
    {
      field: "size",
      query: "2",
      matches: ["12", "20", "22", "24", "28", "32", "72"],
      selected: "24",
      patch: { fontSize: 24 },
    },
  ])(
    "filters $field suggestions and applies the selected value",
    async ({ field, query, matches, selected, patch }) => {
      // TDesign dismisses popups whose trigger has no geometry; happy-dom has no layout.
      const geometry = vi
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockReturnValue(new DOMRect(0, 0, 180, 28));
      const { host, wrapper, panel } = mountPanel();
      try {
        const autocomplete = panel
          .get(`[data-cell-format-font-${field}]`)
          .getComponent(TAutoComplete);
        const input = autocomplete.get<HTMLInputElement>("input");
        input.element.focus();
        await input.setValue(query);
        await flushPromises();
        const list = autocomplete.getComponent({ name: "AutoCompleteOptionList" });
        const options = list.findAll("li");
        expect(options.map((option) => option.text())).toEqual(matches);
        expect(panel.props("patch")).toEqual({});
        await options.find((option) => option.text() === selected)!.trigger("click");
        expect(panel.props("patch")).toEqual(patch);
        expect(input.element.value).toBe(selected);
        expect(panel.find(".cell-format-font__list").exists()).toBe(false);
      } finally {
        wrapper.unmount();
        host.remove();
        geometry.mockRestore();
      }
    },
  );

  test("restores the current style when an unmatched query is committed", async () => {
    const { host, wrapper, panel } = mountPanel();
    try {
      const autocomplete = panel.get("[data-cell-format-font-style]").getComponent(TAutoComplete);
      autocomplete.vm.$emit("change", "unsupported");
      await wrapper.vm.$nextTick();
      expect(panel.props("patch")).toEqual({});
      autocomplete.vm.$emit("enter");
      await wrapper.vm.$nextTick();
      expect(autocomplete.props("modelValue")).toBe("Regular");
      expect(panel.props("patch")).toEqual({});
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });
});
