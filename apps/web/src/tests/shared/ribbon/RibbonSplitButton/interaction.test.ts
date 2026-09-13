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

    expect((wrapper.get("[data-ribbon-split-main]").element as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((wrapper.get("[data-ribbon-split-menu]").element as HTMLButtonElement).disabled).toBe(
      false,
    );
    await wrapper.get("[data-ribbon-split-menu]").trigger("click");
    expect(wrapper.emitted("toggleMenu")).toHaveLength(1);
  });
});
