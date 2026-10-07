import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import RibbonMenuButton from "../../../../shared/ribbon/RibbonMenuButton.vue";

describe("RibbonMenuButton", () => {
  test("describes and visually updates its controlled popup", async () => {
    const wrapper = mount(RibbonMenuButton, {
      props: {
        label: "Sort",
        text: "Sort",
        expanded: false,
        menuId: "sort-menu",
        popupRole: "menu",
      },
    });

    expect(wrapper.attributes()).toMatchObject({
      role: "button",
      tabindex: "0",
      "aria-disabled": "false",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
    });
    expect(wrapper.attributes("aria-controls")).toBeUndefined();
    expect(wrapper.get(".ribbon-menu-button__arrow").classes()).not.toContain("is-expanded");

    await wrapper.setProps({ expanded: true });
    expect(wrapper.attributes()).toMatchObject({
      "aria-expanded": "true",
      "aria-controls": "sort-menu",
    });
    expect(wrapper.get(".ribbon-menu-button__arrow").classes()).toContain("is-expanded");

    await wrapper.trigger("click");
    expect(wrapper.emitted("activate")).toHaveLength(1);
  });

  test.each(["Enter", " "])("opens with %j and ignores held-key repeats", async (key) => {
    const wrapper = mount(RibbonMenuButton, { props: { label: "Sort" } });

    await wrapper.trigger("keydown", { key });
    await wrapper.trigger("keydown", { key, repeat: true });
    expect(wrapper.emitted("activate")).toHaveLength(1);
  });

  test("retains its arrow and suppresses activation while disabled", async () => {
    const wrapper = mount(RibbonMenuButton, { props: { label: "Filter", disabled: true } });

    expect(wrapper.attributes()).toMatchObject({ "aria-disabled": "true", tabindex: "-1" });
    expect(wrapper.find(".ribbon-menu-button__arrow").exists()).toBe(true);
    await wrapper.trigger("click");
    await wrapper.trigger("keydown", { key: "Enter" });
    await wrapper.trigger("keydown", { key: " " });
    expect(wrapper.emitted("activate")).toBeUndefined();
  });
});
