import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import BorderLineStylePanel from "../../../../shared/borders/BorderLineStylePanel.vue";
import { createAppI18n } from "../../../../shared/i18n";

const global = { plugins: [createAppI18n("en-US")] };

describe("BorderLineStylePanel", () => {
  test("keeps its menu contract and emits all line style selections", async () => {
    const wrapper = mount(BorderLineStylePanel, {
      global,
      props: { modelValue: "thin" },
    });

    expect(wrapper.attributes("role")).toBe("menu");
    expect(wrapper.findAll('[role="menuitemradio"]')).toHaveLength(14);
    await wrapper.get('[data-border-line-option="mediumDashDotDot"]').trigger("click");
    await wrapper.get('[data-border-line-option="slantDashDot"]').trigger("click");
    await wrapper.get('[data-border-line-option="none"]').trigger("click");

    expect(wrapper.emitted("select")).toEqual([["mediumDashDotDot"], ["slantDashDot"], [null]]);
  });

  test("uses its supplied color for every line preview", () => {
    const wrapper = mount(BorderLineStylePanel, {
      global,
      props: { modelValue: "thin", color: "#4472c4" },
    });

    expect(wrapper.findAll("svg line")).toHaveLength(14);
    expect(
      wrapper.findAll("svg line").every((line) => line.attributes("stroke") === "#4472c4"),
    ).toBe(true);
  });
});
