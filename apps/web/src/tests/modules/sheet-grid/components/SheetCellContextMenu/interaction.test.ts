import { DOMWrapper, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import SheetCellContextMenu from "../../../../../modules/sheet-grid/components/SheetCellContextMenu.vue";
import { createAppI18n } from "../../../../../shared/i18n";
const anchor = (host: HTMLElement) => ({
  contextElement: host,
  getBoundingClientRect: () => new DOMRect(16, 16, 0, 0),
});
describe("SheetCellContextMenu", () => {
  test("opens insert submenu with keyboard and reports a cell shift action", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(SheetCellContextMenu, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: { anchor: anchor(host) },
    });
    try {
      await nextTick();
      const body = new DOMWrapper(document.body);
      const insert = body.get<HTMLElement>('[data-cell-action="insert"]');
      await insert.trigger("keydown", { key: "ArrowRight" });
      await nextTick();
      const submenu = body.get('ul[aria-label="Insert"]');
      expect(document.activeElement).toBe(submenu.get('[data-cell-action="insert-right"]').element);
      await submenu.get('[data-cell-action="insert-right"]').trigger("click");
      expect(wrapper.emitted("action")).toEqual([
        [{ type: "cellOperation", operation: "insert", direction: "right" }],
      ]);
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });
  test("uses compact clipboard controls and keeps mutation actions read-only", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(SheetCellContextMenu, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: { anchor: anchor(host), readOnly: true },
    });
    try {
      await nextTick();
      const body = new DOMWrapper(document.body);
      expect(body.get('[data-context-clipboard-action="copy"]').attributes("aria-label")).toBe(
        "Copy",
      );
      expect(body.get('[data-cell-action="insert"]').attributes("aria-disabled")).toBe("true");
      expect(body.get('[data-cell-action="format-cells"]').attributes("aria-disabled")).toBe(
        "true",
      );
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });
  test("handles clipboard shortcuts while respecting read-only and cut constraints", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(SheetCellContextMenu, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: { anchor: anchor(host), cutDisabledReason: "Filtered rows" },
    });
    try {
      await nextTick();
      const menu = new DOMWrapper(document.body).get('ul[role="menu"]');
      await menu.trigger("keydown", { key: "c", ctrlKey: true });
      await menu.trigger("keydown", { key: "x", metaKey: true });
      await menu.trigger("keydown", { key: "v", ctrlKey: true });
      expect(wrapper.emitted("copy")).toHaveLength(1);
      expect(wrapper.emitted("cut")).toBeUndefined();
      expect(wrapper.emitted("paste")).toHaveLength(1);
      await wrapper.setProps({ readOnly: true });
      await menu.trigger("keydown", { key: "v", metaKey: true });
      expect(wrapper.emitted("paste")).toHaveLength(1);
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });
  test("returns from a submenu with Escape and keeps left-arrow editing inside count inputs", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(SheetCellContextMenu, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        anchor: anchor(host),
        range: { start: { row: 2, column: 2 }, end: { row: 2, column: 2 } },
      },
    });
    try {
      await nextTick();
      const body = new DOMWrapper(document.body);
      const insert = body.get<HTMLElement>('[data-cell-action="insert"]');
      await insert.trigger("keydown", { key: "ArrowRight" });
      await nextTick();
      const submenu = body.get('ul[aria-label="Insert"]');
      const input = submenu.get<HTMLInputElement>(
        '[data-axis-insert-count="cell-insert-above"] input',
      );
      input.element.focus();
      await input.trigger("keydown", { key: "ArrowLeft" });
      expect(body.find('ul[aria-label="Insert"]').exists()).toBe(true);
      await submenu.trigger("keydown", { key: "Escape" });
      await nextTick();
      expect(body.find('ul[aria-label="Insert"]').exists()).toBe(false);
      expect(document.activeElement).toBe(insert.element);
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });
  test("allows inserting rows and columns before a selection at A1", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(SheetCellContextMenu, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        anchor: anchor(host),
        range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
      },
    });
    try {
      await nextTick();
      const body = new DOMWrapper(document.body);
      await body.get('[data-cell-action="insert"]').trigger("click");
      await nextTick();
      const submenu = body.get('ul[aria-label="Insert"]');
      expect(
        submenu.get('[data-row-column-action="cell-insert-above"]').attributes("aria-disabled"),
      ).toBe("false");
      expect(
        submenu.get('[data-row-column-action="cell-insert-left"]').attributes("aria-disabled"),
      ).toBe("false");
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });
  test("opens a submenu on hover without moving keyboard focus", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(SheetCellContextMenu, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: { anchor: anchor(host) },
    });
    try {
      await nextTick();
      const body = new DOMWrapper(document.body);
      const insert = body.get<HTMLElement>('[data-cell-action="insert"]');
      insert.element.focus();
      await body.get('[data-cell-action="delete"]').trigger("mouseenter");
      await nextTick();
      expect(body.find('ul[aria-label="Delete"]').exists()).toBe(true);
      expect(document.activeElement).toBe(insert.element);
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });
});
