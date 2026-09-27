import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import WorkbookFindDialog from "../../../modules/workbook/components/WorkbookFindDialog.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";

describe("workbook find shortcuts", () => {
  test("opens find, replace and go-to from both the grid and the teleported dialog", async () => {
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
    const keydown = async (target: EventTarget, key: string, modifiers: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...modifiers,
      });
      target.dispatchEvent(event);
      await nextTick();
      return event;
    };
    try {
      await flushPromises();
      const dialog = wrapper.getComponent(WorkbookFindDialog);
      const grid = wrapper.get(".sheet-grid").element;
      expect((await keydown(grid, "f", { ctrlKey: true })).defaultPrevented).toBe(true);
      expect(dialog.props("visible")).toBe(true);
      expect(dialog.props("mode")).toBe("find");
      await flushPromises();
      const input = new DOMWrapper(document.body).get("[data-search-input] input").element;
      expect((await keydown(input, "h", { ctrlKey: true })).defaultPrevented).toBe(true);
      expect(dialog.props("mode")).toBe("replace");
      expect((await keydown(document.body, "g", { ctrlKey: true })).defaultPrevented).toBe(true);
      expect(dialog.props("mode")).toBe("goto");
      expect((await keydown(document.body, "f", { metaKey: true })).defaultPrevented).toBe(true);
      expect(dialog.props("mode")).toBe("find");
      expect((await keydown(document.body, "F5")).defaultPrevented).toBe(true);
      expect(dialog.props("mode")).toBe("goto");
      expect(
        (await keydown(document.body, "f", { ctrlKey: true, isComposing: true })).defaultPrevented,
      ).toBe(false);
      expect(dialog.props("mode")).toBe("goto");
    } finally {
      wrapper.unmount();
    }
    expect((await keydown(document.body, "f", { ctrlKey: true })).defaultPrevented).toBe(false);
  });
});
