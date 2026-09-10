import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { createDefaultSelectionCellStyleState } from "@idea10/core/style-state";
import CellFormatAlignmentPanel from "../../../../../modules/cell-format/components/CellFormatAlignmentPanel.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("CellFormatAlignmentPanel", () => {
  test("writes only selected fields and keeps non-default alignment explicit", async () => {
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
      [{ verticalAlign: "middle" }],
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
      expect(horizontal().props("modelValue")).toBe("general");
      expect(vertical().props("modelValue")).toBe("bottom");
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
      expect(horizontal().props("modelValue")).toBe("general");
      expect(vertical().props("modelValue")).toBe("bottom");
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
  test("enables indentation only for compatible alignment and preserves draft merge state", async () => {
    const wrapper = mount(CellFormatAlignmentPanel, {
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        state: createDefaultSelectionCellStyleState(),
        patch: {},
        mergeState: "mixed",
        mergeEnabled: true,
      },
    });
    const indent = () =>
      wrapper.get("[data-cell-format-indent]").findComponent({ name: "TInputNumber" });
    expect(indent().props("disabled")).toBe(true);
    wrapper
      .get("[data-cell-format-horizontal]")
      .findComponent({ name: "TSelect" })
      .vm.$emit("change", "left");
    await wrapper.setProps({ patch: { horizontalAlign: "left" } });
    expect(indent().props("disabled")).toBe(false);
    indent().vm.$emit("change", 4);
    wrapper
      .get("[data-cell-format-merge]")
      .findComponent({ name: "TCheckbox" })
      .vm.$emit("change", true);
    expect(wrapper.emitted("update:patch")?.at(-1)).toEqual([{ indent: 4 }]);
    expect(wrapper.emitted("update:merge")).toEqual([[true]]);
  });
  test("uses effective wrapping for justify and preserves General numeric preview alignment", async () => {
    const state = createDefaultSelectionCellStyleState();
    const wrapper = mount(CellFormatAlignmentPanel, {
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        state,
        patch: { horizontalAlign: "justify", shrinkToFit: true },
        sampleValue: 1234,
      },
    });
    const wrap = wrapper.get("[data-cell-format-wrap]").findComponent({ name: "TCheckbox" });
    const shrink = wrapper.get("[data-cell-format-shrink]").findComponent({ name: "TCheckbox" });
    expect(wrap.props("modelValue")).toBe(true);
    expect(wrap.props("disabled")).toBe(true);
    expect(shrink.props("disabled")).toBe(true);

    await wrapper.setProps({ patch: {} });
    expect(wrapper.get("[data-cell-text-alignment]").attributes("data-cell-text-alignment")).toBe(
      "right",
    );
  });
});
