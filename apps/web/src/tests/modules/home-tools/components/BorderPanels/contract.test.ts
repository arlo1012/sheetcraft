import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import BorderColorPanel from "../../../../../modules/home-tools/components/BorderColorPanel.vue";
import BorderPresetGrid from "../../../../../modules/home-tools/components/BorderPresetGrid.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const global = { plugins: [createAppI18n("en-US")] };

describe("border panel contracts", () => {
  test("emits a complete border action for a selected preset", async () => {
    const wrapper = mount(BorderPresetGrid, {
      global,
      props: { border: { style: "dashed", color: "#3b82f6" } },
    });

    await wrapper.get('[data-border-preset="outer"]').trigger("click");
    await wrapper.get('[data-border-preset="none"]').trigger("click");

    expect(wrapper.emitted("select")).toEqual([
      [{ preset: "outer", border: { style: "dashed", color: "#3b82f6" } }],
      [{ preset: "none" }],
    ]);
  });

  test("emits selected border colors without taking menu ownership", async () => {
    const wrapper = mount(BorderColorPanel, {
      global,
      props: { modelValue: "#20242c" },
    });

    await wrapper.get('[data-color-swatch="#4472c4"]').trigger("click");
    expect(wrapper.emitted("update")).toEqual([["#4472c4"]]);

    await wrapper.get('[data-color-action="default"]').trigger("click");
    expect(wrapper.emitted("update")).toEqual([["#4472c4"], ["#20242c"]]);
  });
});
