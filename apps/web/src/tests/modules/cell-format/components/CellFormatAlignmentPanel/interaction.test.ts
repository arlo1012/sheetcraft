import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { createDefaultSelectionCellStyleState } from "@idea10/core/style-state";
import CellFormatAlignmentPanel from "../../../../../modules/cell-format/components/CellFormatAlignmentPanel.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("CellFormatAlignmentPanel", () => {
  test("writes only selected fields and clears default vertical alignment", async () => {
    const wrapper = mount(CellFormatAlignmentPanel, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { state: createDefaultSelectionCellStyleState(), patch: {} },
    });
    wrapper
      .get("[data-cell-format-horizontal]")
      .findComponent({ name: "TSelect" })
      .vm.$emit("change", "center");
    wrapper
      .get("[data-cell-format-vertical]")
      .findComponent({ name: "TSelect" })
      .vm.$emit("change", "middle");
    wrapper
      .get("[data-cell-format-wrap]")
      .findComponent({ name: "TCheckbox" })
      .vm.$emit("change", true);
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("update:patch")).toEqual([
      [{ horizontalAlign: "center" }],
      [{ verticalAlign: null }],
      [{ wrapText: true }],
    ]);
  });
  test("distinguishes default alignment, mixed values and an explicit reset", async () => {
    const state = createDefaultSelectionCellStyleState();
    const wrapper = mount(CellFormatAlignmentPanel, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { state, patch: {} },
    });
    try {
      const horizontal = () =>
        wrapper.get("[data-cell-format-horizontal]").findComponent({ name: "TSelect" });
      const vertical = () =>
        wrapper.get("[data-cell-format-vertical]").findComponent({ name: "TSelect" });
      expect(horizontal().props("modelValue")).toBe("left");
      expect(vertical().props("modelValue")).toBe("middle");
      await wrapper.setProps({
        state: {
          ...state,
          horizontalAlign: { value: "right", mixed: true },
          verticalAlign: { value: "bottom", mixed: true },
          wrapText: "mixed",
        },
      });
      expect(horizontal().props("modelValue")).toBeUndefined();
      expect(vertical().props("modelValue")).toBeUndefined();
      expect(
        wrapper
          .get("[data-cell-format-wrap]")
          .findComponent({ name: "TCheckbox" })
          .props("indeterminate"),
      ).toBe(true);
      await wrapper.setProps({
        patch: { horizontalAlign: null, verticalAlign: null, wrapText: true },
      });
      expect(horizontal().props("modelValue")).toBe("left");
      expect(vertical().props("modelValue")).toBe("middle");
      expect(
        wrapper
          .get("[data-cell-format-wrap]")
          .findComponent({ name: "TCheckbox" })
          .props("indeterminate"),
      ).toBe(false);
      expect(wrapper.emitted("update:patch")).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });
});
