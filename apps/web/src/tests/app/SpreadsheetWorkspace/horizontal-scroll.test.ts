import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";

describe("workspace footer horizontal scrollbar", () => {
  test("synchronizes grid and scrollbar in both directions and restores each sheet's offset", async () => {
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
      const grid = wrapper.get<HTMLDivElement>(".sheet-grid__scroller");
      const scrollbar = () => wrapper.get('[role="scrollbar"]');
      expect(scrollbar().attributes("aria-controls")).toBe(grid.attributes("id"));
      grid.element.scrollLeft = 700;
      grid.element.scrollTop = 240;
      await grid.trigger("scroll");
      expect(scrollbar().attributes("aria-valuenow")).toBe("700");
      await scrollbar().trigger("keydown", { key: "ArrowRight" });
      expect(grid.element.scrollLeft).toBe(748);
      expect(grid.element.scrollTop).toBe(240);
      await wrapper.get('[aria-label="Add sheet"]').trigger("click");
      expect(scrollbar().attributes("aria-valuenow")).toBe("0");
      await scrollbar().trigger("keydown", { key: "PageDown" });
      expect(grid.element.scrollLeft).toBe(960);
      await wrapper.get('[role="tab"][title="Sheet1 (double-click to rename)"]').trigger("click");
      expect(grid.element.scrollLeft).toBe(748);
      expect(grid.element.scrollTop).toBe(240);
      expect(scrollbar().attributes("aria-valuenow")).toBe("748");

      await scrollbar().trigger("keydown", { key: "End" });
      const previousMaximum = Number(scrollbar().attributes("aria-valuemax"));
      expect(wrapper.get('[role="grid"]').attributes("aria-colcount")).toBe("26");
      await scrollbar().trigger("wheel", { deltaY: 48 });
      expect(wrapper.get('[role="grid"]').attributes("aria-colcount")).toBe("26");
      await scrollbar().trigger("wheel", { deltaY: 48, shiftKey: true });
      expect(wrapper.get('[role="grid"]').attributes("aria-colcount")).toBe("34");
      expect(grid.element.scrollLeft).toBe(previousMaximum + 48);
      expect(grid.element.scrollTop).toBe(240);
      await scrollbar().trigger("keydown", { key: "Home" });
      expect(wrapper.get('[role="grid"]').attributes("aria-colcount")).toBe("26");
    } finally {
      wrapper.unmount();
    }
  });
});
