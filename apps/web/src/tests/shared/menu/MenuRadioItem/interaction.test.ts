import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import MenuRadioItem from "../../../../shared/menu/MenuRadioItem.vue";

describe("MenuRadioItem", () => {
  test("keeps one menu action while TDesign renders its controlled radio state", async () => {
    const wrapper = mount(MenuRadioItem, {
      props: { checked: true },
      attrs: { "data-choice": "copy" },
      slots: { default: "Copy cells" },
    });
    try {
      expect(wrapper.attributes("role")).toBe("menuitemradio");
      expect(wrapper.attributes("aria-checked")).toBe("true");
      expect(wrapper.attributes("data-choice")).toBe("copy");
      expect((wrapper.get('input[type="radio"]').element as HTMLInputElement).checked).toBe(true);
      expect(wrapper.get("[inert]").find('input[type="radio"]').exists()).toBe(true);
      await wrapper.trigger("click");
      await wrapper.trigger("keydown", { key: " " });
      expect(wrapper.emitted("select")).toHaveLength(2);
      await wrapper.setProps({ checked: false });
      expect(wrapper.attributes("aria-checked")).toBe("false");
      expect((wrapper.get('input[type="radio"]').element as HTMLInputElement).checked).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  test("disables pointer and keyboard activation together", async () => {
    const wrapper = mount(MenuRadioItem, {
      props: { checked: false, disabled: true },
      slots: { default: "Unavailable mode" },
    });
    try {
      expect(wrapper.attributes("aria-disabled")).toBe("true");
      await wrapper.trigger("click");
      await wrapper.trigger("keydown", { key: "Enter" });
      expect(wrapper.emitted("select")).toBeUndefined();
    } finally {
      wrapper.unmount();
    }
  });
});
