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
    expect((trigger.element as HTMLButtonElement).disabled).toBe(true);
    expect(trigger.find(".ribbon-icon-action__disclosure").exists()).toBe(true);
    await trigger.trigger("click");
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });
});
