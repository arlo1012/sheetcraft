import { mount } from "@vue/test-utils";
import { createDefaultSelectionCellStyleState } from "@sheetcraft/core/style-state";
import { describe, expect, test } from "vitest";
import SpreadsheetRibbon from "../../../app/SpreadsheetRibbon.vue";
import { createAppI18n } from "../../../shared/i18n";

describe("SpreadsheetRibbon chart context", () => {
  test.each(["en-US", "zh-CN"] as const)(
    "%s chart tools join keyboard order and restore the preceding ordinary category",
    async (locale) => {
      const wrapper = mount(SpreadsheetRibbon, {
        attachTo: document.body,
        props: { state: createDefaultSelectionCellStyleState(), disabled: false },
        global: { plugins: [createAppI18n(locale)] },
        slots: {
          "chart-tools": "<span data-chart-panel>Chart controls</span>",
          "insert-tools": "<span data-insert-panel>Insert controls</span>",
        },
      });
      try {
        await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
        await wrapper.setProps({ hasChart: true });
        const tab = wrapper.get('[data-ribbon-category="chart"]');
        expect(tab.text()).toBe(locale === "zh-CN" ? "图表工具" : "Chart Tools");
        expect(tab.attributes("aria-selected")).toBe("true");
        expect(wrapper.get('[role="tabpanel"]').attributes("aria-labelledby")).toBe(
          tab.attributes("id"),
        );
        expect(wrapper.find("[data-chart-panel]").exists()).toBe(true);
        await tab.trigger("keydown", { key: "ArrowRight" });
        expect(wrapper.get('[data-ribbon-category="home"]').attributes("aria-selected")).toBe(
          "true",
        );
        await wrapper.get('[data-ribbon-category="home"]').trigger("keydown", { key: "End" });
        expect(tab.attributes("aria-selected")).toBe("true");
        expect(document.activeElement).toBe(tab.element);
        await tab.trigger("keydown", { key: "ArrowLeft" });
        expect(wrapper.get('[data-ribbon-category="view"]').attributes("aria-selected")).toBe(
          "true",
        );
        await wrapper.get('[data-ribbon-category="view"]').trigger("keydown", { key: "End" });
        await wrapper.setProps({ hasChart: false });
        expect(wrapper.find('[data-ribbon-category="chart"]').exists()).toBe(false);
        expect(wrapper.find("[data-chart-panel]").exists()).toBe(false);
        expect(wrapper.get('[data-ribbon-category="view"]').attributes("aria-selected")).toBe(
          "true",
        );
        await wrapper.get('[data-ribbon-category="insert"]').trigger("click");
        await wrapper.setProps({ hasChart: true });
        await wrapper.setProps({ hasChart: false });
        expect(wrapper.get('[data-ribbon-category="insert"]').attributes("aria-selected")).toBe(
          "true",
        );
      } finally {
        wrapper.unmount();
      }
    },
  );

  test("late shape and pivot signals do not steal selected chart tools", async () => {
    const wrapper = mount(SpreadsheetRibbon, {
      props: { state: createDefaultSelectionCellStyleState(), disabled: false },
      global: { plugins: [createAppI18n("en-US")] },
      slots: {
        "chart-tools": "<span data-chart-panel>Chart controls</span>",
        "shape-tools": "<span data-shape-panel>Shape controls</span>",
        "pivot-analysis-tools": "<span data-pivot-panel>Pivot controls</span>",
      },
    });
    try {
      await wrapper.setProps({ hasChart: true });
      await wrapper.setProps({ hasShape: true });
      await wrapper.setProps({ pivotId: "source-report" });
      expect(wrapper.get('[data-ribbon-category="chart"]').attributes("aria-selected")).toBe(
        "true",
      );
      expect(wrapper.find("[data-chart-panel]").exists()).toBe(true);
      expect(wrapper.find("[data-shape-panel]").exists()).toBe(false);
      expect(wrapper.find("[data-pivot-panel]").exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });
});
