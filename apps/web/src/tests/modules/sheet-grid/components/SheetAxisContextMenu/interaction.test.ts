import { DOMWrapper, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import SheetAxisContextMenu from "../../../../../modules/sheet-grid/components/SheetAxisContextMenu.vue";
import { createAppI18n } from "../../../../../shared/i18n";
const anchor = (host: HTMLElement) => ({
  contextElement: host,
  getBoundingClientRect: () => new DOMRect(16, 16, 0, 0),
});
describe("SheetAxisContextMenu", () => {
  test("exposes practical column actions and reports the selected action", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(SheetAxisContextMenu, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        axis: "column",
        selectionCount: 2,
        maxBeforeCount: 3,
        maxAfterCount: 3,
        currentSize: 80,
        minimumSize: 24,
        maximumSize: 320,
        anchor: anchor(host),
      },
    });
    try {
      await nextTick();
      const menu = new DOMWrapper(document.body).get('ul[role="menu"]');
      expect(menu.find('[data-axis-action="column-statistics"]').exists()).toBe(true);
      await menu.get('[data-axis-action="hide"]').trigger("click");
      expect(wrapper.emitted("action")).toEqual([
        [{ type: "visibility", axis: "column", hidden: true }],
      ]);
      await menu.trigger("keydown", { key: "c", ctrlKey: true });
      await menu.trigger("keydown", { key: "x", metaKey: true });
      await menu.trigger("keydown", { key: "v", ctrlKey: true });
      expect(wrapper.emitted("copy")).toHaveLength(1);
      expect(wrapper.emitted("cut")).toHaveLength(1);
      expect(wrapper.emitted("paste")).toHaveLength(1);
      const input = menu.get<HTMLInputElement>("input");
      await input.trigger("keydown", { key: "c", ctrlKey: true });
      expect(wrapper.emitted("copy")).toHaveLength(1);
      await wrapper.setProps({ readOnly: true });
      await menu.trigger("keydown", { key: "x", metaKey: true });
      await menu.trigger("keydown", { key: "v", ctrlKey: true });
      expect(wrapper.emitted("cut")).toHaveLength(1);
      expect(wrapper.emitted("paste")).toHaveLength(1);
      await menu.get('[data-axis-action="column-statistics"]').trigger("click");
      expect(wrapper.emitted("action")?.at(-1)).toEqual([{ type: "columnStatistics" }]);
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });
  test("keeps write operations disabled in read-only mode", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(SheetAxisContextMenu, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        axis: "row",
        selectionCount: 1,
        maxBeforeCount: 3,
        maxAfterCount: 3,
        currentSize: 24,
        minimumSize: 12,
        maximumSize: 120,
        readOnly: true,
        anchor: anchor(host),
      },
    });
    try {
      await nextTick();
      const menu = new DOMWrapper(document.body).get('ul[role="menu"]');
      for (const action of [
        "delete",
        "hide",
        "unhide",
        "auto-fit",
        "clear-contents",
        "format-cells",
      ])
        expect(menu.get(`[data-axis-action="${action}"]`).attributes("aria-disabled")).toBe("true");
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });
  test("keeps an invalid insert count disabled until it returns within the axis boundary", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(SheetAxisContextMenu, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        axis: "row",
        selectionCount: 1,
        maxBeforeCount: 2,
        maxAfterCount: 2,
        currentSize: 24,
        minimumSize: 12,
        maximumSize: 120,
        anchor: anchor(host),
      },
    });
    try {
      await nextTick();
      const menu = new DOMWrapper(document.body).get('ul[role="menu"]');
      const control = menu.get('[data-axis-insert-count="insert-above"]');
      const input = control.get<HTMLInputElement>("input");
      await input.setValue("3");
      await nextTick();
      expect(menu.get('[data-row-column-action="insert-above"]').attributes("aria-disabled")).toBe(
        "true",
      );
      await input.setValue("2");
      await nextTick();
      expect(menu.get('[data-row-column-action="insert-above"]').attributes("aria-disabled")).toBe(
        "false",
      );
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });
});
