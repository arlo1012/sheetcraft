import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import MenuItem from "../../../../shared/menu/MenuItem.vue";

describe("MenuItem", () => {
  test("uses menuitem semantics and activates from pointer or keyboard", async () => {
    const wrapper = mount(MenuItem, {
      attachTo: document.body,
      slots: { default: "Rename sheet" },
    });

    try {
      expect(wrapper.element.tagName).toBe("LI");
      expect(wrapper.attributes("role")).toBe("menuitem");
      expect(wrapper.attributes("tabindex")).toBe("-1");

      await wrapper.trigger("click");
      await wrapper.trigger("keydown", { key: "Enter" });
      await wrapper.trigger("keydown", { key: " " });

      expect(wrapper.emitted("select")).toHaveLength(3);
    } finally {
      wrapper.unmount();
    }
  });

  test("keeps trailing controls outside menuitem semantics and blocks disabled activation", async () => {
    const wrapper = mount(MenuItem, {
      attachTo: document.body,
      props: { disabled: true },
      slots: {
        default: "Insert above",
        trailing: '<input aria-label="Insert count" value="1" />',
      },
    });

    try {
      expect(wrapper.attributes("role")).toBe("none");
      const command = wrapper.get('[role="menuitem"]');
      expect(command.attributes("aria-disabled")).toBe("true");
      expect(command.attributes("tabindex")).toBe("-1");
      expect(command.find("input").exists()).toBe(false);
      await command.trigger("click");
      await command.trigger("keydown", { key: "Enter" });
      expect(wrapper.emitted("select")).toBeUndefined();

      await wrapper.setProps({ disabled: false });
      await wrapper.get("input").trigger("click");
      await wrapper.get("input").trigger("keydown", { key: "Enter" });
      expect(wrapper.emitted("select")).toBeUndefined();

      await command.trigger("keydown", { key: " " });
      expect(wrapper.emitted("select")).toHaveLength(1);
    } finally {
      wrapper.unmount();
    }
  });

  test("keeps a non-interactive shortcut inside the selectable menuitem", async () => {
    const wrapper = mount(MenuItem, {
      slots: {
        default: "Copy",
        shortcut: "Ctrl+C",
      },
    });

    expect(wrapper.attributes("role")).toBe("menuitem");
    const shortcut = wrapper.get(".sheetcraft-menu-item__trailing");
    expect(shortcut.text()).toBe("Ctrl+C");
    expect(shortcut.attributes("aria-hidden")).toBe("true");
    await shortcut.trigger("click");
    expect(wrapper.emitted("select")).toHaveLength(1);
  });
});
