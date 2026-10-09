import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { defineComponent, ref } from "vue";
import { createDefaultSelectionCellStyleState } from "@sheetcraft/core/style-state";
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
    expect(wrapper.find('[data-cell-format-number-kind] [aria-selected="true"]').exists()).toBe(
      false,
    );
    await wrapper.get('[data-cell-format-number-category="percent"]').trigger("click");
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
      expect(currency.props("options")).toContainEqual(
        expect.objectContaining({ value: "GBP", label: "£" }),
      );
      expect(currency.props("valueDisplay")).toBe("£");
      const digits = wrapper
        .get("[data-cell-format-decimals]")
        .findComponent({ name: "TInputNumber" });
      digits.vm.$emit("change", 25);
      await wrapper.vm.$nextTick();
      expect(wrapper.emitted("update:patch")?.at(-1)).toEqual([
        {
          numberFormat: {
            kind: "currency",
            currency: "GBP",
            fractionDigits: 20,
          },
        },
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

  test("makes an explicit mixed-format choice persist through the parent patch", async () => {
    const state = createDefaultSelectionCellStyleState();
    state.numberFormat = {
      value: { kind: "number", fractionDigits: 3 },
      mixed: true,
    };
    const Harness = defineComponent({
      components: { CellFormatNumberPanel },
      setup() {
        const patch = ref({});
        return { state, patch };
      },
      template: `<CellFormatNumberPanel :state="state" :patch="patch" :sample-value="1234.5" @update:patch="patch = { ...patch, ...$event }" />`,
    });
    const wrapper = mount(Harness, {
      global: { plugins: [createAppI18n("en-US")] },
    });
    await wrapper.get('[data-cell-format-number-category="date"]').trigger("click");
    await wrapper.vm.$nextTick();
    expect(
      wrapper.get('[data-cell-format-number-category="date"]').attributes("aria-selected"),
    ).toBe("true");
    expect(wrapper.get("[data-cell-format-number-preview]").text()).not.toBe("Mixed");
  });

  test.each([
    "general",
    "number",
    "currency",
    "accounting",
    "date",
    "time",
    "percent",
    "fraction",
    "scientific",
    "text",
    "special",
    "custom",
  ] as const)("selecting %s emits a saveable format and a concrete preview", async (category) => {
    const state = createDefaultSelectionCellStyleState();
    const wrapper = mount(CellFormatNumberPanel, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { state, patch: {}, sampleValue: 45292.5625 },
    });
    await wrapper.get(`[data-cell-format-number-category="${category}"]`).trigger("click");
    await wrapper.vm.$nextTick();
    const patch = (wrapper.emitted("update:patch") ?? []).at(-1)?.[0] as {
      numberFormat: unknown;
    };
    if (category === "general") expect(patch).toBeUndefined();
    else {
      expect(patch).toBeDefined();
      expect(patch.numberFormat).toBeTypeOf("object");
    }
    expect(wrapper.get("[data-cell-format-number-preview]").text()).not.toMatch(/^(—|####|Mixed)$/);
    wrapper.unmount();
  });

  test("changes date and time types, preserves their codes, and replaces them for a new region", async () => {
    const state = createDefaultSelectionCellStyleState();
    const wrapper = mount(CellFormatNumberPanel, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { state, patch: {}, sampleValue: 40982.5 },
    });
    await wrapper.get('[data-cell-format-number-category="date"]').trigger("click");
    const dateTypes = wrapper.findAll("[data-cell-format-type]");
    await dateTypes[2]!.trigger("click");
    let patch = (wrapper.emitted("update:patch") ?? []).at(-1)?.[0] as {
      numberFormat: { code: string };
    };
    expect(patch.numberFormat).toMatchObject({
      kind: "date",
      locale: "en-US",
    });
    expect(patch.numberFormat.code).toBe(dateTypes[2]!.attributes("data-cell-format-type"));
    const region = wrapper.get("[data-cell-format-region]").findComponent({ name: "TSelect" });
    region.vm.$emit("change", "zh-CN");
    await wrapper.vm.$nextTick();
    patch = (wrapper.emitted("update:patch") ?? []).at(-1)?.[0] as {
      numberFormat: { code: string };
    };
    expect(patch.numberFormat).toMatchObject({ kind: "date", locale: "zh-CN" });
    expect(wrapper.findAll("[data-cell-format-type]").length).toBeGreaterThan(5);
    await wrapper.get('[data-cell-format-number-category="time"]').trigger("click");
    const timePatch = (wrapper.emitted("update:patch") ?? []).at(-1)?.[0] as
      | { numberFormat: unknown }
      | undefined;
    expect(timePatch?.numberFormat).toMatchObject({
      kind: "time",
      locale: "zh-CN",
    });
  });

  test("uses the 1904 date system in the date preview", async () => {
    const state = createDefaultSelectionCellStyleState();
    const wrapper = mount(CellFormatNumberPanel, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { state, patch: {}, sampleValue: 0, dateSystem: "1904" },
    });
    await wrapper.get('[data-cell-format-number-category="date"]').trigger("click");
    expect(wrapper.get("[data-cell-format-number-preview]").text()).toContain("1904");
  });

  test("does not save an invalid custom code until it becomes valid", async () => {
    const state = createDefaultSelectionCellStyleState();
    const wrapper = mount(CellFormatNumberPanel, {
      global: { plugins: [createAppI18n("en-US")] },
      props: { state, patch: {}, sampleValue: 12.3 },
    });
    await wrapper.get('[data-cell-format-number-category="custom"]').trigger("click");
    const input = wrapper.get("[data-cell-format-custom-code]").findComponent({ name: "TInput" });
    const count = wrapper.emitted("update:patch")?.length ?? 0;
    input.vm.$emit("change", "[broken");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("validity-change")?.at(-1)).toEqual([false]);
    expect(wrapper.emitted("update:patch")).toHaveLength(count);
    input.vm.$emit("change", "0.000");
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted("validity-change")?.at(-1)).toEqual([true]);
    expect(wrapper.emitted("update:patch")?.at(-1)).toEqual([
      { numberFormat: { kind: "custom", code: "0.000", locale: "en-US" } },
    ]);
  });

  test("renders DBNum special formats and color-coded negative values", async () => {
    const state = createDefaultSelectionCellStyleState();
    const wrapper = mount(CellFormatNumberPanel, {
      global: { plugins: [createAppI18n("zh-CN")] },
      props: { state, patch: {}, sampleValue: -1234 },
    });
    await wrapper.get('[data-cell-format-number-category="special"]').trigger("click");
    await wrapper.get('[data-cell-format-type="[DBNum1][$-804]General"]').trigger("click");
    expect(wrapper.get("[data-cell-format-number-preview]").text()).toMatch(
      /[一二三四五六七八九十]/,
    );
    await wrapper.get('[data-cell-format-number-category="number"]').trigger("click");
    await wrapper.get('[data-cell-format-type="red"]').trigger("click");
    expect(wrapper.get("[data-cell-format-number-preview]").attributes("style")).toMatch(
      /color:\s*(red|rgb)/,
    );
  });
});
