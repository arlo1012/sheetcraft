import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";

describe("workspace display settings", () => {
  test("toggles independent view options without editing the workbook", async () => {
    const wrapper = mount(SpreadsheetWorkspace, {
      attachTo: document.body,
      props: {
        workbookStore: {
          load: async () => undefined,
          save: async () => ({ revision: 1, savedAt: 1 }),
          replace: async () => ({ revision: 1, savedAt: 1 }),
        },
        imageAssetStore: createMemoryImageAssetStore(),
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
    try {
      await flushPromises();
      const grid = wrapper.findComponent({ name: "SheetGrid" });
      const revision = grid.props("workbookRevision");
      const trigger = wrapper.get('[data-view-control="display-settings"]');
      await trigger.trigger("keydown", { key: "ArrowDown" });
      const menu = new DOMWrapper(document.body).get("[data-display-settings-menu]");
      const headers = menu.get('[data-display-option="headers"]');
      const gridLines = menu.get('[data-display-option="grid-lines"]');
      const quickTools = menu.get('[data-display-option="axis-quick-tools"]');
      expect(document.activeElement).toBe(headers.element);
      expect(headers.attributes("aria-checked")).toBe("true");
      expect(gridLines.attributes("aria-checked")).toBe("true");
      expect(quickTools.attributes("aria-checked")).toBe("false");

      await headers.trigger("keydown", { key: " " });
      expect(wrapper.find(".sheet-row-headers").exists()).toBe(false);
      expect(wrapper.find(".sheet-column-headers").exists()).toBe(false);
      expect(headers.attributes("aria-checked")).toBe("false");
      expect(grid.props("showGridLines")).toBe(true);

      await gridLines.trigger("click");
      expect(grid.props("showGridLines")).toBe(false);
      await quickTools.trigger("click");
      expect(grid.props("showAxisQuickTools")).toBe(true);
      expect(quickTools.attributes("aria-checked")).toBe("true");

      await headers.trigger("click");
      expect(wrapper.find(".sheet-row-headers").exists()).toBe(true);
      expect(grid.props("showAxisQuickTools")).toBe(true);
      expect(grid.props("showGridLines")).toBe(false);
      expect(grid.props("workbookRevision")).toBe(revision);

      await menu.trigger("keydown", { key: "Escape" });
      expect(document.body.querySelector("[data-display-settings-menu]")).toBeNull();
      expect(document.activeElement).toBe(trigger.element);
    } finally {
      wrapper.unmount();
    }
  });
});
