import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import RibbonSplitButton from "../../../../shared/ribbon/RibbonSplitButton.vue";

describe("RibbonSplitButton", () => {
  test("separates its primary action from menu activation and exposes both triggers", async () => {
    const wrapper = mount(RibbonSplitButton, {
      props: { label: "Merge", menuLabel: "Merge options", menuId: "merge-menu", expanded: true },
    });

    expect(wrapper.vm.rootElement).toBe(wrapper.element);
    expect(wrapper.vm.mainElement).toBe(wrapper.get("[data-ribbon-split-main]").element);
    expect(wrapper.vm.menuElement).toBe(wrapper.get("[data-ribbon-split-menu]").element);
    expect(wrapper.get("[data-ribbon-split-menu]").attributes()).toMatchObject({
      role: "button",
      tabindex: "0",
      "aria-disabled": "false",
      "aria-haspopup": "menu",
      "aria-expanded": "true",
      "aria-controls": "merge-menu",
    });

    await wrapper.get("[data-ribbon-split-main]").trigger("click");
    await wrapper.get("[data-ribbon-split-menu]").trigger("click");
    await wrapper.get("[data-ribbon-split-menu]").trigger("keydown", { key: "ArrowDown" });
    expect(wrapper.emitted("activate")).toHaveLength(1);
    expect(wrapper.emitted("toggleMenu")).toHaveLength(1);
    expect(wrapper.emitted("menuKeydown")).toHaveLength(1);
  });

  test("keeps an available menu interactive when its primary action is disabled", async () => {
    const wrapper = mount(RibbonSplitButton, {
      props: { label: "Border", menuLabel: "Border options", disabled: true },
    });

    const main = wrapper.get("[data-ribbon-split-main]");
    expect(main.attributes()).toMatchObject({ "aria-disabled": "true", tabindex: "-1" });
    expect(wrapper.get("[data-ribbon-split-menu]").attributes()).toMatchObject({
      "aria-disabled": "false",
      tabindex: "0",
    });
    await main.trigger("click");
    await main.trigger("keydown", { key: "Enter" });
    await main.trigger("keydown", { key: " " });
    expect(wrapper.emitted("activate")).toBeUndefined();
    await wrapper.get("[data-ribbon-split-menu]").trigger("click");
    expect(wrapper.emitted("toggleMenu")).toHaveLength(1);
  });
  test.each(["Enter", " "])("activates each split region independently with %j", async (key) => {
    const wrapper = mount(RibbonSplitButton, {
      props: { label: "Merge", menuLabel: "Merge options" },
    });
    const main = wrapper.get("[data-ribbon-split-main]");
    const menu = wrapper.get("[data-ribbon-split-menu]");

    await main.trigger("keydown", { key });
    await main.trigger("keydown", { key, repeat: true });
    expect(wrapper.emitted("activate")).toHaveLength(1);
    expect(wrapper.emitted("toggleMenu")).toBeUndefined();
    await menu.trigger("keydown", { key });
    await menu.trigger("keydown", { key, repeat: true });
    expect(wrapper.emitted("activate")).toHaveLength(1);
    expect(wrapper.emitted("toggleMenu")).toHaveLength(1);
  });

  test("suppresses disabled menu activation while preserving the primary action", async () => {
    const wrapper = mount(RibbonSplitButton, {
      props: { label: "Merge", menuLabel: "Merge options", menuDisabled: true },
    });
    const menu = wrapper.get("[data-ribbon-split-menu]");
    expect(menu.attributes()).toMatchObject({ "aria-disabled": "true", tabindex: "-1" });
    await menu.trigger("click");
    await menu.trigger("keydown", { key: "Enter" });
    await menu.trigger("keydown", { key: " " });
    expect(wrapper.emitted("toggleMenu")).toBeUndefined();
    await wrapper.get("[data-ribbon-split-main]").trigger("click");
    expect(wrapper.emitted("activate")).toHaveLength(1);
  });

  test("places tall tool text in the menu region", () => {
    const wrapper = mount(RibbonSplitButton, {
      props: { label: "Fill", menuLabel: "Fill options", text: "Fill", variant: "tall" },
    });
    expect(wrapper.get("[data-ribbon-split-main]").text()).toBe("");
    expect(wrapper.get("[data-ribbon-split-menu]").text()).toBe("Fill");
    expect(wrapper.find("button").exists()).toBe(false);
  });
});
