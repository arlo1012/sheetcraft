import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { createDefaultSelectionCellStyleState } from "@idea10/core/style-state";
import CellFormatNumberPanel from "../../../../../modules/cell-format/components/CellFormatNumberPanel.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("CellFormatNumberPanel", () => {
  test("keeps an untouched mixed format out of the patch and uses a new explicit choice", async () => {
    const state = createDefaultSelectionCellStyleState();
    state.numberFormat = {
      value: { kind: "currency", currency: "USD", fractionDigits: 4 },
      mixed: true,
    };
    const wrapper = mount(CellFormatNumberPanel, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { state, patch: {}, sampleValue: 12.3 },
    });
    expect(wrapper.emitted("update:patch")).toBeUndefined();
    wrapper
      .get("[data-cell-format-number-kind]")
      .findComponent({ name: "TSelect" })
      .vm.$emit("change", "percent");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("update:patch")).toEqual([
      [{ numberFormat: { kind: "percent", fractionDigits: 2 } }],
    ]);
  });
  test("preserves a current currency and bounds decimals before preview or submission", async () => {
    const state = createDefaultSelectionCellStyleState();
    state.numberFormat = {
      value: { kind: "currency", currency: "GBP", fractionDigits: 4 },
      mixed: false,
    };
    const wrapper = mount(CellFormatNumberPanel, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { state, patch: {}, sampleValue: 1.2345 },
    });
    try {
      const currency = wrapper
        .get("[data-cell-format-currency]")
        .findComponent({ name: "TSelect" });
      expect(currency.props("modelValue")).toBe("GBP");
      expect(currency.props("options")).toContainEqual({ value: "GBP", label: "GBP" });
      const digits = wrapper
        .get("[data-cell-format-decimals]")
        .findComponent({ name: "TInputNumber" });
      digits.vm.$emit("change", 25);
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("update:patch")?.at(-1)).toEqual([
        { numberFormat: { kind: "currency", currency: "GBP", fractionDigits: 20 } },
      ]);
      expect(wrapper.get("[data-cell-format-number-preview]").text()).toContain("£1.2345");
      digits.vm.$emit("change", Number.NaN);
      expect(wrapper.emitted("update:patch")).toHaveLength(1);
      await wrapper.setProps({ sampleValue: "Invoice" });
      expect(wrapper.get("[data-cell-format-number-preview]").text()).toBe("Invoice");
    } finally {
      wrapper.unmount();
    }
  });
});
