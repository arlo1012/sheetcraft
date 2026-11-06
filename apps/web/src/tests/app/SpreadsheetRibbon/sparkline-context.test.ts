// 未执行：按用户要求仅编写，待全部功能完成后统一运行。
import { mount } from "@vue/test-utils";
import { createDefaultSelectionCellStyleState } from "@sheetcraft/core/style-state";
import { describe, expect, test } from "vitest";
import SpreadsheetRibbon from "../../../app/SpreadsheetRibbon.vue";
import { createAppI18n } from "../../../shared/i18n";

function fixture(locale: "en-US" | "zh-CN" = "en-US") {
  return mount(SpreadsheetRibbon, {
    attachTo: document.body,
    props: { state: createDefaultSelectionCellStyleState(), disabled: false },
    global: { plugins: [createAppI18n(locale)] },
    slots: {
      "sparkline-tools": "<span data-sparkline-panel>Sparkline controls</span>",
      "insert-tools": "<span data-insert-panel>Insert controls</span>",
      "chart-tools": "<span data-chart-panel>Chart controls</span>",
      "equation-tools": "<span data-equation-panel>Equation controls</span>",
    },
  });
}

describe("SpreadsheetRibbon sparkline context", () => {
  test.each(["en-US", "zh-CN"] as const)(
    "%s selects sparkline tools when entering a sparkline and restores the ordinary category on leaving",
    async (locale) => {
      const wrapper = fixture(locale);
      try {
        expect(wrapper.find('[data-ribbon-category="sparkline"]').exists()).toBe(false);
        expect(wrapper.find("[data-sparkline-panel]").exists()).toBe(false);
        await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
        await wrapper.setProps({ hasSparkline: true });
        const tab = wrapper.get('[data-ribbon-category="sparkline"]');
        expect(tab.text().trim()).not.toBe("");
        expect(tab.attributes("aria-selected")).toBe("true");
        expect(tab.attributes("tabindex")).toBe("0");
        expect(wrapper.get("[data-sparkline-panel]").text()).toBe("Sparkline controls");
        const panel = wrapper.get('[role="tabpanel"]');
        expect(tab.attributes("aria-controls")).toBe(panel.attributes("id"));
        expect(panel.attributes("aria-labelledby")).toBe(tab.attributes("id"));

        await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
        expect(wrapper.find("[data-sparkline-panel]").exists()).toBe(false);
        expect(wrapper.find("[data-insert-panel]").exists()).toBe(true);
        await tab.trigger("click");
        expect(wrapper.find("[data-sparkline-panel]").exists()).toBe(true);

        await wrapper.setProps({ hasSparkline: false });
        expect(wrapper.find('[data-ribbon-category="sparkline"]').exists()).toBe(false);
        expect(wrapper.find("[data-sparkline-panel]").exists()).toBe(false);
        expect(wrapper.get('[data-ribbon-category="insert"]').attributes("aria-selected")).toBe(
          "true",
        );
        expect(wrapper.find("[data-insert-panel]").exists()).toBe(true);
      } finally {
        wrapper.unmount();
      }
    },
  );

  test("arrow navigation follows visible DOM order through sparkline tools and links the active panel", async () => {
    const wrapper = fixture();
    try {
      await wrapper.setProps({ hasChart: true, hasSparkline: true, hasEquation: true });
      const tabs = wrapper.findAll('[role="tab"][data-ribbon-category]');
      const index = tabs.findIndex((tab) => tab.attributes("data-ribbon-category") === "sparkline");
      expect(index).toBeGreaterThan(0);
      expect(index).toBeLessThan(tabs.length - 1);
      const previous = tabs[index - 1]!;
      const sparkline = tabs[index]!;
      const next = tabs[index + 1]!;
      expect(previous.attributes("data-ribbon-category")).toBe("chart");
      expect(next.attributes("data-ribbon-category")).toBe("equation");
      await previous.trigger("click");
      await previous.trigger("keydown", { key: "ArrowRight" });
      expect(sparkline.attributes("aria-selected")).toBe("true");
      expect(document.activeElement).toBe(sparkline.element);
      const panel = wrapper.get('[role="tabpanel"]');
      expect(sparkline.attributes("aria-controls")).toBe(panel.attributes("id"));
      expect(panel.attributes("aria-labelledby")).toBe(sparkline.attributes("id"));
      expect(wrapper.find("[data-sparkline-panel]").exists()).toBe(true);

      await sparkline.trigger("keydown", { key: "ArrowRight" });
      expect(next.attributes("aria-selected")).toBe("true");
      expect(document.activeElement).toBe(next.element);
      await next.trigger("keydown", { key: "ArrowLeft" });
      expect(sparkline.attributes("aria-selected")).toBe("true");
      await sparkline.trigger("keydown", { key: "ArrowLeft" });
      expect(previous.attributes("aria-selected")).toBe("true");
    } finally {
      wrapper.unmount();
    }
  });

  test("removing a sparkline signal does not replace a newly selected ordinary category", async () => {
    const wrapper = fixture();
    try {
      await wrapper.setProps({ hasSparkline: true });
      await wrapper.get('[data-ribbon-category="data"]').trigger("click");
      await wrapper.setProps({ hasSparkline: false });
      expect(wrapper.get('[data-ribbon-category="data"]').attributes("aria-selected")).toBe("true");
    } finally {
      wrapper.unmount();
    }
  });
});
