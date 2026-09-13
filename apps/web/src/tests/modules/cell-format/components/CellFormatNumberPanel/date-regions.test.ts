import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { createDefaultSelectionCellStyleState } from "@idea10/core/style-state";
import type { CellStylePatch } from "@idea10/core/style";
import { formatCellNumberValue, getNumberFormatLocaleId } from "@idea10/core/number-format";
import CellFormatNumberPanel from "../../../../../modules/cell-format/components/CellFormatNumberPanel.vue";
import { getDateFormatPresets } from "../../../../../shared/number-format/date-presets";
import { createAppI18n } from "../../../../../shared/i18n";

describe("CellFormatNumberPanel date regions", () => {
  test.each([
    ["en-US", "date-short-padded", "fr-FR", "date-short"],
    ["zh-CN", "date-native-year-month", "en-US", "date-year-month"],
  ])(
    "keeps the %s %s family through merged or equivalent regional rows",
    async (locale, id, otherLocale, otherId) => {
      const preset = getDateFormatPresets(locale).find((preset) => preset.id === id)!;
      const state = createDefaultSelectionCellStyleState();
      state.numberFormat = { value: { kind: "date", code: preset.code, locale }, mixed: false };
      const wrapper = mount(CellFormatNumberPanel, {
        global: { plugins: [createAppI18n("en-US")] },
        props: { state, patch: {}, sampleValue: 40982 },
      });
      try {
        const region = wrapper.get("[data-cell-format-region]").findComponent({ name: "TSelect" });
        region.vm.$emit("change", otherLocale);
        await wrapper.vm.$nextTick();
        const target = getDateFormatPresets(otherLocale).find((preset) => preset.id === otherId)!;
        expect(
          (wrapper.emitted("update:patch")!.at(-1)![0] as CellStylePatch).numberFormat,
        ).toEqual({ kind: "date", code: target.code, locale: otherLocale });
        expect(wrapper.findAll('[data-cell-format-type][aria-selected="true"]')).toHaveLength(1);
        region.vm.$emit("change", locale);
        await wrapper.vm.$nextTick();
        expect(
          (wrapper.emitted("update:patch")!.at(-1)![0] as CellStylePatch).numberFormat,
        ).toEqual({ kind: "date", code: preset.code, locale });
      } finally {
        wrapper.unmount();
      }
    },
  );

  test("retains the full-date type across regions and preserves the choice when reopened", async () => {
    const state = createDefaultSelectionCellStyleState();
    const sampleValue = 40982.5;
    const wrapper = mount(CellFormatNumberPanel, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { state, patch: {}, sampleValue },
    });
    try {
      await wrapper.get('[data-cell-format-number-category="date"]').trigger("click");
      const full = getDateFormatPresets("en-US").find(({ id }) => id === "date-full")!;
      await wrapper
        .findAll("[data-cell-format-type]")
        .find((row) => row.attributes("data-cell-format-type") === full.code)!
        .trigger("click");
      const region = wrapper.get("[data-cell-format-region]").findComponent({ name: "TSelect" });
      expect(region.props("filterable")).toBe(true);
      expect(region.props("options").length).toBeGreaterThan(200);
      for (const locale of ["de-DE", "fr-FR", "zh-TW", "en-GB"]) {
        region.vm.$emit("change", locale);
        await wrapper.vm.$nextTick();
        const patch = wrapper.emitted("update:patch")!.at(-1)![0] as CellStylePatch;
        const expected = getDateFormatPresets(locale).find(({ id }) => id === "date-full")!;
        expect(patch.numberFormat).toEqual({ kind: "date", locale, code: expected.code });
        expect(expected.code).toContain(`[$-${getNumberFormatLocaleId(locale)}]`);
        expect(
          wrapper
            .get('[data-cell-format-type][aria-selected="true"]')
            .attributes("data-cell-format-type"),
        ).toBe(expected.code);
        expect(wrapper.get("[data-cell-format-number-preview]").text()).toBe(
          formatCellNumberValue(sampleValue, { kind: "date", locale, code: expected.code }).text,
        );
      }
      const patch = wrapper.emitted("update:patch")!.at(-1)![0] as CellStylePatch;
      const reopened = mount(CellFormatNumberPanel, {
        global: { plugins: [createAppI18n("zh-CN")] },
        props: { state, patch, sampleValue },
      });
      try {
        const select = reopened.get("[data-cell-format-region]").findComponent({ name: "TSelect" });
        expect(select.props("modelValue")).toBe("en-GB");
        expect(reopened.emitted("update:patch")).toBeUndefined();
        expect(reopened.get("[data-cell-format-number-preview]").text()).toBe(
          wrapper.get("[data-cell-format-number-preview]").text(),
        );
      } finally {
        reopened.unmount();
      }
      const count = wrapper.emitted("update:patch")!.length;
      region.vm.$emit("change", "not-a-real-region");
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("update:patch")).toHaveLength(count);
    } finally {
      wrapper.unmount();
    }
  });

  test("keeps an imported date code and region selected without applying a replacement", () => {
    const state = createDefaultSelectionCellStyleState();
    const code = '[$-40C]dd"/"mm"/"yyyy" imported"';
    state.numberFormat = { value: { kind: "date", code, locale: "fr-FR" }, mixed: false };
    const wrapper = mount(CellFormatNumberPanel, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { state, patch: {}, sampleValue: 40982 },
    });
    try {
      expect(wrapper.emitted("update:patch")).toBeUndefined();
      expect(
        wrapper
          .get('[data-cell-format-type][aria-selected="true"]')
          .attributes("data-cell-format-type"),
      ).toBe(code);
      expect(
        wrapper
          .get("[data-cell-format-region]")
          .findComponent({ name: "TSelect" })
          .props("modelValue"),
      ).toBe("fr-FR");
      expect(wrapper.get("[data-cell-format-number-preview]").text()).toBe("14/03/2012 imported");
    } finally {
      wrapper.unmount();
    }
  });
});
