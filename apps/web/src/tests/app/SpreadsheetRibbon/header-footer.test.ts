import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import SpreadsheetRibbon from "../../../app/SpreadsheetRibbon.vue";
import { createDefaultSelectionCellStyleState } from "@idea10/core/style-state";
import { createAppI18n } from "../../../shared/i18n";

describe("SpreadsheetRibbon header/footer context", () => {
  test("opens header/footer tools in the existing panel and restores the prior category on finish", async () => {
    const wrapper = mount(SpreadsheetRibbon, {
      props: { state: createDefaultSelectionCellStyleState(), disabled: false },
      slots: { "view-tools": "View tools", "header-footer-tools": "Header tools" },
      global: { plugins: [createAppI18n("en-US")] },
    });
    try {
      await wrapper.get('[data-ribbon-category="view"]').trigger("click");
      await wrapper.setProps({ headerFooterEditing: true });
      const tab = wrapper.get('[data-ribbon-category="header-footer"]');
      expect(tab.attributes("aria-selected")).toBe("true");
      expect(wrapper.findAll('[role="tabpanel"]')).toHaveLength(1);
      expect(wrapper.get('[role="tabpanel"]').text()).toBe("Header tools");
      await tab.trigger("keydown", { key: "ArrowLeft" });
      expect(wrapper.get('[data-ribbon-category="view"]').attributes("aria-selected")).toBe("true");
      await wrapper.get('[data-ribbon-category="view"]').trigger("keydown", { key: "ArrowRight" });
      expect(tab.attributes("aria-selected")).toBe("true");
      await wrapper.setProps({ headerFooterEditing: false });
      expect(wrapper.find('[data-ribbon-category="header-footer"]').exists()).toBe(false);
      expect(wrapper.get('[data-ribbon-category="view"]').attributes("aria-selected")).toBe("true");
    } finally {
      wrapper.unmount();
    }
  });
});
