import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import SpreadsheetWorkspace from "../../../app/SpreadsheetWorkspace.vue";
import { createMemoryImageAssetStore } from "../../../modules/image-assets/imageAssetStore";
import { createAppI18n } from "../../../shared/i18n";
import { triggerCanvasCell } from "../canvas-interaction";

describe("workspace zoom gestures", () => {
  test("fits a selection and applies exact preset and custom percentages from the menu", async () => {
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
      const revision = wrapper.findComponent({ name: "SheetGrid" }).props("workbookRevision");
      await triggerCanvasCell(wrapper, { row: 19, column: 4 }, "mousedown", {
        button: 0,
        shiftKey: true,
      });
      await wrapper.get('[data-view-control="zoom-menu"]').trigger("click");
      await new DOMWrapper(document.body).get("[data-zoom-fit-selection]").trigger("click");
      expect(wrapper.get<HTMLElement>(".sheet-grid").element.style.zoom).toBe("1.22");

      await wrapper.get('[data-view-control="zoom-menu"]').trigger("click");
      await new DOMWrapper(document.body).get('[data-zoom-preset="75"]').trigger("click");
      expect(wrapper.get<HTMLElement>(".sheet-grid").element.style.zoom).toBe("0.75");
      expect(wrapper.get<HTMLInputElement>('input[type="range"]').element.value).toBe("75");

      await wrapper.get('[data-view-control="zoom-menu"]').trigger("click");
      const input = new DOMWrapper(document.body).get<HTMLInputElement>(
        ".workbook-zoom-menu input",
      );
      await input.setValue("73");
      await input.trigger("keydown", { key: "Enter", code: "Enter" });
      expect(wrapper.get<HTMLElement>(".sheet-grid").element.style.zoom).toBe("0.73");
      expect(wrapper.get<HTMLInputElement>('input[type="range"]').element.value).toBe("73");
      expect(wrapper.findComponent({ name: "SheetGrid" }).props("workbookRevision")).toBe(revision);
    } finally {
      wrapper.unmount();
    }
  });

  test("uses Ctrl+wheel for bounded sheet zoom without browser zoom or grid scrolling", async () => {
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
      const slider = wrapper.get<HTMLInputElement>('input[type="range"]');
      const sheet = wrapper.get<HTMLElement>(".sheet-grid");
      const wheel = async (target: Element, deltaY: number) => {
        const event = new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
          deltaY,
        });
        // Happy DOM's WheelEvent currently omits the inherited mouse modifier fields.
        Object.defineProperty(event, "ctrlKey", { value: true });
        target.dispatchEvent(event);
        await nextTick();
        expect(event.defaultPrevented).toBe(true);
      };

      await wheel(grid.element, -100);
      expect(slider.element.value).toBe("110");
      expect(sheet.element.style.zoom).toBe("1.1");
      expect(grid.element.scrollTop).toBe(0);
      await wheel(wrapper.get("footer").element, 100);
      expect(slider.element.value).toBe("100");
      await grid.trigger("wheel", { deltaY: 100 });
      expect(slider.element.value).toBe("100");
      expect(grid.element.scrollTop).toBe(100);

      await slider.setValue("400");
      await wheel(grid.element, -100);
      expect(slider.element.value).toBe("400");
      expect(sheet.element.style.zoom).toBe("4");
      expect(wrapper.get('[data-view-control="zoom-in"]').attributes("aria-disabled")).toBe("true");
      await slider.setValue("10");
      await wheel(grid.element, 100);
      expect(slider.element.value).toBe("10");
      expect(sheet.element.style.zoom).toBe("0.1");
      expect(wrapper.get('[data-view-control="zoom-out"]').attributes("aria-disabled")).toBe(
        "true",
      );
    } finally {
      wrapper.unmount();
    }
  });
});
