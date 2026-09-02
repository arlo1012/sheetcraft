import { DOMWrapper, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import SheetAxisContextMenu from "../../../../../modules/sheet-grid/components/SheetAxisContextMenu.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("SheetAxisContextMenu", () => {
  test("keeps disabled insert controls inert and outside menuitem semantics", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(SheetAxisContextMenu, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        axis: "row",
        selectionCount: 1,
        maxBeforeCount: 0,
        maxAfterCount: 3,
        currentSize: 24,
        minimumSize: 12,
        maximumSize: 120,
        anchor: {
          contextElement: host,
          getBoundingClientRect: () => new DOMRect(16, 16, 0, 0),
        },
      },
    });

    try {
      await nextTick();
      const menu = new DOMWrapper(document.body).get('ul[role="menu"]');
      const beforeAction = menu.get<HTMLElement>('[data-axis-action="insert-before"]');
      const beforeInput = menu.get<HTMLInputElement>('[data-axis-insert-count="before"]');
      const afterAction = menu.get<HTMLElement>('[data-axis-action="insert-after"]');
      const afterInput = menu.get<HTMLInputElement>('[data-axis-insert-count="after"]');

      expect(beforeAction.attributes("aria-disabled")).toBe("true");
      expect(beforeAction.attributes("tabindex")).toBe("-1");
      expect(beforeInput.attributes("disabled")).toBe("");
      expect(beforeAction.element.contains(beforeInput.element)).toBe(false);

      expect(afterAction.attributes("aria-disabled")).toBe("false");
      expect(afterAction.attributes("tabindex")).toBe("0");
      expect(afterInput.attributes("disabled")).toBeUndefined();
      expect(document.activeElement).toBe(afterAction.element);

      await afterInput.setValue(99);
      expect(afterAction.attributes("aria-disabled")).toBe("false");
      expect(afterInput.attributes("disabled")).toBeUndefined();
      await afterInput.trigger("blur");
      expect(afterInput.element.value).toBe("3");
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });
});
