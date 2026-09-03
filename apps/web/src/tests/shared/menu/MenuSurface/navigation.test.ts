import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import MenuSurface from "../../../../shared/menu/MenuSurface.vue";

describe("MenuSurface", () => {
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
});
