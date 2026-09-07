import { DOMWrapper, mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import WorkbookDisplaySettings from "../../../../../modules/workbook/components/WorkbookDisplaySettings.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("WorkbookDisplaySettings menu", () => {
  test("uses localized labels and supports opening at the last item with the keyboard", async () => {
    const wrapper = mount(WorkbookDisplaySettings, {
      attachTo: document.body,
      props: { showHeaders: true, showGridLines: true, showAxisQuickTools: false },
      global: { plugins: [createAppI18n("zh-CN")] },
    });
    try {
      const trigger = wrapper.get('[data-view-control="display-settings"]');
      expect(trigger.attributes("aria-label")).toBe("显示设置");
      await trigger.trigger("keydown", { key: "ArrowUp" });
      const menu = new DOMWrapper(document.body).get("[data-display-settings-menu]");
      expect(menu.findAll('[role="menuitemcheckbox"]').map((item) => item.text())).toEqual([
        "行号列标",
        "网格线",
        "行列快捷工具",
      ]);
      const quickTools = menu.get('[data-display-option="axis-quick-tools"]');
      expect(document.activeElement).toBe(quickTools.element);
      await quickTools.trigger("keydown", { key: "Enter" });
      expect(wrapper.emitted("update:showAxisQuickTools")).toEqual([[true]]);
    } finally {
      wrapper.unmount();
    }
  });
});
