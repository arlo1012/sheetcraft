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
        "Paste special",
        "Clear contents",
      ]);
      expect(actions[0]?.attributes("aria-keyshortcuts")).toBe("Control+X Meta+X");
      expect(document.activeElement).toBe(actions[0]?.element);

      await actions[0]?.trigger("keydown", { key: "ArrowDown" });
      expect(document.activeElement).toBe(actions[1]?.element);
      await actions[1]?.trigger("keydown", { key: "End" });
      expect(document.activeElement).toBe(actions[4]?.element);
      await actions[4]?.trigger("keydown", { key: "Home" });
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

  test("opens a keyboard-accessible paste-special submenu and restores parent focus", async () => {
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
        pasteFormatsDisabled: true,
      },
    });

    try {
      await nextTick();
      const body = new DOMWrapper(document.body);
      const parent = body.get<HTMLElement>('[data-cell-action="paste-special"]');
      expect(parent.attributes("aria-haspopup")).toBe("menu");
      expect(parent.attributes("aria-expanded")).toBe("false");

      await parent.trigger("keydown", { key: "ArrowRight" });
      await nextTick();
      let submenu = body.get('ul[aria-label="Paste special"]');
      const values = submenu.get<HTMLElement>('[data-cell-action="paste-values"]');
      const formats = submenu.get<HTMLElement>('[data-cell-action="paste-formats"]');
      expect(parent.attributes("aria-expanded")).toBe("true");
      expect(parent.attributes("aria-controls")).toBe(submenu.attributes("id"));
      expect(document.activeElement).toBe(values.element);
      expect(formats.attributes("aria-disabled")).toBe("true");

      await values.trigger("keydown", { key: "ArrowDown" });
      expect(document.activeElement).toBe(values.element);
      await values.trigger("keydown", { key: "ArrowLeft" });
      await nextTick();
      expect(body.find('ul[aria-label="Paste special"]').exists()).toBe(false);
      expect(document.activeElement).toBe(parent.element);

      await wrapper.setProps({ pasteFormatsDisabled: false });
      await parent.trigger("keydown", { key: "Enter" });
      await nextTick();
      submenu = body.get('ul[aria-label="Paste special"]');
      const enabledFormats = submenu.get<HTMLElement>('[data-cell-action="paste-formats"]');
      await submenu.get<HTMLElement>('[data-cell-action="paste-values"]').trigger("keydown", {
        key: "ArrowDown",
      });
      expect(document.activeElement).toBe(enabledFormats.element);
      await enabledFormats.trigger("keydown", { key: "Enter" });
      expect(wrapper.emitted("pasteFormats")).toHaveLength(1);

      await enabledFormats.trigger("keydown", { key: "Escape" });
      await nextTick();
      expect(body.find('ul[aria-label="Paste special"]').exists()).toBe(false);
      expect(document.activeElement).toBe(parent.element);
      await parent.trigger("keydown", { key: "Escape" });
      expect(wrapper.emitted("close")).toEqual([[true]]);
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });

  test("skips a disabled paste-special parent item", async () => {
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
        pasteSpecialDisabled: true,
      },
    });

    try {
      await nextTick();
      const body = new DOMWrapper(document.body);
      const parent = body.get<HTMLElement>('[data-cell-action="paste-special"]');
      expect(parent.attributes("aria-disabled")).toBe("true");
      await parent.trigger("keydown", { key: "ArrowRight" });
      expect(body.find('ul[aria-label="Paste special"]').exists()).toBe(false);

      const paste = body.get<HTMLElement>('[data-cell-action="paste"]');
      paste.element.focus();
      await paste.trigger("keydown", { key: "ArrowDown" });
      expect(document.activeElement).toBe(
        body.get<HTMLElement>('[data-cell-action="clear"]').element,
      );
    } finally {
      wrapper.unmount();
      host.remove();
    }
  });

  test("stacks the paste-special submenu below the parent menu on narrow viewports", async () => {
    const previousWidth = window.innerWidth;
    const host = document.createElement("div");
    document.body.append(host);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    const wrapper = mount(SheetCellContextMenu, {
      attachTo: host,
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        anchor: {
          contextElement: host,
          getBoundingClientRect: () => new DOMRect(300, 16, 0, 0),
        },
      },
    });

    try {
      await nextTick();
      const body = new DOMWrapper(document.body);
      await body.get('[data-cell-action="paste-special"]').trigger("click");
      await nextTick();
      expect(body.find('[data-paste-special-layout="stacked"]').exists()).toBe(true);

      Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
      window.dispatchEvent(new Event("resize"));
      await nextTick();
      expect(body.find('[data-paste-special-layout="side"]').exists()).toBe(true);
    } finally {
      wrapper.unmount();
      host.remove();
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: previousWidth,
      });
    }
  });
});
