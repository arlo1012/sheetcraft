import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import MenuSurface from "../../../../shared/menu/MenuSurface.vue";

describe("MenuSurface", () => {
  test("keeps searchable menu items in a list and navigates past disabled results", async () => {
    const wrapper = mount(MenuSurface, {
      attachTo: document.body,
      props: { label: "Functions" },
      slots: {
        header: '<input type="search" aria-label="Search functions" />',
        items: `
          <li role="menuitem">SUM</li>
          <li role="menuitem" aria-disabled="true">Unavailable</li>
          <li role="menuitem">AVERAGE</li>
        `,
      },
    });
    try {
      const items = wrapper.findAll<HTMLElement>('[role="menuitem"]');
      expect(items[0]?.element.parentElement?.tagName).toBe("UL");
      expect(items[0]?.element.parentElement?.getAttribute("role")).toBe("presentation");
      wrapper.vm.focusFirstItem();
      await items[0]?.trigger("keydown", { key: "ArrowDown" });
      expect(document.activeElement).toBe(items[2]?.element);
      const input = wrapper.get<HTMLInputElement>("input");
      input.element.focus();
      await input.trigger("keydown", { key: "ArrowDown" });
      expect(document.activeElement).toBe(input.element);
    } finally {
      wrapper.unmount();
    }
  });

  test("renders a named list menu and moves focus across enabled direct items", async () => {
    const wrapper = mount(MenuSurface, {
      attachTo: document.body,
      props: { label: "Sheet actions" },
      slots: {
        default: `
          <li role="menuitem" tabindex="0">Rename</li>
          <li role="menuitem" tabindex="-1" aria-disabled="true">Delete</li>
          <li role="menuitem" tabindex="0">Duplicate</li>
          <li role="separator"></li>
        `,
      },
    });

    try {
      expect(wrapper.element.tagName).toBe("UL");
      expect(wrapper.attributes("role")).toBe("menu");
      expect(wrapper.attributes("aria-label")).toBe("Sheet actions");

      const items = wrapper.findAll<HTMLElement>('[role="menuitem"]');
      expect(items.map((item) => item.attributes("tabindex"))).toEqual(["0", "-1", "-1"]);
      items[0]?.element.focus();
      await items[0]?.trigger("keydown", { key: "ArrowDown" });
      expect(document.activeElement).toBe(items[2]?.element);
      expect(items.map((item) => item.attributes("tabindex"))).toEqual(["-1", "-1", "0"]);

      await items[2]?.trigger("keydown", { key: "ArrowDown" });
      expect(document.activeElement).toBe(items[0]?.element);
      expect(items.map((item) => item.attributes("tabindex"))).toEqual(["0", "-1", "-1"]);
    } finally {
      wrapper.unmount();
    }
  });

  test("leaves number-input arrow keys to the input", () => {
    const wrapper = mount(MenuSurface, {
      attachTo: document.body,
      props: { label: "Row actions" },
      slots: {
        default: '<li role="none"><input type="number" value="1" /></li>',
      },
    });

    try {
      const input = wrapper.get<HTMLInputElement>("input").element;
      input.focus();
      const event = new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(input);
    } finally {
      wrapper.unmount();
    }
  });

  test("moves focus across menuitemradio and menuitemcheckbox roles", async () => {
    const wrapper = mount(MenuSurface, {
      attachTo: document.body,
      props: { label: "Formats" },
      slots: {
        default: `
          <li role="menuitemradio" tabindex="0" aria-checked="true">General</li>
          <li role="menuitemcheckbox" tabindex="-1" aria-checked="false">Decimals</li>
        `,
      },
    });

    try {
      const items = wrapper.findAll<HTMLElement>('[role^="menuitem"]');
      items[0]?.element.focus();
      await items[0]?.trigger("keydown", { key: "ArrowDown" });
      expect(document.activeElement).toBe(items[1]?.element);
      expect(items.map((item) => item.attributes("tabindex"))).toEqual(["-1", "0"]);
    } finally {
      wrapper.unmount();
    }
  });

  test("keeps a structured menu footer outside its independently scrollable body", async () => {
    const wrapper = mount(MenuSurface, {
      attachTo: document.body,
      props: { label: "Style gallery" },
      slots: {
        body: '<div data-gallery-body><button type="button">Style</button></div>',
        footer: '<li role="menuitem" tabindex="-1">New style</li>',
      },
    });

    try {
      expect(wrapper.element.tagName).toBe("UL");
      expect(wrapper.classes()).toContain("sheetcraft-menu-surface--structured");
      expect(wrapper.get(".sheetcraft-menu-surface__body").attributes("role")).toBe("none");
      expect(wrapper.get(".sheetcraft-menu-surface__footer").text()).toBe("New style");
      const footerItem = wrapper.get<HTMLElement>('[role="menuitem"]');
      await footerItem.trigger("keydown", { key: "ArrowDown" });
      expect(document.activeElement).toBe(footerItem.element);
    } finally {
      wrapper.unmount();
    }
  });
});
