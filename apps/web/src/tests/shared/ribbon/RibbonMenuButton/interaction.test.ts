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

  test("retains its arrow while disabled", () => {
    const wrapper = mount(RibbonMenuButton, { props: { label: "Filter", disabled: true } });

    expect((wrapper.element as HTMLButtonElement).disabled).toBe(true);
    expect(wrapper.find(".ribbon-menu-button__arrow").exists()).toBe(true);
  });
});
