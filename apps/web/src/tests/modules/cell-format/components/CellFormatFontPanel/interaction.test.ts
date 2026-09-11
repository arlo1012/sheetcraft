import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { defineComponent, ref } from "vue";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { createDefaultSelectionCellStyleState } from "@idea10/core/style-state";
import type { CellStylePatch } from "@idea10/core/style";
import CellFormatFontPanel from "../../../../../modules/cell-format/components/CellFormatFontPanel.vue";
import CellFormatFontColorControl from "../../../../../modules/cell-format/components/CellFormatFontColorControl.vue";
import { createAppI18n } from "../../../../../shared/i18n";

function mountPanel(state = createDefaultSelectionCellStyleState()) {
  const Harness = defineComponent({
    components: { CellFormatFontPanel },
    setup() {
      const patch = ref<CellStylePatch>({});
      return { state, patch };
    },
    template: `<CellFormatFontPanel :state="state" :patch="patch" :sample-value="'AaBbCc'" @update:patch="patch = { ...patch, ...$event }" />`,
  });
  const wrapper = mount(Harness, { global: { plugins: [createAppI18n("en-US")] } });
  const panel = wrapper.getComponent(CellFormatFontPanel);
  return { wrapper, panel, patch: () => panel.props("patch") };
}

describe("CellFormatFontPanel", () => {
  test("leaves untouched mixed fields out of the patch", async () => {
    const state = createDefaultSelectionCellStyleState();
    state.fontFamily = { value: undefined, mixed: true };
    state.fontSize = { value: undefined, mixed: true };
    state.bold = "mixed";
    state.underline = "mixed";
    state.underlineStyle = { value: undefined, mixed: true };
    state.fontScript = { value: undefined, mixed: true };
    const { wrapper, panel, patch } = mountPanel(state);
    try {
      expect(panel.findAll('[role="option"][aria-selected="true"]')).toHaveLength(0);
      expect(
        panel.get("[data-cell-format-superscript]").getComponent(TCheckbox).props("indeterminate"),
      ).toBe(true);
      panel.get("[data-cell-format-font-size]").getComponent(TInput).vm.$emit("blur");
      await wrapper.vm.$nextTick();
      expect(patch()).toEqual({});
      await panel
        .get('[data-cell-format-font-style-list] [data-cell-format-option="regular"]')
        .trigger("click");
      expect(patch()).toEqual({ bold: null, italic: null });
    } finally {
      wrapper.unmount();
    }
  });

  test("uses font family and combined style lists without changing other fields", async () => {
    const { wrapper, panel, patch } = mountPanel();
    try {
      await panel
        .get('[data-cell-format-font-family-list] [data-cell-format-option="Arial"]')
        .trigger("click");
      await panel
        .get('[data-cell-format-font-style-list] [data-cell-format-option="boldItalic"]')
        .trigger("click");
      expect(patch()).toEqual({ fontFamily: "Arial", bold: true, italic: true });
      expect(
        panel.get("[data-cell-format-font-family]").getComponent(TInput).props("modelValue"),
      ).toBe("Arial");
      const preview = panel.get<HTMLElement>("[data-cell-format-font-preview]").element;
      expect(preview.style.fontFamily).toBe("Arial");
      expect(preview.style.fontWeight).toBe("700");
      expect(preview.style.fontStyle).toBe("italic");
    } finally {
      wrapper.unmount();
    }
  });

  test("commits a custom font name with spaces and rejects invalid drafts", async () => {
    const { wrapper, panel, patch } = mountPanel();
    try {
      const input = panel.get("[data-cell-format-font-family]").getComponent(TInput);
      input.vm.$emit("change", "Noto Sans ");
      await wrapper.vm.$nextTick();
      expect(input.props("modelValue")).toBe("Noto Sans ");
      expect(patch()).toEqual({});
      input.vm.$emit("change", "Noto Sans CJK");
      input.vm.$emit("blur");
      await wrapper.vm.$nextTick();
      expect(patch()).toEqual({ fontFamily: "Noto Sans CJK" });
      input.vm.$emit("change", "x".repeat(81));
      input.vm.$emit("blur");
      await wrapper.vm.$nextTick();
      expect(patch()).toEqual({ fontFamily: "Noto Sans CJK" });
      expect(input.props("modelValue")).toBe("Noto Sans CJK");
      input.vm.$emit("change", "");
      input.vm.$emit("blur");
      await wrapper.vm.$nextTick();
      expect(input.props("modelValue")).toBe("Noto Sans CJK");
    } finally {
      wrapper.unmount();
    }
  });

  test("links typed size and size list, clamps on blur, and restores an empty draft", async () => {
    const { wrapper, panel, patch } = mountPanel();
    try {
      const input = panel.get("[data-cell-format-font-size]").getComponent(TInput);
      input.vm.$emit("blur");
      expect(patch()).toEqual({});
      input.vm.$emit("change", "24");
      await wrapper.vm.$nextTick();
      expect(patch().fontSize).toBe(24);
      expect(
        panel
          .get('[data-cell-format-font-size-list] [data-cell-format-option="24"]')
          .attributes("aria-selected"),
      ).toBe("true");
      input.vm.$emit("change", "999");
      input.vm.$emit("blur");
      await wrapper.vm.$nextTick();
      expect(patch().fontSize).toBe(72);
      input.vm.$emit("change", "");
      input.vm.$emit("blur");
      await wrapper.vm.$nextTick();
      expect(input.props("modelValue")).toBe("72");
      await panel
        .get('[data-cell-format-font-size-list] [data-cell-format-option="18"]')
        .trigger("click");
      expect(input.props("modelValue")).toBe("18");
    } finally {
      wrapper.unmount();
    }
  });

  test("keeps superscript and subscript mutually exclusive and allows clearing", async () => {
    const { wrapper, panel, patch } = mountPanel();
    try {
      const superscript = panel.get("[data-cell-format-superscript]").getComponent(TCheckbox);
      const subscript = panel.get("[data-cell-format-subscript]").getComponent(TCheckbox);
      superscript.vm.$emit("change", true);
      await wrapper.vm.$nextTick();
      expect(patch()).toEqual({ fontScript: "superscript" });
      expect(superscript.props("checked")).toBe(true);
      subscript.vm.$emit("change", true);
      await wrapper.vm.$nextTick();
      expect(patch()).toEqual({ fontScript: "subscript" });
      expect(superscript.props("checked")).toBe(false);
      expect(subscript.props("checked")).toBe(true);
      expect(panel.get<HTMLElement>("[data-cell-format-font-preview]").element.style.fontSize).toBe(
        "9.75px",
      );
      subscript.vm.$emit("change", false);
      await wrapper.vm.$nextTick();
      expect(patch()).toEqual({ fontScript: null });
      expect(panel.get<HTMLElement>("[data-cell-format-font-preview]").element.style.fontSize).toBe(
        "13px",
      );
    } finally {
      wrapper.unmount();
    }
  });

  test("combines a double underline with a single strikethrough in the preview", async () => {
    const { wrapper, panel, patch } = mountPanel();
    try {
      panel
        .get("[data-cell-format-underline]")
        .getComponent(TSelect)
        .vm.$emit("change", "doubleAccounting");
      panel
        .get("[data-cell-format-strikethrough]")
        .getComponent(TCheckbox)
        .vm.$emit("change", true);
      await wrapper.vm.$nextTick();
      expect(patch()).toEqual({ underline: "doubleAccounting", strikethrough: true });
      const preview = panel.get<HTMLElement>("[data-cell-format-font-preview]");
      expect(preview.element.style.textDecoration).toBe("underline double");
      expect(preview.get<HTMLElement>("span").element.style.textDecoration).toBe("line-through");
    } finally {
      wrapper.unmount();
    }
  });

  test("clears a stored color using automatic color", async () => {
    const state = createDefaultSelectionCellStyleState();
    state.textColor = { value: "#ff0000", mixed: false };
    const { wrapper, panel, patch } = mountPanel(state);
    try {
      panel.getComponent(CellFormatFontColorControl).vm.$emit("select", null);
      await wrapper.vm.$nextTick();
      expect(patch()).toEqual({ textColor: null });
      expect(panel.get<HTMLElement>("[data-cell-format-font-preview]").element.style.color).toBe(
        "#20242c",
      );
    } finally {
      wrapper.unmount();
    }
  });
});
