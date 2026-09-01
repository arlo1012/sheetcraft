import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import BorderColorPanel from "../../../../../modules/home-tools/components/BorderColorPanel.vue";
import BorderLineStylePanel from "../../../../../modules/home-tools/components/BorderLineStylePanel.vue";
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

    await wrapper.get('[data-border-color="#3b82f6"]').trigger("click");
    expect(wrapper.emitted("update")).toEqual([["#3b82f6"]]);
  });

  test("emits line style selections for menu and settings presentations", async () => {
    const menu = mount(BorderLineStylePanel, {
      global,
      props: { modelValue: "thin" },
    });
    const settings = mount(BorderLineStylePanel, {
      global,
      props: { modelValue: "thin", variant: "settings" },
    });

    await menu.get('[data-border-line-option="double"]').trigger("click");
    await settings.get('[data-border-settings-style="dotted"]').trigger("click");

    expect(menu.emitted("select")).toEqual([["double"]]);
    expect(settings.emitted("select")).toEqual([["dotted"]]);
  });
});
