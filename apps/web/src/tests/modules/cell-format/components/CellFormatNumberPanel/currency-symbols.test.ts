import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { createDefaultSelectionCellStyleState } from "@idea10/core/style-state";
import type { CellStylePatch } from "@idea10/core/style";
import CellFormatNumberPanel from "../../../../../modules/cell-format/components/CellFormatNumberPanel.vue";
import type { CurrencySymbolOption } from "../../../../../modules/cell-format/number-format/currency-options";
import { createAppI18n } from "../../../../../shared/i18n";

describe("CellFormatNumberPanel currency symbols", () => {
  test.each(["currency", "accounting"] as const)(
    "%s preserves symbol and locale when changing decimals and reopening",
    async (kind) => {
      const state = createDefaultSelectionCellStyleState();
      state.numberFormat = { value: { kind, currency: "USD", fractionDigits: 2 }, mixed: false };
      const wrapper = mount(CellFormatNumberPanel, {
        global: { plugins: [createAppI18n("en-US")] },
        props: { state, patch: {}, sampleValue: 1234.5 },
      });
      try {
        const select = wrapper
          .get("[data-cell-format-currency]")
          .findComponent({ name: "TSelect" });
        const options = select.props("options") as CurrencySymbolOption[];
        const choice = options.find(({ label }) => label === "US$")!;
        select.vm.$emit("change", choice.value);
        await wrapper.vm.$nextTick();
        const patch = wrapper.emitted("update:patch")!.at(-1)![0] as CellStylePatch;
        expect(patch.numberFormat).toEqual({
          kind,
          currency: "USD",
          currencySymbol: "US$",
          locale: "en-US",
          fractionDigits: 2,
        });
        expect(wrapper.get("[data-cell-format-number-preview]").text()).toContain("US$");
        expect(select.props("valueDisplay")).toBe("US$");

        const digits = wrapper
          .get("[data-cell-format-decimals]")
          .findComponent({ name: "TInputNumber" });
        digits.vm.$emit("change", 3);
        await wrapper.vm.$nextTick();
        expect(
          (wrapper.emitted("update:patch")!.at(-1)![0] as CellStylePatch).numberFormat,
        ).toEqual({ ...patch.numberFormat, fractionDigits: 3 });

        const reopened = mount(CellFormatNumberPanel, {
          global: { plugins: [createAppI18n("zh-CN")] },
          props: { state, patch, sampleValue: 1234.5 },
        });
        try {
          const reopenedSelect = reopened
            .get("[data-cell-format-currency]")
            .findComponent({ name: "TSelect" });
          expect(reopenedSelect.props("modelValue")).toBe(choice.value);
          expect(reopenedSelect.props("valueDisplay")).toBe("US$");
          expect(reopened.get("[data-cell-format-number-preview]").text()).toContain("US$");
        } finally {
          reopened.unmount();
        }

        const canadian = options.find(({ choice }) => choice.locale === "en-CA")!;
        select.vm.$emit("change", canadian.value);
        await wrapper.vm.$nextTick();
        expect(
          (wrapper.emitted("update:patch")!.at(-1)![0] as CellStylePatch).numberFormat,
        ).toMatchObject({ currency: "CAD", currencySymbol: "$", locale: "en-CA" });
        select.vm.$emit("change", "");
        await wrapper.vm.$nextTick();
        expect(
          (wrapper.emitted("update:patch")!.at(-1)![0] as CellStylePatch).numberFormat,
        ).toEqual({ kind, currency: "", fractionDigits: 3 });
        expect(wrapper.get("[data-cell-format-number-preview]").text()).not.toContain("$");
      } finally {
        wrapper.unmount();
      }
    },
  );
});
