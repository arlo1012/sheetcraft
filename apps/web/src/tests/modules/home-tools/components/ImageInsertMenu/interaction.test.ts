import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import ImageInsertMenu from "../../../../../modules/home-tools/components/ImageInsertMenu.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const mountedWrappers: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function mountMenu(disabled = false, locale: "en-US" | "zh-CN" = "en-US") {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(ImageInsertMenu, {
    attachTo: host,
    global: { plugins: [createAppI18n(locale)] },
    props: { disabled },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

function menu() {
  return new DOMWrapper(document.body).get('[role="menu"]');
}

describe("ImageInsertMenu", () => {
  test.each(["en-US", "zh-CN"] as const)(
    "exposes current formats and limits without adding an inert menu action (%s)",
    async (locale) => {
      const wrapper = mountMenu(false, locale);
      await wrapper.get('[data-ribbon-action="image"]').trigger("click");
      expect(menu().findAll('[role="menuitem"]')).toHaveLength(2);
      const hint = menu().get(".image-insert-menu__limits");
      expect(hint.text()).toContain("PNG");
      expect(hint.text()).toContain("10 MiB");
      expect(hint.text()).toContain("16,384");
      expect(hint.text()).toContain("33,554,432");
      expect(hint.attributes("role")).toBe("none");
    },
  );
  test("chooses in-cell and floating image insertion from a real menu", async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get('[data-ribbon-action="image"]');

    expect(trigger.attributes()).toMatchObject({
      "aria-label": "Insert image",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      "data-ribbon-layout": "tall",
      "data-ribbon-span": "2",
    });
    await trigger.trigger("click");
    expect(menu().attributes("aria-label")).toBe("Insert image");
    expect(menu().get('[data-image-insert-mode="cell"]').text()).toBe("Image in cell");
    await menu().get('[data-image-insert-mode="floating"]').trigger("click");

    expect(wrapper.emitted("insertImage")).toEqual([["floating"]]);
    expect(document.activeElement).toBe(trigger.element);
  });

  test("keeps the menu disclosure visible while image insertion is disabled", async () => {
    const wrapper = mountMenu(true, "zh-CN");
    const trigger = wrapper.get('[data-ribbon-action="image"]');

    expect(trigger.attributes("aria-label")).toBe("插入图片");
    expect(trigger.attributes("aria-disabled")).toBe("true");
    expect(trigger.find(".ribbon-menu-button__arrow").exists()).toBe(true);
    await trigger.trigger("click");
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });
});
