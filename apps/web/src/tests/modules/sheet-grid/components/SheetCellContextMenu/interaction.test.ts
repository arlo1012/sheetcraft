import { DOMWrapper, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import SheetCellContextMenu from "../../../../../modules/sheet-grid/components/SheetCellContextMenu.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("SheetCellContextMenu", () => {
  test("renders compact clipboard actions and supports roving keyboard focus", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(SheetCellContextMenu, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        anchor: {
          contextElement: host,
          getBoundingClientRect: () => new DOMRect(16, 16, 0, 0),
        },
      },
    });

    try {
      await nextTick();
      const menu = new DOMWrapper(document.body).get('ul[role="menu"]');
      const actions = menu.findAll<HTMLElement>("[data-cell-action]");
      expect(menu.attributes("aria-label")).toBe("Cell actions");
      expect(menu.find("button").exists()).toBe(false);
      expect(actions.map((action) => action.text())).toEqual([
        "Cut Ctrl+X",
        "Copy Ctrl+C",
        "Paste Ctrl+V",
        "Clear contents",
      ]);
      expect(actions[0]?.attributes("aria-keyshortcuts")).toBe("Control+X Meta+X");
      expect(document.activeElement).toBe(actions[0]?.element);

      await actions[0]?.trigger("keydown", { key: "ArrowDown" });
      expect(document.activeElement).toBe(actions[1]?.element);
      await actions[1]?.trigger("keydown", { key: "End" });
      expect(document.activeElement).toBe(actions[3]?.element);
      await actions[3]?.trigger("keydown", { key: "Home" });
      expect(document.activeElement).toBe(actions[0]?.element);

      await actions[1]?.trigger("keydown", { key: "Enter" });
      expect(wrapper.emitted("copy")).toHaveLength(1);
      await actions[1]?.trigger("keydown", { key: "c", ctrlKey: true });
      expect(wrapper.emitted("copy")).toHaveLength(2);
      await menu.trigger("keydown", { key: "Escape" });
      expect(wrapper.emitted("close")).toEqual([[true]]);
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });
});
